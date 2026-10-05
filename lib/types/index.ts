// Box identities are fixed — there are exactly two: "box-1" and "box-2".
// Everything about what's IN a box (description, price, image, availability)
// is admin-configurable content, never hardcoded here.
export type BoxId = "box-1" | "box-2";

export type BoxMenuEntry = {
  boxId: BoxId;
  /** null = default/fallback menu, used when no entry exists for a specific date */
  date: string | null;
  description: string;
  /** null = price not yet set by admin */
  price: number | null;
  imageUrl?: string;
  available: boolean;
};

/** Resolved box info for a given delivery date, ready to display to a customer. */
export type BoxDisplay = {
  id: BoxId;
  name: string;
  description: string;
  price: number | null;
  imageUrl?: string;
  available: boolean;
};

export type AddOn = {
  id: string;
  name: string;
  description?: string;
  price: number;
  available: boolean;
};

export type OrderLineItem = {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

/** One selectable cell in a delivery-date calendar. */
export type CalendarDay = {
  date: string;
  dayName: string;
  dayNumber: number;
  eligible: boolean;
  reason: "past" | "holiday" | "unavailable" | null;
  /** false = padding day from an adjacent month, shown blank in a month grid */
  inMonth?: boolean;
};

/** A single delivery date's box quantities within an order being built. */
export type DateBoxQuantities = Record<BoxId, number>;

/** Add-on quantities, keyed by AddOn id. */
export type AddOnQuantities = Record<string, number>;

/** business_settings singleton row, read from Supabase. */
export type BusinessSettings = {
  defaultCutoffTime: string;
  deliveryStartTime: string;
  deliveryEndTime: string;
  deliveryRadiusKm: number;
  deliveryFee: number;
  upiId: string | null;
  upiQrImageUrl: string | null;
  sundayIsHoliday: boolean;
};
