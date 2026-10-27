"use client";

import { Download, LogIn, LogOut, Menu, Puzzle, Swords, Upload, User, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "~/server/better-auth/client";
import { Logo } from "./logo";
import { PwaBanners, useInstall } from "./pwa";
import { setSoundOn, soundOn } from "./sound";

const NAV = [
  { href: "/", label: "Importar", icon: Upload, match: (p: string) => p === "/" || p.startsWith("/analizar") },
  { href: "/partidas", label: "Mis partidas", icon: Swords, match: (p: string) => p.startsWith("/partidas") },
  { href: "/practicar", label: "Practicar", icon: Puzzle, match: (p: string) => p.startsWith("/practicar") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-ink/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-3 sm:px-4">
          <Link href="/" className="flex min-h-11 items-center" aria-label="AjedrezLab, inicio">
            <Logo />
          </Link>
          <nav aria-label="Principal" className="ml-4 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.match(path) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                  n.match(path) ? "bg-raised text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <AccountMenu path={path} />
          </div>
        </div>
      </header>
      <PwaBanners />
      <main className="mx-auto w-full max-w-6xl px-3 pt-3 pb-10 sm:px-4">{children}</main>
    </>
  );
}

/** `≥ md`: avatar con menú de cuenta. `< md`: hamburguesa con cuenta, páginas, instalar y sesión (D6). */
function AccountMenu({ path }: { path: string }) {
  const { data: session } = authClient.useSession();
  const install = useInstall();
  const [open, setOpen] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  // El menú solo se pinta abierto en el cliente, así que leer localStorage aquí no desajusta la hidratación.
  const [sound, setSound] = useState(soundOn);
  const ref = useRef<HTMLDivElement>(null);

  // Atrás/adelante u otra navegación: el panel no se queda abierto en la página nueva.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        setOpen(false);
        // Hay dos disparadores (hamburguesa y avatar); el oculto tiene offsetParent null.
        [...(ref.current?.querySelectorAll<HTMLButtonElement>("button[aria-haspopup]") ?? [])]
          .find((b) => b.offsetParent)
          ?.focus();
      } else if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-raised";
  const trigger = {
    type: "button" as const,
    "aria-expanded": open,
    "aria-haspopup": "menu" as const,
    onClick: () => setOpen(!open),
  };
  const avatar = (size: string) =>
    session ? (
      <span className="text-sm font-bold uppercase">{session.user.email.slice(0, 1)}</span>
    ) : (
      <User className={size} />
    );

  return (
    <div ref={ref} className="relative">
      <button {...trigger} aria-label="Menú" className="flex size-11 items-center justify-center rounded-lg hover:bg-raised md:hidden">
        <Menu className="size-6" />
      </button>
      <button
        {...trigger}
        aria-label="Cuenta"
        className="hidden size-11 items-center justify-center rounded-full bg-raised ring-1 ring-line hover:bg-line md:flex"
      >
        {avatar("size-5")}
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 mt-2 w-64 p-1.5 shadow-2xl">
          <div className="flex items-center gap-3 px-3 py-2 md:hidden">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised ring-1 ring-line">
              {avatar("size-4")}
            </span>
            <span className="truncate text-sm text-muted">{session ? session.user.email : "Sin cuenta"}</span>
          </div>
          {session && <p className="hidden truncate px-3 py-2 text-xs text-muted md:block">{session.user.email}</p>}
          <nav aria-label="Principal" className="border-y border-line/60 py-1 md:hidden">
            {NAV.map((n) => (
              <Link
                key={n.href}
                role="menuitem"
                href={n.href}
                aria-current={n.match(path) ? "page" : undefined}
                // También en la página actual, donde `path` no cambia.
                onClick={() => setOpen(false)}
                className={`${item} ${n.match(path) ? "bg-raised text-brand" : ""}`}
              >
                <n.icon className="size-4" /> {n.label}
              </Link>
            ))}
          </nav>
          {install.available && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => (install.ios ? setIosHelp(!iosHelp) : void install.install().then(() => setOpen(false)))}
            >
              <Download className="size-4" /> Instalar app
            </button>
          )}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={sound}
            className={item}
            onClick={() => {
              setSoundOn(!sound);
              setSound(!sound);
            }}
          >
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} Sonido {sound ? "activado" : "desactivado"}
          </button>
          {iosHelp && install.ios && (
            <p className="px-3 pb-2 text-xs text-muted">En Safari: Compartir → Agregar a pantalla de inicio.</p>
          )}
          {session ? (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={async () => {
                await authClient.signOut();
                // Recarga completa: descarta la caché de React Query del usuario anterior.
                window.location.assign("/");
              }}
            >
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          ) : (
            <Link role="menuitem" href="/login" className={item} onClick={() => setOpen(false)}>
              <LogIn className="size-4" /> Iniciar sesión
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
