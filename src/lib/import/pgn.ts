// PGN parsing (D6). Pure: runs in the browser and on the server (games.import re-validates with it).
import { Chess, DEFAULT_POSITION } from "chess.js";

import type { Color, GameSource, ParsedGame } from "~/lib/types";

export const MAX_GAMES = 50;
export const MAX_BYTES = 1024 * 1024;

export type ParsedPgnGame = Omit<ParsedGame, "sourceId" | "userColor"> & {
  /** null when source = "pgn": the caller derives a hash (see `pgnHash`). */
  sourceId: string | null;
  headers: Record<string, string>;
  openingName: string | null;
};

export type ParseResult =
  | { ok: true; game: ParsedPgnGame }
  | { ok: false; message: string };

/** BOM, CRLF and outer whitespace. */
export function normalizePgn(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
}

const HEADER_RE = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;

/**
 * Split a multi-game text: a new game starts at a header line (outside a {comment})
 * that comes after movetext, even without a blank line or [Event].
 */
export function splitPgnGames(text: string): string[] {
  const games: string[] = [];
  let cur: string[] = [];
  let hasMoves = false;
  let braceDepth = 0;
  for (const line of normalizePgn(text).split("\n")) {
    if (braceDepth === 0 && HEADER_RE.test(line) && hasMoves) {
      games.push(cur.join("\n").trim());
      cur = [];
      hasMoves = false;
    }
    cur.push(line);
    if (braceDepth === 0 && HEADER_RE.test(line)) continue;
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    }
    if (line.trim()) hasMoves = true;
  }
  const last = cur.join("\n").trim();
  if (last) games.push(last);
  return games;
}

const RESULT_RE = /^(1-0|0-1|1\/2-1\/2|\*)$/;

/** Mainline SAN tokens: drops comments, RAV, NAGs, move numbers and the result. */
function movetextTokens(movetext: string): { sans: string[]; result: string | null } {
  let s = movetext
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/^%[^\n]*/gm, " ");
  // Remove (nested) variations.
  let out = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  s = out;
  const sans: string[] = [];
  let result: string | null = null;
  for (let tok of s.split(/\s+/)) {
    tok = tok.replace(/^\d+\.+/, "");
    if (!tok || /^\$\d+$/.test(tok) || tok === "e.p.") continue;
    if (RESULT_RE.test(tok)) {
      result = tok;
      continue;
    }
    tok = tok.replace(/[!?]+$/, "");
    if (tok) sans.push(tok);
  }
  return { sans, result };
}

function moveLabel(startFen: string, ply: number, san: string): string {
  const [, turn, , , , full] = startFen.split(" ");
  const offset = turn === "b" ? 1 : 0;
  const n = Number(full ?? 1) + Math.floor((ply + offset) / 2);
  return (ply + offset) % 2 === 0 ? `${n}.${san}` : `${n}...${san}`;
}

function timeClassOf(tc: string | undefined): string | null {
  if (!tc || tc === "-" || tc === "?") return null;
  if (tc.includes("/")) return "daily";
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc);
  if (!m) return null;
  const est = Number(m[1]) + 40 * Number(m[2] ?? 0);
  if (est < 180) return "bullet";
  if (est < 480) return "blitz";
  if (est < 1500) return "rapid";
  return "classical";
}

