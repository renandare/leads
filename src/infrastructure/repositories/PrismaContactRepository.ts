// src/infrastructure/repositories/PrismaContactRepository.ts
// This file implements the PrismaContactRepository for managing contact data using Prisma.

import { PrismaClient, Prisma } from '@prisma/client';

import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { CreateContactData } from '@domain/contact/entities/Contact';

export class PrismaContactRepository implements IContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createIfNotDuplicate(data: CreateContactData): Promise<{ created: boolean }> {
    try {
      await this.prisma.contact.create({
        data: {
          leadId: data.leadId,
          phone: data.phone,
        },
      });
      return { created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { created: false };
      }
      throw err;
    }
  }
}
