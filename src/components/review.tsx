"use client";

import { GraduationCap, Lightbulb, Play, RefreshCw, RotateCcw, Target, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Arrow } from "react-chessboard";
import type { Color, Eval, GameAnalysis } from "~/lib/types";
import { acceptedMoves, getEngine, judgeMove } from "~/hooks/use-engine";
import { Board } from "./board";
import { applyUci, formatEval, prettySan, replay, sanOf, turnOf, uciFrom, uciTo } from "./chess";
import { CLASS_META, ClassIcon, RETRY_CLASSES } from "./class-icon";
import { EngineNotice } from "./engine-notice";
import { EvalBar } from "./eval-bar";
import { EvalGraph } from "./eval-graph";
import { MoveList } from "./move-list";
import { NavBar } from "./nav-bar";
import { Summary } from "./summary";

export type ReviewGame = {
  startFen: string;
  movesUci: string[];
  white: string;
  black: string;
  whiteElo?: number | null;
  blackElo?: number | null;
  result?: string;
  userColor: Color | null;
};

const ARROW_BEST = "rgba(127, 178, 74, 0.9)";
const ARROW_LINE = "rgba(91, 143, 196, 0.85)";
const NO_ARROW = new Set(["best", "brilliant", "great", "book", "forced"]);
const CLASS_PHRASE: Record<GameAnalysis["moves"][number]["class"], string> = {
  brilliant: "es brillante",
  great: "es una gran jugada",
  best: "es la mejor jugada",
  excellent: "es excelente",
  good: "es buena",
  book: "es teoría",
  forced: "es forzada",
  inaccuracy: "es una imprecisión",
  mistake: "es un error",
  miss: "es una oportunidad perdida",
  blunder: "es un error grave",
};

/** Intento sobre la posición previa a la jugada `move` (Reintentar o momento clave del repaso). */
type Trial = {
  move: number;
  tried: string | null;
  status: "idle" | "checking" | "correct" | "wrong" | "solution" | "skipped";
  msg?: string;
  hint: boolean;
};

/** results: true acierto, false fallo, null continuó sin repasar. pending: jugada mala mostrada, esperando "Repasar" o "Continuar". */
type ReviewMode = {
  side: Color;
  moments: number[];
  results: Record<number, boolean | null>;
  finished: boolean;
  paused: boolean;
  pending: number | null;
};

