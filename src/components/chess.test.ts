import assert from "node:assert/strict";
import { test } from "node:test";
import { moveLabel, sideName, START_FEN } from "./chess";

test("moveLabel numera por el FEN y marca el turno", () => {
  assert.equal(moveLabel(START_FEN, "e4"), "1. e4");
  const black12 = "r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 3 12";
  assert.equal(moveLabel(black12, "b5"), "12… b5");
  assert.equal(moveLabel(START_FEN, "Nf3"), "1. ♘f3");
  // Partida desde un FEN en la jugada 30: el número sale del FEN, no del ply.
  assert.equal(moveLabel("8/5k2/8/8/8/8/5K2/4R3 w - - 0 30", "Re7+"), "30. ♖e7+");
  assert.equal(sideName(START_FEN), "blancas");
  assert.equal(sideName(black12), "negras");
});
