// src/infrastructure/repositories/PrismaContactRepository.ts

import { PrismaClient, Prisma } from '@prisma/client';

import { IContactRepository, UpsertContactParams } from '@domain/contact/repositories/IContactRepository';

export class PrismaContactRepository implements IContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Upserts a contact for the given lead.
  // Phone: keeps existing value if already set (receita_federal data is less reliable than
  //        a previously verified number). Only sets from CNPJ when contact has no phone yet.
  // Emails: always merges unique values.
  async upsertContact(params: UpsertContactParams): Promise<void> {
    const existing = await this.prisma.contact.findFirst({
      where: { leadId: params.leadId },
      select: { id: true, phone: true, email: true },
    });

    const phoneToSet = existing?.phone ?? params.phone ?? null;
    const merged = [...new Set([...(existing?.email ?? []), ...params.emails])];

    if (existing) {
      try {
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: { phone: phoneToSet, email: merged },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Phone already belongs to another contact — skip phone, update only emails
          await this.prisma.contact.update({
            where: { id: existing.id },
            data: { email: merged },
          });
        } else {
          throw err;
        }
      }
    } else {
      try {
        await this.prisma.contact.create({
          data: { leadId: params.leadId, phone: params.phone ?? null, email: merged },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Phone already belongs to another contact — create without phone
          await this.prisma.contact.create({
            data: { leadId: params.leadId, phone: null, email: merged },
          });
        } else {
          throw err;
        }
      }
    }
  }
}
