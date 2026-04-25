// tests/message/SendTextUseCase.test.ts
// Unit tests — all dependencies mocked.

import { SendTextUseCase } from '@application/message/use-cases/SendTextUseCase';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IConversationRepository } from '@domain/conversation/repositories/IConversationRepository';
import { IWhatsAppProvider } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { Contact } from '@domain/contact/entities/Contact';
import { Conversation } from '@domain/conversation/entities/Conversation';
import { Message } from '@domain/message/entities/Message';

// ─── Factories ────────────────────────────────────────────────────────────────

const CONTACT_ID = 'contact-uuid-1';
const LEAD_ID    = 'lead-uuid-1';
const MSG_ID     = 'message-uuid-1';
const WAMID      = 'wamid.text123';
const CLIENT_ID  = 'client-uuid-text-1';
const PHONE      = '+5514996168848';
const CONV_ID    = 'conv-uuid-1';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: CONTACT_ID, leadId: LEAD_ID, phone: PHONE, email: [], whatsapp: true,
    preferredChannel: 'whatsapp', contactType: 'import', priority: 'high',
    stage: 'new', score: 0, priceSensitive: false, lastContactAt: null, lastReplyAt: null,
    contactCount30d: 0, lastPurchaseAt: null, status: 'active', unsubscribed: false,
    unsubscribedAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONV_ID, contactId: CONTACT_ID, metaConversationId: 'mc-1',
    origin: 'user_initiated', expiresAt: new Date(Date.now() + 86_400_000),
    lastMessageAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: MSG_ID, contactId: CONTACT_ID, campaignId: null, templateId: null,
    channel: 'whatsapp', status: 'pending', wamid: null, clientMessageId: CLIENT_ID,
    body: 'Olá, tudo bem?', conversationId: CONV_ID, retryCount: 0, retryAfter: null,
    lockedAt: null, sentAt: null, errorReason: null, deletedAt: null, createdAt: new Date(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<{ to: string; body: string; clientMessageId: string }> = {}) {
  return {
    to:              PHONE,
    body:            'Olá, tudo bem?',
    clientMessageId: CLIENT_ID,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let contactRepo:      jest.Mocked<IContactRepository>;
let messageRepo:      jest.Mocked<IMessageRepository>;
let conversationRepo: jest.Mocked<IConversationRepository>;
let whatsApp:         jest.Mocked<IWhatsAppProvider>;
let useCase:          SendTextUseCase;

beforeEach(() => {
  contactRepo = {
    upsertContact:       jest.fn(),
    findById:            jest.fn(),
    findByPhone:         jest.fn().mockResolvedValue(makeContact()),
    setWhatsappByLeadId: jest.fn(),
    touchLastReplyAt:    jest.fn(),
    trackOutboundSent:   jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IContactRepository>;

  messageRepo = {
    createPending:           jest.fn().mockResolvedValue({ message: makeMessage(), created: true }),
    updateWamid:             jest.fn().mockResolvedValue(undefined),
    updateStatusByWamid:     jest.fn().mockResolvedValue(undefined),
    linkConversationByWamid: jest.fn().mockResolvedValue(undefined),
    updateStatusById:        jest.fn().mockResolvedValue(undefined),
    findById:                jest.fn(),
  } as jest.Mocked<IMessageRepository>;

  conversationRepo = {
    findOpenByContactId: jest.fn().mockResolvedValue(makeConversation()),
    upsert:              jest.fn(),
    touchLastMessageAt:  jest.fn(),
  } as jest.Mocked<IConversationRepository>;

  whatsApp = {
    sendText:     jest.fn().mockResolvedValue({ wamid: WAMID }),
    sendTemplate: jest.fn(),
  } as jest.Mocked<IWhatsAppProvider>;

  useCase = new SendTextUseCase(contactRepo, messageRepo, conversationRepo, whatsApp);
  (useCase as unknown as { limiter: { throttle: jest.Mock } }).limiter.throttle =
    jest.fn().mockResolvedValue(undefined);

  process.env.FREQUENCY_CAP_DAYS    = '7';
  process.env.FREQUENCY_CAP_MAX_30D = '3';
});

afterEach(() => jest.resetAllMocks());

// ─── Success — contact in CRM with open window ────────────────────────────────

describe('success — contact in CRM with open conversation window', () => {
  it('returns messageId, contactId, wamid, created=true', async () => {
    const result = await useCase.execute(makeInput());
    expect(result).toEqual({ messageId: MSG_ID, contactId: CONTACT_ID, wamid: WAMID, created: true });
  });

  it('calls sendText with normalized phone and body', async () => {
    await useCase.execute(makeInput({ to: '5514996168848' })); // no leading +
    expect(whatsApp.sendText).toHaveBeenCalledWith('+5514996168848', 'Olá, tudo bem?');
  });

  it('keeps + when already present', async () => {
    await useCase.execute(makeInput());
    expect(whatsApp.sendText).toHaveBeenCalledWith(PHONE, expect.any(String));
  });

  it('inserts pending record BEFORE the API call', async () => {
    await useCase.execute(makeInput());
    const insertOrder = messageRepo.createPending.mock.invocationCallOrder[0]!;
    const sendOrder   = whatsApp.sendText.mock.invocationCallOrder[0]!;
    expect(insertOrder).toBeLessThan(sendOrder);
  });

  it('persists wamid linked to the open conversation', async () => {
    await useCase.execute(makeInput());
    expect(messageRepo.updateWamid).toHaveBeenCalledWith(MSG_ID, WAMID, CONV_ID);
  });

  it('calls trackOutboundSent with contact.id after successful send', async () => {
    await useCase.execute(makeInput());
    expect(contactRepo.trackOutboundSent).toHaveBeenCalledWith(CONTACT_ID);
  });
});

// ─── 24h window enforcement ───────────────────────────────────────────────────

describe('24h conversation window enforcement', () => {
  it('throws 422 when no open conversation exists for a known contact', async () => {
    conversationRepo.findOpenByContactId.mockResolvedValue(null);
    await expect(useCase.execute(makeInput())).rejects.toMatchObject({ statusCode: 422 });
    expect(whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('error message mentions send-template', async () => {
    conversationRepo.findOpenByContactId.mockResolvedValue(null);
    await expect(useCase.execute(makeInput())).rejects.toMatchObject({
      message: expect.stringContaining('send-template'),
    });
  });

  it('does NOT check window for direct sends (number not in CRM)', async () => {
    contactRepo.findByPhone.mockResolvedValue(null);
    conversationRepo.findOpenByContactId.mockResolvedValue(null); // even if null, should not throw
    await expect(useCase.execute(makeInput())).resolves.toBeDefined();
    expect(conversationRepo.findOpenByContactId).not.toHaveBeenCalled();
  });
});

// ─── Direct send (number not in CRM) ─────────────────────────────────────────

describe('direct send — number NOT in CRM', () => {
  beforeEach(() => {
    contactRepo.findByPhone.mockResolvedValue(null);
  });

  it('returns null messageId and null contactId', async () => {
    const result = await useCase.execute(makeInput());
    expect(result.messageId).toBeNull();
    expect(result.contactId).toBeNull();
    expect(result.wamid).toBe(WAMID);
  });

  it('does NOT create a DB record', async () => {
    await useCase.execute(makeInput());
    expect(messageRepo.createPending).not.toHaveBeenCalled();
  });

  it('still calls sendText', async () => {
    await useCase.execute(makeInput());
    expect(whatsApp.sendText).toHaveBeenCalledTimes(1);
  });

  it('does NOT call trackOutboundSent for direct sends', async () => {
    await useCase.execute(makeInput());
    expect(contactRepo.trackOutboundSent).not.toHaveBeenCalled();
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('idempotency (duplicate clientMessageId)', () => {
  it('returns existing record without re-sending', async () => {
    messageRepo.createPending.mockResolvedValue({
      message: makeMessage({ wamid: 'wamid.already-sent', status: 'sent' }),
      created: false,
    });
    const result = await useCase.execute(makeInput());
    expect(result.created).toBe(false);
    expect(result.wamid).toBe('wamid.already-sent');
    expect(whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('does NOT call trackOutboundSent on duplicate (no send happened)', async () => {
    messageRepo.createPending.mockResolvedValue({
      message: makeMessage({ wamid: 'wamid.already-sent', status: 'sent' }),
      created: false,
    });
    await useCase.execute(makeInput());
    expect(contactRepo.trackOutboundSent).not.toHaveBeenCalled();
  });
});

// ─── Contact guards ───────────────────────────────────────────────────────────

describe('contact guards', () => {
  it('throws 422 when whatsapp === false (invalid number)', async () => {
    contactRepo.findByPhone.mockResolvedValue(makeContact({ whatsapp: false }));
    await expect(useCase.execute(makeInput())).rejects.toMatchObject({ statusCode: 422 });
    expect(whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('throws 422 when contact is unsubscribed', async () => {
    contactRepo.findByPhone.mockResolvedValue(makeContact({ unsubscribed: true }));
    await expect(useCase.execute(makeInput())).rejects.toMatchObject({ statusCode: 422 });
  });

  it('proceeds when whatsapp === null (not yet validated)', async () => {
    contactRepo.findByPhone.mockResolvedValue(makeContact({ whatsapp: null }));
    await expect(useCase.execute(makeInput())).resolves.toBeDefined();
  });
});

// ─── Frequency cap ────────────────────────────────────────────────────────────

describe('frequency cap', () => {
  it('throws 429 when contactCount30d reaches the limit', async () => {
    contactRepo.findByPhone.mockResolvedValue(makeContact({ contactCount30d: 3 }));
    await expect(useCase.execute(makeInput())).rejects.toMatchObject({ statusCode: 429 });
    expect(whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('throws 429 when last contact was within the minimum interval', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    contactRepo.findByPhone.mockResolvedValue(makeContact({ lastContactAt: threeDaysAgo }));
    await expect(useCase.execute(makeInput())).rejects.toMatchObject({ statusCode: 429 });
    expect(whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('proceeds when contactCount30d is below the limit', async () => {
    contactRepo.findByPhone.mockResolvedValue(makeContact({ contactCount30d: 2 }));
    await expect(useCase.execute(makeInput())).resolves.toBeDefined();
  });

  it('proceeds when last contact was outside the minimum interval', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    contactRepo.findByPhone.mockResolvedValue(makeContact({ lastContactAt: eightDaysAgo }));
    await expect(useCase.execute(makeInput())).resolves.toBeDefined();
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('marks message as failed and re-throws on Meta API error', async () => {
    whatsApp.sendText.mockRejectedValue(new Error('Meta 131047: re-engagement required'));
    await expect(useCase.execute(makeInput())).rejects.toThrow('re-engagement');
    expect(messageRepo.updateStatusById).toHaveBeenCalledWith(
      MSG_ID, 'failed', expect.stringContaining('re-engagement'),
    );
  });

  it('marks contact whatsapp=false when Meta returns error 131026', async () => {
    whatsApp.sendText.mockRejectedValue(new Error('Meta API error 131026: number not on WhatsApp'));
    await expect(useCase.execute(makeInput())).rejects.toThrow();
    expect(contactRepo.setWhatsappByLeadId).toHaveBeenCalledWith(LEAD_ID, false);
  });

  it('does NOT mark whatsapp=false for non-131026 errors', async () => {
    whatsApp.sendText.mockRejectedValue(new Error('Meta 131047: re-engagement required'));
    await expect(useCase.execute(makeInput())).rejects.toThrow();
    expect(contactRepo.setWhatsappByLeadId).not.toHaveBeenCalled();
  });

  it('does NOT mark as failed when no message record (direct send)', async () => {
    contactRepo.findByPhone.mockResolvedValue(null);
    whatsApp.sendText.mockRejectedValue(new Error('Meta API error'));
    await expect(useCase.execute(makeInput())).rejects.toThrow();
    expect(messageRepo.updateStatusById).not.toHaveBeenCalled();
  });

  it('does NOT call trackOutboundSent when Meta API fails', async () => {
    whatsApp.sendText.mockRejectedValue(new Error('Meta 131047: re-engagement required'));
    await expect(useCase.execute(makeInput())).rejects.toThrow();
    expect(contactRepo.trackOutboundSent).not.toHaveBeenCalled();
  });

  it('retries updateWamid once on first failure', async () => {
    messageRepo.updateWamid
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce(undefined);
    const result = await useCase.execute(makeInput());
    expect(result.wamid).toBe(WAMID);
    expect(messageRepo.updateWamid).toHaveBeenCalledTimes(2);
  });

  it('does not throw when both updateWamid retries fail (CRITICAL log)', async () => {
    messageRepo.updateWamid.mockRejectedValue(new Error('DB down'));
    await expect(useCase.execute(makeInput())).resolves.toBeDefined();
    expect(messageRepo.updateWamid).toHaveBeenCalledTimes(2);
  });
});
