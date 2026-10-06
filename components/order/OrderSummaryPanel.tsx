import { ArrowRight } from "lucide-react";
import { formatINR } from "@/lib/business-logic/pricing";

type OrderSummaryPanelProps = {
  /** Plain-language lines, e.g. ["Mon 13 Oct – Sat 18 Oct", "Box 1"]. Empty = nothing chosen yet. */
  lines: string[];
  /** Optional price breakdown, e.g. "6 days × ₹69". */
  breakdown?: string;
  total: number;
  onContinue: () => void;
  validationMessage: string | null;
  /** True once Continue was pressed with a complete selection. */
  ready?: boolean;
  continueLabel?: string;
};

export function OrderSummaryPanel({
  lines,
  breakdown,
  total,
  onContinue,
  validationMessage,
  ready = false,
  continueLabel = "Continue",
}: OrderSummaryPanelProps) {
  return (
    <div className="mt-8 rounded-2xl bg-leaf-soft p-5">
      <h2 className="text-lg font-semibold text-leaf-deep">Your order</h2>

      <div className="mt-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {lines.length === 0 ? (
            <p className="text-base text-ink">Nothing chosen yet.</p>
          ) : (
            lines.map((line, i) => (
              <p key={i} className={i === 0 ? "text-base font-medium text-ink" : "text-sm text-ink-soft"}>
                {line}
              </p>
            ))
          )}
          {breakdown && <p className="mt-1 text-sm text-ink-soft">{breakdown}</p>}
        </div>
        <span className="shrink-0 font-serif text-2xl font-semibold text-ink">{formatINR(total)}</span>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-4 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-leaf px-8 text-base font-medium text-on-leaf transition-colors hover:bg-leaf-deep sm:w-auto"
      >
        {continueLabel} <ArrowRight className="size-5" />
      </button>

      {validationMessage && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {validationMessage}
        </p>
      )}
      {ready && !validationMessage && (
        <p role="status" className="mt-4 rounded-xl bg-surface p-3 text-sm font-medium text-leaf-deep">
          Your choices are ready. Online order submission isn&apos;t available yet.
        </p>
      )}
    </div>
  );
}
