import { callerFor, closeDb, createUser, resetDb } from "./helpers/db";

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";

import { parsePgnText } from "~/lib/import/pgn";
import type { GameAnalysis } from "~/lib/types";
import { db } from "~/server/db";
import { exerciseAttempts, exercises } from "~/server/db/schema";
import { makeAnalysis, TEST_PGN } from "./helpers/analysis";

let A: string; // owner
let B: string; // other user
let gameId: string;
let startFen: string;
let movesUci: string[];

const code = (c: string) => (e: unknown) => e instanceof TRPCError && e.code === c;
const exByPly = async () => {
  const rows = await db.select().from(exercises).where(eq(exercises.gameId, gameId));
  return new Map(rows.map((r) => [r.ply, r]));
};

/** 16 plies, white = user. 0,2 blunder (me); 5 miss (opp); 9 blunder + missed brilliant (opp); 10 brilliant (me). */
function baseAnalysis(): GameAnalysis {
  const a = makeAnalysis(startFen, movesUci, {
    0: { class: "blunder", epLoss: 0.4 },
    2: { class: "blunder", epLoss: 0.3 },
    4: { class: "inaccuracy", epLoss: 0.07 },
    5: { class: "miss", epLoss: 0.15 },
    7: { class: "mistake", epLoss: 0.15 },
    9: { class: "blunder", epLoss: 0.25 },
    10: { class: "brilliant", epLoss: 0, brilliant: { exerciseEligible: true } },
    13: { class: "brilliant", epLoss: 0, brilliant: { exerciseEligible: false } },
  }, {
    0: {}, // second line patched below
  });
  a.positions[0]!.second!.eval = { cp: 290 }; // within 0.05 EP of best for white -> accepted
  a.moves[9]!.brilliantMissed = { uci: a.positions[9]!.best!.uci, exerciseEligible: true };
  a.moves[11]!.brilliantMissed = { uci: a.positions[11]!.best!.uci, exerciseEligible: false };
  return a;
}

before(async () => {
  await resetDb();
  A = await createUser();
  B = await createUser();
});
after(closeDb);

test("games.import validates, dedupes and returns ids in input order", async () => {
  const { games } = await parsePgnText(TEST_PGN);
  const g = { ...games[0]!, userColor: "w" as const };
  const r1 = await callerFor(A).games.import({ games: [g] });
  assert.equal(r1.inserted, 1);
  assert.equal(r1.skipped, 0);
  gameId = r1.ids[0]!;

  const r2 = await callerFor(A).games.import({ games: [g, g] });
  assert.deepEqual(r2, { inserted: 0, skipped: 2, ids: [gameId, gameId] });

  await assert.rejects(
    callerFor(A).games.import({ games: [{ ...g, sourceId: "x", pgn: "1. e4 e5 2. Qxe4" }] }),
    code("BAD_REQUEST")
  );

  const { game, analysis } = await callerFor(A).games.get({ id: gameId });
  assert.equal(analysis, null);
  assert.equal(game.movesUci.length, 16);
  assert.equal(game.userColor, "w");
  startFen = game.startFen;
  movesUci = game.movesUci;
});

test("analysis.save rejects bad sizes, illegal UCI and oversize payloads, saving nothing", async () => {
  const save = (analysis: unknown) => callerFor(A).analysis.save({ gameId, analysis: analysis as GameAnalysis });
  const good = baseAnalysis();

  await assert.rejects(save({ ...good, positions: good.positions.slice(1) }), code("BAD_REQUEST"));
  await assert.rejects(save({ ...good, moves: good.moves.slice(1) }), code("BAD_REQUEST"));

  const badBest = structuredClone(good);
  badBest.positions[3]!.best!.uci = "a1a8";
  await assert.rejects(save(badBest), code("BAD_REQUEST"));

  const badPv = structuredClone(good);
  badPv.positions[0]!.pv = ["e2e4", "e2e4"];
  await assert.rejects(save(badPv), code("BAD_REQUEST"));

  const badMissed = structuredClone(good);
  badMissed.moves[9]!.brilliantMissed!.uci = "e1e8";
  await assert.rejects(save(badMissed), code("BAD_REQUEST"));

  const badShape = structuredClone(good) as unknown as { moves: { class: string }[] };
  badShape.moves[0]!.class = "superb";
  await assert.rejects(save(badShape), code("BAD_REQUEST"));

  await assert.rejects(save({ ...good, junk: "x".repeat(210_000) }), code("BAD_REQUEST"));

  const { analysis } = await callerFor(A).games.get({ id: gameId });
  assert.equal(analysis, null);
});

