import type { BoxDisplay } from "@/lib/types";
import { BoxMenuDisplay } from "@/components/shared/BoxMenuDisplay";
import { QuantityStepper } from "@/components/shared/QuantityStepper";

type BoxCardProps =
  | { box: BoxDisplay; readOnly: true }
  | {
      box: BoxDisplay;
      readOnly?: false;
      quantity: number;
      onQuantityChange: (quantity: number) => void;
    };

export function BoxCard(props: BoxCardProps) {
  const { box } = props;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-brand/15 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <BoxMenuDisplay box={box} />
      {!props.readOnly && (
        <QuantityStepper
          value={props.quantity}
          onChange={props.onQuantityChange}
          max={box.available && box.price != null ? 20 : 0}
          label={`${box.name} quantity`}
        />
      )}
    </div>
  );
}
