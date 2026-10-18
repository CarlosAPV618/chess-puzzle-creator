"use client";

import { Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnalysisControls } from "~/components/analysis-controls";
import { clearPending, getCurrentGame, getPending, setPending } from "~/components/game-store";
import { netError } from "~/components/pwa";
import { GameReview } from "~/components/review";
import { useAnalysis } from "~/hooks/use-analysis";
import type { GameAnalysis, ParsedGame } from "~/lib/types";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

export default function AnalyzePage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [game, setGame] = useState<ParsedGame | null | undefined>(undefined);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const { state, run, cancel, liveEvals } = useAnalysis();
  const signup = api.auth.signupStatus.useQuery(undefined, { enabled: !session && !sessionLoading });
  const importGames = api.games.import.useMutation();
  const saveAnalysis = api.analysis.save.useMutation();
  const autoSaved = useRef(false);

  async function analyze(g: ParsedGame, depth: number) {
    const r = await run({ startFen: g.startFen, movesUci: g.movesUci, userColor: g.userColor }, depth);
    if (r) setAnalysis(r);
  }

  // Carga: partida en memoria o, al volver del login, la pendiente (sin reanalizar).
  useEffect(() => {
    const pending = getPending();
    if (pending) {
      setGame(pending.game);
      setAnalysis(pending.analysis);
      return;
    }
    const g = getCurrentGame();
    setGame(g);
    if (g) void analyze(g, 16);
  }, []);

  async function persist(g: ParsedGame, a: GameAnalysis) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await importGames.mutateAsync({ games: [g] });
      const id = r.ids[0];
      if (!id) throw new Error("No se pudo guardar la partida");
      await saveAnalysis.mutateAsync({ gameId: id, analysis: a });
      clearPending();
      router.push(`/partidas/${id}`);
    } catch (e) {
      setMsg(netError(e, "No se pudo guardar"));
      setSaving(false);
    }
  }

  // Volvió del login con un guardado pendiente.
  useEffect(() => {
    if (!session || autoSaved.current) return;
    const pending = getPending();
    if (!pending) return;
    autoSaved.current = true;
    void persist(pending.game, pending.analysis);
  }, [session]);

  function onSave() {
    if (!game || !analysis) return;
    if (session) return void persist(game, analysis);
    setPending({ game, analysis });
    if (signup.data && !signup.data.open) {
      setClosed(true);
      return;
    }
    router.push(`/login?next=${encodeURIComponent("/analizar")}`);
  }

  if (game === undefined) return null;
  if (!game)
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">No hay partida para analizar</h1>
        <p className="mt-2 text-sm text-muted">Pega un PGN o un link para empezar.</p>
        <Link href="/" className="btn-primary mt-5">
          Importar partida
        </Link>
      </div>
    );

  return (
    <>
      <h1 className="sr-only">Análisis de la partida</h1>
      <GameReview
        game={game}
        analysis={analysis}
        liveEvals={state.status === "running" ? liveEvals : undefined}
        toolbar={
          <>
            <AnalysisControls
              state={state}
              hasAnalysis={!!analysis}
              onStart={(d) => void analyze(game, d)}
              onCancel={cancel}
            />
            {analysis && state.status !== "running" && (
              <button type="button" onClick={onSave} disabled={saving} className="btn-primary w-full">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar y crear ejercicios
              </button>
            )}
            {closed && (
              <p className="w-full rounded-lg bg-raised p-3 text-sm" role="alert">
                Registro cerrado: se alcanzó el límite de cuentas. Si ya tienes cuenta,{" "}
                <Link href="/login?next=%2Fanalizar" className="font-semibold text-brand underline">
                  inicia sesión
                </Link>{" "}
                para guardar.
              </p>
            )}
            {msg && (
              <p className="w-full text-sm text-[#ffb4a8]" role="alert">
                {msg}
              </p>
            )}
          </>
        }
      />
    </>
  );
}
