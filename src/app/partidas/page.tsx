"use client";

import { ChevronRight, Cpu, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { ClassIcon } from "~/components/class-icon";
import { netError } from "~/components/pwa";
import type { Color } from "~/lib/types";
import { api } from "~/trpc/react";

export default function GamesPage() {
  const utils = api.useUtils();
  const list = api.games.list.useQuery();
  const del = api.games.delete.useMutation({ onSuccess: () => utils.games.list.invalidate() });
  const setColor = api.games.setUserColor.useMutation({ onSuccess: () => utils.games.list.invalidate() });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3 py-3">
        <h1 className="text-2xl font-black tracking-tight">Mis partidas</h1>
        <Link href="/" className="btn-secondary">
          Importar
        </Link>
      </div>

      {list.isLoading && <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted" aria-label="Cargando" />}
      {list.error && <p className="text-sm text-[#ffb4a8]">{netError(list.error, "No se pudieron cargar tus partidas")}</p>}
      {list.data?.length === 0 && (
        <div className="card p-6 text-center">
          <p className="font-semibold">Aún no tienes partidas</p>
          <p className="mt-1 text-sm text-muted">Importa una por PGN, link o usuario.</p>
          <Link href="/" className="btn-primary mt-4">
            Importar partidas
          </Link>
        </div>
      )}
      {(del.error ?? setColor.error) && (
        <p className="mb-2 text-sm text-[#ffb4a8]" role="alert">
          {netError(del.error ?? setColor.error)}
        </p>
      )}

      <ul className="grid gap-2">
        {list.data?.map((g) => (
          <li key={g.id} className="card p-3">
            <div className="flex items-center gap-3">
              <Link href={`/partidas/${g.id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  <span className={g.userColor === "w" ? "text-brand" : undefined}>{g.white}</span>
                  <span className="mx-1.5 text-muted">vs</span>
                  <span className={g.userColor === "b" ? "text-brand" : undefined}>{g.black}</span>
                  <span className="ml-2 font-mono text-xs text-muted">{g.result}</span>
                </p>
                <p className="truncate text-xs text-muted">
                  {[g.openingName, g.timeClass, g.playedAt ? new Date(g.playedAt).toLocaleDateString("es-MX") : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
              {g.analyzed ? (
                <Link href={`/partidas/${g.id}`} className="flex min-h-11 items-center gap-2 text-sm" aria-label="Ver análisis">
                  {g.accuracyUser !== null && (
                    <span className="rounded bg-raised px-1.5 py-0.5 font-mono font-bold" title="Tu precisión">
                      {g.accuracyUser.toFixed(1)}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5" title="Errores">
                    <ClassIcon cls="blunder" size={16} /> {g.mistakes ?? 0}
                  </span>
                  <span className="flex items-center gap-0.5" title="Brillantes">
                    <ClassIcon cls="brilliant" size={16} /> {g.brilliants ?? 0}
                  </span>
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              ) : (
                <Link href={`/partidas/${g.id}`} className="btn-primary px-3">
                  <Cpu className="size-4" /> Analizar
                </Link>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
              <label className="flex items-center gap-2 text-xs text-muted">
                Yo soy
                <select
                  value={g.userColor ?? ""}
                  onChange={(e) => setColor.mutate({ id: g.id, color: (e.target.value || null) as Color | null })}
                  className="field min-h-11 w-auto py-0 text-sm"
                >
                  <option value="w">Blancas ({g.white})</option>
                  <option value="b">Negras ({g.black})</option>
                  <option value="">Ninguno</option>
                </select>
              </label>
              <button
                type="button"
                aria-label={`Borrar ${g.white} vs ${g.black}`}
                className="btn-ghost ml-auto px-3 hover:text-[#ffb4a8]"
                disabled={del.isPending}
                onClick={() => {
                  if (confirm("¿Borrar esta partida? También se borran su análisis y sus ejercicios.")) del.mutate({ id: g.id });
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
