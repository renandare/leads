// src/domain/lead/repositories/ILeadRepository.ts

import { CreateLeadData, Lead, UpdateLeadEnrichedData } from '../entities/Lead';

export interface ILeadRepository {
  createMany(leads: CreateLeadData[]): Promise<number>;
  getStats(): Promise<Record<string, number>>;
  countRaw(): Promise<number>;

  // Total leads eligible for enrich: RAW + ENRICHED with document and non-terminal status.
  // Used by the controller to detect if there is work before dispatching a job.
  countPendingEnrich(): Promise<number>;

  // Atomically claims a batch of raw leads for processing (sets processing = true).
  // Uses FOR UPDATE SKIP LOCKED so concurrent callers never get the same lead.
  claimRawBatch(batchSize: number): Promise<Lead[]>;

  // Atomically claims enriched leads with a document but enrichmentStatus != terminal (2nd-pass retry).
  claimDocumentedEnrichedBatch(batchSize: number): Promise<Lead[]>;

  // Releases claims older than `olderThanMinutes` — recovery for stuck/crashed jobs.
  releaseStuckClaims(olderThanMinutes: number): Promise<number>;

  // Updates lead with enrichment results and releases its claim (sets processing = false).
  // Always clears retryCount and lastError.
  updateEnriched(id: string, data: UpdateLeadEnrichedData): Promise<void>;

  // Increments retry_count (capped at 3 via LEAST), records last error, and releases claim.
  incrementRetry(id: string, lastError: string): Promise<void>;

  // Releases claims for a batch of leads in a single UPDATE — used on bail to free all remaining leads.
  releaseProcessingBatch(ids: string[]): Promise<void>;
}
