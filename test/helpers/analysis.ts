import { Chess } from "chess.js";

import type { GameAnalysis, MoveAnalysis, PositionAnalysis } from "~/lib/types";

export const TEST_PGN = `[Event "Test"]
[Site "https://lichess.org/abcd1234"]
[Date "2024.01.05"]
[White "Carlos_MX"]
[Black "Rival"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 1-0`;

/**
 * Valid analysis: for every position, best/second are legal moves different from the played one,
 * pv = [best]. `moves` default to "good". Override per ply with `patch`.
 */
export function makeAnalysis(
  startFen: string,
  movesUci: string[],
  patch: Record<number, Partial<MoveAnalysis>> = {},
  positionPatch: Record<number, Partial<PositionAnalysis>> = {}
): GameAnalysis {
  const chess = new Chess(startFen);
  const positions: PositionAnalysis[] = [];
  for (let i = 0; i <= movesUci.length; i++) {
    const legal = chess.moves({ verbose: true }).map((m) => m.lan).filter((u) => u !== movesUci[i]);
    positions.push({
      eval: { cp: 20 },
      best: legal[0] ? { uci: legal[0], eval: { cp: 300 } } : undefined,
      second: legal[1] ? { uci: legal[1], eval: { cp: -300 } } : undefined,
      pv: legal[0] ? [legal[0]] : [],
      ...positionPatch[i],
    });
    const u = movesUci[i];
    if (u) chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  }
  const moves: MoveAnalysis[] = movesUci.map((_, i) => ({ class: "good", epLoss: 0.01, ...patch[i] }));
  return { depth: 16, engine: "sf19-lite", classifierVersion: 1, positions, moves, accuracyWhite: 80, accuracyBlack: 70 };
}
