// src/application/lead/use-cases/NormalizeLeadsUseCase.ts
// This file implements the use case for normalizing leads in the application.

import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { IContactRepository } from '@domain/contact/repositories/IContactRepository';
import { PipelineStage } from '@domain/lead/enums/PipelineStage';
import { LeadSource } from '@domain/lead/enums/LeadSource';
import { GooglePlaceRaw } from '@application/capture/dtos/CaptureGoogleMapsDTO';
import { normalizePhone } from '@shared/utils/phoneFormatter';
import { normalizeName } from '@shared/utils/nameFormatter';
import { parseAddressFromGoogle } from '@shared/utils/addressParser';
import { NormalizeLeadsInput, NormalizeLeadsOutput } from '../dtos/NormalizeLeadDTO';

export class NormalizeLeadsUseCase {
  constructor(
    private readonly leadRepo: ILeadRepository,
    private readonly contactRepo: IContactRepository,
  ) {}

  async execute(input: NormalizeLeadsInput): Promise<NormalizeLeadsOutput> {
    let totalNormalized = 0;
    let totalFailed = 0;

    while (true) {
      const leads = await this.leadRepo.findRawBatch(input.batch_size);
      if (leads.length === 0) break;

      for (const lead of leads) {
        try {
          const { name, phone, address, city, state, website } = this.extractFields(lead);

          await this.leadRepo.updateNormalized(lead.id, {
            name,
            phone,
            address,
            city,
            state,
            website,
            pipelineStage: PipelineStage.NORMALIZED,
          });

          await this.contactRepo.createIfNotDuplicate({ leadId: lead.id, phone });

          totalNormalized++;
        } catch {
          await this.leadRepo.markProcessed(lead.id).catch(() => {});
          totalFailed++;
        }
      }
    }

    return { normalized: totalNormalized, failed: totalFailed };
  }

  private extractFields(lead: { source: string; rawData: unknown }): {
    name: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    website: string | null;
  } {
    if (lead.source === LeadSource.GOOGLE_MAPS) {
      const raw = lead.rawData as GooglePlaceRaw;
      const phone = normalizePhone(raw.international_phone_number ?? raw.formatted_phone_number);
      const name = normalizeName(raw.name);
      const { city, state } = parseAddressFromGoogle(raw.formatted_address);

      return { name, phone, address: raw.formatted_address ?? null, city, state, website: raw.website ?? null };
    }

    return { name: null, phone: null, address: null, city: null, state: null, website: null };
  }
}
