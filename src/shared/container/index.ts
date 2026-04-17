import { prisma } from '@infrastructure/database/prisma/client';
import { PrismaLeadRepository } from '@infrastructure/repositories/PrismaLeadRepository';
import { PrismaContactRepository } from '@infrastructure/repositories/PrismaContactRepository';
import { CnpjService } from '@infrastructure/services/cnpj/CnpjService';
import { EnrichLeadsUseCase } from '@application/lead/use-cases/EnrichLeadsUseCase';
import { LeadController } from '@infrastructure/http/controllers/LeadController';
import { JobController } from '@infrastructure/http/controllers/JobController';

const leadRepository = new PrismaLeadRepository(prisma);
const contactRepository = new PrismaContactRepository(prisma);
const cnpjService = new CnpjService();

const enrichLeadsUseCase = new EnrichLeadsUseCase(leadRepository, contactRepository, cnpjService);

const leadController = new LeadController(enrichLeadsUseCase, leadRepository);
const jobController = new JobController();

export const container = {
  leadController,
  jobController,
};
