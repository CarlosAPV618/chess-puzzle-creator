"use client";

import { ArrowLeft, ExternalLink, Eye, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Board } from "~/components/board";
import { applyUci, prettySan, sanOf, uciFrom, uciTo } from "~/components/chess";
import { EvalBar } from "~/components/eval-bar";
import { NavBar } from "~/components/nav-bar";
import { REVIEW_ROW_BTN } from "~/components/review";
import { judgeMove } from "~/hooks/use-engine";
import { MISS_WIN } from "~/lib/classify";
import type { Classification, Eval } from "~/lib/types";
import type { RouterOutputs } from "~/trpc/react";

export type Exercise = RouterOutputs["practice"]["queue"][number];
export type Outcome = { firstTryCorrect: boolean; usedHint: boolean; viewedSolution: boolean };

type Phase = "solve" | "checking" | "wrong" | "done";
type Line = { label: string; fens: string[]; moves: string[] };

const SIDES = { mias: "me", rivales: "opponent" } as const;

/** Filtros de la URL (`?lado=`, `?partida=`), con la misma validación en la lista y en `/practicar/<id>`. */
export function practiceFilters(params: URLSearchParams) {
  const lado = params.get("lado");
  const side = lado === "mias" || lado === "rivales" ? SIDES[lado] : undefined;
  // `game` es el nombre viejo del parámetro; se acepta para no romper enlaces.
  const gameId = params.get("partida") ?? params.get("game") ?? undefined;
  const q = new URLSearchParams();
  if (side) q.set("lado", lado!);
  if (gameId) q.set("partida", gameId);
  return { side, gameId, query: q.size ? `?${q}` : "" };
}

/** Secuencia de jugadas desde `fen`; se corta en la primera ilegal. */
function lineFrom(label: string, fen: string, ucis: string[]): Line {
  const fens = [fen];
  const moves = [""];
  for (const u of ucis) {
    const n = applyUci(fens[fens.length - 1]!, u);
    if (!n) break;
    fens.push(n);
    moves.push(u);
  }
  return { label, fens, moves };
}

/**
 * Un ejercicio (D6). `onResult` se llama una sola vez, en cuanto el resultado queda fijado
 * (acierto o solución vista); `onNext` muestra "Siguiente" y `nextLink` un enlace en su lugar
 * (`/practicar/<id>`).
 */
