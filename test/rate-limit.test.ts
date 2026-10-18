import { closeDb, resetDb } from "./helpers/db";

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { db } from "~/server/db";
import { rateLimit } from "~/server/services/rate-limit";

before(resetDb);
after(closeDb);

test("fixed window: max per window, then resets after the window", async () => {
  const hits = [];
  for (let i = 0; i < 4; i++) hits.push(await rateLimit(db, "k1", 3, 1));
  assert.deepEqual(hits, [true, true, true, false]);
  assert.equal(await rateLimit(db, "other", 3, 1), true, "keys are independent");
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await rateLimit(db, "k1", 3, 1), true, "new window");
});

test("atomic under concurrency: exactly max allowed", async () => {
  const res = await Promise.all(Array.from({ length: 20 }, () => rateLimit(db, "k2", 7, 60)));
  assert.equal(res.filter(Boolean).length, 7);
});
