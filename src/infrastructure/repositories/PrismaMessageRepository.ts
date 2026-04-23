// src/infrastructure/repositories/PrismaMessageRepository.ts

import { PrismaClient, Prisma } from '@prisma/client';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { Message, CreateMessageData } from '@domain/message/entities/Message';

export class PrismaMessageRepository implements IMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createPending(data: CreateMessageData): Promise<{ message: Message; created: boolean }> {
    try {
      const message = await this.prisma.message.create({
        data: {
          contactId:       data.contactId,
          campaignId:      data.campaignId ?? null,
          templateId:      data.templateId ?? null,
          channel:         data.channel,
          body:            data.body ?? null,
          clientMessageId: data.clientMessageId,
          status:          'pending',
        },
      });
      return { message: message as unknown as Message, created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.message.findUnique({
          where: { clientMessageId: data.clientMessageId },
        });
        return { message: existing as unknown as Message, created: false };
      }
      throw err;
    }
  }

  async updateWamid(id: string, wamid: string, conversationId?: string | null): Promise<void> {
    await this.prisma.message.update({
      where: { id },
      data:  {
        wamid,
        status:         'sent',
        sentAt:         new Date(),
        conversationId: conversationId ?? null,
      },
    });
  }

  async updateStatusByWamid(wamid: string, status: string, errorReason?: string | null): Promise<void> {
    await this.prisma.message.updateMany({
      where: { wamid },
      data:  { status, errorReason: errorReason ?? null },
    });
  }

  async linkConversationByWamid(wamid: string, conversationId: string): Promise<void> {
    await this.prisma.message.updateMany({
      where: { wamid, conversationId: null },
      data:  { conversationId },
    });
  }

  async updateStatusById(id: string, status: string, errorReason?: string | null): Promise<void> {
    await this.prisma.message.update({
      where: { id },
      data:  { status, errorReason: errorReason ?? null },
    });
  }

  async findById(id: string): Promise<Message | null> {
    const row = await this.prisma.message.findUnique({ where: { id } });
    return (row as unknown as Message) ?? null;
  }
}
