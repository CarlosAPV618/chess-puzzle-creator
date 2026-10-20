import { TEST_ADMIN_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from "./env";

import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { createCaller } from "~/server/api/root";
import type { Context } from "~/server/api/trpc";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

/** Create this file's database if needed, drop and recreate its schemas, then apply every migration. */
export async function resetDb() {
  const admin = postgres(TEST_ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database "${TEST_DATABASE_NAME}"`);
  } catch (e) {
    if ((e as { code?: string }).code !== "42P04") throw e; // already exists
  } finally {
    await admin.end();
  }
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists drizzle cascade;
      create schema public;`);
    await migrate(drizzle(sql), { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  } finally {
    await sql.end();
  }
}

let n = 0;
export async function createUser(): Promise<string> {
  const id = `u${++n}_${Date.now()}`;
  await db.insert(user).values({ id, name: id, email: `${id}@test.local` });
  return id;
}

/** tRPC caller with a fake session (null = anonymous). */
export function callerFor(userId: string | null) {
  const session = userId
    ? { user: { id: userId, email: `${userId}@test.local`, name: userId }, session: { userId } }
    : null;
  return createCaller({ db, session, headers: new Headers() } as unknown as Context);
}

export async function closeDb() {
  await (db.$client as postgres.Sql).end({ timeout: 1 });
}
