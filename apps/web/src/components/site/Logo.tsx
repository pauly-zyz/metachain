/** META CHAIN wordmark: a flame-cut diamond glyph + spaced display type (original mark, not Meta Platforms' logo). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path d="M12 1 23 12 12 23 1 12Z" fill="none" stroke="#ff5b1f" strokeWidth="1.6" />
        <path d="M12 6c2.6 2.4 3.6 4.4 3.6 6.4A3.6 3.6 0 0 1 12 16a3.6 3.6 0 0 1-3.6-3.6c0-1.3.6-2.4 1.6-3.4.1 1 .6 1.8 1.4 2.2-.3-1.9.1-3.6.6-5.2Z" fill="#ffb020" />
      </svg>
      <span className="font-display text-[15px] font-medium tracking-[0.32em] text-white">
        META<span className="mx-1.5 text-accent">·</span>CHAIN
      </span>
    </span>
  );
}
