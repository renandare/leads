// src/domain/contact/repositories/IContactRepository.ts

export interface UpsertContactParams {
  leadId: string;
  phone?: string | null;
  emails: string[];
}

export interface IContactRepository {
  upsertContact(params: UpsertContactParams): Promise<void>;
}
