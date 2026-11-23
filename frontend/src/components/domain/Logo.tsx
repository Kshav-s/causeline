export function Logo({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label="CauseLine">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill={inverse ? "#1A2530" : "#111A22"} />
        <path d="M7 22 L13 14 L18 18.5 L25 9" stroke="#3AA5C4" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="9" r="2.4" fill="#3AA5C4" />
      </svg>
      {!compact && (
        <span className={`text-[17px] font-semibold tracking-[-0.01em] ${inverse ? "text-white" : "text-ink"}`}>
          Cause<span className="text-petrol-400">Line</span>
        </span>
      )}
    </span>
  );
}
