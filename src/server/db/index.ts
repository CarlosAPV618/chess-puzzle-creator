import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

// El pooler de Neon es PgBouncer en modo transacción: sin sentencias preparadas con nombre.
const conn =
  globalForDb.conn ??
  postgres(env.DATABASE_URL_POOLED ?? env.DATABASE_URL, { prepare: false });
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export type Db = typeof db;
