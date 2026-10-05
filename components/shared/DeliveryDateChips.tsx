import type { CalendarDay } from "@/lib/types";
import { formatDeliveryDateWeekday, toDateInputValue } from "@/lib/business-logic/delivery-date";

const REASON_LABEL: Record<NonNullable<CalendarDay["reason"]>, string> = {
  past: "Past",
  holiday: "Sun",
  unavailable: "Closed",
};

type DeliveryDateChipsProps = {
  days: CalendarDay[];
  selectedDates: string[];
  activeDate: string | null;
  onToggle: (date: string) => void;
  canShowMore: boolean;
  onShowMore: () => void;
};

// Tap an eligible day to select it (and make it active); tap an already-
// selected-but-inactive day to switch to editing it; tap the active day
// again to remove it. One compact row, no grid.
export function DeliveryDateChips({
  days,
  selectedDates,
  activeDate,
  onToggle,
  canShowMore,
  onShowMore,
}: DeliveryDateChipsProps) {
  const today = toDateInputValue(new Date());
  const tomorrow = days.find((d) => d.date > today)?.date;

  return (
    <div
      className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Delivery date"
    >
      {days.map((day) => {
        const selected = selectedDates.includes(day.date);
        const active = day.date === activeDate;
        const label =
          day.eligible && day.date === today
            ? "Today"
            : day.eligible && day.date === tomorrow
              ? "Tomorrow"
              : formatDeliveryDateWeekday(day.date);

        return (
          <button
            key={day.date}
            type="button"
            disabled={!day.eligible}
            aria-pressed={selected}
            aria-label={
              !day.eligible
                ? `${formatDeliveryDateWeekday(day.date)}, unavailable (${REASON_LABEL[day.reason ?? "unavailable"]})`
                : `${formatDeliveryDateWeekday(day.date)}${selected ? ", selected" : ""}`
            }
            onClick={() => onToggle(day.date)}
            className={`flex min-w-16 shrink-0 flex-col items-center justify-center rounded-2xl border px-3 py-2.5 text-sm transition-all ${
              !day.eligible
                ? "cursor-not-allowed border-transparent bg-stone-100 text-stone-300"
                : active
                  ? "border-brand bg-brand text-brand-contrast font-medium shadow-sm shadow-brand/30"
                  : selected
                    ? "border-brand/50 bg-brand-light text-brand-dark"
                    : "border-stone-200 bg-white text-foreground hover:border-brand/40 hover:bg-brand-light/40"
            }`}
          >
            <span>{label}</span>
            {!day.eligible && (
              <span className="text-[10px]">{REASON_LABEL[day.reason ?? "unavailable"]}</span>
            )}
          </button>
        );
      })}

      {canShowMore && (
        <button
          type="button"
          onClick={onShowMore}
          className="flex min-w-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-stone-300 px-3 py-2.5 text-sm text-foreground/60 hover:border-brand/40 hover:text-brand-dark"
        >
          More dates
        </button>
      )}
    </div>
  );
}
