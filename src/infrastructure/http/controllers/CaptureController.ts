// src/infrastructure/http/controllers/CaptureController.ts
// This file implements the CaptureController for handling capture-related HTTP requests in the application.

import { Request, Response } from 'express';

import { CaptureGoogleMapsUseCase } from '@application/capture/use-cases/CaptureGoogleMapsUseCase';
import { CaptureGoogleMapsInput } from '@application/capture/dtos/CaptureGoogleMapsDTO';
import { runInBackground } from '@shared/jobs/backgroundRunner';

export class CaptureController {
  constructor(private readonly captureUseCase: CaptureGoogleMapsUseCase) {}

  google = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as CaptureGoogleMapsInput;

    res.status(202).json({ status: 'queued', query: input.query });

    runInBackground('capture/google', () => this.captureUseCase.execute(input));
  };
}
