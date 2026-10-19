"use client";

import { ArrowLeft, Loader2, Share2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ExerciseView } from "~/components/exercise";
import { netError } from "~/components/pwa";
import { api } from "~/trpc/react";

const NOT_FOUND = "No encontramos ese ejercicio";

/** Ejercicio por URL (D5): público; solo el dueño guarda resultado. */
export default function ExercisePage() {
  const { id } = useParams<{ id: string }>();
  const q = api.practice.byId.useQuery({ id }, { retry: false, refetchOnWindowFocus: false });
  const submit = api.practice.submitResult.useMutation();
  const [note, setNote] = useState<string | null>(null);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) return await navigator.share({ title: "Ejercicio de ajedrez", url });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote("Enlace copiado");
    } catch {
      setNote("No se pudo copiar el enlace");
    }
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

  const { exercise, owner } = q.data;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {owner ? (
          <Link href="/practicar" className="btn-ghost -ml-2">
            <ArrowLeft className="size-4" /> Practicar
          </Link>
        ) : (
          <Link href="/practicar" className="btn-ghost -ml-2 text-brand">
            Practica con tus partidas
          </Link>
        )}
        <span className="flex items-center gap-2">
          {note && (
            <span role="status" className="text-sm text-muted">
              {note}
            </span>
          )}
          <button type="button" onClick={() => void share()} className="btn-secondary">
            <Share2 className="size-4" /> Compartir
          </button>
        </span>
      </div>
      {submit.error && <p className="mb-2 text-sm text-[#ffb4a8]">{netError(submit.error, "No se pudo guardar el resultado")}</p>}
      <ExerciseView
        key={exercise.id}
        ex={exercise}
        owner={owner}
        onResult={owner ? (o) => submit.mutate({ exerciseId: exercise.id, ...o }) : undefined}
      />
    </div>
  );
}
