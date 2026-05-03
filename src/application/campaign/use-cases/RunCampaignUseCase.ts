// src/application/campaign/use-cases/RunCampaignUseCase.ts
// Fetches contacts by segment and sends the campaign template to each oine

import { createHash } from 'node:crypto';
import { ICampaignRepository } from '@domain/campaign/repositories/ICampaignRepository';
import { ITemplateRepository } from '@domain/template/repositories/ITemplateRepository';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IWhatsAppProvider, TemplateParams } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { CampaignContact } from '@domain/campaign/entities/CampaignContact';
import { Contact } from '@domain/contact/entities/Contact';
import { RateLimiter } from '@shared/utils/RateLimiter';
import { logger } from '@shared/utils/logger';
import { AppError } from '@shared/errors/AppError';
import {
  assertSendable,
  normalizePhone,
  isNotOnWhatsApp,
  handleSendFailure,
  serializeTemplatePayload,
} from '@application/message/use-cases/SendTemplateUseCase';

const BATCH_SIZE    = 50;
const LANGUAGE_CODE = process.env.WHATSAPP_LANGUAGE_CODE ?? 'pt_BR';

export class RunCampaignUseCase {
  private readonly limiter = new RateLimiter(1_000);

  constructor(
    private readonly campaignRepo:  ICampaignRepository,
    private readonly templateRepo:  ITemplateRepository,
    private readonly contactRepo:   IContactRepository,
    private readonly messageRepo:   IMessageRepository,
    private readonly whatsApp:      IWhatsAppProvider,
  ) {}

  // Executes a campaign 
  async execute(campaignId: string): Promise<{ totalSent: number }> {
    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) throw new AppError('Campaign not found', 404);
    if (campaign.status !== 'queued')
      throw new AppError(`Campaign cannot be run — current status: ${campaign.status}`, 409);

    // get template 
    const template = await this.templateRepo.findById(campaign.templateId);
    if (!template)        throw new AppError('Template not found', 404);
    if (!template.active) throw new AppError('Template is inactive', 409);

    // set campaign as running (prevents multiple concurrent runs of the same campaign)
    await this.campaignRepo.markRunning(campaignId);

    let cursor:    string | null = null;
    let totalSent = 0;

    try {
      while (true) {
        const contacts = await this.contactRepo.findCampaignBatch(
          campaignId, campaign.segment, cursor, BATCH_SIZE,
        );
        if (contacts.length === 0) break;

        let batchSent = 0;

        for (const contact of contacts) {
          // Skip contacts that don't pass frequency-cap checks (cast to a partial Contact cause assertSendable only reads frequency cap fields)
          try {
            assertSendable(contact as unknown as Contact);
          } catch {
            logger.debug('[RunCampaign] skipping contact (cap/invalid)', { contactId: contact.id });
            continue;
          }

          const params           = resolveParams(template.name, contact);
          const clientMessageId  = deriveClientId(campaignId, contact.id);

          const { message, created } = await this.messageRepo.createPending({
            contactId: contact.id,
            campaignId,
            channel:   'whatsapp',
            body:      serializeTemplatePayload(template.name, LANGUAGE_CODE, params),
            clientMessageId,
          });

          if (!created) {
            // Already sent in a previous run.
            logger.debug('[RunCampaign] skipping already-sent contact', { contactId: contact.id });
            continue;
          }

          // Respect WhatsApp rate limits
          await this.limiter.throttle();

          try {

            // try to send template message
            const { wamid } = await this.whatsApp.sendTemplate(
              normalizePhone(contact.phone),
              template.name,
              LANGUAGE_CODE,
              params,
            );

            // update message with WhatsApp id and mark as sent
            await this.messageRepo.updateWamid(message.id, wamid, null);
            this.contactRepo.trackOutboundSent(contact.id).catch(() => {});
            batchSent++;
            totalSent++;
          } catch (err) {
            
            // update message status to failed and set whatsapp=false for invalid numbers
            await handleSendFailure(this.messageRepo, message.id, 0, err);
            if (isNotOnWhatsApp(err)) {
              await this.contactRepo.setWhatsappByLeadId(contact.leadId, false).catch(() => {});
            }
          }
        }
        // Increment campaign totalSent by batchSent
        if (batchSent > 0) {
          await this.campaignRepo.incrementTotalSent(campaignId, batchSent);
        }

        cursor = contacts[contacts.length - 1]!.id;
        if (contacts.length < BATCH_SIZE) break;
      }

      // Mark campaign as done with final totalSent count
      await this.campaignRepo.markDone(campaignId, totalSent);
      return { totalSent };
    } catch (err) {
      // Mark campaign as failed on any unexpected error during the run
      await this.campaignRepo.markFailed(
        campaignId, err instanceof Error ? err.message : String(err),
      ).catch(() => {});
      throw err;
    }
  }
}

// Resolve template named params by component (header/body).
export function resolveParams(templateName: string, contact: CampaignContact): TemplateParams {
  const name = contact.customerName ?? 'Cliente';
  if (templateName === 'reativacao_cliente_v1') {
    const lastOrder = contact.lastPurchaseAt
      ? contact.lastPurchaseAt.toLocaleDateString('pt-BR')
      : '';
    return { header: { customer_name: name }, body: { last_order: lastOrder } };
  }
  // outreach_loja (and default): {{customer_name}} lives in the Header component
  return { header: { customer_name: name } };
}

// Technical artifact: Ensures campaign re-runs won't double-send to the same contact
export function deriveClientId(campaignId: string, contactId: string): string {
  const hex = createHash('sha256').update(`${campaignId}:${contactId}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}
