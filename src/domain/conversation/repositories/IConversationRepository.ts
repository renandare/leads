// src/domain/conversation/repositories/IConversationRepository.ts

import { Conversation, UpsertConversationData } from '@domain/conversation/entities/Conversation';

export interface IConversationRepository {
  // Returns the open (non-expired) conversation for a contact, or null.
  findOpenByContactId(contactId: string): Promise<Conversation | null>;

  // Creates or updates the conversation record for a contact. Matched by contactId + metaConversationId.
  upsert(data: UpsertConversationData): Promise<Conversation>;

  // Updates lastMessageAt to now on the given conversation.
  touchLastMessageAt(id: string): Promise<void>;
}
