// src/infrastructure/repositories/PrismaTemplateRepository.ts

import { PrismaClient } from '@prisma/client';
import { ITemplateRepository, TemplateInfo } from '@domain/template/repositories/ITemplateRepository';

export class PrismaTemplateRepository implements ITemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: number): Promise<TemplateInfo | null> {
    return this.prisma.templateMessage.findUnique({
      where:  { id },
      select: { id: true, name: true, channel: true, active: true },
    });
  }
}
