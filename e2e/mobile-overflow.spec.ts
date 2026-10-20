import { expect, test } from "@playwright/test";
import postgres from "postgres";

// Minimal mobile check at 360 px of what unit tests cannot see: hamburger instead of the bottom nav (D6),
// one row under the board, ▶ never scrolls the page and "Practicar" opens the session (D7).
const PGN = `[Event "Live Chess"]
[White "Maximiliano_Hernandez_Gutierrez"]
[Black "Bartholomew_Featherstonehaugh99"]
[WhiteElo "1786"]
[BlackElo "1775"]
[Result "1-0"]
[TimeControl "600"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 12. Bg5 Bxg5 13. Nxg5 h6 14. Qe2 hxg5 15. Re1 Be6 16. dxe6 f6 17. Re3 c6 18. Rh3 Rxh3 19. gxh3 g6 20. Qf3 Qa5 21. Rd1 Qf5 22. Qb3 O-O-O 23. Qa3 Qc5 24. Qb3 1-0`;

test("mobile review and menu at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });

  // Sign up and save the game.
  const email = `e2e${Date.now()}@test.local`;
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("e2e-password-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL((u) => u.pathname !== "/registro");
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // session loaded: logged-in imports save
  await page.getByLabel("PGN").fill(PGN);
  await page.locator("form").getByRole("button", { name: "Analizar" }).click();
  // Unknown names: no detected color, so the row asks and we open it by hand.
  await page.getByRole("button", { name: /^Analizar Maximiliano/ }).click();
  await page.waitForURL(/\/partidas\/[0-9a-f-]{36}$/);
  const gameId = page.url().split("/").pop()!;

  // Seed an analysis and one exercise straight into the local DB: running Stockfish here is too slow.
  const sql = postgres(process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@localhost:5435/chess_test", { max: 1 });
  try {
    const [g] = await sql<{ user_id: string; moves_uci: string[] }[]>`select user_id, moves_uci from games where id = ${gameId}`;
    const n = g!.moves_uci.length;
    const positions = Array.from({ length: n + 1 }, (_, i) => ({ eval: { cp: i * 7 }, pv: [] }));
    const moves = Array.from({ length: n }, (_, i) => ({ class: i === 10 ? "blunder" : "best", epLoss: 0 }));
    await sql`insert into analyses (game_id, depth, engine, classifier_version, positions, moves, accuracy_white, accuracy_black, brilliants_white)
      values (${gameId}, 16, 'sf19-lite', 1, ${sql.json(positions)}, ${sql.json(moves)}, 91.2, 78.4, 0)`;
    await sql`insert into exercises
      (user_id, game_id, ply, color, fen, played_uci, kind, best_uci, accepted_uci, refutation_pv, class, ep_loss, phase)
      values (${g!.user_id}, ${gameId}, 4, 'w', 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        'c2c3', 'mistake', 'e1g1', ${["e1g1"]}, ${[]}, 'blunder', 0.3, 'opening')`;
  } finally {
    await sql.end();
  }
  await page.goto(`/partidas/${gameId}`);
  await page.waitForLoadState("networkidle");

  // (1) No bottom nav; the hamburger opens the panel with the email, the pages and "Cerrar sesión".
  await expect(page.locator("nav.fixed")).toHaveCount(0);
  const menu = page.getByRole("menu");
  // next dev can paint the button before hydrating it: a click that lands too early is lost.
  await expect(async () => {
    await page.getByRole("button", { name: "Menú" }).click();
    await expect(menu).toBeVisible({ timeout: 2000 });
  }).toPass();
  for (const t of [email, "Importar", "Mis partidas", "Practicar", "Cerrar sesión"]) await expect(menu).toContainText(t);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // (2) Repasar, Practicar and Girar on one row.
  const row = [
    page.getByRole("button", { name: "Repasar" }),
    page.getByRole("link", { name: "Practicar", exact: true }),
    page.getByRole("button", { name: "Girar tablero" }),
  ];
  const tops = await Promise.all(row.map((l) => l.evaluate((el) => (el as HTMLElement).offsetTop)));
  expect(new Set(tops).size, `offsetTop ${tops.join(", ")}`).toBe(1);

  // (3) ▶ moves only the move strip, never the page.
  const scrollY = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Siguiente" }).click();
  await page.waitForTimeout(600); // smooth scroll of the strip
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

  // (4) "Practicar" goes straight to the session.
  await row[1]!.click();
  await expect(page.getByRole("progressbar", { name: "Progreso de la sesión" })).toBeVisible({ timeout: 30_000 }); // first compile of /practicar in next dev
});
