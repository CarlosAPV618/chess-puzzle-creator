"use client";

import { useEffect, useRef } from "react";
import type { Classification } from "~/lib/types";
import { prettySan } from "./chess";
import { ClassIcon } from "./class-icon";

/**
 * Lista de jugadas: fila desplazable en móvil, panel en dos columnas en escritorio.
 * `ply` = número de jugadas hechas (la jugada activa es ply-1).
 */
export function MoveList({
  sans,
  classes,
  ply,
  startsWithBlack,
  startMoveNumber = 1,
  onSelect,
}: {
  sans: string[];
  classes: (Classification | undefined)[];
  ply: number;
  startsWithBlack?: boolean;
  startMoveNumber?: number;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  // Centra la jugada activa desplazando solo la lista: scrollIntoView movería también la ventana.
  // En la franja solo cuenta `left` y en la rejilla de `lg` solo `top`; scrollTo recorta al rango válido.
  useEffect(() => {
    const ol = ref.current;
    const el = ol?.querySelector<HTMLElement>("[data-active=true]");
    if (!ol || !el) return;
    ol.scrollTo({
      left: el.offsetLeft - (ol.clientWidth - el.offsetWidth) / 2,
      top: el.offsetTop - (ol.clientHeight - el.offsetHeight) / 2,
      behavior: "smooth",
    });
  }, [ply]);

  const offset = startsWithBlack ? 1 : 0;
  return (
    <ol
      ref={ref}
      aria-label="Jugadas"
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
    </ol>
  );
}
