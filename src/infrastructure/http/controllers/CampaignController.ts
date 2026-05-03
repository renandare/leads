// src/infrastructure/http/controllers/CampaignController.ts

import { Request, Response } from 'express';
import { CreateCampaignUseCase } from '@application/campaign/use-cases/CreateCampaignUseCase';
import { RunCampaignUseCase } from '@application/campaign/use-cases/RunCampaignUseCase';
import { ICampaignRepository } from '@domain/campaign/repositories/ICampaignRepository';
import { CreateCampaignSchema } from '@application/campaign/dtos/CampaignDTO';
import { runInBackground } from '@shared/jobs/backgroundRunner';
import { AppError } from '@shared/errors/AppError';

export class CampaignController {
  constructor(
    private readonly createUseCase:  CreateCampaignUseCase,
    private readonly runUseCase:     RunCampaignUseCase,
    private readonly campaignRepo:   ICampaignRepository,
  ) {}

  // create a new campaign with status 'queued'
  create = async (req: Request, res: Response): Promise<void> => {
    const input    = CreateCampaignSchema.parse(req.body);
    const campaign = await this.createUseCase.execute(input);
    res.status(201).json(campaign);
  };

  // trigger campaign execution in background, return 202 with jobId
  run = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id) throw new AppError('Campaign id is required', 400);

    const jobId = runInBackground(`campaign:run:${id}`, () =>
      this.runUseCase.execute(id),
    );

    res.status(202).json({ jobId, campaignId: id });
  };

  // return all campaign marked as running and send messages
  list = async (_req: Request, res: Response): Promise<void> => {
    const campaigns = await this.campaignRepo.list();
    res.json(campaigns);
  };

  // get campaign status by id
  get = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const campaign = await this.campaignRepo.findById(id!);
    if (!campaign) throw new AppError('Campaign not found', 404);
    res.json(campaign);
  };
}
