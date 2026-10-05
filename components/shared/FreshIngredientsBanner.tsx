// Compact, decorative strip of simple flat produce icons — a tasteful
// nod to "fresh and homemade" without a photo asset pipeline or a heavy
// hero section. Purely decorative, so it's aria-hidden.

function Tomato() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true">
      <circle cx="16" cy="18" r="9" fill="#E2624F" />
      <path
        d="M11 10c1.5-2 3-3 5-3s3.5 1 5 3"
        stroke="#4E8A5C"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="9" r="1.6" fill="#4E8A5C" />
    </svg>
  );
}

function Carrot() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true">
      <path d="M13 12 L19 12 L16 27 Z" fill="#E8934A" />
      <path
        d="M16 12c-1-3-1-6 0-8M13.5 12c-1.5-2.5-2-5-1.5-7M18.5 12c1.5-2.5 2-5 1.5-7"
        stroke="#4E8A5C"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function CucumberSlice() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true">
      <circle cx="16" cy="16" r="9" fill="#BFDD9A" />
      <circle cx="16" cy="16" r="6" fill="#E9F3DC" />
      <circle cx="12.5" cy="14" r="0.9" fill="#BFDD9A" />
      <circle cx="16" cy="18.5" r="0.9" fill="#BFDD9A" />
      <circle cx="19.5" cy="13.5" r="0.9" fill="#BFDD9A" />
    </svg>
  );
}

function LeafSprig() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true">
      <path d="M16 26c0-10 3-16 8-19-2 8-2 15-8 19Z" fill="#4E8A5C" />
      <path d="M16 26c0-9-3-14-7-17 1 7 1 13 7 17Z" fill="#6FA872" />
    </svg>
  );
}

function Banana() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true">
      <path
        d="M8 22c6 4 14 2 17-6"
        stroke="#EFC94C"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="25.5" cy="15" r="1.6" fill="#4E8A5C" />
    </svg>
  );
}

const ICONS = [Tomato, Carrot, LeafSprig, CucumberSlice, Banana];

export function FreshIngredientsBanner() {
  return (
    <div
      aria-hidden="true"
      className="flex h-16 items-center justify-around overflow-hidden rounded-2xl bg-brand-light px-3 sm:h-20"
    >
      {[...ICONS, ...ICONS].map((Icon, i) => (
        <Icon key={i} />
      ))}
    </div>
  );
}
