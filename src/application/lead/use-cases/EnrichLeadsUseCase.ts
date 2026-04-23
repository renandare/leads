// src/application/lead/use-cases/EnrichLeadsUseCase.ts

import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { PipelineStage } from '@domain/lead/enums/PipelineStage';
import { EnrichmentStatus } from '@domain/lead/enums/EnrichmentStatus';
import { cnaeToLeadType } from '@domain/lead/enums/LeadType';
import { Lead, UpdateLeadEnrichedData } from '@domain/lead/entities/Lead';
import { CnpjService, CnpjData } from '@infrastructure/services/cnpj/CnpjService';
import { EnrichLeadsInput, EnrichLeadsOutput } from '../dtos/EnrichLeadDTO';

// sleep(300 * (retryCount + 1) + jitter 0–200ms)
function sleep(retryCount: number): Promise<void> {
  const ms = 300 * (retryCount + 1) + Math.floor(Math.random() * 200);
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Formats a raw phone string to +55DDDNUMBER to detects mobile.
// ANATEL: mobile has 9-digit local starting with 9.
function parsePhone(raw: string | null): { formatted: string | null; isMobile: boolean } {
  if (!raw) return { formatted: null, isMobile: false };
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return { formatted: null, isMobile: false };

  const local = digits.slice(2); // remove DDD (2 digits)
  
  // Receita Federal registries often use the old 8-digit format for mobiles
  const isMobile = local.startsWith('9') && (local.length === 8 || local.length === 9); 
  return { formatted: `+55${digits}`, isMobile };
}

// Diff-only lead update — only includes fields that differ from current lead values
function buildLeadUpdate(lead: Lead, cnpj: CnpjData): Partial<UpdateLeadEnrichedData> {
  const update: Partial<UpdateLeadEnrichedData> = {};

  // Verify razaosocial
  if (cnpj.razaoSocial && cnpj.razaoSocial !== lead.name){
    update.name = cnpj.razaoSocial;
  }
  if (cnpj.fantasia !== undefined && cnpj.fantasia !== lead.tradeName){
    update.tradeName = cnpj.fantasia;
  }

  // address
  const street = [cnpj.logradouro, cnpj.numero].filter(Boolean).join(', ');
  if (street) {
    const address = cnpj.bairro ? `${street} - ${cnpj.bairro}` : street;
    if (address !== lead.address){
       update.address = address;
    }
  }

  // city and state
  if (cnpj.municipio && cnpj.municipio !== lead.city)  update.city  = cnpj.municipio;
  if (cnpj.uf && cnpj.uf !== lead.state) update.state = cnpj.uf;
  if (cnpj.naturezaJuridica && cnpj.naturezaJuridica !== lead.size)  update.size  = cnpj.naturezaJuridica;

  const type = cnaeToLeadType(cnpj.cnae);
  if (type !== lead.type) update.type = type;

  return update;
}

// Outcome of processing a single lead, used to update counters and detect bail
type LeadOutcome = 'done' | 'no_cnpj' | 'invalid_cnpj' | 'failed' | 'bail';

export class EnrichLeadsUseCase {
  constructor(
    private readonly leadRepo:    ILeadRepository,
    private readonly contactRepo: IContactRepository,
    private readonly cnpjService: CnpjService,
  ) {}

  private async processLead(lead: Lead): Promise<LeadOutcome> {
    if (!lead.document) {
      await this.leadRepo.updateEnriched(lead.id, {
        enrichmentStatus: EnrichmentStatus.NO_CNPJ,
        pipelineStage:    PipelineStage.ENRICHED,
      });
      return 'no_cnpj';
    }

    await sleep(lead.retryCount);

    try {
      // Try to fetch enrichment data from CNPJ service (API BRASIL/ReceitaWS)
      const result = await this.cnpjService.fetch(lead.document);

      if (!result.ok) {
        if (result.terminal) {
          await this.leadRepo.updateEnriched(lead.id, {
            enrichmentStatus: EnrichmentStatus.INVALID_CNPJ,
            pipelineStage:    PipelineStage.ENRICHED,
          });
          return 'invalid_cnpj';
        }
        if (result.bail) return 'bail'; // caller handles releasing remaining leads
        await this.leadRepo.incrementRetry(lead.id, result.error);
        return 'failed';
      }

      await this.leadRepo.updateEnriched(lead.id, {
        ...buildLeadUpdate(lead, result.data),
        enrichmentStatus: EnrichmentStatus.DONE,
        pipelineStage:    PipelineStage.ENRICHED,
      });

      const phone = parsePhone(result.data.phone);
      await this.contactRepo.upsertContact(lead.id, phone.formatted, phone.isMobile, result.data.email);

      return 'done';
    } catch (err) {
      await this.leadRepo.incrementRetry(lead.id, err instanceof Error ? err.message : String(err));
      return 'failed';
    }
  }

  async execute(input: EnrichLeadsInput): Promise<EnrichLeadsOutput> {
    let done = 0, no_cnpj = 0, invalid_cnpj = 0, failed = 0;

    // Release any claims left over from a previous crashed/stuck job
    await this.leadRepo.releaseStuckClaims(15);

    const passes: Array<(n: number) => Promise<Lead[]>> = [
      n => this.leadRepo.claimRawBatch(n),
      n => this.leadRepo.claimDocumentedEnrichedBatch(n),
    ];

    for (const claim of passes) {
      while (true) {
        const leads = await claim(input.batch_size);
        if (leads.length === 0) break;

        for (let i = 0; i < leads.length; i++) {
          const outcome = await this.processLead(leads[i]!);
          if (outcome === 'bail') {
            await this.leadRepo.releaseProcessingBatch(leads.slice(i).map(l => l.id));
            return { done, no_cnpj, invalid_cnpj, failed };
          }
          if      (outcome === 'done')         done++;
          else if (outcome === 'no_cnpj')      no_cnpj++;
          else if (outcome === 'invalid_cnpj') invalid_cnpj++;
          else if (outcome === 'failed')       failed++;
        }
      }
    }

    return { done, no_cnpj, invalid_cnpj, failed };
  }
}
