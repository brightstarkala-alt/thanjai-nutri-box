import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin } from "lucide-react";
import type { DateSubtotal } from "@/lib/business-logic/daily-order";
import { formatINR } from "@/lib/business-logic/pricing";
import { formatReviewDate } from "@/components/order/dayLabels";
import { LocationPicker, type DeliveryPin } from "@/components/order/LocationPicker";

export type DeliveryDetails = {
  name: string;
  mobile: string;
  address: string;
  instructions: string;
  /** Optional exact delivery spot chosen on the map (used only for delivery). */
  pin: DeliveryPin | null;
};

export const EMPTY_DELIVERY_DETAILS: DeliveryDetails = { name: "", mobile: "", address: "", instructions: "", pin: null };

type FieldErrors = Partial<Record<keyof DeliveryDetails, string>>;

/**
 * Required: name, mobile, address. The mobile number identifies the
 * customer, so it must be a valid Indian mobile (10 digits starting 6–9,
 * optional +91 / spaces) — the same rule place_customer_order applies.
 */
export function validateDeliveryDetails(details: DeliveryDetails): FieldErrors {
  const errors: FieldErrors = {};
  if (!details.name.trim()) errors.name = "Please enter your name.";
  const digits = details.mobile.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!details.mobile.trim()) errors.mobile = "Please enter your mobile number.";
  else if (!/^[6-9]\d{9}$/.test(digits)) errors.mobile = "Please enter a valid 10-digit mobile number.";
  if (!details.address.trim()) errors.address = "Please enter your delivery address.";
  return errors;
}

type OrderReviewProps = {
  /** e.g. "Daily order", "Weekly plan", "Monthly plan" */
  planLabel: string;
  /** e.g. "Mon 12 Oct – Sat 17 Oct" or "October 2026" */
  periodLabel?: string;
  /** Delivery dates of the active plan, priced by the same calculateDateSubtotal the selection step uses. */
  dates: DateSubtotal[];
  total: number;
  details: DeliveryDetails;
  onDetailsChange: (details: DeliveryDetails) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function OrderReview({
  planLabel,
  periodLabel,
  dates,
  total,
  details,
  onDetailsChange,
  onBack,
  onContinue,
}: OrderReviewProps) {
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateDeliveryDetails(details) : {};
  const set = (field: keyof DeliveryDetails) => (value: string) => onDetailsChange({ ...details, [field]: value });

  function handleContinue() {
    setAttempted(true);
    if (Object.keys(validateDeliveryDetails(details)).length === 0) onContinue();
  }

  return (
    <section className="animate-float-in py-6 sm:py-8">
      <p className="text-sm font-semibold text-leaf">
        {planLabel}
        {periodLabel && <span className="font-normal text-ink-soft"> · {periodLabel}</span>}
      </p>
      <h1 className="mt-1 font-serif text-3xl font-semibold text-ink sm:text-4xl">Review your order</h1>
      <p className="mt-2 text-base text-ink-soft">Check your boxes, then tell us where to deliver.</p>

      {/* 1. Delivery dates */}
      <div className="mt-8">
        <SectionTitle icon={<CalendarDays />}>
          {dates.length} delivery date{dates.length === 1 ? "" : "s"}
        </SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {dates.map((d) => (
            <div key={d.date} className="rounded-2xl bg-surface p-4 ring-1 ring-line-soft">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-ink">{formatReviewDate(d.date)}</p>
                <p className="shrink-0 font-serif text-lg font-semibold text-ink">{formatINR(d.total)}</p>
              </div>
              <ul className="mt-2 space-y-1">
                {[...d.boxLines, ...d.addOnLines].map((line) => (
                  <li key={line.name} className="flex justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {line.name} <span className="text-ink-soft">× {line.quantity}</span>
                    </span>
                    <span className="text-ink-soft">{formatINR(line.unitPrice * line.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Total */}
      <div className="mt-4 rounded-2xl bg-leaf-soft p-5">
        <div className="flex justify-between text-base text-ink">
          <span>Subtotal</span>
          <span>{formatINR(total)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-leaf/20 pt-2">
          <span className="text-lg font-semibold text-leaf-deep">Total</span>
          <span className="font-serif text-2xl font-semibold text-ink">{formatINR(total)}</span>
        </div>
      </div>

      {/* 3. Delivery details (local only — not saved yet) */}
      <div className="mt-8">
        <SectionTitle icon={<MapPin />}>Delivery details</SectionTitle>
        <div className="mt-4 space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-line-soft sm:p-5">
          <Field label="Name" id="name" error={errors.name}>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={details.name}
              onChange={(e) => set("name")(e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              className={inputClass(!!errors.name)}
            />
          </Field>
          <Field label="Mobile number" id="mobile" error={errors.mobile}>
            <input
              id="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="10-digit mobile number"
              value={details.mobile}
              onChange={(e) => set("mobile")(e.target.value)}
              aria-invalid={!!errors.mobile}
              aria-describedby={errors.mobile ? "mobile-error" : undefined}
              className={inputClass(!!errors.mobile)}
            />
          </Field>
          <Field label="Delivery address" id="address" error={errors.address}>
            <textarea
              id="address"
              rows={3}
              autoComplete="street-address"
              value={details.address}
              onChange={(e) => set("address")(e.target.value)}
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? "address-error" : undefined}
              className={`${inputClass(!!errors.address)} resize-y`}
            />
          </Field>
          <LocationPicker
            pin={details.pin}
            address={details.address}
            onPinChange={(pin, address) => onDetailsChange({ ...details, pin, ...(address !== undefined && { address }) })}
            onUseAddress={(address) => onDetailsChange({ ...details, address })}
          />
          <Field label="Landmark / delivery instructions" optional id="instructions">
            <input
              id="instructions"
              type="text"
              value={details.instructions}
              onChange={(e) => set("instructions")(e.target.value)}
              className={inputClass(false)}
            />
          </Field>
        </div>
      </div>

      {/* 4. Buttons */}
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-line-soft bg-surface px-6 text-base font-medium text-ink transition-colors hover:bg-leaf-soft"
        >
          <ArrowLeft className="size-5" /> Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-leaf px-8 text-base font-medium text-on-leaf transition-colors hover:bg-leaf-deep"
        >
          Continue to Payment <ArrowRight className="size-5" />
        </button>
      </div>
      {attempted && Object.keys(errors).length > 0 && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger sm:text-right">
          Please fill in the highlighted delivery details.
        </p>
      )}
    </section>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold text-ink sm:text-xl">
      <span className="text-leaf [&_svg]:size-5">{icon}</span>
      {children}
    </h2>
  );
}

function Field({
  label,
  id,
  optional = false,
  error,
  children,
}: {
  label: string;
  id: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label} {optional && <span className="font-normal text-ink-soft">(optional)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(invalid: boolean) {
  return `block w-full rounded-xl border bg-surface-strong px-3.5 py-3 text-base text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 ${
    invalid ? "border-danger focus:ring-danger/30" : "border-line-soft focus:border-leaf focus:ring-leaf/25"
  }`;
}
