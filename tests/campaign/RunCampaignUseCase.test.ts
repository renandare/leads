// tests/campaign/RunCampaignUseCase.test.ts

import { RunCampaignUseCase, resolveParams, deriveClientId } from '@application/campaign/use-cases/RunCampaignUseCase';
import { ICampaignRepository } from '@domain/campaign/repositories/ICampaignRepository';
import { ITemplateRepository, TemplateInfo } from '@domain/template/repositories/ITemplateRepository';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { IWhatsAppProvider } from '@infrastructure/services/whatsapp/IWhatsAppProvider';
import { Campaign } from '@domain/campaign/entities/Campaign';
import { CampaignContact } from '@domain/campaign/entities/CampaignContact';
import { Message } from '@domain/message/entities/Message';

// Factories 

const CAMPAIGN_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONTACT_ID   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEAD_ID      = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MSG_ID       = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const WAMID        = 'wamid.campaign001';
const PHONE        = '+5514996168848';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID, name: 'Test', templateId: 1, segment: 'new',
    status: 'queued', startAt: null, finishedAt: null, totalSent: 0,
    deletedAt: null, createdAt: new Date(),
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<TemplateInfo> = {}): TemplateInfo {
  return { id: 1, name: 'outreach_loja', channel: 'whatsapp', active: true, ...overrides };
}

