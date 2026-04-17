// src/domain/lead/repositories/ILeadRepository.ts

import { CreateLeadData, Lead, UpdateLeadEnrichedData } from '../entities/Lead';

export interface ILeadRepository {
  createMany(leads: CreateLeadData[]): Promise<number>;
  markProcessed(id: string): Promise<void>;
  getStats(): Promise<Record<string, number>>;
  findRawBatch(batchSize: number): Promise<Lead[]>;
  countRaw(): Promise<number>;
  updateEnriched(id: string, data: UpdateLeadEnrichedData): Promise<void>;
  findDocumentedEnrichedBatch(batchSize: number): Promise<Lead[]>;
}
