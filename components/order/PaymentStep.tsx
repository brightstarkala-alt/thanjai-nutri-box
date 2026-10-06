"use client";

import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertTriangle, ArrowLeft, Check, ImageUp, LoaderCircle, Smartphone } from "lucide-react";
import { formatINR } from "@/lib/business-logic/pricing";
import {
  amountsMatch,
  isValidTransactionId,
  isValidUtr,
  toPaidAtIso,
  type ParsedPayment,
} from "@/lib/business-logic/payment-ocr";
import { buildUpiPaymentUri, isValidUpiId } from "@/lib/business-logic/upi";
import { readPaymentScreenshot } from "@/lib/ocr/read-payment-screenshot";
import type { DeliveryDetails } from "@/components/order/OrderReview";

const PAYEE_NAME = "Thanjai Healthy Plate";

type Field = keyof ParsedPayment;

/** Everything the payment step holds; kept by the page so Back/forward preserve it. */
export type PaymentDraft = {
  file: File | null;
  previewUrl: string | null;
  status: "idle" | "reading" | "read" | "failed";
  /** Values read from the screenshot (null = not found). */
  detected: ParsedPayment;
  /** Customer-typed values: only for fields that weren't detected, or that they chose to correct. */
  manual: Record<Field, string>;
  editing: Record<Field, boolean>;
  /** Duplicate-submit key, created on the first Submit and reused on retries. */
  requestId: string | null;
};

/** Payment details handed to order placement (the server re-checks all of it). */
export type SubmittedPayment = {
  amount: number;
  transactionId: string | null;
  utr: string | null;
  /** ISO timestamp (India time) when the screenshot shows a full date and time. */
  paidAt: string | null;
  screenshot: File;
};

const NO_FIELDS = { amount: null, transactionId: null, utr: null, paidAt: null };
const EMPTY_TEXT: Record<Field, string> = { amount: "", transactionId: "", utr: "", paidAt: "" };
const NOT_EDITING: Record<Field, boolean> = { amount: false, transactionId: false, utr: false, paidAt: false };

export const EMPTY_PAYMENT_DRAFT: PaymentDraft = {
  file: null,
  previewUrl: null,
  status: "idle",
  detected: NO_FIELDS,
  manual: EMPTY_TEXT,
  editing: NOT_EDITING,
  requestId: null,
};

/** The value actually used for a field: the customer's entry when typing, else what was detected. */
function effective(draft: PaymentDraft, field: Field): string | null {
  const typed = draft.editing[field] || draft.detected[field] == null;
  if (typed) return draft.manual[field].trim() || null;
  const value = draft.detected[field];
  return value == null ? null : String(value);
}

