/** A single parsed Nominatim geocoding result. */
export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
}

export type GeocodingErrorKind = 'network' | 'http' | 'invalid-response';

/** Error raised by GeocodingService with a machine-readable kind. */
export class GeocodingError extends Error {
  public readonly kind: GeocodingErrorKind;

  constructor(kind: GeocodingErrorKind, message: string) {
    super(message);
    this.name = 'GeocodingError';
    this.kind = kind;
  }
}

interface NominatimPlace {
  lat?: string;
  lon?: string;
  display_name?: string;
}

/**
 * Address search against the public Nominatim instance (no API key).
 * Requests are fired only on explicit user action to respect the
 * Nominatim usage policy (no autocomplete/debounce spam).
 */
export class GeocodingService {
  private static instance: GeocodingService;

  private constructor() {}

  public static getInstance(): GeocodingService {
    if (!GeocodingService.instance) {
      GeocodingService.instance = new GeocodingService();
    }
    return GeocodingService.instance;
  }

  /**
   * Search for an address, returning up to five results ordered by relevance.
   * Returns an empty array when the query is blank or nothing matches.
   */
  async search(query: string): Promise<GeocodingResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2&limit=5&q=${encodeURIComponent(trimmed)}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      console.warn('Address search network failure:', error);
      throw new GeocodingError('network', 'Address search could not reach the server.');
    }

    if (!response.ok) {
      throw new GeocodingError('http', `Address search failed with status ${response.status}.`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      console.warn('Address search returned invalid JSON:', error);
      throw new GeocodingError('invalid-response', 'Address search returned an invalid response.');
    }

    if (!Array.isArray(data)) {
      throw new GeocodingError('invalid-response', 'Address search returned an unexpected shape.');
    }

    const results: GeocodingResult[] = [];
    for (const place of data as NominatimPlace[]) {
      const lat = Number(place?.lat);
      const lon = Number(place?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof place?.display_name !== 'string') {
        continue;
      }
      results.push({ lat, lon, displayName: place.display_name });
    }
    return results;
  }
}
