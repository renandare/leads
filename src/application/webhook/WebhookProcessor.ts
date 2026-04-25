// src/application/webhook/WebhookProcessor.ts
// Processes Meta webhook payloads: inbound messages + delivery status updates.

import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IInteractionRepository } from '@domain/interaction/repositories/IInteractionRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IConversationRepository } from '@domain/conversation/repositories/IConversationRepository';
import { logger } from '@shared/utils/logger';

// Raw Meta webhook types

export interface MetaWebhookPayload {
  object: string;
  entry: MetaEntry[];
}

interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

interface MetaChange {
  value: MetaChangeValue;
  field: string;
}

interface MetaChangeValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

export interface MetaMessage {
  from:      string;
  id:        string;  // wamid
  timestamp: string;
  type:      string;
  to?:       string;  // present in echo messages (business reply via app)
  text?:     { body: string };
  button?:   { payload: string; text: string };  // quick reply tap
  interactive?: {
    type:          string;
    button_reply?: { id: string; title: string };
    list_reply?:   { id: string; title: string; description?: string };
  };
}

export interface MetaStatus {
  id:           string; // wamid of the outbound message
  status:       'sent' | 'delivered' | 'read' | 'failed';
  timestamp:    string;
  recipient_id: string;
  conversation?: {
    id:                    string;
    expiration_timestamp?: string;
    origin:                { type: string };
  };
  errors?: Array<{ code: number; title: string }>;
}


export class WebhookProcessor {
  // business owner phone number, used for echo detection
  private readonly ownPhone: string;

  constructor(
    private readonly contactRepo:      IContactRepository,
    private readonly interactionRepo:  IInteractionRepository,
    private readonly messageRepo:      IMessageRepository,
    private readonly conversationRepo: IConversationRepository,
  ) {
    this.ownPhone = (process.env.META_OWNER_PHONE ?? '').replace(/^\+/, '');
  }

  async process(payload: MetaWebhookPayload): Promise<void> {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;

        if (value.messages?.length) {
          for (const msg of value.messages) {
            await this.handleInbound(msg).catch(err =>
              logger.error('[Webhook] handleInbound error', { wamid: msg.id, error: String(err) }),
            );
          }
        }

        if (value.statuses?.length) {
          for (const status of value.statuses) {
            await this.handleStatus(status).catch(err =>
              logger.error('[Webhook] handleStatus error', { wamid: status.id, error: String(err) }),
            );
          }
        }
      }
    }
  }

  // Inbound message
  private async handleInbound(msg: MetaMessage): Promise<void> {
    const isEcho = this.ownPhone !== '' && msg.from === this.ownPhone;

    if (isEcho) { // Message from the owner's number
      await this.handleEcho(msg);
      return;
    }

    // skip if already processed
    if (await this.interactionRepo.existsByMetaMessageId(msg.id)) {
      logger.debug('[Webhook] duplicate inbound wamid, skipping', { wamid: msg.id });
      return;
    }

    // get contact by phone number
    const contact = await this.contactRepo.findByPhone(msg.from);
    if (!contact) {
      logger.warn('[Webhook] inbound message from unknown phone', { from: msg.from, wamid: msg.id });
      return;
    }

    const content = extractContent(msg);

    await this.interactionRepo.create({
      contactId:     contact.id,
      metaMessageId: msg.id,
      type:          'inbound_message',
      classification: msg.type,
      content,
    });

    await this.contactRepo.touchLastReplyAt(contact.id);

    if (isOptOut(content)) {
      logger.info('[Webhook] opt-out detected — unsubscribing contact', { contactId: contact.id });
      await this.contactRepo.unsubscribeById(contact.id).catch(err =>
        logger.error('[Webhook] unsubscribeById error', { contactId: contact.id, error: String(err) }),
      );
    }
  }

  //Echo (message sent from the WhatsApp app in Linked Mode)

  private async handleEcho(msg: MetaMessage): Promise<void> {
    // Idempotency
    if (await this.interactionRepo.existsByMetaMessageId(msg.id)) return;

    // Link to the customer (recipient), not the shop owner
    const recipientPhone = msg.to;
    if (!recipientPhone) {
      logger.debug('[Webhook] echo has no recipient phone, skipping', { wamid: msg.id });
      return;
    }

    const contact = await this.contactRepo.findByPhone(recipientPhone);
    if (!contact) {
      logger.debug('[Webhook] echo recipient not found in CRM', { wamid: msg.id, to: recipientPhone });
      return;
    }
    // Persist the message as an interaction for better visibility in the CRM, and future use (opt-out detection on manual messages)
    await this.interactionRepo.create({
      contactId:      contact.id,
      metaMessageId:  msg.id,
      type:           'manual_shop_response',
      classification: msg.type,
      content:        extractContent(msg),
    });
  }

  //Status update
  private async handleStatus(status: MetaStatus): Promise<void> {
    await this.messageRepo.updateStatusByWamid(status.id, status.status,
      status.errors?.[0] ? `${status.errors[0].code}: ${status.errors[0].title}` : null,
    );

    // If conversation data present, upsert conversation and link it to the message record.
    if (status.conversation?.expiration_timestamp) {
      const contact = await this.contactRepo.findByPhone(status.recipient_id);
      if (!contact) return;

      const expiresAt = new Date(Number(status.conversation.expiration_timestamp) * 1000);
      const conv = await this.conversationRepo.upsert({
        contactId:          contact.id,
        metaConversationId: status.conversation.id,
        origin:             status.conversation.origin.type,
        expiresAt,
      });

      await this.conversationRepo.touchLastMessageAt(conv.id);

      // Link message.conversation_id if not set yet (e.g. business-initiated templates)
      await this.messageRepo.linkConversationByWamid(status.id, conv.id);
    }
  }
}

// Extracts content from any message type for opt-out detection and other uses. 
// Returns null if no extractable content is found.
export function extractContent(msg: MetaMessage): string | null {
  switch (msg.type) {
    case 'text':        return msg.text?.body ?? null;
    case 'button':      return msg.button?.text ?? null;
    case 'interactive': return (
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      null
    );
    default:            return null;
  }
}

// Keywords that indicate an opt-out
const OPT_OUT_KEYWORDS = new Set([
    'sair', 'stop', 'parar', 'cancelar', 'nao quero',
    'nao tenho interesse', 'não tenho interesse',
]);

// Returns true if the content matches any opt-out keyword
export function isOptOut(content: string | null): boolean {
  if (!content) return false;
  const normalized = content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents
    .trim();
  return OPT_OUT_KEYWORDS.has(normalized);
}
