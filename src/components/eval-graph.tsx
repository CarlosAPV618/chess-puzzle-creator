"use client";

import { useRef } from "react";
import type { Classification, Eval } from "~/lib/types";
import { whiteShare } from "./chess";
import { CLASS_META } from "./class-icon";

const MARKED: Classification[] = ["brilliant", "great", "miss", "mistake", "blunder"];

/**
 * Gráfica de evaluación (desde blancas). `evals` tiene N+1 puntos; los que faltan
 * (análisis en curso) se dejan fuera. Con mouse, clic o arrastre lleva a esa jugada; en táctil solo un
 * toque (< 8 px, sin pointercancel), para que deslizar el dedo haga scroll de la página.
 */
export function EvalGraph({
  evals,
  fens,
  classes,
  ply,
  onSelect,
}: {
  evals: (Eval | undefined)[];
  fens: string[];
  classes: (Classification | undefined)[];
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = Math.max(1, evals.length - 1);
  const W = 600;
  const H = 100;
  const x = (i: number) => (i / n) * W;
  const y = (i: number) => (1 - whiteShare(evals[i], fens[i])) * H;

  const known: number[] = [];
  evals.forEach((e, i) => e && known.push(i));
  const last = known[known.length - 1] ?? 0;
  const area = known.length
    ? `M0,${H} ${known.map((i) => `L${x(i)},${y(i)}`).join(" ")} L${x(last)},${H} Z`
    : "";

  function pick(clientX: number) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((clientX - r.left) / r.width) * n);
    onSelect(Math.max(0, Math.min(n, i)));
  }

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-16 w-full cursor-pointer touch-pan-y rounded-md bg-[#3b3f3c] sm:h-20"
        role="slider"
        aria-label="Gráfica de evaluación"
        aria-valuemin={0}
        aria-valuemax={n}
        aria-valuenow={ply}
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") {
            touch.current = { x: e.clientX, y: e.clientY };
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => e.pointerType !== "touch" && e.buttons && pick(e.clientX)}
        onPointerUp={(e) => {
          const t = touch.current;
          touch.current = null;
          if (e.pointerType === "touch" && t && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8) pick(e.clientX);
        }}
        onPointerCancel={() => (touch.current = null)}
      >
        <path d={area} fill="#f2f3ee" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#888" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <line x1={x(ply)} x2={x(ply)} y1={0} y2={H} stroke="var(--color-brand)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {classes.map((c, i) =>
        c && MARKED.includes(c) && evals[i + 1] ? (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute size-2 -translate-1/2 rounded-full"
            style={{ left: `${(x(i + 1) / W) * 100}%`, top: `${(y(i + 1) / H) * 100}%`, background: CLASS_META[c].color }}
          />
        ) : null,
      )}
    </div>
  );
}
