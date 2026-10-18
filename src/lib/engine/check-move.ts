// Practice/retry validation (design D9): compare the user's move with the best move
// from the same root and depth using `searchmoves`.
import { expectedPoints } from "../classify/expected-points";
import type { Engine } from "./engine";
import { replay } from "./uci";

export async function checkMove(
  engine: Engine,
  req: { startFen: string; movesBefore: string[]; userUci: string; bestUci: string; depth?: number },
): Promise<{ loss: number; correct: boolean }> {
  if (req.userUci === req.bestUci) return { loss: 0, correct: true };
  const mover = replay(req.startFen, req.movesBefore).turn();
  const search = (uci: string) =>
    engine.analyze({
      startFen: req.startFen,
      moves: req.movesBefore,
      depth: req.depth ?? 14,
      multipv: 1,
      searchmoves: [uci],
    });
  const user = await search(req.userUci);
  const best = await search(req.bestUci);
  const loss = Math.max(0, expectedPoints(best.eval, mover) - expectedPoints(user.eval, mover));
  return { loss, correct: loss < 0.05 };
}
