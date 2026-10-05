import type { BoxDisplay } from "@/lib/types";
import { formatINR } from "@/lib/business-logic/pricing";

export function BoxMenuDisplay({ box }: { box: BoxDisplay }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-brand-dark">{box.name}</h3>
        {!box.available && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
            Unavailable
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-foreground/70">{box.description}</p>
      <p className="mt-2 text-base font-semibold text-brand-dark">
        {box.price != null ? (
          <>
            {formatINR(box.price)}{" "}
            <span className="text-sm font-normal text-foreground/60">
              / box
            </span>
          </>
        ) : (
          <span className="text-sm font-normal text-foreground/60">
            Price to be announced
          </span>
        )}
      </p>
    </div>
  );
}
