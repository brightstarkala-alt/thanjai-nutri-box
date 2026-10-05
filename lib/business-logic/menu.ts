import type { AddOn, BoxDisplay, BoxId } from "@/lib/types";

/** A box or add-on's resolved content/price/availability for one date. */
export type ResolvedItemConfig = {
  description: string | null;
  price: number | null;
  available: boolean;
  imageUrl?: string | null;
};

/**
 * In-memory cache of real Supabase menu data for a fetched date range.
 * Built once per fetch by MenuProvider; resolution below is pure lookup,
 * no network calls, so getBoxDisplay/getAddOns can stay synchronous for
 * the existing UI components.
 */
export type MenuCache = {
  boxIdentities: { id: BoxId; name: string }[];
  addOnCatalog: { id: string; code: string; name: string; description: string | null }[];
  /** delivery date -> BoxId -> resolved config (weekly default, date override applied) */
  boxByDate: Map<string, Map<BoxId, ResolvedItemConfig>>;
  /** delivery date -> addon catalog id -> resolved config */
  addOnByDate: Map<string, Map<string, ResolvedItemConfig>>;
  /** dates with no service (business_holidays + any menu_dates.is_service_available = false) */
  noServiceDates: string[];
};

export const EMPTY_MENU_CACHE: MenuCache = {
  boxIdentities: [],
  addOnCatalog: [],
  boxByDate: new Map(),
  addOnByDate: new Map(),
  noServiceDates: [],
};

/** Resolved box info for a given delivery date, ready to display to a customer. */
export function resolveBoxDisplay(boxId: BoxId, date: string, cache: MenuCache): BoxDisplay {
  const identity = cache.boxIdentities.find((b) => b.id === boxId);
  const config = cache.boxByDate.get(date)?.get(boxId);
  return {
    id: boxId,
    name: identity?.name ?? (boxId === "box-1" ? "Box 1" : "Box 2"),
    description: config?.description ?? "Menu to be updated by admin.",
    price: config?.price ?? null,
    imageUrl: config?.imageUrl ?? undefined,
    available: config?.available ?? false,
  };
}

/**
 * Resolved add-ons for a given delivery date. Only add-ons that actually
 * have a weekly or date-specific configuration for this date are
 * returned — an add-on nobody has priced yet for this date simply isn't
 * offered, rather than showing a placeholder with an invented price.
 */
export function resolveAddOns(date: string, cache: MenuCache): AddOn[] {
  const configuredForDate = cache.addOnByDate.get(date);
  if (!configuredForDate) return [];

  return cache.addOnCatalog
    .filter((addOn) => configuredForDate.has(addOn.id))
    .map((addOn) => {
      const config = configuredForDate.get(addOn.id)!;
      return {
        id: addOn.id,
        name: addOn.name,
        description: addOn.description ?? undefined,
        price: config.price ?? 0,
        available: config.available,
      };
    });
}
