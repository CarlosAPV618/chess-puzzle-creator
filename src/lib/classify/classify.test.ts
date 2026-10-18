import assert from "node:assert/strict";
import { test } from "node:test";
import type { Eval, PositionAnalysis } from "../types";
import {
  accuracy,
  classifyGame,
  expectedPoints,
  gameOpening,
  isBook,
  lookupOpening,
  moveAccuracy,
  phaseOf,
} from "./index";
import { lossClass, pointLoss, pointLossClassify } from "./expected-points";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Same position without castling rights: not in the book (keeps tests off "Teoría").
const NO_BOOK = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1";
const K = 0.00368208;
const cpFor = (ep: number) => Math.round(Math.log(ep / (1 - ep)) / K);

test("expected points: formula, sign, clamp and mate", () => {
  assert.equal(expectedPoints({ cp: 0 }, "w"), 0.5);
  assert.ok(Math.abs(expectedPoints({ cp: 100 }, "w") - 1 / (1 + Math.exp(-0.368208))) < 1e-12);
  assert.ok(Math.abs(expectedPoints({ cp: 100 }, "w") + expectedPoints({ cp: 100 }, "b") - 1) < 1e-12);
  assert.equal(expectedPoints({ cp: 5000 }, "w"), expectedPoints({ cp: 1000 }, "w"));
  assert.equal(expectedPoints({ mate: 3 }, "w"), 1);
  assert.equal(expectedPoints({ mate: 3 }, "b"), 0);
  assert.equal(expectedPoints({ mate: -3 }, "b"), 1);
  assert.equal(expectedPoints({ mate: 0 }, "b"), 1); // mate on the board after the mover's move
});

test("loss table (chess.com thresholds)", () => {
  assert.equal(lossClass(0.019), "excellent");
  assert.equal(lossClass(0.049), "good");
  assert.equal(lossClass(0.099), "inaccuracy");
  assert.equal(lossClass(0.199), "mistake");
  assert.equal(lossClass(0.2), "blunder");
  // Spec: EP 0.55 -> 0.25 is a Blunder
  assert.equal(pointLossClassify({ cp: cpFor(0.55) }, { cp: cpFor(0.25) }, "w"), "blunder");
  // Same for Black (evals are White POV)
  assert.equal(pointLossClassify({ cp: -cpFor(0.55) }, { cp: -cpFor(0.25) }, "b"), "blunder");
  assert.equal(pointLoss({ cp: 100 }, { cp: 300 }, "w"), 0);
});

test("mate transitions", () => {
  // Spec: mate in 2 for, then mate in 1 against -> Blunder
  assert.equal(pointLossClassify({ mate: 2 }, { mate: -1 }, "w"), "blunder");
  assert.equal(pointLossClassify({ mate: -2 }, { mate: 1 }, "b"), "blunder");
  assert.equal(pointLossClassify({ mate: 2 }, { mate: -5 }, "w"), "mistake");
  assert.equal(pointLossClassify({ mate: 3 }, { mate: 2 }, "w"), "best");
  assert.equal(pointLossClassify({ mate: 3 }, { mate: 3 }, "w"), "excellent");
  assert.equal(pointLossClassify({ mate: 3 }, { mate: 6 }, "w"), "good");
  assert.equal(pointLossClassify({ mate: 3 }, { mate: 10 }, "w"), "inaccuracy");
  assert.equal(pointLossClassify({ mate: 3 }, { cp: 900 }, "w"), "excellent");
  assert.equal(pointLossClassify({ mate: 3 }, { cp: 500 }, "w"), "good");
  assert.equal(pointLossClassify({ mate: 3 }, { cp: 250 }, "w"), "inaccuracy");
  assert.equal(pointLossClassify({ mate: 3 }, { cp: 50 }, "w"), "mistake");
  assert.equal(pointLossClassify({ mate: 3 }, { cp: -50 }, "w"), "blunder");
  assert.equal(pointLossClassify({ cp: 0 }, { mate: -2 }, "w"), "blunder");
  assert.equal(pointLossClassify({ cp: 0 }, { mate: -4 }, "w"), "mistake");
  assert.equal(pointLossClassify({ cp: 0 }, { mate: -8 }, "w"), "inaccuracy");
  assert.equal(pointLossClassify({ cp: 0 }, { mate: 4 }, "b"), "mistake");
});

const line = (uci: string, e: Eval) => ({ uci, eval: e });
const pos = (e: Eval, best?: string, second?: { uci: string; eval: Eval }): PositionAnalysis => ({
  eval: e,
  best: best ? line(best, e) : undefined,
  second,
  pv: best ? [best] : [],
});

function missGame(afterCp: number) {
  // 1.Nf3 (best) Nc6?? (blunder: e5 was 0.00, now +471 = EP 0.85 for White) 2.<white move>
  return classifyGame({
    startFen: NO_BOOK,
    movesUci: ["g1f3", "b8c6", "d2d4"],
    positions: [
      pos({ cp: 0 }, "g1f3"),
      pos({ cp: 0 }, "e7e5"),
      pos({ cp: cpFor(0.85) }, "e2e4"),
      pos({ cp: afterCp }),
    ],
    userColor: "w",
  });
}

