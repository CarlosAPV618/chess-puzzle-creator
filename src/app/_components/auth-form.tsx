"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { netError } from "~/components/pwa";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

const CLOSED_MSG = "Registro cerrado: se alcanzó el límite de cuentas";

function authMessage(err: { code?: string; message?: string; status?: number }) {
  const key = `${err.code ?? ""} ${err.message ?? ""}`;
  if (key.includes("SIGNUP_CLOSED")) return CLOSED_MSG;
  if (/USER_ALREADY_EXISTS|already exists/i.test(key)) return "Ya existe una cuenta con ese correo";
  if (/INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|INVALID_EMAIL/i.test(key)) return "Correo o contraseña incorrectos";
  if (/PASSWORD_TOO_SHORT/i.test(key)) return "La contraseña debe tener al menos 8 caracteres";
  if (err.status === 429) return "Demasiados intentos. Espera un minuto.";
  return netError(null, "No se pudo completar. Intenta de nuevo.");
}

/** Solo rutas internas para `next` (evita redirecciones abiertas). */
const safeNext = (n: string | null) => (n?.startsWith("/") && !n.startsWith("//") ? n : "/partidas");

function Form({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const status = api.auth.signupStatus.useQuery();
  const closed = status.data?.open === false;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qs = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: email.split("@")[0] ?? email });
    if (res.error) {
      setError(authMessage(res.error));
      setBusy(false);
      return;
    }
    // Navegación completa: `router.refresh()` tras `push` cancela la navegación en Next 15,
    // y así toda la app relee la sesión nueva.
    window.location.assign(next);
  }

  const title = mode === "login" ? "Iniciar sesión" : "Crear cuenta";

  return (
    <div className="mx-auto mt-6 max-w-sm sm:mt-12">
      <div className="card p-5 sm:p-6">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {mode === "signup" && closed ? (
          <p className="mt-4 rounded-lg bg-raised p-3 text-sm" role="alert">
            {CLOSED_MSG}.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Correo
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Contraseña
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
              />
            </label>
            {error && (
              <p className="text-sm text-[#ffb4a8]" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary mt-1 w-full">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          closed ? (
            CLOSED_MSG
          ) : (
            <>
              ¿No tienes cuenta?{" "}
              <Link href={`/registro${qs}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                Crear cuenta
              </Link>
            </>
          )
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href={`/login${qs}`} className="font-semibold text-brand underline-offset-2 hover:underline">
              Iniciar sesión
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return (
    <Suspense>
      <Form mode={mode} />
    </Suspense>
  );
}
