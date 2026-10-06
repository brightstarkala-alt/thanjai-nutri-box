import { Minus, Plus } from "lucide-react";

type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
  /** Spread the buttons to the edges (box cards) instead of a compact group. */
  spread?: boolean;
  /** "sm" for dense lists (weekly per-day rows); still a 40px touch target. */
  size?: "md" | "sm";
};

export function Stepper({ value, onChange, min = 0, max = 20, label, spread = false, size = "md" }: StepperProps) {
  const buttonClass = `grid ${size === "sm" ? "size-10" : "size-12"} shrink-0 place-items-center rounded-xl border border-line-soft bg-surface text-ink transition-colors hover:bg-leaf-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface`;

  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-3 ${spread ? "justify-between" : ""}`}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Remove one ${label}`}
        className={buttonClass}
      >
        <Minus className="size-5" />
      </button>
      <span
        className={`w-8 text-center font-serif ${size === "sm" ? "text-xl" : "text-2xl"} font-semibold tabular-nums text-ink`}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Add one ${label}`}
        className={buttonClass}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}
