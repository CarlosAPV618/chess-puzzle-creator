import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// 6.5: no page wider than the viewport at 360/390 px, and the fixed bottom nav stays in view after scrolling.
const WIDTHS = [360, 390];
// Long names and Elo on purpose: the "Mis partidas" card overflowed with real names (D9).
const PGN = `[Event "Live Chess"]
[White "Maximiliano_Hernandez_Gutierrez"]
[Black "Bartholomew_Featherstonehaugh99"]
[WhiteElo "1786"]
[BlackElo "1775"]
[Result "1-0"]
[TimeControl "600"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 12. Bg5 Bxg5 13. Nxg5 h6 14. Qe2 hxg5 15. Re1 Be6 16. dxe6 f6 17. Re3 c6 18. Rh3 Rxh3 19. gxh3 g6 20. Qf3 Qa5 21. Rd1 Qf5 22. Qb3 O-O-O 23. Qa3 Qc5 24. Qb3 1-0`;

async function expectNoOverflow(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `${path} @${width}px: scrollWidth ${sw} > innerWidth ${iw}`).toBeLessThanOrEqual(iw);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("nav.fixed[aria-label=Principal]"), `${path} @${width}px: bottom nav`).toBeInViewport();
}

async function importPgn(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // session loaded: logged-in imports save, anonymous go to /analizar
  await page.getByLabel("PGN").fill(PGN);
  await page.locator("form").getByRole("button", { name: "Analizar" }).click();
  // Unknown names: no detected color, so the row asks and we open it by hand.
  await page.getByRole("button", { name: /^Analizar Maximiliano/ }).click();
}

test("no horizontal overflow on mobile", async ({ page }) => {
  // Anonymous: public pages, plus /analizar with a game in memory.
  for (const w of WIDTHS) for (const path of ["/", "/login", "/registro"]) await expectNoOverflow(page, path, w);
  await importPgn(page);
  await page.waitForURL("**/analizar");
  for (const w of WIDTHS) await expectNoOverflow(page, "/analizar", w); // game stays in sessionStorage

  // Sign up and save the game.
  const email = `e2e${Date.now()}@test.local`;
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("e2e-password-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL((u) => u.pathname !== "/registro");
  await importPgn(page);
  await page.waitForURL(/\/partidas\/[0-9a-f-]{36}$/);
  const gameId = page.url().split("/").pop()!;

  // Seed an (outdated) analysis and one exercise straight into the local DB: running Stockfish here is too slow.
  const sql = postgres(process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@localhost:5435/chess_test", { max: 1 });
  let exerciseId: string;
  try {
    const [g] = await sql<{ user_id: string; moves_uci: string[] }[]>`select user_id, moves_uci from games where id = ${gameId}`;
    const n = g!.moves_uci.length;
    const positions = Array.from({ length: n + 1 }, (_, i) => ({ eval: { cp: i * 7 }, pv: [] }));
    const moves = Array.from({ length: n }, (_, i) => ({ class: i === 10 ? "blunder" : i === 20 ? "brilliant" : "best", epLoss: 0 }));
    await sql`insert into analyses (game_id, depth, engine, classifier_version, positions, moves, accuracy_white, accuracy_black, brilliants_white)
      values (${gameId}, 16, 'sf19-lite', 1, ${sql.json(positions)}, ${sql.json(moves)}, 91.2, 78.4, 1)`;
    const [e] = await sql<{ id: string }[]>`insert into exercises
      (user_id, game_id, ply, color, fen, played_uci, kind, best_uci, accepted_uci, refutation_pv, class, ep_loss, phase)
      values (${g!.user_id}, ${gameId}, 4, 'w', 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        'c2c3', 'mistake', 'e1g1', ${["e1g1"]}, ${[]}, 'blunder', 0.3, 'opening') returning id`;
    exerciseId = e!.id;
  } finally {
    await sql.end();
  }

  for (const w of WIDTHS)
    for (const path of ["/partidas", `/partidas/${gameId}`, "/practicar", `/practicar/${exerciseId}`])
      await expectNoOverflow(page, path, w);

  // "Practicar esta partida" sits under the board and goes straight to the session, not the list.
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/partidas/${gameId}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Practicar esta partida" }).waitFor();
    await page.screenshot({ path: `test-results/partida-${width}.png` });
  }
  await page.getByRole("link", { name: "Practicar esta partida" }).click();
  await expect(page.getByRole("progressbar", { name: "Progreso de la sesión" })).toBeVisible();
  await page.screenshot({ path: "test-results/sesion-1280.png" });
});
