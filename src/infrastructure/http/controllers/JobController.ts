// src/infrastructure/http/controllers/JobController.ts

import { Request, Response } from 'express';
import { jobRegistry } from '@shared/jobs/jobRegistry';

export class JobController {
  list = (_req: Request, res: Response): void => {
    res.status(200).json({ jobs: jobRegistry.list() });
  };
}
