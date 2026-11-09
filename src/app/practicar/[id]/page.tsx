"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ExerciseView, practiceFilters } from "~/components/exercise";
import { netError } from "~/components/pwa";
import { api } from "~/trpc/react";

const NOT_FOUND = "No encontramos ese ejercicio";

export default function ExercisePage() {
  const { id } = useParams<{ id: string }>();
  // Llaves: en Chrome `scrollTo` devuelve una Promise y React la tomaría como cleanup ("destroy is not a function").
  // Next no sube si el inicio de la página ya asoma (p. ej. tras bajar un poco para tocar "Siguiente"),
  // y el encabezado fijo tapa la fila de Practicar.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);
  return (
    <Suspense>
      <ExerciseById key={id} id={id} />
    </Suspense>
  );
}

/** Ejercicio por URL (D5): público; solo el dueño guarda resultado y ve "Siguiente" (D4). */
function ExerciseById({ id }: { id: string }) {
  const { side, gameId, query } = practiceFilters(useSearchParams());
  const q = api.practice.byId.useQuery({ id }, { retry: false, refetchOnWindowFocus: false });
  const owner = !!q.data?.owner;
  const next = api.practice.next.useQuery({ id, side, gameId }, { enabled: owner, refetchOnWindowFocus: false });
  const submit = api.practice.submitResult.useMutation();

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
