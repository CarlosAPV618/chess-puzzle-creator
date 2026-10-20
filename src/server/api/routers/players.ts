import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { games, playerNames } from "~/server/db/schema";

type Account = { name: string; at: Date } | null;

export const playersRouter = createTRPCRouter({
  /** Per platform, the name the user plays under most often (ties: most recent), to prefill the import (D9). */
  accounts: protectedProcedure.query(async ({ ctx }) => {
    const me = sql`case when ${games.userColor} = 'w' then ${games.white} else ${games.black} end`;
    const rows = await ctx.db.execute<{ source: string; name: string; at: Date | string }>(sql`
      select distinct on (source) source, name, at
      from (
        select ${games.source} as source, max(${me}) as name, count(*) as n,
               max(coalesce(${games.playedAt}, ${games.createdAt})) as at
        from ${games}
        where ${games.userId} = ${ctx.session.user.id} and ${games.source} in ('lichess', 'chesscom')
          and ${games.userColor} is not null
        group by ${games.source}, lower(${me})
      ) s
      order by source, n desc, at desc`);
    const pick = (source: string): Account => {
      const r = rows.find((x) => x.source === source);
      return r ? { name: r.name, at: new Date(r.at) } : null;
    };
    return { lichess: pick("lichess"), chesscom: pick("chesscom") };
  }),


  /** Names (lowercased) the user plays under, for detectUserColor (D6). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ name: playerNames.nameLower })
      .from(playerNames)
      .where(eq(playerNames.userId, ctx.session.user.id))
      .orderBy(asc(playerNames.nameLower));
    return rows.map((r) => r.name);
  }),

  add: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(playerNames)
        .values({ userId: ctx.session.user.id, nameLower: input.name.toLowerCase() })
        .onConflictDoNothing();
      return { ok: true as const };
    }),
});
