import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Fresh schema on the local test DB (the URL was checked in playwright.config.ts). */
export default async function globalSetup() {
  const sql = postgres(process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@localhost:5435/chess_test", { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await migrate(drizzle(sql), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  } finally {
    await sql.end();
  }
}
