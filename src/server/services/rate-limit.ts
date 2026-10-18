import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

import type { Db } from "~/server/db";

/**
 * Fixed-window counter, one row per key, single atomic upsert (D11).
 * Returns true if the call is allowed.
 * ponytail: rows are never pruned (one per user/IP); add a periodic delete if the table grows.
 */
export async function rateLimit(
  db: Db,
  key: string,
  max: number,
  windowSec: number
): Promise<boolean> {
  const [row] = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start <= now() - make_interval(secs => ${windowSec})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start <= now() - make_interval(secs => ${windowSec})
                   then now() else rate_limits.window_start end
    returning count`);
  return Number(row?.count ?? 0) <= max;
}

/** tRPC flavour: throws TOO_MANY_REQUESTS. */
export async function enforceRateLimit(
  db: Db,
  key: string,
  max: number,
  windowSec: number
) {
  if (!(await rateLimit(db, key, max, windowSec))) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Demasiados intentos, espera un momento",
    });
  }
}
