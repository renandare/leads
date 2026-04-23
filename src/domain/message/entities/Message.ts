// src/domain/message/entities/Message.ts

export interface Message {
  id: string;
  contactId: string;
  campaignId: string | null;
  templateId: number | null;
  channel: string;
  status: string;
  wamid: string | null;
  clientMessageId: string | null;
  body: string | null;
  conversationId: string | null;
  retryCount: number;
  retryAfter: Date | null;
  lockedAt: Date | null;
  sentAt: Date | null;
  errorReason: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface CreateMessageData {
  contactId: string;
  campaignId?: string | null;
  templateId?: number | null;
  channel: string;
  body?: string | null;
  clientMessageId: string;
}
