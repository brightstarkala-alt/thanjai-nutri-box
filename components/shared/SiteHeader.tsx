import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-brand-light bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-brand-dark">
          Thanjai Healthy Plate
        </Link>
        <span className="rounded-full bg-brand-light px-3 py-1 text-sm font-medium text-brand-dark">
          Thanjavur
        </span>
      </div>
    </header>
  );
}
