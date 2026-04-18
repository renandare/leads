// src/domain/lead/enums/EnrichmentStatus.ts

export enum EnrichmentStatus {
  PENDING      = 'pending',      // default — not yet processed
  DONE         = 'done',         // successfully enriched
  NO_CNPJ      = 'no_cnpj',      // lead has no document field
  INVALID_CNPJ = 'invalid_cnpj', // 404 or ERROR from API — CNPJ inactive/non-existent
  FAILED       = 'failed',       // reserved: set when retry_count reaches max
}
