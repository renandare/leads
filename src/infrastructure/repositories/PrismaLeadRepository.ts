// src/infrastructure/repositories/PrismaLeadRepository.ts
// This file implements the ILeadRepository interface using Prisma ORM to manage lead data in a PostgreSQL database.

import { PrismaClient, Prisma } from '@prisma/client';

import { ExistsDuplicateParams, ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { CreateLeadData, Lead, UpdateLeadNormalizedData } from '@domain/lead/entities/Lead';
import { PipelineStage } from '@domain/lead/enums/PipelineStage';

export class PrismaLeadRepository implements ILeadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findExistingPlaceIds(placeIds: string[]): Promise<Set<string>> {
    if (placeIds.length === 0) return new Set();

    // Query JSONB to check which place_ids already exist in a single query
    const rows = await this.prisma.$queryRaw<Array<{ place_id: string }>>`
      SELECT raw_data->>'place_id' AS place_id
      FROM leads
      WHERE raw_data->>'place_id' = ANY(${placeIds}::text[])
        AND deleted_at IS NULL
    `;

    return new Set(rows.map(r => r.place_id));
  }

  // Create many leads in a single query, skipping duplicates based on unique constraints in the database
  async createMany(leads: CreateLeadData[]): Promise<number> {
    const result = await this.prisma.lead.createMany({
      data: leads.map(lead => ({
        source: lead.source,
        rawData: lead.rawData as Prisma.InputJsonValue,
        pipelineStage: lead.pipelineStage ?? PipelineStage.RAW,
        website: lead.website ?? null,
        processed: false,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  // Find a batch of raw leads that are not yet processed
  async findRawBatch(batchSize: number): Promise<Lead[]> {
    const rows = await this.prisma.lead.findMany({
      where: { pipelineStage: PipelineStage.RAW, processed: false, deletedAt: null },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    return rows as Lead[];
  }

  // Count how many raw leads are pending processing
  async countRaw(): Promise<number> {
    return this.prisma.lead.count({
      where: { pipelineStage: PipelineStage.RAW, processed: false, deletedAt: null },
    });
  }

  // Update a lead with normalized data and mark it as processed
  async updateNormalized(id: string, data: UpdateLeadNormalizedData): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        website: data.website,
        pipelineStage: data.pipelineStage,
        processed: false,
      },
    });
  }

  // Mark a lead as processed without updating normalized fields (used when normalization fails)
  async markProcessed(id: string): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: { processed: true },
    });
  }

  // Get statistics for leads grouped by pipeline stage
  async getStats(): Promise<Record<string, number>> {
    const defaults = Object.fromEntries(Object.values(PipelineStage).map(s => [s, 0]));

    const rows = await this.prisma.lead.groupBy({
      by: ['pipelineStage'],
      where: { deletedAt: null },
      _count: { id: true },
    });

    return { ...defaults, ...Object.fromEntries(rows.map(r => [r.pipelineStage, r._count.id])) };
  }

  // Find a batch of normalized leads not yet processed (for deduplication)
  async findNormalizedBatch(batchSize: number): Promise<Lead[]> {
    const rows = await this.prisma.lead.findMany({
      where: { pipelineStage: PipelineStage.NORMALIZED, processed: false, deletedAt: null },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    return rows as Lead[];
  }

  // Count how many normalized leads are pending deduplication
  async countNormalized(): Promise<number> {
    return this.prisma.lead.count({
      where: { pipelineStage: PipelineStage.NORMALIZED, processed: false, deletedAt: null },
    });
  }

  // Check whether another accepted lead already shares the same phone or place_id
  async existsDuplicate(params: ExistsDuplicateParams): Promise<boolean> {
    const excluded: string[] = [PipelineStage.RAW, PipelineStage.NORMALIZED];

    if (params.phone) {
      const count = await this.prisma.lead.count({
        where: {
          id: { not: params.id },
          phone: params.phone,
          pipelineStage: { notIn: excluded },
          deletedAt: null,
        },
      });
      if (count > 0) return true;
    }

    if (params.document) {
      const count = await this.prisma.lead.count({
        where: {
          id: { not: params.id },
          document: params.document,
          pipelineStage: { notIn: excluded },
          deletedAt: null,
        },
      });
      if (count > 0) return true;
    }

    return false;
  }

  // Update only the pipeline stage and mark the lead as processed
  async updateStage(id: string, stage: string): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: { pipelineStage: stage, processed: false },
    });
  }

  // Soft-delete a duplicate lead by setting deletedAt
  async deleteLead(id: string): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date(), pipelineStage: PipelineStage.DUPLICATE },
    });
  }
}
