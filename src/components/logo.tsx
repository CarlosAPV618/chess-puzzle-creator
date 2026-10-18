// Brand mark: geometric knight whose back carries a jigsaw tab (your game -> puzzle). Source of truth: public/icons/icon.svg
export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="256" height="256" rx="56" fill="var(--color-brand)" />
      <g fill="var(--color-ink)" transform="translate(-9 0)">
        <path d="M86 194 L116 146 L68 156 L48 136 L52 116 L100 72 L108 38 L132 56 Q176 66 184 120 L184 194 Z" />
        <circle cx="203" cy="148" r="23" />
        <rect x="66" y="194" width="136" height="26" rx="6" />
        <circle cx="96" cy="98" r="8" fill="var(--color-brand)" />
      </g>
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <LogoMark />
      <span className="flex items-center gap-1.5 text-[15px] leading-none sm:text-base">
        <span>
          Chess <span className="text-brand">Puzzle</span> Creator
        </span>
        <span className="rounded border border-brand/50 px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-brand-strong">
          Pro
        </span>
      </span>
    </span>
  );
}
