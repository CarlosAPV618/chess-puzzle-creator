"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { netError } from "~/components/pwa";

/**
 * Llama a `onVisible` cuando `ref` se acerca a la vista (D12). `key` cambia con cada tanda para
 * volver a observar: si el sentinel sigue visible tras cargar, pide la siguiente.
 * Devuelve false si no hay IntersectionObserver (se muestra "Cargar más").
 */
export function useLoadMore(ref: RefObject<Element | null>, onVisible: () => void, key: unknown) {
  const cb = useRef(onVisible);
  cb.current = onVisible;
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (typeof IntersectionObserver === "undefined") return setSupported(false);
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && cb.current(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, key]);
  return supported;
}

/** Une las tandas sin repetir ids. */
export function dedupe<T extends { id: string }>(pages: { items: T[] }[] | undefined) {
  const seen = new Set<string>();
  return (pages ?? []).flatMap((p) => p.items).filter((x) => !seen.has(x.id) && !!seen.add(x.id));
}

/** Respaldo de la carga automática: sin IntersectionObserver o si la tanda falló. */
export function LoadMore({ loading, error, onClick }: { loading: boolean; error: unknown; onClick: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
      <button type="button" onClick={onClick} disabled={loading} className="btn-secondary">
        {loading && <Loader2 className="size-4 animate-spin" />}
        Cargar más
      </button>
      {!!error && <span className="text-sm text-[#ffb4a8]">{netError(error, "No se pudo cargar")}</span>}
    </div>
  );
}
