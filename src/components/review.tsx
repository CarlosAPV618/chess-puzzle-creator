"use client";

import { Eye, GraduationCap, Lightbulb, Play, RefreshCw, RotateCcw, SkipForward, Target, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Arrow } from "react-chessboard";
import type { Color, Eval, GameAnalysis } from "~/lib/types";
import { acceptedMoves, getEngine, judgeMove } from "~/hooks/use-engine";
import { MISS_WIN } from "~/lib/classify";
import { Board } from "./board";
import { applyUci, formatEval, moveLabel, prettySan, replay, sanOf, turnOf, uciFrom, uciTo } from "./chess";
import { CLASS_META, ClassIcon, RETRY_CLASSES } from "./class-icon";
import { EvalBar } from "./eval-bar";
import { EvalGraph } from "./eval-graph";
import { MoveList } from "./move-list";
import { NavBar } from "./nav-bar";
import { playSound } from "./sound";
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
  actions,
  back,
}: {
  game: ReviewGame;
  analysis: GameAnalysis | null;
  /** Evals parciales mientras corre el análisis. */
  liveEvals?: Eval[];
  /** Controles de la página (analizar, guardar, aviso de reanálisis...): arriba sin análisis, debajo del resumen con él. */
  toolbar?: ReactNode;
  /** Botones extra de la fila bajo el tablero, entre Repasar y Girar (p. ej. "Practicar partida"); usan `REVIEW_ROW_BTN`. */
  actions?: ReactNode;
  /** Botón de volver, a la izquierda de la franja de jugadas. */
  back?: ReactNode;
}) {
  const { fens, sans } = useMemo(() => replay(game.startFen, game.movesUci), [game.startFen, game.movesUci]);
  const N = game.movesUci.length;
  const firstColor = turnOf(game.startFen);
  const colorOf = useCallback((move: number): Color => ((move % 2 === 0) === (firstColor === "w") ? "w" : "b"), [firstColor]);

  // Arranca en la primera jugada: así la franja de jugadas ya tiene una activa que deslizar.
  const [ply, setPly] = useState(N > 0 ? 1 : 0);
  const [flipped, setFlipped] = useState(false);
  const [variant, setVariant] = useState<{ base: number; moves: string[] } | null>(null);
  const [variantInfo, setVariantInfo] = useState<{ eval?: Eval; best?: string }>({});
  const [trial, setTrial] = useState<Trial | null>(null);
  const [review, setReview] = useState<ReviewMode | null>(null);
  // Jugada elegida deslizando la franja: no suena, para no saturar al deslizar rápido.
  const [scrubbedPly, setScrubbedPly] = useState<number | null>(null);

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
    const cls = analysis.moves[trial.move]?.class;
    setTrial({ ...trial, tried: uci, status: "checking" });
    try {
      // D1: la jugada de la partida nunca es correcta, y en una Oportunidad perdida la alternativa debe seguir ganando.
      const v = await judgeMove({
        startFen: game.startFen,
        movesBefore: game.movesUci.slice(0, trial.move),
        uci,
        bestUci: pos.best.uci,
        accepted: [...acceptedMoves(pos, fen, cls), ...(missedBrilliant ? [missedBrilliant] : [])],
        playedUci: game.movesUci[trial.move],
        minPoints: cls === "miss" ? MISS_WIN : undefined,
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

  function exitReview() {
    setReview(null);
    setTrial(null);
  }
  const reviewSide = game.userColor ?? (orientation === "black" ? "b" : "w");
  // Mientras el repaso avanza solo, la salida va en el veredicto; en pausa ya la lleva el aviso de pausa.
  const closeVerdict = review && !review.finished && !review.paused ? exitReview : undefined;

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
    const t = setTimeout(() => setPly((p) => Math.min(N, p + 1)), 540);
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
  // En la partida (no intento ni variante) va la SAN: así también suena al saltar de posición.
  const lastMove = lastMoveUci
    ? { from: uciFrom(lastMoveUci), to: uciTo(lastMoveUci), san: trial || inVariant ? undefined : sans[ply - 1] }
    : null;

  const prevMove = ply - 1;
  const prevAnalysis = !trial && !inVariant && prevMove >= 0 ? analysis?.moves[prevMove] : undefined;
  const prevBest = !trial && !inVariant && prevMove >= 0 ? analysis?.positions[prevMove]?.best : undefined;

  // Repaso sin pistas (D8): con un repaso activo, la mejor jugada solo se ve con "Ver solución".
  const reviewing = !!review && !review.finished;
  const arrows: Arrow[] = [];
  if (trial && pos?.best && trial.status === "solution") {
    arrows.push({ startSquare: uciFrom(pos.best.uci), endSquare: uciTo(pos.best.uci), color: ARROW_BEST });
  } else if (inVariant && variantInfo.best) {
    arrows.push({ startSquare: uciFrom(variantInfo.best), endSquare: uciTo(variantInfo.best), color: ARROW_LINE });
  } else if (!reviewing && prevAnalysis && prevBest && !NO_ARROW.has(prevAnalysis.class) && prevBest.uci !== game.movesUci[prevMove]) {
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

  const moveList = (scrub?: boolean) => (
    <MoveList
      sans={sans}
      classes={classes}
      ply={ply}
      startsWithBlack={firstColor === "b"}
      startMoveNumber={Number(game.startFen.split(" ")[5] ?? 1)}
      scrub={scrub}
      onSelect={(p, scrubbed) => {
        setScrubbedPly(scrubbed ? p : null);
        goto(p);
      }}
    />
  );

  return (
    <>
      {/* Celular: atrás + franja de jugadas. En `lg` la lista va en el panel. */}
      <div className={`mb-1.5 flex items-center gap-1.5 ${back ? "" : "lg:hidden"}`}>
        {back}
        <div className="min-w-0 flex-1 rounded-lg bg-panel px-1 lg:hidden">{moveList(true)}</div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 pb-[calc(3rem+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:pb-0">
        {/* Columna del tablero */}
        <div className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-13rem))] flex-col gap-1.5 lg:max-w-[min(100%,calc(100dvh-15rem))]">
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
                silent={scrubbedPly === ply && !trial && !inVariant}
                badge={badge}
                highlight={trial?.hint && pos?.best ? [uciFrom(pos.best.uci)] : []}
              />
            </div>
          </div>
          {player(!topIsWhite)}
          {/* Una sola fila desde 360 px (D7): Repasar → actions → Girar. Se oculta durante el repaso para que quepa el panel; se sale con la X del panel. */}
          {!reviewing && (
            <div className="flex flex-nowrap gap-1.5">
              {analysis && !review && (
                <button type="button" onClick={() => startReview(reviewSide)} className={`btn-secondary ${REVIEW_ROW_BTN}`}>
                  <GraduationCap className="size-4" /> Repasar
                </button>
              )}
              {actions}
              <button
                type="button"
                aria-label="Girar tablero"
                title="Girar tablero"
                onClick={() => setFlipped(!flipped)}
                className="btn-secondary size-11 shrink-0 px-0"
              >
                <RefreshCw className="size-4" />
              </button>
            </div>
          )}
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
                  : "Encuentra la mejor jugada"
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
              onClose={review ? exitReview : undefined}
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
              label={moveLabel(fens[review.pending]!, sans[review.pending]!)}
              cls={analysis?.moves[review.pending]?.class ?? "mistake"}
              who={review.side === game.userColor ? "Tu jugada" : `Jugada de ${review.side === "w" ? game.white : game.black}`}
              brilliant={!!analysis?.moves[review.pending]?.brilliantMissed}
              onReview={() => {
                const m = review.pending!;
                setReview({ ...review, pending: null });
                startTrial(m);
              }}
              onContinue={() => setReview({ ...review, pending: null, results: { ...review.results, [review.pending!]: null } })}
              onClose={exitReview}
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
          ) : prevAnalysis ? (
            <MoveVerdict
              label={moveLabel(fens[prevMove]!, sans[prevMove]!)}
              cls={prevAnalysis.class}
              bestSan={!reviewing && prevBest && prevBest.uci !== game.movesUci[prevMove] ? sanOf(fens[prevMove]!, prevBest.uci) : null}
              evalText={formatEval(evals[ply], fen)}
              onRetry={RETRY_CLASSES.includes(prevAnalysis.class) && !review ? () => startTrial(prevMove) : undefined}
              onClose={closeVerdict}
            />
          ) : (
            // Mismo hueco en el ply 0 para que la gráfica no salte al pasar a la jugada 1.
            analysis &&
            ply === 0 && (
              <div className={VERDICT_BOX}>
                <p className="min-w-0 flex-1 truncate font-semibold text-muted">Posición inicial</p>
                {closeVerdict && <CloseReview onClick={closeVerdict} />}
              </div>
            )
          )}

          {review?.paused && !review.finished && !trial && (
            <div className="flex items-center gap-2 rounded-xl bg-brand/10 p-3 ring-2 ring-brand/70">
              <span className="mr-auto text-sm font-semibold">Repaso en pausa</span>
              <button type="button" onClick={() => setReview({ ...review, paused: false })} className="btn-primary">
                <Play className="size-4" /> Continuar repaso
              </button>
              <CloseReview onClick={exitReview} />
            </div>
          )}

          {(analysis ?? liveEvals?.length) ? <EvalGraph evals={evals} fens={fens} classes={classes} ply={ply} markColor={game.userColor} onSelect={goto} /> : null}

          <div className="hidden rounded-lg bg-panel p-2 lg:block">{moveList()}</div>

          {analysis && (
            <Summary analysis={analysis} white={game.white} black={game.black} firstColor={firstColor} />
          )}

          {analysis && toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:order-first lg:border-0 lg:bg-transparent lg:p-0">
            <NavBar ply={ply} max={N} onChange={goto} />
          </div>
        </div>
      </div>
    </>
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

/** Botón de texto de la fila bajo el tablero: reparte el ancho y no parte la línea en 360 px. */
export const REVIEW_ROW_BTN = "min-w-0 flex-1 whitespace-nowrap px-2 text-[13px] sm:px-4 sm:text-sm";
/** Alto fijo del veredicto: la gráfica no salta al cambiar de jugada. */
const VERDICT_BOX = "flex h-[4.25rem] items-center gap-3 rounded-lg bg-panel px-3";

function MoveVerdict({
  label,
  cls,
  bestSan,
  evalText,
  onRetry,
  onClose,
}: {
  /** "12. b5" */
  label: string;
  cls: GameAnalysis["moves"][number]["class"];
  bestSan: string | null;
  evalText: string;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  const meta = CLASS_META[cls];
  return (
    <div className={VERDICT_BOX}>
      <ClassIcon cls={cls} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {label} <span style={{ color: meta.color }}>{CLASS_PHRASE[cls]}</span>
        </p>
        <p className="truncate text-sm text-muted">
          <span className="font-mono">{evalText}</span>
          {bestSan && <> · Mejor era {prettySan(bestSan)}</>}
        </p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} aria-label="Reintentar" title="Reintentar" className="btn-secondary size-11 shrink-0 px-0">
          <RotateCcw className="size-5" />
        </button>
      )}
      {onClose && <CloseReview onClick={onClose} />}
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
  onClose,
}: {
  trial: Trial;
  review: boolean;
  prompt: string;
  onRetry: () => void;
  onHint: () => void;
  onSolution: () => void;
  onSkip: () => void;
  onDone: (correct: boolean) => void;
  /** Salir del repaso (solo con repaso activo). */
  onClose?: () => void;
}) {
  const s = trial.status;
  const solving = s === "idle" || s === "checking";
  // Resolviendo: color primario. Fallo: fondo del panel, sin rojo (no es un error grave).
  const tone = s === "correct" ? "bg-c-best/15 ring-2 ring-c-best" : solving ? "bg-brand text-[#10200c]" : "bg-panel";
  const btn = `${REVIEW_ROW_BTN} min-h-10`;
  return (
    <div className={`rounded-lg px-3 py-2.5 ${tone}`} aria-live="polite">
      <div className="flex items-center gap-2 font-semibold">
        <span className="min-w-0 flex-1 truncate">{solving ? prompt : (trial.msg ?? "Omitida")}</span>
        {s === "checking" && <span className="shrink-0 text-sm font-normal opacity-75">Comprobando…</span>}
        {onClose && <CloseReview onClick={onClose} onBrand={solving} />}
      </div>
      <div className="mt-3.5 flex flex-nowrap gap-1.5">
        {s === "wrong" && (
          <button type="button" onClick={onRetry} aria-label="Reintentar" title="Reintentar" className={`btn-primary ${btn}`}>
            <RotateCcw className="size-5" />
          </button>
        )}
        {(s === "idle" || s === "wrong") && (
          <>
            {!trial.hint && (
              <button type="button" onClick={onHint} aria-label="Pista" title="Pista" className={`btn-secondary ${btn}`}>
                <Lightbulb className="size-5" />
              </button>
            )}
            <button type="button" onClick={onSolution} aria-label="Ver solución" title="Ver solución" className={`btn-secondary ${btn}`}>
              <Eye className="size-5" />
            </button>
            {review && (
              <button type="button" onClick={onSkip} aria-label="Omitir" title="Omitir" className={`btn-secondary ${btn}`}>
                <SkipForward className="size-5" />
              </button>
            )}
          </>
        )}
        {(s === "correct" || s === "solution" || s === "skipped") && (
          <button type="button" onClick={() => onDone(s === "correct")} className={`btn-primary ${btn}`}>
            {review ? "Continuar" : "Volver"}
          </button>
        )}
        {!review && s !== "correct" && s !== "solution" && (
          <button type="button" onClick={() => onDone(false)} className={`btn-secondary ${btn}`}>
            Volver
          </button>
        )}
      </div>
    </div>
  );
}

/** X de la esquina de los paneles del repaso: sale del repaso. */
function CloseReview({ onClick, onBrand }: { onClick: () => void; onBrand?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Salir del repaso"
      title="Salir del repaso"
      className={`-mr-1 grid size-8 shrink-0 place-items-center rounded-md transition ${onBrand ? "hover:bg-black/10" : "text-muted hover:bg-raised hover:text-fg"}`}
    >
      <X className="size-5" />
    </button>
  );
}

function PendingPanel({
  label,
  cls,
  who,
  brilliant,
  onReview,
  onContinue,
  onClose,
}: {
  /** "12. b5" */
  label: string;
  cls: GameAnalysis["moves"][number]["class"];
  who: string;
  brilliant: boolean;
  onReview: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const meta = CLASS_META[cls];
  return (
    // Compacto como el panel del intento: en 360×800 debe caber entero sobre la barra de navegación.
    <div className="rounded-lg bg-brand/10 px-3 py-2.5 ring-2 ring-brand" aria-live="polite">
      <div className="flex items-center gap-3">
        <ClassIcon cls={cls} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">
            {label} <span style={{ color: meta.color }}>{CLASS_PHRASE[cls]}</span>
          </p>
          <p className="truncate text-sm text-muted">{who}</p>
        </div>
        <CloseReview onClick={onClose} />
      </div>
      {brilliant && <p className="mt-1 text-sm text-muted">Aquí había una jugada brillante.</p>}
      <div className="mt-3.5 flex gap-2">
        <button type="button" onClick={onReview} className="btn-primary min-h-10 flex-1">
          <Target className="size-4" /> Repasar
        </button>
        <button type="button" onClick={onContinue} className="btn-secondary min-h-10 flex-1">
          Continuar
        </button>
      </div>
    </div>
  );
}
