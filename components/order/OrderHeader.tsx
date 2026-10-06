import Link from "next/link";
import { Leaf, MapPin } from "lucide-react";

type OrderHeaderProps = {
  /** e.g. "6–8 AM", from business_settings; hidden until loaded. */
  deliveryWindow: string | null;
};

export function OrderHeader({ deliveryWindow }: OrderHeaderProps) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line-soft pb-4">
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-leaf text-on-leaf">
          <Leaf className="size-5" strokeWidth={2.5} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-serif text-lg font-semibold text-ink">
            Thanjai Healthy Plate
          </span>
          <span className="flex items-center gap-1 text-xs text-ink-soft">
            <MapPin className="size-3 shrink-0" /> Thanjavur
          </span>
        </span>
      </Link>
      {deliveryWindow && (
        <span className="hidden text-xs font-medium text-ink-soft sm:block">
          Delivery {deliveryWindow}
        </span>
      )}
    </header>
  );
}