function playedAtOf(h: Record<string, string>): string | null {
  const date = h.UTCDate ?? h.Date;
  const dm = date && /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date);
  if (!dm) return null;
  const time = h.UTCDate && h.UTCTime && /^\d{2}:\d{2}:\d{2}$/.test(h.UTCTime) ? h.UTCTime : "00:00:00";
  const iso = `${dm[1]}-${dm[2]}-${dm[3]}T${time}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

function eloOf(v: string | undefined): number | null {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sourceFromHeaders(h: Record<string, string>): {
  source: GameSource;
  sourceId: string | null;
} {
  const li = /lichess\.org\/([A-Za-z0-9]{8})/.exec(h.Site ?? "");
  if (li) return { source: "lichess", sourceId: li[1]! };
  const cc = /chess\.com\/(?:game\/(live|daily)|(live|daily)\/game)\/(\d+)/.exec(
    `${h.Link ?? ""} ${h.Site ?? ""}`
  );
  if (cc) return { source: "chesscom", sourceId: `${cc[1] ?? cc[2]}/${cc[3]}` };
  return { source: "pgn", sourceId: null };
}

const OK_VARIANTS = new Set(["standard", "from position", "fromposition", "chess"]);

/** Parse and validate ONE game with chess.js. Sync, so the server can reuse it. */
export function parseGamePgn(text: string): ParseResult {
  const headers: Record<string, string> = {};
  const moveLines: string[] = [];
  let inMoves = false;
  for (const line of normalizePgn(text).split("\n")) {
    const m = inMoves ? null : HEADER_RE.exec(line);
    if (m) headers[m[1]!] = m[2]!.replace(/\\(["\\])/g, "$1");
    else {
      moveLines.push(line);
      if (line.trim()) inMoves = true;
    }
  }

  const variant = headers.Variant?.trim();
  if (variant && !OK_VARIANTS.has(variant.toLowerCase())) {
    return { ok: false, message: `no soportada (variante ${variant})` };
  }

  let chess: Chess;
  try {
    chess = new Chess(headers.FEN ? headers.FEN.trim() : DEFAULT_POSITION);
  } catch {
    return { ok: false, message: "la posición inicial [FEN] no es válida" };
  }
  const startFen = chess.fen();

  const { sans, result } = movetextTokens(moveLines.join("\n"));
  const movesUci: string[] = [];
  const movesSan: string[] = [];
  for (const [i, raw] of sans.entries()) {
    const san = raw.replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O");
    try {
      const mv = chess.move(san);
      movesUci.push(mv.lan);
      movesSan.push(mv.san);
    } catch {
      return { ok: false, message: `jugada ilegal en ${moveLabel(startFen, i, raw)}` };
    }
  }
  if (movesUci.length < 2) {
    return { ok: false, message: "no soportada (menos de 2 jugadas)" };
  }

  const { source, sourceId } = sourceFromHeaders(headers);
  const opening =
    headers.Opening ??
    (headers.ECOUrl ? decodeURIComponent(headers.ECOUrl.split("/").pop() ?? "").replace(/-/g, " ") : "");
  const headerResult = headers.Result;
  return {
    ok: true,
    game: {
      source,
      sourceId,
      pgn: normalizePgn(text),
      white: headers.White?.trim() || "?",
      black: headers.Black?.trim() || "?",
      whiteElo: eloOf(headers.WhiteElo),
      blackElo: eloOf(headers.BlackElo),
      result: headerResult && RESULT_RE.test(headerResult) ? headerResult : (result ?? "*"),
      timeClass: timeClassOf(headers.TimeControl),
      playedAt: playedAtOf(headers),
      startFen,
      movesUci,
      movesSan,
      headers,
      openingName: opening || null,
    },
  };
}

/** sha-256 (Web Crypto) of the moves + White, Black and Date headers, hex. */
export async function pgnHash(g: ParsedPgnGame): Promise<string> {
  const data = new TextEncoder().encode(
    JSON.stringify([g.movesUci.join(" "), g.headers.White ?? "", g.headers.Black ?? "", g.headers.Date ?? ""])
  );
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function toParsedGame(g: ParsedPgnGame, userColor: Color | null = null): Promise<ParsedGame> {
  const { headers: _h, openingName: _o, ...rest } = g;
  return { ...rest, sourceId: g.sourceId ?? (await pgnHash(g)), userColor };
}

/**
 * Parse pasted PGN text with one or more games.
 * ASYNC (the sha-256 for `source = pgn` uses Web Crypto).
 * `errors[].index` is the 1-based game number; 0 = the whole input (limits).
 */
export async function parsePgnText(
  text: string
): Promise<{ games: ParsedGame[]; errors: { index: number; message: string }[] }> {
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    return { games: [], errors: [{ index: 0, message: "El texto pesa más de 1 MB. Divide el PGN e impórtalo por partes." }] };
  }
  const chunks = splitPgnGames(text);
  if (chunks.length === 0) {
    return { games: [], errors: [{ index: 0, message: "No encontramos ninguna partida en el texto." }] };
  }
  if (chunks.length > MAX_GAMES) {
    return { games: [], errors: [{ index: 0, message: `El texto tiene ${chunks.length} partidas; el máximo es ${MAX_GAMES} por envío.` }] };
  }
  const games: ParsedGame[] = [];
  const errors: { index: number; message: string }[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const r = parseGamePgn(chunk);
    if (r.ok) games.push(await toParsedGame(r.game));
    else errors.push({ index: i + 1, message: `Partida ${i + 1}: ${r.message}` });
  }
  return { games, errors };
}

/** Case-insensitive match against the user's registered names (player_names). */
export function detectUserColor(game: Pick<ParsedGame, "white" | "black">, names: string[]): Color | null {
  const set = new Set(names.map((n) => n.trim().toLowerCase()));
  if (set.has(game.white.trim().toLowerCase())) return "w";
  if (set.has(game.black.trim().toLowerCase())) return "b";
  return null;
}
