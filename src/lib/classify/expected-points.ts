// Ported from WintrCat/wintrchess (GPL-3.0), shared/src/lib/reporter/expectedPoints.ts
// and shared/src/lib/reporter/classification/pointLoss.ts @ d145b20968955ca955cafe3fc3b51305f3bf41f9
// Changes: evals are White-POV `Eval` (design D3), Lichess gradient 0.00368208 with
// ±1000 clamp, chess.com loss thresholds (design D4).
import type { Classification, Color, Eval } from "../types";

const GRADIENT = 0.00368208;

/**
 * Expected points (0..1) for `mover`. `{ mate: 0 }` (checkmate on the board) only
 * ever appears as the eval *after* `mover`'s move, so it counts as a win for `mover`.
 */
export function expectedPoints(evalWhite: Eval, mover: Color): number {
  const sign = mover === "w" ? 1 : -1;
  if (evalWhite.mate !== undefined) {
    if (evalWhite.mate === 0) return 1;
    return evalWhite.mate * sign > 0 ? 1 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, evalWhite.cp * sign));
  return 1 / (1 + Math.exp(-GRADIENT * cp));
}

/** EP lost by `mover` going from `before` (best line) to `after`. */
export function pointLoss(before: Eval, after: Eval, mover: Color): number {
  return Math.max(0, expectedPoints(before, mover) - expectedPoints(after, mover));
}

/** Eval from `mover`'s point of view (mate 0 after mover's move = mover won, kept as 0). */
export function subjective(evalWhite: Eval, mover: Color): Eval {
  const sign = mover === "w" ? 1 : -1;
  return evalWhite.mate !== undefined
    ? { mate: evalWhite.mate * sign || 0 }
    : { cp: evalWhite.cp * sign || 0 };
}

/** True if `e` (subjective) is a forced mate for the side it belongs to. */
export function isWinningMate(e: Eval): boolean {
  return e.mate !== undefined && e.mate >= 0;
}

/** Signed magnitude of a subjective eval (mates as ±100000), for "is losing" checks. */
export function evalValue(e: Eval): number {
  if (e.mate === undefined) return e.cp;
  return e.mate >= 0 ? 100000 - e.mate : -100000 - e.mate;
}

export function lossClass(loss: number): Classification {
  if (loss < 0.02) return "excellent";
  if (loss < 0.05) return "good";
  if (loss < 0.1) return "inaccuracy";
  if (loss < 0.2) return "mistake";
  return "blunder";
}

/**
 * Classifies a move that is NOT the engine's top move, from the best-line eval
 * before and the eval after (both White POV).
 */
export function pointLossClassify(before: Eval, after: Eval, mover: Color): Classification {
  const prev = subjective(before, mover);
  const cur = subjective(after, mover);

  if (prev.mate !== undefined && cur.mate !== undefined) {
    // Winning mate to losing mate
    if (prev.mate > 0 && cur.mate < 0) return cur.mate < -3 ? "mistake" : "blunder";
    if (prev.mate > 0 || prev.mate === 0) {
      // The winning side expects the mate to shorten by one.
      const mateLoss = cur.mate - prev.mate;
      if (mateLoss < 0) return "best";
      if (mateLoss < 2) return "excellent";
      if (mateLoss < 7) return "good";
      return "inaccuracy";
    }
    // Losing side: keeping the mate as long as possible is best.
    const mateLoss = cur.mate - prev.mate; // both negative; more negative = longer
    return mateLoss <= 0 ? "best" : mateLoss < 2 ? "excellent" : mateLoss < 7 ? "good" : "inaccuracy";
  }

  if (prev.mate !== undefined && prev.mate > 0 && cur.cp !== undefined) {
    if (cur.cp >= 800) return "excellent";
    if (cur.cp >= 400) return "good";
    if (cur.cp >= 200) return "inaccuracy";
    if (cur.cp >= 0) return "mistake";
    return "blunder";
  }

  if (prev.cp !== undefined && cur.mate !== undefined) {
    if (cur.mate >= 0) return "best";
    if (cur.mate >= -2) return "blunder";
    if (cur.mate >= -5) return "mistake";
    return "inaccuracy";
  }

  return lossClass(pointLoss(before, after, mover));
}
