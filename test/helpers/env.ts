// MUST be the first import of every DB test: points the app at the local test Postgres
// before ~/env and ~/server/db are evaluated, and refuses anything that is not localhost (D2).
import { basename } from "node:path";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is not set (run `pnpm db:test:up`).");
const host = new URL(url).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error(`Refusing to run tests against ${host}: DATABASE_URL_TEST must point to localhost.`);
}
// One database per test file (`chess_test_server`, …) so files can run in parallel (--test-concurrency).
const own = new URL(url);
const file = basename(process.argv[1] ?? `p${process.pid}`).replace(/\.test\.ts$/, "").replace(/\W/g, "_");
own.pathname = `${own.pathname}_${file}`.toLowerCase();
export const TEST_ADMIN_URL = url;
export const TEST_DATABASE_URL = own.toString();
export const TEST_DATABASE_NAME = own.pathname.slice(1);
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_URL_POOLED = TEST_DATABASE_URL;