export function GameReview({
  game,
  analysis,
  liveEvals,
  toolbar,
}: {
  game: ReviewGame;
  analysis: GameAnalysis | null;
  /** Evals parciales mientras corre el análisis. */
  liveEvals?: Eval[];
  /** Controles de la página (analizar, guardar...). */
  toolbar?: ReactNode;
}) {
  const { fens, sans } = useMemo(() => replay(game.startFen, game.movesUci), [game.startFen, game.movesUci]);
  const N = game.movesUci.length;
  const firstColor = turnOf(game.startFen);
  const colorOf = useCallback((move: number): Color => ((move % 2 === 0) === (firstColor === "w") ? "w" : "b"), [firstColor]);

  const [ply, setPly] = useState(N);
  const [flipped, setFlipped] = useState(false);
  const [variant, setVariant] = useState<{ base: number; moves: string[] } | null>(null);
  const [variantInfo, setVariantInfo] = useState<{ eval?: Eval; best?: string }>({});
  const [trial, setTrial] = useState<Trial | null>(null);
  const [review, setReview] = useState<ReviewMode | null>(null);

  const baseOrientation = game.userColor === "b" ? "black" : "white";
  const orientation = flipped ? (baseOrientation === "white" ? "black" : "white") : baseOrientation;

  const classes = useMemo(() => fens.slice(1).map((_, i) => analysis?.moves[i]?.class), [fens, analysis]);
  const evals = useMemo(
    () => fens.map((_, i) => analysis?.positions[i]?.eval ?? liveEvals?.[i]),
    [fens, analysis, liveEvals],
  );

  // Posición de la variante.
  const variantFens = useMemo(() => {
    if (!variant) return [];
    const out: string[] = [];
    let f = fens[variant.base]!;
    for (const m of variant.moves) {
      f = applyUci(f, m) ?? f;
      out.push(f);
    }
    return out;
  }, [variant, fens]);

  // Evaluación de la variante con el motor interactivo.
  useEffect(() => {
    if (!variant) return;
    const c = new AbortController();
    setVariantInfo({});
    void getEngine()
      .then((engine) =>
        engine.analyze(
          { startFen: game.startFen, moves: [...game.movesUci.slice(0, variant.base), ...variant.moves], depth: 14, multipv: 1 },
          c.signal,
        ),
      )
      .then((r) => !c.signal.aborted && setVariantInfo({ eval: r.eval, best: r.lines[0]?.uci }))
      .catch(() => undefined);
    return () => c.abort();
  }, [variant, game.startFen, game.movesUci]);

  // Navegar a mano durante el repaso lo pausa; "Continuar repaso" retoma desde ahí.
  const goto = useCallback(
    (p: number) => {
      setVariant(null);
      setTrial(null);
      setReview((r) => (r && !r.finished ? { ...r, paused: true, pending: null } : r));
      setPly(Math.max(0, Math.min(N, p)));
    },
    [N],
  );

  // ---- Intentos (Reintentar / repaso) ----
  const startTrial = useCallback((move: number) => {
    setVariant(null);
    setPly(move);
    setTrial({ move, tried: null, status: "idle", hint: false });
  }, []);

  const pos = trial ? analysis?.positions[trial.move] : undefined;
  const missedBrilliant = trial ? analysis?.moves[trial.move]?.brilliantMissed?.uci : undefined;

  async function attempt(uci: string) {
    if (!trial || !analysis || !pos?.best) return;
    const fen = fens[trial.move]!;
    setTrial({ ...trial, tried: uci, status: "checking" });
    try {
      const v = await judgeMove({
        startFen: game.startFen,
        movesBefore: game.movesUci.slice(0, trial.move),
        uci,
        bestUci: pos.best.uci,
        accepted: [...acceptedMoves(pos, fen), ...(missedBrilliant ? [missedBrilliant] : [])],
      });
      const bestSan = prettySan(sanOf(fen, pos.best.uci));
      const msg = !v.correct
        ? "No es la mejor. Intenta otra vez."
        : uci === missedBrilliant
          ? "¡Brillante!"
          : v.exact
            ? `¡Mejor! ${formatEval(pos.best.eval)}`
            : `Buena jugada; la del motor era ${bestSan}`;
      setTrial((t) => t && { ...t, status: v.correct ? "correct" : "wrong", msg });
    } catch {
      setTrial((t) => t && { ...t, status: "wrong", msg: "No se pudo comprobar la jugada" });
    }
  }

  function finishTrial(correct: boolean) {
    if (!trial) return;
    const move = trial.move;
    setTrial(null);
    if (review) {
      setReview({ ...review, pending: null, results: { ...review.results, [move]: correct } });
    }
    setPly(move + 1);
  }

  // ---- Repasar partida (D9b) ----
  function startReview(side: Color) {
    if (!analysis) return;
    const moments = analysis.moves
      .map((m, i) => (colorOf(i) === side && (RETRY_CLASSES.includes(m.class) || m.brilliantMissed) ? i : -1))
      .filter((i) => i >= 0);
    setFlipped((side === "b") !== (baseOrientation === "black"));
    setVariant(null);
    setTrial(null);
    setReview({ side, moments, results: {}, finished: false, paused: false, pending: null });
    setPly(0);
  }

  useEffect(() => {
    if (!review || review.finished || review.paused || review.pending !== null || trial || variant) return;
    // Primero se muestra la jugada mala (ply = momento + 1) y se espera "Repasar" o "Continuar".
    const m = ply - 1;
    if (m >= 0 && review.moments.includes(m) && !(m in review.results)) {
      setReview({ ...review, pending: m });
      return;
    }
    if (ply >= N) {
      setReview({ ...review, finished: true });
      return;
    }
    const t = setTimeout(() => setPly((p) => Math.min(N, p + 1)), 650);
    return () => clearTimeout(t);
  }, [review, trial, variant, ply, N]);

  // ---- Lo que se muestra ----
  const inVariant = !!variant && variantFens.length > 0;
  const trialFen = trial ? (trial.tried && trial.status !== "idle" ? applyUci(fens[trial.move]!, trial.tried) : null) ?? fens[trial.move]! : null;
  const fen = trialFen ?? (inVariant ? variantFens[variantFens.length - 1]! : fens[ply]!);

  const lastMoveUci = trial
    ? trial.tried && trial.status !== "idle"
      ? trial.tried
      : game.movesUci[trial.move - 1]
    : inVariant
      ? variant.moves[variant.moves.length - 1]
      : game.movesUci[ply - 1];
  const lastMove = lastMoveUci ? { from: uciFrom(lastMoveUci), to: uciTo(lastMoveUci) } : null;

  const prevMove = ply - 1;
  const prevAnalysis = !trial && !inVariant && prevMove >= 0 ? analysis?.moves[prevMove] : undefined;
  const prevBest = !trial && !inVariant && prevMove >= 0 ? analysis?.positions[prevMove]?.best : undefined;

  const arrows: Arrow[] = [];
  if (trial && pos?.best && trial.status === "solution") {
    arrows.push({ startSquare: uciFrom(pos.best.uci), endSquare: uciTo(pos.best.uci), color: ARROW_BEST });
  } else if (inVariant && variantInfo.best) {
    arrows.push({ startSquare: uciFrom(variantInfo.best), endSquare: uciTo(variantInfo.best), color: ARROW_LINE });
  } else if (prevAnalysis && prevBest && !NO_ARROW.has(prevAnalysis.class) && prevBest.uci !== game.movesUci[prevMove]) {
    arrows.push({ startSquare: uciFrom(prevBest.uci), endSquare: uciTo(prevBest.uci), color: ARROW_BEST });
  }

  const badge = trial
    ? trial.tried && lastMove && (trial.status === "correct" || trial.status === "wrong")
      ? {
          square: lastMove.to,
          cls: trial.status === "wrong" ? ("mistake" as const) : trial.tried === pos?.best?.uci ? ("best" as const) : ("excellent" as const),
        }
      : null
    : prevAnalysis && lastMove && !inVariant
      ? { square: lastMove.to, cls: prevAnalysis.class }
      : null;

  const shownEval = trial ? pos?.eval : inVariant ? variantInfo.eval : evals[ply];

  const canMove = trial ? trial.status === "idle" : !review;
  function onMove(uci: string) {
    if (trial) return void attempt(uci);
    if (!variant && game.movesUci[ply] === uci) return setPly(ply + 1);
    setVariant(variant ? { ...variant, moves: [...variant.moves, uci] } : { base: ply, moves: [uci] });
  }

  // Rueda del mouse sobre el tablero: abajo avanza, arriba retrocede (como chess.com y Lichess).
  const boardRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<(d: number) => void>(() => undefined);
  stepRef.current = (d) => {
    if (!trial) goto(ply + d);
  };
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 40) return;
      stepRef.current(acc > 0 ? 1 : -1);
      acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const topIsWhite = orientation === "black";
  const player = (white: boolean) => (
    <PlayerBar
      name={white ? game.white : game.black}
      elo={white ? game.whiteElo : game.blackElo}
      white={white}
      accuracy={analysis ? (white ? analysis.accuracyWhite : analysis.accuracyBlack) : undefined}
    />
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-3 pb-24 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:pb-6">
      {/* Columna del tablero */}
      <div className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-13rem))] flex-col gap-1.5 lg:max-w-[min(100%,calc(100dvh-9rem))]">
        {player(topIsWhite)}
        <div ref={boardRef} className="flex gap-1.5">
          <EvalBar value={shownEval} fen={fen} orientation={orientation} />
          <div className="min-w-0 flex-1">
            <Board
              id="review"
              fen={fen}
              orientation={orientation}
              onMove={canMove ? onMove : undefined}
              arrows={arrows}
              lastMove={lastMove}
              badge={badge}
              highlight={trial?.hint && pos?.best ? [uciFrom(pos.best.uci)] : []}
            />
          </div>
        </div>
        {player(!topIsWhite)}
      </div>

      {/* Panel */}
      <div className="flex min-w-0 flex-col gap-3">
        {/* Sin análisis, los controles (profundidad + Analizar) van primero para que se vean sin bajar. */}
        {!analysis && toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}
        {trial ? (
          <TrialPanel
            trial={trial}
            review={!!review}
            prompt={
              missedBrilliant
                ? "Había una jugada brillante. Encuéntrala."
                : `Encuentra una jugada mejor que ${prettySan(sans[trial.move] ?? "")}`
            }
            onRetry={() => setTrial({ ...trial, tried: null, status: "idle", msg: undefined })}
            onHint={() => setTrial({ ...trial, hint: true })}
            onSolution={() =>
              setTrial({
                ...trial,
                tried: null,
                status: "solution",
                msg: pos?.best ? `La mejor era ${prettySan(sanOf(fens[trial.move]!, pos.best.uci))}` : undefined,
              })
            }
            onSkip={() => setTrial({ ...trial, status: "skipped" })}
            onDone={finishTrial}
          />
        ) : review?.finished ? (
          <div className="rounded-lg bg-panel p-4 text-center">
            {review.moments.length === 0 ? (
              <>
                <p className="text-lg font-bold">
                  Sin jugadas que repasar de {review.side === "w" ? game.white : game.black}
                </p>
                <button
                  type="button"
                  onClick={() => startReview(review.side === "w" ? "b" : "w")}
                  className="btn-primary mt-3 w-full"
                >
                  Repasar las de {review.side === "w" ? game.black : game.white}
                </button>
              </>
            ) : (
              <p className="text-lg font-bold">
                Acertaste {Object.values(review.results).filter((r) => r === true).length} de {review.moments.length}
              </p>
            )}
            <button
              type="button"
              onClick={() => setReview(null)}
              className={`${review.moments.length === 0 ? "btn-secondary" : "btn-primary"} mt-2 w-full`}
            >
              Terminar repaso
            </button>
          </div>
        ) : review && review.pending !== null ? (
          <PendingPanel
            san={sans[review.pending]!}
            cls={analysis?.moves[review.pending]?.class ?? "mistake"}
            who={review.side === game.userColor ? "Tu jugada" : `Jugada de ${review.side === "w" ? game.white : game.black}`}
            brilliant={!!analysis?.moves[review.pending]?.brilliantMissed}
            onReview={() => {
              const m = review.pending!;
              setReview({ ...review, pending: null });
              startTrial(m);
            }}
            onContinue={() => setReview({ ...review, pending: null, results: { ...review.results, [review.pending!]: null } })}
          />
        ) : inVariant ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-panel p-3">
            <span className="text-sm text-muted">
              Variante · <span className="font-mono text-fg">{formatEval(variantInfo.eval, fen)}</span>
            </span>
            <button type="button" onClick={() => setVariant(null)} className="btn-secondary">
              <Undo2 className="size-4" /> Volver a la partida
            </button>
          </div>
        ) : (
          prevAnalysis && (
            <MoveVerdict
              san={sans[prevMove]!}
              cls={prevAnalysis.class}
              bestSan={prevBest && prevBest.uci !== game.movesUci[prevMove] ? sanOf(fens[prevMove]!, prevBest.uci) : null}
              evalText={formatEval(evals[ply], fen)}
              onRetry={RETRY_CLASSES.includes(prevAnalysis.class) && !review ? () => startTrial(prevMove) : undefined}
            />
          )
        )}

        {review?.paused && !review.finished && !trial && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-brand/10 p-3 ring-2 ring-brand/70">
            <span className="text-sm font-semibold">Repaso en pausa</span>
            <button type="button" onClick={() => setReview({ ...review, paused: false })} className="btn-primary">
              <Play className="size-4" /> Continuar repaso
            </button>
          </div>
        )}

        {(analysis ?? liveEvals?.length) ? <EvalGraph evals={evals} fens={fens} classes={classes} ply={ply} onSelect={goto} /> : null}

        <div className="rounded-lg bg-panel p-1 lg:p-2">
          <MoveList sans={sans} classes={classes} ply={ply} startsWithBlack={firstColor === "b"} startMoveNumber={Number(game.startFen.split(" ")[5] ?? 1)} onSelect={goto} />
        </div>

        <div className="flex flex-wrap gap-2">
          {analysis && toolbar}
          {analysis && !review && (
            <button type="button" onClick={() => startReview(game.userColor ?? (orientation === "black" ? "b" : "w"))} className="btn-secondary">
              <GraduationCap className="size-4" /> Repasar partida
            </button>
          )}
          {review && !review.finished && (
            <button type="button" onClick={() => { setReview(null); setTrial(null); }} className="btn-secondary">
              Salir del repaso
            </button>
          )}
          <button type="button" aria-label="Girar tablero" title="Girar tablero" onClick={() => setFlipped(!flipped)} className="btn-secondary px-3">
            <RefreshCw className="size-4" />
          </button>
        </div>

        {analysis && (
          <Summary analysis={analysis} white={game.white} black={game.black} firstColor={firstColor} />
        )}

        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 md:bottom-0 border-t border-line bg-ink/95 px-3 py-2 backdrop-blur lg:static lg:order-first lg:border-0 lg:bg-transparent lg:p-0">
          <NavBar ply={ply} max={N} onChange={goto} />
        </div>

        <EngineNotice />
      </div>
    </div>
  );
}

