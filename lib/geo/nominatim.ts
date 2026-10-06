// Address search / lookup via OpenStreetMap's free Nominatim service (no
// API key). Per its usage policy we only call it on an explicit customer
// action (Search button, confirming a pin) — never on every keystroke — and
// results are biased to the Thanjavur area. Nothing is logged or stored
// beyond the customer's own order.

export type LatLng = { lat: number; lng: number };
export type GeoResult = LatLng & { label: string; address: string };

/** Thanjavur city centre — the map's starting point. */
export const THANJAVUR: LatLng = { lat: 10.787, lng: 79.1378 };

const BASE = "https://nominatim.openstreetmap.org";
// Prefer results around Thanjavur (not a hard limit).
const VIEWBOX = "78.85,11.05,79.45,10.55";

type NominatimAddress = Partial<
  Record<
    | "house_number" | "road" | "neighbourhood" | "suburb" | "quarter" | "hamlet" | "village" | "town" | "city"
    | "city_district" | "county" | "state_district" | "state" | "postcode",
    string
  >
>;

/** Readable address for the editable address field. */
export function formatAddress(a: NominatimAddress | undefined, fallback = ""): string {
  if (!a) return fallback;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const area = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.hamlet;
  const place = a.village ?? a.town ?? a.city ?? a.city_district ?? a.county;
  const parts = [street, area, place, [a.state, a.postcode].filter(Boolean).join(" ")].filter((p) => p && p.trim());
  return parts.length ? [...new Set(parts)].join(", ") : fallback;
}

/** Short place name, e.g. "Srinivasapuram, Thanjavur". */
export function shortLabel(a: NominatimAddress | undefined, fallback = "Selected location"): string {
  if (!a) return fallback;
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? a.hamlet;
  const place = a.town ?? a.city ?? a.city_district ?? a.county ?? a.state;
  return [area, place].filter(Boolean).join(", ") || fallback;
}

export async function searchPlaces(query: string): Promise<GeoResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    countrycodes: "in",
    limit: "5",
    addressdetails: "1",
    viewbox: VIEWBOX,
    "accept-language": "en",
  });
  const res = await fetch(`${BASE}/search?${params}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("search failed");
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string; address?: NominatimAddress }[];
  return rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: shortLabel(r.address, r.display_name),
    address: formatAddress(r.address, r.display_name),
  }));
}

/** Address for a map pin, or null if the lookup isn't available. */
export async function lookupAddress({ lat, lng }: LatLng): Promise<Omit<GeoResult, "lat" | "lng"> | null> {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "en",
    });
    const res = await fetch(`${BASE}/reverse?${params}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const r = (await res.json()) as { display_name?: string; address?: NominatimAddress; error?: string };
    if (r.error || !r.address) return null;
    return { label: shortLabel(r.address), address: formatAddress(r.address, r.display_name ?? "") };
  } catch {
    return null;
  }
}
