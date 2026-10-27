import assert from "node:assert/strict";
import { test } from "node:test";
import { replay, START_FEN } from "./chess";
import { moveSound } from "./sound";

test("moveSound distingue cada tipo de jugada y calla al retroceder", () => {
  const uci = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6", "d2d4", "e5d4", "e4e5", "d7d5", "e5f6", "d5c4", "f1e1", "c8e6", "f6g7", "e8d7", "g7h8q"];
  const { fens } = replay(START_FEN, uci);
  const at = (i: number) => moveSound(fens[i]!, uci[i]!.slice(0, 2), uci[i]!.slice(2, 4), fens[i + 1]!);
  assert.equal(at(0), "move");
  assert.equal(at(6), "castle");
  assert.equal(at(9), "capture");
  assert.equal(at(14), "check");
  assert.equal(at(18), "promote");
  // Retroceder: la jugada mostrada no lleva de la posición anterior a la nueva.
  assert.equal(moveSound(fens[2]!, "e7", "e5", fens[1]!), null);
});
