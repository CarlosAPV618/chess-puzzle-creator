// Game-link recognition (D6). Pure.
export type GameUrl =
  | { platform: "lichess"; id: string }
  | { platform: "chesscom"; type: "live" | "daily"; id: string };

export function parseGameUrl(text: string): GameUrl | null {
  const raw = text.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const path = url.pathname;

  if (host === "lichess.org") {
    // /{8} or /{12} (game + player), optionally /white|/black or #ply. Studies, broadcasts, etc. don't match.
    const m = /^\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?\/?$/.exec(path);
    return m ? { platform: "lichess", id: m[1]! } : null;
  }

  if (host === "chess.com") {
    const m =
      /^\/(?:analysis\/)?game\/(live|daily)\/(\d{1,15})\/?$/.exec(path) ??
      /^\/(live|daily)\/game\/(\d{1,15})\/?$/.exec(path);
    if (m) return { platform: "chesscom", type: m[1] as "live" | "daily", id: m[2]! };
    const bare = /^\/game\/(\d{1,15})\/?$/.exec(path);
    if (bare) return { platform: "chesscom", type: "live", id: bare[1]! };
  }
  return null;
}
