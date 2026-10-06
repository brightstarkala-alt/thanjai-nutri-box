import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatINR } from "@/lib/business-logic/pricing";
import { formatDateTimeIST, formatDayIST, type AdminOrderRow } from "@/lib/supabase/admin";
import { OrderBadge, PaymentBadge } from "@/components/admin/ui";

function deliverySummary(dates: string[]): string {
  if (dates.length === 0) return "—";
  if (dates.length === 1) return formatDayIST(dates[0]);
  return `${formatDayIST(dates[0])} – ${formatDayIST(dates[dates.length - 1])} · ${dates.length} dates`;
}

// One order as a tappable card (works on mobile; no wide table).
export function OrderRowCard({ order }: { order: AdminOrderRow }) {
  return (
    <Link
      href={`/admin/orders/${order.id}`}
      className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line-soft transition-colors hover:bg-leaf-soft/40"
      data-order-number={order.order_number}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold tracking-wide text-ink">{order.order_number}</span>
          <span className="font-serif text-lg font-semibold text-ink">{formatINR(Number(order.total_amount))}</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-ink">
          {order.customer_name ?? "—"} <span className="text-ink-soft">· {order.phone ?? "—"}</span>
        </p>
        <p className="text-xs text-ink-soft">
          Delivery: {deliverySummary(order.delivery_dates)} · ordered {formatDateTimeIST(order.placed_at)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <PaymentBadge status={order.payment_status} />
          <OrderBadge status={order.order_status} />
          <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium capitalize text-ink-soft ring-1 ring-line-soft">
            {order.plan_type}
          </span>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-ink-soft" />
    </Link>
  );
}
