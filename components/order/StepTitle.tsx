type StepTitleProps = {
  number: number;
  title: string;
  /** Optional context line under the title, e.g. the chosen date. */
  subtitle?: string;
};

export function StepTitle({ number, title, subtitle }: StepTitleProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf text-sm font-bold text-on-leaf">
        {number}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2 className="text-lg font-semibold text-ink sm:text-xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
    </div>
  );
}
