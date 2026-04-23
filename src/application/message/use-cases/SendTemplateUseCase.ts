// src/application/message/use-cases/SendTemplateUseCase.ts
// Sends a WhatsApp template message to a phone number.

import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IConversationRepository } from '@domain/conversation/repositories/IConversationRepository';
import { IWhatsAppProvider } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { Contact } from '@domain/contact/entities/Contact';
import { RateLimiter } from '@shared/utils/RateLimiter';
import { logger } from '@shared/utils/logger';
import { AppError } from '@shared/errors/AppError';
import { SendTemplateInput, SendTemplateOutput } from '../dtos/SendTemplateDTO';

export class SendTemplateUseCase {
  private readonly limiter = new RateLimiter(1_000);

  constructor(
    private readonly contactRepo:      IContactRepository,
    private readonly messageRepo:      IMessageRepository,
    private readonly conversationRepo: IConversationRepository,
    private readonly whatsApp:         IWhatsAppProvider,
  ) {}

  async execute(input: SendTemplateInput): Promise<SendTemplateOutput> {
    const contact = await this.contactRepo.findByPhone(input.to);

    // Enforce CRM rules only when contact is known
    if (contact) assertSendable(contact);

    // Persist-before-send (only when contact exists in CRM)
    let messageId: string | null = null;
    if (contact) {
      const { message, created } = await this.messageRepo.createPending({
        contactId:       contact.id,
        channel:         'whatsapp',
        body:            input.templateName,
        clientMessageId: input.clientMessageId,
      });
      // Duplicate clientMessageId — return existing record without re-sending preventing double-sends on retry.
      if (!created) {
        return { messageId: message.id, contactId: contact.id, wamid: message.wamid ?? '', created: false };
      }
      messageId = message.id;
    }

    // Send
    await this.limiter.throttle();
    let wamid: string;
    try {
      const result = await this.whatsApp.sendTemplate(
        normalizePhone(input.to),
        input.templateName,
        input.languageCode,
        input.params,
      );
      wamid = result.wamid;
    } catch (err) {
      if (messageId) {
        await this.messageRepo.updateStatusById(messageId, 'failed',
          err instanceof Error ? err.message : String(err),
        ).catch(() => {});
      }
      if (contact && isNotOnWhatsApp(err)) {
        await this.contactRepo.setWhatsappByLeadId(contact.leadId, false).catch(() => {});
      }
      throw err;
    }

    // Persist wamid
    if (messageId && contact) {
      const conversationId = await this.conversationRepo
        .findOpenByContactId(contact.id)
        .then(c => c?.id ?? null)
        .catch(() => null);
      
        //DB record is created BEFORE the API call
        await persistWamid(this.messageRepo, messageId, wamid, conversationId);
    }
    return { messageId, contactId: contact?.id ?? null, wamid, created: true };
  }
}

// helpers
export function assertSendable(contact: Contact): void {
  if (contact.whatsapp === false)
    throw new AppError('Contact WhatsApp number is invalid', 422);
  if (contact.status === 'unsubscribed' || contact.unsubscribed)
    throw new AppError('Contact is unsubscribed', 422);
}

// Normalizes phone number 
export function normalizePhone(to: string): string {
  return to.startsWith('+') ? to : `+${to}`;
}

// Meta error code 131026 = number is not registered on WhatsApp. 
export function isNotOnWhatsApp(err: unknown): boolean {
  return /131026/.test(err instanceof Error ? err.message : String(err));
}

// Persist wamid with retry logic
export async function persistWamid(
  messageRepo:    IMessageRepository,
  messageId:      string,
  wamid:          string,
  conversationId: string | null,
): Promise<void> {
  try {
    await messageRepo.updateWamid(messageId, wamid, conversationId);
  } catch (firstErr) {
    logger.error('[Send] updateWamid failed — retrying once', { messageId, wamid, error: String(firstErr) });
    try {
      await messageRepo.updateWamid(messageId, wamid, conversationId);
    } catch (secondErr) {
      logger.error('[Send] CRITICAL — updateWamid failed twice after successful send', {
        messageId, wamid, error: String(secondErr),
      });
    }
  }
}
