import Image from "next/image";
import { Check } from "lucide-react";
import type { BoxDisplay, BoxId } from "@/lib/types";
import { formatINR } from "@/lib/business-logic/pricing";
import { Stepper } from "@/components/order/Stepper";

// Shown only when the admin hasn't set an image for the box in Supabase.
const FALLBACK_IMAGE: Record<BoxId, string> = {
  "box-1": "/images/order/box-one.jpg",
  "box-2": "/images/order/box-two.jpg",
};

type BoxOptionCardProps = {
  box: BoxDisplay;
  selected: boolean;
  onSelect: () => void;
  /** e.g. "/day" for Weekly/Monthly; omitted for Daily (one-off price). */
  priceSuffix?: string;
  /** Only Daily shows a quantity stepper, once the box is selected. */
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
};

// Single-select box card: tap to choose, tap again to deselect. Name,
// description, price, availability and image all come from Supabase via
// MenuProvider's getBoxDisplay().
export function BoxOptionCard({
  box,
  selected,
  onSelect,
  priceSuffix = "",
  quantity,
  onQuantityChange,
}: BoxOptionCardProps) {
  const orderable = box.available && box.price != null;

  return (
    <div
      className={`rounded-2xl p-3 transition-colors ${
        selected ? "bg-leaf-soft/60 ring-2 ring-leaf" : "bg-surface-strong ring-1 ring-line-soft"
      } ${!orderable ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!orderable}
        aria-pressed={selected}
        className="flex w-full items-center gap-3 text-left disabled:cursor-not-allowed"
      >
        <BoxThumb box={box} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold text-ink">{box.name}</span>
            <span className={`shrink-0 text-sm font-semibold ${orderable ? "text-leaf-deep" : "text-ink-soft"}`}>
              {orderable ? `${formatINR(box.price as number)}${priceSuffix}` : "Unavailable"}
            </span>
          </span>
          {orderable && box.description && (
            <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">{box.description}</span>
          )}
        </span>
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full border ${
            selected ? "border-leaf bg-leaf text-on-leaf" : "border-line-soft bg-surface"
          }`}
          aria-hidden
        >
          {selected && <Check className="size-4" />}
        </span>
      </button>

      {selected && quantity != null && onQuantityChange && (
        <div className="mt-3 border-t border-line-soft pt-3">
          <Stepper
            value={quantity}
            onChange={onQuantityChange}
            min={1}
            max={20}
            label={box.name}
            spread
          />
        </div>
      )}
    </div>
  );
}

type BoxQuantityCardProps = {
  box: BoxDisplay;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  /** e.g. "/day" for Standard Weekly/Monthly; omitted for Daily. */
  priceSuffix?: string;
};

// Quantity-based box card: every box has its own 0–20 stepper, so Box 1
// and Box 2 can both be ordered (Daily dates, Standard Weekly/Monthly).
export function BoxQuantityCard({ box, quantity, onQuantityChange, priceSuffix = "" }: BoxQuantityCardProps) {
  const orderable = box.available && box.price != null;
  const active = orderable && quantity > 0;

  return (
    <div
      className={`rounded-2xl p-3 transition-colors ${
        active ? "bg-leaf-soft/60 ring-2 ring-leaf" : "bg-surface-strong ring-1 ring-line-soft"
      } ${!orderable ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3">
        <BoxThumb box={box} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-base font-semibold text-ink">{box.name}</p>
            <p className={`shrink-0 text-sm font-semibold ${orderable ? "text-leaf-deep" : "text-ink-soft"}`}>
              {orderable ? `${formatINR(box.price as number)}${priceSuffix}` : "Unavailable"}
            </p>
          </div>
          {orderable && box.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{box.description}</p>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-line-soft pt-3">
        <Stepper
          value={orderable ? quantity : 0}
          onChange={onQuantityChange}
          min={0}
          max={orderable ? 20 : 0}
          label={box.name}
          spread
        />
      </div>
    </div>
  );
}

function BoxThumb({ box }: { box: BoxDisplay }) {
  return box.imageUrl ? (
    // Admin-uploaded image from an arbitrary host; plain <img> avoids
    // needing a next.config remotePatterns entry.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={box.imageUrl} alt={box.name} loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
  ) : (
    <Image
      src={FALLBACK_IMAGE[box.id]}
      alt={box.name}
      width={128}
      height={128}
      className="size-16 shrink-0 rounded-xl object-cover"
    />
  );
}
