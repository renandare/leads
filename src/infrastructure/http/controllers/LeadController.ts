import { Request, Response } from 'express';

import { EnrichLeadsUseCase } from '@application/lead/use-cases/EnrichLeadsUseCase';
import { EnrichLeadsInput } from '@application/lead/dtos/EnrichLeadDTO';
import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { runInBackground } from '@shared/jobs/backgroundRunner';
import { jobRegistry } from '@shared/jobs/jobRegistry';

const ENRICH_JOB_NAME = 'leads/enrich';

export class LeadController {
  constructor(
    private readonly enrichUseCase: EnrichLeadsUseCase,
    private readonly leadRepo: ILeadRepository,
  ) {}

  enrich = async (req: Request, res: Response): Promise<void> => {
    if (jobRegistry.isRunning(ENRICH_JOB_NAME)) {
      res.status(409).json({ status: 'already_running', message: 'An enrich job is already in progress.' });
      return;
    }

    const input = req.body as EnrichLeadsInput;

    const pending = await this.leadRepo.countPendingEnrich();
    if (pending === 0) {
      res.status(200).json({ status: 'nothing_to_process', pending: 0 });
      return;
    }

    const jobId = runInBackground(ENRICH_JOB_NAME, () => this.enrichUseCase.execute(input));
    res.status(202).json({ status: 'queued', jobId, batch_size: input.batch_size, pending });
  };

  stats = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.leadRepo.getStats();
    res.status(200).json(data);
  };
}
