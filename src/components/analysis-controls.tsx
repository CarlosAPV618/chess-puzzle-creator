"use client";

import { Cpu, X } from "lucide-react";
import { useState } from "react";
import { DEPTH_PRESETS, type AnalysisState } from "~/hooks/use-analysis";

/** Preset de profundidad + Analizar, o barra de progreso con Cancelar. */
export function AnalysisControls({
  state,
  hasAnalysis,
  onStart,
  onCancel,
}: {
  state: AnalysisState;
  hasAnalysis: boolean;
  onStart: (depth: number) => void;
  onCancel: () => void;
}) {
  const [depth, setDepth] = useState(16);

  if (state.status === "running") {
    const pct = Math.round((state.done / Math.max(1, state.total)) * 100);
    return (
      <div className="card w-full p-3" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <Cpu className="size-4 animate-pulse text-brand" />
            Analizando… {state.done}/{state.total}
          </span>
          <button type="button" onClick={onCancel} className="btn-ghost">
            <X className="size-4" /> Cancelar
          </button>
        </div>
        <div
          role="progressbar"
          aria-label="Progreso del análisis"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-2 overflow-hidden rounded-full bg-ink"
        >
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">No cierres ni cambies de pestaña: el análisis corre en tu dispositivo.</p>
      </div>
    );
  }

  return (
    <div className="card flex w-full flex-wrap items-center gap-2 p-2">
      <div role="radiogroup" aria-label="Profundidad" className="flex flex-1 gap-1 rounded-lg bg-ink p-1">
        {DEPTH_PRESETS.map((p) => (
          <button
            key={p.depth}
            type="button"
            role="radio"
            aria-checked={depth === p.depth}
            onClick={() => setDepth(p.depth)}
            className={`min-h-11 flex-1 rounded-md px-2 text-sm font-semibold ${
              depth === p.depth ? "bg-raised text-fg ring-1 ring-line" : "text-muted"
            }`}
          >
            {p.label}
            <span className="ml-1 font-mono text-xs text-muted">{p.depth}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onStart(depth)} className="btn-primary flex-1 sm:flex-none">
        <Cpu className="size-4" /> {hasAnalysis ? "Reanalizar" : "Analizar"}
      </button>
      {state.status === "error" && <p className="w-full text-sm text-[#ffb4a8]">{state.message}</p>}
    </div>
  );
}
