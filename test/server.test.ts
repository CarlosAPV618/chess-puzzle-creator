import { callerFor, closeDb, createUser, resetDb } from "./helpers/db";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { parsePgnText } from "~/lib/import/pgn";
import type { GameAnalysis } from "~/lib/types";
import { db } from "~/server/db";
import { exerciseAttempts, exercises, games as gamesT, playerNames } from "~/server/db/schema";
import { replayFens } from "~/server/services/analysis";
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
      ["miss", "opponent", null],
      ["miss", "opponent", false], // blunder + missed brilliant -> one miss with the brilliant as answer
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
  assert.equal(listed!.finalFen, replayFens(startFen, movesUci).at(-1));
  assert.deepEqual([listed!.whiteElo, listed!.blackElo], [null, null]);
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
  // Next session: attempts are older than the repeat window and the exercise is due again.
  const newSession = async () => {
    await db.update(exerciseAttempts).set({ createdAt: sql`created_at - interval '2 hours'` }).where(eq(exerciseAttempts.exerciseId, id));
    await db.update(exercises).set({ dueAt: sql`now()` }).where(eq(exercises.id, id));
  };
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

test("practice.queue side filter and DTO", async () => {
  const opp = await callerFor(A).practice.queue({ side: "opponent" });
  assert.deepEqual(opp.map((e) => [e.ply, e.kind]), [[5, "miss"], [9, "miss"]]);
  const e = opp[0]!;
  assert.equal(e.sideToMove, "b");
  assert.equal(e.gameLabel, "Carlos_MX vs Rival");
  assert.deepEqual([e.white, e.black, e.gameId, e.side], ["Carlos_MX", "Rival", gameId, "opponent"]);
  assert.equal(e.lastMoveUci, movesUci[4]);
  const first = (await callerFor(A).practice.queue({ side: "me" })).find((q) => q.ply === 2)!;
  assert.equal(first.lastMoveUci, movesUci[1]);
  assert.deepEqual(e.evalBefore, { cp: 20 });
  assert.ok(Array.isArray(e.bestPv));
});

test("practice.summary", async () => {
  const s = await callerFor(A).practice.summary({ tz: "America/Mexico_City" });
  assert.equal(s.mastered, 1);
  assert.equal(s.streakDays, 1);
  assert.equal(s.total, 5);
  assert.deepEqual(Object.keys(s).sort(), ["dueToday", "mastered", "streakDays", "total"]);
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
  await assert.rejects(anon.practice.list(), code("UNAUTHORIZED"));
});

test("migration 0002 moves old kinds to miss and a re-analysis keeps the box", async () => {
  // Rows as the previous buildExercises wrote them: Miss -> mistake, missed brilliant -> brilliant.
  await db.update(exercises).set({ kind: "mistake", box: 3 }).where(and(eq(exercises.gameId, gameId), eq(exercises.ply, 5)));
  await db.update(exercises).set({ kind: "brilliant", box: 2 }).where(and(eq(exercises.gameId, gameId), eq(exercises.ply, 9)));
  const migration = readFileSync(new URL("../drizzle/0002_exercise_kinds.sql", import.meta.url), "utf8");
  const update = migration.split("--> statement-breakpoint").find((st) => /UPDATE "exercises"/.test(st))!;
  await db.execute(sql.raw(update));

  let ex = await exByPly();
  assert.deepEqual([ex.get(5)!.kind, ex.get(5)!.box, ex.get(9)!.kind, ex.get(9)!.box], ["miss", 3, "miss", 2]);
  assert.equal(ex.get(10)!.kind, "brilliant", "played brilliant untouched");
  assert.equal(ex.get(2)!.kind, "mistake", "blunder untouched");

  await callerFor(A).analysis.save({ gameId, analysis: baseAnalysis() });
  ex = await exByPly();
  assert.deepEqual([ex.get(5)!.box, ex.get(9)!.box], [3, 2], "same kind + answer keeps progress");
});

/** TEST_PGN with its own Site id, Date and players. */
const variant = (id: string, date: string, white = "Carlos_MX", black = "Rival") =>
  TEST_PGN.replace("abcd1234", id)
    .replace("2024.01.05", date)
    .replace('[White "Carlos_MX"]', `[White "${white}"]`)
    .replace('[Black "Rival"]', `[Black "${black}"]`);

