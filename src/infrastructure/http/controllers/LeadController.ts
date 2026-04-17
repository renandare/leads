import { Request, Response } from 'express';

import { EnrichLeadsUseCase } from '@application/lead/use-cases/EnrichLeadsUseCase';
import { EnrichLeadsInput } from '@application/lead/dtos/EnrichLeadDTO';
import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { runInBackground } from '@shared/jobs/backgroundRunner';

export class LeadController {
  constructor(
    private readonly enrichUseCase: EnrichLeadsUseCase,
    private readonly leadRepo: ILeadRepository,
  ) {}

  enrich = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as EnrichLeadsInput;

    const rawCount = await this.leadRepo.countRaw();
    if (rawCount === 0) {
      res.status(200).json({ status: 'nothing_to_process', raw: 0 });
      return;
    }

    const jobId = runInBackground('leads/enrich', () => this.enrichUseCase.execute(input));
    res.status(202).json({ status: 'queued', jobId, batch_size: input.batch_size, raw: rawCount });
  };

  stats = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.leadRepo.getStats();
    res.status(200).json(data);
  };
}
