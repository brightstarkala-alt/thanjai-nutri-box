import type { ReactNode } from "react";
import { Check } from "lucide-react";

type PlanCardProps = {
  icon: ReactNode;
  title: string;
  note: string;
  selected: boolean;
  onClick: () => void;
};

export function PlanCard({ icon, title, note, selected, onClick }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-1 rounded-2xl border px-4 py-4 text-left transition-colors ${
        selected
          ? "border-leaf bg-leaf text-on-leaf hover:bg-leaf-deep"
          : "border-line-soft bg-surface text-ink hover:bg-leaf-soft"
      }`}
    >
      <span className="flex w-full items-center gap-2">
        <span className="[&_svg]:size-5">{icon}</span>
        {selected && <Check className="ml-auto size-5" />}
      </span>
      <span className="mt-1 text-base font-semibold">{title}</span>
      <span className="text-xs opacity-80">{note}</span>
    </button>
  );
}
