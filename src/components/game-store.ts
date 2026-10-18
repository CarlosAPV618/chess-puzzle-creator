// Partida en memoria para /analizar y guardado pendiente tras el login (D11, sessionStorage).
import type { GameAnalysis, ParsedGame } from "~/lib/types";

const GAME = "cpc:game";
const PENDING = "cpc:pending";

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const setCurrentGame = (g: ParsedGame) => sessionStorage.setItem(GAME, JSON.stringify(g));
export const getCurrentGame = () => read<ParsedGame>(GAME);

export type Pending = { game: ParsedGame; analysis: GameAnalysis };
export const setPending = (p: Pending) => sessionStorage.setItem(PENDING, JSON.stringify(p));
export const getPending = () => read<Pending>(PENDING);
export const clearPending = () => sessionStorage.removeItem(PENDING);
