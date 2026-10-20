"use client";

import { useEffect, useRef } from "react";
import type { Classification } from "~/lib/types";
import { prettySan } from "./chess";
import { ClassIcon } from "./class-icon";

/**
 * Lista de jugadas: fila desplazable en móvil, panel en dos columnas en escritorio.
 * `ply` = número de jugadas hechas (la jugada activa es ply-1).
 * `scrub`: franja donde deslizar va pasando las jugadas (la del centro es la activa); con un
 * hueco de media franja a cada lado para que la primera y la última también puedan quedar al centro.
 */
export function MoveList({
  sans,
  classes,
  ply,
  startsWithBlack,
  startMoveNumber = 1,
  scrub,
  onSelect,
}: {
  sans: string[];
  classes: (Classification | undefined)[];
  ply: number;
  startsWithBlack?: boolean;
  startMoveNumber?: number;
  scrub?: boolean;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  // Destino del desplazamiento que hicimos nosotros: sus eventos de scroll no eligen jugada.
  const target = useRef<number | null>(null);
  // Jugada elegida deslizando: ya está al centro, no se vuelve a centrar.
  const scrubbed = useRef<number | null>(null);

  // Centra la jugada activa desplazando solo la lista: scrollIntoView movería también la ventana.
  // En la franja solo cuenta `left` y en la rejilla de `lg` solo `top`; scrollTo recorta al rango válido.
  useEffect(() => {
    const fromScrub = scrubbed.current === ply;
    scrubbed.current = null;
    const ol = ref.current;
    const el = ol?.querySelector<HTMLElement>("[data-active=true]");
    if (fromScrub || !ol || !el) return;
    const left = Math.max(0, Math.min(ol.scrollWidth - ol.clientWidth, el.offsetLeft - (ol.clientWidth - el.offsetWidth) / 2));
    target.current = Math.abs(left - ol.scrollLeft) > 1 ? left : null;
    ol.scrollTo({ left, top: el.offsetTop - (ol.clientHeight - el.offsetHeight) / 2, behavior: "smooth" });
  }, [ply]);

  function onScroll() {
    const ol = ref.current!;
    if (target.current !== null) {
      if (Math.abs(ol.scrollLeft - target.current) <= 1) target.current = null;
      return;
    }
    const mid = ol.scrollLeft + ol.clientWidth / 2;
    let best: HTMLElement | null = null;
    for (const b of ol.querySelectorAll<HTMLElement>("button[data-ply]"))
      if (!best || Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - mid)) best = b;
    const p = Number(best?.dataset.ply);
    if (best && p !== ply) {
      scrubbed.current = p;
      onSelect(p);
    }
  }

  // El usuario toma el control: lo que siga desplazándose es suyo.
  const takeOver = () => (target.current = null);

  const offset = startsWithBlack ? 1 : 0;
  const spacer = scrub && <li aria-hidden className="w-1/2 shrink-0" />;
  return (
    <ol
      ref={ref}
      aria-label="Jugadas"
      onScroll={scrub ? onScroll : undefined}
      onPointerDown={scrub ? takeOver : undefined}
      onWheel={scrub ? takeOver : undefined}
      className="no-scrollbar relative flex gap-0.5 overflow-x-auto py-0.5 lg:grid lg:py-1 lg:max-h-80 lg:grid-cols-[2.5rem_1fr_1fr] lg:overflow-y-auto lg:overflow-x-visible"
    >
      {spacer}
      {startsWithBlack && (
        <>
          <li className="shrink-0 self-center pl-2 font-mono text-xs text-muted lg:py-1">{startMoveNumber}.</li>
          <li className="hidden lg:block" />
        </>
      )}
      {sans.map((san, i) => {
        const k = i + offset;
        const white = k % 2 === 0;
        const cls = classes[i];
        const active = ply === i + 1;
        return (
          <li key={i} className="contents">
            {white && (
              <span className="shrink-0 self-center pl-2 font-mono text-xs text-muted lg:py-1">
                {startMoveNumber + Math.floor(k / 2)}.
              </span>
            )}
            <button
              type="button"
              data-active={active}
              data-ply={i + 1}
              onClick={() => onSelect(i + 1)}
              className={`flex min-h-9 shrink-0 items-center gap-1 rounded px-2 text-sm font-semibold whitespace-nowrap ${
                active ? "bg-raised text-fg ring-1 ring-brand/70" : "text-fg/85 hover:bg-raised/60"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {cls && <ClassIcon cls={cls} size={16} />}
              {prettySan(san)}
            </button>
          </li>
        );
      })}
      {spacer}
    </ol>
  );
}
