// src/infrastructure/repositories/PrismaCampaignRepository.ts

import { PrismaClient } from '@prisma/client';
import { ICampaignRepository, CreateCampaignData } from '@domain/campaign/repositories/ICampaignRepository';
import { Campaign } from '@domain/campaign/entities/Campaign';

export class PrismaCampaignRepository implements ICampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Creates a new campaign with status 'queued'
  async create(data: CreateCampaignData): Promise<Campaign> {
    const row = await this.prisma.campaign.create({
      data: {
        name:       data.name,
        templateId: data.templateId,
        segment:    data.segment,
        status:     'queued',
      },
    });
    return row as unknown as Campaign;
  }

  // Finds a campaign by ID, returns null if not found
  async findById(id: string): Promise<Campaign | null> {
    const row = await this.prisma.campaign.findUnique({ where: { id } });
    return (row as unknown as Campaign) ?? null;
  }

  // Lists all non-deleted campaigns
  async list(): Promise<Campaign[]> {
    const rows = await this.prisma.campaign.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows as unknown as Campaign[];
  }

  // Marks a campaign as running and sets the start time
  async markRunning(id: string): Promise<void> {
    await this.prisma.campaign.update({
      where: { id },
      data:  { status: 'running', startAt: new Date() },
    });
  }

  // Marks a campaign as done
  async markDone(id: string, totalSent: number): Promise<void> {
    await this.prisma.campaign.update({
      where: { id },
      data:  { status: 'done', totalSent, finishedAt: new Date() },
    });
  }

  // Marks a campaign as failed with a reason
  async markFailed(id: string, reason: string): Promise<void> {
    await this.prisma.campaign.update({
      where: { id },
      data:  { status: 'failed', finishedAt: new Date() },
    });
    // Log reason separately since Campaign schema has no errorReason column.
    void reason;
  }

  // Increments the totalSent count for a campaign
  async incrementTotalSent(id: string, by: number): Promise<void> {
    await this.prisma.campaign.update({
      where: { id },
      data:  { totalSent: { increment: by } },
    });
  }
}
