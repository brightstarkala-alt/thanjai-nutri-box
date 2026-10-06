import { Check } from "lucide-react";
import { formatDeliveryDate } from "@/lib/business-logic/delivery-date";
import { dayShortOf, monthShortOf } from "@/components/order/dayLabels";

type MonthSkipGridProps = {
  dates: string[];
  skippedDates: Set<string>;
  onToggle: (date: string) => void;
};

// Every eligible delivery date in the chosen month. Included (the
// default) is filled green; tap to skip, tap again to include.
export function MonthSkipGrid({ dates, skippedDates, onToggle }: MonthSkipGridProps) {
  return (
    <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label="Delivery dates">
      {dates.map((date) => {
        const skipped = skippedDates.has(date);
        return (
          <button
            key={date}
            type="button"
            onClick={() => onToggle(date)}
            aria-pressed={!skipped}
            aria-label={`${formatDeliveryDate(date)}, ${skipped ? "skipped" : "included"}`}
            className={`relative flex h-[76px] min-w-0 flex-col items-center justify-center rounded-xl border px-1 transition-colors ${
              skipped
                ? "border-line-soft bg-surface-muted text-ink-soft"
                : "border-leaf bg-leaf text-on-leaf hover:bg-leaf-deep"
            }`}
          >
            {!skipped && <Check className="absolute right-1.5 top-1.5 size-3.5" />}
            <span className="text-[11px] font-medium opacity-70">{dayShortOf(date)}</span>
            <span className={`font-serif text-lg font-semibold ${skipped ? "line-through" : ""}`}>
              {new Date(`${date}T00:00:00`).getDate()}
            </span>
            <span className="text-[10px] opacity-70">{skipped ? "Skip" : monthShortOf(date)}</span>
          </button>
        );
      })}
    </div>
  );
}
