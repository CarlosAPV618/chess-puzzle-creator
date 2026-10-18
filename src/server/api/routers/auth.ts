import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { isSignupOpen } from "~/server/services/signup";

export const authRouter = createTRPCRouter({
  /** Layer 1 of the signup cap (D11). If this fails the front shows the form and the back decides. */
  signupStatus: publicProcedure.query(async ({ ctx }) => ({ open: await isSignupOpen(ctx.db) })),
});
