import { CLASSIFICATIONS, type GameAnalysis } from "~/lib/types";
import { CLASS_META, ClassIcon } from "./class-icon";

/** Precisión y conteo por clase de cada jugador (estilo Game Review). */
export function Summary({
  analysis,
  white,
  black,
  firstColor = "w",
}: {
  analysis: Pick<GameAnalysis, "moves" | "accuracyWhite" | "accuracyBlack">;
  white: string;
  black: string;
  firstColor?: "w" | "b";
}) {
  const counts = { w: {} as Record<string, number>, b: {} as Record<string, number> };
  analysis.moves.forEach((m, i) => {
    const color = (i % 2 === 0) === (firstColor === "w") ? "w" : "b";
    counts[color][m.class] = (counts[color][m.class] ?? 0) + 1;
  });
  return (
    <section aria-label="Resumen" className="rounded-lg bg-panel p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <Player name={white} acc={analysis.accuracyWhite} light />
        <span className="text-xs text-muted">Precisión</span>
        <Player name={black} acc={analysis.accuracyBlack} />
      </div>
      <ul className="mt-3 grid gap-0.5 text-sm">
        {CLASSIFICATIONS.map((c) => (
          <li key={c} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center rounded px-1 py-0.5 even:bg-raised/40">
            <span className="text-center font-mono font-bold" style={{ color: CLASS_META[c].color }}>
              {counts.w[c] ?? 0}
            </span>
            <span className="flex items-center justify-center gap-1.5 text-fg/90">
              <ClassIcon cls={c} size={18} />
              {CLASS_META[c].label}
            </span>
            <span className="text-center font-mono font-bold" style={{ color: CLASS_META[c].color }}>
              {counts.b[c] ?? 0}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Player({ name, acc, light }: { name: string; acc: number; light?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted">{name}</div>
      <div
        className={`mx-auto mt-1 w-fit rounded-md px-3 py-1 font-mono text-xl font-bold ${
          light ? "bg-[#f2f3ee] text-[#1b1f1c]" : "bg-[#2b302d] text-fg ring-1 ring-line"
        }`}
      >
        {acc.toFixed(1)}
      </div>
    </div>
  );
}
