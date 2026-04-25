// src/domain/contact/repositories/IContactRepository.ts

import { Contact } from '@domain/contact/entities/Contact';

export interface IContactRepository {
  // Creates or updates the single contact for a lead.
  // All fields are diff-only, only written when value differs from what is stored.
  upsertContact(
    leadId:   string,
    phone:    string | null,
    isMobile: boolean,
    email:    string | null,
  ): Promise<void>;

  findById(id: string): Promise<Contact | null>;

  // Finds a contact by its phone number
  findByPhone(phone: string): Promise<Contact | null>;

  // Sets contacts.whatsapp for the contact belonging to the given lead.
  setWhatsappByLeadId(leadId: string, whatsapp: boolean): Promise<void>;

  // Sets lastReplyAt = now() on the contact.
  touchLastReplyAt(id: string): Promise<void>;

  // Sets lastContactAt = now() and increments contactCount30d.
  // Called after every successful outbound send.
  trackOutboundSent(id: string): Promise<void>;
}
