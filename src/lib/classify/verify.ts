// D4b: pure decision logic for verifying Brilliant candidates with a deeper search.
// The engine I/O lives in src/lib/engine/analyze-game.ts.
import { Chess } from "chess.js";
import type { Color, EngineLine, Eval } from "../types";
import { uciToMove } from "../engine/uci";
import { isBrilliant } from "./brilliant";
import { evalValue, expectedPoints, pointLoss, subjective } from "./expected-points";
import { PIECE_VALUES, boardPieces, getUnsafePieces } from "./piece-safety";
import type { BrilliantCandidate } from "./index";

export const MAX_CANDIDATES = 6;
export const VERIFY_DEPTH = 22;
export const VERIFY_MULTIPV = 3;
export const SUSTAIN_PLIES = 6;

/** User's side first, then the largest EP gain; at most 6 (design D4b). */
export function pickCandidates(candidates: BrilliantCandidate[], userColor: Color | null): BrilliantCandidate[] {
  return [...candidates]
    .sort((a, b) => Number(b.color === userColor) - Number(a.color === userColor) || b.gain - a.gain)
    .slice(0, MAX_CANDIDATES);
}

export type VerifyInput = {
  /** FEN of the position before the candidate move. */
  fen: string;
  uci: string;
  /** Best-line eval at the normal analysis depth (White POV). */
  shallowBest: Eval;
  /** Deep search of the position before (depth 22, MultiPV 3). */
  deep: { lines: EngineLine[]; pv: string[] };
  /**
   * Eval (White POV) of the position after the candidate when the opponent is
   * restricted to capturing the hanging piece(s). Only needed if asked for.
   */
  captureEval?: Eval;
};

export type VerifyOutcome =
  | { status: "rejected"; reason: string }
  | { status: "confirmed"; exerciseEligible: boolean }
  /** Run a search after the move with `searchmoves <captures>` and call again with `captureEval`. */
  | { status: "needsCapture"; captures: string[] };

const material = (board: Chess, color: Color) =>
  boardPieces(board).reduce(
    (sum, p) => (p.type === "k" ? sum : sum + (p.color === color ? 1 : -1) * PIECE_VALUES[p.type]),
    0,
  );

/**
 * The sacrificer is still down >= 2 points after the first 6 plies of the PV (or at
 * its end if shorter, e.g. mate). A piece won back within those plies (deferred
 * exchange, fork trick, check that regains it) does not count.
 */
export function sacrificeSustained(fen: string, pv: string[], color: Color): boolean {
  const board = new Chess(fen);
  const start = material(board, color);
  const deficits: number[] = [];
  for (const uci of pv.slice(0, SUSTAIN_PLIES)) {
    try {
      board.move(uciToMove(uci));
    } catch {
      return false; // invalid PV: be conservative
    }
    deficits.push(start - material(board, color));
  }
  return deficits.length > 0 && deficits.at(-1)! >= 2;
}

export function verifyBrilliant(input: VerifyInput): VerifyOutcome {
  const prevBoard = new Chess(input.fen);
  const mover = prevBoard.turn();
  const opponent: Color = mover === "w" ? "b" : "w";
  const top = input.deep.lines[0];

  if (!top || top.uci !== input.uci) return { status: "rejected", reason: "not top move at depth" };
  if (Math.abs(expectedPoints(top.eval, mover) - expectedPoints(input.shallowBest, mover)) > 0.05) {
    return { status: "rejected", reason: "unstable eval" };
  }
  const subj = subjective(top.eval, mover);
  if (subj.mate !== undefined && subj.mate > 15) return { status: "rejected", reason: "long mate" };

  const board = new Chess(input.fen);
  const move = board.move(uciToMove(input.uci));
  if (!isBrilliant({ prevBoard, board, move, bestEval: top.eval, after: top.eval, second: input.deep.lines[1] })) {
    return { status: "rejected", reason: "not a sacrifice at depth" };
  }

  if (!sacrificeSustained(input.fen, input.deep.pv, mover)) {
    // The opponent declines in the PV: the piece must be poisoned (taking it is worse).
    if (!input.captureEval) {
      // Captures of the most valuable hanging piece (the real sacrifice).
      const unsafe = getUnsafePieces(board, mover, move);
      const maxValue = Math.max(...unsafe.map((p) => PIECE_VALUES[p.type]));
      const squares = new Set(unsafe.filter((p) => PIECE_VALUES[p.type] === maxValue).map((p) => p.square));
      const captures = board
        .moves({ verbose: true })
        .filter((m) => squares.has(m.to))
        .map((m) => m.from + m.to + (m.promotion ?? ""));
      return captures.length
        ? { status: "needsCapture", captures }
        : { status: "rejected", reason: "no capture available" };
    }
    const take = subjective(input.captureEval, opponent);
    const decline = subjective(top.eval, opponent);
    const margin = take.cp !== undefined && decline.cp !== undefined ? 50 : 0;
    if (!(evalValue(take) < evalValue(decline) - margin)) {
      return { status: "rejected", reason: "sacrifice not sustained" };
    }
  }

  const second = input.deep.lines[1];
  return { status: "confirmed", exerciseEligible: !!second && pointLoss(top.eval, second.eval, mover) >= 0.1 };
}
