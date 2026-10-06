import Image from "next/image";
import { Sun } from "lucide-react";

type OrderHeroProps = {
  deliveryWindow: string | null;
};

export function OrderHero({ deliveryWindow }: OrderHeroProps) {
  return (
    <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line-soft">
      <Image
        src="/images/order/produce-hero.jpg"
        alt="Fresh fruits and vegetables"
        width={1536}
        height={912}
        priority
        sizes="(min-width: 896px) 848px, 100vw"
        className="h-40 w-full object-cover sm:h-56"
      />
      <div className="p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
          <Sun className="size-4" />
          Fresh &amp; healthy, delivered {deliveryWindow ?? "every morning"}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink sm:text-4xl">
          Order your healthy plate
        </h1>
        <p className="mt-2 text-base text-ink-soft">Three easy steps. Big buttons. No hurry.</p>
      </div>
    </div>
  );
}
