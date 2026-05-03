// src/application/campaign/use-cases/CreateCampaignUseCase.ts

import { ICampaignRepository } from '@domain/campaign/repositories/ICampaignRepository';
import { ITemplateRepository } from '@domain/template/repositories/ITemplateRepository';
import { Campaign } from '@domain/campaign/entities/Campaign';
import { AppError } from '@shared/errors/AppError';
import { CreateCampaignInput } from '../dtos/CampaignDTO';

export class CreateCampaignUseCase {
  constructor(
    private readonly campaignRepo:  ICampaignRepository,
    private readonly templateRepo:  ITemplateRepository,
  ) {}

  // Validates input and creates a new campaign with status 'queued'
  async execute(input: CreateCampaignInput): Promise<Campaign> {
    const template = await this.templateRepo.findById(input.templateId);
    if (!template)        throw new AppError('Template not found', 404);
    if (!template.active) throw new AppError('Template is inactive', 409);
    if (template.channel !== 'whatsapp') throw new AppError('Template channel must be whatsapp', 422);

    return this.campaignRepo.create({
      name:       input.name,
      templateId: input.templateId,
      segment:    input.segment,
    });
  }
}
