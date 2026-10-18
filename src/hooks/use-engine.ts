"use client";

import { expectedPoints } from "~/lib/classify/expected-points";
import { checkMove } from "~/lib/engine/check-move";
import { Engine } from "~/lib/engine/engine";
import type { PositionAnalysis } from "~/lib/types";
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

/** Jugadas aceptadas sin motor: la mejor, más la segunda si pierde < 0.05 EP (D8/D9). */
export function acceptedMoves(pos: PositionAnalysis | undefined, fen: string) {
  if (!pos?.best) return [];
  const out = [pos.best.uci];
  const color = turnOf(fen);
  if (pos.second && expectedPoints(pos.best.eval, color) - expectedPoints(pos.second.eval, color) < 0.05)
    out.push(pos.second.uci);
  return out;
}

export type Verdict = { correct: boolean; exact: boolean };

/** Validación de D9: lista aceptada y, si no está, `searchmoves` a profundidad 14. */
export async function judgeMove(p: {
  startFen: string;
  movesBefore: string[];
  uci: string;
  bestUci: string;
  accepted: string[];
  /** Brillante: solo vale la jugada exacta. */
  strict?: boolean;
}): Promise<Verdict> {
  if (p.uci === p.bestUci) return { correct: true, exact: true };
  if (p.accepted.includes(p.uci)) return { correct: true, exact: false };
  if (p.strict) return { correct: false, exact: false };
  const engine = await getEngine();
  const r = await checkMove(engine, {
    startFen: p.startFen,
    movesBefore: p.movesBefore,
    userUci: p.uci,
    bestUci: p.bestUci,
    depth: 14,
  });
  return { correct: r.correct, exact: false };
}
