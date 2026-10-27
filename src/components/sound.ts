// Sonidos del tablero (public/sounds, generados con `pnpm build:sounds`).
import { Chess } from "chess.js";

export type Sound = "move" | "capture" | "check" | "castle" | "promote" | "illegal";

const KEY = "cpc:sound";
const cache = new Map<Sound, HTMLAudioElement>();

export const soundOn = () => typeof localStorage === "undefined" || localStorage.getItem(KEY) !== "off";
export const setSoundOn = (on: boolean) => localStorage.setItem(KEY, on ? "on" : "off");

export function playSound(s: Sound) {
  if (!soundOn()) return;
  let a = cache.get(s);
  if (!a) {
    a = new Audio(`/sounds/${s}.wav`);
    cache.set(s, a);
  }
  a.currentTime = 0;
  // Sin un gesto previo del usuario el navegador rechaza el play; se ignora.
  void a.play().catch(() => undefined);
}

/** Sonido de una jugada por su SAN; el jaque manda sobre captura y coronación. */
export function sanSound(san: string): Sound {
  if (/[+#]/.test(san)) return "check";
  if (san.includes("=")) return "promote";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}

/** Sonido de la jugada from→to que lleva de `prev` a `fen`; null si no es esa jugada (p. ej. al retroceder o saltar). */
export function moveSound(prev: string, from: string, to: string, fen: string): Sound | null {
  const board = fen.split(" ")[0];
  let c: Chess;
  try {
    c = new Chess(prev);
  } catch {
    return null;
  }
  for (const m of c.moves({ verbose: true })) {
    if (m.from !== from || m.to !== to) continue;
    const after = new Chess(prev);
    after.move(m);
    if (after.fen().split(" ")[0] === board) return sanSound(m.san);
  }
  return null;
}
