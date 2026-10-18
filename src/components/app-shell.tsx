"use client";

import { Download, LogIn, LogOut, Puzzle, Swords, Upload, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "~/server/better-auth/client";
import { PwaBanners, useInstall } from "./pwa";

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
          <Link href="/" className="flex min-h-11 items-center gap-2 font-bold tracking-tight" aria-label="Chess Puzzle Creator, inicio">
            <img src="/icons/icon.svg" alt="" width={30} height={30} className="rounded-md" />
            <span className="text-[15px] leading-none sm:text-base">
              Chess <span className="text-brand">Puzzle</span> Creator
            </span>
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
            <AccountMenu />
          </div>
        </div>
      </header>
      <PwaBanners />
      <main className="mx-auto w-full max-w-6xl px-3 pt-3 pb-24 sm:px-4 md:pb-10">{children}</main>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="grid h-16 grid-cols-3">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-brand" : "text-muted"}`}
              >
                <n.icon className="size-5" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function AccountMenu() {
  const { data: session } = authClient.useSession();
  const install = useInstall();
  const [open, setOpen] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-raised";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Cuenta"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="flex size-11 items-center justify-center rounded-full bg-raised ring-1 ring-line hover:bg-line"
      >
        {session ? (
          <span className="text-sm font-bold uppercase">{session.user.email.slice(0, 1)}</span>
        ) : (
          <User className="size-5" />
        )}
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 mt-2 w-64 p-1.5 shadow-2xl">
          {session && <p className="truncate px-3 py-2 text-xs text-muted">{session.user.email}</p>}
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
          <button type="button" aria-label="Cerrar menú" className={`${item} text-muted md:hidden`} onClick={() => setOpen(false)}>
            <X className="size-4" /> Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
