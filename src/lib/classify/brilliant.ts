// Ported from WintrCat/wintrchess (GPL-3.0) @ d145b20968955ca955cafe3fc3b51305f3bf41f9:
//   shared/src/lib/reporter/utils/criticalMove.ts
//   shared/src/lib/reporter/classification/critical.ts
//   shared/src/lib/reporter/classification/brilliant.ts
// Changes: White-POV `Eval`, a second line that already mates also counts as
// "already winning" (design D4), desperado moves are not sacrifices, strict TS.
import type { Chess, Move } from "chess.js";
import type { EngineLine, Eval } from "../types";
import { evalValue, isWinningMate, pointLoss, subjective } from "./expected-points";
import {
  captureSquare,
  getAttackingMoves,
  getUnsafePieces,
  hasDangerLevels,
  isPieceSafe,
  isPieceTrapped,
} from "./piece-safety";

export type MoveContext = {
  /** Position before the move. */
  prevBoard: Chess;
  /** Position after the move. */
  board: Chess;
  move: Move;
  /** Eval of the best line before the move (White POV). */
  bestEval: Eval;
  /** Eval after the move (White POV). */
  after: Eval;
  /** Second best line before the move (White POV). */
  second?: EngineLine;
};

/** Pre-condition shared by Great and Brilliant (design D4 "precandidato crítico"). */
export function isCriticalCandidate(ctx: MoveContext): boolean {
  const mover = ctx.move.color;
  if (ctx.second) {
    const s = subjective(ctx.second.eval, mover);
    // Still completely winning without this move.
    if ((s.cp !== undefined && s.cp >= 700) || isWinningMate(s)) return false;
  } else {
    const a = subjective(ctx.after, mover);
    if (a.cp !== undefined && a.cp >= 700) return false;
  }
  // Moves in losing positions cannot be critical.
  if (evalValue(subjective(ctx.after, mover)) < 0) return false;
  if (ctx.move.promotion === "q") return false;
  // Moves that must be played anyway to escape check.
  if (ctx.prevBoard.isCheck()) return false;
  return true;
}

/** Great move ("única jugada"). Caller ensures the move is the engine's top move. */
export function isGreat(ctx: MoveContext): boolean {
  if (!isCriticalCandidate(ctx)) return false;
  const mover = ctx.move.color;
  // Finding a mate is not critical.
  if (isWinningMate(subjective(ctx.after, mover))) return false;
  // Capturing free material is not critical.
  if (ctx.move.captured) {
    const safe = isPieceSafe(ctx.prevBoard, {
      color: mover === "w" ? "b" : "w",
      square: captureSquare(ctx.move),
      type: ctx.move.captured,
    });
    if (!safe) return false;
  }
  if (!ctx.second) return false;
  return pointLoss(ctx.bestEval, ctx.second.eval, mover) >= 0.1;
}

/** Brilliant candidate (real piece sacrifice). Caller ensures the move is the engine's top move. */
export function isBrilliant(ctx: MoveContext): boolean {
  if (!isCriticalCandidate(ctx)) return false;
  if (ctx.move.promotion) return false;
  const mover = ctx.move.color;

  let unsafe = getUnsafePieces(ctx.board, mover, ctx.move);
  if (unsafe.length === 0) return false; // nothing hangs: no sacrifice (and skips the costly checks)
  const previousUnsafe = getUnsafePieces(ctx.prevBoard, mover);

  // Moving a piece to safety disallows brilliant.
  if (!ctx.board.isCheck() && unsafe.length < previousUnsafe.length) return false;

  // Desperado (not upstream): a piece that was already en prise on its origin square
  // is not sacrificed by moving it to another attacked square.
  if (previousUnsafe.some((p) => p.square === ctx.move.from)) {
    unsafe = unsafe.filter((p) => p.square !== ctx.move.to);
    if (unsafe.length === 0) return false;
  }

  // Every capture of every hanging piece leaves an equal or greater counter-threat:
  // not a real sacrifice, the opponent just must not take.
  const protectedByDanger = unsafe.every((p) =>
    hasDangerLevels(ctx.board, p, getAttackingMoves(ctx.board, p, false)),
  );
  if (protectedByDanger) return false;

  const previousTrapped = previousUnsafe.filter((p) => isPieceTrapped(ctx.prevBoard, p));
  const trapped = unsafe.filter((p) => isPieceTrapped(ctx.board, p));
  const movedPieceTrapped = previousTrapped.some((p) => p.square === ctx.move.from);
  if (
    trapped.length === unsafe.length ||
    movedPieceTrapped ||
    trapped.length < previousTrapped.length
  ) {
    return false;
  }

  return unsafe.length > 0;
}
