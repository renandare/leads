// src/infrastructure/repositories/PrismaInteractionRepository.ts

import { PrismaClient } from '@prisma/client';
import { IInteractionRepository } from '@domain/interaction/repositories/IInteractionRepository';
import { CreateInteractionData } from '@domain/interaction/entities/Interaction';

export class PrismaInteractionRepository implements IInteractionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateInteractionData): Promise<void> {
    await this.prisma.interaction.create({
      data: {
        contactId:     data.contactId,
        messageId:     data.messageId ?? null,
        metaMessageId: data.metaMessageId ?? null,
        type:          data.type,
        classification: data.classification ?? null,
        content:       data.content ?? null,
      },
    });
  }

  async existsByMetaMessageId(metaMessageId: string): Promise<boolean> {
    const count = await this.prisma.interaction.count({
      where: { metaMessageId },
    });
    return count > 0;
  }
}
