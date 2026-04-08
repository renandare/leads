// src/shared/container/index.ts

import { prisma } from '@infrastructure/database/prisma/client';
import { PrismaLeadRepository } from '@infrastructure/repositories/PrismaLeadRepository';
import { GoogleMapsService } from '@infrastructure/services/google/GoogleMapsService';
import { CaptureGoogleMapsUseCase } from '@application/capture/use-cases/CaptureGoogleMapsUseCase';
import { CaptureController } from '@infrastructure/http/controllers/CaptureController';

// Repositories
const leadRepository = new PrismaLeadRepository(prisma);

// External services
const googleMapsService = new GoogleMapsService();

// Use cases
const captureGoogleMapsUseCase = new CaptureGoogleMapsUseCase(googleMapsService, leadRepository);

// Controllers
const captureController = new CaptureController(captureGoogleMapsUseCase);

export const container = {
  captureController,
};
