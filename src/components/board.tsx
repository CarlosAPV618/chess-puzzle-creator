"use client";

import { Chess, type Square } from "chess.js";
import { useMemo, useState, type CSSProperties } from "react";
import { Chessboard, type Arrow, type PieceRenderObject } from "react-chessboard";
import type { Classification } from "~/lib/types";
import { ClassIcon } from "./class-icon";

export type BoardProps = {
  id?: string;
  fen: string;
  orientation: "white" | "black";
  /** Si existe, el usuario puede mover las piezas del bando al turno. */
  onMove?: (uci: string) => void;
  arrows?: Arrow[];
  lastMove?: { from: string; to: string } | null;
  badge?: { square: string; cls: Classification } | null;
  /** Casillas resaltadas (p. ej. la pista). */
  highlight?: string[];
};

// Set cburnett de Lichess (Colin M.L. Burnett, GPLv2+), SVG vectorial nítido a cualquier tamaño.
const PIECES: PieceRenderObject = Object.fromEntries(
  ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"].map((p) => [
    p,
    () => <img src={`/pieces/cburnett/${p}.svg`} alt="" draggable={false} style={{ width: "100%", height: "100%" }} />,
  ]),
);

const LAST: CSSProperties = { background: "rgba(246, 224, 94, 0.42)" };
const SELECTED: CSSProperties = { background: "rgba(127, 178, 74, 0.55)" };
const HINT: CSSProperties = { boxShadow: "inset 0 0 0 4px #1fb5ad", background: "rgba(31,181,173,.25)" };
/** Casilla marcada con clic derecho (D7), como lichess. */
const MARK: CSSProperties = { background: "rgba(235, 97, 80, 0.8)" };

export function Board({ id = "board", fen, orientation, onMove, arrows = [], lastMove, badge, highlight = [] }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [marks, setMarks] = useState<ReadonlySet<string>>(new Set());
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  // La selección y las marcas se descartan si cambia la posición.
  const [lastFen, setLastFen] = useState(fen);
  if (lastFen !== fen) {
    setLastFen(fen);
    setSelected(null);
    setMarks(new Set());
  }

  const targets = useMemo(
    () => (chess && selected ? chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string) : []),
    [chess, selected],
  );

  // ponytail: siempre corona a dama; agregar selector si hace falta subpromoción.
  function tryMove(from: string, to: string) {
    if (!chess || !onMove) return false;
    const m = chess.moves({ square: from as Square, verbose: true }).find((x) => x.to === to);
    if (!m) return false;
    onMove(from + to + (m.promotion ? "q" : ""));
    setSelected(null);
    return true;
  }

  function ownPiece(square: string) {
    const p = chess?.get(square as Square);
    return !!p && p.color === chess?.turn();
  }

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = LAST;
    squareStyles[lastMove.to] = LAST;
  }
  for (const s of highlight) squareStyles[s] = HINT;
  if (selected) squareStyles[selected] = SELECTED;
  for (const s of marks) squareStyles[s] = { ...squareStyles[s], ...MARK };

  return (
    <div className="relative aspect-square w-full touch-manipulation select-none [-webkit-touch-callout:none] shadow-[0_10px_40px_-12px_#000]">
      <Chessboard
        options={{
          id,
          position: fen,
          pieces: PIECES,
          boardOrientation: orientation,
          arrows,
          // Flechas con clic derecho arrastrando; la librería las guarda aparte de `arrows` (D7).
          allowDrawingArrows: true,
          animationDurationInMs: 180,
          lightSquareStyle: { backgroundColor: "var(--color-board-light)" },
          darkSquareStyle: { backgroundColor: "var(--color-board-dark)" },
          lightSquareNotationStyle: { color: "var(--color-board-dark)", fontWeight: 700 },
          darkSquareNotationStyle: { color: "var(--color-board-light)", fontWeight: 700 },
          allowDragging: !!onMove,
          canDragPiece: ({ square }) => !!onMove && !!square && ownPiece(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => !!targetSquare && tryMove(sourceSquare, targetSquare),
          onSquareClick: ({ square }) => {
            if (!onMove) return;
            if (selected && targets.includes(square)) return void tryMove(selected, square);
            setSelected(ownPiece(square) && square !== selected ? square : null);
          },
          onSquareRightClick: ({ square }) =>
            setMarks((m) => {
              const n = new Set(m);
              if (!n.delete(square)) n.add(square);
              return n;
            }),
          // Clic izquierdo borra las marcas, igual que la librería borra las flechas en mousedown.
          onSquareMouseDown: (_, e) => {
            if (e.button === 0 && marks.size) setMarks(new Set());
          },
          squareRenderer: ({ square, children }) => (
            <div style={{ width: "100%", height: "100%", position: "relative", ...squareStyles[square] }}>
              {children}
              {targets.includes(square) && (
                <span
                  aria-hidden
                  className={
                    chess?.get(square as Square)
                      ? "pointer-events-none absolute inset-0 rounded-full border-[5px] border-black/25"
                      : "pointer-events-none absolute top-1/2 left-1/2 size-[28%] -translate-1/2 rounded-full bg-black/25"
                  }
                />
              )}
              {badge?.square === square && (
                <span key={fen} className="animate-pop pointer-events-none absolute -top-[14%] -right-[14%] z-10 w-[46%]">
                  <ClassIcon cls={badge.cls} size={64} className="h-auto w-full" />
                </span>
              )}
            </div>
          ),
        }}
      />
    </div>
  );
}
