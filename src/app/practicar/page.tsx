"use client";

import { ChevronLeft, ChevronRight, Flame, Loader2, Play, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ClassIcon } from "~/components/class-icon";
import { EngineNotice } from "~/components/engine-notice";
import { ExerciseView, type Exercise, type Outcome } from "~/components/exercise";
import { MiniBoard } from "~/components/mini-board";
import { netError } from "~/components/pwa";
import type { Classification, ExerciseKind } from "~/lib/types";
import { api } from "~/trpc/react";

const KIND_ICON: Record<ExerciseKind, Classification> = { mistake: "blunder", brilliant: "brilliant", miss: "miss" };
const SIDES = { mias: "me", rivales: "opponent" } as const;

export default function PracticePage() {
  return (
    <Suspense>
      <Practice />
    </Suspense>
  );
}

function Practice() {
  const params = useSearchParams();
  const router = useRouter();
  const lado = params.get("lado");
  const side = lado === "mias" || lado === "rivales" ? SIDES[lado] : undefined;
  // `game` es el nombre viejo del parámetro; se acepta para no romper enlaces.
  const gameId = params.get("partida") ?? params.get("game") ?? undefined;
  const page = Math.min(9999, Math.max(1, Math.trunc(Number(params.get("pagina"))) || 1));
  const [session, setSession] = useState<Exercise[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const summary = api.practice.summary.useQuery({ tz });
  const list = api.practice.list.useQuery({ side, gameId, page }, { enabled: summary.data?.total !== 0 });

  /** URL con los filtros cambiados; cambiar un filtro vuelve a la página 1. */
  function href(change: Record<string, string | null>) {
    const q = new URLSearchParams(params);
    q.delete("game");
    if (gameId && !("partida" in change)) q.set("partida", gameId);
    if (!("pagina" in change)) q.delete("pagina");
    for (const [k, v] of Object.entries(change)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    return s ? `/practicar?${s}` : "/practicar";
  }

  async function start() {
    setLoading(true);
    setError(null);
    try {
      setSession(await utils.practice.queue.fetch({ side, gameId, limit: 10 }, { staleTime: 0 }));
    } catch (e) {
      setError(netError(e, "No se pudieron cargar los ejercicios"));
    } finally {
      setLoading(false);
    }
  }

  if (session)
    return (
      <Session
        list={session}
        onExit={() => {
          setSession(null);
          void summary.refetch();
          void utils.practice.list.invalidate();
        }}
      />
    );

  const s = summary.data;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const current = list.data?.page ?? page;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="py-3 text-2xl font-black tracking-tight">Practicar</h1>

      <section aria-label="Progreso" className="grid grid-cols-3 gap-2">
        <Stat icon={<Play className="size-4" />} label="Pendientes hoy" value={s?.dueToday} />
        <Stat icon={<Trophy className="size-4" />} label="Dominados" value={s?.mastered} />
        <Stat icon={<Flame className="size-4" />} label="Racha" value={s ? `${s.streakDays} ${s.streakDays === 1 ? "día" : "días"}` : undefined} />
      </section>

      {summary.error && <p className="mt-3 text-sm text-[#ffb4a8]">{netError(summary.error)}</p>}

      {s?.total === 0 ? (
        <div className="card mt-4 p-6 text-center">
          <p className="font-semibold">Aún no tienes ejercicios</p>
          <p className="mt-1 text-sm text-muted">
            Importa y analiza partidas: tus errores graves, oportunidades perdidas y brillantes se vuelven ejercicios.
          </p>
          <Link href="/" className="btn-primary mt-4">
            Importar partidas
          </Link>
        </div>
      ) : (
        <>
          <div className="card mt-4 grid grid-cols-1 gap-3 p-4">
            <label className="grid gap-1 text-xs font-medium text-muted">
              De quién
              <select
                value={side ? (lado ?? "") : ""}
                onChange={(e) => router.replace(href({ lado: e.target.value || null }))}
                className="field text-sm text-fg"
              >
                <option value="">Todas</option>
                <option value="mias">Mías</option>
                <option value="rivales">De rivales</option>
              </select>
            </label>
            {gameId && (
              <p className="flex items-center gap-2 text-sm">
                Solo ejercicios de una partida
                <button type="button" aria-label="Quitar filtro de partida" className="btn-ghost px-2" onClick={() => router.replace(href({ partida: null }))}>
                  <X className="size-4" />
                </button>
              </p>
            )}
            <button type="button" onClick={() => void start()} disabled={loading} className="btn-primary w-full text-base">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Empezar
            </button>
            {error && <p className="text-sm text-[#ffb4a8]">{error}</p>}
          </div>

          <section aria-label="Ejercicios" className="mt-4">
            {list.isLoading && <Loader2 className="mx-auto mt-6 size-6 animate-spin text-muted" aria-label="Cargando" />}
            {list.error && <p className="text-sm text-[#ffb4a8]">{netError(list.error, "No se pudieron cargar los ejercicios")}</p>}
            {list.data?.total === 0 && <p className="card p-4 text-center text-sm text-muted">No hay ejercicios con esos filtros.</p>}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {list.data?.items.map((e) => (
                <li key={e.id} className="min-w-0">
                  <Link href={`/practicar/${e.id}`} className="card block p-2 transition hover:bg-raised">
                    <MiniBoard fen={e.fen} orientation={e.sideToMove === "b" ? "black" : "white"} />
                    <p className="mt-1.5 truncate text-sm font-semibold" title={`${e.white} vs ${e.black}`}>
                      {e.white} vs {e.black}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <ClassIcon cls={KIND_ICON[e.kind]} size={16} className="shrink-0" />
                      Jugada {e.moveNumber}
                      {e.mastered && (
                        <span className="ml-auto flex items-center gap-1 text-c-inaccuracy" title="Dominado">
                          <Trophy className="size-3.5" aria-hidden />
                          <span className="sr-only">Dominado</span>
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav aria-label="Páginas" className="mt-3 flex items-center justify-between gap-2">
                <PageLink href={href({ pagina: String(current - 1) })} disabled={current <= 1} label="Página anterior">
                  <ChevronLeft className="size-5" />
                </PageLink>
                <span className="text-sm text-muted">
                  Página {current} de {pages}
                </span>
                <PageLink href={href({ pagina: String(current + 1) })} disabled={current >= pages} label="Página siguiente">
                  <ChevronRight className="size-5" />
                </PageLink>
              </nav>
            )}
          </section>
        </>
      )}

      <div className="mt-8 pb-2">
        <EngineNotice />
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled)
    return (
      <span aria-disabled className="btn-secondary px-3 opacity-35">
        {children}
      </span>
    );
  return (
    <Link href={href} aria-label={label} className="btn-secondary px-3">
      {children}
    </Link>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number | string }) {
  return (
    <div className="card min-w-0 p-3">
      <p className="flex items-center gap-1.5 truncate text-xs text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold">{value ?? "–"}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Sesión

function Session({ list: initial, onExit }: { list: Exercise[]; onExit: () => void }) {
  const [list, setList] = useState(initial);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Record<string, Outcome>>({});
  const submit = api.practice.submitResult.useMutation();
  const [saveError, setSaveError] = useState<string | null>(null);

  if (list.length === 0)
    return (
      <div className="card mx-auto mt-8 max-w-md p-6 text-center">
        <p className="font-semibold">No hay ejercicios pendientes con esos filtros</p>
        <button type="button" onClick={onExit} className="btn-secondary mt-4">
          Volver
        </button>
      </div>
    );

  const ex = list[i];
  if (!ex) {
    const first = initial.filter((e) => results[e.id]?.firstTryCorrect && !results[e.id]?.usedHint && !results[e.id]?.viewedSolution).length;
    return (
      <div className="card mx-auto mt-8 max-w-md p-6 text-center">
        <Trophy className="mx-auto size-10 text-c-inaccuracy" />
        <p className="mt-2 text-xl font-bold">Sesión terminada</p>
        <p className="mt-1 text-muted">
          {first} de {initial.length} a la primera
        </p>
        <button type="button" onClick={onExit} className="btn-primary mt-5 w-full">
          Continuar
        </button>
      </div>
    );
  }

  // Se envía en cuanto el resultado queda fijado (D6). Uno por ejercicio: la repetición al final no cuenta.
  function result(o: Outcome) {
    if (!ex || results[ex.id]) return;
    setResults((r) => ({ ...r, [ex.id]: o }));
    submit.mutate({ exerciseId: ex.id, ...o }, { onError: (e) => setSaveError(netError(e, "No se pudo guardar el resultado")) });
    if (!o.firstTryCorrect || o.usedHint || o.viewedSolution) setList((l) => [...l, ex]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <button type="button" onClick={onExit} className="btn-ghost -ml-2 px-2" aria-label="Salir de la sesión">
          <X className="size-5" />
        </button>
        <div
          role="progressbar"
          aria-label="Progreso de la sesión"
          aria-valuenow={i}
          aria-valuemin={0}
          aria-valuemax={list.length}
          className="h-2 flex-1 overflow-hidden rounded-full bg-raised"
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(i / list.length) * 100}%` }} />
        </div>
        <span className="font-mono text-sm text-muted">
          {i + 1}/{list.length}
        </span>
      </div>
      {saveError && <p className="mb-2 text-sm text-[#ffb4a8]">{saveError}</p>}
      <ExerciseView key={`${ex.id}-${i}`} ex={ex} owner repeat={list.findIndex((e) => e.id === ex.id) < i} onResult={result} onNext={() => setI(i + 1)} />
    </div>
  );
}
