// tests/webhook/WebhookProcessor.test.ts
// Unit tests — all repositories are mocked.

import { WebhookProcessor, MetaWebhookPayload, extractContent, isOptOut } from '@application/webhook/WebhookProcessor';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IInteractionRepository } from '@domain/interaction/repositories/IInteractionRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IConversationRepository } from '@domain/conversation/repositories/IConversationRepository';
import { Contact } from '@domain/contact/entities/Contact';
import { Conversation } from '@domain/conversation/entities/Conversation';

// Mock factories

const WAMID     = 'wamid.test001';
const CONTACT_ID = 'contact-uuid-1';
const CONV_ID    = 'conv-uuid-1';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: CONTACT_ID, leadId: 'lead-1', phone: '5514996168848', email: [], whatsapp: null,
    preferredChannel: 'whatsapp', contactType: 'import', priority: 'high',
    stage: 'new', score: 0, priceSensitive: false, lastContactAt: null, lastReplyAt: null,
    contactCount30d: 0, lastPurchaseAt: null, status: 'active', unsubscribed: false,
    unsubscribedAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeConversation(): Conversation {
  return {
    id: CONV_ID, contactId: CONTACT_ID, metaConversationId: 'meta-conv-1',
    origin: 'user_initiated', expiresAt: new Date(Date.now() + 86400000),
    lastMessageAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

function makePayload(message: Partial<{
  from: string; id: string; type: string; text: { body: string }; to: string;
  button: { payload: string; text: string };
  interactive: { type: string; button_reply?: { id: string; title: string } };
}>): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15551854906', phone_number_id: '123' },
          messages: [{
            from: '5514996168848',
            id:   WAMID,
            timestamp: '1714000000',
            type: 'text',
            text: { body: 'Hello' },
            ...message,
          }],
        },
      }],
    }],
  };
}

function makeStatusPayload(status: string, withConversation = false): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15551854906', phone_number_id: '123' },
          statuses: [{
            id:           WAMID,
            status:       status as 'delivered',
            timestamp:    '1714000001',
            recipient_id: '5514996168848',
            ...(withConversation ? {
              conversation: {
                id:                    'meta-conv-1',
                expiration_timestamp:  String(Math.floor(Date.now() / 1000) + 86400),
                origin:                { type: 'business_initiated' },
              },
            } : {}),
          }],
        },
      }],
    }],
  };
}

// setup

let contactRepo:      jest.Mocked<IContactRepository>;
let interactionRepo:  jest.Mocked<IInteractionRepository>;
let messageRepo:      jest.Mocked<IMessageRepository>;
let conversationRepo: jest.Mocked<IConversationRepository>;
let processor:        WebhookProcessor;

beforeEach(() => {
  contactRepo = {
    upsertContact:      jest.fn(),
    findById:           jest.fn(),
    findByPhone:        jest.fn(),
    setWhatsappByLeadId: jest.fn(),
    touchLastReplyAt:   jest.fn(),
    trackOutboundSent:  jest.fn(),
    unsubscribeById:    jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IContactRepository>;

  interactionRepo = {
    create:                   jest.fn(),
    existsByMetaMessageId:    jest.fn().mockResolvedValue(false),
  } as jest.Mocked<IInteractionRepository>;

  messageRepo = {
    createPending:           jest.fn(),
    updateWamid:             jest.fn(),
    updateStatusByWamid:     jest.fn(),
    updateStatusById:        jest.fn(),
    scheduleRetry:           jest.fn(),
    claimRetryable:          jest.fn(),
    linkConversationByWamid: jest.fn(),
    findById:                jest.fn(),
  } as jest.Mocked<IMessageRepository>;

  conversationRepo = {
    findOpenByContactId: jest.fn(),
    upsert:              jest.fn().mockResolvedValue(makeConversation()),
    touchLastMessageAt:  jest.fn(),
  } as jest.Mocked<IConversationRepository>;

  process.env.META_OWNER_PHONE = '+5514000000000'; // different from test contact

  processor = new WebhookProcessor(
    contactRepo,
    interactionRepo,
    messageRepo,
    conversationRepo,
  );
});

afterEach(() => jest.resetAllMocks());

// Inbound message 

describe('inbound message', () => {
  beforeEach(() => {
    contactRepo.findByPhone.mockResolvedValue(makeContact());
  });

  it('saves interaction with correct fields', async () => {
    await processor.process(makePayload({}));

    expect(interactionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId:     CONTACT_ID,
        metaMessageId: WAMID,
        type:          'inbound_message',
        classification:'text',
        content:       'Hello',
      }),
    );
  });

  it('touches lastReplyAt on the contact', async () => {
    await processor.process(makePayload({}));

    expect(contactRepo.touchLastReplyAt).toHaveBeenCalledWith(CONTACT_ID);
  });

  it('skips duplicate wamid (idempotency)', async () => {
    interactionRepo.existsByMetaMessageId.mockResolvedValue(true);

    await processor.process(makePayload({}));

    expect(interactionRepo.create).not.toHaveBeenCalled();
    expect(contactRepo.touchLastReplyAt).not.toHaveBeenCalled();
  });

  it('skips message from unknown phone (no contact found)', async () => {
    contactRepo.findByPhone.mockResolvedValue(null);

    await processor.process(makePayload({ from: '9999999999' }));

    expect(interactionRepo.create).not.toHaveBeenCalled();
  });

  it('saves null content for non-text message type', async () => {
    await processor.process(makePayload({ type: 'image', text: undefined }));

    expect(interactionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: null, classification: 'image' }),
    );
  });

  it('does not throw when repo error occurs (logs and continues)', async () => {
    interactionRepo.create.mockRejectedValue(new Error('DB error'));

    await expect(processor.process(makePayload({}))).resolves.not.toThrow();
  });
});

