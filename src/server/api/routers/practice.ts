import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { CLASSIFICATIONS, type Color, type Eval, type ExerciseKind, type ExerciseSide, type Phase } from "~/lib/types";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { analyses, exerciseAttempts, exercises, games } from "~/server/db/schema";
import { enforceRateLimit } from "~/server/services/rate-limit";

/** Leitner intervals in days for boxes 0..4; box 5 = mastered (D9). */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 21] as const;
export const MASTERED_BOX = 5;
/** ponytail: a second result for the same exercise within this window counts as the in-session repeat. */
const SESSION_REPEAT_MS = 30 * 60 * 1000;

const DAY_MS = 86_400_000;

export function nextBox(box: number, correct: boolean): number {
  return correct ? Math.min(MASTERED_BOX, box + 1) : 0;
}
export function dueAtFor(box: number, now: Date): Date {
  const days = BOX_INTERVAL_DAYS[Math.min(box, BOX_INTERVAL_DAYS.length - 1)]!;
  return new Date(now.getTime() + days * DAY_MS);
}

export type ExerciseDTO = {
  id: string;
  kind: ExerciseKind;
  side: ExerciseSide;
  fen: string;
  playedUci: string;
  bestUci: string;
  acceptedUci: string[];
  refutationPv: string[];
  /** PV of the position before the move (best line), for the explanation. */
  bestPv: string[];
  evalBefore: Eval | null;
  evalAfter: Eval | null;
  cls: string;
  epLoss: number;
  phase: Phase;
  brilliantPlayed: boolean | null;
  gameId: string;
  ply: number;
  box: number;
  sideToMove: Color;
  gameLabel: string;
};

const tzSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Zona horaria no válida");

