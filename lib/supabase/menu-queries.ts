import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoxId, BusinessSettings } from "@/lib/types";
import {
  EMPTY_MENU_CACHE,
  type MenuCache,
  type ResolvedItemConfig,
} from "@/lib/business-logic/menu";

function codeToBoxId(code: string): BoxId | null {
  if (code === "BOX_1") return "box-1";
  if (code === "BOX_2") return "box-2";
  return null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(toDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function fetchBusinessSettings(
  client: SupabaseClient
): Promise<BusinessSettings | null> {
  const { data, error } = await client
    .from("business_settings")
    .select(
      "default_cutoff_time, delivery_start_time, delivery_end_time, delivery_radius_km, delivery_fee, upi_id, upi_qr_image_url, sunday_is_holiday"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    defaultCutoffTime: data.default_cutoff_time,
    deliveryStartTime: data.delivery_start_time,
    deliveryEndTime: data.delivery_end_time,
    deliveryRadiusKm: Number(data.delivery_radius_km),
    deliveryFee: Number(data.delivery_fee),
    upiId: data.upi_id,
    upiQrImageUrl: data.upi_qr_image_url,
    sundayIsHoliday: data.sunday_is_holiday,
  };
}

/**
 * Fetches every table needed to resolve box/add-on display for dates in
 * [fromDate, toDate], and assembles the MenuCache used by
 * resolveBoxDisplay/resolveAddOns. RLS already restricts menu_weeks (and
 * everything joined to it) to published weeks for non-admin requests —
 * this function doesn't need to re-check status itself, though it filters
 * explicitly anyway for clarity.
 */
export async function fetchMenuCache(
  client: SupabaseClient,
  fromDate: string,
  toDate: string
): Promise<MenuCache> {
  const [boxTypesRes, addOnsRes, holidaysRes, weeksRes] = await Promise.all([
    client.from("box_types").select("id, code, name").order("display_order"),
    client.from("addons").select("id, code, name, description"),
    client
      .from("business_holidays")
      .select("holiday_date")
      .gte("holiday_date", fromDate)
      .lte("holiday_date", toDate),
    client
      .from("menu_weeks")
      .select("id, week_start_date, week_end_date")
      .eq("status", "published")
      .lte("week_start_date", toDate)
      .gte("week_end_date", fromDate),
  ]);

  if (boxTypesRes.error) throw boxTypesRes.error;
  if (addOnsRes.error) throw addOnsRes.error;
  if (holidaysRes.error) throw holidaysRes.error;
  if (weeksRes.error) throw weeksRes.error;

  const boxTypeIdToBoxId = new Map<string, BoxId>();
  const boxIdentities: MenuCache["boxIdentities"] = [];
  for (const row of boxTypesRes.data ?? []) {
    const boxId = codeToBoxId(row.code);
    if (!boxId) continue;
    boxTypeIdToBoxId.set(row.id, boxId);
    boxIdentities.push({ id: boxId, name: row.name });
  }

  const addOnCatalog = (addOnsRes.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
  }));

  const noServiceDates = new Set<string>((holidaysRes.data ?? []).map((r) => r.holiday_date));

  const weeks = weeksRes.data ?? [];
  if (weeks.length === 0) {
    return {
      ...EMPTY_MENU_CACHE,
      boxIdentities,
      addOnCatalog,
      noServiceDates: [...noServiceDates],
    };
  }

  const weekIds = weeks.map((w) => w.id);

  const [weeklyBoxRes, weeklyAddonRes, menuDatesRes] = await Promise.all([
    client
      .from("weekly_box_configurations")
      .select("menu_week_id, box_type_id, description, price, is_available, image_url")
      .in("menu_week_id", weekIds),
    client
      .from("weekly_addon_configurations")
      .select("menu_week_id, addon_id, price, is_available")
      .in("menu_week_id", weekIds),
    client
      .from("menu_dates")
      .select("id, menu_week_id, delivery_date, is_service_available")
      .in("menu_week_id", weekIds),
  ]);

  if (weeklyBoxRes.error) throw weeklyBoxRes.error;
  if (weeklyAddonRes.error) throw weeklyAddonRes.error;
  if (menuDatesRes.error) throw menuDatesRes.error;

  const menuDates = menuDatesRes.data ?? [];
  const menuDateIds = menuDates.map((d) => d.id);

  const [dateBoxRes, dateAddonRes] =
    menuDateIds.length === 0
      ? [{ data: [], error: null } as const, { data: [], error: null } as const]
      : await Promise.all([
          client
            .from("date_box_configurations")
            .select("menu_date_id, box_type_id, description, price, is_available, contents")
            .in("menu_date_id", menuDateIds),
          client
            .from("date_addon_configurations")
            .select("menu_date_id, addon_id, price, is_available")
            .in("menu_date_id", menuDateIds),
        ]);

  if (dateBoxRes.error) throw dateBoxRes.error;
  if (dateAddonRes.error) throw dateAddonRes.error;

  const boxByDate: MenuCache["boxByDate"] = new Map();
  const addOnByDate: MenuCache["addOnByDate"] = new Map();

  // 1. Weekly defaults apply to every date within [week_start_date, week_end_date].
  for (const week of weeks) {
    const datesInWeek = eachDate(week.week_start_date, week.week_end_date).filter(
      (d) => d >= fromDate && d <= toDate
    );
    const boxConfigsForWeek = (weeklyBoxRes.data ?? []).filter((c) => c.menu_week_id === week.id);
    const addonConfigsForWeek = (weeklyAddonRes.data ?? []).filter(
      (c) => c.menu_week_id === week.id
    );

    for (const date of datesInWeek) {
      const boxMap = boxByDate.get(date) ?? new Map<BoxId, ResolvedItemConfig>();
      for (const config of boxConfigsForWeek) {
        const boxId = boxTypeIdToBoxId.get(config.box_type_id);
        if (!boxId) continue;
        boxMap.set(boxId, {
          description: config.description,
          price: config.price != null ? Number(config.price) : null,
          available: config.is_available,
          imageUrl: config.image_url,
        });
      }
      boxByDate.set(date, boxMap);

      const addonMap = addOnByDate.get(date) ?? new Map<string, ResolvedItemConfig>();
      for (const config of addonConfigsForWeek) {
        addonMap.set(config.addon_id, {
          description: null,
          price: Number(config.price),
          available: config.is_available,
        });
      }
      addOnByDate.set(date, addonMap);
    }
  }

  // 2. Per-date overrides take precedence; is_service_available=false marks
  //    that specific date as unavailable (same as a business holiday).
  const menuDateIdToDate = new Map(menuDates.map((d) => [d.id, d.delivery_date]));
  for (const menuDate of menuDates) {
    if (!menuDate.is_service_available) {
      noServiceDates.add(menuDate.delivery_date);
    }
  }

  for (const override of dateBoxRes.data ?? []) {
    const date = menuDateIdToDate.get(override.menu_date_id);
    const boxId = boxTypeIdToBoxId.get(override.box_type_id);
    if (!date || !boxId) continue;
    const boxMap = boxByDate.get(date) ?? new Map<BoxId, ResolvedItemConfig>();
    boxMap.set(boxId, {
      description: override.description,
      price: override.price != null ? Number(override.price) : null,
      available: override.is_available,
    });
    boxByDate.set(date, boxMap);
  }

  for (const override of dateAddonRes.data ?? []) {
    const date = menuDateIdToDate.get(override.menu_date_id);
    if (!date) continue;
    const addonMap = addOnByDate.get(date) ?? new Map<string, ResolvedItemConfig>();
    addonMap.set(override.addon_id, {
      description: null,
      price: override.price != null ? Number(override.price) : null,
      available: override.is_available,
    });
    addOnByDate.set(date, addonMap);
  }

  return {
    boxIdentities,
    addOnCatalog,
    boxByDate,
    addOnByDate,
    noServiceDates: [...noServiceDates],
  };
}
