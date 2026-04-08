// src/domain/lead/enums/PipelineStage.ts

export enum PipelineStage {
  RAW = 'raw',
  NORMALIZED = 'normalized',
  DEDUPLICATED = 'deduplicated',
  ENRICHED = 'enriched',
  CLASSIFIED = 'classified',
  VALIDATED = 'validated',
  DUPLICATE = 'duplicate',
}
