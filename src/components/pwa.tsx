"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// beforeinstallprompt llega una sola vez y temprano: se guarda a nivel de módulo.
let deferred: BIPEvent | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => !!deferred, () => false);
  const [env, setEnv] = useState({ standalone: true, ios: false });
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setEnv({ standalone, ios });
  }, []);
  return {
    /** Mostrar "Instalar app": hay prompt nativo o es iOS, y no está instalada. */
    available: !env.standalone && (canPrompt || env.ios),
    ios: env.ios && !canPrompt,
    async install() {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      deferred = null;
      emit();
    },
  };
}

export function useOnline() {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener("online", f);
      window.addEventListener("offline", f);
      return () => {
        window.removeEventListener("online", f);
        window.removeEventListener("offline", f);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Mensaje de error para acciones que requieren red. */
export function netError(e: unknown, fallback = "Algo salió mal") {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Sin conexión";
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Registra el service worker (solo producción) y muestra los avisos de red y de versión nueva. */
export function PwaBanners() {
  const online = useOnline();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onController = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onController);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex flex-col items-center gap-2 px-3 pt-2">
      {!online && (
        <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#3a2b12] px-4 py-2 text-sm font-medium text-[#ffd98a] shadow-lg ring-1 ring-[#6b5221]">
          <WifiOff className="size-4" /> Sin conexión
        </div>
      )}
      {waiting && (
        <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-full bg-raised py-1.5 pr-1.5 pl-4 text-sm shadow-lg ring-1 ring-line">
          Hay una nueva versión
          <button type="button" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })} className="btn-primary rounded-full px-3 text-sm">
            <RefreshCw className="size-4" /> Recargar
          </button>
        </div>
      )}
    </div>
  );
}
