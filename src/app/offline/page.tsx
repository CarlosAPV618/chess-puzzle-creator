import { WifiOff } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <WifiOff className="mx-auto size-10 text-muted" />
      <h1 className="mt-3 text-xl font-bold">Sin conexión</h1>
      <p className="mt-2 text-sm text-muted">
        Esta página necesita internet. Sin red puedes pegar un PGN y analizarlo: el motor corre en tu dispositivo.
      </p>
      <Link href="/" className="btn-primary mt-5">
        Ir a Importar
      </Link>
    </div>
  );
}
