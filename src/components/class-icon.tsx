import type { Classification } from "~/lib/types";

export const CLASS_META: Record<Classification, { label: string; color: string; symbol: string }> = {
  brilliant: { label: "Brillante", color: "var(--color-c-brilliant)", symbol: "!!" },
  great: { label: "Gran jugada", color: "var(--color-c-great)", symbol: "!" },
  best: { label: "Mejor", color: "var(--color-c-best)", symbol: "★" },
  excellent: { label: "Excelente", color: "var(--color-c-excellent)", symbol: "👍" },
  good: { label: "Buena", color: "var(--color-c-good)", symbol: "✓" },
  book: { label: "Teoría", color: "var(--color-c-book)", symbol: "📖" },
  forced: { label: "Forzada", color: "var(--color-c-forced)", symbol: "→" },
  inaccuracy: { label: "Imprecisión", color: "var(--color-c-inaccuracy)", symbol: "?!" },
  mistake: { label: "Error", color: "var(--color-c-mistake)", symbol: "?" },
  miss: { label: "Oportunidad perdida", color: "var(--color-c-miss)", symbol: "✕" },
  blunder: { label: "Error grave", color: "var(--color-c-blunder)", symbol: "??" },
};

/** Clases que ofrecen "Reintentar" (D9b). */
export const RETRY_CLASSES: Classification[] = ["inaccuracy", "mistake", "blunder", "miss"];

const W = "#fff";

/** Glifo dibujado en un viewBox 0..20 (círculo de fondo aparte). */
function Glyph({ cls }: { cls: Classification }) {
  const text = (t: string, size = 10) => (
    <text
      x="10"
      y="10.5"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={900}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      fill={W}
      letterSpacing={-0.6}
    >
      {t}
    </text>
  );
  switch (cls) {
    case "brilliant":
    case "blunder":
      return text(cls === "brilliant" ? "!!" : "??", 9.5);
    case "great":
    case "mistake":
      return text(cls === "great" ? "!" : "?", 12);
    case "inaccuracy":
      return text("?!", 9.5);
    case "best":
      return (
        <path
          fill={W}
          d="M10 3.6l1.9 4 4.4.5-3.3 3 .9 4.3L10 13.2l-3.9 2.2.9-4.3-3.3-3 4.4-.5z"
        />
      );
    case "excellent":
      return (
        <path
          fill={W}
          d="M5 9h2.2v6.2H5zM8.2 15.2V9.1l2.4-4.3c.9-.3 1.7.4 1.5 1.4L11.6 8.6h3.2c.9 0 1.5.8 1.3 1.6l-1.1 4c-.2.6-.7 1-1.3 1z"
        />
      );
    case "good":
      return (
        <path d="M5.5 10.4l3 3 6-6.4" fill="none" stroke={W} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      );
    case "book":
      return (
        <path
          fill={W}
          d="M4.5 5.6c1.9-.5 3.9-.3 5.5.9 1.6-1.2 3.6-1.4 5.5-.9v9c-1.9-.5-3.9-.3-5.5.9-1.6-1.2-3.6-1.4-5.5-.9zM10 7.7v6.6"
          stroke="var(--icon-bg)"
          strokeWidth={0.9}
        />
      );
    case "forced":
      return (
        <path d="M4.8 10h9.4M10.8 6.4l3.6 3.6-3.6 3.6" fill="none" stroke={W} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      );
    case "miss":
      return <path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" stroke={W} strokeWidth={2.6} strokeLinecap="round" />;
  }
}

export function ClassIcon({
  cls,
  size = 20,
  className,
}: {
  cls: Classification;
  size?: number;
  className?: string;
}) {
  const meta = CLASS_META[cls];
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      role="img"
      aria-label={meta.label}
      className={className}
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      style={{ ["--icon-bg" as string]: meta.color, flexShrink: 0 }}
    >
      <title>{meta.label}</title>
      {/* Sombra dentro del SVG: un drop-shadow de CSS lo rasteriza y se ve pixelado. */}
      <circle cx="10" cy="10.7" r="9.1" fill="#0006" />
      <circle cx="10" cy="10" r="9.1" fill={meta.color} />
      <Glyph cls={cls} />
    </svg>
  );
}
