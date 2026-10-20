"use client";

import { ArrowLeft, Image as ImageIcon, Link2, Loader2, Share2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ExerciseView, practiceFilters } from "~/components/exercise";
import { netError } from "~/components/pwa";
import { exerciseImage } from "~/components/share-image";
import { api } from "~/trpc/react";

const NOT_FOUND = "No encontramos ese ejercicio";

export default function ExercisePage() {
  const { id } = useParams<{ id: string }>();
  // Next no sube si el inicio de la página ya asoma (p. ej. tras bajar un poco para tocar "Siguiente"),
  // y el encabezado fijo tapa la fila de Practicar/Compartir.
  useEffect(() => window.scrollTo(0, 0), [id]);
  // Con `key`, "Siguiente" empieza con el menú y la imagen limpios.
  return (
    <Suspense>
      <ExerciseById key={id} id={id} />
    </Suspense>
  );
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Ejercicio por URL (D5): público; solo el dueño guarda resultado y ve "Siguiente" (D4). */
function ExerciseById({ id }: { id: string }) {
  const { side, gameId, query } = practiceFilters(useSearchParams());
  const q = api.practice.byId.useQuery({ id }, { retry: false, refetchOnWindowFocus: false });
  const owner = !!q.data?.owner;
  const next = api.practice.next.useQuery({ id, side, gameId }, { enabled: owner, refetchOnWindowFocus: false });
  const submit = api.practice.submitResult.useMutation();
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // PNG listo antes de tocar "Imagen": `navigator.share` exige activación reciente (D5).
  const [png, setPng] = useState<Blob | "error" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const down = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
    };
  }, [menu]);

  function openMenu() {
    setMenu(!menu);
    setNote(null);
    const ex = q.data?.exercise;
    if (menu || !ex || png) return;
    exerciseImage(ex.fen, ex.sideToMove === "b" ? "black" : "white", ex.sideToMove).then(setPng, () => setPng("error"));
  }

  async function shareLink() {
    setMenu(false);
    const url = window.location.href;
    try {
      if (navigator.share) return await navigator.share({ title: "Ejercicio de ajedrez", url });
    } catch (e) {
      if (isAbort(e)) return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote("Enlace copiado");
    } catch {
      setNote("No se pudo copiar el enlace");
    }
  }

  async function shareImage() {
    if (!(png instanceof Blob)) return;
    setMenu(false);
    const file = new File([png], "ejercicio.png", { type: "image/png" });
    // Solo en táctiles: en escritorio `share` abriría la hoja del sistema en vez de descargar.
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try {
        return await navigator.share({ files: [file] });
      } catch (e) {
        if (isAbort(e)) return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = "ejercicio.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  if (q.isLoading) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted" aria-label="Cargando" />;
  if (!q.data)
    return (
      <div className="card mx-auto mt-8 max-w-md p-6 text-center">
        <p className="font-semibold">{q.error?.data?.code === "NOT_FOUND" ? NOT_FOUND : netError(q.error, NOT_FOUND)}</p>
        <Link href="/practicar" className="btn-primary mt-4">
          Ir a Practicar
        </Link>
      </div>
    );

  const { exercise } = q.data;
  const nextId = next.data?.id;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {owner ? (
          <Link href={`/practicar${query}`} className="btn-ghost -ml-2">
            <ArrowLeft className="size-4" /> Practicar
          </Link>
        ) : (
          <Link href="/practicar" className="btn-ghost -ml-2 text-brand">
            Practica con tus partidas
          </Link>
        )}
        <div className="flex items-center gap-2">
          {note && (
            <span role="status" className="text-sm text-muted">
              {note}
            </span>
          )}
          <div ref={menuRef} className="relative">
            <button type="button" onClick={openMenu} aria-expanded={menu} aria-haspopup="menu" className="btn-secondary">
              <Share2 className="size-4" /> Compartir
            </button>
            {menu && (
              <div role="menu" className="card absolute right-0 z-20 mt-1 grid w-56 gap-1 p-1 shadow-lg">
                <button type="button" role="menuitem" onClick={() => void shareLink()} className="btn-ghost justify-start">
                  <Link2 className="size-4" /> Enlace
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void shareImage()}
                  disabled={!(png instanceof Blob)}
                  className="btn-ghost justify-start"
                >
                  {png === null ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />} Imagen
                </button>
                {png === "error" && <p className="px-3 pb-2 text-xs text-[#ffb4a8]">No se pudo crear la imagen</p>}
              </div>
            )}
          </div>
        </div>
      </div>
      {submit.error && <p className="mb-2 text-sm text-[#ffb4a8]">{netError(submit.error, "No se pudo guardar el resultado")}</p>}
      <ExerciseView
        key={exercise.id}
        ex={exercise}
        onResult={owner ? (o) => submit.mutate({ exerciseId: exercise.id, ...o }) : undefined}
        nextLink={
          owner && !next.isLoading
            ? nextId
              ? { href: `/practicar/${nextId}${query}`, label: "Siguiente" }
              : { href: `/practicar${query}`, label: "Volver a la lista" }
            : undefined
        }
      />
    </div>
  );
}
