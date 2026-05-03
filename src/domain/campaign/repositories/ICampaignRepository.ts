// src/domain/campaign/repositories/ICampaignRepository.ts

import { Campaign } from '@domain/campaign/entities/Campaign';

export interface CreateCampaignData {
  name: string;
  templateId: number;
  segment: string;
}

// Interface for Campaign repository
export interface ICampaignRepository {
  create(data: CreateCampaignData): Promise<Campaign>;
  findById(id: string): Promise<Campaign | null>;
  list(): Promise<Campaign[]>;
  markRunning(id: string): Promise<void>;
  markDone(id: string, totalSent: number): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  incrementTotalSent(id: string, by: number): Promise<void>;
}