// Echo detection

describe('echo (Linked Mode)', () => {
  const OWNER     = '5514000000000';
  const RECIPIENT = '5514996168848';

  beforeEach(() => {
    process.env.META_OWNER_PHONE = `+${OWNER}`;
    processor = new WebhookProcessor(contactRepo, interactionRepo, messageRepo, conversationRepo);
    // Echo: recipient contact is the customer
    contactRepo.findByPhone.mockResolvedValue(makeContact({ phone: RECIPIENT }));
  });

  it('saves manual_shop_response linked to the recipient contact', async () => {
    await processor.process(makePayload({ from: OWNER, to: RECIPIENT }));

    expect(interactionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'manual_shop_response', contactId: CONTACT_ID }),
    );
    expect(contactRepo.findByPhone).toHaveBeenCalledWith(RECIPIENT);
  });

  it('does NOT touch lastReplyAt for echo', async () => {
    await processor.process(makePayload({ from: OWNER, to: RECIPIENT }));

    expect(contactRepo.touchLastReplyAt).not.toHaveBeenCalled();
  });

  it('skips echo if wamid already saved (idempotency)', async () => {
    interactionRepo.existsByMetaMessageId.mockResolvedValue(true);

    await processor.process(makePayload({ from: OWNER, to: RECIPIENT }));

    expect(interactionRepo.create).not.toHaveBeenCalled();
  });

  it('skips echo silently when msg.to is absent', async () => {
    await processor.process(makePayload({ from: OWNER })); // no `to`

    expect(interactionRepo.create).not.toHaveBeenCalled();
  });

  it('skips echo silently when recipient not in CRM', async () => {
    contactRepo.findByPhone.mockResolvedValue(null);

    await processor.process(makePayload({ from: OWNER, to: RECIPIENT }));

    expect(interactionRepo.create).not.toHaveBeenCalled();
  });
});

// Status updates

describe('status update', () => {
  it('updates message status to delivered', async () => {
    await processor.process(makeStatusPayload('delivered'));

    expect(messageRepo.updateStatusByWamid).toHaveBeenCalledWith(WAMID, 'delivered', null);
  });

  it('updates message status to read', async () => {
    await processor.process(makeStatusPayload('read'));

    expect(messageRepo.updateStatusByWamid).toHaveBeenCalledWith(WAMID, 'read', null);
  });

  it('updates message status to failed with error reason', async () => {
    const payload: MetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'waba-1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15551854906', phone_number_id: '123' },
            statuses: [{
              id:           WAMID,
              status:       'failed',
              timestamp:    '1714000002',
              recipient_id: '5514996168848',
              errors:       [{ code: 131047, title: 'Re-engagement message' }],
            }],
          },
        }],
      }],
    };

    await processor.process(payload);

    expect(messageRepo.updateStatusByWamid).toHaveBeenCalledWith(
      WAMID, 'failed', '131047: Re-engagement message',
    );
  });

  it('upserts conversation when conversation data present', async () => {
    contactRepo.findByPhone.mockResolvedValue(makeContact());

    await processor.process(makeStatusPayload('delivered', true));

    expect(conversationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId:          CONTACT_ID,
        metaConversationId: 'meta-conv-1',
        origin:             'business_initiated',
      }),
    );
    expect(conversationRepo.touchLastMessageAt).toHaveBeenCalledWith(CONV_ID);
    expect(messageRepo.linkConversationByWamid).toHaveBeenCalledWith(WAMID, CONV_ID);
  });

  it('skips conversation upsert when no expiration_timestamp', async () => {
    contactRepo.findByPhone.mockResolvedValue(makeContact());

    await processor.process(makeStatusPayload('delivered', false));

    expect(conversationRepo.upsert).not.toHaveBeenCalled();
  });

  it('skips conversation upsert when contact not found', async () => {
    contactRepo.findByPhone.mockResolvedValue(null);

    await processor.process(makeStatusPayload('delivered', true));

    expect(conversationRepo.upsert).not.toHaveBeenCalled();
  });
});

