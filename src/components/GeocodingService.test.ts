import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeocodingError, GeocodingService } from './GeocodingService';

describe('GeocodingService', () => {
  let service: GeocodingService;

  beforeEach(() => {
    (GeocodingService as unknown as { instance: undefined }).instance = undefined;
    service = GeocodingService.getInstance();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses lat/lon/display_name from the happy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { lat: '48.8583701', lon: '2.2944813', display_name: 'Eiffel Tower, Paris, France' },
          { lat: '10', lon: '20', display_name: 'Somewhere Else' },
        ]),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await service.search('Eiffel Tower');

    expect(results).toEqual([
      { lat: 48.8583701, lon: 2.2944813, displayName: 'Eiffel Tower, Paris, France' },
      { lat: 10, lon: 20, displayName: 'Somewhere Else' },
    ]);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('https://nominatim.openstreetmap.org/search');
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('limit=5');
    expect(url).toContain(`q=${encodeURIComponent('Eiffel Tower')}`);
  });

  it('surfaces an http error for non-200 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));

    await expect(service.search('anything')).rejects.toMatchObject({
      name: 'GeocodingError',
      kind: 'http',
    });
  });

  it('surfaces a network error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(service.search('anything')).rejects.toBeInstanceOf(GeocodingError);
    await expect(service.search('anything')).rejects.toMatchObject({ kind: 'network' });
  });

  it('returns an empty array for zero results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));

    const results = await service.search('gibberish xyzzy');

    expect(results).toEqual([]);
  });

  it('surfaces invalid-response when JSON is malformed or not an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{not json', { status: 200 }))
    );
    await expect(service.search('q')).rejects.toMatchObject({ kind: 'invalid-response' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ odd: true }), { status: 200 }))
    );
    await expect(service.search('q')).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('skips entries with missing coordinates and returns blank results for empty queries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ display_name: 'No coords here' }]), { status: 200 })
      )
    );

    expect(await service.search('bad entry')).toEqual([]);
    expect(await service.search('   ')).toEqual([]);
  });
});
