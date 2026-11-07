/** PNG de un ejercicio para compartir (D5): logo y nombre arriba, tablero con margen, coordenadas y "Juegan …". */

const W = 1080;
const PAD = 36; // margen lateral del tablero
const HEAD = 136; // franja del logo
const FOOT = 120; // franja de "Juegan …"
const SIZE = W - PAD * 2;
const SQ = SIZE / 8;
const images = new Map<string, Promise<HTMLImageElement>>();

// Los reyes solo traen viewBox; Firefox no dibuja en canvas un SVG sin width/height, así que se añaden
// donde faltan (repetirlos deja el XML inválido).
function svgImage(src: string) {
  let p = images.get(src);
  if (!p) {
    p = (async () => {
      const svg = await (await fetch(src)).text();
      const url = URL.createObjectURL(new Blob([svg.replace(/<svg(?![^>]*\swidth=)/, '<svg width="45" height="45"')], { type: "image/svg+xml" }));
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    })();
    p.catch(() => images.delete(src));
    images.set(src, p);
  }
  return p;
}

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export async function exerciseImage(fen: string, orientation: "white" | "black", sideToMove: "w" | "b"): Promise<Blob> {
  const light = cssVar("--color-board-light", "#e8ecd2");
  const dark = cssVar("--color-board-dark", "#6b9450");
  const ink = cssVar("--color-ink", "#0d1310");
  const fg = cssVar("--color-fg", "#eef2ec");
  const font = cssVar("--font-geist-sans", "system-ui, sans-serif");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = HEAD + SIZE + FOOT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear la imagen");
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Logo + "AjedrezLab" (Lab en verde), centrados como bloque.
  const LOGO = 64;
  const GAP = 18;
  ctx.font = `700 54px ${font}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const a = ctx.measureText("Ajedrez").width;
  const left = (W - (LOGO + GAP + a + ctx.measureText("Lab").width)) / 2;
  const mid = HEAD / 2 + 4;
  ctx.drawImage(await svgImage("/icons/icon.svg"), left, mid - LOGO / 2, LOGO, LOGO);
  ctx.fillStyle = fg;
  ctx.fillText("Ajedrez", left + LOGO + GAP, mid);
  ctx.fillStyle = cssVar("--color-brand", "#7fb24a");
  ctx.fillText("Lab", left + LOGO + GAP + a, mid);

  const rows = (fen.split(" ")[0] ?? "").split("/").map((r) => r.replace(/\d/g, (n) => ".".repeat(Number(n))).split(""));
  const flip = orientation === "black";
  const draws: Promise<void>[] = [];
  ctx.font = `600 ${SQ * 0.2}px ${font}`;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const x = PAD + (flip ? 7 - c : c) * SQ;
      const y = HEAD + (flip ? 7 - r : r) * SQ;
      const isDark = (r + c) % 2 === 1;
      ctx.fillStyle = isDark ? dark : light;
      ctx.fillRect(x, y, SQ, SQ);
      // Coordenadas como en el tablero: rango en la columna izquierda, columna en la fila de abajo.
      ctx.fillStyle = isDark ? light : dark;
      if (x === PAD) {
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(8 - r), x + 8, y + 6);
      }
      if (y === HEAD + SIZE - SQ) {
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText("abcdefgh"[c]!, x + SQ - 8, y + SQ - 4);
      }
      const p = rows[r]?.[c];
      if (p && p !== ".")
        draws.push(svgImage(`/pieces/cburnett/${p === p.toUpperCase() ? "w" : "b"}${p.toUpperCase()}.svg`).then((img) => ctx.drawImage(img, x, y, SQ, SQ)));
    }
  await Promise.all(draws);

  ctx.fillStyle = fg;
  ctx.font = `700 52px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sideToMove === "w" ? "Juegan blancas" : "Juegan negras", W / 2, HEAD + SIZE + FOOT / 2);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen"))), "image/png");
    } catch {
      // SecurityError si el canvas quedó bloqueado.
      reject(new Error("No se pudo crear la imagen"));
    }
  });
}
