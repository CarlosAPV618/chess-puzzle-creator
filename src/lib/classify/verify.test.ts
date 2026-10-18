import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrilliantCandidate } from "./index";
import { pickCandidates, sacrificeSustained, verifyBrilliant } from "./verify";

const ANASTASIA = "rq3r1k/4N1pp/8/3R4/8/3Q4/5PPP/6K1 w - - 0 1";
const LEGAL = "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5";

const anastasiaDeep = {
  lines: [
    { uci: "d3h7", eval: { mate: 2 } },
    { uci: "g2g3", eval: { cp: -175 } },
    { uci: "g2g4", eval: { cp: -320 } },
  ],
  pv: ["d3h7", "h8h7", "d5h5"],
};

test("pickCandidates: user's side first, then EP gain, max 6", () => {
  const c = (ply: number, color: "w" | "b", gain: number): BrilliantCandidate => ({
    ply,
    uci: "e2e4",
    played: true,
    color,
    gain,
  });
  const all = [c(1, "b", 0.5), c(2, "w", 0.1), c(3, "b", 0.9), c(4, "w", 0.3), ...[5, 6, 7, 8].map((p) => c(p, "b", 0.2))];
  const picked = pickCandidates(all, "w");
  assert.equal(picked.length, 6);
  assert.deepEqual(
    picked.map((x) => x.ply),
    [4, 2, 3, 1, 5, 6],
  );
  assert.deepEqual(
    pickCandidates(all, null).slice(0, 2).map((x) => x.ply),
    [3, 1],
  );
});

test("verify: sustained sacrifice confirmed, unique answer -> exercise eligible", () => {
  const out = verifyBrilliant({ fen: ANASTASIA, uci: "d3h7", shallowBest: { mate: 2 }, deep: anastasiaDeep });
  assert.deepEqual(out, { status: "confirmed", exerciseEligible: true });
});

test("verify: second line almost as good -> brilliant but not an exercise", () => {
  const deep = { ...anastasiaDeep, lines: [anastasiaDeep.lines[0]!, { uci: "g2g3", eval: { cp: 800 } }] };
  // second line now >= +700: no longer a brilliant at all
  assert.equal(verifyBrilliant({ fen: ANASTASIA, uci: "d3h7", shallowBest: { mate: 2 }, deep }).status, "rejected");
  const lines = [
    { uci: "d3h7", eval: { cp: 300 } },
    { uci: "g2g3", eval: { cp: 280 } },
  ];
  const out = verifyBrilliant({ fen: ANASTASIA, uci: "d3h7", shallowBest: { cp: 300 }, deep: { lines, pv: anastasiaDeep.pv } });
  assert.deepEqual(out, { status: "confirmed", exerciseEligible: false });
});

test("verify: another top move at depth 22 -> rejected (spec)", () => {
  const deep = { lines: [anastasiaDeep.lines[1]!, anastasiaDeep.lines[0]!], pv: ["g2g3"] };
  assert.equal(verifyBrilliant({ fen: ANASTASIA, uci: "d3h7", shallowBest: { mate: 2 }, deep }).status, "rejected");
});

test("verify: unstable eval between depths (> 0.05 EP) -> rejected", () => {
  const lines = [
    { uci: "d3h7", eval: { cp: 300 } },
    { uci: "g2g3", eval: { cp: -175 } },
  ];
  const out = verifyBrilliant({ fen: ANASTASIA, uci: "d3h7", shallowBest: { cp: 50 }, deep: { lines, pv: anastasiaDeep.pv } });
  assert.equal(out.status, "rejected");
});

test("verify: declined sacrifice needs a capture search; deferred exchange rejected, poisoned piece confirmed", () => {
  // Légal: Nxe5 dxe5 Qxg4 wins material back (no sustained deficit).
  const deep = {
    lines: [
      { uci: "f3e5", eval: { cp: 215 } },
      { uci: "d2d4", eval: { cp: 60 } },
    ],
    pv: ["f3e5", "d6e5", "d1g4", "b8d7"],
  };
  const base = { fen: LEGAL, uci: "f3e5", shallowBest: { cp: 215 }, deep };
  const first = verifyBrilliant(base);
  assert.deepEqual(first, { status: "needsCapture", captures: ["g4d1"] });
  // Taking the queen is not worse for Black than declining -> just a trick
  assert.equal(verifyBrilliant({ ...base, captureEval: { cp: 215 } }).status, "rejected");
  // Taking the queen gets Black mated -> the queen is poisoned
  assert.deepEqual(verifyBrilliant({ ...base, captureEval: { mate: 2 } }), {
    status: "confirmed",
    exerciseEligible: true,
  });
});

test("sacrificeSustained: deficit must remain after 6 plies (or at the end of the line)", () => {
  // Anastasia: Qxh7+ Kxh7 Rh5# -> down a queen at the end
  assert.equal(sacrificeSustained(ANASTASIA, ["d3h7", "h8h7", "d5h5"], "w"), true);
  // Légal main line: material comes straight back
  assert.equal(sacrificeSustained(LEGAL, ["f3e5", "d6e5", "d1g4", "b8d7"], "w"), false);
  // Fork trick: down a piece for 3 plies, back to even by ply 6
  const FORK = "r1bqk1nr/pppp1ppp/2n5/2b1p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 3 3";
  assert.equal(sacrificeSustained(FORK, ["f3e5", "c6e5", "d2d4", "c5d6", "d4e5", "d6e5"], "w"), false);
  // Invalid PV: conservative
  assert.equal(sacrificeSustained(ANASTASIA, ["d3h7", "a1a2"], "w"), false);
});
