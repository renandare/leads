// src/infrastructure/repositories/PrismaConversationRepository.ts

import { PrismaClient } from '@prisma/client';
import { IConversationRepository } from '@domain/conversation/repositories/IConversationRepository';
import { Conversation, UpsertConversationData } from '@domain/conversation/entities/Conversation';

export class PrismaConversationRepository implements IConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOpenByContactId(contactId: string): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findFirst({
      where: {
        contactId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });
    return row ?? null;
  }

  async upsert(data: UpsertConversationData): Promise<Conversation> {
    // Update existing conversation for this contact+metaConversationId pair, or create new.
    const existing = await this.prisma.conversation.findFirst({
      where: { contactId: data.contactId, metaConversationId: data.metaConversationId },
    });

    if (existing) {
      return this.prisma.conversation.update({
        where: { id: existing.id },
        data: {
          origin:    data.origin,
          expiresAt: data.expiresAt,
        },
      });
    }

    return this.prisma.conversation.create({ data });
  }

  async touchLastMessageAt(id: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data:  { lastMessageAt: new Date() },
    });
  }
}
