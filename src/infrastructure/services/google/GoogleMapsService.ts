// src/infrastructure/services/google/GoogleMapsService.ts
// This service implements the IPlaceSearchService interface to interact with the Google Maps Places API 
// for searching places based on a query, radius, and optional location.

import axios from 'axios';

import { IPlaceSearchService } from '@application/capture/use-cases/CaptureGoogleMapsUseCase';
import { GooglePlaceRaw, PlaceSearchResult } from '@application/capture/dtos/CaptureGoogleMapsDTO';

const BASE_URL = process.env.GOOGLE_MAPS_API_URL!;
const BACKOFF_DELAYS_MS = [30_000, 60_000, 120_000];
const PAGE_DELAY_MS = 2_000;

interface TextSearchResponse {
  status: string;
  results: GooglePlaceRaw[];
  next_page_token?: string;
}

export class GoogleMapsService implements IPlaceSearchService {
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY!;

  // Search places using Google Maps Text Search API with pagination and exponential backoff for rate limits
  async searchPlaces(query: string, radius: number, location?: string): Promise<PlaceSearchResult> {
    const places: GooglePlaceRaw[] = [];
    let pagetoken: string | undefined;
    let pages_scanned = 0;

    do {
      const page = await this.fetchPage(query, radius, location, pagetoken);
      places.push(...page.results);
      pages_scanned++;
      pagetoken = page.next_page_token;

      if (pagetoken) await this.sleep(PAGE_DELAY_MS);
    } while (pagetoken);

    return { places, pages_scanned };
  }

  // Fetch a single page of results with exponential backoff on rate limit errors
  private async fetchPage(
    query: string,
    radius: number,
    location?: string,
    pagetoken?: string,
  ): Promise<TextSearchResponse> {
    for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt++) {
      try {
        const { data } = await axios.get<TextSearchResponse>(BASE_URL, {
          params: {
            query,
            radius,
            key: this.apiKey,
            ...(location ? { location } : {}),
            ...(pagetoken ? { pagetoken } : {}),
          },
        });
        return data;
      } catch (err: unknown) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;

        if (status === 429 && attempt < BACKOFF_DELAYS_MS.length) {
          await this.sleep(BACKOFF_DELAYS_MS[attempt]);
          continue;
        }

        throw err;
      }
    }

    // If we exhaust all retries, throw an error
    throw new Error('Google Maps: maximum retry attempts reached');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
