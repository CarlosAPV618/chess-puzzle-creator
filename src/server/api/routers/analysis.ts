import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { gameAnalysisInput, saveAnalysis } from "~/server/services/analysis";
import { enforceRateLimit } from "~/server/services/rate-limit";

export const analysisRouter = createTRPCRouter({
  /** Replace the game's analysis and sync its exercises in one transaction (D8, D9). */
  save: protectedProcedure
    .input(z.object({ gameId: z.string().uuid(), analysis: gameAnalysisInput }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await enforceRateLimit(ctx.db, `analysis.save:${userId}`, 30, 60);
      return saveAnalysis(ctx.db, userId, input.gameId, input.analysis);
    }),
});