async function importOne(userId: string, pgn: string, userColor: "w" | "b" | null) {
  const { games } = await parsePgnText(pgn);
  const r = await callerFor(userId).games.import({ games: [{ ...games[0]!, userColor }] });
  return r.ids[0]!;
}

test("lists, queue order, byId and the not-due rule (second user)", async () => {
  const C = await createUser();
  const g1 = await importOne(C, variant("g1aaaaaa", "2024.01.05"), "w");
  const g2 = await importOne(C, variant("g2aaaaaa", "2024.03.01"), "w");
  const g3 = await importOne(C, variant("g3aaaaaa", "2024.02.01"), "w");
  for (const id of [g1, g2, g3]) await callerFor(C).analysis.save({ gameId: id, analysis: baseAnalysis() });
  const c = callerFor(C);

  // games.list: most recent first, final FEN, lazily filled for old rows.
  await db.update(gamesT).set({ finalFen: null }).where(eq(gamesT.id, g1));
  const listed = await c.games.list();
  assert.deepEqual(listed.map((g) => g.id), [g2, g3, g1]);
  const finalFen = replayFens(startFen, movesUci).at(-1)!;
  assert.ok(listed.every((g) => g.finalFen === finalFen));
  const [g1Row] = await db.select({ f: gamesT.finalFen }).from(gamesT).where(eq(gamesT.id, g1));
  assert.equal(g1Row!.f, finalFen, "filled once in the DB");

  // practice.list: 12 per page, most recent game first then ply, clamp, filters.
  const p1 = await c.practice.list({});
  assert.deepEqual([p1.total, p1.page, p1.pageSize, p1.items.length], [15, 1, 12, 12]);
  const plies = [0, 2, 5, 9, 10];
  const gameOf = async (ids: string[]) => {
    const rows = await db.select({ id: exercises.id, gameId: exercises.gameId, ply: exercises.ply }).from(exercises).where(inArray(exercises.id, ids));
    const m = new Map(rows.map((r) => [r.id, `${r.gameId === g1 ? 1 : r.gameId === g2 ? 2 : 3}:${r.ply}`]));
    return ids.map((id) => m.get(id));
  };
  assert.deepEqual(await gameOf(p1.items.map((i) => i.id)), [
    ...plies.map((p) => `2:${p}`),
    ...plies.map((p) => `3:${p}`),
    "1:0",
    "1:2",
  ]);
  const item = p1.items[2]!;
  assert.deepEqual(
    [item.kind, item.sideToMove, item.white, item.black, item.moveNumber, item.mastered, item.brilliantPlayed],
    ["miss", "b", "Carlos_MX", "Rival", 3, false, null]
  );
  const p2 = await c.practice.list({ page: 99 });
  assert.deepEqual([p2.page, p2.items.length], [2, 3]);
  const opp = await c.practice.list({ side: "opponent", page: 2 });
  assert.deepEqual([opp.total, opp.page, opp.items.length], [6, 1, 6]);
  assert.equal((await c.practice.list({ gameId: g3 })).total, 5);
  assert.deepEqual(await callerFor(B).practice.list({ page: 3 }), { items: [], total: 0, page: 1, pageSize: 12 });

  // queue: new ones from the most recent game first; attempted + due before them.
  let q = await c.practice.queue({ limit: 3 });
  assert.deepEqual(await gameOf(q.map((e) => e.id)), ["2:0", "2:2", "2:5"]);
  const dueId = p1.items[11]!.id; // g1 ply 2
  await db.update(exercises).set({ attempts: 1, dueAt: sql`now() - interval '1 day'` }).where(eq(exercises.id, dueId));
  q = await c.practice.queue({ limit: 2 });
  assert.deepEqual(q.map((e) => e.id), [dueId, p1.items[0]!.id]);

  // byId: owner gets everything; others (signed in or not) the reduced version.
  const exId = p1.items[2]!.id; // g2 ply 5
  const own = await c.practice.byId({ id: exId });
  assert.equal(own.owner, true);
  assert.deepEqual([own.exercise.gameId, own.exercise.box, own.exercise.side], [g2, 0, "opponent"]);
  assert.equal(own.exercise.lastMoveUci, movesUci[4]);
  for (const viewer of [A, null]) {
    const r = await callerFor(viewer).practice.byId({ id: exId });
    assert.equal(r.owner, false);
    assert.deepEqual([r.exercise.gameId, r.exercise.box, r.exercise.side], [null, null, null]);
    assert.equal(r.exercise.fen, own.exercise.fen);
    assert.ok(!JSON.stringify(r).includes(C), "no owner id");
  }
  await assert.rejects(
    callerFor(A).practice.submitResult({ exerciseId: exId, firstTryCorrect: true, usedHint: false, viewedSolution: false }),
    code("NOT_FOUND")
  );
  const archivedId = p1.items[3]!.id;
  await db.update(exercises).set({ archivedAt: sql`now()` }).where(eq(exercises.id, archivedId));
  const deletedGameExId = p2.items[0]!.id; // g1
  await c.games.delete({ id: g1 });
  for (const id of ["123", "6f1c0c8e-1111-4a4a-9b9b-000000000000", archivedId, deletedGameExId]) {
    await assert.rejects(callerFor(null).practice.byId({ id }), (e: unknown) =>
      e instanceof TRPCError && e.code === "NOT_FOUND" && e.message === "No encontramos ese ejercicio"
    );
  }

  // Not due yet (opened from the link): the attempt is recorded, the box and due_at stay (D6).
  const dueAt = new Date(Date.now() + 3 * 86_400_000);
  await db.update(exercises).set({ box: 2, attempts: 1, dueAt }).where(eq(exercises.id, exId));
  const r = await c.practice.submitResult({ exerciseId: exId, firstTryCorrect: true, usedHint: false, viewedSolution: false });
  assert.deepEqual([r.box, r.dueAt], [2, dueAt.toISOString()]);
  const [row] = await db.select().from(exercises).where(eq(exercises.id, exId));
  assert.deepEqual([row!.box, row!.attempts, row!.solvedCount], [2, 2, 1]);
});