function parseAmount(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[₹,\s]|rs\.?/gi, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** First reason the payment can't be submitted yet, or null when it's ready. */
function blockingReason(draft: PaymentDraft, total: number): string | null {
  if (!draft.file) return "Upload your payment screenshot.";
  if (draft.status === "reading") return "Still reading your screenshot…";
  const amount = parseAmount(effective(draft, "amount"));
  if (amount == null) return "Enter the amount shown on your screenshot.";
  if (!amountsMatch(amount, total)) return "The paid amount doesn't match your order total. Please upload the correct screenshot.";
  const txn = effective(draft, "transactionId");
  const utr = effective(draft, "utr");
  if (!txn && !utr) return "Enter the transaction ID or the UTR / RRN from your screenshot.";
  if (utr && !isValidUtr(utr)) return "The UTR / RRN should be 12 digits.";
  if (txn && !isValidTransactionId(txn)) return "The transaction ID looks incomplete — please check it.";
  return null;
}

type PaymentStepProps = {
  planLabel: string;
  periodLabel?: string;
  /** The exact order total from the selection/review state — never recalculated here. */
  total: number;
  dateCount: number;
  details: DeliveryDetails;
  upiId: string | null;
  upiQrImageUrl: string | null;
  draft: PaymentDraft;
  setDraft: Dispatch<SetStateAction<PaymentDraft>>;
  onBack: () => void;
  /** Places the order; rejects with a customer-readable Error on failure. */
  onSubmit: (payment: SubmittedPayment, requestId: string) => Promise<void>;
};

export function PaymentStep({
  planLabel,
  periodLabel,
  total,
  dateCount,
  details,
  upiId,
  upiQrImageUrl,
  draft,
  setDraft,
  onBack,
  onSubmit,
}: PaymentStepProps) {
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Synchronous guard: a fast double tap can't start two submissions.
  const submittingRef = useRef(false);
  const upiUri = isValidUpiId(upiId)
    ? buildUpiPaymentUri({ upiId, payeeName: PAYEE_NAME, amount: total, note: `${PAYEE_NAME} order` })
    : null;

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setAttempted(false);
    setSubmitError(null);
    setDraft({
      ...EMPTY_PAYMENT_DRAFT,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "reading",
      // Same checkout: keep the duplicate-submit key across a re-upload.
      requestId: draft.requestId,
    });
    readPaymentScreenshot(file, total)
      .then((detected) => setDraft((d) => (d.file === file ? { ...d, status: "read", detected } : d)))
      .catch(() => setDraft((d) => (d.file === file ? { ...d, status: "failed" } : d)));
  }

  const setManual = (field: Field, value: string) => {
    setSubmitError(null);
    setDraft((d) => ({ ...d, manual: { ...d.manual, [field]: value } }));
  };
  const startEditing = (field: Field) =>
    setDraft((d) => ({
      ...d,
      editing: { ...d.editing, [field]: true },
      manual: { ...d.manual, [field]: d.detected[field] == null ? "" : String(d.detected[field]) },
    }));

  const reason = blockingReason(draft, total);
  const amount = parseAmount(effective(draft, "amount"));
  const amountChecked = draft.file && draft.status !== "reading" && amount != null;
  const amountOk = amountChecked && amountsMatch(amount, total);
  const noReference = draft.status !== "reading" && draft.file && !draft.detected.transactionId && !draft.detected.utr;

  async function handleSubmit() {
    setAttempted(true);
    if (reason || !draft.file || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const requestId = draft.requestId ?? crypto.randomUUID();
    if (!draft.requestId) setDraft((d) => ({ ...d, requestId }));
    try {
      // Not logged: payment details are sensitive. The server re-validates
      // everything and recalculates the total from the menu.
      await onSubmit(
        {
          amount: amount as number,
          transactionId: effective(draft, "transactionId"),
          utr: effective(draft, "utr"),
          paidAt: toPaidAtIso(effective(draft, "paidAt")),
          screenshot: draft.file,
        },
        requestId
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "We couldn't place your order. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="animate-float-in py-6 sm:py-8">
      <p className="text-sm font-semibold text-leaf">
        {planLabel}
        {periodLabel && <span className="font-normal text-ink-soft"> · {periodLabel}</span>}
      </p>

      {/* 1. Pay */}
      <div className="mt-3 rounded-2xl bg-surface p-5 text-center ring-1 ring-line-soft sm:p-6">
        <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Pay {formatINR(total)}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {dateCount} delivery date{dateCount === 1 ? "" : "s"} · for {details.name.trim()}
        </p>

        {upiUri ? (
          <>
            <UpiQr uri={upiUri} />
            <p className="mt-3 text-base font-medium text-ink">Scan this QR using any UPI app</p>
            <p className="mt-0.5 text-sm text-ink-soft">
              The amount {formatINR(total)} is filled in for you · paying {PAYEE_NAME}
            </p>
            <a
              href={upiUri}
              className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line-soft bg-surface-strong px-5 text-sm font-medium text-ink transition-colors hover:bg-leaf-soft sm:hidden"
            >
              <Smartphone className="size-4" /> Pay with a UPI app on this phone
            </a>
          </>
        ) : upiQrImageUrl ? (
          <>
            {/* Admin-provided static QR (cannot prefill the amount). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={upiQrImageUrl} alt="UPI QR code" className="mx-auto mt-5 size-56 rounded-xl bg-white object-contain p-2 ring-1 ring-line-soft" />
            <p className="mt-3 text-base font-medium text-ink">Scan this QR using any UPI app</p>
            <p className="mt-0.5 text-sm font-medium text-danger">Enter {formatINR(total)} as the amount in your UPI app.</p>
          </>
        ) : (
          <div className="mt-5 rounded-xl bg-surface-muted p-4 text-sm text-ink-soft">
            UPI payment isn&apos;t set up yet. The payment QR will appear here once Thanjai Healthy Plate adds
            its UPI ID.
          </div>
        )}
      </div>

      {/* 2. Upload */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-ink sm:text-xl">I&apos;ve paid</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          Upload the payment confirmation screenshot. We&apos;ll read the details for you — the screenshot is read on
          your device.
        </p>

        {!draft.file ? (
          <label className="mt-3 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-leaf px-6 text-base font-medium text-on-leaf transition-colors hover:bg-leaf-deep">
            <ImageUp className="size-5" /> Upload payment screenshot
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <div className="mt-3 flex items-center gap-4 rounded-2xl bg-surface p-3 ring-1 ring-line-soft">
            {draft.previewUrl && (
              // Local object URL of the customer's own file — never uploaded.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.previewUrl}
                alt="Your payment screenshot"
                className="h-32 w-20 shrink-0 rounded-lg bg-surface-muted object-cover object-top ring-1 ring-line-soft"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">Payment screenshot</p>
              <p className="truncate text-sm text-ink-soft">{draft.file.name}</p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line-soft bg-surface-strong px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-leaf-soft">
                <ImageUp className="size-4" /> Replace screenshot
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 3. Detected details */}
      {draft.file && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-ink sm:text-xl">Payment details</h2>
          {draft.status === "reading" ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface p-4 text-ink-soft ring-1 ring-line-soft" role="status">
              <LoaderCircle className="size-5 animate-spin text-leaf" /> Reading your screenshot…
            </div>
          ) : (
            <>
              {draft.status === "failed" && (
                <Notice tone="warn">
                  We couldn&apos;t read this screenshot automatically. Enter the details below, or upload a clearer
                  screenshot.
                </Notice>
              )}
              {draft.status === "read" && noReference && (
                <Notice tone="warn">We couldn&apos;t read the transaction reference from this screenshot.</Notice>
              )}

              <div className="mt-3 divide-y divide-line-soft rounded-2xl bg-surface px-4 ring-1 ring-line-soft">
                <DetailRow
                  label="Amount"
                  field="amount"
                  draft={draft}
                  // A detected amount is final: if it's wrong, upload the right screenshot.
                  allowEdit={false}
                  display={(v) => formatINR(Number(v))}
                  placeholder={`e.g. ${total}`}
                  inputMode="decimal"
                  onType={setManual}
                  onEdit={startEditing}
                />
                <DetailRow
                  label="Transaction ID"
                  field="transactionId"
                  draft={draft}
                  optionalWhenOtherFound={!!draft.detected.utr}
                  placeholder="As shown on the screenshot"
                  onType={setManual}
                  onEdit={startEditing}
                />
                <DetailRow
                  label="UTR / RRN"
                  field="utr"
                  draft={draft}
                  optionalWhenOtherFound={!!draft.detected.transactionId}
                  placeholder="12-digit number"
                  inputMode="numeric"
                  onType={setManual}
                  onEdit={startEditing}
                />
                <DetailRow
                  label="Payment date/time"
                  field="paidAt"
                  draft={draft}
                  optionalWhenOtherFound
                  placeholder="e.g. 12 Oct 2026, 7:45 pm"
                  onType={setManual}
                  onEdit={startEditing}
                />
              </div>

              {amountChecked &&
                (amountOk ? (
                  <Notice tone="ok">
                    <Check className="mr-1 inline size-4" /> Payment amount matches order total
                  </Notice>
                ) : (
                  <Notice tone="warn">
                    <p className="font-semibold">Payment amount does not match</p>
                    <p className="mt-1">
                      Expected: {formatINR(total)} · Detected: {formatINR(amount as number)}
                    </p>
                    <p className="mt-1">Please upload the screenshot for this payment, or correct the amount if it was read wrongly.</p>
                  </Notice>
                ))}
            </>
          )}
        </div>
      )}

      {/* 4. Submit */}
      {submitError && (
        <div className="mt-6 rounded-xl bg-surface-muted p-4 text-sm text-ink ring-1 ring-danger/40" role="alert">
          <p className="font-semibold">
            <AlertTriangle className="mr-1 inline size-4 text-danger" /> Your order was not placed
          </p>
          <p className="mt-1">{submitError}</p>
        </div>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-line-soft bg-surface px-6 text-base font-medium text-ink transition-colors hover:bg-leaf-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="size-5" /> Back to Review
        </button>
        {/* Submit only appears once there's a screenshot, so it's never confused with Upload. */}
        {draft.file && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={draft.status === "reading" || submitting}
            aria-busy={submitting}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-leaf px-8 text-base font-medium text-on-leaf transition-colors hover:bg-leaf-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <LoaderCircle className="size-5 animate-spin" /> Placing your order…
              </>
            ) : (
              "Submit Payment"
            )}
          </button>
        )}
      </div>
      {attempted && reason && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger sm:text-right">
          {reason}
        </p>
      )}
    </section>
  );
}

function UpiQr({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Generated locally from the business's own UPI link.
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(uri, { margin: 1, width: 480, errorCorrectionLevel: "M" }))
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return (
    <div className="mx-auto mt-5 grid size-56 place-items-center rounded-xl bg-white p-2 ring-1 ring-line-soft">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="UPI payment QR code" data-upi-uri={uri} className="size-full" />
      ) : (
        <LoaderCircle className="size-6 animate-spin text-leaf" />
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "warn"; children: ReactNode }) {
  return (
    <div
      className={`mt-3 rounded-xl p-3 text-sm ${
        tone === "ok" ? "bg-leaf-soft font-medium text-leaf-deep" : "bg-surface-muted text-ink ring-1 ring-danger/40"
      }`}
      role={tone === "warn" ? "alert" : "status"}
    >
      {tone === "warn" && <AlertTriangle className="mr-1 inline size-4 text-danger" />}
      {children}
    </div>
  );
}

/**
 * One payment detail. Detected → read-only with ✓ (and a small "Edit" to
 * correct an OCR misread). Not detected → an input for just that value;
 * when it's only an alternative to a value that *was* found, it's shown as
 * optional instead of being demanded.
 */
function DetailRow({
  label,
  field,
  draft,
  display = (v) => v,
  placeholder,
  inputMode,
  optionalWhenOtherFound = false,
  allowEdit = true,
  onType,
  onEdit,
}: {
  label: string;
  field: Field;
  draft: PaymentDraft;
  display?: (value: string) => string;
  placeholder: string;
  inputMode?: "decimal" | "numeric";
  optionalWhenOtherFound?: boolean;
  allowEdit?: boolean;
  onType: (field: Field, value: string) => void;
  onEdit: (field: Field) => void;
}) {
  const detected = draft.detected[field];
  const id = `payment-${field}`;
  const [adding, setAdding] = useState(false);

  if (detected != null && !draft.editing[field]) {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <span className="shrink-0 text-sm text-ink-soft">{label}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 break-all text-right font-semibold text-ink" data-field={field}>
            {display(String(detected))}
          </span>
          <Check className="size-4 shrink-0 text-leaf" aria-label="detected" />
          {allowEdit && (
            <button type="button" onClick={() => onEdit(field)} className="text-xs text-ink-soft underline underline-offset-2">
              Edit
            </button>
          )}
        </span>
      </div>
    );
  }

  if (optionalWhenOtherFound && !draft.editing[field] && !adding && !draft.manual[field]) {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className="flex items-center gap-2 text-sm text-ink-soft">
          Not on screenshot
          <button type="button" onClick={() => setAdding(true)} className="text-xs underline underline-offset-2">
            Add
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="py-3">
      <label htmlFor={id} className="text-sm text-ink-soft">
        {label} {draft.editing[field] ? "(corrected)" : "— enter manually"}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        value={draft.manual[field]}
        onChange={(e) => onType(field, e.target.value)}
        className="mt-1.5 block w-full rounded-xl border border-line-soft bg-surface-strong px-3.5 py-2.5 text-base text-ink placeholder:text-ink-soft/60 focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/25"
      />
    </div>
  );
}
