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
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>("[data-active=true]")
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [ply]);

  const offset = startsWithBlack ? 1 : 0;
  return (
    <ol
      ref={ref}
      aria-label="Jugadas"
      className="no-scrollbar flex gap-0.5 overflow-x-auto py-1 lg:grid lg:max-h-80 lg:grid-cols-[2.5rem_1fr_1fr] lg:overflow-y-auto lg:overflow-x-visible"
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
              className={`flex min-h-11 shrink-0 items-center gap-1 rounded px-2 text-sm font-semibold whitespace-nowrap lg:min-h-9 ${
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
