import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYMENT_SCREENSHOT_BUCKET } from "@/lib/supabase/place-order";

// Admin data access. Every call goes to an admin_* database function
// (supabase/migrations/0003_admin.sql) with the signed-in admin's own
// session: the functions are SECURITY INVOKER, so the existing RLS policies
// (is_admin()) decide what can be read or changed. Nothing here bypasses
// RLS and no service-role key is used.

export type OrderStatus = "pending" | "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";
export type OrderPaymentStatus = "payment_verification_pending" | "paid" | "rejected" | "refunded";
export type WeekStatus = "draft" | "published" | "closed";

export type AdminOrderRow = {
  id: string;
  order_number: string;
  placed_at: string;
  plan_type: "daily" | "weekly" | "monthly";
  order_status: OrderStatus;
  payment_status: OrderPaymentStatus;
  total_amount: number;
  customer_name: string | null;
  phone: string | null;
  delivery_dates: string[];
};

export type AdminPayment = {
  id: string;
  payment_method: string;
  amount: number;
  transaction_id: string | null;
  utr_reference: string | null;
  paid_at: string | null;
  screenshot_path: string | null;
  payment_status: "pending" | "approved" | "rejected";
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  verified_by_name: string | null;
};

export type AdminOrder = {
  id: string;
  order_number: string;
  placed_at: string;
  plan_type: "daily" | "weekly" | "monthly";
  order_status: OrderStatus;
  payment_status: OrderPaymentStatus;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  customer_notes: string | null;
  /** Set by the database when the order is marked delivered. */
  delivered_at: string | null;
  /** What the customer entered for this order, incl. the optional map pin. */
  delivery: { name?: string; phone?: string; address?: string; landmark?: string | null; instructions?: string | null; latitude?: number | null; longitude?: number | null } | null;
  customer: { id: string; full_name: string | null; phone: string | null; is_active: boolean; order_count: number } | null;
  address: { address_line_1: string; address_line_2: string | null; landmark: string | null; city: string | null; pincode: string | null; latitude?: number | null; longitude?: number | null } | null;
  dates: {
    delivery_date: string;
    total: number;
    items: { name: string; item_type: "box" | "addon"; quantity: number; unit_price: number; total_price: number }[];
  }[];
  payments: AdminPayment[];
};

export type AdminDashboard = {
  today: string;
  orders_today: number;
  pending_verification: number;
  upcoming_orders: number;
  total_order_value: number;
  delivery_dates_configured: number;
  recent_orders: AdminOrderRow[];
  pending_orders: AdminOrderRow[];
};

export type AdminWeekSummary = {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: WeekStatus;
  notes: string | null;
  order_count: number;
};

export type BoxConfig = {
  name: string | null;
  description: string | null;
  /** A list of strings, or (older weeks) an object like {"fruits": 3}. */
  contents: unknown;
  price: number | null;
  is_available: boolean;
};

export type AddonConfig = { price: number | null; is_available: boolean };

export type WeekCheck = { label: string; ok: boolean; blocking: boolean; detail: string };

export type AdminWeekDate = {
  date: string;
  is_sunday: boolean;
  business_holiday: string | null;
  menu_date: { id: string; is_service_available: boolean; holiday_reason: string | null; cutoff_time: string | null } | null;
  order_count: number;
  box_overrides: (BoxConfig & { box_type_id: string })[];
  addon_overrides: (AddonConfig & { addon_id: string })[];
};

export type AdminWeek = {
  week: { id: string; week_start_date: string; week_end_date: string; status: WeekStatus; notes: string | null };
  settings: { default_cutoff_time: string; sunday_is_holiday: boolean };
  boxes: { box_type_id: string; code: string; box_name: string; config: BoxConfig | null }[];
  addons: { addon_id: string; code: string; addon_name: string; config: AddonConfig | null }[];
  dates: AdminWeekDate[];
  checks: WeekCheck[];
};

export type SaveWeekInput = {
  notes?: string;
  boxes: { box_type_id: string; name: string; description: string; contents: string[]; price: number | null; is_available: boolean }[];
  addons: { addon_id: string; price: number | null; is_available: boolean }[];
};

export type SaveDateInput = {
  is_service_available: boolean;
  holiday_reason: string;
  cutoff_time: string | null;
  box_overrides: {
    box_type_id: string;
    enabled: boolean;
    name: string;
    description: string;
    contents: string[];
    price: number | null;
    is_available: boolean;
  }[];
  addon_overrides: { addon_id: string; enabled: boolean; price: number | null; is_available: boolean }[];
};

