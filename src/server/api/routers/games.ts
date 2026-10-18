import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { MAX_GAMES, parseGamePgn } from "~/lib/import/pgn";
import type { Color, GameAnalysis } from "~/lib/types";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { analyses, exercises, games } from "~/server/db/schema";
import { enforceRateLimit } from "~/server/services/rate-limit";

const colorSchema = z.enum(["w", "b"]);
const idInput = z.object({ id: z.string().uuid() });

// Only identity/metadata is taken from the client; everything derivable from the PGN is re-parsed here.
const importedGame = z.object({
  source: z.enum(["pgn", "lichess", "chesscom"]),
  sourceId: z.string().regex(/^[A-Za-z0-9/_-]{1,100}$/),
  pgn: z.string().min(1).max(200_000),
  timeClass: z.string().max(20).nullish(),
  playedAt: z.string().datetime().nullish(),
  userColor: colorSchema.nullish(),
});

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "No encontramos esa partida" });

export const gamesRouter = createTRPCRouter({
  /** Dedupe by (user_id, source, source_id). `ids` follows the input order (existing id for skipped ones). */
  import: protectedProcedure
    .input(z.object({ games: z.array(importedGame).min(1).max(MAX_GAMES) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await enforceRateLimit(ctx.db, `games.import:${userId}`, 10, 60);

      const rows = input.games.map((g, i) => {
        const r = parseGamePgn(g.pgn);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `Partida ${i + 1}: ${r.message}` });
        const p = r.game;
        return {
          userId,
          source: g.source,
          sourceId: g.sourceId,
          pgn: p.pgn,
          white: p.white,
          black: p.black,
          whiteElo: p.whiteElo,
          blackElo: p.blackElo,
          result: p.result,
          timeClass: g.timeClass ?? p.timeClass,
          playedAt: (g.playedAt ?? p.playedAt) ? new Date((g.playedAt ?? p.playedAt)!) : null,
          userColor: g.userColor ?? null,
          openingName: p.openingName,
          startFen: p.startFen,
          movesUci: p.movesUci,
          movesSan: p.movesSan,
        };
      });
      const key = (r: { source: string; sourceId: string }) => `${r.source}:${r.sourceId}`;
      const unique = [...new Map(rows.map((r) => [key(r), r])).values()];

      const inserted = await ctx.db
        .insert(games)
        .values(unique)
        .onConflictDoNothing()
        .returning({ id: games.id, source: games.source, sourceId: games.sourceId });
      const all = await ctx.db
        .select({ id: games.id, source: games.source, sourceId: games.sourceId })
        .from(games)
        .where(
          and(
            eq(games.userId, userId),
            sql`(${games.source} || ':' || ${games.sourceId}) in ${unique.map(key)}`
          )
        );
      const idByKey = new Map(all.map((r) => [key(r), r.id]));
      return {
        inserted: inserted.length,
        skipped: input.games.length - inserted.length,
        ids: rows.map((r) => idByKey.get(key(r))!),
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: games.id,
        white: games.white,
        black: games.black,
        result: games.result,
        playedAt: games.playedAt,
        openingName: games.openingName,
        userColor: games.userColor,
        timeClass: games.timeClass,
        source: games.source,
        analyzed: sql<boolean>`${analyses.gameId} is not null`,
        accuracyWhite: analyses.accuracyWhite,
        accuracyBlack: analyses.accuracyBlack,
        mistakesWhite: analyses.mistakesWhite,
        mistakesBlack: analyses.mistakesBlack,
        brilliantsWhite: analyses.brilliantsWhite,
        brilliantsBlack: analyses.brilliantsBlack,
      })
      .from(games)
      .leftJoin(analyses, eq(analyses.gameId, games.id))
      .where(eq(games.userId, ctx.session.user.id))
      .orderBy(sql`coalesce(${games.playedAt}, ${games.createdAt}) desc`);

    return rows.map((r) => {
      const pick = <T,>(w: T | null, b: T | null) => (r.userColor === "w" ? w : r.userColor === "b" ? b : null);
      return {
        id: r.id,
        white: r.white,
        black: r.black,
        result: r.result,
        playedAt: r.playedAt?.toISOString() ?? null,
        openingName: r.openingName,
        userColor: r.userColor as Color | null,
        analyzed: r.analyzed,
        /** null if not analyzed or the user's color is unknown. */
        accuracyUser: pick(r.accuracyWhite, r.accuracyBlack),
        /** Mistakes+blunders+misses / brilliants of the user (both sides if color unknown); null if not analyzed. */
        mistakes: r.analyzed ? (pick(r.mistakesWhite, r.mistakesBlack) ?? (r.mistakesWhite ?? 0) + (r.mistakesBlack ?? 0)) : null,
        brilliants: r.analyzed
          ? (pick(r.brilliantsWhite, r.brilliantsBlack) ?? (r.brilliantsWhite ?? 0) + (r.brilliantsBlack ?? 0))
          : null,
        timeClass: r.timeClass,
        source: r.source,
      };
    });
  }),

  get: protectedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({ game: games, analysis: analyses })
      .from(games)
      .leftJoin(analyses, eq(analyses.gameId, games.id))
      .where(and(eq(games.id, input.id), eq(games.userId, ctx.session.user.id)));
    if (!row) throw notFound();
    const g = row.game;
    const a = row.analysis;
    const analysis: GameAnalysis | null = a
      ? {
          depth: a.depth,
          engine: a.engine,
          classifierVersion: a.classifierVersion,
          positions: a.positions,
          moves: a.moves,
          accuracyWhite: a.accuracyWhite,
          accuracyBlack: a.accuracyBlack,
        }
      : null;
    return {
      game: {
        id: g.id,
        source: g.source,
        sourceId: g.sourceId,
        pgn: g.pgn,
        white: g.white,
        black: g.black,
        whiteElo: g.whiteElo,
        blackElo: g.blackElo,
        result: g.result,
        timeClass: g.timeClass,
        playedAt: g.playedAt?.toISOString() ?? null,
        userColor: g.userColor as Color | null,
        openingName: g.openingName,
        startFen: g.startFen,
        movesUci: g.movesUci,
        movesSan: g.movesSan,
      },
      analysis,
    };
  }),

  /** Cascades to analysis, exercises and attempts. */
  delete: protectedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const res = await ctx.db
      .delete(games)
      .where(and(eq(games.id, input.id), eq(games.userId, ctx.session.user.id)))
      .returning({ id: games.id });
    if (res.length === 0) throw notFound();
    return { ok: true as const };
  }),

  /** Also recomputes exercises.side (me/opponent/null). */
  setUserColor: protectedProcedure
    .input(z.object({ id: z.string().uuid(), color: colorSchema.nullable() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const res = await tx
          .update(games)
          .set({ userColor: input.color })
          .where(and(eq(games.id, input.id), eq(games.userId, ctx.session.user.id)))
          .returning({ id: games.id });
        if (res.length === 0) throw notFound();
        await tx
          .update(exercises)
          .set({
            side: input.color
              ? sql`case when ${exercises.color} = ${input.color} then 'me' else 'opponent' end`
              : null,
            updatedAt: sql`now()`,
          })
          .where(eq(exercises.gameId, input.id));
        return { ok: true as const };
      });
    }),
});
