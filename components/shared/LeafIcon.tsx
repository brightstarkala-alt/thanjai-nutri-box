export function LeafIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 15c0-6 4-10 10-10 1 0 3 0 5 1-1 2-1 4-1 5 0 6-4 10-10 10-1 0-3 0-5-1 1-2 1-4 1-5Z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M4 15c0-6 4-10 10-10 1 0 3 0 5 1-1 2-1 4-1 5 0 6-4 10-10 10-1 0-3 0-5-1 1-2 1-4 1-5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 17.5c2.8-2.8 6.4-6.4 10.5-9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
