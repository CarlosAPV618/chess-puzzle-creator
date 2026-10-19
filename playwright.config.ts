import { defineConfig, devices } from "@playwright/test";

// e2e against a local `next dev` pointed at the docker test Postgres, never Neon (6.5).
// Process env wins over .env in Next, so the app cannot reach the DATABASE_URL in .env.
const db = process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@localhost:5435/chess_test";
if (!["localhost", "127.0.0.1"].includes(new URL(db).hostname)) {
  throw new Error("DATABASE_URL_TEST must point to the local test Postgres (pnpm db:test:up).");
}
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 600_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: BASE, ...devices["Pixel 7"], channel: "chrome" }, // ponytail: installed Chrome, no browser download
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: BASE,
    timeout: 300_000, // cold `next dev` compiles take minutes on Windows
    reuseExistingServer: false,
    env: { DATABASE_URL: db, DATABASE_URL_POOLED: db, BETTER_AUTH_URL: BASE, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