// Payload routing 

describe('payload routing', () => {
  it('ignores entries with field != messages', async () => {
    const payload: MetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'w',
        changes: [{ field: 'account_alerts', value: {} as never }],
      }],
    };

    await expect(processor.process(payload)).resolves.not.toThrow();
    expect(interactionRepo.create).not.toHaveBeenCalled();
  });

  it('handles empty entry array without throwing', async () => {
    await expect(processor.process({ object: 'whatsapp_business_account', entry: [] }))
      .resolves.not.toThrow();
  });

  it('handles value with neither messages nor statuses', async () => {
    const payload: MetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'w',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '', phone_number_id: '' },
          },
        }],
      }],
    };

    await expect(processor.process(payload)).resolves.not.toThrow();
  });
});

// Button / interactive content parsing

describe('extractContent helper', () => {
  it('extracts text body', () => {
    expect(extractContent({ from: '', id: '', timestamp: '', type: 'text', text: { body: 'Olá' } })).toBe('Olá');
  });

  it('extracts quick reply button text', () => {
    expect(extractContent({ from: '', id: '', timestamp: '', type: 'button', button: { payload: 'p', text: 'Sim' } })).toBe('Sim');
  });

  it('extracts interactive button_reply title', () => {
    expect(extractContent({
      from: '', id: '', timestamp: '', type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Agora não' } },
    })).toBe('Agora não');
  });

  it('returns null for image and other media types', () => {
    expect(extractContent({ from: '', id: '', timestamp: '', type: 'image' })).toBeNull();
  });

  it('returns null when button field is absent', () => {
    expect(extractContent({ from: '', id: '', timestamp: '', type: 'button' })).toBeNull();
  });
});

// isOptOut helper

describe('isOptOut helper', () => {
  it.each([
    'SAIR', 'sair', 'Stop', 'STOP', 'Parar', 'Cancelar',
    'Nao quero', 'Não tenho interesse', 'nao tenho interesse',
  ])('detects opt-out for "%s"', (text) => {
    expect(isOptOut(text)).toBe(true);
  });

  it.each([
    'Sim', 'Agora não', 'Compro quando preciso', 'Já tenho', 'Olá',
  ])('does NOT flag "%s" as opt-out', (text) => {
    expect(isOptOut(text)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isOptOut(null)).toBe(false);
  });
});

// Inbound — button / interactive / opt-out 

describe('inbound — button responses', () => {
  beforeEach(() => {
    contactRepo.findByPhone.mockResolvedValue(makeContact());
  });

  it('saves interaction with button text as content', async () => {
    await processor.process(makePayload({
      type: 'button',
      button: { payload: 'yes', text: 'Sim' },
      text: undefined,
    }));

    expect(interactionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'button', content: 'Sim' }),
    );
  });

  it('saves interaction with interactive button_reply title as content', async () => {
    await processor.process(makePayload({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Agora não' } },
      text: undefined,
    }));

    expect(interactionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'interactive', content: 'Agora não' }),
    );
  });

  it('calls unsubscribeById when button text is "Não tenho interesse"', async () => {
    await processor.process(makePayload({
      type: 'button',
      button: { payload: 'no_interest', text: 'Não tenho interesse' },
      text: undefined,
    }));

    expect(contactRepo.unsubscribeById).toHaveBeenCalledWith(CONTACT_ID);
  });

  it('calls unsubscribeById when text message is "SAIR"', async () => {
    await processor.process(makePayload({ type: 'text', text: { body: 'SAIR' } }));

    expect(contactRepo.unsubscribeById).toHaveBeenCalledWith(CONTACT_ID);
  });

  it('does NOT call unsubscribeById for normal replies', async () => {
    await processor.process(makePayload({ type: 'button', button: { payload: 'yes', text: 'Sim' }, text: undefined }));

    expect(contactRepo.unsubscribeById).not.toHaveBeenCalled();
  });

  it('still saves interaction even on opt-out', async () => {
    await processor.process(makePayload({ type: 'text', text: { body: 'STOP' } }));

    expect(interactionRepo.create).toHaveBeenCalled();
    expect(contactRepo.unsubscribeById).toHaveBeenCalledWith(CONTACT_ID);
  });
});
