"use client";

import { useState } from "react";
import { Check, ExternalLink, Image as ImageIcon, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/business-logic/pricing";
import { adminApi, AdminError, formatDateTimeIST, type AdminOrder, type AdminPayment } from "@/lib/supabase/admin";
import { btn, input, Notice } from "@/components/admin/ui";

const PAYMENT_LABEL = { pending: "Payment verification pending", approved: "Payment verified", rejected: "Payment rejected" };

// One payment's details, its screenshot (private; opened through a
// short-lived signed link) and — while pending — Approve / Reject.
export function PaymentReview({
  payment,
  orderTotal,
  onReviewed,
}: {
  payment: AdminPayment;
  orderTotal: number;
  onReviewed: (order: AdminOrder) => void;
}) {
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountMatches = Math.round(Number(payment.amount) * 100) === Math.round(orderTotal * 100);

  async function openScreenshot() {
    if (!payment.screenshot_path) return;
    setShotError(null);
    try {
      setShotUrl(await adminApi.screenshotUrl(createClient(), payment.screenshot_path));
    } catch (e) {
      setShotError(e instanceof AdminError ? e.message : "Couldn't open the screenshot.");
    }
  }

  async function review(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      onReviewed(await adminApi.reviewPayment(createClient(), payment.id, decision, decision === "reject" ? reason : undefined));
      setRejecting(false);
    } catch (e) {
      setError(e instanceof AdminError ? e.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Amount", `${formatINR(Number(payment.amount))}${amountMatches ? " · matches order total" : " · DOES NOT match order total"}`],
    ["Transaction ID", payment.transaction_id ?? "—"],
    ["UTR / RRN", payment.utr_reference ?? "—"],
    ["Payment date/time", payment.paid_at ? formatDateTimeIST(payment.paid_at) : "Not shown on screenshot"],
    ["Submitted", formatDateTimeIST(payment.created_at)],
  ];

  return (
    <div className="space-y-4" data-payment-id={payment.id}>
      <p
        className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
          payment.payment_status === "pending"
            ? "bg-amber-100 text-amber-900 ring-amber-300"
            : payment.payment_status === "approved"
              ? "bg-leaf-soft text-leaf-deep ring-leaf/30"
              : "bg-red-50 text-red-800 ring-red-200"
        }`}
        data-payment-status={payment.payment_status}
      >
        {PAYMENT_LABEL[payment.payment_status]}
      </p>

      <dl className="divide-y divide-line-soft rounded-xl bg-surface-strong px-3 ring-1 ring-line-soft">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
            <dt className="text-ink-soft">{k}</dt>
            <dd className={`break-all text-right font-medium ${k === "Amount" && !amountMatches ? "text-danger" : "text-ink"}`}>{v}</dd>
          </div>
        ))}
      </dl>

      {payment.payment_status !== "pending" && (
        <p className="text-sm text-ink-soft">
          {payment.payment_status === "approved" ? "Verified" : "Rejected"}
          {payment.verified_by_name ? ` by ${payment.verified_by_name}` : ""}
          {payment.verified_at ? ` · ${formatDateTimeIST(payment.verified_at)}` : ""}
          {payment.rejection_reason ? ` · Reason: ${payment.rejection_reason}` : ""}
        </p>
      )}

      {/* Screenshot */}
      <div>
        {!payment.screenshot_path ? (
          <Notice tone="info">No screenshot on this payment.</Notice>
        ) : shotUrl ? (
          <div className="space-y-2">
            {/* Private file via a 5-minute signed link (admin-only storage policy). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shotUrl} alt="Payment screenshot" className="max-h-[70vh] w-auto max-w-full rounded-xl bg-surface-muted object-contain ring-1 ring-line-soft" />
            <a href={shotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-leaf-deep underline underline-offset-2">
              Open full size <ExternalLink className="size-3.5" />
            </a>
          </div>
        ) : (
          <button type="button" onClick={openScreenshot} className={btn.secondary}>
            <ImageIcon className="size-4" /> View screenshot
          </button>
        )}
        {shotError && <div className="mt-2"><Notice tone="error">{shotError}</Notice></div>}
      </div>

      {/* Actions */}
      {payment.payment_status === "pending" && (
        <div className="space-y-3 border-t border-line-soft pt-4">
          {!amountMatches && <Notice tone="error">The submitted amount doesn&apos;t match the order total — check the screenshot carefully.</Notice>}
          {rejecting ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-semibold text-ink">Reason for rejecting (required)</span>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. No matching payment received in the bank account"
                  className={`${input} mt-1.5`}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !reason.trim()} onClick={() => review("reject")} className={btn.danger}>
                  <X className="size-4" /> Confirm reject
                </button>
                <button type="button" disabled={busy} onClick={() => setRejecting(false)} className={btn.secondary}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => review("approve")} className={btn.primary}>
                <Check className="size-4" /> Approve Payment
              </button>
              <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={btn.danger}>
                <X className="size-4" /> Reject Payment
              </button>
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </div>
  );
}
