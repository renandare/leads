// src/application/lead/dtos/EnrichLeadDTO.ts
import { z } from 'zod';

export const enrichLeadsSchema = z.object({
  batch_size: z.number().int().min(1).max(200).default(50),
});

export type EnrichLeadsInput = z.infer<typeof enrichLeadsSchema>;

export interface EnrichLeadsOutput {
  done:         number;
  no_cnpj:      number;
  invalid_cnpj: number;
  failed:       number;
}
