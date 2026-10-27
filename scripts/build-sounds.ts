// Genera los sonidos del tablero como WAV (mono, 16 bits) en public/sounds.
// Timbre: "toc" de madera grave y seco (cuerpo senoidal corto + golpe de ruido de banda ancha).
// Uso: pnpm build:sounds
import { mkdirSync, writeFileSync } from "node:fs";

const SR = 44100;
const OUT = "public/sounds";

// PRNG fijo para que regenerar dé archivos idénticos.
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

const buffer = (ms: number) => new Float32Array(Math.ceil((SR * ms) / 1000));

// Golpe de pieza sobre madera. body = frecuencia grave (Hz), ring = cuánto dura el cuerpo (s),
// knock = cantidad de "clic", center = brillo del clic (Hz).
function thock(
  buf: Float32Array,
  atMs: number,
  { gain = 1, body = 140, ring = 0.016, knock = 0.8, center = 1100 } = {},
) {
  const start = Math.floor((SR * atMs) / 1000);
  // Pasabanda RBJ con Q bajo: banda ancha, sin resonancia de "caja".
  const w0 = (2 * Math.PI * center) / SR;
  const alpha = Math.sin(w0) / (2 * 0.6);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w0)) / a0, (1 - alpha) / a0];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  let phase = 0;
  for (let i = 0; start + i < buf.length; i++) {
    const t = i / SR;
    if (t > 0.12) break;
    const attack = Math.min(1, t / 0.001);
    // Cuerpo: cae de tono al inicio, como la madera al asentarse.
    phase += (2 * Math.PI * body * (1 + 0.5 * Math.exp(-t / 0.006))) / SR;
    const tone = Math.sin(phase) * Math.exp(-t / ring);
    const x = rand();
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    const noise = y * Math.exp(-t / 0.004) * 3;
    buf[start + i]! += gain * attack * (tone + knock * noise);
  }
}

// Tono suave con un leve barrido de tono hacia arriba, que recuerda a una gota sin imitarla.
// from/to = frecuencia inicial/final (Hz), decay = caída del volumen (s).
function drop(buf: Float32Array, atMs: number, { gain = 1, from = 400, to = 560, decay = 0.09 } = {}) {
  const start = Math.floor((SR * atMs) / 1000);
  let phase = 0;
  for (let i = 0; start + i < buf.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
    if (t > 0.01 && env < 1e-4) break;
    phase += (2 * Math.PI * (to + (from - to) * Math.exp(-t / 0.025))) / SR;
    buf[start + i]! += gain * env * Math.sin(phase);
  }
}

// Golpecito de ficha dura (resina/cerámica): parciales inarmónicos que se apagan muy rápido,
// así suena a material y no a nota musical.
function ping(buf: Float32Array, atMs: number, { gain = 0.4, freq = 1300, decay = 0.03 } = {}) {
  const start = Math.floor((SR * atMs) / 1000);
  const partials: [number, number][] = [
    [1, 1],
    [2.32, 0.5],
    [4.25, 0.25],
  ];
  for (let i = 0; start + i < buf.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.0005) * Math.exp(-t / decay);
    if (t > 0.01 && env < 1e-4) break;
    let v = 0;
    for (const [ratio, amp] of partials) v += amp * Math.sin(2 * Math.PI * freq * ratio * t) * Math.exp(-t * ratio * 20);
    buf[start + i]! += gain * env * v;
  }
}

// Roce de una ficha que se desliza sobre el tablero: ruido suave filtrado.
function slide(buf: Float32Array, atMs: number, ms: number, { gain = 0.25 } = {}) {
  const start = Math.floor((SR * atMs) / 1000);
  const n = Math.floor((SR * ms) / 1000);
  let y = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    y += 0.12 * (rand() - y);
    buf[start + i]! += gain * Math.sin((Math.PI * i) / n) * y;
  }
}

function wav(name: string, buf: Float32Array) {
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) => data.writeInt16LE(Math.round((v / peak) * 0.9 * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(`${OUT}/${name}.wav`, Buffer.concat([h, data]));
}

const sounds: Record<string, () => Float32Array> = {
  // Menos clic y más cuerpo: un "toc" redondo y amable.
  move: () => {
    const b = buffer(160);
    thock(b, 0, { body: 130, ring: 0.03, knock: 0.35, center: 800 });
    return b;
  },
  // Ficha contra ficha: "clac" duro y luego el asiento.
  capture: () => {
    const b = buffer(170);
    ping(b, 0, { gain: 0.5, freq: 1700, decay: 0.015 });
    thock(b, 0, { gain: 0.5, body: 180, knock: 1.3, center: 2200 });
    thock(b, 24, { gain: 1, body: 125, ring: 0.02, knock: 1 });
    return b;
  },
  // "ta-TAK": un toque suave y otro más firme y alto, como golpear la pieza para avisar.
  check: () => {
    const b = buffer(200);
    thock(b, 0, { gain: 0.5, body: 150, ring: 0.02, knock: 0.5, center: 900 });
    thock(b, 60, { body: 210, ring: 0.025, knock: 1.1, center: 1600 });
    return b;
  },
  // Rey que se asienta, torre que se desliza y se asienta.
  castle: () => {
    const b = buffer(260);
    thock(b, 0, { body: 135 });
    slide(b, 60, 90);
    thock(b, 150, { gain: 0.85, body: 150 });
    return b;
  },
  // Como check pero más discreto: dos toques de pieza, el segundo apenas más alto.
  promote: () => {
    const b = buffer(200);
    thock(b, 0, { gain: 0.7, body: 130, ring: 0.03, knock: 0.45, center: 800 });
    thock(b, 70, { body: 175, ring: 0.025, knock: 0.7, center: 1200 });
    return b;
  },
  // Dos "gotas" que suben.
  "game-start": () => {
    const b = buffer(400);
    drop(b, 0, { gain: 0.8, from: 330, to: 440 });
    drop(b, 110, { from: 440, to: 590, decay: 0.11 });
    return b;
  },
  // Dos "gotas" que bajan; la última más larga, como cierre.
  "game-end": () => {
    const b = buffer(450);
    drop(b, 0, { from: 440, to: 590 });
    drop(b, 120, { gain: 0.9, from: 300, to: 400, decay: 0.13 });
    return b;
  },
  // "rrrr": ráfaga de toques sordos muy seguidos que se apaga.
  illegal: () => {
    const b = buffer(260);
    for (let i = 0; i < 8; i++) {
      thock(b, i * 26, { gain: 1 - i * 0.1, body: 220, ring: 0.008, knock: 0.6, center: 1400 });
    }
    return b;
  },
};

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(sounds)) wav(name, make());
console.log(`${Object.keys(sounds).length} sonidos en ${OUT}/`);
