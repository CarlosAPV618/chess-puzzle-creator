"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

/** ⏮ ◀ ▶ ⏭ + teclado: ← → una jugada, ↑ inicio, ↓ final. */
export function NavBar({ ply, max, onChange }: { ply: number; max: number; onChange: (ply: number) => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      const next =
        e.key === "ArrowLeft" ? ply - 1 : e.key === "ArrowRight" ? ply + 1 : e.key === "Home" || e.key === "ArrowUp" ? 0 : e.key === "End" || e.key === "ArrowDown" ? max : null;
      if (next === null) return;
      e.preventDefault();
      onChange(Math.max(0, Math.min(max, next)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, max, onChange]);

  const btn = (label: string, to: number, Icon: typeof ChevronLeft, disabled: boolean) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(to)}
      className="flex h-12 flex-1 items-center justify-center rounded-md bg-raised text-fg transition hover:bg-line active:scale-95 disabled:opacity-35"
    >
      <Icon className="size-6" />
    </button>
  );
  return (
    <div className="flex gap-1.5">
      {btn("Inicio", 0, ChevronFirst, ply === 0)}
      {btn("Anterior", ply - 1, ChevronLeft, ply === 0)}
      {btn("Siguiente", ply + 1, ChevronRight, ply >= max)}
      {btn("Final", max, ChevronLast, ply >= max)}
    </div>
  );
}