export function ExerciseView({
  ex,
  onResult,
  onNext,
  nextLink,
}: {
  ex: Exercise;
  onResult?: (o: Outcome) => void;
  onNext?: () => void;
  nextLink?: { href: string; label: string };
}) {
  const [phase, setPhase] = useState<Phase>("solve");
  const [fen, setFen] = useState(ex.fen);
  const [tried, setTried] = useState<string | null>(null);
  const [correct, setCorrect] = useState(false);
  const [failedOnce, setFailedOnce] = useState(false);
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [step, setStep] = useState(0);

  // Brillante no vista: solo vale la brillante (D3), igual que en un ejercicio de Brillante.
  const missedBrilliant = ex.brilliantPlayed === false;
  const strict = ex.kind === "brilliant" || missedBrilliant;
  const goodCls: Classification = strict ? "brilliant" : "best";
  const orientation = ex.sideToMove === "b" ? "black" : "white";
  const bestSan = prettySan(sanOf(ex.fen, ex.bestUci));
  // Última jugada del rival solo en errores y oportunidades perdidas (D6).
  const opponentLast = ex.kind !== "brilliant" && ex.lastMoveUci ? ex.lastMoveUci : null;

  function fix(o: Outcome) {
    setPhase("done");
    onResult?.(o);
  }

  async function onMove(uci: string) {
    setTried(uci);
    setFen(applyUci(ex.fen, uci) ?? ex.fen);
    setPhase("checking");
    try {
      const v = await judgeMove({
        startFen: ex.fen,
        movesBefore: [],
        uci,
        bestUci: ex.bestUci,
        accepted: ex.acceptedUci,
        strict,
        // La jugada de la partida nunca vale; en una oportunidad perdida hay que conservar la ventaja (D1).
        playedUci: ex.playedUci,
        minPoints: ex.kind === "miss" && ex.brilliantPlayed === null ? MISS_WIN : undefined,
      });
      if (v.correct) {
        setCorrect(true);
        setMsg(strict ? "¡Brillante!" : v.exact ? "¡Correcto!" : `Buena jugada; la del motor era ${bestSan}`);
        fix({ firstTryCorrect: !failedOnce, usedHint: hint, viewedSolution: false });
      } else {
        setFailedOnce(true);
        setMsg(strict ? "Esa no es la brillante." : "No es la mejor.");
        setPhase("wrong");
      }
    } catch {
      setMsg("No se pudo comprobar la jugada");
      setPhase("wrong");
    }
  }

  function retry() {
    setFen(ex.fen);
    setTried(null);
    setMsg(null);
    setPhase("solve");
  }

  function showSolution() {
    setSolution(true);
    setCorrect(true);
    setFen(applyUci(ex.fen, ex.bestUci) ?? ex.fen);
    setTried(ex.bestUci);
    setMsg(`La mejor era ${bestSan}`);
    fix({ firstTryCorrect: false, usedHint: hint, viewedSolution: true });
  }

  const bestLine = () => lineFrom("Mejor línea", ex.fen, ex.bestPv[0] === ex.bestUci ? ex.bestPv : [ex.bestUci]);
  function open(l: Line) {
    setLine(l);
    setStep(0);
  }

  // Tablero: en una línea, el paso actual; si no, la jugada del usuario con el icono de SU resultado.
  const showFen = line ? line.fens[step]! : fen;
  const lastUci = line ? line.moves[step] || (step === 0 ? opponentLast : null) : (tried ?? opponentLast);
  const badge = line
    ? step === 1
      ? { square: uciTo(line.moves[1]!), cls: goodCls }
      : null
    : phase === "done" && correct && tried
      ? { square: uciTo(tried), cls: goodCls }
      : null;
  const evalShown: Eval | undefined = ex.evalBefore ?? undefined;
  const arrows =
    solution && !line ? [{ startSquare: uciFrom(ex.bestUci), endSquare: uciTo(ex.bestUci), color: "rgba(127,178,74,.9)" }] : [];

  const prompt = missedBrilliant
    ? "Había una jugada brillante. Encuéntrala."
    : ex.kind === "brilliant"
      ? "Hay una jugada brillante. Encuéntrala."
      : "¿Qué era mejor aquí?";

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <div className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-14rem))] gap-1.5">
        {line && <EvalBar value={evalShown} fen={showFen} orientation={orientation} />}
        <div className="min-w-0 flex-1">
          <Board
            id="exercise"
            fen={showFen}
            orientation={orientation}
            onMove={phase === "solve" && !line ? (u) => void onMove(u) : undefined}
            lastMove={lastUci ? { from: uciFrom(lastUci), to: uciTo(lastUci) } : null}
            arrows={arrows}
            highlight={hint && phase !== "done" && !line ? [uciFrom(ex.bestUci)] : []}
            badge={badge}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3" aria-live="polite">
        <div className="card p-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold tracking-wide text-muted uppercase">
            {strict ? <Sparkles className="size-4 text-c-brilliant" /> : null}
            <span className="min-w-0 break-words">
              {ex.white} vs {ex.black} · {ex.sideToMove === "w" ? "Juegan blancas" : "Juegan negras"}
            </span>
          </p>
          <p className="mt-2 text-lg font-bold">{phase === "solve" || phase === "checking" ? prompt : msg}</p>
          {phase === "checking" && <p className="mt-1 text-sm text-muted">Comprobando…</p>}

          {line ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              <p className="text-sm font-semibold text-brand">{line.label}</p>
              <NavBar ply={step} max={line.fens.length - 1} onChange={setStep} />
              <button type="button" onClick={() => setLine(null)} className="btn-secondary">
                <ArrowLeft className="size-4" /> Volver al ejercicio
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-nowrap gap-2">
              {phase === "wrong" && (
                <button type="button" onClick={retry} aria-label="Reintentar" title="Reintentar" className={`btn-primary ${REVIEW_ROW_BTN}`}>
                  <RotateCcw className="size-5" />
                </button>
              )}
              {(phase === "solve" || phase === "wrong") && (
                <>
                  {!hint && (
                    <button type="button" onClick={() => setHint(true)} aria-label="Pista" title="Pista" className={`btn-secondary ${REVIEW_ROW_BTN}`}>
                      <Lightbulb className="size-5" />
                    </button>
                  )}
                  <button type="button" onClick={showSolution} aria-label="Ver solución" title="Ver solución" className={`btn-secondary ${REVIEW_ROW_BTN}`}>
                    <Eye className="size-5" />
                  </button>
                </>
              )}
              {phase === "done" && (
                <>
                  <button type="button" onClick={() => open(bestLine())} className={`btn-secondary ${REVIEW_ROW_BTN}`}>
                    Mejor línea
                  </button>
                  {onNext && (
                    <button type="button" onClick={onNext} className={`btn-primary ${REVIEW_ROW_BTN}`}>
                      Siguiente
                    </button>
                  )}
                  {nextLink && (
                    <Link href={nextLink.href} className={`btn-primary ${REVIEW_ROW_BTN}`}>
                      {nextLink.label}
                    </Link>
                  )}
                  {ex.gameId && (
                    <Link href={`/partidas/${ex.gameId}`} className={`btn-secondary ${REVIEW_ROW_BTN}`}>
                      <ExternalLink className="hidden size-4 sm:block" /> Ver partida
                    </Link>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
