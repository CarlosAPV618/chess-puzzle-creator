import { type Config } from "drizzle-kit";

// Migraciones siempre por la conexión directa (no el pooler). Nunca `drizzle-kit push`.
export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