function PlayerBar({ name, elo, white, accuracy }: { name: string; elo?: number | null; white: boolean; accuracy?: number }) {
  return (
    <div className="flex min-h-8 items-center gap-2 px-0.5 text-sm">
      <span aria-hidden className={`size-3.5 rounded-sm ring-1 ring-black/40 ${white ? "bg-[#f2f3ee]" : "bg-[#222]"}`} />
      <span className="truncate font-semibold">{name}</span>
      {elo ? <span className="text-muted">({elo})</span> : null}
      {accuracy !== undefined && (
        <span className="ml-auto rounded bg-raised px-1.5 font-mono text-xs text-muted" title="Precisión">
          {accuracy.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function MoveVerdict({
  san,
  cls,
  bestSan,
  evalText,
  onRetry,
}: {
  san: string;
  cls: GameAnalysis["moves"][number]["class"];
  bestSan: string | null;
  evalText: string;
  onRetry?: () => void;
}) {
  const meta = CLASS_META[cls];
  return (
    <div className="flex items-center gap-3 rounded-lg bg-panel p-3">
      <ClassIcon cls={cls} size={32} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {prettySan(san)} <span style={{ color: meta.color }}>{CLASS_PHRASE[cls]}</span>
        </p>
        <p className="truncate text-sm text-muted">
          <span className="font-mono">{evalText}</span>
          {bestSan && <> · Mejor era {prettySan(bestSan)}</>}
        </p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary shrink-0">
          <RotateCcw className="size-4" /> Reintentar
        </button>
      )}
    </div>
  );
}

function TrialPanel({
  trial,
  review,
  prompt,
  onRetry,
  onHint,
  onSolution,
  onSkip,
  onDone,
}: {
  trial: Trial;
  review: boolean;
  prompt: string;
  onRetry: () => void;
  onHint: () => void;
  onSolution: () => void;
  onSkip: () => void;
  onDone: (correct: boolean) => void;
}) {
  const s = trial.status;
  const tone =
    s === "correct" ? "bg-c-best/15 ring-c-best" : s === "wrong" ? "bg-c-blunder/15 ring-c-blunder" : "bg-brand/10 ring-brand";
  return (
    <div className={`rounded-xl p-4 ring-2 ${tone}`} aria-live="polite">
      <p className="flex items-center gap-2 text-lg font-bold">
        {(s === "idle" || s === "checking") && <Target className="size-5 shrink-0 text-brand" />}
        {s === "idle" || s === "checking" ? prompt : (trial.msg ?? "Omitida")}
      </p>
      {s === "checking" && <p className="mt-1 text-sm text-muted">Comprobando…</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {s === "wrong" && (
          <button type="button" onClick={onRetry} className="btn-primary">
            <RotateCcw className="size-4" /> Reintentar
          </button>
        )}
        {(s === "idle" || s === "wrong") && (
          <>
            {!trial.hint && (
              <button type="button" onClick={onHint} className="btn-secondary">
                <Lightbulb className="size-4" /> Pista
              </button>
            )}
            <button type="button" onClick={onSolution} className="btn-secondary">
              Ver solución
            </button>
            {review && (
              <button type="button" onClick={onSkip} className="btn-secondary">
                Omitir
              </button>
            )}
          </>
        )}
        {(s === "correct" || s === "solution" || s === "skipped") && (
          <button type="button" onClick={() => onDone(s === "correct")} className="btn-primary">
            {review ? "Continuar" : "Volver a la partida"}
          </button>
        )}
        {!review && s !== "correct" && s !== "solution" && (
          <button type="button" onClick={() => onDone(false)} className="btn-ghost">
            Volver a la partida
          </button>
        )}
      </div>
    </div>
  );
}

function PendingPanel({
  san,
  cls,
  who,
  brilliant,
  onReview,
  onContinue,
}: {
  san: string;
  cls: GameAnalysis["moves"][number]["class"];
  who: string;
  brilliant: boolean;
  onReview: () => void;
  onContinue: () => void;
}) {
  const meta = CLASS_META[cls];
  return (
    <div className="rounded-xl bg-brand/10 p-4 ring-2 ring-brand" aria-live="polite">
      <div className="flex items-center gap-3">
        <ClassIcon cls={cls} size={36} />
        <div className="min-w-0">
          <p className="text-lg font-bold">
            {prettySan(san)} <span style={{ color: meta.color }}>{CLASS_PHRASE[cls]}</span>
          </p>
          <p className="truncate text-sm text-muted">{who}</p>
        </div>
      </div>
      {brilliant && <p className="mt-1 text-sm text-muted">Aquí había una jugada brillante.</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onReview} className="btn-primary flex-1">
          <Target className="size-4" /> Repasar
        </button>
        <button type="button" onClick={onContinue} className="btn-secondary flex-1">
          Continuar
        </button>
      </div>
    </div>
  );
}
