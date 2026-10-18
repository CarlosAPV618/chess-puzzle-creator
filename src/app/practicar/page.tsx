"use client";

import { Flame, Lightbulb, Loader2, Play, RotateCcw, Sparkles, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Board } from "~/components/board";
import { applyUci, formatEval, prettySan, sanOf, uciFrom, uciTo } from "~/components/chess";
import { CLASS_META, ClassIcon } from "~/components/class-icon";
import { EngineNotice } from "~/components/engine-notice";
import { EvalBar } from "~/components/eval-bar";
import { netError } from "~/components/pwa";
import { judgeMove } from "~/hooks/use-engine";
import { CLASSIFICATIONS, type Classification, type Eval } from "~/lib/types";
import { api, type RouterOutputs } from "~/trpc/react";

type Exercise = RouterOutputs["practice"]["queue"][number];
type Filters = { kind?: "mistake" | "brilliant"; side?: "me" | "opponent"; cls?: Classification; phase?: "opening" | "middlegame" | "endgame" };

const asClass = (c: string): Classification => ((CLASSIFICATIONS as readonly string[]).includes(c) ? (c as Classification) : "blunder");

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
  const gameId = params.get("game") ?? undefined;
  const [filters, setFilters] = useState<Filters>({});
  const [session, setSession] = useState<Exercise[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const summary = api.practice.summary.useQuery({ tz });

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const q = await utils.practice.queue.fetch({ ...filters, gameId, limit: 10 }, { staleTime: 0 });
      setSession(q);
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
        }}
      />
    );

  const s = summary.data;
  const select = (label: string, key: keyof Filters, options: [string, string][]) => (
    <label className="grid gap-1 text-xs font-medium text-muted">
      {label}
      <select
        value={(filters[key] as string | undefined) ?? ""}
        onChange={(e) => setFilters({ ...filters, [key]: e.target.value || undefined })}
        className="field text-sm text-fg"
      >
        <option value="">Todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="py-3 text-2xl font-black tracking-tight">Practicar</h1>

      <section aria-label="Progreso" className="grid grid-cols-3 gap-2">
        <Stat icon={<Play className="size-4" />} label="Pendientes hoy" value={s?.dueToday} />
        <Stat icon={<Trophy className="size-4" />} label="Dominados" value={s?.mastered} />
        <Stat icon={<Flame className="size-4" />} label="Racha" value={s ? `${s.streakDays} ${s.streakDays === 1 ? "día" : "días"}` : undefined} />
      </section>

      {s && s.total > 0 && <Breakdown counts={s.counts} />}

      {summary.error && <p className="mt-3 text-sm text-[#ffb4a8]">{netError(summary.error)}</p>}

      {s?.total === 0 ? (
        <div className="card mt-4 p-6 text-center">
          <p className="font-semibold">Aún no tienes ejercicios</p>
          <p className="mt-1 text-sm text-muted">
            Importa y analiza partidas: tus blunders, oportunidades perdidas y brillantes se vuelven ejercicios.
          </p>
          <Link href="/" className="btn-primary mt-4">
            Importar partidas
          </Link>
        </div>
      ) : (
        <div className="card mt-4 grid gap-3 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {select("Tipo", "kind", [
              ["mistake", "Errores"],
              ["brilliant", "Brillantes"],
            ])}
            {select("De quién", "side", [
              ["me", "Mías"],
              ["opponent", "De rivales"],
            ])}
            {select("Clase", "cls", [
              ["blunder", CLASS_META.blunder.label],
              ["miss", CLASS_META.miss.label],
            ])}
            {select("Fase", "phase", [
              ["opening", "Apertura"],
              ["middlegame", "Medio juego"],
              ["endgame", "Final"],
            ])}
          </div>
          {gameId && (
            <p className="flex items-center gap-2 text-sm">
              Solo ejercicios de una partida
              <button type="button" aria-label="Quitar filtro de partida" className="btn-ghost px-2" onClick={() => router.replace("/practicar")}>
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
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number | string }) {
  return (
    <div className="card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold">{value ?? "–"}</p>
    </div>
  );
}

