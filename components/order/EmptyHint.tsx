import { CalendarDays, Leaf } from "lucide-react";

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-line-soft bg-surface-muted p-4 text-base text-ink-soft">
      <CalendarDays className="size-5 shrink-0 text-leaf" /> {text}
    </div>
  );
}

/** No published menu (or no orderable box) for the chosen date/week/month. */
export function MenuNotReady({ label }: { label: string }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl bg-surface px-4 py-8 text-center ring-1 ring-line-soft">
      <span className="grid size-11 place-items-center rounded-full bg-surface-muted text-ink-soft">
        <Leaf className="size-5" />
      </span>
      <p className="font-semibold text-ink">Menu to be updated</p>
      <p className="text-sm text-ink-soft">The menu for {label} isn&apos;t available yet.</p>
    </div>
  );
}
