import type { AddOn, BoxDisplay, BoxId, CalendarDay } from "@/lib/types";
import { formatDeliveryDateWeekday } from "@/lib/business-logic/delivery-date";
import { formatINR } from "@/lib/business-logic/pricing";
import type { DateSelection, DateSubtotal } from "@/lib/business-logic/daily-order";
import { REASON_LABEL, monthShortOf } from "@/components/order/dayLabels";
import { Stepper } from "@/components/order/Stepper";

type WeekCustomizerProps = {
  days: CalendarDay[];
  getBoxesForDate: (date: string) => BoxDisplay[];
  getAddOnsForDate: (date: string) => AddOn[];
  /** Each delivery day's own quantities (same model as the Daily plan). */
  selectionFor: (date: string) => DateSelection;
  /** Each day's priced subtotal, computed by the page with calculateDateSubtotal. */
  subtotalFor: (date: string) => DateSubtotal;
  onBoxChange: (date: string, boxId: BoxId, quantity: number) => void;
  onAddOnChange: (date: string, addOnId: string, quantity: number) => void;
};

// Weekly customization for ONE selected week: independent Box 1, Box 2
// and add-on quantities for every Monday–Saturday day. A day with no
// boxes is simply skipped. Holidays / no-service days are shown but locked.
export function WeekCustomizer({
  days,
  getBoxesForDate,
  getAddOnsForDate,
  selectionFor,
  subtotalFor,
  onBoxChange,
  onAddOnChange,
}: WeekCustomizerProps) {
  return (
    <div className="mt-4 space-y-3">
      {days.map((day) => {
        const label = `${formatDeliveryDateWeekday(day.date)} ${monthShortOf(day.date)}`;

        if (!day.eligible) {
          return (
            <div
              key={day.date}
              className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-ink-soft"
            >
              <span className="font-semibold">{label}</span>
              <span className="text-sm">No delivery · {REASON_LABEL[day.reason ?? "unavailable"]}</span>
            </div>
          );
        }

        const selection = selectionFor(day.date);
        const subtotal = subtotalFor(day.date);
        const rows = [
          ...getBoxesForDate(day.date).map((box) => ({
            key: box.id,
            name: box.name,
            price: box.available ? box.price : null,
            quantity: selection.boxes[box.id] ?? 0,
            onChange: (qty: number) => onBoxChange(day.date, box.id, qty),
          })),
          ...getAddOnsForDate(day.date).map((addOn) => ({
            key: addOn.id,
            name: addOn.name,
            price: addOn.available ? addOn.price : null,
            quantity: selection.addOns[addOn.id] ?? 0,
            onChange: (qty: number) => onAddOnChange(day.date, addOn.id, qty),
          })),
        ];
        const skipped = subtotal.boxCount === 0;
        const extrasWithoutBox = skipped && subtotal.addOnLines.length > 0;

        return (
          <div
            key={day.date}
            className={`rounded-2xl p-4 ring-1 transition-colors ${
              skipped ? "bg-surface ring-line-soft" : "bg-leaf-soft/40 ring-leaf/40"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">{label}</span>
              <span className={skipped ? "text-sm text-ink-soft" : "font-serif text-lg font-semibold text-ink"}>
                {skipped ? "Skipped" : formatINR(subtotal.total)}
              </span>
            </div>

            <ul className="mt-2 divide-y divide-line-soft" aria-label={`Quantities for ${label}`}>
              {rows.map((row) => {
                const orderable = row.price != null;
                return (
                  <li key={row.key} className={`flex items-center justify-between gap-3 py-2 ${orderable ? "" : "opacity-60"}`}>
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{row.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {!orderable
                          ? "Unavailable"
                          : row.quantity > 0
                            ? `${formatINR(row.price as number)} × ${row.quantity} = ${formatINR((row.price as number) * row.quantity)}`
                            : formatINR(row.price as number)}
                      </span>
                    </span>
                    <Stepper
                      value={orderable ? row.quantity : 0}
                      onChange={row.onChange}
                      min={0}
                      max={orderable ? 20 : 0}
                      label={`${row.name} on ${label}`}
                      size="sm"
                    />
                  </li>
                );
              })}
            </ul>

            {!skipped && (
              <div className="mt-1 flex justify-between border-t border-line-soft pt-2 text-sm">
                <span className="text-ink-soft">Day total</span>
                <span className="font-semibold text-ink">{formatINR(subtotal.total)}</span>
              </div>
            )}
            {extrasWithoutBox && (
              <p className="mt-2 text-sm font-medium text-danger">Add a box for this day, or remove its extras.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
