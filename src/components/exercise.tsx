"use client";

import { ArrowLeft, ExternalLink, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Board } from "~/components/board";
import { applyUci, formatEval, prettySan, sanOf, uciFrom, uciTo } from "~/components/chess";
import { ClassIcon } from "~/components/class-icon";
import { EvalBar } from "~/components/eval-bar";
import { NavBar } from "~/components/nav-bar";
import { judgeMove } from "~/hooks/use-engine";
import { CLASSIFICATIONS, type Classification, type Eval } from "~/lib/types";
import type { RouterOutputs } from "~/trpc/react";

export type Exercise = RouterOutputs["practice"]["queue"][number];
export type Outcome = { firstTryCorrect: boolean; usedHint: boolean; viewedSolution: boolean };

type Phase = "solve" | "checking" | "wrong" | "done";
type Line = { label: string; fens: string[]; moves: string[] };

const asClass = (c: string): Classification => ((CLASSIFICATIONS as readonly string[]).includes(c) ? (c as Classification) : "blunder");

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
 * (acierto o solución vista); `onNext` muestra "Siguiente". `owner` decide si los textos dicen
 * "Jugaste" o el nombre del jugador.
 */
export function ExerciseView({
  ex,
  owner,
  repeat = false,
  onResult,
  onNext,
}: {
  ex: Exercise;
  owner: boolean;
  repeat?: boolean;
  onResult?: (o: Outcome) => void;
  onNext?: () => void;
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
  const playedSan = prettySan(sanOf(ex.fen, ex.playedUci));
  const originCls: Classification = ex.kind === "brilliant" ? "brilliant" : asClass(ex.cls);
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
      const v = await judgeMove({ startFen: ex.fen, movesBefore: [], uci, bestUci: ex.bestUci, accepted: ex.acceptedUci, strict });
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

  const refutation =
    ex.kind !== "brilliant" && ex.playedUci !== ex.bestUci && ex.refutationPv.length
      ? () => lineFrom("Lo que podía pasar", ex.fen, [ex.playedUci, ...ex.refutationPv])
      : null;
  const bestLine = () => lineFrom("Mejor línea", ex.fen, ex.bestPv[0] === ex.bestUci ? ex.bestPv : [ex.bestUci]);
  function open(l: Line) {
    setLine(l);
    setStep(0);
  }

  // Quién hizo la jugada original: el dueño ve "jugaste"/"tu rival jugó"; los demás, el nombre (D5).
  const mover = ex.sideToMove === "w" ? ex.white : ex.black;
  const who = !owner
    ? `${mover} jugó`
    : ex.side === "me"
      ? "jugaste"
      : ex.side === "opponent"
        ? "tu rival jugó"
        : `${ex.sideToMove === "w" ? "blancas" : "negras"} jugaron`;
  const originSan = ex.kind === "brilliant" ? `${bestSan}!!` : playedSan;

  // Tablero: en una línea, el paso actual; si no, la jugada del usuario con el icono de SU resultado.
  const showFen = line ? line.fens[step]! : fen;
  const lastUci = line ? line.moves[step] || (step === 0 ? opponentLast : null) : (tried ?? opponentLast);
  const badge = line
    ? step === 1
      ? { square: uciTo(line.moves[1]!), cls: line.label === "Mejor línea" ? goodCls : originCls }
      : null
    : phase === "done" && correct && tried
      ? { square: uciTo(tried), cls: goodCls }
      : null;
  const evalShown: Eval | undefined = (line && step > 0 && line.label !== "Mejor línea" ? ex.evalAfter : ex.evalBefore) ?? undefined;
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
            {repeat && <span className="rounded bg-raised px-1.5 normal-case">Repaso</span>}
          </p>
          <p className="mt-2 text-lg font-bold">{phase === "solve" || phase === "checking" ? prompt : msg}</p>
          {phase === "checking" && <p className="mt-1 text-sm text-muted">Comprobando…</p>}

          {phase === "done" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-raised p-2 text-sm">
              <ClassIcon cls={originCls} size={22} className="shrink-0" />
              <span className="min-w-0">
                En la partida: {who} <b>{originSan}</b>
                {ex.kind !== "brilliant" && ex.evalBefore && ex.evalAfter && (
                  <span className="ml-1 font-mono text-muted">
                    ({formatEval(ex.evalBefore)} → {formatEval(ex.evalAfter)})
                  </span>
                )}
              </span>
            </div>
          )}

          {line ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              <p className="text-sm font-semibold text-brand">{line.label}</p>
              <NavBar ply={step} max={line.fens.length - 1} onChange={setStep} />
              <button type="button" onClick={() => setLine(null)} className="btn-secondary">
                <ArrowLeft className="size-4" /> Volver al ejercicio
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {phase === "wrong" && (
                <button type="button" onClick={retry} className="btn-primary">
                  <RotateCcw className="size-4" /> Reintentar
                </button>
              )}
              {(phase === "solve" || phase === "wrong") && (
                <>
                  {!hint && (
                    <button type="button" onClick={() => setHint(true)} className="btn-secondary">
                      <Lightbulb className="size-4" /> Pista
                    </button>
                  )}
                  <button type="button" onClick={showSolution} className="btn-secondary">
                    Ver solución
                  </button>
                </>
              )}
              {phase === "done" && (
                <>
                  {refutation && (
                    <button type="button" onClick={() => open(refutation())} className="btn-secondary">
                      Lo que podía pasar
                    </button>
                  )}
                  <button type="button" onClick={() => open(bestLine())} className="btn-secondary">
                    Mejor línea
                  </button>
                  {ex.gameId && (
                    <Link href={`/partidas/${ex.gameId}`} className="btn-ghost">
                      <ExternalLink className="size-4" /> Ver en la partida
                    </Link>
                  )}
                  {onNext && (
                    <button type="button" onClick={onNext} className="btn-primary">
                      Siguiente
                    </button>
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
