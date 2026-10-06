"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminApi, AdminError, todayIST, type AdminOrderRow } from "@/lib/supabase/admin";
import { input, Loading, Notice, PageTitle } from "@/components/admin/ui";
import { OrderRowCard } from "@/components/admin/OrderRowCard";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Payment Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;
// Reached from the dashboard's "Upcoming orders" tile; shown as a chip only while active.
const UPCOMING = { key: "upcoming", label: "Upcoming delivery" } as const;
type FilterKey = (typeof FILTERS)[number]["key"] | typeof UPCOMING.key;

function matches(o: AdminOrderRow, f: FilterKey, today: string): boolean {
  switch (f) {
    case "pending":
      return o.payment_status === "payment_verification_pending" && o.order_status !== "cancelled";
    case "upcoming":
      return o.order_status !== "cancelled" && o.order_status !== "delivered" && o.delivery_dates.some((d) => d >= today);
    case "all":
      return true;
    default:
      return o.order_status === f;
  }
}

function OrdersList() {
  const initial = useSearchParams().get("filter") as FilterKey | null;
  const [orders, setOrders] = useState<AdminOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>(
    initial === UPCOMING.key || FILTERS.some((f) => f.key === initial) ? (initial as FilterKey) : "all"
  );
  const [query, setQuery] = useState("");
  const today = todayIST();

  useEffect(() => {
    adminApi
      .listOrders(createClient())
      .then(setOrders)
      .catch((e) => setError(e instanceof AdminError ? e.message : "Couldn't load orders."));
  }, []);

  const shown = useMemo(() => {
    if (!orders) return [];
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return orders.filter(
      (o) =>
        matches(o, filter, today) &&
        (!q ||
          o.order_number.toLowerCase().includes(q) ||
          (o.customer_name ?? "").toLowerCase().includes(q) ||
          (qDigits.length >= 3 && (o.phone ?? "").replace(/\D/g, "").includes(qDigits)))
    );
  }, [orders, filter, query, today]);

  return (
    <div className="space-y-4">
      <PageTitle title="Orders" subtitle="Newest first" />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search order reference, name or mobile"
          aria-label="Search orders"
          className={`${input} pl-9`}
        />
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter orders">
        {[...FILTERS, ...(filter === UPCOMING.key ? [UPCOMING] : [])].map((f) => {
          const count = orders ? orders.filter((o) => matches(o, f.key, today)).length : null;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
                filter === f.key ? "bg-leaf text-on-leaf ring-leaf" : "bg-surface text-ink ring-line-soft hover:bg-leaf-soft"
              }`}
            >
              {f.label}
              {count != null && <span className="ml-1.5 opacity-75">{count}</span>}
            </button>
          );
        })}
      </div>
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !orders ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Notice tone="info">No orders match.</Notice>
      ) : (
        <div className="space-y-2">
          {shown.map((o) => (
            <OrderRowCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrdersList />
    </Suspense>
  );
}
