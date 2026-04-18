// src/domain/contact/repositories/IContactRepository.ts

export interface IContactRepository {
  // Creates or updates the single contact for a lead.
  // All fields are diff-only — only written when value differs from what is stored.
  upsertContact(
    leadId:   string,
    phone:    string | null,
    isMobile: boolean,
    email:    string | null,
  ): Promise<void>;
}
