import { closeDb, resetDb } from "./helpers/db";

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { GET } from "~/app/api/import/chesscom/[type]/[id]/route";

before(resetDb);
after(closeDb);

const call = (type: string, id: string, ip = "198.51.100.1") =>
  GET(new Request(`http://localhost/api/import/chesscom/${type}/${id}`, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ type, id }),
  });

test("strict validation: 400 without any external request", async () => {
  let fetches = 0;
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetches++;
    throw new Error("no network in tests");
  }) as typeof fetch;
  try {
    for (const [t, id] of [["live", "..%2F..%2Fevil"], ["blitz", "123"], ["live", "1234567890123456"], ["daily", "12a"]]) {
      const res = await call(t!, id!);
      assert.equal(res.status, 400, `${t}/${id}`);
    }
    assert.equal(fetches, 0);
    // Valid input reaches chess.com; a failure there is a 502 with the Spanish fallback message.
    const res = await call("live", "123456789");
    assert.equal(res.status, 502);
    assert.match(((await res.json()) as { error: string }).error, /Pega el PGN/);
    assert.equal(fetches, 1);

    // 10 per minute per IP (the one above counted): the 11th gets 429 without fetching.
    for (let i = 0; i < 9; i++) await call("live", "123456789");
    const before = fetches;
    assert.equal((await call("live", "123456789")).status, 429);
    assert.equal(fetches, before);
  } finally {
    globalThis.fetch = real;
  }
});
