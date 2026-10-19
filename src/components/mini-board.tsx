/** Miniatura estática de una posición (D4): cuadrícula CSS con piezas cburnett, sin react-chessboard. */
export function MiniBoard({ fen, orientation = "white", className = "" }: { fen: string; orientation?: "white" | "black"; className?: string }) {
  const rows = (fen.split(" ")[0] ?? "").split("/").map((r) => r.replace(/\d/g, (n) => ".".repeat(Number(n))).split(""));
  const cells = rows.flatMap((row, r) => row.map((p, c) => ({ p, dark: (r + c) % 2 === 1 })));
  const ordered = orientation === "black" ? cells.reverse() : cells;
  return (
    <div
      role="img"
      aria-label={`Posición: ${fen.split(" ")[0]}`}
      className={`grid aspect-square grid-cols-8 overflow-hidden rounded-md ${className}`}
    >
      {ordered.map(({ p, dark }, i) => (
        <div key={i} className={dark ? "bg-board-dark" : "bg-board-light"}>
          {p !== "." && (
            <img
              src={`/pieces/cburnett/${p === p.toUpperCase() ? "w" : "b"}${p.toUpperCase()}.svg`}
              alt=""
              loading="lazy"
              draggable={false}
              className="size-full"
            />
          )}
        </div>
      ))}
    </div>
  );
}
