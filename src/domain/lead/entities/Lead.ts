// src/domain/lead/entities/Lead.ts
// This file defines the Lead entity and related types for the lead management system.

export interface Lead {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  source: string;
  document: string | null;
  website: string | null;
  size: string | null;
  type: string | null;
  enrichmentStatus: string;
  pipelineStage: string;
  processed: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadData {
  source: string;
  pipelineStage?: string;
  website?: string | null;
}

export interface UpdateLeadEnrichedData {
  document?: string | null; // resolved by name search when originally missing
  size: string | null;
  type: string | null;
  enrichmentStatus: string; // 'done' | 'failed' | 'no_cnpj'
  pipelineStage: string;
}
