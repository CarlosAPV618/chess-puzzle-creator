import { closeDb, resetDb } from "./helpers/db";

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { sql } from "drizzle-orm";

import { env } from "~/env";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { callerFor } from "./helpers/db";

const setMax = (n: number) => db.execute(sql`update app_config set value = ${String(n)} where key = 'max_users'`);
const countUsers = async () => Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from "user"`))[0]!.n);
const signUp = (email: string) =>
  auth.api.signUpEmail({ body: { email, password: "password123", name: email.split("@")[0]! } });

before(resetDb);
after(closeDb);

test("migration seeds max_users = 20", async () => {
  const [row] = await db.execute<{ value: string }>(sql`select value from app_config where key = 'max_users'`);
  assert.equal(row?.value, "20");
});

test("cap reached -> SIGNUP_CLOSED (hook), login still works, raising the cap reopens", async () => {
  await setMax(2);
  await signUp("a@x.test");
  await signUp("b@x.test");
  assert.deepEqual(await callerFor(null).auth.signupStatus(), { open: false });

  await assert.rejects(signUp("c@x.test"), (e: { status?: string; body?: { code?: string; message?: string } }) => {
    assert.equal(e.status, "FORBIDDEN");
    assert.equal(e.body?.message, "SIGNUP_CLOSED");
    return true;
  });
  assert.equal(await countUsers(), 2);

  const login = await auth.api.signInEmail({ body: { email: "a@x.test", password: "password123" } });
  assert.ok(login.token);

  await setMax(3);
  assert.deepEqual(await callerFor(null).auth.signupStatus(), { open: true });
  await signUp("c@x.test");
  assert.equal(await countUsers(), 3);
});

const rawInsert = (id: string) =>
  db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
                 values (${id}, ${id}, ${id + "@x.test"}, false, now(), now())`);
const causeMessage = (e: unknown) => String((e as { cause?: { message?: string } }).cause?.message);

test("trigger blocks inserts that bypass the hook, also under concurrency", async () => {
  await setMax(3); // already 3 users
  await assert.rejects(rawInsert("raw"), (e) => causeMessage(e) === "SIGNUP_CLOSED");

  await setMax(4);
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => rawInsert(`raw${i}`)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await countUsers(), 4);
});

test("a DB failure while signup is open is NOT masked as SIGNUP_CLOSED", async () => {
  await setMax(100);
  // Simulate losing the race: the hook sees room, the trigger says no.
  await db.execute(sql`create function fail_signup() returns trigger as $$ begin raise exception 'SIGNUP_CLOSED'; end $$ language plpgsql`);
  await db.execute(sql`create trigger fail_signup before insert on "user" for each row execute function fail_signup()`);
  try {
    const before = await countUsers();
    const err = await signUp("lost@x.test").then(() => null, (e: unknown) => e as { status?: string; statusCode?: number; body?: { code?: string; message?: string } });
    assert.ok(err, "signup must fail");
    // Better Auth reports trigger exceptions as 422 FAILED_TO_CREATE_USER; we only remap when the cap is reached.
    assert.equal(err.status, "UNPROCESSABLE_ENTITY");
    assert.equal(err.body?.code, "FAILED_TO_CREATE_USER");
    assert.equal(await countUsers(), before);
  } finally {
    await db.execute(sql`drop trigger fail_signup on "user"; drop function fail_signup()`);
  }
});

test("concurrent signups with one slot left -> exactly one user is created", async () => {
  const before = await countUsers();
  await setMax(before + 1);
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) => signUp(`race${i}@x.test`))
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 1);
  assert.equal(await countUsers(), before + 1);
  // Losers fail either in the hook or in the trigger; both must surface as 403 SIGNUP_CLOSED.
  const reasons = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => {
      const e = r.reason as { status?: string; body?: { message?: string; code?: string } };
      return `${e.status}:${e.body?.code ?? e.body?.message}`;
    });
  assert.deepEqual(reasons, Array(4).fill("FORBIDDEN:SIGNUP_CLOSED"));
});

test("Better Auth rate limit (database storage): 6th sign-in per minute from one IP gets 429", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await auth.handler(
      new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.BETTER_AUTH_URL, "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify({ email: "a@x.test", password: "wrong-password" }),
      })
    );
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 5).every((s) => s === 401), true, `statuses ${statuses}`);
  assert.equal(statuses[5], 429);
  const [row] = await db.execute<{ n: number }>(sql`select count(*)::int as n from auth_rate_limit`);
  assert.ok(row!.n >= 1);
});
