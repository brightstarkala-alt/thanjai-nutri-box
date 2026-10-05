import type { BoxDisplay } from "@/lib/types";
import { formatINR } from "@/lib/business-logic/pricing";
import { QuantityStepper } from "@/components/shared/QuantityStepper";
import { LeafIcon } from "@/components/shared/LeafIcon";

type PlanBoxOptionProps = {
  box: BoxDisplay;
  selected: boolean;
  onSelect: () => void;
  /** e.g. "/day" for Weekly/Monthly; omitted for Daily (one-off price). */
  priceSuffix?: string;
  /** Only Daily shows a quantity stepper, inline once selected. */
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
};

// Single-select "radio" box card — tap to choose, tap again to
// deselect. Used by all three plan types; Daily additionally shows a
// quantity stepper once selected.
export function PlanBoxOption({
  box,
  selected,
  onSelect,
  priceSuffix = "",
  quantity,
  onQuantityChange,
}: PlanBoxOptionProps) {
  const orderable = box.available && box.price != null;

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        selected ? "border-brand bg-brand-light/50" : "border-stone-200 bg-white"
      } ${!orderable ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!orderable}
        aria-pressed={selected}
        className="flex w-full items-center gap-3 text-left disabled:cursor-not-allowed"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            selected ? "bg-brand text-brand-contrast" : "bg-stone-100 text-stone-400"
          }`}
        >
          <LeafIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-foreground">{box.name}</span>
            <span className={`text-sm font-medium ${orderable ? "text-brand-dark" : "text-stone-400"}`}>
              {orderable ? `${formatINR(box.price as number)}${priceSuffix}` : "Unavailable"}
            </span>
          </span>
          {orderable && box.description && (
            <span className="mt-0.5 block truncate text-xs text-foreground/50">
              {box.description}
            </span>
          )}
        </span>
      </button>

      {selected && quantity != null && onQuantityChange && (
        <div className="mt-3 flex items-center justify-between border-t border-brand/15 pt-3">
          <span className="text-sm text-foreground/60">How many?</span>
          <QuantityStepper
            value={quantity}
            onChange={onQuantityChange}
            min={1}
            max={20}
            label={`${box.name} quantity`}
          />
        </div>
      )}
    </div>
  );
}
