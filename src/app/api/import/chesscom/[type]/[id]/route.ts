// Single Chess.com game by link (D6). There is no official endpoint: use the unofficial
// callback for players/date, then find the game by url in the official monthly archive.
// Every URL is built here from validated pieces, so this cannot proxy anywhere else (SSRF).
import { NextResponse } from "next/server";

import { db } from "~/server/db";
import { clientIp } from "~/server/services/client-ip";
import { rateLimit } from "~/server/services/rate-limit";

const FAIL = "No pudimos traer esta partida. Pega el PGN o importa por usuario";
const USERNAME_RE = /^[A-Za-z0-9_-]{1,50}$/;
const UA = "chess-puzzle-creator/0.1 (+https://chess-puzzle-creator-pro.vercel.app)";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

type Callback = { game?: { endTime?: number; pgnHeaders?: { White?: string; Black?: string } } };
type Archive = { games?: { url?: string; pgn?: string }[] };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;
  if ((type !== "live" && type !== "daily") || !/^\d{1,15}$/.test(id)) {
    return NextResponse.json({ error: "El link de Chess.com no es válido." }, { status: 400 });
  }
  if (!(await rateLimit(db, `chesscom:${clientIp(req.headers)}`, 10, 60))) {
    return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });
  }

  try {
    const cb = await getJson<Callback>(`https://www.chess.com/callback/${type}/game/${id}`);
    const end = cb.game?.endTime;
    const players = [cb.game?.pgnHeaders?.White, cb.game?.pgnHeaders?.Black].filter(
      (u): u is string => !!u && USERNAME_RE.test(u)
    );
    if (!end || players.length === 0) throw new Error("unexpected callback format");
    const d = new Date(end * 1000);
    const month = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const url = `https://www.chess.com/game/${type}/${id}`;
    for (const u of players) {
      const archive = await getJson<Archive>(
        `https://api.chess.com/pub/player/${u.toLowerCase()}/games/${month}`
      ).catch(() => null);
      const game = archive?.games?.find((g) => g.url === url);
      if (game?.pgn) return NextResponse.json({ pgn: game.pgn });
    }
    return NextResponse.json({ error: FAIL }, { status: 404 });
  } catch (e) {
    console.error("[chesscom import]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: FAIL }, { status: 502 });
  }
}
