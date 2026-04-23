// src/domain/conversation/entities/Conversation.ts

export interface Conversation {
  id: string;
  contactId: string;
  metaConversationId: string;
  origin: string; // user_initiated | business_initiated | referral_conversion
  expiresAt: Date;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertConversationData {
  contactId: string;
  metaConversationId: string;
  origin: string;
  expiresAt: Date;
}
