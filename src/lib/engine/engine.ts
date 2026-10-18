// UCI wrapper around Stockfish running in a Web Worker (design D3). Browser only.
//
// Engine binaries in public/engine/ are copied verbatim from the npm package
// `stockfish` v19.0.1 (nmrugg/stockfish.js, node_modules/stockfish/bin), GPL-3.0
// (see public/engine/COPYING.txt; source: https://github.com/nmrugg/stockfish.js).
// The .js derives its .wasm URL from its own path (`.js` -> `.wasm`), so both
// files must sit side by side in /engine/.
import type { EngineLine, Eval } from "../types";
import { parseInfo, replay, terminalEval, toWhitePov, type InfoLine } from "./uci";

const LITE = "/engine/stockfish-19-lite-single.js";
const ASM = "/engine/stockfish-19-asm.js";

export type AnalyzeRequest = {
  startFen: string;
  moves: string[];
  depth: number;
  multipv: number;
  searchmoves?: string[];
};

export type AnalyzeResult = {
  /** Ordered by multipv; empty for terminal positions. Evals from White's point of view. */
  lines: EngineLine[];
  /** Principal variation (UCI) of line 1. */
  pv: string[];
  /** Position eval (White POV): line 1, or the chess.js verdict for terminal positions. */
  eval: Eval;
};

function abortError() {
  return new DOMException("Análisis cancelado", "AbortError");
}

function hasWasm(): boolean {
  try {
    // Smallest valid module: magic + version.
    return (
      typeof WebAssembly === "object" &&
      WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
    );
  } catch {
    return false;
  }
}

/** Starts a worker and waits for `uciok`; rejects if the script fails to load. */
function boot(url: string): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    const timer = setTimeout(() => fail(new Error("timeout")), 30_000);
    function fail(err: unknown) {
      clearTimeout(timer);
      worker.terminate();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
    worker.onerror = (e) => fail(new Error(e.message || "worker error"));
    worker.onmessage = (e: MessageEvent) => {
      if (e.data === "uciok") {
        clearTimeout(timer);
        worker.onerror = null;
        worker.onmessage = null;
        resolve(worker);
      }
    };
    worker.postMessage("uci");
  });
}

export class Engine {
  /** "sf19-lite" or "sf19-asm" (fallback without WebAssembly). */
  readonly flavor: string;
  private worker: Worker;
  private listener: ((line: string) => void) | null = null;
  private onCrash: ((err: Error) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private dead = false;

  private constructor(worker: Worker, flavor: string) {
    this.worker = worker;
    this.flavor = flavor;
    worker.onmessage = (e: MessageEvent) => {
      if (typeof e.data === "string") this.listener?.(e.data);
    };
    worker.onerror = (e) => this.onCrash?.(new Error(e.message || "El motor se detuvo"));
  }

  static async create(): Promise<Engine> {
    let engine: Engine | null = null;
    if (hasWasm()) {
      try {
        engine = new Engine(await boot(LITE), "sf19-lite");
      } catch {
        // fall through to asm.js
      }
    }
    if (!engine) {
      try {
        engine = new Engine(await boot(ASM), "sf19-asm");
      } catch {
        throw new Error("Tu navegador no puede ejecutar el motor");
      }
    }
    engine.send("ucinewgame");
    await engine.run((resolve) => {
      engine.send("isready");
      return (line) => line === "readyok" && resolve(undefined);
    });
    return engine;
  }

  /** Requests run one at a time, in call order. */
  analyze(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResult> {
    const job = this.queue.then(() => this.doAnalyze(req, signal));
    this.queue = job.catch(() => undefined);
    return job;
  }

  terminate(): void {
    this.dead = true;
    this.worker.terminate();
    this.onCrash?.(new Error("Motor terminado"));
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  /** Installs a line listener until `resolve`/`reject` is called. */
  private run<T>(
    start: (resolve: (v: T) => void, reject: (e: unknown) => void) => (line: string) => void,
  ): Promise<T> {
    if (this.dead) return Promise.reject(new Error("Motor terminado"));
    return new Promise<T>((resolve, reject) => {
      const done = () => {
        this.listener = null;
        this.onCrash = null;
      };
      this.onCrash = (err) => {
        done();
        reject(err);
      };
      this.listener = start(
        (v) => {
          done();
          resolve(v);
        },
        (e) => {
          done();
          reject(e);
        },
      );
    });
  }

  private async doAnalyze(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResult> {
    if (signal?.aborted) throw abortError();
    const chess = replay(req.startFen, req.moves);
    const terminal = terminalEval(chess);
    if (terminal) return { lines: [], pv: [], eval: terminal };
    const turn = chess.turn();

    const latest = new Map<number, InfoLine>();
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      this.send("stop");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      await this.run<void>((resolve) => {
        this.send(`setoption name MultiPV value ${req.multipv}`);
        this.send(`position fen ${req.startFen}${req.moves.length ? ` moves ${req.moves.join(" ")}` : ""}`);
        const sm = req.searchmoves?.length ? ` searchmoves ${req.searchmoves.join(" ")}` : "";
        this.send(`go depth ${req.depth}${sm}`);
        return (line) => {
          if (line.startsWith("bestmove")) return resolve();
          const info = parseInfo(line);
          if (!info) return;
          // Keep exact scores over bounds from the same line.
          const prev = latest.get(info.multipv);
          if (!info.bound || !prev || prev.bound || prev.depth < info.depth) latest.set(info.multipv, info);
        };
      });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
    if (aborted) throw abortError();

    const lines = [...latest.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, l]) => ({ uci: l.pv[0]!, eval: toWhitePov(l.score, turn) }));
    const first = latest.get(1) ?? [...latest.values()][0];
    if (!first || !lines[0]) throw new Error("El motor no devolvió análisis");
    return { lines, pv: first.pv, eval: lines[0].eval };
  }
}
