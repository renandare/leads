// src/infrastructure/repositories/PrismaLeadRepository.ts
// This file implements the ILeadRepository interface using Prisma ORM to manage lead data in a PostgreSQL database.

import { PrismaClient, Prisma } from '@prisma/client';

import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { CreateLeadData } from '@domain/lead/entities/Lead';
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
        processed: false,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }
}
