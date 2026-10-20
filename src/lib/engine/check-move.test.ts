import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_POSITION } from "chess.js";

import { MISS_WIN } from "../classify";
import type { Eval } from "../types";
import { judge, type JudgeRequest } from "./check-move";
import type { AnalyzeRequest } from "./engine";

/** Fake engine: eval (White POV) by the searched move; counts calls. */
function fake(evals: Record<string, Eval>) {
  const calls: string[] = [];
  const engine = {
    analyze: async (r: AnalyzeRequest) => {
      const uci = r.searchmoves![0]!;
      calls.push(uci);
      return { lines: [], pv: [uci], eval: evals[uci]! };
    },
  };
  return { calls, get: async () => engine };
}

const base: JudgeRequest = { startFen: DEFAULT_POSITION, movesBefore: [], uci: "g1f3", bestUci: "e2e4", accepted: ["e2e4"] };

test("the game move is rejected without the engine, even if it loses nothing", async () => {
  const e = fake({ e2e4: { cp: 50 }, g1f3: { cp: 50 } });
  assert.deepEqual(await judge(e.get, { ...base, playedUci: "g1f3" }), { correct: false, exact: false });
  assert.deepEqual(await judge(e.get, { ...base, playedUci: "g1f3", accepted: ["e2e4", "g1f3"] }), { correct: false, exact: false });
  assert.deepEqual(e.calls, []);
});

test("played brilliant (played = best) is still correct", async () => {
  const e = fake({});
  assert.deepEqual(await judge(e.get, { ...base, uci: "e2e4", playedUci: "e2e4", strict: true }), { correct: true, exact: true });
});

test("miss: alternative losing 0.03 but leaving EP 0.60 is wrong; the same in a mistake is right", async () => {
  // cp 150 -> EP 0.635, cp 110 -> EP 0.600 (< MISS_WIN 0.62), loss ~0.035.
  const e = fake({ e2e4: { cp: 150 }, g1f3: { cp: 110 } });
  assert.deepEqual(await judge(e.get, { ...base, playedUci: "d2d4", minPoints: MISS_WIN }), { correct: false, exact: false });
  assert.deepEqual(await judge(e.get, { ...base, playedUci: "d2d4" }), { correct: true, exact: false });
  const keeps = fake({ e2e4: { cp: 200 }, g1f3: { cp: 180 } });
  assert.deepEqual(await judge(keeps.get, { ...base, minPoints: MISS_WIN }), { correct: true, exact: false });
});

test("strict rejects anything but the answer without the engine", async () => {
  const e = fake({});
  assert.deepEqual(await judge(e.get, { ...base, strict: true }), { correct: false, exact: false });
  assert.deepEqual(e.calls, []);
});
