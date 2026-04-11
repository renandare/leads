// src/application/lead/dtos/DeduplicateLeadDTO.ts
import { z } from 'zod';

export const deduplicateLeadsSchema = z.object({
  batch_size: z.number().int().min(1).max(200).default(50),
});

export type DeduplicateLeadsInput = z.infer<typeof deduplicateLeadsSchema>;

export interface DeduplicateLeadsOutput {
  deduplicated: number;
  duplicates: number;
  failed: number;
}
