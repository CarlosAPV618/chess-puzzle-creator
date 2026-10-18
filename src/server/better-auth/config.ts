import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { env } from "~/env";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";
import { isSignupOpen } from "~/server/services/signup";

const signupClosed = () =>
  new APIError("FORBIDDEN", { message: "SIGNUP_CLOSED", code: "SIGNUP_CLOSED" });

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  databaseHooks: {
    user: {
      create: {
        // Layer 2 of the signup cap (D11). Layer 3 is the BEFORE INSERT trigger.
        before: async () => {
          if (!(await isSignupOpen(db))) {
            throw signupClosed();
          }
        },
      },
    },
  },
  hooks: {
    // Losing the concurrent-signup race trips the DB trigger, which Better Auth reports as
    // 422 FAILED_TO_CREATE_USER. If the cap is reached by now, report it as SIGNUP_CLOSED.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const r = ctx.context.returned;
      if (r instanceof APIError && r.body?.code === "FAILED_TO_CREATE_USER" && !(await isSignupOpen(db))) {
        throw signupClosed();
      }
    }),
  },
  // Enabled in every environment (Better Auth defaults to production only) so it is testable.
  // IP comes from `x-forwarded-for`, which Vercel overwrites with the real client IP.
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 5 },
    },
  },
  plugins: [nextCookies()], // must stay LAST
});

export type Session = typeof auth.$Infer.Session;
