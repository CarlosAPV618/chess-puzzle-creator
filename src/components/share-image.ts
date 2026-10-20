/** PNG de un ejercicio para compartir (D5): tablero, coordenadas y "Juegan …", nada más. */

const SIZE = 1080;
const SQ = SIZE / 8;
const pieces = new Map<string, Promise<HTMLImageElement>>();

// Los reyes solo traen viewBox; Firefox no dibuja en canvas un SVG sin width/height, así que se añaden
// donde faltan (repetirlos deja el XML inválido).
function piece(code: string) {
  let p = pieces.get(code);
  if (!p) {
    p = (async () => {
      const svg = await (await fetch(`/pieces/cburnett/${code}.svg`)).text();
      const url = URL.createObjectURL(new Blob([svg.replace(/<svg(?![^>]*\swidth=)/, '<svg width="45" height="45"')], { type: "image/svg+xml" }));
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    })();
    p.catch(() => pieces.delete(code));
    pieces.set(code, p);
  }
  return p;
}

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export async function exerciseImage(fen: string, orientation: "white" | "black", sideToMove: "w" | "b"): Promise<Blob> {
  const light = cssVar("--color-board-light", "#e8ecd2");
  const dark = cssVar("--color-board-dark", "#6b9450");
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear la imagen");

  const rows = (fen.split(" ")[0] ?? "").split("/").map((r) => r.replace(/\d/g, (n) => ".".repeat(Number(n))).split(""));
  const flip = orientation === "black";
  const draws: Promise<void>[] = [];
  ctx.font = `600 ${SQ * 0.2}px system-ui, sans-serif`;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const x = (flip ? 7 - c : c) * SQ;
      const y = (flip ? 7 - r : r) * SQ;
      const isDark = (r + c) % 2 === 1;
      ctx.fillStyle = isDark ? dark : light;
      ctx.fillRect(x, y, SQ, SQ);
      // Coordenadas como en el tablero: rango en la columna izquierda, columna en la fila de abajo.
      ctx.fillStyle = isDark ? light : dark;
      if (x === 0) {
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(8 - r), x + 8, y + 6);
      }
      if (y === SIZE - SQ) {
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText("abcdefgh"[c]!, x + SQ - 8, y + SQ - 4);
      }
      const p = rows[r]?.[c];
      if (p && p !== ".")
        draws.push(piece(`${p === p.toUpperCase() ? "w" : "b"}${p.toUpperCase()}`).then((img) => ctx.drawImage(img, x, y, SQ, SQ)));
    }
  await Promise.all(draws);

  ctx.fillStyle = cssVar("--color-ink", "#0d1310");
  ctx.fillRect(0, SIZE, SIZE, 120);
  ctx.fillStyle = cssVar("--color-fg", "#eef2ec");
  ctx.font = "700 52px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sideToMove === "w" ? "Juegan blancas" : "Juegan negras", SIZE / 2, SIZE + 60);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen"))), "image/png");
    } catch {
      // SecurityError si el canvas quedó bloqueado.
      reject(new Error("No se pudo crear la imagen"));
    }
  });
}
