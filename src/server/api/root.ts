import {
  createCallerFactory,
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

// Agrega aquí cada router de src/server/api/routers.
export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => "ok"),
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
