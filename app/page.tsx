import Link from "next/link";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center bg-brand-light px-6 py-20 text-center">
        <h1 className="max-w-xl text-4xl font-bold leading-tight text-brand-dark sm:text-5xl">
          Fresh, Healthy Meal Boxes
          <br />
          Delivered to Your Door
        </h1>
        <p className="mt-4 max-w-md text-lg text-foreground/80">
          Choose Box 1 or Box 2, pick your delivery date, and we&apos;ll bring
          it fresh every morning between 6&ndash;8 AM.
        </p>

        <Link href="/order" className="mt-8">
          <Button>Start Your Order</Button>
        </Link>

        <div className="mt-8 rounded-xl border border-brand/20 bg-white px-6 py-4 text-sm text-foreground/70">
          Login, payment, and order history are being built in stages. Menu
          items and prices shown are temporary sample data.
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
