import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderPaymentStatus,
  type OrderStatus,
  type WeekStatus,
} from "@/lib/supabase/admin";

// Small shared pieces for the admin pages (same palette as the customer app).

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-leaf px-4 py-2 text-sm font-semibold text-on-leaf transition-colors hover:bg-leaf-deep disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-leaf-soft disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-danger/40 bg-surface px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50",
};

export const input =
  "block w-full rounded-xl border border-line-soft bg-surface-strong px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/25 disabled:opacity-60";

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface p-4 ring-1 ring-line-soft sm:p-5 ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
        checked ? "bg-leaf text-on-leaf" : "bg-surface-muted text-ink-soft ring-1 ring-line-soft"
      }`}
    >
      <span className={`size-2.5 rounded-full ${checked ? "bg-on-leaf" : "bg-ink-soft/50"}`} />
      {checked ? "Available" : "Unavailable"}
    </button>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-ink-soft" role="status">
      <LoaderCircle className="size-5 animate-spin text-leaf" /> {text}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "error" | "info"; children: ReactNode }) {
  const styles = {
    ok: "bg-leaf-soft text-leaf-deep",
    error: "bg-surface-muted text-ink ring-1 ring-danger/40",
    info: "bg-surface-muted text-ink-soft",
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${styles}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "ok" && <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
      {tone === "error" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const PAYMENT_TONE: Record<OrderPaymentStatus, string> = {
  payment_verification_pending: "bg-amber-100 text-amber-900 ring-amber-300",
  paid: "bg-leaf-soft text-leaf-deep ring-leaf/30",
  rejected: "bg-red-50 text-red-800 ring-red-200",
  refunded: "bg-surface-muted text-ink-soft ring-line-soft",
};

export function PaymentBadge({ status }: { status: OrderPaymentStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${PAYMENT_TONE[status]}`}>
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

export function OrderBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === "cancelled"
      ? "bg-red-50 text-red-800 ring-red-200"
      : status === "delivered"
        ? "bg-leaf text-on-leaf ring-leaf"
        : status === "pending"
          ? "bg-surface-muted text-ink ring-line-soft"
          : status === "out_for_delivery"
            ? "bg-amber-50 text-amber-900 ring-amber-200"
            : "bg-leaf-soft text-leaf-deep ring-leaf/30";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone}`}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

export function WeekBadge({ status }: { status: WeekStatus }) {
  const tone = {
    draft: "bg-surface-muted text-ink ring-line-soft",
    published: "bg-leaf text-on-leaf ring-leaf",
    closed: "bg-surface-muted text-ink-soft ring-line-soft",
  }[status];
  const label = { draft: "Draft", published: "Published", closed: "Closed" }[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone}`}>{label}</span>;
}
