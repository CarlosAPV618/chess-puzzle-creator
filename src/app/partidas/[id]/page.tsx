"use client";

import { ChevronLeft, Loader2, Puzzle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AnalysisControls } from "~/components/analysis-controls";
import { CLASSIFIER_VERSION } from "~/lib/classify/version";
import { netError } from "~/components/pwa";
import { GameReview, REVIEW_ROW_BTN } from "~/components/review";
import { useAnalysis } from "~/hooks/use-analysis";
import type { Color, GameAnalysis } from "~/lib/types";
import { api } from "~/trpc/react";

export default function SavedGamePage() {
  const { id } = useParams<{ id: string }>();
  const utils = api.useUtils();
  const q = api.games.get.useQuery({ id }, { refetchOnWindowFocus: false, retry: false });
  const save = api.analysis.save.useMutation();
  const { state, run, cancel, liveEvals } = useAnalysis();
  const [fresh, setFresh] = useState<GameAnalysis | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<GameAnalysis | null>(null);

  const game = q.data?.game;
  const analysis = fresh ?? q.data?.analysis ?? null;

  async function persist(a: GameAnalysis) {
    setNote(null);
    try {
      await save.mutateAsync({ gameId: id, analysis: a });
      setLastRun(null);

      void utils.games.list.invalidate();
      void utils.games.get.invalidate({ id });
    } catch (e) {
      setLastRun(a);
      setNote(netError(e, "No se pudo guardar el análisis"));
    }
  }

  async function analyze(depth: number) {
    if (!game) return;
    const a = await run({ startFen: game.startFen, movesUci: game.movesUci, userColor: game.userColor }, depth);
    if (!a) return;
    setFresh(a);
    await persist(a);
  }

  if (q.isLoading) return <Loader2 className="mx-auto mt-16 size-6 animate-spin text-muted" aria-label="Cargando" />;
  if (!game)
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center">
        <p className="font-semibold">{netError(q.error, "No encontramos esa partida")}</p>
        <Link href="/partidas" className="btn-secondary mt-4">
          Mis partidas
        </Link>
      </div>
    );

  return (
    <>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Link href="/partidas" className="btn-ghost -ml-2 size-9 min-h-9 shrink-0 px-0" aria-label="Volver a Mis partidas">
          <ChevronLeft className="size-5" />
        </Link>
        <ResultTag result={game.result} userColor={game.userColor} />
        <h1 className="min-w-0 truncate text-sm font-bold">
          {game.white} vs {game.black}
          {game.openingName && <span className="ml-2 text-sm font-normal text-muted">{game.openingName}</span>}
        </h1>
      </div>
      <GameReview
        game={game}
        analysis={analysis}
        liveEvals={state.status === "running" ? liveEvals : undefined}
        actions={
          q.data?.exerciseCount ? (
            <Link href={`/practicar?partida=${id}&iniciar=1`} className={`btn-primary ${REVIEW_ROW_BTN}`}>
              <Puzzle className="hidden size-4 sm:block" /> Practicar partida
            </Link>
          ) : null
        }
        toolbar={
          <>
            {analysis && analysis.classifierVersion < CLASSIFIER_VERSION && state.status !== "running" && (
              <p className="w-full rounded-lg bg-raised p-3 text-sm" role="status">
                La clasificación mejoró desde que analizaste esta partida. Usa <strong>Reanalizar</strong> para actualizarla.
              </p>
            )}
            <AnalysisControls state={state} hasAnalysis={!!analysis} onStart={(d) => void analyze(d)} onCancel={cancel} />
            {save.isPending && (
              <p className="flex w-full items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Guardando…
              </p>
            )}
            {note && (
              <p className="flex w-full flex-wrap items-center gap-2 text-sm" role="status">
                {note}
                {lastRun && (
                  <button type="button" className="btn-secondary" onClick={() => void persist(lastRun)}>
                    Reintentar guardado
                  </button>
                )}
              </p>
            )}
          </>
        }
      />
    </>
  );
}

/** "Ganaste/Perdiste/Tablas" con color conocido, "Ganan blancas/negras/Tablas" sin él; nada con "*" (D7). */
function ResultTag({ result, userColor }: { result?: string | null; userColor: Color | null }) {
  const winner: Color | "draw" | null =
    result === "1-0" ? "w" : result === "0-1" ? "b" : result === "1/2-1/2" ? "draw" : null;
  if (!winner) return null;
  const [text, tone] =
    winner === "draw"
      ? ["Tablas", "bg-raised text-muted"]
      : !userColor
        ? [winner === "w" ? "Ganan blancas" : "Ganan negras", "bg-raised text-fg"]
        : winner === userColor
          ? ["Ganaste", "bg-c-best/20 text-c-best"]
          : ["Perdiste", "bg-c-blunder/20 text-c-blunder"];
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${tone}`}>{text}</span>;
}
