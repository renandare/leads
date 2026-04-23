// src/domain/interaction/entities/Interaction.ts

export interface Interaction {
  id: string;
  contactId: string;
  messageId: string | null;
  orderId: string | null;
  metaMessageId: string | null;
  type: string;
  classification: string | null;
  content: string | null;
  createdAt: Date;
}

export interface CreateInteractionData {
  contactId: string;
  messageId?: string | null;
  metaMessageId?: string | null;
  type: string;
  classification?: string | null;
  content?: string | null;
}
