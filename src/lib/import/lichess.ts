// Lichess importers (D6). Run in the browser: lichess.org sends CORS `*`.
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

const SPEED: Record<string, string> = { ultraBullet: "bullet", correspondence: "daily" };

export async function fetchLichessGame(id: string): Promise<ParsedGame> {
  if (!/^[A-Za-z0-9]{8}$/.test(id)) throw new ImportError("El link de Lichess no es válido.");
  const res = await fetchWith429(
    `https://lichess.org/game/export/${id}?clocks=false&evals=false`,
    { headers: { Accept: "application/x-chess-pgn" } },
    undefined,
    0
  );
  if (!res) throw new ImportError(RATE_LIMITED_MSG);
  if (res.status === 404) throw new ImportError("No encontramos esa partida en Lichess.");
  if (!res.ok) throw new ImportError("Lichess no respondió. Intenta de nuevo en un momento.");
  const r = parseGamePgn(await res.text());
  if (!r.ok) throw new ImportError(`Partida ${r.message}`);
  return toParsedGame({ ...r.game, source: "lichess", sourceId: id });
}

type LichessNdjsonGame = {
  id: string;
  variant?: string;
  speed?: string;
  pgn?: string;
  players?: { white?: { user?: { id?: string } }; black?: { user?: { id?: string } } };
};

/** Most recent `max` (≤100) games of a Lichess user, streamed as NDJSON. */
export async function fetchLichessUserGames(
  user: string,
  max: number,
  onProgress?: ImportProgress
): Promise<UserImportResult> {
  const u = user.trim();
  if (!USERNAME_RE.test(u)) throw new ImportError("Ese nombre de usuario no es válido.");
  const res = await fetchWith429(
    `https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=${clampMax(max)}&pgnInJson=true&opening=true&clocks=false&evals=false`,
    { headers: { Accept: "application/x-ndjson" } },
    onProgress,
    0
  );
  if (!res) throw new ImportError(RATE_LIMITED_MSG);
  if (res.status === 404) throw new ImportError("No encontramos ese usuario en Lichess.");
  if (!res.ok || !res.body) throw new ImportError("Lichess no respondió. Intenta de nuevo en un momento.");

  const me = u.toLowerCase();
  const out: UserImportResult = { games: [], unsupported: 0 };
  const handle = async (line: string) => {
    if (!line.trim()) return;
    const g = JSON.parse(line) as LichessNdjsonGame;
    const r = g.pgn && (!g.variant || g.variant === "standard" || g.variant === "fromPosition") ? parseGamePgn(g.pgn) : null;
    if (!r?.ok) {
      out.unsupported++;
      return;
    }
    const color = g.players?.white?.user?.id === me ? "w" : g.players?.black?.user?.id === me ? "b" : null;
    out.games.push(
      await toParsedGame(
        {
          ...r.game,
          source: "lichess",
          sourceId: g.id.slice(0, 8),
          timeClass: g.speed ? (SPEED[g.speed] ?? g.speed) : r.game.timeClass,
        },
        color
      )
    );
    onProgress?.({ fetched: out.games.length });
  };

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) await handle(line);
  }
  await handle(buf);
  return out;
}
