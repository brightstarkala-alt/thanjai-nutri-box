"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ClipboardList, Clock3, IndianRupee, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminApi, AdminError, type AdminDashboard } from "@/lib/supabase/admin";
import { formatINR } from "@/lib/business-logic/pricing";
import { Loading, Notice, PageTitle } from "@/components/admin/ui";
import { OrderRowCard } from "@/components/admin/OrderRowCard";

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .dashboard(createClient())
      .then(setData)
      .catch((e) => setError(e instanceof AdminError ? e.message : "Couldn't load the dashboard."));
  }, []);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;

  const cards = [
    { label: "Orders today", value: String(data.orders_today), icon: ClipboardList, href: "/admin/orders" },
    { label: "Pending payment verification", value: String(data.pending_verification), icon: Clock3, href: "/admin/payments", highlight: data.pending_verification > 0 },
    { label: "Upcoming orders", value: String(data.upcoming_orders), icon: Truck, href: "/admin/orders?filter=upcoming" },
    { label: "Total order value", value: formatINR(Number(data.total_order_value)), icon: IndianRupee, href: "/admin/orders" },
    { label: "Delivery dates open (next 60 days)", value: String(data.delivery_dates_configured), icon: CalendarCheck, href: "/admin/menu" },
  ];

  return (
    <div className="space-y-6">
      <PageTitle title="Dashboard" subtitle="Today at Thanjai Healthy Plate" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, href, highlight }) => (
          <Link
            key={label}
            href={href}
            className={`rounded-2xl p-4 ring-1 transition-colors ${highlight ? "bg-amber-50 ring-amber-300 hover:bg-amber-100" : "bg-surface ring-line-soft hover:bg-leaf-soft/40"}`}
            data-card={label}
          >
            <Icon className={`size-5 ${highlight ? "text-amber-700" : "text-leaf"}`} />
            <p className="mt-2 font-serif text-2xl font-semibold text-ink" data-value>{value}</p>
            <p className="text-xs text-ink-soft">{label}</p>
          </Link>
        ))}
      </div>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">Needs payment verification</h2>
          <Link href="/admin/payments" className="text-sm font-medium text-leaf-deep underline underline-offset-2">
            All pending
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {data.pending_orders.length === 0 ? (
            <Notice tone="ok">No payments waiting for verification.</Notice>
          ) : (
            data.pending_orders.map((o) => <OrderRowCard key={o.id} order={o} />)
          )}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">Recent orders</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-leaf-deep underline underline-offset-2">
            All orders
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {data.recent_orders.length === 0 ? (
            <Notice tone="info">No orders yet.</Notice>
          ) : (
            data.recent_orders.map((o) => <OrderRowCard key={o.id} order={o} />)
          )}
        </div>
      </section>
    </div>
  );
}
