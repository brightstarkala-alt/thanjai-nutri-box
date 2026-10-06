import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoxId } from "@/lib/types";
import type { DateSubtotal } from "@/lib/business-logic/daily-order";

// Checkout without login through the place_customer_order database function (see
// supabase/migrations/0002_customer_checkout.sql). The browser sends only the
// customer's choices — dates, box codes, add-on ids and quantities — plus
// the payment details. Prices and the total are recalculated in the
// database from the menu tables; nothing price-related is sent.

export const PAYMENT_SCREENSHOT_BUCKET = "payment-screenshots";

const BOX_CODE: Record<BoxId, string> = { "box-1": "BOX_1", "box-2": "BOX_2" };

export type CustomerOrderRequest = {
  requestId: string;
  planType: "daily" | "weekly" | "monthly";
  /** latitude/longitude: optional exact delivery pin from the map (null if not chosen). */
  customer: { name: string; mobile: string; address: string; instructions: string; latitude: number | null; longitude: number | null };
  /** The order's delivery dates; only their quantities are sent. */
  dates: DateSubtotal[];
  payment: {
    amount: number;
    utr: string | null;
    transactionId: string | null;
    paidAt: string | null;
    screenshot: File;
  };
};

export type PlacedOrder = {
  orderId: string;
  orderNumber: string;
  placedAt: string;
  planType: "daily" | "weekly" | "monthly";
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentStatus: string;
  screenshotUploadPath: string;
  dates: {
    date: string;
    total: number;
    items: { name: string; itemType: "box" | "addon"; quantity: number; unitPrice: number; totalPrice: number }[];
  }[];
};

/** An order-placement failure with a message the customer can act on. */
export class OrderSubmitError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** Order total recalculated by the database, when the amount didn't match. */
    readonly serverTotal: number | null = null
  ) {
    super(message);
    this.name = "OrderSubmitError";
  }
}

export function screenshotExtension(file: File): string {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  if (byType[file.type]) return byType[file.type];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpeg" ? "jpg" : ext;
}

type RawOrder = {
  order_id: string;
  order_number: string;
  placed_at: string;
  plan_type: PlacedOrder["planType"];
  subtotal: number | string;
  delivery_fee: number | string;
  total_amount: number | string;
  payment_status: string;
  screenshot_upload_path: string;
  dates: {
    delivery_date: string;
    total: number | string;
    items: { name: string; item_type: "box" | "addon"; quantity: number; unit_price: number | string; total_price: number | string }[];
  }[];
};

function toPlacedOrder(raw: RawOrder): PlacedOrder {
  return {
    orderId: raw.order_id,
    orderNumber: raw.order_number,
    placedAt: raw.placed_at,
    planType: raw.plan_type,
    subtotal: Number(raw.subtotal),
    deliveryFee: Number(raw.delivery_fee),
    total: Number(raw.total_amount),
    paymentStatus: raw.payment_status,
    screenshotUploadPath: raw.screenshot_upload_path,
    dates: raw.dates.map((d) => ({
      date: d.delivery_date,
      total: Number(d.total),
      items: d.items.map((i) => ({
        name: i.name,
        itemType: i.item_type,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
        totalPrice: Number(i.total_price),
      })),
    })),
  };
}

const FRIENDLY: Record<string, string> = {
  PAYMENT_AMOUNT_MISMATCH: "The paid amount doesn't match the order total.",
  DUPLICATE_PAYMENT_REFERENCE: "This payment has already been used for another order. Please check your screenshot.",
  TOO_MANY_ORDERS: "Too many orders from this mobile number in the last hour. Please try again later.",
};

/** Creates the order, its items and a pending payment in one database transaction. */
export async function placeCustomerOrder(client: SupabaseClient, req: CustomerOrderRequest): Promise<PlacedOrder> {
  const payload = {
    client_request_id: req.requestId,
    plan_type: req.planType,
    customer: req.customer,
    dates: req.dates.map((d) => ({
      date: d.date,
      boxes: Object.fromEntries(d.boxLines.map((l) => [BOX_CODE[l.boxId], l.quantity])),
      addons: Object.fromEntries(d.addOnLines.map((l) => [l.addOnId, l.quantity])),
    })),
    payment: {
      amount: req.payment.amount,
      utr: req.payment.utr,
      transaction_id: req.payment.transactionId,
      paid_at: req.payment.paidAt,
      screenshot_ext: screenshotExtension(req.payment.screenshot),
    },
  };

  const { data, error } = await client.rpc("place_customer_order", { p_order: payload });
  if (error) {
    // PostgREST: the function doesn't exist yet (migration not run).
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
      throw new OrderSubmitError("Online ordering isn't switched on yet. Please try again later.", "NOT_SET_UP");
    }
    // Our own checkout errors: message = code, details = readable text.
    if (error.code === "P0001") {
      const serverTotal = error.message === "PAYMENT_AMOUNT_MISMATCH" && error.hint ? Number(error.hint) : null;
      throw new OrderSubmitError(FRIENDLY[error.message] ?? error.details ?? "We couldn't place your order.", error.message, serverTotal);
    }
    throw new OrderSubmitError(
      "We couldn't reach the server. Please check your connection and try again — your details are kept.",
      "NETWORK"
    );
  }
  return toPlacedOrder(data as RawOrder);
}

/**
 * Uploads the payment screenshot to the private path the database reserved
 * for this payment. No overwrite; retried a few times. An "already exists"
 * response means an earlier attempt succeeded.
 */
export async function uploadPaymentScreenshot(client: SupabaseClient, path: string, file: File): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await client.storage
      .from(PAYMENT_SCREENSHOT_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: "0" });
    if (!error) return true;
    if (/exists|duplicate/i.test(error.message)) return true;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  return false;
}
