// src/infrastructure/repositories/PrismaMessageRepository.ts

import { PrismaClient, Prisma } from '@prisma/client';
import { IMessageRepository } from '@domain/message/repositories/IMessageRepository';
import { Message, CreateMessageData } from '@domain/message/entities/Message';

export class PrismaMessageRepository implements IMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Creates a new message with status 'pending'
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

  // Update the wamid and mark the message as sent
  async updateWamid(id: string, wamid: string, conversationId?: string | null): Promise<void> {
    await this.prisma.message.update({
      where: { id },
      data:  {
        wamid,
        status:         'sent',
        sentAt:         new Date(),
        conversationId: conversationId ?? null,
        lockedAt:       null,
      },
    });
  }

  // Update the status of messages by wamid
  async updateStatusByWamid(wamid: string, status: string, errorReason?: string | null): Promise<void> {
    await this.prisma.message.updateMany({
      where: { wamid },
      data:  { status, errorReason: errorReason ?? null },
    });
  }

  // Link a conversation to messages by wamid
  async linkConversationByWamid(wamid: string, conversationId: string): Promise<void> {
    await this.prisma.message.updateMany({
      where: { wamid, conversationId: null },
      data:  { conversationId },
    });
  }

  // Update the status of a message by its ID
  async updateStatusById(id: string, status: string, errorReason?: string | null): Promise<void> {
    await this.prisma.message.update({
      where: { id },
      data:  { status, errorReason: errorReason ?? null, lockedAt: null },
    });
  }

  // Find a message by its ID
  async findById(id: string): Promise<Message | null> {
    const row = await this.prisma.message.findUnique({ where: { id } });
    return (row as unknown as Message) ?? null;
  }

  // Schedule a retry for a message
  async scheduleRetry(id: string, retryAfter: Date): Promise<void> {
    await this.prisma.message.update({
      where: { id },
      data:  {
        retryAfter,
        lockedAt: null,
        retryCount: { increment: 1 },
      },
    });
  }

  async claimRetryable(limit: number): Promise<Message[]> {
    // FOR UPDATE SKIP LOCKED is not supported by Prisma use raw SQL for that
    const rows = await this.prisma.$queryRaw<Message[]>(Prisma.sql`
      WITH claimed AS (
        SELECT id FROM messages
        WHERE  status      = 'pending'
          AND  retry_after IS NOT NULL
          AND  retry_after <= now()
          AND  locked_at   IS NULL
        LIMIT  ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE messages
      SET    locked_at = now()
      WHERE  id IN (SELECT id FROM claimed)
      RETURNING
        id, contact_id AS "contactId", campaign_id AS "campaignId",
        template_id AS "templateId", channel, status, wamid,
        client_message_id AS "clientMessageId", body,
        conversation_id AS "conversationId",
        retry_count AS "retryCount", retry_after AS "retryAfter",
        locked_at AS "lockedAt", sent_at AS "sentAt",
        error_reason AS "errorReason", deleted_at AS "deletedAt",
        created_at AS "createdAt"
    `);
    return rows;
  }
}
