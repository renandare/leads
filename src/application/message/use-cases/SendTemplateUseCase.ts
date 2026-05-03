// src/application/message/use-cases/SendTemplateUseCase.ts
// Sends a WhatsApp template message to a phone number.

import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IConversationRepository } from '@domain/conversation/repositories/IConversationRepository';
import { IWhatsAppProvider, TemplateParams } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { Contact } from '@domain/contact/entities/Contact';
import { RateLimiter } from '@shared/utils/RateLimiter';
import { logger } from '@shared/utils/logger';
import { AppError } from '@shared/errors/AppError';
import { SendTemplateInput, SendTemplateOutput } from '../dtos/SendTemplateDTO';

// Backoff delays in minutes for retries 0 or 1, 1 or 2, 2 or 3 (5,15,45min).
export const BACKOFF_MINUTES = [5, 15, 45] as const;

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
        body:            serializeTemplatePayload(input.templateName, input.languageCode, input.params), // now the body contains the serialized payload for retry support
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
        await handleSendFailure(this.messageRepo, messageId, 0, err); // Now, schedules retries or marks as failed
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

    // Track send (fire-and-forget — never fail the send over a tracking update)
    if (contact) {
      this.contactRepo.trackOutboundSent(contact.id).catch(() => {});
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

  const capDays   = parseInt(process.env.FREQUENCY_CAP_DAYS    ?? '7', 10);
  const capMax30d = parseInt(process.env.FREQUENCY_CAP_MAX_30D ?? '3', 10);

  if (contact.contactCount30d >= capMax30d)
    throw new AppError(`Contact has reached the send limit (${capMax30d}) for the last 30 days`, 429);

  if (contact.lastContactAt) {
    const daysSince = (Date.now() - contact.lastContactAt.getTime()) / 86_400_000;
    if (daysSince < capDays)
      throw new AppError(`Contact was reached ${Math.floor(daysSince)}d ago — minimum interval is ${capDays}d`, 429);
  }
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

// Schedules a retry or marks as failed when `isNotOnWhatsApp` error or retryCount >= 3
export async function handleSendFailure(
  messageRepo: IMessageRepository,
  messageId:   string,
  retryCount:  number,
  err:         unknown,
): Promise<void> {
  const reason = err instanceof Error ? err.message : String(err);
  if (isNotOnWhatsApp(err) || retryCount >= BACKOFF_MINUTES.length) {
    await messageRepo.updateStatusById(messageId, 'failed', reason).catch(() => {});
  } else {
    const delayMs = BACKOFF_MINUTES[retryCount] * 60_000;
    await messageRepo.scheduleRetry(messageId, new Date(Date.now() + delayMs)).catch(() => {});
  }
}

// Serializes template send params into the message body field for retry support
export function serializeTemplatePayload(
  templateName: string,
  languageCode:  string,
  params:        TemplateParams,
): string {
  return JSON.stringify({ type: 'template', templateName, languageCode, params });
}

// Serializes a text body into the message body field
export function serializeTextPayload(body: string): string {
  return JSON.stringify({ type: 'text', body });
}

// Types and parsers for the serialized message body used for retries
export type MessagePayload =
  | { type: 'template'; templateName: string; languageCode: string; params: TemplateParams }
  | { type: 'text'; body: string };

// Parses the serialized body. Returns null if body is missing or malformed.
export function parseMessagePayload(raw: string | null): MessagePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === 'template' && parsed.templateName && typeof parsed.params === 'object' && !Array.isArray(parsed.params))
      return parsed as MessagePayload;
    if (parsed.type === 'text' && typeof parsed.body === 'string') return parsed as MessagePayload;
    return null;
  } catch {
    return null;
  }
}
