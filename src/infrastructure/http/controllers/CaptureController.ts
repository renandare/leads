// src/infrastructure/http/controllers/CaptureController.ts
// This controller handles HTTP requests related to capturing leads from various sources, such as Google Maps.

import { Request, Response } from 'express';

import { CaptureGoogleMapsUseCase } from '@application/capture/use-cases/CaptureGoogleMapsUseCase';
import { CaptureGoogleMapsInput } from '@application/capture/dtos/CaptureGoogleMapsDTO';

export class CaptureController {
  constructor(private readonly captureUseCase: CaptureGoogleMapsUseCase) {}

  google = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as CaptureGoogleMapsInput;
    const result = await this.captureUseCase.execute(input);
    res.status(200).json(result);
  };
}
