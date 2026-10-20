import { Chess } from "chess.js";
import { expectedPoints } from "~/lib/classify/expected-points";
import type { Color, Eval } from "~/lib/types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Uci = string;

export const uciFrom = (u: Uci) => u.slice(0, 2);
export const uciTo = (u: Uci) => u.slice(2, 4);

/** Reproduce las jugadas: fens tiene N+1 elementos. */
export function replay(startFen: string, movesUci: Uci[]) {
  const chess = new Chess(startFen);
  const fens = [chess.fen()];
  const sans: string[] = [];
  for (const u of movesUci) {
    const m = chess.move({ from: uciFrom(u), to: uciTo(u), promotion: u[4] });
    sans.push(m.san);
    fens.push(chess.fen());
  }
  return { fens, sans };
}

export const turnOf = (fen: string): Color => (fen.split(" ")[1] === "b" ? "b" : "w");

/** SAN de una UCI en la posición dada, o la UCI si no es legal. */
export function sanOf(fen: string, uci: Uci) {
  try {
    return new Chess(fen).move({ from: uciFrom(uci), to: uciTo(uci), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

/** Aplica una UCI; null si es ilegal. */
export function applyUci(fen: string, uci: Uci) {
  try {
    const c = new Chess(fen);
    c.move({ from: uciFrom(uci), to: uciTo(uci), promotion: uci[4] });
    return c.fen();
  } catch {
    return null;
  }
}

/** Probabilidad de victoria de blancas 0..1 (curva de Lichess, D4). `fen` resuelve `mate: 0`. */
export function whiteShare(e: Eval | undefined, fen?: string) {
  if (!e) return 0.5;
  if (e.mate !== undefined) {
    if (e.mate === 0) return fen && turnOf(fen) === "w" ? 0 : 1;
    return e.mate > 0 ? 1 : 0;
  }
  return expectedPoints(e, "w");
}

export function formatEval(e: Eval | undefined, fen?: string) {
  if (!e) return "–";
  if (e.mate !== undefined) {
    if (e.mate === 0) return fen && turnOf(fen) === "w" ? "0-1" : "1-0";
    return `${e.mate > 0 ? "" : "-"}M${Math.abs(e.mate)}`;
  }
  const v = e.cp / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 10 ? 0 : 1)}`;
}

const PIECE_GLYPH: Record<string, string> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
/** "Nf3" → "♘f3" para mostrar. */
export const prettySan = (san: string) => san.replace(/^[KQRBN]/, (p) => PIECE_GLYPH[p] ?? p);

export const sideName = (fen: string): "blancas" | "negras" => (turnOf(fen) === "w" ? "blancas" : "negras");

/** "12. ♘f3" (blancas) o "12… b5" (negras): número del campo 6 del FEN, turno del campo 2. */
export function moveLabel(fenBefore: string, san: string) {
  const n = fenBefore.split(" ")[5] ?? "1";
  return `${n}${turnOf(fenBefore) === "w" ? "." : "…"} ${prettySan(san)}`;
}