test("analysis.save generates exercises for both sides with the merge rule", async () => {
  const a = baseAnalysis();
  const r = await callerFor(A).analysis.save({ gameId, analysis: a });
  assert.equal(r.exercisesCreated, 5);

  const ex = await exByPly();
  assert.deepEqual([...ex.keys()].sort((x, y) => x - y), [0, 2, 5, 9, 10]);
  assert.deepEqual(
    [0, 2, 5, 9, 10].map((p) => [ex.get(p)!.kind, ex.get(p)!.side, ex.get(p)!.brilliantPlayed]),
    [
      ["mistake", "me", null],
      ["mistake", "me", null],
      ["mistake", "opponent", null],
      ["brilliant", "opponent", false], // blunder + missed brilliant -> one brilliant
      ["brilliant", "me", true],
    ]
  );
  const e0 = ex.get(0)!;
  assert.equal(e0.fen, startFen);
  assert.equal(e0.playedUci, "e2e4");
  assert.equal(e0.bestUci, a.positions[0]!.best!.uci);
  assert.deepEqual(e0.acceptedUci, [a.positions[0]!.best!.uci, a.positions[0]!.second!.uci]);
  assert.deepEqual(e0.refutationPv, a.positions[1]!.pv);
  assert.equal(e0.phase, "opening");
  assert.deepEqual(ex.get(2)!.acceptedUci, [a.positions[2]!.best!.uci]);
  assert.equal(ex.get(9)!.bestUci, a.moves[9]!.brilliantMissed!.uci);
  assert.deepEqual(ex.get(9)!.refutationPv, a.positions[10]!.pv);
  assert.deepEqual(ex.get(10)!.acceptedUci, [movesUci[10]]);

  const { analysis } = await callerFor(A).games.get({ id: gameId });
  assert.deepEqual(analysis, a);
  const [listed] = await callerFor(A).games.list();
  assert.equal(listed!.analyzed, true);
  assert.equal(listed!.accuracyUser, 80);
  assert.equal(listed!.mistakes, 2);
  assert.equal(listed!.brilliants, 1);
});

test("reanalysis keeps progress, resets on changed answer, archives and un-archives", async () => {
  await db.update(exercises).set({ box: 3 }).where(eq(exercises.gameId, gameId));

  const changed = baseAnalysis();
  changed.positions[2]!.best!.uci = changed.positions[2]!.second!.uci; // ply 2: different answer
  changed.moves[5] = { class: "inaccuracy", epLoss: 0.06 }; // ply 5 no longer qualifies
  const r = await callerFor(A).analysis.save({ gameId, analysis: changed });
  assert.equal(r.exercisesCreated, 0);

  let ex = await exByPly();
  assert.equal(ex.get(0)!.box, 3, "same kind+best keeps the box");
  assert.equal(ex.get(2)!.box, 0, "new answer resets the box");
  assert.ok(ex.get(2)!.dueAt.getTime() <= Date.now() + 1000);
  assert.ok(ex.get(5)!.archivedAt, "no longer qualifies -> archived");

  const queue = await callerFor(A).practice.queue({ limit: 50 });
  assert.ok(!queue.some((q) => q.ply === 5), "archived exercises are not queued");

  await callerFor(A).analysis.save({ gameId, analysis: baseAnalysis() });
  ex = await exByPly();
  assert.equal(ex.get(5)!.archivedAt, null, "re-qualifies -> un-archived");
  assert.equal(ex.get(5)!.box, 3, "un-archived with the same answer keeps progress");
});

test("games.setUserColor recomputes exercise sides", async () => {
  await callerFor(A).games.setUserColor({ id: gameId, color: "b" });
  let ex = await exByPly();
  assert.equal(ex.get(0)!.side, "opponent");
  assert.equal(ex.get(5)!.side, "me");
  await callerFor(A).games.setUserColor({ id: gameId, color: null });
  ex = await exByPly();
  assert.equal(ex.get(0)!.side, null);
  await callerFor(A).games.setUserColor({ id: gameId, color: "w" });
});

