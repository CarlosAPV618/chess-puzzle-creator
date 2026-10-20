// analysis.save server side (D8 validation + D9 exercise generation).
import { TRPCError } from "@trpc/server";
import { Chess } from "chess.js";
import { and, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { phaseOf } from "~/lib/classify";
import { acceptsSecond } from "~/lib/engine/check-move";

import {
  CLASSIFICATIONS,
  type Color,
  type ExerciseKind,
  type GameAnalysis,
} from "~/lib/types";
import type { Db } from "~/server/db";
import { analyses, exercises, games } from "~/server/db/schema";

export const MAX_ANALYSIS_BYTES = 200_000;

const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
const evalSchema = z.union([
  z.object({ cp: z.number().finite().min(-100_000).max(100_000) }),
  z.object({ mate: z.number().int().min(-500).max(500) }),
]);
const line = z.object({ uci, eval: evalSchema });

export const gameAnalysisSchema = z.object({
  depth: z.number().int().min(1).max(99),
  engine: z.string().min(1).max(40),
  classifierVersion: z.number().int().min(0).max(1_000_000),
  positions: z
    .array(z.object({ eval: evalSchema, best: line.optional(), second: line.optional(), pv: z.array(uci).max(8) }))
    .max(2001),
  moves: z
    .array(
      z.object({
        class: z.enum(CLASSIFICATIONS),
        epLoss: z.number().finite().min(0).max(1),
        brilliant: z.object({ exerciseEligible: z.boolean() }).optional(),
        brilliantMissed: z.object({ uci, exerciseEligible: z.boolean() }).optional(),
      })
    )
    .max(2000),
  accuracyWhite: z.number().finite().min(0).max(100),
  accuracyBlack: z.number().finite().min(0).max(100),
});

/** Size is measured on the raw input, before Zod strips unknown keys. */
export const gameAnalysisInput = z
  .unknown()
  .refine((v) => JSON.stringify(v ?? null).length < MAX_ANALYSIS_BYTES, {
    message: "El análisis pesa más de 200 KB",
  })
  .pipe(gameAnalysisSchema);

function tryMove(chess: Chess, u: string): boolean {
  try {
    const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (m.lan === u) return true;
    chess.undo();
    return false;
  } catch {
    return false;
  }
}

/** FENs before each move plus the final one (N+1). Moves come from the server-side PGN replay. */
export function replayFens(startFen: string, movesUci: string[]): string[] {
  const chess = new Chess(startFen);
  const fens = [chess.fen()];
  for (const u of movesUci) {
    if (!tryMove(chess, u)) throw new Error(`stored game has an illegal move ${u}`);
    fens.push(chess.fen());
  }
  return fens;
}

/** Returns a Spanish error message or null. Checks sizes and that every UCI is legal where it is used. */
export function validateAnalysis(fens: string[], movesUci: string[], a: GameAnalysis): string | null {
  const n = movesUci.length;
  if (a.positions.length !== n + 1) return `Se esperaban ${n + 1} posiciones y llegaron ${a.positions.length}`;
  if (a.moves.length !== n) return `Se esperaban ${n} jugadas y llegaron ${a.moves.length}`;
  for (let i = 0; i <= n; i++) {
    const fen = fens[i]!;
    const p = a.positions[i]!;
    for (const l of [p.best, p.second]) {
      if (l && !tryMove(new Chess(fen), l.uci)) return `Jugada ilegal ${l.uci} en la posición ${i}`;
    }
    const pvBoard = new Chess(fen);
    for (const u of p.pv) if (!tryMove(pvBoard, u)) return `Línea ilegal (${u}) en la posición ${i}`;
    const bm = a.moves[i]?.brilliantMissed;
    if (bm && !tryMove(new Chess(fen), bm.uci)) return `Jugada ilegal ${bm.uci} en la posición ${i}`;
  }
  return null;
}

export type ExerciseRow = typeof exercises.$inferInsert;

/**
 * Exercise kinds (design D3), one per ply with this priority: missed brilliant -> miss,
 * played brilliant -> brilliant, blunder -> mistake, classified Miss -> miss.
 */
export function buildExercises(
  game: { id: string; userId: string; userColor: Color | null; movesUci: string[] },
  fens: string[],
  a: GameAnalysis
): ExerciseRow[] {
  const rows: ExerciseRow[] = [];
  a.moves.forEach((m, ply) => {
    const pos = a.positions[ply]!;
    const fen = fens[ply]!;
    const color = fen.split(" ")[1] as Color;
    const playedUci = game.movesUci[ply]!;
    let kind: ExerciseKind;
    let bestUci: string;
    let acceptedUci: string[];
    let brilliantPlayed: boolean | null = null;

    if (m.brilliantMissed?.exerciseEligible) {
      // Also covers "blunder + missed brilliant": one miss exercise with the brilliant as the only answer.
      kind = "miss";
      bestUci = m.brilliantMissed.uci;
      acceptedUci = [bestUci];
      brilliantPlayed = false;
    } else if (m.brilliant?.exerciseEligible) {
      kind = "brilliant";
      bestUci = playedUci;
      acceptedUci = [playedUci];
      brilliantPlayed = true;
    } else if ((m.class === "blunder" || m.class === "miss") && pos.best && pos.best.uci !== playedUci) {
      kind = m.class === "blunder" ? "mistake" : "miss";
      bestUci = pos.best.uci;
      acceptedUci = [bestUci];
      const s = pos.second;
      if (s && s.uci !== playedUci && s.uci !== bestUci && acceptsSecond(pos.best, s, color, kind === "miss")) {
        acceptedUci.push(s.uci);
      }
    } else return;

    rows.push({
      userId: game.userId,
      gameId: game.id,
      ply,
      color,
      fen,
      playedUci,
      kind,
      side: game.userColor ? (color === game.userColor ? "me" : "opponent") : null,
      bestUci,
      acceptedUci,
      refutationPv: a.positions[ply + 1]?.pv ?? [],
      cls: m.class,
      epLoss: m.epLoss,
      phase: phaseOf(fen, ply),
      brilliantPlayed,
    });
  });
  return rows;
}

function countsByColor(fens: string[], a: GameAnalysis) {
  const c = { mistakesWhite: 0, mistakesBlack: 0, brilliantsWhite: 0, brilliantsBlack: 0 };
  a.moves.forEach((m, ply) => {
    const white = fens[ply]!.split(" ")[1] === "w";
    if (m.class === "mistake" || m.class === "blunder" || m.class === "miss") {
      if (white) c.mistakesWhite++;
      else c.mistakesBlack++;
    } else if (m.class === "brilliant") {
      if (white) c.brilliantsWhite++;
      else c.brilliantsBlack++;
    }
  });
  return c;
}

/** Board, side to move, castling and en passant: the clocks don't change the exercise. */
export const positionKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** Validate, replace the analysis and sync exercises in ONE transaction. */
export async function saveAnalysis(
  db: Db,
  userId: string,
  gameId: string,
  a: GameAnalysis
): Promise<{ exercisesCreated: number }> {
  const [game] = await db
    .select({ id: games.id, userId: games.userId, userColor: games.userColor, startFen: games.startFen, movesUci: games.movesUci })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.userId, userId)));
  if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "No encontramos esa partida" });

  const fens = replayFens(game.startFen, game.movesUci);
  const err = validateAnalysis(fens, game.movesUci, a);
  if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });

  const built = buildExercises(game, fens, a);
  const analysisRow = {
    gameId,
    depth: a.depth,
    engine: a.engine,
    classifierVersion: a.classifierVersion,
    positions: a.positions,
    moves: a.moves,
    accuracyWhite: a.accuracyWhite,
    accuracyBlack: a.accuracyBlack,
    ...countsByColor(fens, a),
    createdAt: new Date(),
  };

  return db.transaction(async (tx) => {
    // One exercise per position per user: a position already active in another game (same game
    // imported twice, repeated opening) or repeated within this game is not duplicated.
    const others = await tx
      .select({ fen: exercises.fen })
      .from(exercises)
      .where(and(eq(exercises.userId, userId), ne(exercises.gameId, gameId), isNull(exercises.archivedAt)));
    const seen = new Set(others.map((o) => positionKey(o.fen)));
    const rows = built.filter((r) => {
      const k = positionKey(r.fen);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    await tx.insert(analyses).values(analysisRow).onConflictDoUpdate({ target: analyses.gameId, set: analysisRow });

    let created = 0;
    if (rows.length > 0) {
      const changed = sql`(${exercises.kind} <> excluded.kind or ${exercises.bestUci} <> excluded.best_uci)`;
      const res = await tx
        .insert(exercises)
        .values(rows)
        .onConflictDoUpdate({
          target: [exercises.gameId, exercises.ply],
          set: {
            // Answer changed -> progress restarts; attempt history is kept (D9).
            box: sql`case when ${changed} then 0 else ${exercises.box} end`,
            dueAt: sql`case when ${changed} then now() else ${exercises.dueAt} end`,
            color: sql`excluded.color`,
            fen: sql`excluded.fen`,
            playedUci: sql`excluded.played_uci`,
            kind: sql`excluded.kind`,
            side: sql`excluded.side`,
            bestUci: sql`excluded.best_uci`,
            acceptedUci: sql`excluded.accepted_uci`,
            refutationPv: sql`excluded.refutation_pv`,
            cls: sql`excluded.class`,
            epLoss: sql`excluded.ep_loss`,
            phase: sql`excluded.phase`,
            brilliantPlayed: sql`excluded.brilliant_played`,
            archivedAt: null,
            updatedAt: sql`now()`,
          },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      created = res.filter((r) => r.inserted).length;
    }

    // No longer qualifying -> archived, never deleted.
    await tx
      .update(exercises)
      .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(exercises.gameId, gameId),
          isNull(exercises.archivedAt),
          rows.length > 0 ? notInArray(exercises.ply, rows.map((r) => r.ply)) : undefined
        )
      );
    return { exercisesCreated: created };
  });
}
