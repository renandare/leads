// src/domain/lead/repositories/ILeadRepository.ts
// This file defines the ILeadRepository interface for managing lead data in the system.

import { CreateLeadData, Lead, UpdateLeadNormalizedData } from '../entities/Lead';

export interface ExistsDuplicateParams {
  id: string;
  phone: string | null;
  document: string | null;
}

export interface ILeadRepository {
  findExistingPlaceIds(placeIds: string[]): Promise<Set<string>>;
  createMany(leads: CreateLeadData[]): Promise<number>;
  findRawBatch(batchSize: number): Promise<Lead[]>;
  countRaw(): Promise<number>;
  updateNormalized(id: string, data: UpdateLeadNormalizedData): Promise<void>;
  markProcessed(id: string): Promise<void>;
  getStats(): Promise<Record<string, number>>;
  findNormalizedBatch(batchSize: number): Promise<Lead[]>;
  countNormalized(): Promise<number>;
  existsDuplicate(params: ExistsDuplicateParams): Promise<boolean>;
  updateStage(id: string, stage: string): Promise<void>;
  deleteLead(id: string): Promise<void>;
}
