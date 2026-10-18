/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

import withSerwistInit from "@serwist/next";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

// Archivos de public/ a precachear (D13). Fuera: el respaldo asm.js (3 MB, solo navegadores sin
// WebAssembly; se cachea al usarse), la licencia y el propio sw.js.
const SKIP = /(^|\/)(sw\.js|swe-worker-.*|stockfish-19-asm\.js|COPYING\.txt)$/;
/** @param {string} dir @returns {string[]} */
const walk = (dir) =>
  readdirSync(join("public", dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name).replaceAll("\\", "/")],
  );
const publicEntries = walk("")
  .filter((f) => !SKIP.test(f))
  .map((f) => ({
    url: `/${f}`,
    revision: createHash("md5").update(readFileSync(join("public", f))).digest("hex"),
  }));

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: false, // se registra en components/pwa.tsx (aviso de versión nueva)
  reloadOnOnline: false, // no perder un análisis en memoria al volver la red
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  additionalPrecacheEntries: [
    ...publicEntries,
    ...["/", "/analizar", "/offline"].map((url) => ({ url, revision })),
  ],
});

/** @type {import("next").NextConfig} */
const config = {
  async headers() {
    return [
      { source: "/engine/:file*.wasm", headers: [{ key: "Content-Type", value: "application/wasm" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default withSerwist(config);
