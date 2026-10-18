# Chess Puzzle Creator

Analiza tus partidas de ajedrez y practica **tus propios errores**. Importa desde PGN, un link de Lichess o Chess.com, o un usuario de esas plataformas. Stockfish corre en tu navegador, clasifica cada jugada al estilo chess.com (incluidas las **brillantes**) y convierte los blunders, las oportunidades perdidas y las brillantes de tus partidas, tuyas y de tus rivales, en ejercicios con repetición espaciada.

**Demo:** https://chess-puzzle-creator.vercel.app

## Funciones

- **Importar:** PGN (una o varias partidas), link de partida de Lichess o Chess.com, o las últimas N partidas de un usuario.
- **Analizar en tu dispositivo:** Stockfish 19 (WASM) en un Web Worker. Muestra barra de evaluación, gráfica, mejor jugada, precisión e iconos de clasificación.
- **Clasificación:** Brillante, Gran jugada, Mejor, Excelente, Buena, Teoría, Forzada, Imprecisión, Error, Oportunidad perdida y Blunder.
- **Practicar:** ejercicios de "Corrige el error" y "Encuentra la brillante", con repetición espaciada (cajas de Leitner).
- **Repasar partida:** reintenta cualquier jugada mala, como en el "Retry" de chess.com.
- **PWA instalable:** analiza un PGN pegado incluso sin conexión.

## Stack

Next.js 15 (App Router) · tRPC · Drizzle + Postgres (Neon) · Better Auth · Tailwind 4 · react-chessboard · chess.js · Stockfish.js · Serwist. Gestor de paquetes: **pnpm**.

El plan completo (propuesta, diseño, specs y tareas) está en [`openspec/changes/add-chess-analyzer/`](openspec/changes/add-chess-analyzer/).

## Desarrollo

```bash
pnpm install
cp .env.example .env          # llena DATABASE_URL, DATABASE_URL_POOLED y BETTER_AUTH_SECRET
pnpm db:migrate               # aplica las migraciones (conexión directa)
pnpm dev
```

| Script | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm typecheck` | TypeScript sin emitir |
| `pnpm db:test:up` | Postgres local para tests (docker, `localhost:5435`) |
| `pnpm test` | Tests (`node --test`); los de servidor usan solo `DATABASE_URL_TEST` local |
| `pnpm db:generate` / `pnpm db:migrate` | Migraciones de Drizzle (nunca `db:push`) |
| `pnpm build:openings` | Regenera el libro de aperturas desde lichess-org/chess-openings |
| `pnpm reset-password <email>` | Restablece la contraseña de un usuario (no hay correo) |

El registro no verifica el correo y está limitado a 20 cuentas (fila `max_users` de `app_config`).

## Licencia

**GPL-3.0**: ver [LICENSE](LICENSE).

## Créditos

- [Stockfish](https://github.com/official-stockfish/Stockfish) (GPL-3.0), compilado a WebAssembly por [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0). Los binarios están en `public/engine/`.
- La clasificación de jugadas y la detección de sacrificios (Brillante) son un port de [WintrChess](https://github.com/WintrCat/wintrchess) (GPL-3.0) de WintrCat. Cada archivo portado indica su origen.
- El libro de aperturas viene de [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).
- Las fórmulas de probabilidad de victoria y de precisión son las de [Lichess](https://lichess.org/page/accuracy).
