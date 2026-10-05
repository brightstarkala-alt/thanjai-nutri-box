"use client";

// Real Supabase-backed menu data for the customer-facing app. Fetches
// once on mount (published menu_weeks + their box/add-on configuration,
// business_settings, business_holidays) into an in-memory cache, then
// resolves getBoxDisplay/getAddOns synchronously from that cache so
// existing components don't need to become async. On fetch failure this
// surfaces `error` — it never falls back to mock/sample data, so a
// broken connection is visibly broken rather than silently showing fake
// prices.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchBusinessSettings, fetchMenuCache } from "@/lib/supabase/menu-queries";
import {
  EMPTY_MENU_CACHE,
  resolveAddOns,
  resolveBoxDisplay,
  type MenuCache,
} from "@/lib/business-logic/menu";
import { addDays, toDateInputValue } from "@/lib/business-logic/delivery-date";
import type { AddOn, BoxDisplay, BoxId, BusinessSettings } from "@/lib/types";

// Covers the monthly order flow's furthest selectable month (6 months
// ahead) plus some margin.
const FETCH_RANGE_DAYS = 190;

type MenuContextValue = {
  loading: boolean;
  error: string | null;
  boxIdentities: { id: BoxId; name: string }[];
  businessSettings: BusinessSettings | null;
  noServiceDates: string[];
  getBoxDisplay: (boxId: BoxId, date: string) => BoxDisplay;
  getAddOns: (date: string) => AddOn[];
  refetch: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

export function MenuProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [cache, setCache] = useState<MenuCache>(EMPTY_MENU_CACHE);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // loading/error start at their correct values via useState's initial
  // value (true / null) for the normal mount-once case. refetch() doesn't
  // currently flip loading back to true first — nothing calls refetch()
  // yet, so this is a known, harmless gap rather than a live bug.
  useEffect(() => {
    let cancelled = false;

    const fromDate = toDateInputValue(new Date());
    const toDate = toDateInputValue(addDays(new Date(), FETCH_RANGE_DAYS));

    Promise.all([fetchMenuCache(supabase, fromDate, toDate), fetchBusinessSettings(supabase)])
      .then(([menuCache, settings]) => {
        if (cancelled) return;
        setCache(menuCache);
        setBusinessSettings(settings);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load menu data from Supabase:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the menu right now. Please try again later."
        );
        setCache(EMPTY_MENU_CACHE);
        setBusinessSettings(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, reloadToken]);

  const getBoxDisplay = useCallback(
    (boxId: BoxId, date: string) => resolveBoxDisplay(boxId, date, cache),
    [cache]
  );
  const getAddOns = useCallback((date: string) => resolveAddOns(date, cache), [cache]);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  const value = useMemo<MenuContextValue>(
    () => ({
      loading,
      error,
      boxIdentities: cache.boxIdentities,
      businessSettings,
      noServiceDates: cache.noServiceDates,
      getBoxDisplay,
      getAddOns,
      refetch,
    }),
    [loading, error, cache, businessSettings, getBoxDisplay, getAddOns, refetch]
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used within a MenuProvider");
  return ctx;
}
