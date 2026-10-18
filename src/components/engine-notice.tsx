/** Aviso de licencia de Stockfish (GPL-3.0), D3. */
export function EngineNotice() {
  return (
    <p className="text-xs leading-relaxed text-muted">
      Análisis con{" "}
      <a className="underline hover:text-fg" href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noreferrer">
        Stockfish
      </a>{" "}
      (GPL-3.0), compilado a WebAssembly por{" "}
      <a className="underline hover:text-fg" href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">
        stockfish.js
      </a>
      . Corre en tu dispositivo.
    </p>
  );
}
