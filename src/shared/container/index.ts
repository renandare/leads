import { prisma } from '@infrastructure/database/prisma/client';
import { PrismaLeadRepository } from '@infrastructure/repositories/PrismaLeadRepository';
import { PrismaContactRepository } from '@infrastructure/repositories/PrismaContactRepository';
import { GoogleMapsService } from '@infrastructure/services/google/GoogleMapsService';
import { CaptureGoogleMapsUseCase } from '@application/capture/use-cases/CaptureGoogleMapsUseCase';
import { NormalizeLeadsUseCase } from '@application/lead/use-cases/NormalizeLeadsUseCase';
import { DeduplicateLeadsUseCase } from '@application/lead/use-cases/DeduplicateLeadsUseCase';
import { CaptureController } from '@infrastructure/http/controllers/CaptureController';
import { LeadController } from '@infrastructure/http/controllers/LeadController';

// Repositories
const leadRepository = new PrismaLeadRepository(prisma);
const contactRepository = new PrismaContactRepository(prisma);

// External services
const googleMapsService = new GoogleMapsService();

// Use cases
const captureGoogleMapsUseCase = new CaptureGoogleMapsUseCase(googleMapsService, leadRepository);
const normalizeLeadsUseCase = new NormalizeLeadsUseCase(leadRepository, contactRepository);
const deduplicateLeadsUseCase = new DeduplicateLeadsUseCase(leadRepository);

// Controllers
const captureController = new CaptureController(captureGoogleMapsUseCase);
const leadController = new LeadController(normalizeLeadsUseCase, deduplicateLeadsUseCase, leadRepository);

export const container = {
  captureController,
  leadController,
};
