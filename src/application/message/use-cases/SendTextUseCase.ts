// src/application/message/use-cases/SendTextUseCase.ts
// Sends a free-form WhatsApp text message (only valid within the 24h conversation window).

import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IConversationRepository } from '@domain/conversation/repositories/IConversationRepository';
import { IWhatsAppProvider } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { RateLimiter } from '@shared/utils/RateLimiter';
import { AppError } from '@shared/errors/AppError';
import { SendTextInput, SendTextOutput } from '../dtos/SendTextDTO';
import { assertSendable, normalizePhone, persistWamid, isNotOnWhatsApp, handleSendFailure, serializeTextPayload } from './SendTemplateUseCase';

export class SendTextUseCase {
  private readonly limiter = new RateLimiter(1_000);

  constructor(
    private readonly contactRepo:      IContactRepository,
    private readonly messageRepo:      IMessageRepository,
    private readonly conversationRepo: IConversationRepository,
    private readonly whatsApp:         IWhatsAppProvider,
  ) {}

  async execute(input: SendTextInput): Promise<SendTextOutput> {
    const contact = await this.contactRepo.findByPhone(input.to);

    let openConvId: string | null = null;
    if (contact) {
      assertSendable(contact);

      // Enforce 24h window for known contacts, preventing wasting a paid template
      const openConv = await this.conversationRepo.findOpenByContactId(contact.id);
      if (!openConv) {
        throw new AppError(
          'No open conversation window — use POST /messages/send-template instead',
          422,
        );
      }
      openConvId = openConv.id;
    }

    // Persist-before-send (only with contact)
    let messageId: string | null = null;
    if (contact) {
      const { message, created } = await this.messageRepo.createPending({
        contactId:       contact.id,
        channel:         'whatsapp',
        body:            serializeTextPayload(input.body),
        clientMessageId: input.clientMessageId,
      });
      if (!created) {
        return { messageId: message.id, contactId: contact.id, wamid: message.wamid ?? '', created: false };
      }
      messageId = message.id;
    }

    // Send
    await this.limiter.throttle();
    let wamid: string;
    try {
      const result = await this.whatsApp.sendText(normalizePhone(input.to), input.body);
      wamid = result.wamid;
    } catch (err) {
      if (messageId) {
        await handleSendFailure(this.messageRepo, messageId, 0, err);
      }
      if (contact && isNotOnWhatsApp(err)) {
        await this.contactRepo.setWhatsappByLeadId(contact.leadId, false).catch(() => {});
      }
      throw err;
    }

    // Persist wamid
    if (messageId && contact) {
      await persistWamid(this.messageRepo, messageId, wamid, openConvId);
    }

    // Track send (never fail the send over a tracking update)
    if (contact) {
      this.contactRepo.trackOutboundSent(contact.id).catch(() => {});
    }

    return { messageId, contactId: contact?.id ?? null, wamid, created: true };
  }
}
