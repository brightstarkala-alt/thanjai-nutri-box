"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, ChevronRight, ExternalLink, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/business-logic/pricing";
import {
  adminApi,
  AdminError,
  canCancel,
  formatDateTimeIST,
  formatDayIST,
  googleMapsUrl,
  nextDeliveryStep,
  ORDER_STATUS_LABEL,
  type AdminOrder,
  type OrderStatus,
} from "@/lib/supabase/admin";
import { btn, Card, Loading, Notice, OrderBadge, PageTitle, PaymentBadge } from "@/components/admin/ui";
import { PaymentReview } from "@/components/admin/PaymentReview";

const STEPS: OrderStatus[] = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"];
const STEP_LABEL: Record<OrderStatus, string> = { ...ORDER_STATUS_LABEL, pending: "Payment pending" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    adminApi
      .getOrder(createClient(), id)
      .then(setOrder)
      .catch((e) => setError(e instanceof AdminError ? e.message : "Couldn't load this order."));
  }, [id]);

  async function changeStatus(status: OrderStatus) {
    setBusy(true);
    setStatusMsg(null);
    try {
      const updated = await adminApi.setOrderStatus(createClient(), id, status);
      setOrder(updated);
      setConfirmCancel(false);
      setStatusMsg({ tone: "ok", text: `Order marked ${ORDER_STATUS_LABEL[updated.order_status].toLowerCase()}.` });
    } catch (e) {
      setStatusMsg({ tone: "error", text: e instanceof AdminError ? e.message : "Couldn't update the status." });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!order) return <Loading />;

  const d = order.delivery ?? {};
  const landmark = d.landmark ?? d.instructions ?? order.address?.landmark ?? null;
  // The pin chosen for this order; fall back to the saved address's pin.
  const lat = d.latitude ?? order.address?.latitude ?? null;
  const lng = d.longitude ?? order.address?.longitude ?? null;
  const hasPin = lat != null && lng != null;
  const next = nextDeliveryStep(order);
  const stepIndex = STEPS.indexOf(order.order_status);

  return (
    <div className="space-y-5">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <PageTitle
        title={order.order_number}
        subtitle={`Ordered ${formatDateTimeIST(order.placed_at)} · ${order.plan_type} plan`}
        actions={
          <>
            <PaymentBadge status={order.payment_status} />
            <OrderBadge status={order.order_status} />
          </>
        }
      />

      {/* Delivery status */}
      <Card>
        <h2 className="font-semibold text-ink">Delivery status</h2>
        {order.order_status === "cancelled" ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-soft" data-testid="order-status">
            <Ban className="size-4" /> Cancelled
          </p>
        ) : (
          <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Delivery progress" data-testid="order-status" data-status={order.order_status}>
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${
                    i < stepIndex
                      ? "bg-leaf-soft text-leaf-deep ring-leaf/30"
                      : i === stepIndex
                        ? "bg-leaf text-on-leaf ring-leaf"
                        : "bg-surface-muted text-ink-soft ring-line-soft"
                  }`}
                  aria-current={i === stepIndex ? "step" : undefined}
                >
                  {STEP_LABEL[s]}
                </span>
                {i < STEPS.length - 1 && <ChevronRight className="size-3.5 text-ink-soft" />}
              </li>
            ))}
          </ol>
        )}

        {order.order_status === "delivered" && order.delivered_at && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-leaf-deep" data-testid="delivered-at">
            <CheckCircle2 className="size-4" /> Delivered {formatDateTimeIST(order.delivered_at)}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {next && (
            <button type="button" disabled={busy} onClick={() => changeStatus(next.status)} className={btn.primary}>
              {next.label}
            </button>
          )}
          {canCancel(order.order_status) &&
            (confirmCancel ? (
              <>
                <button type="button" disabled={busy} onClick={() => changeStatus("cancelled")} className={btn.danger}>
                  Yes, cancel order
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)} className={btn.secondary}>
                  Keep order
                </button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className={btn.secondary}>
                Cancel order
              </button>
            ))}
        </div>
        {!next && canCancel(order.order_status) && order.payment_status !== "paid" && (
          <p className="mt-2 text-sm text-ink-soft">
            {order.payment_status === "rejected"
              ? "Payment was rejected — the order can't move forward."
              : "Verify the payment below before confirming, preparing or delivering this order."}
          </p>
        )}
        {statusMsg && <div className="mt-3"><Notice tone={statusMsg.tone}>{statusMsg.text}</Notice></div>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-ink">Order</h2>
          <dl className="mt-2 divide-y divide-line-soft">
            <Row label="Order reference" value={order.order_number} />
            <Row label="Order date" value={formatDateTimeIST(order.placed_at)} />
            <Row label="Order status" value={ORDER_STATUS_LABEL[order.order_status]} />
            {order.delivered_at && <Row label="Delivered" value={formatDateTimeIST(order.delivered_at)} />}
            {Number(order.delivery_fee) > 0 && <Row label="Delivery fee" value={formatINR(Number(order.delivery_fee))} />}
            <Row label="Total" value={formatINR(Number(order.total_amount))} />
          </dl>
          <h2 className="mt-4 font-semibold text-ink">Customer</h2>
          <dl className="mt-2 divide-y divide-line-soft">
            <Row label="Name" value={d.name ?? order.customer?.full_name ?? "—"} />
            <Row label="Mobile" value={order.customer?.phone ?? d.phone ?? "—"} />
            {order.customer && <Row label="Orders from this mobile" value={String(order.customer.order_count)} />}
          </dl>
          {order.customer?.full_name && d.name && order.customer.full_name !== d.name && (
            <p className="mt-2 text-xs text-ink-soft">Saved profile name for this mobile: {order.customer.full_name}</p>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">Delivery</h2>
          <div className="mt-2 space-y-3 text-sm">
            <div>
              <p className="text-ink-soft">Delivery address</p>
              <p className="whitespace-pre-line font-medium text-ink" data-testid="delivery-address">
                {d.address ?? order.address?.address_line_1 ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-ink-soft">Landmark / instructions</p>
              <p className="font-medium text-ink">{landmark || "—"}</p>
            </div>
            <div>
              <p className="text-ink-soft">Delivery date(s)</p>
              <p className="font-medium text-ink">{order.dates.map((x) => formatDayIST(x.delivery_date)).join(", ")}</p>
            </div>
            {hasPin ? (
              <div className="rounded-xl bg-leaf-soft/50 p-3 ring-1 ring-leaf/30">
                <p className="flex items-center gap-1.5 font-semibold text-leaf-deep">
                  <MapPin className="size-4" /> Map location
                </p>
                <p className="mt-0.5 text-xs text-ink-soft" data-testid="delivery-coordinates">
                  {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
                </p>
                <a
                  href={googleMapsUrl(Number(lat), Number(lng))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${btn.primary} mt-2`}
                  data-testid="open-google-maps"
                >
                  <MapPin className="size-4" /> Open in Google Maps <ExternalLink className="size-3.5" />
                </a>
              </div>
            ) : (
              <p className="text-xs text-ink-soft">No map location was chosen for this order — use the address above.</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-ink">Items</h2>
        <div className="mt-3 space-y-4">
          {order.dates.map((day) => (
            <div key={day.delivery_date}>
              <div className="flex items-baseline justify-between">
                <p className="font-semibold text-ink">{formatDayIST(day.delivery_date, "long")}</p>
                <p className="font-serif text-base font-semibold text-ink">{formatINR(Number(day.total))}</p>
              </div>
              <ul className="mt-1 space-y-0.5">
                {day.items.map((i) => (
                  <li key={i.name} className="flex justify-between text-sm">
                    <span className="text-ink">
                      {i.name} <span className="text-ink-soft">× {i.quantity}</span>
                    </span>
                    <span className="text-ink-soft">{formatINR(Number(i.total_price))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="font-semibold text-leaf-deep">Total</span>
            <span className="font-serif text-xl font-semibold text-ink" data-testid="order-total">{formatINR(Number(order.total_amount))}</span>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-ink">Payment</h2>
        <div className="mt-3 space-y-6">
          {order.payments.length === 0 ? (
            <Notice tone="info">No payment submitted.</Notice>
          ) : (
            order.payments.map((p) => (
              <PaymentReview key={p.id} payment={p} orderTotal={Number(order.total_amount)} onReviewed={setOrder} />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
