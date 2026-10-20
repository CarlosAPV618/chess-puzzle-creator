// Practice/retry validation (design D1/D9): compare the user's move with the best move
// from the same root and depth using `searchmoves`.
import { MISS_WIN } from "../classify";
import { expectedPoints } from "../classify/expected-points";
import type { Color, EngineLine } from "../types";
import type { Engine } from "./engine";
import { replay } from "./uci";

type Analyzer = Pick<Engine, "analyze">;

/** Second engine line is accepted without the engine if it loses < 0.05 EP; in a miss it must also keep MISS_WIN. */
export function acceptsSecond(best: EngineLine, second: EngineLine, color: Color, miss: boolean): boolean {
  const ep = expectedPoints(second.eval, color);
  return expectedPoints(best.eval, color) - ep < 0.05 && (!miss || ep >= MISS_WIN);
}

export async function checkMove(
  engine: Analyzer,
  req: { startFen: string; movesBefore: string[]; userUci: string; bestUci: string; depth?: number },
): Promise<{ loss: number; correct: boolean; points: number }> {
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
  const points = expectedPoints(user.eval, mover);
  const loss = Math.max(0, expectedPoints(best.eval, mover) - points);
  return { loss, correct: loss < 0.05, points };
}

export type JudgeRequest = {
  startFen: string;
  movesBefore: string[];
  uci: string;
  bestUci: string;
  accepted: string[];
  /** Brillante: solo vale la jugada exacta. */
  strict?: boolean;
  /** Jugada de la partida en esta posición: nunca es correcta salvo que sea la mejor (D1). */
  playedUci?: string;
  /** Miss: la alternativa tiene que dejar al menos estos EP para quien mueve (D1). */
  minPoints?: number;
};
export type Verdict = { correct: boolean; exact: boolean };

/** Order of D1: best -> played (wrong) -> accepted -> strict -> engine at depth 14. */
export async function judge(getEngine: () => Promise<Analyzer>, p: JudgeRequest): Promise<Verdict> {
  if (p.uci === p.bestUci) return { correct: true, exact: true };
  if (p.uci === p.playedUci) return { correct: false, exact: false };
  if (p.accepted.includes(p.uci)) return { correct: true, exact: false };
  if (p.strict) return { correct: false, exact: false };
  const r = await checkMove(await getEngine(), {
    startFen: p.startFen,
    movesBefore: p.movesBefore,
    userUci: p.uci,
    bestUci: p.bestUci,
    depth: 14,
  });
  return { correct: r.correct && (p.minPoints === undefined || r.points >= p.minPoints), exact: false };
}
