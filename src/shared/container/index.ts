// src/shared/container/index.ts

import { prisma } from '@infrastructure/database/prisma/client';
import { PrismaLeadRepository } from '@infrastructure/repositories/PrismaLeadRepository';
import { PrismaContactRepository } from '@infrastructure/repositories/PrismaContactRepository';
import { PrismaMessageRepository } from '@infrastructure/repositories/PrismaMessageRepository';
import { PrismaConversationRepository } from '@infrastructure/repositories/PrismaConversationRepository';
import { PrismaInteractionRepository } from '@infrastructure/repositories/PrismaInteractionRepository';
import { CnpjService } from '@infrastructure/services/cnpj/CnpjService';
import { WhatsAppProvider } from '@infrastructure/services/whatsapp/WhatsAppProvider';
import { EnrichLeadsUseCase } from '@application/lead/use-cases/EnrichLeadsUseCase';
import { SendTemplateUseCase } from '@application/message/use-cases/SendTemplateUseCase';
import { SendTextUseCase } from '@application/message/use-cases/SendTextUseCase';
import { RetryWorker } from '@application/message/RetryWorker';
import { WebhookProcessor } from '@application/webhook/WebhookProcessor';
import { LeadController } from '@infrastructure/http/controllers/LeadController';
import { JobController } from '@infrastructure/http/controllers/JobController';
import { WebhookController } from '@infrastructure/http/controllers/WebhookController';
import { MessageController } from '@infrastructure/http/controllers/MessageController';

const leadRepository         = new PrismaLeadRepository(prisma);
const contactRepository      = new PrismaContactRepository(prisma);
const messageRepository      = new PrismaMessageRepository(prisma);
const conversationRepository = new PrismaConversationRepository(prisma);
const interactionRepository  = new PrismaInteractionRepository(prisma);

const cnpjService      = new CnpjService();
const whatsAppProvider = new WhatsAppProvider();

const enrichLeadsUseCase = new EnrichLeadsUseCase(
  leadRepository,
  contactRepository,
  cnpjService,
);

const sendTemplateUseCase = new SendTemplateUseCase(
  contactRepository,
  messageRepository,
  conversationRepository,
  whatsAppProvider,
);

const sendTextUseCase = new SendTextUseCase(
  contactRepository,
  messageRepository,
  conversationRepository,
  whatsAppProvider,
);

const webhookProcessor = new WebhookProcessor(
  contactRepository,
  interactionRepository,
  messageRepository,
  conversationRepository,
);

export const retryWorker = new RetryWorker(
  messageRepository,
  contactRepository,
  whatsAppProvider,
);

const leadController    = new LeadController(enrichLeadsUseCase, leadRepository);
const jobController     = new JobController();
const webhookController = new WebhookController(webhookProcessor);
const messageController = new MessageController(sendTemplateUseCase, sendTextUseCase);

export const container = {
  leadController,
  jobController,
  webhookController,
  messageController,
};
