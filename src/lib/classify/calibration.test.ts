import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { uciToMove } from "../engine/uci";
import { isBrilliant } from "./brilliant";
import { CALIBRATION, type CalibrationCase } from "./fixtures/calibration";
import { verifyBrilliant } from "./verify";

/** Detection (D4) and, when the case has a PV, the D4b verification with the same evals. */
function detect(c: CalibrationCase): boolean {
  const prevBoard = new Chess(c.fen);
  const board = new Chess(c.fen);
  const move = board.move(uciToMove(c.uci));
  if (!isBrilliant({ prevBoard, board, move, bestEval: c.best, after: c.after, second: c.second })) return false;
  if (!c.pv) return true;
  const lines = [{ uci: c.uci, eval: c.after }, ...(c.second ? [c.second] : [])];
  const base = { fen: c.fen, uci: c.uci, shallowBest: c.after, deep: { lines, pv: c.pv } };
  let out = verifyBrilliant(base);
  if (out.status === "needsCapture") {
    if (!c.captureEval) return false;
    out = verifyBrilliant({ ...base, captureEval: c.captureEval });
  }
  return out.status === "confirmed";
}

test("calibration: 0 brilliant false positives, recall >= 70%", (t) => {
  const falsePositives: string[] = [];
  let hits = 0;
  const positives = CALIBRATION.filter((c) => c.brilliant);
  for (const c of CALIBRATION) {
    const got = detect(c);
    if (got && !c.brilliant) falsePositives.push(c.name);
    if (got && c.brilliant) hits++;
  }
  assert.deepEqual(falsePositives, []);
  const recall = hits / positives.length;
  t.diagnostic(`${CALIBRATION.length} cases, recall ${hits}/${positives.length}`);
  assert.ok(recall >= 0.7, `recall ${(recall * 100).toFixed(0)}%`);
});

for (const c of CALIBRATION) {
  test(`calibration case: ${c.name}`, (t) => {
    const got = detect(c);
    if (c.brilliant && !got) t.diagnostic("missed (counts against recall)");
    if (!c.brilliant) assert.equal(got, false);
  });
}
