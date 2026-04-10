// src/application/lead/dtos/NormalizeLeadDTO.ts
// This file defines the data transfer objects (DTOs) for normalizing leads in the application.
import { z } from 'zod';

export const normalizeLeadsSchema = z.object({
  batch_size: z.number().int().min(1).max(200).default(50),
});

export type NormalizeLeadsInput = z.infer<typeof normalizeLeadsSchema>;

export interface NormalizeLeadsOutput {
  normalized: number;
  failed: number;
}
