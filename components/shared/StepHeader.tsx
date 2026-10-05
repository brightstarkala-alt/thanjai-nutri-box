type StepHeaderProps = {
  planLabel: string;
  title: string;
  onBack: () => void;
};

// So the customer always knows where they are in the flow, without a
// full breadcrumb trail.
export function StepHeader({ planLabel, title, onBack }: StepHeaderProps) {
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-foreground/60 hover:text-brand-dark"
      >
        <span aria-hidden="true">&larr;</span> Back
      </button>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-brand-dark/70">
        {planLabel}
      </p>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
    </div>
  );
}
