/// <reference lib="webworker" />
// Service worker (D13), compilado por @serwist/next a public/sw.js en `next build`.
import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/** Datos de usuario y auth: nunca desde caché. */
const PRIVATE = /^\/(api|partidas|practicar|login|registro)(\/|$)/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { ignoreURLParametersMatching: [/.*/] },
  skipWaiting: false, // espera a "Recargar" (aviso de versión nueva)
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    { matcher: ({ url, sameOrigin }) => sameOrigin && PRIVATE.test(url.pathname), handler: new NetworkOnly() },
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/engine/"), handler: new CacheFirst({ cacheName: "engine" }) },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

self.addEventListener("message", (e: ExtendableMessageEvent) => {
  if ((e.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
