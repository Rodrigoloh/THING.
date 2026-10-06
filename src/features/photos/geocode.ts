type ReverseAddress = {
  city?: unknown;
  town?: unknown;
  village?: unknown;
  municipality?: unknown;
  county?: unknown;
};

type ReverseResponse = { address?: ReverseAddress };
type Fetcher = typeof fetch;

const cityCache = new Map<string, string | null>();
let geocodeQueue = Promise.resolve();
let lastRequestAt = 0;

function normalizeCity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const city = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!city || city.length > 80 || /[\u0000-\u001f\u007f]/.test(city)) return null;
  if (/^(ciudad de m[eé]xico|mexico city)$/i.test(city)) return 'CDMX';
  return city;
}

function coarseCoordinate(value: number): string { return value.toFixed(2); }

async function rateLimitedFetch(url: URL, fetcher: Fetcher): Promise<Response> {
  if (fetcher !== fetch) return fetcher(url, { headers: { 'User-Agent': 'THING/0.1 (https://thing-lake.vercel.app)', Referer: 'https://thing-lake.vercel.app/' } });
  let release = () => {};
  const previous = geocodeQueue;
  geocodeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return await fetcher(url, {
      headers: { 'User-Agent': 'THING/0.1 (https://thing-lake.vercel.app)', Referer: 'https://thing-lake.vercel.app/' },
      signal: AbortSignal.timeout(5000),
    });
  } finally { release(); }
}

export async function reverseGeocodePhotoCity(latitude: number, longitude: number, fetcher: Fetcher = fetch): Promise<string | null> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const lat = coarseCoordinate(latitude), lon = coarseCoordinate(longitude), cacheKey = `${lat},${lon}`;
  if (fetcher === fetch && cityCache.has(cacheKey)) return cityCache.get(cacheKey) ?? null;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lon);
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'es');
    const response = await rateLimitedFetch(url, fetcher);
    if (!response.ok) return null;
    const body = await response.json() as ReverseResponse;
    const address = body.address;
    const city = normalizeCity(address?.city) ?? normalizeCity(address?.town) ?? normalizeCity(address?.village) ?? normalizeCity(address?.municipality) ?? normalizeCity(address?.county);
    if (fetcher === fetch) cityCache.set(cacheKey, city);
    return city;
  } catch { return null; }
}