function makeContact(overrides: Partial<CampaignContact> = {}): CampaignContact {
  return {
    id: CONTACT_ID, phone: PHONE, leadId: LEAD_ID, customerName: 'João Silva',
    lastPurchaseAt: null, contactCount30d: 0, lastContactAt: null,
    whatsapp: true, status: 'active', unsubscribed: false,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: MSG_ID, contactId: CONTACT_ID, campaignId: CAMPAIGN_ID, templateId: null,
    channel: 'whatsapp', status: 'pending', wamid: null, clientMessageId: 'client-1',
    body: null, conversationId: null, retryCount: 0, retryAfter: null,
    lockedAt: null, sentAt: null, errorReason: null, deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// Setup 

let campaignRepo:  jest.Mocked<ICampaignRepository>;
let templateRepo:  jest.Mocked<ITemplateRepository>;
let contactRepo:   jest.Mocked<IContactRepository>;
let messageRepo:   jest.Mocked<IMessageRepository>;
let whatsApp:      jest.Mocked<IWhatsAppProvider>;
let useCase:       RunCampaignUseCase;

beforeEach(() => {
  campaignRepo = {
    create:             jest.fn(),
    findById:           jest.fn().mockResolvedValue(makeCampaign()),
    list:               jest.fn(),
    markRunning:        jest.fn().mockResolvedValue(undefined),
    markDone:           jest.fn().mockResolvedValue(undefined),
    markFailed:         jest.fn().mockResolvedValue(undefined),
    incrementTotalSent: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<ICampaignRepository>;

  templateRepo = {
    findById: jest.fn().mockResolvedValue(makeTemplate()),
  } as jest.Mocked<ITemplateRepository>;

  contactRepo = {
    upsertContact:       jest.fn(),
    findById:            jest.fn(),
    findByPhone:         jest.fn(),
    setWhatsappByLeadId: jest.fn().mockResolvedValue(undefined),
    touchLastReplyAt:    jest.fn(),
    trackOutboundSent:   jest.fn().mockResolvedValue(undefined),
    unsubscribeById:     jest.fn(),
    findCampaignBatch:   jest.fn()
      .mockResolvedValueOnce([makeContact()]) // first batch: one contact
      .mockResolvedValueOnce([]),             // second batch: empty (done)
  } as jest.Mocked<IContactRepository>;

  messageRepo = {
    createPending:           jest.fn().mockResolvedValue({ message: makeMessage(), created: true }),
    updateWamid:             jest.fn().mockResolvedValue(undefined),
    updateStatusByWamid:     jest.fn(),
    linkConversationByWamid: jest.fn(),
    updateStatusById:        jest.fn().mockResolvedValue(undefined),
    findById:                jest.fn(),
    scheduleRetry:           jest.fn().mockResolvedValue(undefined),
    claimRetryable:          jest.fn(),
  } as jest.Mocked<IMessageRepository>;

  whatsApp = {
    sendText:     jest.fn(),
    sendTemplate: jest.fn().mockResolvedValue({ wamid: WAMID }),
  } as jest.Mocked<IWhatsAppProvider>;

  useCase = new RunCampaignUseCase(campaignRepo, templateRepo, contactRepo, messageRepo, whatsApp);
  // Bypass rate limiter in tests
  (useCase as unknown as { limiter: { throttle: jest.Mock } }).limiter.throttle =
    jest.fn().mockResolvedValue(undefined);

  process.env.FREQUENCY_CAP_DAYS    = '7';
  process.env.FREQUENCY_CAP_MAX_30D = '3';
});

afterEach(() => jest.resetAllMocks());

// Success path 

describe('success — single contact batch', () => {
  it('marks campaign as running then done', async () => {
    await useCase.execute(CAMPAIGN_ID);
    expect(campaignRepo.markRunning).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(campaignRepo.markDone).toHaveBeenCalledWith(CAMPAIGN_ID, 1);
  });

  it('returns totalSent = 1', async () => {
    const result = await useCase.execute(CAMPAIGN_ID);
    expect(result.totalSent).toBe(1);
  });

  it('sends template with resolved customer_name param', async () => {
    await useCase.execute(CAMPAIGN_ID);
    expect(whatsApp.sendTemplate).toHaveBeenCalledWith(
      PHONE, 'outreach_loja', expect.any(String), { header: { customer_name: 'João Silva' } },
    );
  });

  it('persists wamid after send', async () => {
    await useCase.execute(CAMPAIGN_ID);
    expect(messageRepo.updateWamid).toHaveBeenCalledWith(MSG_ID, WAMID, null);
  });

  it('calls trackOutboundSent', async () => {
    await useCase.execute(CAMPAIGN_ID);
    expect(contactRepo.trackOutboundSent).toHaveBeenCalledWith(CONTACT_ID);
  });

  it('creates pending message with campaignId', async () => {
    await useCase.execute(CAMPAIGN_ID);
    expect(messageRepo.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: CAMPAIGN_ID, contactId: CONTACT_ID }),
    );
  });

  it('increments totalSent after batch', async () => {
    await useCase.execute(CAMPAIGN_ID);
    expect(campaignRepo.incrementTotalSent).toHaveBeenCalledWith(CAMPAIGN_ID, 1);
  });
});

// Already sent (idempotency) 

describe('idempotency — already sent', () => {
  it('skips contact when createPending returns created=false', async () => {
    messageRepo.createPending.mockResolvedValue({ message: makeMessage(), created: false });
    const result = await useCase.execute(CAMPAIGN_ID);
    expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
    expect(result.totalSent).toBe(0);
  });
});

// Frequency cap skip 

describe('frequency cap', () => {
  it('skips contact that reached the send limit', async () => {
    contactRepo.findCampaignBatch
      .mockReset()
      .mockResolvedValueOnce([makeContact({ contactCount30d: 3 })])
      .mockResolvedValueOnce([]);
    const result = await useCase.execute(CAMPAIGN_ID);
    expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
    expect(result.totalSent).toBe(0);
  });

  it('skips unsubscribed contact', async () => {
    contactRepo.findCampaignBatch
      .mockReset()
      .mockResolvedValueOnce([makeContact({ unsubscribed: true })])
      .mockResolvedValueOnce([]);
    await useCase.execute(CAMPAIGN_ID);
    expect(whatsApp.sendTemplate).not.toHaveBeenCalled();
  });
});

// Send failure 

describe('send failure', () => {
  it('schedules retry and continues on transient error', async () => {
    whatsApp.sendTemplate.mockRejectedValue(new Error('Meta 500'));
    const result = await useCase.execute(CAMPAIGN_ID);
    expect(messageRepo.scheduleRetry).toHaveBeenCalled();
    expect(result.totalSent).toBe(0);
    expect(campaignRepo.markDone).toHaveBeenCalledWith(CAMPAIGN_ID, 0);
  });

  it('flags contact whatsapp=false on 131026 error', async () => {
    whatsApp.sendTemplate.mockRejectedValue(new Error('Meta error 131026'));
    await useCase.execute(CAMPAIGN_ID);
    expect(contactRepo.setWhatsappByLeadId).toHaveBeenCalledWith(LEAD_ID, false);
  });
});

// Campaign guard errors 

describe('campaign guard errors', () => {
  it('throws 404 when campaign not found', async () => {
    campaignRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute(CAMPAIGN_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(campaignRepo.markRunning).not.toHaveBeenCalled();
  });

  it('throws 409 when campaign is already running', async () => {
    campaignRepo.findById.mockResolvedValue(makeCampaign({ status: 'running' }));
    await expect(useCase.execute(CAMPAIGN_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 409 when campaign is already done', async () => {
    campaignRepo.findById.mockResolvedValue(makeCampaign({ status: 'done' }));
    await expect(useCase.execute(CAMPAIGN_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when template not found', async () => {
    templateRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute(CAMPAIGN_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when template is inactive', async () => {
    templateRepo.findById.mockResolvedValue(makeTemplate({ active: false }));
    await expect(useCase.execute(CAMPAIGN_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('marks campaign as failed when unexpected error occurs', async () => {
    contactRepo.findCampaignBatch.mockReset().mockRejectedValue(new Error('DB down'));
    await expect(useCase.execute(CAMPAIGN_ID)).rejects.toThrow('DB down');
    expect(campaignRepo.markFailed).toHaveBeenCalledWith(CAMPAIGN_ID, 'DB down');
    expect(campaignRepo.markDone).not.toHaveBeenCalled();
  });
});

// resolveParams 

describe('resolveParams', () => {
  const base = makeContact();

  it('returns header params with customerName for outreach_loja', () => {
    expect(resolveParams('outreach_loja', base)).toEqual({ header: { customer_name: 'João Silva' } });
  });

  it('returns body params with customerName and lastOrder for reativacao_cliente_v1', () => {
    const contact = makeContact({ lastPurchaseAt: new Date('2025-12-01') });
    const result = resolveParams('reativacao_cliente_v1', contact);
    expect(result.header?.customer_name).toBe('João Silva');
    expect(result.body?.last_order).toMatch(/\d{2}\/\d{2}\/\d{4}/); // DD/MM/YYYY
  });

  it('uses "Cliente" when customerName is null', () => {
    expect(resolveParams('outreach_loja', makeContact({ customerName: null }))).toEqual({ header: { customer_name: 'Cliente' } });
  });
});

// deriveClientId 

describe('deriveClientId', () => {
  it('returns a UUID-formatted string', () => {
    const result = deriveClientId(CAMPAIGN_ID, CONTACT_ID);
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('is deterministic', () => {
    expect(deriveClientId(CAMPAIGN_ID, CONTACT_ID)).toBe(deriveClientId(CAMPAIGN_ID, CONTACT_ID));
  });

  it('differs for different contacts', () => {
    expect(deriveClientId(CAMPAIGN_ID, CONTACT_ID)).not.toBe(
      deriveClientId(CAMPAIGN_ID, 'other-contact'),
    );
  });
});
