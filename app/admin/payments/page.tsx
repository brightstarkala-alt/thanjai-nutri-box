"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/business-logic/pricing";
import { adminApi, AdminError, formatDateTimeIST, formatDayIST, type AdminOrder } from "@/lib/supabase/admin";
import { Card, Loading, Notice, PageTitle } from "@/components/admin/ui";
import { PaymentReview } from "@/components/admin/PaymentReview";

// All orders whose payment is waiting for verification, each with its
// screenshot and Approve / Reject right here.
export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    adminApi
      .listPendingOrders(supabase)
      .then((pending) => Promise.all(pending.filter((o) => o.order_status !== "cancelled").map((o) => adminApi.getOrder(supabase, o.id))))
      .then(setOrders)
      .catch((e) => setError(e instanceof AdminError ? e.message : "Couldn't load payments."));
  }, []);

  function onReviewed(updated: AdminOrder) {
    setOrders((list) => list?.map((o) => (o.id === updated.id ? updated : o)) ?? null);
    setDone((d) => [...d, updated.id]);
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!orders) return <Loading />;
  const stillPending = orders.filter((o) => !done.includes(o.id)).length;

  return (
    <div className="space-y-4">
      <PageTitle title="Payments" subtitle={`${stillPending} payment${stillPending === 1 ? "" : "s"} waiting for verification`} />
      {orders.length === 0 && <Notice tone="ok">No payments waiting for verification.</Notice>}
      {orders.map((o) => {
        const payment = o.payments[0];
        return (
          <Card key={o.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/admin/orders/${o.id}`} className="font-semibold tracking-wide text-ink underline-offset-2 hover:underline">
                {o.order_number}
              </Link>
              <span className="font-serif text-lg font-semibold text-ink">{formatINR(Number(o.total_amount))}</span>
            </div>
            <p className="text-sm text-ink">
              {o.delivery?.name ?? o.customer?.full_name ?? "—"} <span className="text-ink-soft">· {o.customer?.phone ?? o.delivery?.phone ?? "—"}</span>
            </p>
            <p className="text-xs text-ink-soft">
              Delivery {o.dates.map((d) => formatDayIST(d.delivery_date)).join(", ")} · ordered {formatDateTimeIST(o.placed_at)}
            </p>
            <div className="mt-4">
              {payment ? (
                <PaymentReview payment={payment} orderTotal={Number(o.total_amount)} onReviewed={onReviewed} />
              ) : (
                <Notice tone="info">No payment submitted.</Notice>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