test("Leitner transitions and the in-session repeat", async () => {
  const ex = await exByPly();
  const id = ex.get(0)!.id;
  const submit = (firstTryCorrect: boolean, extra: { usedHint?: boolean; viewedSolution?: boolean } = {}) =>
    callerFor(A).practice.submitResult({
      exerciseId: id,
      firstTryCorrect,
      usedHint: extra.usedHint ?? false,
      viewedSolution: extra.viewedSolution ?? false,
    });
  const newSession = () =>
    db.update(exerciseAttempts).set({ createdAt: sql`created_at - interval '2 hours'` }).where(eq(exerciseAttempts.exerciseId, id));
  const setBox = (box: number) => db.update(exercises).set({ box }).where(eq(exercises.id, id));
  const days = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 86_400_000) || 0;

  await setBox(2);
  let r = await submit(true);
  assert.equal(r.box, 3);
  assert.equal(days(r.dueAt), 7);

  await newSession();
  r = await submit(false);
  assert.deepEqual([r.box, days(r.dueAt), r.mastered], [0, 0, false]);
  // Failed exercise repeated at the end of the same session and solved: box unchanged.
  r = await submit(true);
  assert.equal(r.box, 0);

  await newSession();
  await setBox(1);
  r = await submit(true, { usedHint: true });
  assert.equal(r.box, 0, "hint -> box 0");

  await newSession();
  await setBox(4);
  r = await submit(true);
  assert.deepEqual([r.box, r.mastered], [5, true]);
  const queue = await callerFor(A).practice.queue({ limit: 50 });
  assert.ok(!queue.some((q) => q.id === id), "mastered leaves the queue");

  const [row] = await db.select().from(exercises).where(eq(exercises.id, id));
  assert.equal(row!.attempts, 5);
});

test("practice.queue filters and DTO", async () => {
  const q = await callerFor(A).practice.queue({ kind: "brilliant" });
  assert.deepEqual(q.map((e) => e.ply).sort(), [10, 9]);
  const mine = await callerFor(A).practice.queue({ side: "opponent", kind: "mistake" });
  assert.deepEqual(mine.map((e) => e.ply), [5]);
  const e = mine[0]!;
  assert.equal(e.sideToMove, "b");
  assert.equal(e.gameLabel, "Carlos_MX vs Rival");
  assert.deepEqual(e.evalBefore, { cp: 20 });
  assert.ok(Array.isArray(e.bestPv));
});

test("practice.summary", async () => {
  const s = await callerFor(A).practice.summary({ tz: "America/Mexico_City" });
  assert.equal(s.mastered, 1);
  assert.equal(s.streakDays, 1);
  assert.equal(s.total, 5);
  assert.deepEqual(s.byKind, { mistake: 3, brilliant: 2 });
  assert.deepEqual(s.bySide, { me: 3, opponent: 2, unknown: 0 });
  await assert.rejects(callerFor(A).practice.summary({ tz: "Mars/Olympus" }), code("BAD_REQUEST"));
});

test("cross-user ids -> NOT_FOUND, no session -> UNAUTHORIZED", async () => {
  const exId = (await exByPly()).get(2)!.id;
  const b = callerFor(B);
  await assert.rejects(b.games.get({ id: gameId }), code("NOT_FOUND"));
  await assert.rejects(b.games.delete({ id: gameId }), code("NOT_FOUND"));
  await assert.rejects(b.games.setUserColor({ id: gameId, color: "b" }), code("NOT_FOUND"));
  await assert.rejects(b.analysis.save({ gameId, analysis: baseAnalysis() }), code("NOT_FOUND"));
  await assert.rejects(
    b.practice.submitResult({ exerciseId: exId, firstTryCorrect: true, usedHint: false, viewedSolution: false }),
    code("NOT_FOUND")
  );
  assert.deepEqual(await b.games.list(), []);
  assert.deepEqual(await b.practice.queue(), []);
  assert.deepEqual(await b.practice.queue({ gameId }), []);

  const anon = callerFor(null);
  await assert.rejects(anon.games.list(), code("UNAUTHORIZED"));
  await assert.rejects(anon.practice.queue(), code("UNAUTHORIZED"));
  await assert.rejects(anon.players.list(), code("UNAUTHORIZED"));
});

test("players.add / list", async () => {
  await callerFor(A).players.add({ name: "Carlos_MX" });
  await callerFor(A).players.add({ name: "carlos_mx" });
  assert.deepEqual(await callerFor(A).players.list(), ["carlos_mx"]);
  assert.deepEqual(await callerFor(B).players.list(), []);
});

test("games.delete cascades to analysis, exercises and attempts", async () => {
  await callerFor(A).games.delete({ id: gameId });
  const left = await db.select().from(exercises).where(eq(exercises.gameId, gameId));
  const attempts = await db.select().from(exerciseAttempts).where(and(eq(exerciseAttempts.userId, A)));
  assert.equal(left.length, 0);
  assert.equal(attempts.length, 0);
  await assert.rejects(callerFor(A).games.get({ id: gameId }), code("NOT_FOUND"));
});

test("games.import rate limit: 10/min per user", async () => {
  const C = await createUser();
  const { games } = await parsePgnText(TEST_PGN);
  for (let i = 0; i < 10; i++) await callerFor(C).games.import({ games: [games[0]!] });
  await assert.rejects(callerFor(C).games.import({ games: [games[0]!] }), code("TOO_MANY_REQUESTS"));
});
