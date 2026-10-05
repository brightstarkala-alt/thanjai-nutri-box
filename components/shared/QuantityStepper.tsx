type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
};

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 20,
  label,
}: QuantityStepperProps) {
  return (
    <div
      className="flex items-center gap-3"
      role="group"
      aria-label={label ?? "Quantity"}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-brand/30 text-xl font-semibold text-brand-dark disabled:opacity-30"
      >
        &minus;
      </button>
      <span className="w-6 text-center text-lg font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-brand/30 text-xl font-semibold text-brand-dark disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
