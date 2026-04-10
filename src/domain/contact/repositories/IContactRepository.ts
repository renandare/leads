// src/domain/contact/repositories/IContactRepository.ts
// This file defines the IContactRepository interface for managing contact data in the system.

import { CreateContactData } from '../entities/Contact';

export interface IContactRepository {
  // Creates a contact; returns { created: false } silently if the phone already exists (P2002)
  createIfNotDuplicate(data: CreateContactData): Promise<{ created: boolean }>;
}