/** An admin action failure with a message an admin can act on. */
export class AdminError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "AdminError";
  }
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
      throw new AdminError("The admin database functions aren't installed yet (run migration 0003_admin.sql).", "NOT_SET_UP");
    }
    if (error.code === "42501" || error.message === "NOT_ADMIN" || /permission denied/i.test(error.message)) {
      throw new AdminError("This account doesn't have admin access.", "NOT_ADMIN");
    }
    if (error.code === "P0001") throw new AdminError(error.details || error.message, error.message);
    throw new AdminError("Couldn't reach the server. Please try again.", "NETWORK");
  }
  return data as T;
}

export const adminApi = {
  dashboard: (c: SupabaseClient) => rpc<AdminDashboard>(c, "admin_dashboard"),
  listOrders: (c: SupabaseClient) => rpc<AdminOrderRow[]>(c, "admin_list_orders", { p_limit: 500, p_pending_only: false }),
  listPendingOrders: (c: SupabaseClient) => rpc<AdminOrderRow[]>(c, "admin_list_orders", { p_limit: 500, p_pending_only: true }),
  getOrder: (c: SupabaseClient, orderId: string) => rpc<AdminOrder>(c, "admin_get_order", { p_order_id: orderId }),
  reviewPayment: (c: SupabaseClient, paymentId: string, decision: "approve" | "reject", reason?: string) =>
    rpc<AdminOrder>(c, "admin_review_payment", { p_payment_id: paymentId, p_decision: decision, p_reason: reason ?? null }),
  setOrderStatus: (c: SupabaseClient, orderId: string, status: OrderStatus) =>
    rpc<AdminOrder>(c, "admin_set_order_status", { p_order_id: orderId, p_status: status }),
  listWeeks: (c: SupabaseClient) => rpc<AdminWeekSummary[]>(c, "admin_list_weeks"),
  getWeek: (c: SupabaseClient, weekId: string) => rpc<AdminWeek>(c, "admin_get_week", { p_week_id: weekId }),
  createWeek: (c: SupabaseClient, start: string, copyFrom: string | null, notes?: string) =>
    rpc<string>(c, "admin_create_week", { p_start: start, p_copy_from: copyFrom, p_notes: notes ?? null }),
  saveWeek: (c: SupabaseClient, weekId: string, input: SaveWeekInput) => rpc<AdminWeek>(c, "admin_save_week", { p_week_id: weekId, p: input }),
  setWeekStatus: (c: SupabaseClient, weekId: string, status: WeekStatus) =>
    rpc<AdminWeek>(c, "admin_set_week_status", { p_week_id: weekId, p_status: status }),
  saveDate: (c: SupabaseClient, weekId: string, date: string, input: SaveDateInput) =>
    rpc<AdminWeek>(c, "admin_save_date", { p_week_id: weekId, p_date: date, p: input }),
  isAdmin: async (c: SupabaseClient) => {
    const { data, error } = await c.rpc("is_admin");
    return !error && data === true;
  },
  /** Short-lived signed link to a private payment screenshot (admin-only storage policy). */
  screenshotUrl: async (c: SupabaseClient, path: string): Promise<string> => {
    const { data, error } = await c.storage.from(PAYMENT_SCREENSHOT_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) throw new AdminError("Couldn't open the screenshot (it may not have been uploaded).", "SCREENSHOT");
    return data.signedUrl;
  },
};

// ---------- display helpers ----------
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * The single next delivery step for an order (mirrors admin_set_order_status,
 * which enforces it): pending → confirmed → preparing → out_for_delivery →
 * delivered. Every step needs a verified payment.
 */
export function nextDeliveryStep(order: { order_status: OrderStatus; payment_status: OrderPaymentStatus }): { status: OrderStatus; label: string } | null {
  if (order.payment_status !== "paid") return null;
  switch (order.order_status) {
    case "pending":
      return { status: "confirmed", label: "Confirm" };
    case "confirmed":
      return { status: "preparing", label: "Preparing" };
    case "preparing":
      return { status: "out_for_delivery", label: "Out for Delivery" };
    case "out_for_delivery":
      return { status: "delivered", label: "Mark Delivered" };
    default:
      return null;
  }
}

/** Cancelling is allowed any time before delivery. */
export const canCancel = (s: OrderStatus) => s !== "delivered" && s !== "cancelled";

/** Google Maps link for exact coordinates (opened from the admin order page only). */
export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  payment_verification_pending: "Payment pending",
  paid: "Payment verified",
  rejected: "Payment rejected",
  refunded: "Refunded",
};

export function formatDateTimeIST(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDayIST(date: string, style: "long" | "short" = "short"): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: style,
    day: "numeric",
    month: "short",
  });
}

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
