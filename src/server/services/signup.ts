import { sql } from "drizzle-orm";

import type { Db } from "~/server/db";

/** True while `count(user) < app_config.max_users` (D11). Missing row = no cap. */
export async function isSignupOpen(db: Db): Promise<boolean> {
  const [row] = await db.execute<{ open: boolean }>(sql`
    select coalesce(
      (select count(*) from "user") < (select value::int from app_config where key = 'max_users'),
      true
    ) as open`);
  return row?.open ?? true;
}
