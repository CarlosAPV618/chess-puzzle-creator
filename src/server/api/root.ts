import { analysisRouter } from "~/server/api/routers/analysis";
import { authRouter } from "~/server/api/routers/auth";
import { gamesRouter } from "~/server/api/routers/games";
import { playersRouter } from "~/server/api/routers/players";
import { practiceRouter } from "~/server/api/routers/practice";
import {
  createCallerFactory,
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => "ok"),
  auth: authRouter,
  players: playersRouter,
  games: gamesRouter,
  analysis: analysisRouter,
  practice: practiceRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
