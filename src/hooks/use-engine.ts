"use client";

import { acceptsSecond, judge, type JudgeRequest } from "~/lib/engine/check-move";
import { Engine } from "~/lib/engine/engine";
import type { Classification, PositionAnalysis } from "~/lib/types";
import { turnOf } from "~/components/chess";

// ponytail: un motor interactivo por pestaña (variantes, reintentos, práctica); el análisis
// completo usa su propio Worker. Nunca se termina: vive lo que vive la pestaña.
let shared: Promise<Engine> | null = null;
export function getEngine() {
  shared ??= Engine.create().catch((e: unknown) => {
    shared = null;
    throw e;
  });
  return shared;
}

/** Jugadas aceptadas sin motor: la mejor, más la segunda si pierde < 0.05 EP; en un miss, además ≥ MISS_WIN (D1). */
export function acceptedMoves(pos: PositionAnalysis | undefined, fen: string, cls?: Classification) {
  if (!pos?.best) return [];
  const out = [pos.best.uci];
  if (pos.second && acceptsSecond(pos.best, pos.second, turnOf(fen), cls === "miss")) out.push(pos.second.uci);
  return out;
}

export type { Verdict } from "~/lib/engine/check-move";

/** Validación de D1/D9: lista aceptada y, si no está, `searchmoves` a profundidad 14. */
export const judgeMove = (p: JudgeRequest) => judge(getEngine, p);
