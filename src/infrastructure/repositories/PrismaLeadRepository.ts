// src/infrastructure/repositories/PrismaLeadRepository.ts

import { PrismaClient } from '@prisma/client';

import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { CreateLeadData, Lead, UpdateLeadEnrichedData } from '@domain/lead/entities/Lead';
import { PipelineStage } from '@domain/lead/enums/PipelineStage';
import { EnrichmentStatus } from '@domain/lead/enums/EnrichmentStatus';

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

  // Raw leads eligible for enrichment (excludes currently claimed and exhausted retries)
  async countRaw(): Promise<number> {
    return this.prisma.lead.count({
      where: {
        pipelineStage: PipelineStage.RAW,
        processing: false,
        deletedAt: null,
        retryCount: { lt: 3 },
      },
    });
  }

  // Total leads eligible for enrich: RAW + ENRICHED with document and non-terminal status.
  async countPendingEnrich(): Promise<number> {
    const terminal = [EnrichmentStatus.DONE, EnrichmentStatus.INVALID_CNPJ, EnrichmentStatus.NO_CNPJ];
    const base = { processing: false, deletedAt: null, retryCount: { lt: 3 } };

    const [raw, enriched] = await Promise.all([
      this.prisma.lead.count({ where: { pipelineStage: PipelineStage.RAW, ...base } }),
      this.prisma.lead.count({
        where: {
          pipelineStage:    PipelineStage.ENRICHED,
          document:         { not: null },
          enrichmentStatus: { notIn: terminal },
          ...base,
        },
      }),
    ]);

    return raw + enriched;
  }

  // Atomically claims a batch of raw leads — sets processing = true via FOR UPDATE SKIP LOCKED.
  // Two-step: short raw SQL claim returns IDs, then ORM fetches full rows by those IDs.
  async claimRawBatch(batchSize: number): Promise<Lead[]> {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE leads
      SET processing = true, processing_started_at = NOW()
      WHERE id IN (
        SELECT id FROM leads
        WHERE pipeline_stage = ${PipelineStage.RAW}
          AND processing = false
          AND retry_count < 3
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;

    if (claimed.length === 0) return [];

    const ids = claimed.map(r => r.id);
    const rows = await this.prisma.lead.findMany({ where: { id: { in: ids } } });
    return rows as Lead[];
  }

  // Atomically claims enriched leads with a known document but enrichmentStatus != terminal (2nd pass).
  async claimDocumentedEnrichedBatch(batchSize: number): Promise<Lead[]> {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE leads
      SET processing = true, processing_started_at = NOW()
      WHERE id IN (
        SELECT id FROM leads
        WHERE pipeline_stage = ${PipelineStage.ENRICHED}
          AND enrichment_status NOT IN (
            ${EnrichmentStatus.DONE},
            ${EnrichmentStatus.INVALID_CNPJ},
            ${EnrichmentStatus.NO_CNPJ}
          )
          AND document IS NOT NULL
          AND processing = false
          AND retry_count < 3
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;

    if (claimed.length === 0) return [];

    const ids = claimed.map(r => r.id);
    const rows = await this.prisma.lead.findMany({ where: { id: { in: ids } } });
    return rows as Lead[];
  }

  // Releases claims older than `olderThanMinutes` — recovery for stuck/crashed jobs.
  // Returns the number of leads released.
  async releaseStuckClaims(olderThanMinutes: number): Promise<number> {
    const result = await this.prisma.$executeRaw`
      UPDATE leads
      SET processing = false, processing_started_at = NULL
      WHERE processing = true
        AND processing_started_at < NOW() - (${olderThanMinutes} || ' minutes')::INTERVAL
    `;
    return result;
  }

  // Updates lead with enrichment results and releases its claim.
  // Always clears retryCount and lastError — called only on terminal outcomes.
  async updateEnriched(id: string, data: UpdateLeadEnrichedData): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: {
        ...(data.document  !== undefined && { document:  data.document  }),
        ...(data.name      !== undefined && { name:      data.name      }),
        ...(data.tradeName !== undefined && { tradeName: data.tradeName }),
        ...(data.address   !== undefined && { address:   data.address   }),
        ...(data.city      !== undefined && { city:      data.city      }),
        ...(data.state     !== undefined && { state:     data.state     }),
        ...(data.size      !== undefined && { size:      data.size      }),
        ...(data.type      !== undefined && { type:      data.type      }),
        enrichmentStatus:    data.enrichmentStatus,
        pipelineStage:       data.pipelineStage,
        processing:          false,
        processingStartedAt: null,
        processed:           false,
        retryCount:          0,
        lastError:           null,
      },
    });
  }

  // Increments retry_count (capped at 3 via LEAST), records last error, and releases claim.
  async incrementRetry(id: string, lastError: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE leads
      SET retry_count           = LEAST(retry_count + 1, 3),
          last_error            = ${lastError},
          processing            = false,
          processing_started_at = NULL
      WHERE id = ${id}::uuid
    `;
  }

  // Releases claims for a batch of leads in a single UPDATE — used on bail to free all remaining leads.
  async releaseProcessingBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.$executeRaw`
      UPDATE leads SET processing = false, processing_started_at = NULL
      WHERE id = ANY(${ids}::uuid[])
    `;
  }
}
