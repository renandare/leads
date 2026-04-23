// src/domain/message/repositories/IMessageRepository.ts

import { Message, CreateMessageData } from '@domain/message/entities/Message';

export interface IMessageRepository {
  
   // Inserts a pending message. Returns { message, created: false } if clientMessageId already exists
  createPending(data: CreateMessageData): Promise<{ message: Message; created: boolean }>;

  // Sets wamid + sentAt on the message record after a successful API send
  updateWamid(id: string, wamid: string, conversationId?: string | null): Promise<void>;

  // Updates message status from a webhook status event. Matched by wamid
  updateStatusByWamid(wamid: string, status: string, errorReason?: string | null): Promise<void>;

  // Links a conversation to a message by wamid (called when webhook brings conversation data)
  linkConversationByWamid(wamid: string, conversationId: string): Promise<void>;

  // Updates message status by its own ID (used when wamid not yet assigned)
  updateStatusById(id: string, status: string, errorReason?: string | null): Promise<void>;

  findById(id: string): Promise<Message | null>;
}
