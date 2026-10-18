// Chess.com importers (D6). User archives are fetched from the browser (CORS ok);
// single games go through our route /api/import/chesscom/[type]/[id].
import type { ParsedGame } from "~/lib/types";

import {
  clampMax,
  fetchWith429,
  ImportError,
  RATE_LIMITED_MSG,
  USERNAME_RE,
  type ImportProgress,
  type UserImportResult,
} from "./http";
import { parseGamePgn, toParsedGame } from "./pgn";

const MAX_MONTHS = 24;

type ArchiveGame = {
  url: string;
  pgn?: string;
  rules?: string;
  time_class?: string;
  end_time?: number;
  white?: { username?: string };
  black?: { username?: string };
};

/** Most recent `max` games: monthly archives newest first, strictly serial, at most 24 months. */
export async function fetchChesscomUserGames(
  user: string,
  max: number,
  onProgress?: ImportProgress
): Promise<UserImportResult> {
  const u = user.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) throw new ImportError("Ese nombre de usuario no es válido.");
  const limit = clampMax(max);
  const res = await fetchWith429(`https://api.chess.com/pub/player/${u}/games/archives`, {}, onProgress, 0);
  if (!res) throw new ImportError(RATE_LIMITED_MSG);
  if (res.status === 404) throw new ImportError("No encontramos ese usuario en Chess.com.");
  if (!res.ok) throw new ImportError("Chess.com no respondió. Intenta de nuevo en un momento.");
  const { archives = [] } = (await res.json()) as { archives?: string[] };

  const out: UserImportResult = { games: [], unsupported: 0 };
  for (const monthUrl of archives.slice(-MAX_MONTHS).reverse()) {
    if (!monthUrl.startsWith(`https://api.chess.com/pub/player/${u}/games/`)) continue;
    const mres = await fetchWith429(monthUrl, {}, onProgress, out.games.length);
    if (!mres) return { ...out, warning: RATE_LIMITED_MSG };
    if (!mres.ok) continue;
    const { games = [] } = (await mres.json()) as { games?: ArchiveGame[] };
    games.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
    for (const g of games) {
      if (out.games.length >= limit) return out;
      const r = g.rules === "chess" && g.pgn ? parseGamePgn(g.pgn) : null;
      const id = /\/game\/(live|daily)\/(\d+)/.exec(g.url);
      if (!r?.ok || !id) {
        out.unsupported++;
        continue;
      }
      const color =
        g.white?.username?.toLowerCase() === u ? "w" : g.black?.username?.toLowerCase() === u ? "b" : null;
      out.games.push(
        await toParsedGame(
          { ...r.game, source: "chesscom", sourceId: `${id[1]}/${id[2]}`, timeClass: g.time_class ?? r.game.timeClass },
          color
        )
      );
      onProgress?.({ fetched: out.games.length });
    }
    if (out.games.length >= limit) break;
  }
  return out;
}

export const CHESSCOM_FAIL_MSG = "No pudimos traer esta partida. Pega el PGN o importa por usuario";

export async function fetchChesscomGame(type: "live" | "daily", id: string): Promise<ParsedGame> {
  let res: Response;
  try {
    res = await fetch(`/api/import/chesscom/${type}/${encodeURIComponent(id)}`);
  } catch {
    throw new ImportError(CHESSCOM_FAIL_MSG);
  }
  const body = (await res.json().catch(() => ({}))) as { pgn?: string; error?: string };
  if (!res.ok || !body.pgn) throw new ImportError(body.error ?? CHESSCOM_FAIL_MSG);
  const r = parseGamePgn(body.pgn);
  if (!r.ok) throw new ImportError(`Partida ${r.message}`);
  return toParsedGame({ ...r.game, source: "chesscom", sourceId: `${type}/${id}` });
}
