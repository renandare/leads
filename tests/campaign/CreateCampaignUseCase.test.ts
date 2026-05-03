// tests/campaign/CreateCampaignUseCase.test.ts

import { CreateCampaignUseCase } from '@application/campaign/use-cases/CreateCampaignUseCase';
import { ICampaignRepository } from '@domain/campaign/repositories/ICampaignRepository';
import { ITemplateRepository, TemplateInfo } from '@domain/template/repositories/ITemplateRepository';
import { Campaign } from '@domain/campaign/entities/Campaign';

// Factories 

const CAMPAIGN_ID  = 'campaign-uuid-1';
const TEMPLATE_ID  = 1;

function makeTemplate(overrides: Partial<TemplateInfo> = {}): TemplateInfo {
  return { id: TEMPLATE_ID, name: 'outreach_loja', channel: 'whatsapp', active: true, ...overrides };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID, name: 'Test Campaign', templateId: TEMPLATE_ID, segment: 'new',
    status: 'queued', startAt: null, finishedAt: null, totalSent: 0,
    deletedAt: null, createdAt: new Date(),
    ...overrides,
  };
}

// Setup 

let campaignRepo:  jest.Mocked<ICampaignRepository>;
let templateRepo:  jest.Mocked<ITemplateRepository>;
let useCase:       CreateCampaignUseCase;

beforeEach(() => {
  campaignRepo = {
    create:            jest.fn().mockResolvedValue(makeCampaign()),
    findById:          jest.fn(),
    list:              jest.fn(),
    markRunning:       jest.fn(),
    markDone:          jest.fn(),
    markFailed:        jest.fn(),
    incrementTotalSent: jest.fn(),
  } as jest.Mocked<ICampaignRepository>;

  templateRepo = {
    findById: jest.fn().mockResolvedValue(makeTemplate()),
  } as jest.Mocked<ITemplateRepository>;

  useCase = new CreateCampaignUseCase(campaignRepo, templateRepo);
});

afterEach(() => jest.resetAllMocks());

// Success 

describe('success', () => {
  it('creates campaign with correct data', async () => {
    const result = await useCase.execute({ name: 'Test Campaign', templateId: 1, segment: 'new' });
    expect(campaignRepo.create).toHaveBeenCalledWith({ name: 'Test Campaign', templateId: 1, segment: 'new' });
    expect(result.id).toBe(CAMPAIGN_ID);
  });

  it('returns the created campaign', async () => {
    const result = await useCase.execute({ name: 'Test Campaign', templateId: 1, segment: 'new' });
    expect(result.status).toBe('queued');
    expect(result.totalSent).toBe(0);
  });
});

// Validation 

describe('validation', () => {
  it('throws 404 when template not found', async () => {
    templateRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute({ name: 'T', templateId: 99, segment: 'all' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(campaignRepo.create).not.toHaveBeenCalled();
  });

  it('throws 409 when template is inactive', async () => {
    templateRepo.findById.mockResolvedValue(makeTemplate({ active: false }));
    await expect(useCase.execute({ name: 'T', templateId: 1, segment: 'all' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 422 when template channel is not whatsapp', async () => {
    templateRepo.findById.mockResolvedValue(makeTemplate({ channel: 'email' }));
    await expect(useCase.execute({ name: 'T', templateId: 1, segment: 'all' }))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
