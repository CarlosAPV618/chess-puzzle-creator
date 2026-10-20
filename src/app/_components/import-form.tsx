"use client";

import { ChevronRight, ClipboardPaste, Link2, Loader2, UserSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearPending, setCurrentGame } from "~/components/game-store";
import { netError } from "~/components/pwa";
import { fetchChesscomGame, fetchChesscomUserGames } from "~/lib/import/chesscom";
import { fetchLichessGame, fetchLichessUserGames } from "~/lib/import/lichess";
import { detectUserColor, parsePgnText } from "~/lib/import/pgn";
import { parseGameUrl } from "~/lib/import/urls";
import type { Color, ParsedGame } from "~/lib/types";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

type Tab = "pgn" | "link" | "user";
type Row = ParsedGame & { asked?: boolean };

const TABS: { id: Tab; label: string; icon: typeof Link2 }[] = [
  { id: "pgn", label: "Pegar PGN", icon: ClipboardPaste },
  { id: "link", label: "Link", icon: Link2 },
  { id: "user", label: "Usuario", icon: UserSearch },
];

export function ImportForm() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const logged = !!session;
  const players = api.players.list.useQuery(undefined, { enabled: logged });
  const accounts = api.players.accounts.useQuery(undefined, { enabled: logged });
  const addPlayer = api.players.add.useMutation();
  const importGames = api.games.import.useMutation();

  const [tab, setTab] = useState<Tab>("pgn");
  const [pgn, setPgn] = useState("");
  const [link, setLink] = useState("");
  const [platform, setPlatform] = useState<"lichess" | "chesscom">("lichess");
  const [user, setUser] = useState("");
  const [max, setMax] = useState(20);
  // Prellenado (D9): solo mientras el usuario no editó el nombre. La pestaña inicial siempre es "Pegar PGN".
  const [userEdited, setUserEdited] = useState(false);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

  const names = players.data ?? [];
  const acc = accounts.data;

  useEffect(() => {
    if (!acc || userEdited) return;
    const recent = (["lichess", "chesscom"] as const)
      .filter((p) => acc[p])
      .sort((a, b) => new Date(acc[b]!.at).getTime() - new Date(acc[a]!.at).getTime())[0];
    if (!recent) return;
    setPlatform(recent);
    setUser(acc[recent]!.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al llegar las cuentas
  }, [acc]);

  function choosePlatform(p: "lichess" | "chesscom") {
    setPlatform(p);
    if (!userEdited && acc) setUser(acc[p]?.name ?? "");
  }
  // Sin sesión resuelta aún no se sabe si guardar o abrir en memoria: los botones esperan.
  const waiting = busy || sessionPending;

  /** Abre una partida: sin cuenta en memoria (/analizar); con cuenta, se guarda y va a /partidas/[id]. */
  async function open(g: ParsedGame) {
    if (!logged) {
      clearPending();
      setCurrentGame(g);
      router.push("/analizar");
      return;
    }
    setBusy(true);
    try {
      const r = await importGames.mutateAsync({ games: [g] });
      router.push(`/partidas/${r.ids[0]}`);
    } catch (e) {
      setErrors([netError(e, "No se pudo guardar")]);
    } finally {
      setBusy(false);
    }
  }

  function receive(games: ParsedGame[], errs: string[], note?: string) {
    const list: Row[] = games.map((g) => ({ ...g, userColor: g.userColor ?? (logged ? detectUserColor(g, names) : null) }));
    setErrors(errs);
    setStatus(note ?? null);
    setRows(list);
    const only = list[0];
    if (list.length === 1 && only && only.userColor) void open(only);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErrors([]);
    setStatus(null);
    setRows([]);
    try {
      await fn();
    } catch (e) {
      setErrors([netError(e, "No se pudo importar")]);
    } finally {
      setBusy(false);
    }
  }

  const fromPgn = () =>
    run(async () => {
      const r = await parsePgnText(pgn);
      receive(r.games, r.errors.map((e) => e.message));
    });

  const fromLink = () =>
    run(async () => {
      const u = parseGameUrl(link);
      if (!u) {
        setErrors(["Link no reconocido. Acepta partidas de lichess.org y chess.com/game/…, o pega el PGN."]);
        return;
      }
      const g = u.platform === "lichess" ? await fetchLichessGame(u.id) : await fetchChesscomGame(u.type, u.id);
      // lichess.org/<id>/black abre orientada a negras.
      const hinted: Color | null = /\/black\/?$/.test(link.trim()) ? "b" : /\/white\/?$/.test(link.trim()) ? "w" : null;
      receive([{ ...g, userColor: g.userColor ?? hinted }], []);
    });

  const fromUser = () =>
    run(async () => {
      const onProgress = (p: { fetched: number; message?: string }) =>
        setStatus(p.message ?? `${p.fetched} partidas recibidas…`);
      const r =
        platform === "lichess"
          ? await fetchLichessUserGames(user, max, onProgress)
          : await fetchChesscomUserGames(user, max, onProgress);
      const notes = [r.unsupported ? `${r.unsupported} no soportadas (variante)` : "", r.warning ?? ""].filter(Boolean);
      receive(r.games, [], notes.join(" · ") || undefined);
      // El usuario de plataforma es un nombre propio: se recuerda para detectar el color en PGN.
      if (logged && r.games.length && !names.some((n) => n.toLowerCase() === user.trim().toLowerCase()))
        addPlayer.mutate({ name: user.trim() });
    });

  async function saveAll() {
    setBusy(true);
    try {
      const r = await importGames.mutateAsync({ games: rows });
      setStatus(`${r.inserted} nuevas, ${r.skipped} ya estaban`);
      router.push("/partidas");
    } catch (e) {
      setErrors([netError(e, "No se pudo guardar")]);
    } finally {
      setBusy(false);
    }
  }

  function chooseColor(i: number, c: Color | null) {
    const g = rows[i];
    if (!g) return;
    setRows(rows.map((r, j) => (j === i ? { ...r, userColor: c, asked: true } : r)));
    if (logged && c) addPlayer.mutate({ name: c === "w" ? g.white : g.black });
    if (rows.length === 1) void open({ ...g, userColor: c });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <section className="py-4 sm:py-8">
        <h1 className="text-3xl leading-tight font-black tracking-tight sm:text-4xl">
          Tus partidas, <span className="text-brand">tus ejercicios</span>
        </h1>
        <p className="mt-2 max-w-lg text-muted">
          Importa una partida, analízala con Stockfish y practica los momentos donde se decidió.
        </p>
      </section>

      <div className="card overflow-hidden">
        <div role="tablist" aria-label="Forma de importar" className="grid grid-cols-3 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex min-h-12 items-center justify-center gap-2 text-sm font-semibold transition ${
                tab === t.id ? "bg-raised text-fg shadow-[inset_0_-2px_0_var(--color-brand)]" : "text-muted hover:text-fg"
              }`}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>

        <form
          className="grid gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void (tab === "pgn" ? fromPgn() : tab === "link" ? fromLink() : fromUser());
          }}
        >
          {tab === "pgn" && (
            <textarea
              aria-label="PGN"
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder={'[Event "..."]\n1. e4 e5 2. Nf3 Nc6 ...'}
              className="field py-2 font-mono text-sm"
            />
          )}
          {tab === "link" && (
            <input
              aria-label="Link de la partida"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              placeholder="https://lichess.org/abcd1234 o chess.com/game/live/…"
              className="field"
            />
          )}
          {tab === "user" && (
            <div className="grid gap-3">
              <div role="radiogroup" aria-label="Plataforma" className="grid grid-cols-2 gap-1 rounded-lg bg-ink p-1">
                {(["lichess", "chesscom"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={platform === p}
                    onClick={() => choosePlatform(p)}
                    className={`min-h-11 rounded-md text-sm font-semibold ${platform === p ? "bg-raised text-fg ring-1 ring-line" : "text-muted"}`}
                  >
                    {p === "lichess" ? "Lichess" : "Chess.com"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  aria-label="Usuario"
                  value={user}
                  onChange={(e) => {
                    setUser(e.target.value);
                    setUserEdited(true);
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Nombre de usuario"
                  className="field"
                />
                <select aria-label="Número de partidas" value={max} onChange={(e) => setMax(Number(e.target.value))} className="field w-24">
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={waiting || (tab === "pgn" ? !pgn.trim() : tab === "link" ? !link.trim() : !user.trim())}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {tab === "user" ? "Traer partidas" : "Analizar"}
          </button>
        </form>
      </div>

      <div aria-live="polite" className="mt-4 grid gap-2">
        {status && <p className="text-sm text-muted">{status}</p>}
        {errors.map((e, i) => (
          <p key={i} className="rounded-lg bg-c-blunder/10 px-3 py-2 text-sm text-[#ffb4a8] ring-1 ring-c-blunder/30">
            {e}
          </p>
        ))}
      </div>

      {rows.length > 0 && (
        <section className="mt-4" aria-label="Partidas encontradas">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-bold">{rows.length === 1 ? "1 partida" : `${rows.length} partidas`}</h2>
            {logged && rows.length > 1 && (
              <button type="button" onClick={() => void saveAll()} disabled={waiting} className="btn-primary">
                Guardar todas
              </button>
            )}
          </div>
          <ul className="grid grid-cols-1 gap-2">
            {rows.map((g, i) => (
              <li key={`${g.source}-${g.sourceId}`} className="card p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      <Side color="w" mine={g.userColor === "w"} name={g.white} elo={g.whiteElo} />
                      <span className="mx-1.5 text-muted">vs</span>
                      <Side color="b" mine={g.userColor === "b"} name={g.black} elo={g.blackElo} />
                    </p>
                    <p className="text-xs text-muted">
                      {[g.result, g.timeClass, g.playedAt ? new Date(g.playedAt).toLocaleDateString("es-MX") : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Analizar ${g.white} vs ${g.black}`}
                    onClick={() => void open(g)}
                    disabled={waiting}
                    className="btn-secondary px-3"
                  >
                    Analizar <ChevronRight className="size-4" />
                  </button>
                </div>
                {!g.userColor && !g.asked && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <span className="text-sm font-semibold">¿Cuál eres tú?</span>
                    <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => chooseColor(i, "w")}>
                      {g.white}
                    </button>
                    <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => chooseColor(i, "b")}>
                      {g.black}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => chooseColor(i, null)}>
                      Ninguno
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Side({ color, mine, name, elo }: { color: Color; mine: boolean; name: string; elo: number | null }) {
  return (
    <span className={mine ? "text-brand" : undefined}>
      <span aria-hidden className={`mr-1 inline-block size-2.5 rounded-sm ${color === "w" ? "bg-[#f2f3ee]" : "bg-[#111] ring-1 ring-line"}`} />
      {name}
      {elo ? <span className="ml-1 text-xs font-normal text-muted">{elo}</span> : null}
    </span>
  );
}