function Breakdown({ counts }: { counts: { kind: string; cls: string; side: string | null; count: number }[] }) {
  const rows = new Map<string, { me: number; opp: number; unknown: number }>();
  for (const c of counts) {
    const key = c.kind === "brilliant" ? "brilliant" : c.cls;
    const r = rows.get(key) ?? { me: 0, opp: 0, unknown: 0 };
    if (c.side === "me") r.me += c.count;
    else if (c.side === "opponent") r.opp += c.count;
    else r.unknown += c.count;
    rows.set(key, r);
  }
  return (
    <table className="card mt-3 w-full overflow-hidden text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="px-3 py-2 text-left font-medium">Tipo</th>
          <th className="px-3 py-2 text-right font-medium">Mías</th>
          <th className="px-3 py-2 text-right font-medium">De rivales</th>
        </tr>
      </thead>
      <tbody>
        {[...rows.entries()].map(([cls, r]) => (
          <tr key={cls} className="border-t border-line">
            <td className="flex items-center gap-2 px-3 py-2">
              <ClassIcon cls={asClass(cls)} size={18} />
              {CLASS_META[asClass(cls)].label}
            </td>
            <td className="px-3 py-2 text-right font-mono">{r.me}</td>
            <td className="px-3 py-2 text-right font-mono">
              {r.opp}
              {r.unknown ? <span className="ml-1 text-xs text-muted">(+{r.unknown} sin color)</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- Sesión

type Outcome = { firstTryCorrect: boolean; usedHint: boolean; viewedSolution: boolean };

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

  function done(o: Outcome) {
    if (!ex) return;
    // Un solo submitResult por ejercicio; la repetición al final no cuenta (D9).
    if (!results[ex.id]) {
      setResults({ ...results, [ex.id]: o });
      submit.mutate(
        { exerciseId: ex.id, ...o },
        { onError: (e) => setSaveError(netError(e, "No se pudo guardar el resultado")) },
      );
      const failed = !o.firstTryCorrect || o.usedHint || o.viewedSolution;
      if (failed) setList([...list, ex]);
    }
    setI(i + 1);
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
      <ExerciseView key={`${ex.id}-${i}`} ex={ex} repeat={!!results[ex.id]} onDone={done} />
    </div>
  );
}

type Phase = "solve" | "checking" | "wrong" | "solved" | "explain";

function ExerciseView({ ex, repeat, onDone }: { ex: Exercise; repeat: boolean; onDone: (o: Outcome) => void }) {
  const [phase, setPhase] = useState<Phase>("solve");
  const [fen, setFen] = useState(ex.fen);
  const [tried, setTried] = useState<string | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [anim, setAnim] = useState<{ fens: string[]; moves: string[]; labels: string[] } | null>(null);
  const [step, setStep] = useState(0);

  const brilliant = ex.kind === "brilliant";
  const orientation = ex.sideToMove === "b" ? "black" : "white";
  const bestSan = prettySan(sanOf(ex.fen, ex.bestUci));
  const playedSan = prettySan(sanOf(ex.fen, ex.playedUci));
  const cls = asClass(ex.cls);

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
        strict: brilliant,
      });
      if (v.correct) {
        setMsg(brilliant ? "¡Brillante!" : v.exact ? "¡Correcto!" : `Buena jugada; la del motor era ${bestSan}`);
        setPhase("solved");
      } else {
        setFailedOnce(true);
        setMsg(brilliant ? "Esa no es la brillante." : "No es la mejor.");
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
    setFen(applyUci(ex.fen, ex.bestUci) ?? ex.fen);
    setTried(ex.bestUci);
    setMsg(`La mejor era ${bestSan}`);
    setPhase("solved");
  }

  // Explicación: refutación de la jugada original y luego la mejor línea (D9).
  function explain() {
    const seqs: { start: string; moves: string[]; label: string }[] = [];
    const played = ex.playedUci !== ex.bestUci;
    if (played && ex.refutationPv.length) {
      seqs.push({ start: ex.fen, moves: [ex.playedUci, ...ex.refutationPv.slice(0, 6)], label: "Lo que podía pasar" });
    }
    const bestLine = ex.bestPv[0] === ex.bestUci ? ex.bestPv.slice(0, 6) : [ex.bestUci];
    seqs.push({ start: ex.fen, moves: bestLine, label: "La mejor línea" });
    const frames: string[] = [];
    const moves: string[] = [];
    const labels: string[] = [];
    for (const s of seqs) {
      let f = s.start;
      frames.push(f);
      moves.push("");
      labels.push(s.label);
      for (const m of s.moves) {
        const n = applyUci(f, m);
        if (!n) break;
        f = n;
        frames.push(f);
        moves.push(m);
        labels.push(s.label);
      }
    }
    setAnim({ fens: frames, moves, labels });
    setStep(0);
    setPhase("explain");
  }

  // La explicación arranca sola tras responder.
  useEffect(() => {
    if (phase !== "solved") return;
    const t = setTimeout(explain, 1200);
    return () => clearTimeout(t);
  });

  useEffect(() => {
    if (phase !== "explain" || !anim || step >= anim.fens.length - 1) return;
    const t = setTimeout(() => setStep((s) => s + 1), anim.moves[step + 1] ? 900 : 1300);
    return () => clearTimeout(t);
  }, [phase, anim, step]);

  const who = (verb2: string, verbYou: string) =>
    ex.side === "me" ? verbYou : ex.side === "opponent" ? `Tu rival ${verb2}` : `${ex.sideToMove === "w" ? "Blancas" : "Negras"} ${verb2}`;

  const origin = brilliant
    ? ex.brilliantPlayed
      ? `${who("la jugó", "La jugaste")}: ${bestSan}!!`
      : `${who("no la vio", "No la viste")}: se jugó ${playedSan}`
    : `${who("jugó", "Jugaste")} ${playedSan}`;

  const showFen = phase === "explain" && anim ? anim.fens[step]! : fen;
  const lastUci = phase === "explain" && anim ? anim.moves[step] : tried;
  const animLabel = phase === "explain" && anim ? anim.labels[step] : null;
  const evalShown: Eval | undefined =
    phase === "explain" ? (animLabel === "La mejor línea" ? ex.evalBefore : ex.evalAfter) ?? undefined : undefined;

  const arrows =
    solution && phase !== "explain"
      ? [{ startSquare: uciFrom(ex.bestUci), endSquare: uciTo(ex.bestUci), color: "rgba(127,178,74,.9)" }]
      : [];

  return (
    <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <div className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-14rem))] gap-1.5">
        {phase === "explain" && <EvalBar value={evalShown} fen={showFen} orientation={orientation} />}
        <div className="min-w-0 flex-1">
          <Board
            id="exercise"
            fen={showFen}
            orientation={orientation}
            onMove={phase === "solve" ? (u) => void onMove(u) : undefined}
            lastMove={lastUci ? { from: uciFrom(lastUci), to: uciTo(lastUci) } : null}
            arrows={arrows}
            highlight={hint && phase !== "explain" ? [uciFrom(ex.bestUci)] : []}
            badge={
              phase === "explain" && lastUci === ex.playedUci && step === 1 && ex.playedUci !== ex.bestUci
                ? { square: uciTo(ex.playedUci), cls }
                : phase === "solved" && brilliant && tried === ex.bestUci
                  ? { square: uciTo(ex.bestUci), cls: "brilliant" }
                  : null
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-3" aria-live="polite">
        <div className="card p-4">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {brilliant ? <Sparkles className="size-4 text-c-brilliant" /> : null}
            {ex.gameLabel} · {ex.sideToMove === "w" ? "Juegan blancas" : "Juegan negras"}
            {repeat && <span className="rounded bg-raised px-1.5 normal-case">Repaso</span>}
          </p>
          <p className="mt-2 text-lg font-bold">
            {phase === "solve" || phase === "checking"
              ? brilliant
                ? "Hay una jugada brillante. Encuéntrala."
                : "¿Qué era mejor aquí?"
              : msg}
          </p>
          {phase === "checking" && <p className="mt-1 text-sm text-muted">Comprobando…</p>}

          {(phase === "solved" || phase === "explain") && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-raised p-2 text-sm">
              <ClassIcon cls={brilliant && ex.brilliantPlayed ? "brilliant" : cls} size={22} />
              <span>
                {origin}
                {!brilliant && ex.evalBefore && ex.evalAfter && (
                  <span className="ml-1 font-mono text-muted">
                    ({formatEval(ex.evalBefore)} → {formatEval(ex.evalAfter)})
                  </span>
                )}
              </span>
            </div>
          )}
          {animLabel && <p className="mt-2 text-sm font-semibold text-brand">{animLabel}</p>}

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
            {phase === "solved" && (
              <button type="button" onClick={explain} className="btn-secondary">
                Ver explicación
              </button>
            )}
            {phase === "explain" && (
              <button type="button" onClick={explain} className="btn-secondary">
                <RotateCcw className="size-4" /> Repetir
              </button>
            )}
            {(phase === "solved" || phase === "explain") && (
              <button
                type="button"
                onClick={() => onDone({ firstTryCorrect: !failedOnce && !solution, usedHint: hint, viewedSolution: solution })}
                className="btn-primary"
              >
                Siguiente
              </button>
            )}
          </div>
        </div>
        <EngineNotice />
      </div>
    </div>
  );
}
