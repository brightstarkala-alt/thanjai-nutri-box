import type { AddOn, AddOnQuantities } from "@/lib/types";
import { formatINR } from "@/lib/business-logic/pricing";
import { Stepper } from "@/components/order/Stepper";

type AddOnListProps = {
  addOns: AddOn[];
  quantities: AddOnQuantities;
  onQuantityChange: (addOnId: string, quantity: number) => void;
  /** Shown for Weekly/Monthly, where one choice applies to every day. */
  everyDayCaption?: boolean;
  /** Per-item maximum (Daily keeps 10; Weekly/Monthly allow 20). */
  max?: number;
};

export function AddOnList({ addOns, quantities, onQuantityChange, everyDayCaption = false, max = 10 }: AddOnListProps) {
  if (addOns.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold text-ink">Add something extra</h3>
      {everyDayCaption && <p className="mt-0.5 text-sm text-ink-soft">Applies to every delivery day</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {addOns.map((addOn) => (
          <div
            key={addOn.id}
            className={`flex items-center justify-between gap-3 rounded-2xl bg-surface-strong p-3 ring-1 ring-line-soft ${
              addOn.available ? "" : "opacity-60"
            }`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink">{addOn.name}</p>
              {addOn.description && <p className="truncate text-xs text-ink-soft">{addOn.description}</p>}
              <p className="text-sm font-medium text-leaf-deep">
                {addOn.available ? formatINR(addOn.price) : "Unavailable"}
              </p>
            </div>
            <Stepper
              value={quantities[addOn.id] ?? 0}
              onChange={(qty) => onQuantityChange(addOn.id, qty)}
              max={addOn.available ? max : 0}
              label={addOn.name}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
