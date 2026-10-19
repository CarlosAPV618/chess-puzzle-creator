import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { type Color, type Eval, type ExerciseKind, type ExerciseSide, type Phase } from "~/lib/types";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { analyses, exerciseAttempts, exercises, games } from "~/server/db/schema";
import { clientIp } from "~/server/services/client-ip";
import { enforceRateLimit } from "~/server/services/rate-limit";

/** Leitner intervals in days for boxes 0..4; box 5 = mastered (D9). */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 21] as const;
export const MASTERED_BOX = 5;
/** ponytail: a second result for the same exercise within this window counts as the in-session repeat. */
const SESSION_REPEAT_MS = 30 * 60 * 1000;
export const PAGE_SIZE = 12;

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
  /** null if the user's color is unknown or the viewer is not the owner. */
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
  /** Move that led to `fen` (games.moves_uci[ply-1]); null at ply 0 (D6). */
  lastMoveUci: string | null;
  /** null for non-owners (D5). */
  gameId: string | null;
  ply: number;
  /** null for non-owners (D5). */
  box: number | null;
  sideToMove: Color;
  white: string;
  black: string;
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

const filters = { side: z.enum(["me", "opponent"]).optional(), gameId: z.string().uuid().optional() };
const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "No encontramos ese ejercicio" });

const e = exercises;
/** "Most recent" order shared by every list (D4): game date (or import date), import date, then ply. */
const recentOrder = [sql`coalesce(${games.playedAt}, ${games.createdAt}) desc`, desc(games.createdAt), asc(e.ply)];

function ownerFilters(userId: string, input: { side?: "me" | "opponent"; gameId?: string }) {
  return [
    eq(e.userId, userId),
    isNull(e.archivedAt),
    input.side ? eq(e.side, input.side) : undefined,
    input.gameId ? eq(e.gameId, input.gameId) : undefined,
  ];
}

const dtoColumns = {
  ex: e,
  white: games.white,
  black: games.black,
  // Postgres arrays are 1-based: moves_uci[ply] is the 0-based move ply-1 (null at ply 0).
  lastMoveUci: sql<string | null>`${games.movesUci}[${e.ply}]`,
  bestPv: sql<string[] | null>`${analyses.positions} -> ${e.ply} -> 'pv'`,
  evalBefore: sql<Eval | null>`${analyses.positions} -> ${e.ply} -> 'eval'`,
  evalAfter: sql<Eval | null>`${analyses.positions} -> (${e.ply} + 1) -> 'eval'`,
};
type DtoRow = {
  ex: typeof exercises.$inferSelect;
  white: string;
  black: string;
  lastMoveUci: string | null;
  bestPv: string[] | null;
  evalBefore: Eval | null;
  evalAfter: Eval | null;
};

function toDTO({ ex, white, black, lastMoveUci, bestPv, evalBefore, evalAfter }: DtoRow, owner: boolean): ExerciseDTO {
  return {
    id: ex.id,
    kind: ex.kind,
    side: owner ? ex.side : null,
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
    lastMoveUci,
    gameId: owner ? ex.gameId : null,
    ply: ex.ply,
    box: owner ? ex.box : null,
    sideToMove: ex.color,
    white,
    black,
    gameLabel: `${white} vs ${black}`,
  };
}

