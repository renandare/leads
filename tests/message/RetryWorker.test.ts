// tests/message/RetryWorker.test.ts

import { RetryWorker } from '@application/message/RetryWorker';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IWhatsAppProvider } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { Contact } from '@domain/contact/entities/Contact';
import { Message } from '@domain/message/entities/Message';
import { serializeTemplatePayload, serializeTextPayload, BACKOFF_MINUTES } from '@application/message/use-cases/SendTemplateUseCase';

// Factories

const CONTACT_ID = 'contact-uuid-1';
const LEAD_ID    = 'lead-uuid-1';
const MSG_ID     = 'message-uuid-1';
const WAMID      = 'wamid.retry123';
const PHONE      = '+5514996168848';

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

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: MSG_ID, contactId: CONTACT_ID, campaignId: null, templateId: null,
    channel: 'whatsapp', status: 'pending', wamid: null, clientMessageId: 'client-1',
    body: serializeTemplatePayload('outreach_loja', 'pt_BR', { header: { customer_name: 'João' } }),
    conversationId: null, retryCount: 1, retryAfter: new Date(Date.now() - 1000),
    lockedAt: new Date(), sentAt: null, errorReason: null, deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// Setup 

let messageRepo: jest.Mocked<IMessageRepository>;
let contactRepo: jest.Mocked<IContactRepository>;
let whatsApp:    jest.Mocked<IWhatsAppProvider>;
let worker:      RetryWorker;

beforeEach(() => {
  messageRepo = {
    createPending:           jest.fn(),
    updateWamid:             jest.fn().mockResolvedValue(undefined),
    updateStatusByWamid:     jest.fn(),
    linkConversationByWamid: jest.fn(),
    updateStatusById:        jest.fn().mockResolvedValue(undefined),
    findById:                jest.fn(),
    scheduleRetry:           jest.fn().mockResolvedValue(undefined),
    claimRetryable:          jest.fn().mockResolvedValue([makeMessage()]),
  } as jest.Mocked<IMessageRepository>;

  contactRepo = {
    upsertContact:       jest.fn(),
    findById:            jest.fn().mockResolvedValue(makeContact()),
    findByPhone:         jest.fn(),
    setWhatsappByLeadId: jest.fn().mockResolvedValue(undefined),
    touchLastReplyAt:    jest.fn(),
    trackOutboundSent:   jest.fn().mockResolvedValue(undefined),
    unsubscribeById:     jest.fn(),
    findCampaignBatch:   jest.fn(),
  } as jest.Mocked<IContactRepository>;

  whatsApp = {
    sendText:     jest.fn().mockResolvedValue({ wamid: WAMID }),
    sendTemplate: jest.fn().mockResolvedValue({ wamid: WAMID }),
  } as jest.Mocked<IWhatsAppProvider>;

  worker = new RetryWorker(messageRepo, contactRepo, whatsApp);
});

afterEach(() => jest.resetAllMocks());

// tick() — no messages to send

describe('tick() — empty queue', () => {
  it('does nothing when claimRetryable returns empty', async () => {
    messageRepo.claimRetryable.mockResolvedValue([]);
    await worker.tick();
    expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
    expect(whatsApp.sendText).not.toHaveBeenCalled();
  });
});

// Template retry — success

describe('template retry — success', () => {
  it('sends template with params from serialized body', async () => {
    await worker.tick();
    expect(whatsApp.sendTemplate).toHaveBeenCalledWith(PHONE, 'outreach_loja', 'pt_BR', { header: { customer_name: 'João' } });
  });

  it('calls updateWamid after successful send', async () => {
    await worker.tick();
    expect(messageRepo.updateWamid).toHaveBeenCalledWith(MSG_ID, WAMID, null);
  });

  it('calls trackOutboundSent (fire-and-forget)', async () => {
    await worker.tick();
    expect(contactRepo.trackOutboundSent).toHaveBeenCalledWith(CONTACT_ID);
  });
});

// Text retry — success

describe('text retry — success', () => {
  beforeEach(() => {
    messageRepo.claimRetryable.mockResolvedValue([
      makeMessage({ body: serializeTextPayload('Olá, tudo bem?') }),
    ]);
  });

  it('sends text with body from serialized payload', async () => {
    await worker.tick();
    expect(whatsApp.sendText).toHaveBeenCalledWith(PHONE, 'Olá, tudo bem?');
  });

  it('calls updateWamid after success', async () => {
    await worker.tick();
    expect(messageRepo.updateWamid).toHaveBeenCalledWith(MSG_ID, WAMID, null);
  });
});

// Retry scheduling on failure

