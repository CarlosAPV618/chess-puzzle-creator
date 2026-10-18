"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Color, Eval, GameAnalysis } from "~/lib/types";

export const DEPTH_PRESETS = [
  { depth: 12, label: "Rápido" },
  { depth: 16, label: "Normal" },
  { depth: 20, label: "Profundo" },
] as const;

export type AnalysisState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number; depth: number }
  | { status: "error"; message: string };

type Input = { startFen: string; movesUci: string[]; userColor: Color | null };

/** Corre `analyzeGame` con progreso, evals parciales y cancelación (también al salir). Wake Lock: lo pide analyzeGame. */
export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const [liveEvals, setLiveEvals] = useState<Eval[]>([]);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const cancel = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setState({ status: "idle" });
  }, []);

  const run = useCallback(async (input: Input, depth: number): Promise<GameAnalysis | null> => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: "running", done: 0, total: input.movesUci.length + 1, depth });
    setLiveEvals([]);
    try {
      // Carga diferida: el libro de aperturas (~700 KB) solo baja al analizar.
      const { analyzeGame } = await import("~/lib/engine/analyze-game");
      const result = await analyzeGame(
        input,
        {
          depth,
          onProgress: (done, total) => !c.signal.aborted && setState({ status: "running", done, total, depth }),
          onPosition: (i, pos) =>
            !c.signal.aborted &&
            setLiveEvals((prev) => {
              const next = [...prev];
              next[i] = pos.eval;
              return next;
            }),
        },
        c.signal,
      );
      if (c.signal.aborted) return null;
      setState({ status: "idle" });
      return result;
    } catch (e) {
      if (c.signal.aborted) return null;
      setState({ status: "error", message: e instanceof Error ? e.message : "Falló el análisis" });
      return null;
    } finally {
      if (ctrl.current === c) ctrl.current = null;
    }
  }, []);

  return { state, run, cancel, liveEvals };
}
