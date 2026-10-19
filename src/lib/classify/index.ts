// Move classification (design D4). Pure: no engine, no React.
import { Chess, DEFAULT_POSITION } from "chess.js";
import type { Classification, Color, MoveAnalysis, Phase, PositionAnalysis } from "../types";
import { uciToMove } from "../engine/uci";
import { isBrilliant, isGreat, type MoveContext } from "./brilliant";
import { expectedPoints, pointLoss, pointLossClassify } from "./expected-points";
import { bookKey, isBook, lookupOpening } from "./openings";

export { expectedPoints, pointLoss } from "./expected-points";
export { isBook, lookupOpening } from "./openings";

/** Pérdida de EP a partir de la cual una jugada del libro deja de contar como Teoría (umbral de Error). */
const BOOK_MAX_LOSS = 0.1;
/** EP (≈ +1.3) desde el que una posición cuenta como ganadora para la Oportunidad perdida (design D1). */
export const MISS_WIN = 0.62;

/** Bump when classification rules change (lets the server/UI offer a re-analysis). */
export { CLASSIFIER_VERSION } from "./version";

export type BrilliantCandidate = {
  /** Index of the move (0-based); the position before it is `positions[ply]`. */
  ply: number;
  /** The engine's top move (the sacrifice). */
  uci: string;
  /** True if it was played; false = `brilliantMissed` candidate. */
  played: boolean;
  color: Color;
  /** EP the second best line loses vs. the best (used to rank candidates, D4b). */
  gain: number;
};

export type ClassifyInput = {
  startFen: string;
  movesUci: string[];
  positions: PositionAnalysis[];
  userColor: Color | null;
};

export function classifyGame(input: ClassifyInput): {
  moves: MoveAnalysis[];
  candidates: BrilliantCandidate[];
} {
  const { startFen, movesUci, positions } = input;
  if (positions.length !== movesUci.length + 1) {
    throw new Error(`positions must have ${movesUci.length + 1} items`);
  }
  const chess = new Chess(startFen);
  // Games from a custom FEN get no opening book (design D6).
  let inBook = bookKey(startFen) === bookKey(DEFAULT_POSITION);
  const moves: MoveAnalysis[] = [];
  const candidates: BrilliantCandidate[] = [];

  movesUci.forEach((uci, ply) => {
    const pos = positions[ply]!;
    const next = positions[ply + 1]!;
    const prevFen = chess.fen();
    const legalCount = chess.moves().length;
    const move = chess.move(uciToMove(uci));
    const mover = move.color;
    const bestEval = pos.best?.eval ?? pos.eval;
    const topPlayed = pos.best?.uci === uci;
    const epLoss = topPlayed ? 0 : pointLoss(bestEval, next.eval, mover);
    const gain = pos.second ? pointLoss(bestEval, pos.second.eval, mover) : 0;
    inBook = inBook && isBook(chess.fen());

    const ctx = (): MoveContext => ({
      prevBoard: new Chess(prevFen),
      board: new Chess(chess.fen()),
      move,
      bestEval,
      after: next.eval,
      second: pos.second,
    });

    let cls: Classification;
    // El mate va antes que el libro, y una jugada "de libro" que pierde >= 0.10 EP (p. ej. 2.g4?? del
    // mate del loco, que Lichess nombra como apertura) se clasifica por su pérdida.
    if (legalCount === 1) cls = "forced";
    else if (chess.isCheckmate()) cls = "best";
    else if (inBook && epLoss < BOOK_MAX_LOSS) cls = "book";
    else if (topPlayed) {
      const c = ctx();
      cls = isGreat(c) ? "great" : "best";
      if (isBrilliant(c)) candidates.push({ ply, uci, played: true, color: mover, gain });
    } else cls = pointLossClassify(bestEval, next.eval, mover);

    // Brilliant available but not played: same detection on the engine's move.
    if (!topPlayed && pos.best && legalCount > 1 && cls !== "book") {
      const prevBoard = new Chess(prevFen);
      const board = new Chess(prevFen);
      const bestMove = board.move(uciToMove(pos.best.uci));
      if (
        !board.isCheckmate() &&
        isBrilliant({ prevBoard, board, move: bestMove, bestEval, after: pos.best.eval, second: pos.second })
      ) {
        candidates.push({ ply, uci: pos.best.uci, played: false, color: mover, gain });
      }
    }

    // Miss (design D1, v3): the best move kept a winning position and the move played gave it up.
    // Blunder stays Blunder; keeping the win is classified by its loss alone.
    if (
      (cls === "inaccuracy" || cls === "mistake") &&
      expectedPoints(bestEval, mover) >= MISS_WIN &&
      expectedPoints(next.eval, mover) < MISS_WIN
    ) {
      cls = "miss";
    }

    moves.push({ class: cls, epLoss });
  });

  return { moves, candidates };
}

/** Lichess per-move accuracy from an EP loss (Δwin% = 100 · loss), clamped to [0, 100]. */
export function moveAccuracy(epLoss: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * (100 * epLoss)) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

/** Simple mean per player, rounded to one decimal (design D4). 100 if a side made no moves. */
export function accuracy(moves: MoveAnalysis[], startFen: string): { white: number; black: number } {
  const first: Color = startFen.split(" ")[1] === "b" ? "b" : "w";
  const sums = { w: [0, 0], b: [0, 0] };
  moves.forEach((m, i) => {
    const color: Color = i % 2 === 0 ? first : first === "w" ? "b" : "w";
    sums[color][0]! += moveAccuracy(m.epLoss);
    sums[color][1]! += 1;
  });
  const avg = ([s, n]: number[]) => (n ? Math.round((s! / n) * 10) / 10 : 100);
  return { white: avg(sums.w), black: avg(sums.b) };
}

/**
 * Endgame: at most 6 pieces besides kings and pawns. Opening: first 20 plies.
 * Otherwise middlegame.
 */
export function phaseOf(fen: string, ply: number): Phase {
  const placement = fen.split(" ")[0] ?? "";
  const pieces = placement.replace(/[^nbrqNBRQ]/g, "").length;
  if (pieces <= 6) return "endgame";
  if (ply < 20) return "opening";
  return "middlegame";
}

/** Name of the last book position reached (design D7); null for custom-FEN games. */
export function gameOpening(startFen: string, movesUci: string[]): { eco: string; name: string } | null {
  if (bookKey(startFen) !== bookKey(DEFAULT_POSITION)) return null;
  const chess = new Chess(startFen);
  let found: { eco: string; name: string } | null = null;
  for (const uci of movesUci) {
    chess.move(uciToMove(uci));
    const o = lookupOpening(chess.fen());
    if (!o) break;
    found = o;
  }
  return found;
}
