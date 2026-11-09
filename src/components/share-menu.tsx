"use client";

import { Image as ImageIcon, Link2, Loader2, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Exercise } from "~/components/exercise";
import { exerciseImage } from "~/components/share-image";

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** "Compartir" de un ejercicio (D5): enlace a `/practicar/<id>` o imagen del tablero. */
export function ShareMenu({ ex, className = "" }: { ex: Exercise; className?: string }) {
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
    if (menu || png) return;
    exerciseImage(ex.fen, ex.sideToMove === "b" ? "black" : "white", ex.sideToMove).then(setPng, () => setPng("error"));
  }

  async function shareLink() {
    setMenu(false);
    // En la sesión de /practicar la URL no es la del ejercicio.
    const url = `${window.location.origin}/practicar/${ex.id}`;
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

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button type="button" onClick={openMenu} aria-expanded={menu} aria-haspopup="menu" className="btn-secondary w-full">
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
      {note && (
        <p role="status" className="mt-1 text-center text-sm text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
