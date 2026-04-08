// src/domain/lead/repositories/ILeadRepository.ts
// This file defines the ILeadRepository interface for managing lead data in the system.

import { CreateLeadData } from '../entities/Lead';

export interface ILeadRepository {
  findExistingPlaceIds(placeIds: string[]): Promise<Set<string>>;
  createMany(leads: CreateLeadData[]): Promise<number>;
}
