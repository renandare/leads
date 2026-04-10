// src/domain/contact/entities/Contact.ts
// This file defines the Contact entity and related types for the contact management system.

export interface Contact {
  id: string;
  leadId: string;
  phone: string | null;
  email: string[];
  whatsapp: boolean | null;
  preferredChannel: string | null;
  contactType: string | null;
  priority: string | null;
  stage: string;
  score: number;
  priceSensitive: boolean;
  lastContactAt: Date | null;
  lastReplyAt: Date | null;
  contactCount30d: number;
  lastPurchaseAt: Date | null;
  status: string;
  unsubscribed: boolean;
  unsubscribedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContactData {
  leadId: string;
  phone: string | null;
}
