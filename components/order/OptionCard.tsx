import { Check } from "lucide-react";

type OptionCardProps = {
  /** Short text in the round badge, e.g. "13" or "Oct". */
  badge: string;
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
};

// Week / month choice card for the Weekly and Monthly plans.
export function OptionCard({ badge, title, subtitle, selected, disabled = false, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-xl border px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-leaf bg-leaf text-on-leaf hover:bg-leaf-deep"
          : "border-line-soft bg-surface text-ink enabled:hover:bg-leaf-soft"
      }`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface font-serif text-lg font-semibold text-leaf">
        {badge}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs opacity-80">{subtitle}</span>
      </span>
      {selected && <Check className="ml-auto size-5 shrink-0" />}
    </button>
  );
}
