import { Check } from "lucide-react";
import type { CalendarDay } from "@/lib/types";
import { formatDeliveryDate } from "@/lib/business-logic/delivery-date";
import { REASON_LABEL, monthShortOf } from "@/components/order/dayLabels";

type DayChipGridProps = {
  days: CalendarDay[];
  selectedDates: string[];
  /** Tap to add a date, tap again to remove it. */
  onToggle: (date: string) => void;
  canShowMore: boolean;
  onShowMore: () => void;
};

// Daily plan date picker: any number of dates. Ineligible days (past,
// Sunday holiday, no-service) stay visible but disabled, with the reason.
export function DayChipGrid({
  days,
  selectedDates,
  onToggle,
  canShowMore,
  onShowMore,
}: DayChipGridProps) {
  return (
    <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label="Delivery dates">
      {days.map((day) => {
        const selected = selectedDates.includes(day.date);
        const reason = day.reason ? REASON_LABEL[day.reason] : null;
        return (
          <button
            key={day.date}
            type="button"
            disabled={!day.eligible}
            onClick={() => onToggle(day.date)}
            aria-pressed={selected}
            aria-label={`${formatDeliveryDate(day.date)}${!day.eligible ? `, unavailable (${reason})` : ""}`}
            className={`relative flex h-[86px] min-w-0 flex-col items-center justify-center rounded-xl border px-1 transition-colors disabled:cursor-not-allowed ${
              !day.eligible
                ? "border-transparent bg-surface-muted text-ink-soft/60"
                : selected
                  ? "border-leaf bg-leaf text-on-leaf hover:bg-leaf-deep"
                  : "border-line-soft bg-surface text-ink hover:bg-leaf-soft"
            }`}
          >
            {selected && <Check className="absolute right-1.5 top-1.5 size-4" />}
            <span className="text-[11px] font-medium opacity-70">{day.dayName}</span>
            <span className="font-serif text-xl font-semibold">{day.dayNumber}</span>
            <span className="text-[10px] opacity-70">{day.eligible ? monthShortOf(day.date) : reason}</span>
          </button>
        );
      })}

      {canShowMore && (
        <button
          type="button"
          onClick={onShowMore}
          className="flex h-[86px] min-w-0 items-center justify-center rounded-xl border border-dashed border-line-soft px-1 text-sm font-medium text-ink-soft transition-colors hover:bg-leaf-soft hover:text-leaf-deep"
        >
          More dates
        </button>
      )}
    </div>
  );
}
