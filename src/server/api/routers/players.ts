import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { playerNames } from "~/server/db/schema";

export const playersRouter = createTRPCRouter({
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
