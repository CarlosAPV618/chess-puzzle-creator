// Contrato compartido entre motor, clasificador, servidor y UI (design D3, D4, D8).
// Todas las evaluaciones van desde el punto de vista de BLANCAS.

export type Color = "w" | "b";

/** cp o mate, positivo = a favor de blancas. `mate: 0` = jaque mate en el tablero (gana quien NO mueve). */
export type Eval = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

export type EngineLine = { uci: string; eval: Eval };

/** Una por posición: N jugadas + 1 (incluye la final). */
export type PositionAnalysis = {
  eval: Eval;
  best?: EngineLine;
  second?: EngineLine;
  pv: string[]; // UCI, máx 8
};

export const CLASSIFICATIONS = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "forced",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Una por jugada (N). */
export type MoveAnalysis = {
  class: Classification;
  epLoss: number;
  /** Presente si la jugada hecha es Brillante verificada (D4b). */
  brilliant?: { exerciseEligible: boolean };
  /** Presente si había una Brillante verificada (la del motor) y no se jugó. */
  brilliantMissed?: { uci: string; exerciseEligible: boolean };
};

export type GameAnalysis = {
  depth: number;
  engine: string; // "sf19-lite"
  classifierVersion: number;
  positions: PositionAnalysis[];
  moves: MoveAnalysis[];
  accuracyWhite: number;
  accuracyBlack: number;
};

export type GameSource = "pgn" | "lichess" | "chesscom";

/** Partida parseada en el cliente, lista para importar/analizar. */
export type ParsedGame = {
  source: GameSource;
  sourceId: string;
  pgn: string;
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: string;
  timeClass: string | null;
  playedAt: string | null; // ISO
  startFen: string; // FEN inicial (estándar o [FEN])
  movesUci: string[];
  movesSan: string[];
  userColor: Color | null;
};

export type ExerciseKind = "mistake" | "brilliant";
export type ExerciseSide = "me" | "opponent" | null;
export type Phase = "opening" | "middlegame" | "endgame";
