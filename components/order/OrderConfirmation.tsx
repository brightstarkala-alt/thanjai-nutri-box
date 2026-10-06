import { AlertTriangle, Check, Clock3, LoaderCircle, RotateCcw } from "lucide-react";
import { formatINR } from "@/lib/business-logic/pricing";
import type { PlacedOrder } from "@/lib/supabase/place-order";
import { formatReviewDate } from "@/components/order/dayLabels";

export type ScreenshotUploadStatus = "uploading" | "uploaded" | "failed";

type OrderConfirmationProps = {
  /** Exactly what the database saved (prices/totals recalculated there). */
  order: PlacedOrder;
  planLabel: string;
  screenshotStatus: ScreenshotUploadStatus;
  onRetryUpload: () => void;
  onNewOrder: () => void;
};

const PLAN_LABEL: Record<PlacedOrder["planType"], string> = {
  daily: "Daily order",
  weekly: "Weekly plan",
  monthly: "Monthly plan",
};

function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OrderConfirmation({ order, planLabel, screenshotStatus, onRetryUpload, onNewOrder }: OrderConfirmationProps) {
  return (
    <section className="animate-float-in py-6 sm:py-8">
      <div className="rounded-2xl bg-surface p-5 text-center ring-1 ring-line-soft sm:p-6">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-leaf text-on-leaf">
          <Check className="size-7" strokeWidth={2.5} />
        </span>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-ink sm:text-4xl">Order placed successfully</h1>
        <p className="mt-2 text-base text-ink-soft">
          We have received your payment details. Your order will be confirmed after payment verification.
        </p>

        <dl className="mx-auto mt-5 grid max-w-md gap-2 text-left text-sm">
          <div className="flex justify-between gap-3 rounded-xl bg-surface-muted px-4 py-3">
            <dt className="text-ink-soft">Order reference</dt>
            <dd className="font-semibold tracking-wide text-ink" data-testid="order-number">
              {order.orderNumber}
            </dd>
          </div>
          <div className="flex justify-between gap-3 px-4">
            <dt className="text-ink-soft">Order date</dt>
            <dd className="text-ink">{formatOrderDate(order.placedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3 px-4">
            <dt className="text-ink-soft">Plan</dt>
            <dd className="text-ink">{PLAN_LABEL[order.planType] ?? planLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4">
            <dt className="text-ink-soft">Payment status</dt>
            <dd className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 font-medium text-ink ring-1 ring-line-soft">
              <Clock3 className="size-4 text-leaf" /> Payment verification pending
            </dd>
          </div>
        </dl>

        {screenshotStatus === "uploading" && (
          <p className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 text-sm text-ink-soft" role="status">
            <LoaderCircle className="size-4 animate-spin text-leaf" /> Sending your payment screenshot…
          </p>
        )}
        {screenshotStatus === "uploaded" && (
          <p className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 text-sm text-leaf-deep" role="status">
            <Check className="size-4" /> Payment screenshot received
          </p>
        )}
        {screenshotStatus === "failed" && (
          <div className="mx-auto mt-4 max-w-md rounded-xl bg-surface-muted p-3 text-left text-sm text-ink ring-1 ring-danger/40" role="alert">
            <p>
              <AlertTriangle className="mr-1 inline size-4 text-danger" />
              Your order is placed, but we couldn&apos;t send your payment screenshot.
            </p>
            <button
              type="button"
              onClick={onRetryUpload}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface-strong px-3 py-2 font-medium text-ink transition-colors hover:bg-leaf-soft"
            >
              <RotateCcw className="size-4" /> Try sending it again
            </button>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ink sm:text-xl">
          {order.dates.length} delivery date{order.dates.length === 1 ? "" : "s"}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {order.dates.map((d) => (
            <div key={d.date} className="rounded-2xl bg-surface p-4 ring-1 ring-line-soft">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-ink">{formatReviewDate(d.date)}</p>
                <p className="shrink-0 font-serif text-lg font-semibold text-ink">{formatINR(d.total)}</p>
              </div>
              <ul className="mt-2 space-y-1">
                {d.items.map((item) => (
                  <li key={item.name} className="flex justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {item.name} <span className="text-ink-soft">× {item.quantity}</span>
                    </span>
                    <span className="text-ink-soft">{formatINR(item.totalPrice)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-leaf-soft p-5">
        {order.deliveryFee > 0 && (
          <div className="mb-2 flex justify-between text-sm text-ink">
            <span>Delivery fee</span>
            <span>{formatINR(order.deliveryFee)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold text-leaf-deep">Total amount</span>
          <span className="font-serif text-2xl font-semibold text-ink" data-testid="order-total">
            {formatINR(order.total)}
          </span>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">Please keep your order reference for any questions.</p>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={onNewOrder}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-line-soft bg-surface px-6 text-base font-medium text-ink transition-colors hover:bg-leaf-soft"
        >
          Place another order
        </button>
      </div>
    </section>
  );
}
