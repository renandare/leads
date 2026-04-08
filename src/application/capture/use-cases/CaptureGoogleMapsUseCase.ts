// src/application/capture/use-cases/CaptureGoogleMapsUseCase.ts
// This use case is responsible for capturing leads from Google Maps based on a search query, radius, and optional location. 

import { ILeadRepository } from '@domain/lead/repositories/ILeadRepository';
import { LeadSource } from '@domain/lead/enums/LeadSource';
import { PipelineStage } from '@domain/lead/enums/PipelineStage';
import {
  CaptureGoogleMapsInput,
  CaptureGoogleMapsOutput,
  PlaceSearchResult,
} from '../dtos/CaptureGoogleMapsDTO';

export interface IPlaceSearchService {
  searchPlaces(query: string, radius: number, location?: string): Promise<PlaceSearchResult>;
}

export class CaptureGoogleMapsUseCase {
  constructor(
    private readonly placeSearch: IPlaceSearchService,
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(input: CaptureGoogleMapsInput): Promise<CaptureGoogleMapsOutput> {
    const { places, pages_scanned } = await this.placeSearch.searchPlaces(
      input.query,
      input.radius,
      input.location,
    );

    if (places.length === 0) return { total_collected: 0, pages_scanned };

    // Filter out place_ids that already exist in a single query to avoid N+1
    const placeIds = places.map(p => p.place_id);
    const existingIds = await this.leadRepo.findExistingPlaceIds(placeIds);
    const newPlaces = places.filter(p => !existingIds.has(p.place_id));

    if (newPlaces.length === 0) return { total_collected: 0, pages_scanned };

    const count = await this.leadRepo.createMany(
      newPlaces.map(place => ({
        source: LeadSource.GOOGLE_MAPS,
        rawData: place,
        pipelineStage: PipelineStage.RAW,
      })),
    );

    return { total_collected: count, pages_scanned };
  }
}
