// src/application/message/RetryWorker.ts
// Background worker that retries failed WhatsApp messages
// retry 0 OR 1: 5min | 1 OR 2: 15min | 2 OR 3: 45min | retryCount≥3: fail definitively
// Using FOR UPDATE SKIP LOCKED for multiple processes/workers don't claim the same row.

import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IWhatsAppProvider } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { Message } from '@domain/message/entities/Message';
import { logger } from '@shared/utils/logger';
import {
  BACKOFF_MINUTES,
  normalizePhone,
  isNotOnWhatsApp,
  parseMessagePayload,
} from './use-cases/SendTemplateUseCase';

const BATCH_SIZE = 10;

export class RetryWorker {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly contactRepo: IContactRepository,
    private readonly whatsApp:    IWhatsAppProvider,
  ) {}

  // Called once per worker interval. Processes up to BATCH_SIZE retryable messages
  async tick(): Promise<void> {
    const messages = await this.messageRepo.claimRetryable(BATCH_SIZE);
    if (messages.length === 0) return;

    logger.debug('[RetryWorker] claimed messages for retry', { count: messages.length });

    for (const msg of messages) {
      await this.retryOne(msg);
    }
  }

  // Retries a single message, on success updates wamid and sentAt
  private async retryOne(msg: Message): Promise<void> {
    const contact = await this.contactRepo.findById(msg.contactId);
    if (!contact?.phone) {
      logger.warn('[RetryWorker] contact not found or missing phone — failing message', { messageId: msg.id });
      await this.messageRepo.updateStatusById(msg.id, 'failed', 'Contact not found or no phone').catch(() => {});
      return;
    }

    // Parse the serialized payload with retry params from the message body
    const payload = parseMessagePayload(msg.body);
    if (!payload) {
      logger.warn('[RetryWorker] unrecognized body payload — failing message', { messageId: msg.id });
      await this.messageRepo.updateStatusById(msg.id, 'failed', 'Unrecognized body payload').catch(() => {});
      return;
    }

    try {
      let wamid: string;
      // template
      if (payload.type === 'template') {
        const result = await this.whatsApp.sendTemplate(
          normalizePhone(contact.phone),
          payload.templateName,
          payload.languageCode,
          payload.params,
        );
        wamid = result.wamid;
      } else {
        // single message
        const result = await this.whatsApp.sendText(normalizePhone(contact.phone), payload.body);
        wamid = result.wamid;
      }

      await this.messageRepo.updateWamid(msg.id, wamid, null);
      this.contactRepo.trackOutboundSent(contact.id).catch(() => {});

      logger.info('[RetryWorker] retry succeeded', { messageId: msg.id, retryCount: msg.retryCount, wamid });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);

      // phone is not on whatsapp or retries exhausted
      if (isNotOnWhatsApp(err) || msg.retryCount >= BACKOFF_MINUTES.length) {
        logger.warn('[RetryWorker] exhausted retries or permanent error — failing message', {
          messageId: msg.id, retryCount: msg.retryCount, reason,
        });
        // mark as failed so it won't be retried again
        await this.messageRepo.updateStatusById(msg.id, 'failed', reason).catch(() => {});

        // if the phone is not on WhatsApp, update contact to prevent future retries
        if (isNotOnWhatsApp(err)) {
          await this.contactRepo.setWhatsappByLeadId(contact.leadId, false).catch(() => {});
        }
      } else {

        // schedule next retry 
        const delayMs = BACKOFF_MINUTES[msg.retryCount] * 60_000;
        const retryAfter = new Date(Date.now() + delayMs);
        logger.info('[RetryWorker] scheduling next retry', {
          messageId: msg.id, retryCount: msg.retryCount + 1, retryAfter,
        });
        await this.messageRepo.scheduleRetry(msg.id, retryAfter).catch(() => {});
      }
    }
  }
}
