import { Request, Response } from 'express';

import { NormalizeLeadsUseCase } from '@application/lead/use-cases/NormalizeLeadsUseCase';
import { NormalizeLeadsInput } from '@application/lead/dtos/NormalizeLeadDTO';
import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { runInBackground } from '@shared/jobs/backgroundRunner';

export class LeadController {
  constructor(
    private readonly normalizeUseCase: NormalizeLeadsUseCase,
    private readonly leadRepo: ILeadRepository,
  ) {}

  normalize = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as NormalizeLeadsInput;

    const rawCount = await this.leadRepo.countRaw();
    if (rawCount === 0) {
      res.status(200).json({ status: 'nothing_to_process', raw: 0 });
      return;
    }

    res.status(202).json({ status: 'queued', batch_size: input.batch_size, raw: rawCount });

    runInBackground('leads/normalize', () => this.normalizeUseCase.execute(input));
  };

  stats = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.leadRepo.getStats();
    res.status(200).json(data);
  };
}
