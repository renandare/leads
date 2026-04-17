// src/infrastructure/repositories/PrismaLeadRepository.ts

import { PrismaClient } from '@prisma/client';

import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { CreateLeadData, Lead, UpdateLeadEnrichedData } from '@domain/lead/entities/Lead';
import { PipelineStage } from '@domain/lead/enums/PipelineStage';

export class PrismaLeadRepository implements ILeadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Create many leads, skipping duplicates on document (CNPJ unique constraint)
  async createMany(leads: CreateLeadData[]): Promise<number> {
    const result = await this.prisma.lead.createMany({
      data: leads.map(lead => ({
        source: lead.source,
        pipelineStage: lead.pipelineStage ?? PipelineStage.RAW,
        website: lead.website ?? null,
        processed: false,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  // Mark a lead as processed (step failed — skip on next run)
  async markProcessed(id: string): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: { processed: true },
    });
  }

  // Lead counts grouped by pipeline stage
  async getStats(): Promise<Record<string, number>> {
    const defaults = Object.fromEntries(Object.values(PipelineStage).map(s => [s, 0]));

    const rows = await this.prisma.lead.groupBy({
      by: ['pipelineStage'],
      where: { deletedAt: null },
      _count: { id: true },
    });

    return { ...defaults, ...Object.fromEntries(rows.map(r => [r.pipelineStage, r._count.id])) };
  }

  // Freshly imported leads waiting to be enriched
  async findRawBatch(batchSize: number): Promise<Lead[]> {
    const rows = await this.prisma.lead.findMany({
      where: { pipelineStage: PipelineStage.RAW, processed: false, deletedAt: null },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });
    return rows as Lead[];
  }

  async countRaw(): Promise<number> {
    return this.prisma.lead.count({
      where: { pipelineStage: PipelineStage.RAW, processed: false, deletedAt: null },
    });
  }

  // Update lead with enrichment results
  async updateEnriched(id: string, data: UpdateLeadEnrichedData): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: {
        ...(data.document !== undefined && { document: data.document }),
        size: data.size,
        type: data.type,
        enrichmentStatus: data.enrichmentStatus,
        pipelineStage: data.pipelineStage,
        processed: false,
      },
    });
  }

  // Leads already enriched but with enrichmentStatus != 'done' and a known document — 2nd pass
  async findDocumentedEnrichedBatch(batchSize: number): Promise<Lead[]> {
    const rows = await this.prisma.lead.findMany({
      where: {
        pipelineStage: PipelineStage.ENRICHED,
        enrichmentStatus: { not: 'done' },
        document: { not: null },
        processed: false,
        deletedAt: null,
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });
    return rows as Lead[];
  }
}
