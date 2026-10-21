// Full-game analysis (design D3, D4, D4b): engine I/O only; decisions live in
// src/lib/classify (classifyGame, verifyBrilliant, pickCandidates), which are unit-tested.
import { CLASSIFIER_VERSION, accuracy, classifyGame, type BrilliantCandidate } from "../classify";
import { VERIFY_DEPTH, VERIFY_MULTIPV, pickCandidates, verifyBrilliant } from "../classify/verify";
import type { Color, GameAnalysis, MoveAnalysis, PositionAnalysis } from "../types";
import { Engine } from "./engine";
import { replay } from "./uci";

export type AnalyzeGameInput = { startFen: string; movesUci: string[]; userColor: Color | null };

export type AnalyzeGameOptions = {
  depth: number;
  /**
   * `total` is N+1 while positions are analysed; during the Brilliant
   * verification it grows to N+1+candidates.
   */
  onProgress?: (done: number, total: number) => void;
  /** Partial results: called as each position is analysed. */
  onPosition?: (index: number, position: PositionAnalysis) => void;
  /** Reuse an engine (not terminated); otherwise one is created and terminated. */
  engine?: Engine;
};

async function wakeLock(): Promise<{ release(): Promise<void> } | null> {
  try {
    return (await (globalThis.navigator as Navigator | undefined)?.wakeLock?.request("screen")) ?? null;
  } catch {
    return null;
  }
}

export async function analyzeGame(
  input: AnalyzeGameInput,
  opts: AnalyzeGameOptions,
  signal?: AbortSignal,
): Promise<GameAnalysis> {
  const { startFen, movesUci } = input;
  const engine = opts.engine ?? (await Engine.create());
  const lock = await wakeLock();
  try {
    const total = movesUci.length + 1;
    const positions: PositionAnalysis[] = [];
    for (let i = 0; i < total; i++) {
      const r = await engine.analyze({ startFen, moves: movesUci.slice(0, i), depth: opts.depth, multipv: 2 }, signal);
      const pos: PositionAnalysis = { eval: r.eval, pv: r.pv.slice(0, 8) };
      if (r.lines[0]) pos.best = r.lines[0];
      if (r.lines[1]) pos.second = r.lines[1];
      positions.push(pos);
      opts.onPosition?.(i, pos);
      opts.onProgress?.(i + 1, total);
    }

    const { moves, candidates } = classifyGame({ ...input, positions });
    const picked = pickCandidates(candidates, input.userColor);
    // Verification depth follows the preset (Rapido 12 -> 16, Normal 16 -> 20, Profundo 22): a fixed 22 made
    // the tail of a quick analysis take longer than all of its positions.
    const verifyDepth = Math.min(VERIFY_DEPTH, opts.depth + 4);
    // Announce the candidates up front so the bar does not sit at 100% during the first deep search.
    if (picked.length) opts.onProgress?.(total, total + picked.length);
    for (const [k, c] of picked.entries()) {
      applyVerdict(moves, c, await verify(engine, input, positions, c, verifyDepth, signal));
      opts.onProgress?.(total + k + 1, total + picked.length);
    }

    const acc = accuracy(moves, startFen);
    return {
      depth: opts.depth,
      engine: engine.flavor,
      classifierVersion: CLASSIFIER_VERSION,
      positions,
      moves,
      accuracyWhite: acc.white,
      accuracyBlack: acc.black,
    };
  } finally {
    void lock?.release().catch(() => undefined);
    if (!opts.engine) engine.terminate();
  }
}

async function verify(
  engine: Engine,
  input: AnalyzeGameInput,
  positions: PositionAnalysis[],
  c: BrilliantCandidate,
  depth: number,
  signal?: AbortSignal,
): Promise<{ exerciseEligible: boolean } | null> {
  const before = input.movesUci.slice(0, c.ply);
  const shallowBest = positions[c.ply]?.best?.eval;
  if (!shallowBest) return null;
  const deep = await engine.analyze(
    { startFen: input.startFen, moves: before, depth, multipv: VERIFY_MULTIPV },
    signal,
  );
  const base = { fen: replay(input.startFen, before).fen(), uci: c.uci, shallowBest, deep };
  let out = verifyBrilliant(base);
  if (out.status === "needsCapture") {
    const r = await engine.analyze(
      {
        startFen: input.startFen,
        moves: [...before, c.uci],
        depth: depth - 2,
        multipv: 1,
        searchmoves: out.captures,
      },
      signal,
    );
    out = verifyBrilliant({ ...base, captureEval: r.eval });
  }
  return out.status === "confirmed" ? { exerciseEligible: out.exerciseEligible } : null;
}

/** Marks a verified candidate on its move. */
function applyVerdict(
  moves: MoveAnalysis[],
  c: BrilliantCandidate,
  verdict: { exerciseEligible: boolean } | null,
): void {
  const m = moves[c.ply];
  if (!m || !verdict) return;
  if (c.played) {
    m.class = "brilliant";
    m.brilliant = { exerciseEligible: verdict.exerciseEligible };
  } else {
    m.brilliantMissed = { uci: c.uci, exerciseEligible: verdict.exerciseEligible };
  }
}
