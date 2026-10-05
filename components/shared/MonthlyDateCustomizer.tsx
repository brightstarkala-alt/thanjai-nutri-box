import { formatDeliveryDateWeekday } from "@/lib/business-logic/delivery-date";

type MonthlyDateCustomizerProps = {
  dates: string[];
  skippedDates: Set<string>;
  onToggle: (date: string) => void;
};

// Every eligible date for the chosen month, each a tap-to-skip chip.
// Included (the default) is green; skipped is muted with a strikethrough.
export function MonthlyDateCustomizer({
  dates,
  skippedDates,
  onToggle,
}: MonthlyDateCustomizerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {dates.map((date) => {
        const skipped = skippedDates.has(date);
        return (
          <button
            key={date}
            type="button"
            onClick={() => onToggle(date)}
            aria-pressed={!skipped}
            aria-label={`${formatDeliveryDateWeekday(date)}${skipped ? ", skipped" : ", included"}`}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              skipped
                ? "border-stone-200 bg-stone-50 text-stone-400 line-through"
                : "border-brand/50 bg-brand-light text-brand-dark"
            }`}
          >
            {formatDeliveryDateWeekday(date)}
          </button>
        );
      })}
    </div>
  );
}
