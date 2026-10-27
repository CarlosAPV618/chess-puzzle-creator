"use client";

import { useEffect, useRef } from "react";
import type { Classification } from "~/lib/types";
import { prettySan } from "./chess";
import { ClassIcon } from "./class-icon";

/**
 * Lista de jugadas: fila desplazable en móvil, panel en dos columnas en escritorio.
 * `ply` = número de jugadas hechas (la jugada activa es ply-1).
 * `scrub`: franja donde deslizar va pasando las jugadas (la del centro es la activa). Al inicio no hay
 * hueco: el punto que marca la activa va de la primera jugada al centro al doble de velocidad. Al final,
 * un hueco de media franja deja centrar la última.
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
  /** `scrubbed`: elegida deslizando la franja (sin sonido). */
  onSelect: (ply: number, scrubbed?: boolean) => void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  // Desplazamiento nuestro en curso: su scroll no elige jugada hasta que el usuario toque la franja
  // (el último evento puede llegar ya en el destino).
  const auto = useRef(false);
  // Jugada elegida deslizando: ya está al centro, no se vuelve a centrar.
  const scrubbed = useRef<number | null>(null);

  const center = (b: HTMLElement) => b.offsetLeft + b.offsetWidth / 2;
  // Primera jugada y mitad de la franja: entre 0 y `edge` de scroll, el punto avanza al doble.
  const geometry = (ol: HTMLOListElement) => {
    const first = ol.querySelector<HTMLElement>("button[data-ply]");
    const c0 = first ? center(first) : 0;
    const half = ol.clientWidth / 2;
    return { c0, half, edge: half - c0 };
  };

  // Centra la jugada activa desplazando solo la lista: scrollIntoView movería también la ventana.
  // En la franja solo cuenta `left` y en la rejilla de `lg` solo `top`. Sin jugada activa (posición
  // inicial), vuelve al principio.
  useEffect(() => {
    const fromScrub = scrubbed.current === ply;
    scrubbed.current = null;
    const ol = ref.current;
    if (fromScrub || !ol) return;
    const el = ol.querySelector<HTMLElement>("[data-active=true]");
    let left = 0;
    if (el) {
      const { c0, half, edge } = geometry(ol);
      const c = center(el);
      left = scrub && c < c0 + 2 * edge ? (c - c0) / 2 : c - half;
      left = Math.max(0, Math.min(ol.scrollWidth - ol.clientWidth, left));
    }
    if (Math.abs(left - ol.scrollLeft) > 1) auto.current = true;
    ol.scrollTo({ left, top: el ? el.offsetTop - (ol.clientHeight - el.offsetHeight) / 2 : 0, behavior: "smooth" });
  }, [ply]);

  function onScroll() {
    const ol = ref.current!;
    if (auto.current) return;
    const { c0, half, edge } = geometry(ol);
    const s = ol.scrollLeft;
    const mid = s < edge ? c0 + 2 * s : s + half;
    let best: HTMLElement | null = null;
    for (const b of ol.querySelectorAll<HTMLElement>("button[data-ply]"))
      if (!best || Math.abs(center(b) - mid) < Math.abs(center(best) - mid)) best = b;
    const p = Number(best?.dataset.ply);
    if (best && p !== ply) {
      scrubbed.current = p;
      onSelect(p, true);
    }
  }

  // El usuario toma el control: lo que siga desplazándose es suyo.
  const takeOver = () => (auto.current = false);

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
