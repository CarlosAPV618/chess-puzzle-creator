// Builds src/lib/classify/openings.json from lichess-org/chess-openings (CC0-1.0,
// https://github.com/lichess-org/chess-openings/blob/master/COPYING.txt).
// Usage: pnpm build:openings
// Output: { n: ["ECO|Name", ...], p: { "<placement> <side> <castling>": index into n } }
// for every named position and every intermediate position of a named line
// (which inherits the name of its last named prefix).
import { writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const COMMIT = "a6189a30dc273ccb21fc2536a9a2fefd5592a67a";
const BASE = `https://raw.githubusercontent.com/lichess-org/chess-openings/${COMMIT}`;
const OUT = new URL("../src/lib/classify/openings.json", import.meta.url);

const key = (fen: string) => fen.split(" ").slice(0, 3).join(" ");

type Entry = { eco: string; name: string; fens: string[] };

const entries: Entry[] = [];
for (const file of ["a", "b", "c", "d", "e"]) {
  const res = await fetch(`${BASE}/${file}.tsv`);
  if (!res.ok) throw new Error(`${file}.tsv: HTTP ${res.status}`);
  const rows = (await res.text()).trim().split("\n").slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    if (!eco || !name || !pgn) continue;
    const chess = new Chess();
    chess.loadPgn(pgn);
    const replay = new Chess();
    const fens = chess.history().map((san) => (replay.move(san), key(replay.fen())));
    entries.push({ eco, name, fens });
  }
}

// Named positions: on transpositions keep the shortest line.
const named = new Map<string, { value: string; plies: number }>();
for (const e of entries) {
  const k = e.fens.at(-1)!;
  const prev = named.get(k);
  if (!prev || e.fens.length < prev.plies) named.set(k, { value: `${e.eco}|${e.name}`, plies: e.fens.length });
}

const book: Record<string, string> = {};
for (const [k, v] of named) book[k] = v.value;
for (const e of entries) {
  let last: string | undefined;
  for (const k of e.fens) {
    last = named.get(k)?.value ?? last;
    if (!(k in book) && last) book[k] = last;
  }
}

const names = [...new Set(Object.values(book))].sort();
const index = new Map(names.map((n, i) => [n, i]));
const p: Record<string, number> = {};
for (const [k, v] of Object.entries(book)) p[k] = index.get(v)!;
writeFileSync(OUT, JSON.stringify({ n: names, p }));
console.log(`${Object.keys(book).length} positions -> ${OUT.pathname}`);
