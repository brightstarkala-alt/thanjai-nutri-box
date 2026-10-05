import type { ReactNode } from "react";

type PlanTypeCardProps = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onSelect: () => void;
};

export function PlanTypeCard({ title, subtitle, icon, onSelect }: PlanTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-brand/50 hover:bg-brand-light/40"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-foreground/60">{subtitle}</span>
      </span>
    </button>
  );
}