describe('retry scheduling on failure', () => {
  it('schedules next retry at retryCount=1 with 15min delay', async () => {
    whatsApp.sendTemplate.mockRejectedValue(new Error('Meta 500: server error'));
    const before = Date.now();
    await worker.tick();
    const [, retryAfter] = messageRepo.scheduleRetry.mock.calls[0]!;
    const delayMs = (retryAfter as Date).getTime() - before;
    const expectedDelayMs = BACKOFF_MINUTES[1] * 60_000; // retryCount=1 and index 1: 15min
    expect(delayMs).toBeGreaterThanOrEqual(expectedDelayMs - 100);
    expect(delayMs).toBeLessThan(expectedDelayMs + 1000);
  });

  it('schedules next retry at retryCount=2 with 45min delay', async () => {
    messageRepo.claimRetryable.mockResolvedValue([makeMessage({ retryCount: 2 })]);
    whatsApp.sendTemplate.mockRejectedValue(new Error('Meta 500'));
    const before = Date.now();
    await worker.tick();
    const [, retryAfter] = messageRepo.scheduleRetry.mock.calls[0]!;
    const delayMs = (retryAfter as Date).getTime() - before;
    const expectedDelayMs = BACKOFF_MINUTES[2] * 60_000; // retryCount=2 and index 2: 45min
    expect(delayMs).toBeGreaterThanOrEqual(expectedDelayMs - 100);
  });

  it('marks as failed definitively when retryCount >= 3', async () => {
    messageRepo.claimRetryable.mockResolvedValue([makeMessage({ retryCount: 3 })]);
    whatsApp.sendTemplate.mockRejectedValue(new Error('Meta 500'));
    await worker.tick();
    expect(messageRepo.updateStatusById).toHaveBeenCalledWith(MSG_ID, 'failed', expect.any(String));
    expect(messageRepo.scheduleRetry).not.toHaveBeenCalled();
  });
});

// Permanent errors

describe('permanent error (131026 — not on WhatsApp)', () => {
  it('marks as failed immediately without scheduling retry', async () => {
    whatsApp.sendTemplate.mockRejectedValue(new Error('Meta error 131026: not on WhatsApp'));
    await worker.tick();
    expect(messageRepo.updateStatusById).toHaveBeenCalledWith(MSG_ID, 'failed', expect.stringContaining('131026'));
    expect(messageRepo.scheduleRetry).not.toHaveBeenCalled();
  });

  it('calls setWhatsappByLeadId(false) on 131026', async () => {
    whatsApp.sendTemplate.mockRejectedValue(new Error('Meta error 131026'));
    await worker.tick();
    expect(contactRepo.setWhatsappByLeadId).toHaveBeenCalledWith(LEAD_ID, false);
  });
});

// Edge cases 

describe('edge cases', () => {
  it('marks as failed when contact not found', async () => {
    contactRepo.findById.mockResolvedValue(null);
    await worker.tick();
    expect(messageRepo.updateStatusById).toHaveBeenCalledWith(MSG_ID, 'failed', 'Contact not found or no phone');
    expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
  });

  it('marks as failed when contact has no phone', async () => {
    contactRepo.findById.mockResolvedValue(makeContact({ phone: null }));
    await worker.tick();
    expect(messageRepo.updateStatusById).toHaveBeenCalledWith(MSG_ID, 'failed', 'Contact not found or no phone');
  });

  it('marks as failed when body payload is unrecognized', async () => {
    messageRepo.claimRetryable.mockResolvedValue([makeMessage({ body: 'plain text no JSON' })]);
    await worker.tick();
    expect(messageRepo.updateStatusById).toHaveBeenCalledWith(MSG_ID, 'failed', 'Unrecognized body payload');
    expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
  });

  it('marks as failed when body is null', async () => {
    messageRepo.claimRetryable.mockResolvedValue([makeMessage({ body: null })]);
    await worker.tick();
    expect(messageRepo.updateStatusById).toHaveBeenCalledWith(MSG_ID, 'failed', 'Unrecognized body payload');
  });

  it('processes multiple messages in a batch', async () => {
    const msg1 = makeMessage({ id: 'msg-1' });
    const msg2 = makeMessage({ id: 'msg-2' });
    messageRepo.claimRetryable.mockResolvedValue([msg1, msg2]);
    await worker.tick();
    expect(whatsApp.sendTemplate).toHaveBeenCalledTimes(2);
    expect(messageRepo.updateWamid).toHaveBeenCalledTimes(2);
  });

  it('continues to next message when one fails', async () => {
    const msg1 = makeMessage({ id: 'msg-1' });
    const msg2 = makeMessage({ id: 'msg-2' });
    messageRepo.claimRetryable.mockResolvedValue([msg1, msg2]);
    whatsApp.sendTemplate
      .mockRejectedValueOnce(new Error('Meta 500'))  // msg1 fails
      .mockResolvedValueOnce({ wamid: WAMID });      // msg2 succeeds
    await worker.tick();
    expect(messageRepo.scheduleRetry).toHaveBeenCalledTimes(1);
    expect(messageRepo.updateWamid).toHaveBeenCalledTimes(1);
  });
});

// parseMessagePayload 

describe('serializeTemplatePayload / serializeTextPayload round-trip', () => {
  it('serializes and deserializes template payload', () => {
    const serialized = serializeTemplatePayload('outreach_loja', 'pt_BR', { header: { customer_name: 'João' } });
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual({ type: 'template', templateName: 'outreach_loja', languageCode: 'pt_BR', params: { header: { customer_name: 'João' } } });
  });

  it('serializes and deserializes text payload', () => {
    const serialized = serializeTextPayload('Olá, mundo!');
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual({ type: 'text', body: 'Olá, mundo!' });
  });
});