test("practice.byId rate limit: 60/min per IP without a session", async () => {
  await db.execute(sql`delete from rate_limits where key like 'practice.byId:ip:%'`);
  const anon = callerFor(null);
  for (let i = 0; i < 60; i++) await assert.rejects(anon.practice.byId({ id: "x" }), code("NOT_FOUND"));
  await assert.rejects(anon.practice.byId({ id: "x" }), code("TOO_MANY_REQUESTS"));
});

test("games.setUserColor registers the name and colors the user's other games", async () => {
  const D = await createUser();
  const x = await importOne(D, variant("xaaaaaaa", "2024.01.01", "Carlos_MX", "Rival"), null);
  const y = await importOne(D, variant("yaaaaaaa", "2024.01.02", "Otro", "carlos_mx"), null);
  const z = await importOne(D, variant("zaaaaaaa", "2024.01.03", "Otro", "Rival"), null);
  await callerFor(D).analysis.save({ gameId: y, analysis: baseAnalysis() });

  await callerFor(D).games.setUserColor({ id: x, color: "w" });
  const names = await db.select().from(playerNames).where(eq(playerNames.userId, D));
  assert.deepEqual(names.map((n) => n.nameLower), ["carlos_mx"]);
  const colors = new Map((await callerFor(D).games.list()).map((g) => [g.id, g.userColor]));
  assert.deepEqual([colors.get(x), colors.get(y), colors.get(z)], ["w", "b", null]);
  const sides = await db.select({ ply: exercises.ply, side: exercises.side }).from(exercises).where(eq(exercises.gameId, y));
  assert.deepEqual(
    sides.sort((a, b) => a.ply - b.ply).map((s) => s.side),
    ["opponent", "opponent", "me", "me", "opponent"]
  );
});

test("players.add / list", async () => {
  await callerFor(A).players.add({ name: "Carlos_MX" });
  await callerFor(A).players.add({ name: "carlos_mx" });
  // "rival" was registered by setUserColor("b") above.
  assert.deepEqual(await callerFor(A).players.list(), ["carlos_mx", "rival"]);
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