test("Miss: not punishing the opponent's blunder (spec scenarios)", () => {
  const miss = missGame(cpFor(0.72)); // loss 0.13 -> Error by the table -> Miss
  assert.deepEqual(
    miss.moves.map((m) => m.class),
    ["best", "blunder", "miss"],
  );
  const blunder = missGame(cpFor(0.4)); // loss 0.45 -> stays Blunder
  assert.equal(blunder.moves[2]!.class, "blunder");
});

test("Forced, Great, and capturing hanging material is not Great", () => {
  // Only legal move: Kh1-g1? (K on h1 boxed in, single legal move)
  const forced = classifyGame({
    startFen: "7k/8/8/8/8/8/6q1/7K w - - 0 1",
    movesUci: ["h1g2"],
    positions: [pos({ cp: -2000 }, "h1g2"), pos({ cp: -1000 })],
    userColor: null,
  });
  assert.equal(forced.moves[0]!.class, "forced");

  // Spec: best keeps equality, second loses 0.15 EP -> Great
  const great = classifyGame({
    startFen: NO_BOOK,
    movesUci: ["e2e4"],
    positions: [pos({ cp: 0 }, "e2e4", line("a2a3", { cp: -cpFor(0.65) })), pos({ cp: 0 })],
    userColor: "w",
  });
  assert.equal(great.moves[0]!.class, "great");

  // Spec: capturing a hanging queen is not Great
  const capture = classifyGame({
    startFen: "4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1",
    movesUci: ["d1d5"],
    positions: [pos({ cp: 600 }, "d1d5", line("d1a4", { cp: 0 })), pos({ cp: 600 })],
    userColor: "w",
  });
  assert.equal(capture.moves[0]!.class, "best");
});

test("Book: Ruy Lopez, ep field ignored", () => {
  const moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"];
  const positions = Array.from({ length: 6 }, () => pos({ cp: 20 }));
  const r = classifyGame({ startFen: START, movesUci: moves, positions, userColor: "w" });
  assert.deepEqual(
    r.moves.map((m) => m.class),
    ["book", "book", "book", "book", "book"],
  );
  assert.equal(gameOpening(START, moves)?.name, "Ruy Lopez");
  assert.equal(lookupOpening("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1")?.eco, "B00");
  assert.ok(isBook("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"));
  assert.equal(isBook("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1"), false);
  // Games from a custom FEN: no book
  const custom = classifyGame({
    startFen: NO_BOOK,
    movesUci: ["e2e4"],
    positions: [pos({ cp: 20 }, "e2e4"), pos({ cp: 20 })],
    userColor: null,
  });
  assert.equal(custom.moves[0]!.class, "best");
});

test("accuracy: 100 for perfect play, lower with losses", () => {
  assert.equal(moveAccuracy(0), 99.9999);
  const perfect = accuracy(
    [
      { class: "best", epLoss: 0 },
      { class: "best", epLoss: 0 },
      { class: "best", epLoss: 0 },
    ],
    START,
  );
  assert.deepEqual(perfect, { white: 100, black: 100 });
  const r = accuracy(
    [
      { class: "best", epLoss: 0 },
      { class: "blunder", epLoss: 0.3 },
    ],
    START,
  );
  assert.equal(r.white, 100);
  assert.ok(r.black < 30);
  // Black moves first from a FEN with Black to move
  assert.equal(accuracy([{ class: "blunder", epLoss: 0.3 }], "8/8/8/8/8/8/8/K6k b - - 0 1").white, 100);
});

test("brilliant candidates: played and missed", () => {
  // Anastasia: Qxh7+!! Kxh7 Rh5#
  const fen = "rq3r1k/4N1pp/8/3R4/8/3Q4/5PPP/6K1 w - - 0 1";
  const before = pos({ mate: 2 }, "d3h7", line("g2g3", { cp: -175 }));
  const played = classifyGame({
    startFen: fen,
    movesUci: ["d3h7"],
    positions: [before, pos({ mate: 1 })],
    userColor: "w",
  });
  assert.equal(played.candidates.length, 1);
  assert.deepEqual(played.candidates[0], { ply: 0, uci: "d3h7", played: true, color: "w", gain: played.candidates[0]!.gain });
  const missed = classifyGame({
    startFen: fen,
    movesUci: ["g2g3"],
    positions: [before, pos({ cp: -175 })],
    userColor: "w",
  });
  assert.equal(missed.moves[0]!.class, "blunder");
  assert.deepEqual(
    missed.candidates.map((c) => [c.uci, c.played]),
    [["d3h7", false]],
  );
});

test("phaseOf", () => {
  assert.equal(phaseOf(START, 0), "opening");
  assert.equal(phaseOf(START, 30), "middlegame");
  assert.equal(phaseOf("8/5k2/8/8/3R4/8/2K5/8 w - - 0 50", 90), "endgame");
});
