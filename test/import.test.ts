import assert from "node:assert/strict";
import { test } from "node:test";

import { detectUserColor, MAX_GAMES, parsePgnText, splitPgnGames } from "~/lib/import/pgn";
import { parseGameUrl } from "~/lib/import/urls";

const IRREGULAR =
  String.fromCharCode(0xfeff) +
  [
    '[Event "Rated Blitz game"]',
    '[Site "https://lichess.org/abcd1234"]',
    '[White "Carlos_MX"]',
    '[Black "Rival"]',
    '[Result "1-0"]',
    '[UTCDate "2024.01.05"]',
    '[UTCTime "12:34:56"]',
    '[TimeControl "180+2"]',
    "",
    "1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:02:59]} 2. Nf3 (2. Nc3 Nf6 (2... Nc6)) 2... Nc6 $1 3. Bb5!? a6 1-0",
    '[Event "Second, no blank line before"]',
    '[White "A"]',
    '[Black "B"]',
    '[Link "https://www.chess.com/game/live/129688175007"]',
    "",
    "1. d4 d5 2. c4 *",
  ].join("\r\n");

test("irregular PGN: BOM, CRLF, clocks, nested RAV, NAG, two games without blank line", async () => {
  const { games, errors } = await parsePgnText(IRREGULAR);
  assert.deepEqual(errors, []);
  assert.equal(games.length, 2);
  const [a, b] = games;
  assert.deepEqual(a!.movesSan, ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  assert.deepEqual(a!.movesUci.slice(0, 3), ["e2e4", "e7e5", "g1f3"]);
  assert.equal(a!.source, "lichess");
  assert.equal(a!.sourceId, "abcd1234");
  assert.equal(a!.playedAt, "2024-01-05T12:34:56.000Z");
  assert.equal(a!.timeClass, "blitz");
  assert.equal(a!.result, "1-0");
  assert.equal(b!.source, "chesscom");
  assert.equal(b!.sourceId, "live/129688175007");
  assert.equal(b!.result, "*");
});

test("movetext without headers is one game with a sha-256 sourceId", async () => {
  const { games } = await parsePgnText("1. e4 e5 2. Nf3 Nc6");
  assert.equal(games.length, 1);
  assert.equal(games[0]!.source, "pgn");
  assert.match(games[0]!.sourceId, /^[0-9a-f]{64}$/);
  const again = await parsePgnText("1. e4 e5 2. Nf3 Nc6");
  assert.equal(again.games[0]!.sourceId, games[0]!.sourceId);
});

test("invalid games are reported without blocking the others", async () => {
  const text = `[White "A"]\n\n1. e4 e5 *\n\n[White "B"]\n\n1. e4 e5 2. Qxe4 *\n\n[Variant "Chess960"]\n\n1. e4 e5 *\n\n[White "D"]\n\n1. e4 *`;
  const { games, errors } = await parsePgnText(text);
  assert.equal(games.length, 1);
  assert.deepEqual(
    errors.map((e) => e.message),
    [
      "Partida 2: jugada ilegal en 2.Qxe4",
      "Partida 3: no soportada (variante Chess960)",
      "Partida 4: no soportada (menos de 2 jugadas)",
    ]
  );
});

test("black illegal move label uses '...'", async () => {
  const { errors } = await parsePgnText("1. e4 e5 2. Nf3 Qxe4 3. Nc3 Qxe4");
  assert.equal(errors[0]?.message, "Partida 1: jugada ilegal en 2...Qxe4");
});

test("[SetUp]/[FEN] start position is supported", async () => {
  const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
  const { games, errors } = await parsePgnText(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4 Kd7 2. Kd2 *`);
  assert.deepEqual(errors, []);
  assert.equal(games[0]!.startFen, fen);
  assert.deepEqual(games[0]!.movesUci, ["e2e4", "e8d7", "e1d2"]);
});

test("limits: more than 50 games or more than 1 MB rejects everything", async () => {
  const many = Array.from({ length: MAX_GAMES + 1 }, (_, i) => `[White "${i}"]\n\n1. e4 e5 *`).join("\n\n");
  assert.equal(splitPgnGames(many).length, MAX_GAMES + 1);
  const r1 = await parsePgnText(many);
  assert.equal(r1.games.length, 0);
  assert.equal(r1.errors[0]?.index, 0);
  const r2 = await parsePgnText(`1. e4 e5 {${"x".repeat(1024 * 1024)}}`);
  assert.equal(r2.games.length, 0);
  assert.match(r2.errors[0]!.message, /1 MB/);
});

test("parseGameUrl", () => {
  assert.deepEqual(parseGameUrl("https://lichess.org/abcd1234/black"), { platform: "lichess", id: "abcd1234" });
  assert.deepEqual(parseGameUrl("lichess.org/abcd1234wxyz"), { platform: "lichess", id: "abcd1234" });
  assert.equal(parseGameUrl("https://lichess.org/study/abcd1234"), null);
  assert.deepEqual(parseGameUrl("https://www.chess.com/game/live/123456789"), { platform: "chesscom", type: "live", id: "123456789" });
  assert.deepEqual(parseGameUrl("https://www.chess.com/game/daily/42"), { platform: "chesscom", type: "daily", id: "42" });
  assert.deepEqual(parseGameUrl("https://www.chess.com/game/987"), { platform: "chesscom", type: "live", id: "987" });
  assert.equal(parseGameUrl("https://www.chess.com/game/live/..%2Fevil"), null);
  assert.equal(parseGameUrl("hola"), null);
});

test("detectUserColor is case-insensitive", () => {
  assert.equal(detectUserColor({ white: "Carlos_MX", black: "x" }, ["carlos_mx"]), "w");
  assert.equal(detectUserColor({ white: "x", black: "CARLOS_mx" }, ["carlos_mx"]), "b");
  assert.equal(detectUserColor({ white: "x", black: "y" }, ["carlos_mx"]), null);
});
