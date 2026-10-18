// MUST be the first import of every DB test: points the app at the local test Postgres
// before ~/env and ~/server/db are evaluated, and refuses anything that is not localhost (D2).
const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is not set (run `pnpm db:test:up`).");
const host = new URL(url).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error(`Refusing to run tests against ${host}: DATABASE_URL_TEST must point to localhost.`);
}
process.env.DATABASE_URL = url;
process.env.DATABASE_URL_POOLED = url;
export const TEST_DATABASE_URL = url;
