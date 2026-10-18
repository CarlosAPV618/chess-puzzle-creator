import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production" ? z.string() : z.string().optional(),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
    // Directa: migraciones. Pooled: la app (serverless).
    DATABASE_URL: z.string().url(),
    DATABASE_URL_POOLED: z.string().url().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {},
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_POOLED: process.env.DATABASE_URL_POOLED,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