export const practiceRouter = createTRPCRouter({
  /** Due (oldest first) or never attempted, not archived, not mastered. */
  queue: protectedProcedure
    .input(
      z
        .object({
          kind: z.enum(["mistake", "brilliant"]).optional(),
          side: z.enum(["me", "opponent"]).optional(),
          cls: z.enum(CLASSIFICATIONS).optional(),
          phase: z.enum(["opening", "middlegame", "endgame"]).optional(),
          gameId: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(50).default(10),
        })
        .default({})
    )
    .query(async ({ ctx, input }): Promise<ExerciseDTO[]> => {
      const e = exercises;
      const rows = await ctx.db
        .select({
          ex: e,
          white: games.white,
          black: games.black,
          bestPv: sql<string[] | null>`${analyses.positions} -> ${e.ply} -> 'pv'`,
          evalBefore: sql<Eval | null>`${analyses.positions} -> ${e.ply} -> 'eval'`,
          evalAfter: sql<Eval | null>`${analyses.positions} -> (${e.ply} + 1) -> 'eval'`,
        })
        .from(e)
        .innerJoin(games, eq(games.id, e.gameId))
        .leftJoin(analyses, eq(analyses.gameId, e.gameId))
        .where(
          and(
            eq(e.userId, ctx.session.user.id),
            isNull(e.archivedAt),
            lt(e.box, MASTERED_BOX),
            or(lte(e.dueAt, sql`now()`), eq(e.attempts, 0)),
            input.kind ? eq(e.kind, input.kind) : undefined,
            input.side ? eq(e.side, input.side) : undefined,
            input.cls ? eq(e.cls, input.cls) : undefined,
            input.phase ? eq(e.phase, input.phase) : undefined,
            input.gameId ? eq(e.gameId, input.gameId) : undefined
          )
        )
        .orderBy(asc(e.dueAt), asc(e.createdAt))
        .limit(input.limit);

      return rows.map(({ ex, white, black, bestPv, evalBefore, evalAfter }) => ({
        id: ex.id,
        kind: ex.kind,
        side: ex.side,
        fen: ex.fen,
        playedUci: ex.playedUci,
        bestUci: ex.bestUci,
        acceptedUci: ex.acceptedUci,
        refutationPv: ex.refutationPv,
        bestPv: bestPv ?? [],
        evalBefore,
        evalAfter,
        cls: ex.cls,
        epLoss: ex.epLoss,
        phase: ex.phase,
        brilliantPlayed: ex.brilliantPlayed,
        gameId: ex.gameId,
        ply: ex.ply,
        box: ex.box,
        sideToMove: ex.color,
        gameLabel: `${white} vs ${black}`,
      }));
    }),

  /** One call per exercise per session; the server computes the Leitner box (D9). */
  submitResult: protectedProcedure
    .input(
      z.object({
        exerciseId: z.string().uuid(),
        firstTryCorrect: z.boolean(),
        usedHint: z.boolean(),
        viewedSolution: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await enforceRateLimit(ctx.db, `practice.submit:${userId}`, 120, 60);
      return ctx.db.transaction(async (tx) => {
        const [ex] = await tx
          .select({ box: exercises.box, dueAt: exercises.dueAt })
          .from(exercises)
          .where(and(eq(exercises.id, input.exerciseId), eq(exercises.userId, userId)))
          .for("update");
        if (!ex) throw new TRPCError({ code: "NOT_FOUND", message: "No encontramos ese ejercicio" });

        const now = new Date();
        const [recent] = await tx
          .select({ id: exerciseAttempts.id })
          .from(exerciseAttempts)
          .where(
            and(
              eq(exerciseAttempts.exerciseId, input.exerciseId),
              gt(exerciseAttempts.createdAt, new Date(now.getTime() - SESSION_REPEAT_MS))
            )
          )
          .limit(1);

        const correct = input.firstTryCorrect && !input.usedHint && !input.viewedSolution;
        // The in-session repeat of a failed exercise is recorded but does not move the box.
        const box = recent ? ex.box : nextBox(ex.box, correct);
        const dueAt = recent ? ex.dueAt : dueAtFor(box, now);

        await tx
          .update(exercises)
          .set({
            box,
            dueAt,
            attempts: sql`${exercises.attempts} + 1`,
            solvedCount: sql`${exercises.solvedCount} + ${correct ? 1 : 0}`,
            updatedAt: now,
          })
          .where(eq(exercises.id, input.exerciseId));
        await tx.insert(exerciseAttempts).values({
          exerciseId: input.exerciseId,
          userId,
          firstTryCorrect: input.firstTryCorrect,
          usedHint: input.usedHint,
          viewedSolution: input.viewedSolution,
        });
        return { box, dueAt: dueAt.toISOString(), mastered: box >= MASTERED_BOX };
      });
    }),

  /** Due now, mastered, streak (days in the browser's `tz`) and counts by kind/class/side. */
  summary: protectedProcedure.input(z.object({ tz: tzSchema })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const e = exercises;
    const counts = await ctx.db
      .select({
        kind: e.kind,
        cls: e.cls,
        side: e.side,
        count: sql<number>`count(*)::int`,
        due: sql<number>`(count(*) filter (where ${e.box} < ${MASTERED_BOX} and ${e.dueAt} <= now()))::int`,
        mastered: sql<number>`(count(*) filter (where ${e.box} >= ${MASTERED_BOX}))::int`,
      })
      .from(e)
      .where(and(eq(e.userId, userId), isNull(e.archivedAt)))
      .groupBy(e.kind, e.cls, e.side);

    const days = await ctx.db.execute<{ d: string; today: string }>(sql`
      select distinct to_char(${exerciseAttempts.createdAt} at time zone ${input.tz}, 'YYYY-MM-DD') as d,
             to_char(now() at time zone ${input.tz}, 'YYYY-MM-DD') as today
      from ${exerciseAttempts}
      where ${exerciseAttempts.userId} = ${userId}
        and ${exerciseAttempts.createdAt} > now() - interval '400 days'`);

    const byKind = { mistake: 0, brilliant: 0 };
    const bySide = { me: 0, opponent: 0, unknown: 0 };
    let dueToday = 0;
    let mastered = 0;
    for (const c of counts) {
      byKind[c.kind] += c.count;
      bySide[c.side ?? "unknown"] += c.count;
      dueToday += c.due;
      mastered += c.mastered;
    }
    return {
      dueToday,
      mastered,
      total: byKind.mistake + byKind.brilliant,
      streakDays: streak(
        new Set(days.map((r) => r.d)),
        days[0]?.today
      ),
      byKind,
      bySide,
      /** Per kind + class + side, for the "por tipo de error, mías / de rivales" panel. */
      counts: counts.map(({ kind, cls, side, count }) => ({ kind, cls, side, count })),
    };
  }),
});

/** Consecutive days with a result, ending today (or yesterday if nothing yet today). */
export function streak(days: Set<string>, today: string | undefined): number {
  if (!today) return 0;
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
  let cur = days.has(today) ? today : shift(today, -1);
  let n = 0;
  while (days.has(cur)) {
    n++;
    cur = shift(cur, -1);
  }
  return n;
}
