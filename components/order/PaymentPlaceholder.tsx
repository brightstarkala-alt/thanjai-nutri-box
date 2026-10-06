import { ArrowLeft, Clock3 } from "lucide-react";
import { formatINR } from "@/lib/business-logic/pricing";
import type { DeliveryDetails } from "@/components/order/OrderReview";

type PaymentPlaceholderProps = {
  planLabel: string;
  periodLabel?: string;
  total: number;
  dateCount: number;
  details: DeliveryDetails;
  onBack: () => void;
};

// Placeholder for the upcoming payment step. Nothing is charged or saved.
export function PaymentPlaceholder({ planLabel, periodLabel, total, dateCount, details, onBack }: PaymentPlaceholderProps) {
  return (
    <section className="animate-float-in py-6 sm:py-8">
      <p className="text-sm font-semibold text-leaf">
        {planLabel}
        {periodLabel && <span className="font-normal text-ink-soft"> · {periodLabel}</span>}
      </p>
      <h1 className="mt-1 font-serif text-3xl font-semibold text-ink sm:text-4xl">Payment</h1>

      <div className="mt-6 rounded-2xl bg-leaf-soft p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base text-ink">
            {dateCount} delivery date{dateCount === 1 ? "" : "s"} · for {details.name.trim()}
          </span>
          <span className="font-serif text-2xl font-semibold text-ink">{formatINR(total)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-soft">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-leaf" />
        <p>Payment step coming next. Your order has not been placed and nothing has been charged.</p>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-line-soft bg-surface px-6 text-base font-medium text-ink transition-colors hover:bg-leaf-soft"
      >
        <ArrowLeft className="size-5" /> Back to review
      </button>
    </section>
  );
}
