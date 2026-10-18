## Why

Las páginas de ajedrez te dan ejercicios para encontrar la mejor jugada en posiciones de otros, pero casi ninguna te pone a practicar **tus propios errores**. Chess.com tiene "Retry" y Lichess "Learn from your mistakes", pero solo dentro de una partida a la vez: no hay un banco acumulado de tus blunders para repasarlos hasta entender qué haces mal. Además, las alternativas gratuitas como WintrChess tienen una interfaz poco pulida y no funcionan bien en el celular. Queremos un analizador con la claridad de chess.com, que funcione en cualquier dispositivo, calcule movimientos brillantes y convierta los errores de cada usuario en ejercicios personalizados.

## What Changes

- Nueva app web (UI en español, mobile-first, interfaz al estilo chess.com) con cinco piezas:
  1. **Importar partidas**: pegar PGN (una o varias partidas), pegar el link de una partida de Lichess o Chess.com, o escribir el usuario de Lichess o Chess.com para traer sus partidas recientes. Las llamadas a las APIs públicas salen del navegador. Solo los links de partidas sueltas de Chess.com pasan por una ruta del servidor, porque su endpoint no tiene CORS.
  2. **Analizar una partida**: Stockfish 19 corre en el navegador del usuario (WASM, Web Worker), así que el servidor no hace cálculos pesados. Muestra barra de evaluación, gráfica, mejor jugada con flecha, precisión por jugador y la lista de jugadas con iconos de clasificación.
  3. **Clasificar jugadas** como chess.com: Brillante (!!), Gran jugada (!), Mejor, Excelente, Buena, Teoría, Forzada, Imprecisión (?!), Error (?), Oportunidad perdida y Blunder (??). Usa puntos esperados (probabilidad de ganar) y una detección de sacrificios basada en la seguridad de las piezas.
  4. **Practicar**: el análisis se guarda y a partir de él se generan dos tipos de ejercicio.
     - Los ejercicios salen de las jugadas **del usuario y de sus rivales**.
     - **Corrige el error:** sale de cada Blunder u Oportunidad perdida. Se acepta cualquier jugada suficientemente buena y después se muestra la refutación de lo que se jugó.
     - **Encuentra la brillante:** sale de cada Brillante, jugada o **no vista** (había una y quien movía no la jugó). Antes de volverse ejercicio, cada Brillante pasa una verificación estricta: reanálisis más profundo, sacrificio real y respuesta única. Así no aparecen falsos brillantes.

     Los dos tipos se repiten con espaciado (sistema de cajas de Leitner) hasta dominarlos.
  5. **Repasar la partida** (como el "Retry" de chess.com): reproduce la partida y en cada Imprecisión, Error u otra jugada mala se puede reintentar para encontrar una jugada mejor. Es práctica libre: no se guarda ni se repite con espaciado.
- **PWA instalable** "Chess Puzzle Creator" en `chess-puzzle-creator.vercel.app`, con botón "Instalar app" (en iOS, instrucciones) y análisis sin conexión de un PGN pegado.
- Cuentas con **Better Auth**:
  - Correo y contraseña, sin verificación de correo.
  - **Máximo 20 cuentas**: al llegar al tope, el registro se bloquea en el front, en el back y con un trigger en la base de datos.
  - Rate limit en auth y en las rutas propias.
  - Se puede analizar sin cuenta; guardar partidas y practicar requiere iniciar sesión.
- Hosting en **Vercel Hobby** con **Postgres en Neon**. No hace falta storage de archivos.

## Capabilities

### New Capabilities
- `user-accounts`: inicio de sesión, sesión en el servidor y aislamiento de datos por usuario.
- `game-import`: importar partidas desde PGN, links o usuario de Lichess o Chess.com, sin duplicados.
- `game-analysis`: análisis con Stockfish en el cliente, la pantalla de revisión y el guardado del resultado.
- `move-classification`: puntos esperados, clasificación de cada jugada (incluida Brillante), precisión y libro de aperturas.
- `pwa`: manifest, service worker, botón de instalación y análisis sin conexión.
- `practice`: generación de ejercicios (errores y brillantes) desde el análisis guardado, sesión de práctica, validación de respuestas y repetición espaciada.

### Modified Capabilities
_(ninguna, el proyecto es nuevo)_

## Impact

- Repo nuevo: una sola app Next.js creada con `create-t3-app`, sin monorepo (ver design D1).
- Dependencias nuevas (con pnpm): `stockfish` (GPL-3.0, se sirve como asset estático), `chess.js`, `react-chessboard`, `better-auth`, `drizzle-orm` + `postgres`, `@serwist/next`, shadcn/ui. Datos de aperturas: `lichess-org/chess-openings`.
- Servicios externos: Neon (Postgres) y las APIs públicas de Lichess y Chess.com (sin llaves). No hace falta servicio de correo ni OAuth.
- **Licencia:** Stockfish es GPL-3.0 y se distribuye al navegador, así que hay que ofrecer su código fuente. El clasificador de WintrChess (GPL-3.0) se porta con atribución, así que el repo es público bajo GPL-3.0 (design D5).
