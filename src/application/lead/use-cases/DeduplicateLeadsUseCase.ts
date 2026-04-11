// src/application/lead/use-cases/DeduplicateLeadsUseCase.ts
import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { PipelineStage } from '@domain/lead/enums/PipelineStage';
import { DeduplicateLeadsInput, DeduplicateLeadsOutput } from '../dtos/DeduplicateLeadDTO';

export class DeduplicateLeadsUseCase {
  constructor(private readonly leadRepo: ILeadRepository) {}

  async execute(input: DeduplicateLeadsInput): Promise<DeduplicateLeadsOutput> {
    let totalDeduplicated = 0;
    let totalDuplicates = 0;
    let totalFailed = 0;

    while (true) {
      const leads = await this.leadRepo.findNormalizedBatch(input.batch_size);
      if (leads.length === 0) break;

      for (const lead of leads) {
        try {
          const isDuplicate = await this.leadRepo.existsDuplicate({
            id: lead.id,
            phone: lead.phone,
            document: lead.document,
          });

          if (isDuplicate) {
            await this.leadRepo.deleteLead(lead.id);
            totalDuplicates++;
          } else {
            await this.leadRepo.updateStage(lead.id, PipelineStage.DEDUPLICATED);
            totalDeduplicated++;
          }
        } catch {
          await this.leadRepo.markProcessed(lead.id).catch(() => {});
          totalFailed++;
        }
      }
    }

    return { deduplicated: totalDeduplicated, duplicates: totalDuplicates, failed: totalFailed };
  }
}
