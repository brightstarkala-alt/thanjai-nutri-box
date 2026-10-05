import type { AddOn, AddOnQuantities } from "@/lib/types";
import { AddOnCard } from "@/components/shared/AddOnCard";

type AddOnsSectionProps = {
  addOns: AddOn[];
  quantities: AddOnQuantities;
  onQuantityChange: (addOnId: string, quantity: number) => void;
  /** Shown for Weekly/Monthly, where one choice applies to every day. */
  everyDayCaption?: boolean;
};

export function AddOnsSection({
  addOns,
  quantities,
  onQuantityChange,
  everyDayCaption = false,
}: AddOnsSectionProps) {
  if (addOns.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-foreground/70">Add something extra</h2>
      {everyDayCaption && (
        <p className="mt-0.5 text-xs text-foreground/50">Applies to every delivery day</p>
      )}
      <div className="mt-2 flex flex-col gap-3">
        {addOns.map((addOn) => (
          <AddOnCard
            key={addOn.id}
            addOn={addOn}
            quantity={quantities[addOn.id] ?? 0}
            onQuantityChange={(qty) => onQuantityChange(addOn.id, qty)}
          />
        ))}
      </div>
    </section>
  );
}