export const practiceRouter = createTRPCRouter({
  /** Session (D4): attempted and due (most overdue first), then new ones from the most recent games. */
  queue: protectedProcedure
    .input(z.object({ ...filters, limit: z.number().int().min(1).max(50).default(10) }).default({}))
    .query(async ({ ctx, input }): Promise<ExerciseDTO[]> => {
      const rows = await ctx.db
        .select(dtoColumns)
        .from(e)
        .innerJoin(games, eq(games.id, e.gameId))
        .leftJoin(analyses, eq(analyses.gameId, e.gameId))
        .where(
          and(
            ...ownerFilters(ctx.session.user.id, input),
            lt(e.box, MASTERED_BOX),
            or(lte(e.dueAt, sql`now()`), eq(e.attempts, 0))
          )
        )
        .orderBy(sql`(${e.attempts} = 0)`, sql`case when ${e.attempts} > 0 then ${e.dueAt} end`, ...recentOrder)
        .limit(input.limit);
      return rows.map((r) => toDTO(r, true));
    }),

  /** Paged list of non-archived exercises (mastered included), most recent first (D4). */
  list: protectedProcedure
    .input(z.object({ ...filters, page: z.number().int().min(1).default(1) }).default({}))
    .query(async ({ ctx, input }) => {
      const where = and(...ownerFilters(ctx.session.user.id, input));
      const [count] = await ctx.db.select({ total: sql<number>`count(*)::int` }).from(e).where(where);
      const total = count?.total ?? 0;
      // Out of range -> last page (page 1 when empty).
      const page = Math.min(input.page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
      const rows = await ctx.db
        .select({
          id: e.id,
          kind: e.kind,
          fen: e.fen,
          sideToMove: e.color,
          white: games.white,
          black: games.black,
          ply: e.ply,
          box: e.box,
          brilliantPlayed: e.brilliantPlayed,
        })
        .from(e)
        .innerJoin(games, eq(games.id, e.gameId))
        .where(where)
        .orderBy(...recentOrder)
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return {
        items: rows.map(({ ply, box, ...r }) => ({
          ...r,
          moveNumber: Math.floor(ply / 2) + 1,
          mastered: box >= MASTERED_BOX,
        })),
        total,
        page,
        pageSize: PAGE_SIZE,
      };
    }),

  /**
   * Anyone with the link (D5). Malformed, missing and archived ids get the same NOT_FOUND (no
   * enumeration); non-owners never get gameId, box, side or anything about the account.
   */
  byId: publicProcedure.input(z.object({ id: z.string().max(64) })).query(async ({ ctx, input }) => {
    const viewer = ctx.session?.user.id ?? null;
    await enforceRateLimit(
      ctx.db,
      viewer ? `practice.byId:user:${viewer}` : `practice.byId:ip:${clientIp(ctx.headers)}`,
      60,
      60
    );
    if (!z.string().uuid().safeParse(input.id).success) throw notFound();
    const [row] = await ctx.db
      .select(dtoColumns)
      .from(e)
      .innerJoin(games, eq(games.id, e.gameId))
      .leftJoin(analyses, eq(analyses.gameId, e.gameId))
      .where(and(eq(e.id, input.id), isNull(e.archivedAt)));
    if (!row) throw notFound();
    const owner = viewer === row.ex.userId;
    return { exercise: toDTO(row, owner), owner };
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
          .select({ box: exercises.box, dueAt: exercises.dueAt, attempts: exercises.attempts })
          .from(exercises)
          .where(and(eq(exercises.id, input.exerciseId), eq(exercises.userId, userId)))
          .for("update");
        if (!ex) throw notFound();

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
        // Recorded without moving the box: the in-session repeat of a failed exercise, and an attempted
        // exercise that is not due yet (e.g. opened early from its link, D6).
        const keep = !!recent || (ex.attempts > 0 && ex.dueAt > now);
        const box = keep ? ex.box : nextBox(ex.box, correct);
        const dueAt = keep ? ex.dueAt : dueAtFor(box, now);

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

  /** Due now, mastered, total (for the empty state) and streak (days in the browser's `tz`). */
  summary: protectedProcedure.input(z.object({ tz: tzSchema })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const [c] = await ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        due: sql<number>`(count(*) filter (where ${e.box} < ${MASTERED_BOX} and ${e.dueAt} <= now()))::int`,
        mastered: sql<number>`(count(*) filter (where ${e.box} >= ${MASTERED_BOX}))::int`,
      })
      .from(e)
      .where(and(eq(e.userId, userId), isNull(e.archivedAt)));

    const days = await ctx.db.execute<{ d: string; today: string }>(sql`
      select distinct to_char(${exerciseAttempts.createdAt} at time zone ${input.tz}, 'YYYY-MM-DD') as d,
             to_char(now() at time zone ${input.tz}, 'YYYY-MM-DD') as today
      from ${exerciseAttempts}
      where ${exerciseAttempts.userId} = ${userId}
        and ${exerciseAttempts.createdAt} > now() - interval '400 days'`);

    return {
      dueToday: c?.due ?? 0,
      mastered: c?.mastered ?? 0,
      total: c?.total ?? 0,
      streakDays: streak(
        new Set(days.map((r) => r.d)),
        days[0]?.today
      ),
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
