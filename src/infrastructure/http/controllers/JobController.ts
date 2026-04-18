// src/infrastructure/http/controllers/JobController.ts

import { Request, Response } from 'express';
import { jobRegistry } from '@shared/jobs/jobRegistry';

export class JobController {
  list = (_req: Request, res: Response): void => {
    res.status(200).json({ jobs: jobRegistry.list() });
  };

  getById = (req: Request, res: Response): void => {
    const job = jobRegistry.find(req.params['id'] as string);
    if (!job) {
      res.status(404).json({ status: 'error', message: 'Job não encontrado' });
      return;
    }
    res.status(200).json(job);
  };
}
