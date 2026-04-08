// src/application/capture/dtos/CaptureGoogleMapsDTO.ts
// DTOs and validation schema for capturing data from Google Maps Places API

import { z } from 'zod';

const locationRegex = /^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)$/;

export const captureGoogleMapsSchema = z.object({
  query: z.string().min(1, 'query is required'),
  location: z
    .string()
    .regex(locationRegex, 'location must be in the format "lat,lng" e.g., "-22.8858,-48.4450"')
    .optional(),
  radius: z.number().int().min(100).max(50000).default(5000),
});

export type CaptureGoogleMapsInput = z.infer<typeof captureGoogleMapsSchema>;

export interface CaptureGoogleMapsOutput {
  total_collected: number;
  pages_scanned: number;
}

export interface PlaceSearchResult {
  places: GooglePlaceRaw[];
  pages_scanned: number;
}

// Shape of the object returned by the Google Places Text Search API
export interface GooglePlaceRaw {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  types?: string[];
  business_status?: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_phone_number?: string;
  international_phone_number?: string;
}
