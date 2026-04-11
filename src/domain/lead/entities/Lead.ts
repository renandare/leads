// src/domain/lead/entities/Lead.ts
// This file defines the Lead entity and related types for the lead management system.

export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  source: string;
  document: string | null;
  website: string | null;
  size: string | null;
  type: string | null;
  rawData: unknown;
  enrichmentStatus: string;
  pipelineStage: string;
  processed: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadData {
  source: string;
  rawData: unknown;
  pipelineStage?: string;
  website?: string | null;
}

export interface UpdateLeadNormalizedData {
  name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pipelineStage: string;
}
