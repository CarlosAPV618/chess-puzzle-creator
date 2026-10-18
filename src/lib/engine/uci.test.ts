import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInfo, replay, terminalEval, toWhitePov } from "./uci";

test("parseInfo reads multipv, score and pv", () => {
  const l = parseInfo(
    "info depth 16 seldepth 22 multipv 2 score cp -35 nodes 1 nps 1 hashfull 1 tbhits 0 time 5 pv e7e5 g1f3 b8c6",
  );
  assert.deepEqual(l, { depth: 16, multipv: 2, score: { cp: -35 }, bound: false, pv: ["e7e5", "g1f3", "b8c6"] });
  assert.deepEqual(parseInfo("info depth 5 multipv 1 score mate -3 upperbound pv h7h6")?.score, { mate: -3 });
  assert.equal(parseInfo("info depth 5 multipv 1 score mate -3 upperbound pv h7h6")?.bound, true);
  assert.equal(parseInfo("info depth 10 currmove e2e4 currmovenumber 1"), null);
  assert.equal(parseInfo("info string NNUE evaluation using nn.nnue"), null);
  assert.equal(parseInfo("bestmove e2e4"), null);
});

test("score is converted to White's point of view", () => {
  // Spec: black to move, Stockfish says cp 120 -> stored { cp: -120 }
  assert.deepEqual(toWhitePov({ cp: 120 }, "b"), { cp: -120 });
  assert.deepEqual(toWhitePov({ cp: 120 }, "w"), { cp: 120 });
  assert.deepEqual(toWhitePov({ mate: 3 }, "b"), { mate: -3 });
  assert.deepEqual(toWhitePov({ mate: -2 }, "b"), { mate: 2 });
  assert.deepEqual(toWhitePov({ cp: 0 }, "b"), { cp: 0 }); // no -0
});

test("terminal positions are resolved without the engine", () => {
  // Fool's mate: white is mated
  const mated = replay("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["f2f3", "e7e5", "g2g4", "d8h4"]);
  assert.deepEqual(terminalEval(mated), { mate: 0 });
  const stalemate = replay("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", []);
  assert.deepEqual(terminalEval(stalemate), { cp: 0 });
  const bare = replay("8/8/4k3/8/8/4K3/8/8 w - - 0 1", []);
  assert.deepEqual(terminalEval(bare), { cp: 0 });
  const rep = replay("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [
    "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8",
  ]);
  assert.deepEqual(terminalEval(rep), { cp: 0 });
  assert.equal(terminalEval(replay("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [])), null);
});
