import type { AddOn } from "@/lib/types";
import { formatINR } from "@/lib/business-logic/pricing";
import { QuantityStepper } from "@/components/shared/QuantityStepper";

type AddOnCardProps = {
  addOn: AddOn;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
};

export function AddOnCard({ addOn, quantity, onQuantityChange }: AddOnCardProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200/70 bg-stone-50/60 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{addOn.name}</p>
        <p className="text-xs text-foreground/60">{formatINR(addOn.price)}</p>
      </div>
      <QuantityStepper
        value={quantity}
        onChange={onQuantityChange}
        max={addOn.available ? 10 : 0}
        label={`${addOn.name} quantity`}
      />
    </div>
  );
}
