"use client";

import { ChevronRight, Cpu, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { ClassIcon } from "~/components/class-icon";
import { MiniBoard } from "~/components/mini-board";
import { netError } from "~/components/pwa";
import { dedupe, LoadMore, useLoadMore } from "~/hooks/use-load-more";
import type { Color } from "~/lib/types";
import { api } from "~/trpc/react";

export default function GamesPage() {
  const utils = api.useUtils();
  const list = api.games.list.useInfiniteQuery({}, { getNextPageParam: (l) => l.nextCursor });
  const games = dedupe(list.data?.pages);
  const sentinel = useRef<HTMLDivElement>(null);
  const auto = useLoadMore(
    sentinel,
    () => list.hasNextPage && !list.isFetching && !list.isFetchNextPageError && void list.fetchNextPage(),
    list.data?.pages.length,
  );
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
      {list.error && !list.data && <p className="text-sm text-[#ffb4a8]">{netError(list.error, "No se pudieron cargar tus partidas")}</p>}
      {list.data?.pages[0]?.items.length === 0 && (
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

      <ul className="grid grid-cols-1 gap-2">
        {games.map((g) => (
          // Toda la tarjeta abre la partida con un enlace estirado; borrar y "Yo soy" quedan encima (D8).
          <li key={g.id} className="card relative flex gap-3 p-3 transition hover:bg-raised">
            <div className="w-20 shrink-0 self-center sm:w-24">
              <MiniBoard fen={g.finalFen} orientation={g.userColor === "b" ? "black" : "white"} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start gap-2">
                <Link
                  href={`/partidas/${g.id}`}
                  aria-label={`Abrir ${g.white} vs ${g.black}`}
                  className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-[inherit]"
                >
                  <Player name={g.white} elo={g.whiteElo} mine={g.userColor === "w"} />
                  <Player name={g.black} elo={g.blackElo} mine={g.userColor === "b"} />
                </Link>
                <button
                  type="button"
                  aria-label={`Borrar ${g.white} vs ${g.black}`}
                  className="btn-ghost relative z-10 -mt-1 -mr-1 shrink-0 px-3 hover:text-[#ffb4a8]"
                  disabled={del.isPending}
                  onClick={() => {
                    if (confirm("¿Borrar esta partida? También se borran su análisis y sus ejercicios.")) del.mutate({ id: g.id });
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="truncate text-xs text-muted">
                {[g.result, g.timeClass, g.playedAt ? new Date(g.playedAt).toLocaleDateString("es-MX") : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {g.analyzed ? (
                  <span className="flex min-h-11 items-center gap-2 text-sm">
                    {g.accuracyUser !== null && (
                      <span className="rounded bg-raised px-1.5 py-0.5 font-mono font-bold" title="Tu precisión">
                        {g.accuracyUser.toFixed(1)}
                      </span>
                    )}
                    {!!g.brilliants && (
                      <span className="flex items-center gap-0.5" title="Brillantes">
                        <ClassIcon cls="brilliant" size={16} /> {g.brilliants}
                      </span>
                    )}
                    <ChevronRight className="size-4 text-muted" />
                  </span>
                ) : (
                  <span className="btn-primary px-3">
                    <Cpu className="size-4" /> Analizar
                  </span>
                )}
                {/* Solo si no se pudo detectar el color (D9); al elegir uno desaparece. */}
                {!g.userColor && (
                  <label className="relative z-10 flex min-w-0 items-center gap-2 text-xs text-muted">
                    Yo soy
                    <select
                      value=""
                      disabled={setColor.isPending}
                      onChange={(e) => e.target.value && setColor.mutate({ id: g.id, color: e.target.value as Color })}
                      className="field min-h-11 w-auto max-w-40 min-w-0 truncate py-0 text-sm"
                    >
                      <option value="" disabled>
                        Elegir…
                      </option>
                      <option value="w">Blancas ({g.white})</option>
                      <option value="b">Negras ({g.black})</option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div ref={sentinel} />
      {list.hasNextPage && (!auto || list.isFetchNextPageError) && (
        <LoadMore loading={list.isFetchingNextPage} error={list.isFetchNextPageError ? list.error : null} onClick={() => void list.fetchNextPage()} />
      )}
      {list.isFetchingNextPage && auto && <Loader2 className="mx-auto mt-3 size-5 animate-spin text-muted" aria-label="Cargando" />}
    </div>
  );
}

function Player({ name, elo, mine }: { name: string; elo: number | null; mine: boolean }) {
  return (
    <p className="flex min-w-0 items-baseline gap-1 text-sm font-semibold">
      <span className={`truncate ${mine ? "text-brand" : ""}`}>{name}</span>
      {elo ? <span className="shrink-0 text-xs font-normal text-muted">{elo}</span> : null}
    </p>
  );
}
