// src/domain/lead/entities/Lead.ts

export interface Lead {
  id: string;
  name: string | null;
  tradeName: string | null;
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
  retryCount: number;
  lastError: string | null;
  processing: boolean;
  processingStartedAt: Date | null;
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
  document?: string | null;
  name?: string;
  tradeName?: string | null;
  address?: string;
  city?: string;
  state?: string;
  size?: string | null;
  type?: string | null;
  enrichmentStatus: string;
  pipelineStage: string;
}
