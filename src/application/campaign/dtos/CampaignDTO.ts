// src/application/campaign/dtos/CampaignDTO.ts

import { z } from 'zod';

export const VALID_SEGMENTS = [
  'all', 
  'new', 
  'cold', 
  'reactivation', 
  'engaged',
  'core_eletrica', 
  'core_engenharia', 
  'core_construcao',
  'parceria_obra', 
  'condominio'
] as const;

export type CampaignSegment = typeof VALID_SEGMENTS[number];

export const CreateCampaignSchema = z.object({
  name:       z.string().min(1).max(100),
  templateId: z.number().int().positive(),
  segment:    z.enum(VALID_SEGMENTS),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
