import type { Eval } from "~/lib/types";
import { formatEval, whiteShare } from "./chess";

/** Barra vertical desde blancas. Con orientación negra, blancas quedan arriba. */
export function EvalBar({ value, fen, orientation }: { value?: Eval; fen?: string; orientation: "white" | "black" }) {
  const share = whiteShare(value, fen);
  const label = formatEval(value, fen);
  const whiteAhead = share >= 0.5;
  const flip = orientation === "black";
  return (
    <div
      role="meter"
      aria-label="Evaluación"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={label}
      className={`relative flex w-3.5 shrink-0 overflow-hidden select-none [-webkit-touch-callout:none] rounded-sm bg-[#3b3f3c] sm:w-6 ${flip ? "flex-col" : "flex-col-reverse"}`}
    >
      <div className="bg-[#f2f3ee] transition-[height] duration-500 ease-out" style={{ height: `${share * 100}%` }} />
      <span
        className={`absolute inset-x-0 hidden text-center font-mono text-[10px] leading-4 font-bold sm:block ${
          whiteAhead !== flip ? "bottom-0.5" : "top-0.5"
        } ${whiteAhead ? "text-[#2a2e2b]" : "text-[#f2f3ee]"}`}
      >
        {label.replace("+", "")}
      </span>
    </div>
  );
}
