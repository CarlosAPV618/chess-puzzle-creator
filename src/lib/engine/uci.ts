// Pure UCI helpers (no Worker), unit-tested in uci.test.ts.
import { Chess } from "chess.js";
import type { Color, Eval } from "../types";

export type InfoLine = {
  depth: number;
  multipv: number;
  /** Score from the side to move (raw Stockfish convention). */
  score: Eval;
  bound: boolean;
  pv: string[];
};

/** Parses `info ... score ... pv ...`; returns null for lines without score or pv. */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith("info ")) return null;
  const t = line.split(" ");
  let depth = 0;
  let multipv = 1;
  let score: Eval | null = null;
  let bound = false;
  let pv: string[] = [];
  for (let i = 1; i < t.length; i++) {
    const k = t[i];
    if (k === "depth") depth = Number(t[++i]);
    else if (k === "multipv") multipv = Number(t[++i]);
    else if (k === "score") {
      const kind = t[++i];
      const v = Number(t[++i]);
      score = kind === "mate" ? { mate: v } : { cp: v };
    } else if (k === "lowerbound" || k === "upperbound") bound = true;
    else if (k === "pv") {
      pv = t.slice(i + 1).filter(Boolean);
      break;
    } else if (k === "string") return null;
  }
  if (!score || pv.length === 0) return null;
  return { depth, multipv, score, bound, pv };
}

/** Stockfish scores are from the side to move; stored evals are from White (design D3). */
export function toWhitePov(score: Eval, turn: Color): Eval {
  if (turn === "w") return score;
  return score.mate !== undefined ? { mate: -score.mate || 0 } : { cp: -score.cp || 0 };
}

/** Eval for positions the engine must not see (no legal moves / game over), else null. */
export function terminalEval(chess: Chess): Eval | null {
  if (chess.isCheckmate()) return { mate: 0 };
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) {
    return { cp: 0 };
  }
  return null;
}

/** Replays `moves` (UCI) from `startFen`. Throws on an illegal move. */
export function replay(startFen: string, moves: string[]): Chess {
  const chess = new Chess(startFen);
  for (const uci of moves) chess.move(uciToMove(uci));
  return chess;
}

export function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}
