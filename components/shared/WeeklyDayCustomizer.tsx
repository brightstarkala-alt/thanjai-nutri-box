import type { BoxDisplay, BoxId } from "@/lib/types";
import { formatDeliveryDateWeekday } from "@/lib/business-logic/delivery-date";
import { formatINR } from "@/lib/business-logic/pricing";

type DayChoice = BoxId | "skip";

type WeeklyDayCustomizerProps = {
  weekDates: string[];
  getBoxesForDate: (date: string) => BoxDisplay[];
  choices: Record<string, DayChoice>;
  onChange: (date: string, value: DayChoice) => void;
};

// The entire week's customization fits on one screen — one dropdown per
// day, no grid, no navigating elsewhere.
export function WeeklyDayCustomizer({
  weekDates,
  getBoxesForDate,
  choices,
  onChange,
}: WeeklyDayCustomizerProps) {
  return (
    <div className="flex flex-col gap-2">
      {weekDates.map((date) => {
        const boxes = getBoxesForDate(date).filter((b) => b.available && b.price != null);
        const value = choices[date] ?? "skip";

        return (
          <div
            key={date}
            className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5"
          >
            <span className="text-sm font-medium text-foreground">
              {formatDeliveryDateWeekday(date)}
            </span>
            <select
              value={value}
              onChange={(e) => onChange(date, e.target.value as DayChoice)}
              disabled={boxes.length === 0}
              aria-label={`Box for ${formatDeliveryDateWeekday(date)}`}
              className="min-h-10 max-w-[60%] rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-foreground disabled:text-stone-300"
            >
              <option value="skip">Skip</option>
              {boxes.map((box) => (
                <option key={box.id} value={box.id}>
                  {box.name} — {formatINR(box.price as number)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
