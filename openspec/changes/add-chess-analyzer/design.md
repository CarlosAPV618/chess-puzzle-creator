## Context

Proyecto nuevo y vacío, personal y no comercial. Decisiones del usuario:
- Importar desde PGN, links de Lichess o Chess.com, o el usuario de esas plataformas.
- El análisis corre en la computadora del cliente, no en el servidor.
- Clasificación al estilo chess.com, **incluida Brillante**, con iconos.
- Sección **"Practicar"** con ejercicios salidos de las partidas del usuario. Es el diferenciador del producto. El análisis se guarda y de él salen ejercicios de errores y de brillantes, **de las jugadas del usuario y de las de sus rivales**, incluidas las brillantes que nadie vio.
- Interfaz amigable tipo chess.com que **funcione en celular**, al contrario de WintrChess.
- Postgres (no Mongo), cuentas con Better Auth, hosting en Vercel o Netlify.

Las afirmaciones sobre terceros se verificaron el 2026-10-18 contra documentación oficial, npm y GitHub (ver "Fuentes verificadas"). Lo que no se pudo confirmar está marcado **[POR VERIFICAR]** y tiene una tarea que lo comprueba.

## Goals / Non-Goals

**Goals:**
- Importar y analizar una partida en el celular sin que el servidor calcule nada.
- Clasificación de jugadas creíble y cercana a la de chess.com, con Brillante y Gran jugada.
- Banco de ejercicios por usuario que se alimenta solo al analizar, y una práctica que enseñe por qué la jugada fue mala.
- Costo cero: Vercel Hobby + Neon Free.

**Non-Goals (por ahora):**
- Analizar partidas en segundo plano o en el servidor. El análisis corre mientras la pestaña está abierta.
- Lichess cloud eval. Puede agregarse para acelerar las aperturas.
- Ejercicios de varias jugadas (líneas completas). Por ahora el ejercicio es una sola jugada y la refutación se muestra animada.
- Etiquetar temas tácticos (clavada, horquilla, pieza colgada) y estadísticas de patrones.
- Jugar contra el motor y Chess960.
- Sincronización offline: sin red no se guarda nada (D13).
- Verificación de correo, recuperación de contraseña por correo y login social (Google, Lichess). Se agregan si se abre el registro a más de 20 personas.

## Decisions

### D1. Stack: create-t3-app (Next.js + tRPC + Drizzle + Tailwind + Better Auth). No usar el monorepo de QR-generator.
`create-t3-app` 7.40 ya trae instalador de **Better Auth** con esquema Drizzle para Postgres. Se verificó en el paquete publicado aunque la documentación del sitio todavía solo menciona NextAuth.

Por qué T3 y no el monorepo de QR-generator (Vite SPA + Express):
- El destino es Vercel o Netlify. Next.js es nativo ahí: las rutas de API son funciones serverless sin configuración. El Express de QR-generator está pensado para un contenedor en Coolify y habría que adaptarlo.
- Una sola app es un solo deploy, sin paquetes `shared`/`api`/`web`. La lógica compartida (clasificación) es un módulo puro dentro de `src/lib`.
- El trabajo pesado corre en el cliente, igual que en QR-generator, así que SSR casi no aporta. Las páginas de análisis y práctica son componentes cliente (`"use client"`). No es un problema: Next también sirve bien una app mayormente cliente.

tRPC viene en el scaffold y se queda para el CRUD (partidas, análisis, ejercicios). La única ruta HTTP aparte es el proxy de Chess.com (D6).

**Lo que trae la plantilla** (verificado en el tarball de `create-t3-app` 7.40.0):
- Next `^15.2.3`, no 16. La redirección optimista va en `middleware.ts`; `proxy.ts` es el nombre de Next 16. No se actualiza a Next 16 en este change.
- El driver es `drizzle-orm/postgres-js` + `postgres`, con una sola `DATABASE_URL`.
- Las tablas de Better Auth son `user`, `session`, `account` y `verification`, sin prefijo. Las tablas propias usan `pgTableCreator`.

**Gestor de paquetes: pnpm**, por seguridad, como en QR-generator:
- El scaffold se crea con `pnpm create t3-app@latest`.
- pnpm ≥ 10 no ejecuta scripts de instalación de dependencias salvo los permitidos en `allowBuilds` (`pnpm-workspace.yaml`). Solo se permiten los necesarios (p. ej. `esbuild`).
- `minimumReleaseAge` evita instalar versiones publicadas hace menos de un día.
- El lockfile `pnpm-lock.yaml` se versiona y en Vercel se instala con `--frozen-lockfile`.
- Las dependencias se agregan con `pnpm add`; nunca `npm` ni `npx` (se usa `pnpm dlx`).

### D2. Hosting: Vercel Hobby + Neon Free. Sin storage de archivos.
- **Vercel Hobby:** funciones de hasta 300 s, 1M invocaciones al mes, 100 GB de transferencia. Está limitado a uso personal no comercial, y este proyecto lo es. Si algún día lleva anuncios o pagos, hay que pasar a Pro.
- **Netlify Free** cobra 15 créditos por cada deploy de producción, con 300 créditos al mes, es decir unos 20 deploys. Por eso Vercel es más cómodo para iterar.
- **Postgres:** Vercel Postgres ya no existe (se migró a Neon en diciembre de 2024). Se usa Neon Free, con 1 GB y suspensión tras 5 min sin uso.
- **Una sola base de Neon para producción y desarrollo** (decisión del usuario). Todo es de prueba, incluso lo que esté en producción, así que se pueden borrar datos cuando haga falta.
- La app usa `DATABASE_URL_POOLED` (`-pooler`), que es la que aguanta las conexiones serverless, con `postgres(url, { prepare: false })`. El pooler de Neon es PgBouncer en modo transacción, y sin `prepare: false` las sentencias preparadas con nombre pueden fallar entre conexiones. El costo es despreciable.
  - Las transacciones (guardar análisis + ejercicios) funcionan igual. `pg_advisory_xact_lock` también, porque dura solo la transacción. Lo que no funciona en este modo son los locks de sesión y `SET` de sesión, y no se usan.
- Las migraciones (`drizzle-kit migrate`) usan `DATABASE_URL` (conexión directa).
- **Pruebas automatizadas en un Postgres local** (decisión del usuario: sin rama `test` en Neon).
  - Un `docker-compose.yml` levanta Postgres 16 con la base `chess_test`, como en QR-generator. Su URL va en `DATABASE_URL_TEST`.
  - Al iniciar cada corrida, el helper borra y recrea los schemas `public` y `drizzle` y aplica las migraciones.
  - El helper **se niega a correr** si `DATABASE_URL_TEST` falta o no apunta a `localhost`/`127.0.0.1`. Así un test nunca borra Neon por error.
  - *Se descartó* un schema temporal `test_<aleatorio>` dentro de Neon. drizzle-kit genera las foreign keys como `REFERENCES "public"."user"`, y su tabla de control vive en el schema `drizzle`. Las pruebas habrían apuntado a las tablas reales.
- **Migraciones:** `drizzle-kit generate` + `pnpm db:migrate`, aplicadas a mano antes de desplegar el código que las usa. Así el historial de migraciones queda en el repo y es el mismo que usan los tests locales. Como los datos son de prueba, no hace falta cuidar la compatibilidad hacia atrás: si una migración rompe datos, se borran.
- **No hace falta storage (S3/Blob):** no hay imágenes ni archivos subidos. El PGN es texto (~1–3 KB) y el análisis es un `jsonb` de ~5–10 KB por partida (eval, mejor jugada, PV corta y clase por ply). 1 GB alcanza para decenas de miles de partidas analizadas. Los binarios de Stockfish (~2 MB la versión lite) se sirven como estáticos desde `public/`.

### D3. Motor: Stockfish 19 lite de un hilo, en un Web Worker
- Paquete `stockfish` (nmrugg/stockfish.js) v19. Su README recomienda la build **lite single-threaded** (~1.7 MB): funciona en cualquier host estático sin cabeceras especiales y es muchísimo más fuerte que cualquier humano.
- La build multihilo necesita `SharedArrayBuffer`, es decir COOP/COEP (aislamiento de origen). Eso bloquea imágenes de otros orígenes (avatares de Chess.com) y complica los popups. **No se usa en el MVP**. Si el análisis resulta lento, se activa solo en la ruta de análisis cuando `crossOriginIsolated` sea true [POR VERIFICAR que Vercel aplique las cabeceras por ruta sin romper la navegación].
- Configuración: `MultiPV 2` (necesario para Gran jugada y Brillante, D4) y profundidad fija. Hay tres presets: Rápido (12), Normal (16, el predeterminado) y Profundo (20). Se analiza cada posición antes de cada jugada y la final.
- **Historial al motor:** cada posición se envía como `position fen <FEN inicial> moves <jugadas hasta ahí>` y no como un FEN suelto. Así Stockfish conoce las repeticiones y la regla de 50 jugadas, y no evalúa como ventaja una posición que es tablas por repetición.
- **Posiciones sin jugadas legales:** no se mandan al motor, porque Stockfish responde `bestmove (none)`. El wrapper las resuelve con chess.js: jaque mate = mate 0 contra el que mueve; ahogado, material insuficiente o triple repetición = 0 cp.
- **Convención de evaluación:** Stockfish reporta `score` desde el punto de vista del bando que mueve. Al guardar se convierte **siempre al punto de vista de blancas** (`{ cp }` o `{ mate }`, con signo positivo a favor de blancas). El clasificador convierte a "subjetiva" (del que mueve) cuando lo necesita. Esta conversión es una fuente clásica de errores y lleva test.
- El análisis corre en un Worker con barra de progreso y es cancelable. Se analiza una partida a la vez, solo cuando el usuario la abre o pulsa "Analizar".
- Durante el análisis se pide `navigator.wakeLock.request("screen")` si existe, para que el celular no apague la pantalla y suspenda la pestaña. Si el sistema mata la pestaña (común en iOS al cambiar de app), se pierde el progreso y hay que volver a analizar (ver Risks).
- La UI incluye un aviso de licencia y un enlace al código fuente de Stockfish (GPL-3.0).

### D4. Clasificación de jugadas
Es un módulo puro (`src/lib/classify/`) que recibe las evaluaciones y las posiciones y devuelve la clase. No depende del motor ni de React, y lleva tests con posiciones fijas.

**Puntos esperados (EP)**, del punto de vista del que mueve: `EP(cp) = 1 / (1 + e^(-0.00368208 · cp))`. Es la curva de Lichess, equivalente a su fórmula de Win%. El cp se limita a ±1000 antes de aplicarla. Un mate a favor da EP = 1 y un mate en contra EP = 0. Chess.com no publica su modelo, que además depende del rating, así que esta es una aproximación.

`pérdida = max(0, EP(mejor línea antes) − EP(después de la jugada))`

| Clase | Pérdida de EP (umbrales oficiales de chess.com) |
|---|---|
| Mejor | jugada = primera del motor |
| Excelente | < 0.02 |
| Buena | < 0.05 |
| Imprecisión | < 0.10 |
| Error | < 0.20 |
| Blunder | ≥ 0.20 |

Transiciones con mate (reglas de WintrChess):
- **Mate a favor que pasa a mate en contra:** Blunder, o Error si el mate rival está a más de 3.
- **Mate a favor antes y después:** según cuánto se alarga el mate. ≤0 es Mejor, <2 Excelente, <7 Buena, más es Imprecisión.
- **Mate a favor que pasa a cp:** ≥800 Excelente, ≥400 Buena, ≥200 Imprecisión, ≥0 Error, <0 Blunder.
- **cp que pasa a mate en contra:** en ≤2 es Blunder, en ≤5 Error, más lejos Imprecisión.

**Orden de evaluación:**
1. Una sola jugada legal: **Forzada**.
2. La posición resultante está en el libro (D7): **Teoría**.
3. Jaque mate: **Mejor**.
4. Si no, se aplica la tabla de pérdida.
5. Si la jugada es la del motor y es crítica: **Gran jugada**.
6. Si es la jugada del motor y es un sacrificio real: **Brillante** (candidato; se confirma con D4b).
7. Si la clase quedó en Imprecisión o Error y se cumplen las condiciones: **Oportunidad perdida**.

**Precandidato crítico** (requisito común de Gran jugada y Brillante). Se descarta si se cumple cualquiera de estas condiciones:
- La segunda mejor línea ya da ≥ +700 cp (ya ganaba sin esta jugada).
- Queda perdiendo después de mover (eval subjetiva < 0).
- La jugada es una coronación a dama.
- El que mueve estaba en jaque.

**Gran jugada:**
- Es la jugada del motor y pasa el precandidato.
- No es un mate encontrado.
- No captura una pieza colgada.
- La segunda mejor jugada pierde ≥ 0.10 EP frente a la mejor.

**Brillante** (detección de sacrificio con seguridad de piezas, tomada de WintrChess):
- **Valores de pieza:** P=1, N=B=3, R=5, Q=9.
- **Pieza insegura:**
  - Si algún atacante directo vale menos que ella: insegura.
  - Si los atacantes son ≤ los defensores (simulando las capturas): segura.
  - Si un peón la defiende: segura.
  - Excepción, segura: torre que acaba de capturar un caballo y solo tiene un caballo atacándola.
- **Piezas colgadas tras la jugada:** las propias que no son peón ni rey, inseguras y de mayor valor que lo capturado. Esto excluye cambios y recapturas.
- **No es Brillante en estos casos:**
  - Sin jaque, la jugada reduce las piezas colgadas (salvó una pieza).
  - Toda captura de la pieza colgada deja al rival una amenaza mayor o mate en 1 ("danger levels"). En ese caso no es sacrificio real, porque el rival simplemente no debe tomarla.
  - La pieza ya estaba atrapada antes (se iba a perder igual).
- **Es Brillante** si queda ≥1 pieza colgada. Los sacrificios de peón nunca cuentan.
- Hay falsos positivos conocidos en la versión de WintrChess. Para los ejercicios no basta: ver D4b.

**Brillante disponible (no jugada):** en cada posición donde el jugador **no** hizo la jugada del motor, se corre la misma detección sobre la jugada del motor (posición tras `bestUci`, con la eval de la línea 1). Si saldría Brillante, la jugada se marca `brilliantMissed`. No cambia la clase de lo que se jugó, pero alimenta los ejercicios (D9).

**Oportunidad perdida** (WintrChess no la tiene; regla propia, ajustable). Una jugada clasificada Imprecisión o Error por la tabla pasa a Oportunidad perdida si:
- la jugada previa del rival fue Error o Blunder;
- la mejor jugada ahora daría EP ≥ 0.75, es decir, había con qué castigar.

Un Blunder sigue siendo Blunder: es más grave y de todos modos genera ejercicio. *Corrección:* la versión anterior pedía "EP mejor ≥ 0.80, EP tras la jugada < 0.65 y que no fuera ya Error ni Blunder". Eso es imposible, porque esa pérdida (≥ 0.15) ya es Error o Blunder por la tabla, así que la clase nunca habría salido.

**Precisión por jugador:** la fórmula de Lichess. Por jugada, `acc = 103.1668 · e^(−0.04354 · (win%antes − win%después)) − 3.1669`, con win% de 0 a 100 desde el punto de vista del que mueve, limitada a [0, 100]. El total se redondea a un decimal. Lichess usa una media armónica ponderada por volatilidad; en el MVP basta la media simple, ajustable después.

### D4b. Verificar los Brillantes antes de mostrarlos o volverlos ejercicio
Un Brillante falso es un mal ejercicio: el usuario "encuentra" un sacrificio que en realidad pierde, o falla la respuesta cuando había otra igual de buena. Por eso cada candidato (jugado o `brilliantMissed`) pasa por una segunda verificación en el cliente antes de guardarse como Brillante:
1. **Reanalizar más profundo.** La posición previa se analiza a profundidad 22 con MultiPV 3. La jugada debe seguir siendo la primera del motor y seguir pasando el precandidato crítico y la detección de sacrificio con las nuevas evals. Si la conclusión cambia con la profundidad, no es Brillante.
2. **Sacrificio sostenido.** Se sigue la línea principal 4 plies. El material del que sacrifica debe quedar abajo en ≥ 2 puntos en algún momento de la línea, o la pieza colgada debe poder capturarse con la eval del rival empeorando. Así se descartan "sacrificios" que en realidad son cambios diferidos.
3. **Respuesta única para el ejercicio.** Solo se crea ejercicio si la segunda mejor jugada pierde ≥ 0.10 EP frente a la Brillante (criterio de Gran jugada). Si hay dos jugadas casi igual de buenas, la Brillante se muestra en el análisis pero no se vuelve ejercicio.
4. **Conservador por defecto.** Ante cualquier duda (mates largos, posiciones con evals inestables entre profundidades > 0.05 EP), no se marca Brillante.

La verificación solo corre sobre candidatos, que suelen ser 0–3 por partida. Como la detección de `brilliantMissed` revisa todas las jugadas que no fueron la del motor, en partidas caóticas podrían salir más. Se verifican **como máximo 6 candidatos por partida**: primero los del bando del usuario y luego los de mayor ganancia de EP. Los demás se descartan, no se marcan. A profundidad 22 cada verificación puede tardar decenas de segundos en el celular; se mide en la tarea 3.6.

**Set de calibración** (`lib/classify/fixtures/`): ~40 posiciones etiquetadas.
- Brillantes reconocidos: chess.com Game Review en partidas públicas famosas y partidas propias del usuario.
- No-Brillantes que engañan: recapturas, cambios, sacrificios que pierden, piezas ya atrapadas, coronaciones.
- **Meta:** 0 falsos positivos en el set y ≥ 70 % de recall. Se mide con un script que corre el clasificador sobre evals fijas guardadas, sin motor, para que sea determinista y rápido.

### D5. WintrChess: portar el clasificador, no hacer fork
WintrChess (github.com/WintrCat/wintrchess, **GPL-3.0**, 263 estrellas, último commit 2026-02) es un monorepo React 18 + webpack + Express + MongoDB. Usa react-chessboard, chess.js y Stockfish 17 en el cliente: la misma idea que este proyecto, pero con Mongo, anuncios y una UI que falla en móvil.

- **No hacer fork:** se heredaría Mongo, el servidor, los anuncios y webpack.
- **Lo que vale la pena** es `shared/src/lib/reporter/`, unos 10 archivos (~20 KB) que solo dependen de chess.js y lodash: `expectedPoints`, `pointLoss`, `critical`, `brilliant`, `pieceSafety`, `attackers`, `defenders`, `pieceTrapped` y `dangerLevels`.
- **Decidido (opción A):** el repo es público bajo **GPL-3.0**, con el archivo `LICENSE` en la raíz. Esos módulos se portan con atribución: un encabezado en cada archivo portado con el origen (`WintrCat/wintrchess`, ruta y commit) y una sección "Créditos" en el README. Ahorra el trabajo más fino (seguridad de piezas) y cumple de paso con la GPL de Stockfish. El código portado se adapta a TypeScript estricto, a la convención de evals de D3 y a los cambios de D4 y D4b (Oportunidad perdida, verificación, tope de candidatos).
- *Descartada (opción B):* reimplementar desde la especificación para poder tener un repo privado.
- **No usar** freechess (CC BY-NC-SA), wintrchess-lib ni Chesskit (AGPL-3.0).
- El libro de aperturas se toma directo de `lichess-org/chess-openings` y no del `openings.json` de WintrChess, para no depender de su licencia.

### D6. Importación
- **PGN pegado:**
  - **Normalización:** quitar el BOM, pasar CRLF a LF y recortar espacios.
  - **Separación:** se corta antes de cada bloque de headers (`[` al inicio de línea) que viene después de un movetext, aunque no haya línea en blanco o falte `[Event`. Un texto sin headers (solo jugadas) es una partida.
  - **Validación:** cada partida se valida con `chess.js`. Las inválidas se reportan sin bloquear las demás.
  - **Variantes y comentarios:** comentarios, NAG y variantes (RAV) se ignoran y se usa la línea principal [POR VERIFICAR que `loadPgn` de chess.js 1.4 acepte RAV; si no, quitarlas antes de parsear].
  - **Límite:** 50 partidas y 1 MB por envío.
- **Partidas que no se aceptan**, por cualquier vía: variantes que no son ajedrez estándar (`[Variant]` distinto de Standard o From Position; en Chess.com, `rules ≠ "chess"`) y partidas con menos de 2 jugadas. Se reportan como "no soportada". Las partidas desde una posición (`[SetUp "1"]` + `[FEN]`) sí se aceptan: se analizan desde ese FEN y sin libro de aperturas.
- **Lichess:** se llama directo desde el navegador (respuestas con `Access-Control-Allow-Origin: *`).
  - Partida suelta: `GET https://lichess.org/game/export/{id}`. El id son los **primeros 8 caracteres** de la ruta, porque las URLs de jugador traen 12 (partida + jugador). Los links de estudios, broadcasts o torneos no se soportan y se dice así.
  - Por usuario: `GET /api/games/user/{user}?max=N&pgnInJson=true&opening=true` en NDJSON.
  - Una petición a la vez. Ante un 429, se espera 60 s y se avisa al usuario.
- **Chess.com por usuario:** también directo desde el navegador. Se pide `/pub/player/{u}/games/archives` y luego los meses más recientes, en serie y nunca en paralelo, hasta juntar N partidas o revisar 24 meses, lo que pase primero.
- **Chess.com por link de partida:** no hay endpoint oficial para una partida suelta, así que pasa por la ruta del servidor `/api/import/chesscom/[type]/[id]`.
  - **Validación de la entrada:** `type ∈ {live, daily}` e `id` con `^\d{1,15}$`. La ruta arma ella misma las URLs de chess.com, así que no se puede usar como proxy hacia otro sitio (SSRF).
  - **Flujo:** llama al endpoint no oficial `www.chess.com/callback/{type}/game/{id}`, que no tiene CORS. De ahí saca jugadores y fecha, busca la partida en el archivo mensual del jugador por `url` y devuelve el PGN.
  - **Si falla:** se responde "No pudimos traer esta partida. Pega el PGN o importa por usuario".
  - [POR VERIFICAR] el formato actual del callback y que Chess.com (detrás de Cloudflare) no bloquee las IPs de Vercel. Si las bloquea, la ruta se elimina y el link de Chess.com pide el usuario para buscar la partida en sus archivos desde el navegador.
- **Elegir mi color:** si la importación es por usuario, se detecta solo. En PGN o link se buscan los nombres que el usuario ya registró (tabla `player_names`, D8), comparando sin distinguir mayúsculas. Si no aparece ninguno, se pregunta "¿Cuál eres tú?" (blancas, negras o ninguna) y el nombre elegido se guarda. El color se puede cambiar después con `games.setUserColor`, que también actualiza `side` en sus ejercicios.
- **Duplicados:** la tabla `games` es única por `(user_id, source, source_id)`.
  - Si un PGN pegado trae `[Site "https://lichess.org/<id>"]` o `[Link "https://www.chess.com/game/..."]`, se toma `source` y `source_id` de ahí. Así la misma partida importada por PGN y por link o usuario no se duplica.
  - Si no, `source = pgn` y `source_id` es un hash de las jugadas y de los headers White, Black y Date.

### D7. Libro de aperturas
- Se usa `lichess-org/chess-openings` (`dist/*.tsv` con EPD) [POR VERIFICAR licencia CC0]. Se procesa en build a un JSON `{ epd → { eco, name } }`, ~400 KB, que se carga de forma diferida.
- Una jugada es Teoría si su posición resultante está en el libro. La comparación usa solo los tres primeros campos del FEN (piezas, turno y enroques) y descarta la casilla al paso: chess.js y el dataset pueden escribirla distinto y eso daría falsos negativos.
- El nombre de la apertura de la partida es el de la última posición del libro alcanzada.

### D8. Modelo de datos (Drizzle)
- **Tablas de Better Auth** (las genera su CLI).
- **`games`:**
  - `id`, `user_id`, `source` (`pgn` | `lichess` | `chesscom`), `source_id`.
  - `pgn`, `white`, `black`, `white_elo`, `black_elo`, `result`, `time_class`, `played_at`.
  - `user_color` (`w` | `b` | null), `opening_name`, `created_at`.
  - Única por `(user_id, source, source_id)`.
- **`player_names`:** `user_id`, `name_lower`; única por `(user_id, name_lower)`. Son los nombres con que el usuario aparece en sus partidas (D6).
- **`analyses`:**
  - `game_id` (PK, 1:1), `depth`, `engine` (`sf19-lite`), `classifier_version`.
  - `positions jsonb`: un elemento por posición, es decir N jugadas + 1 contando la final. Cada uno es `{ eval, best?: { uci, eval }, second?: { uci, eval }, pv: uci[≤8] }`. Todas las evals van desde blancas (D3).
  - `moves jsonb`: un elemento por jugada (N), con `{ class, epLoss, brilliant?: { exerciseEligible }, brilliantMissed?: { uci, exerciseEligible } }`.
  - `accuracy_white`, `accuracy_black`, `created_at`.
  - Reanalizar reemplaza la fila.
  - *Corrección:* el `plies` anterior no guardaba la segunda línea, que hace falta para las jugadas aceptadas y para Gran jugada, ni los datos de Brillante. Tampoco distinguía posiciones de jugadas.
- **`exercises`:**
  - `id`, `user_id`, `game_id`, `ply`, `fen` (posición antes de la jugada, **calculada en el servidor** reproduciendo el PGN con chess.js), `played_uci`.
  - `kind` (`mistake` | `brilliant`), `side` (`me` | `opponent` | null si no se conoce el color), `best_uci`.
  - `accepted_uci[]`: la mejor jugada, más la segunda línea si pierde < 0.05 EP frente a la mejor. Para `brilliant`, solo la Brillante.
  - `refutation_pv`: la PV de la posición después de la jugada hecha, o sea lo que el rival podía hacer. `class`, `ep_loss`, `phase`.
  - `brilliant_played` (bool), solo para `brilliant`: si se jugó o se dejó pasar.
  - Repetición espaciada: `box` (0–5), `due_at`, `attempts`, `solved_count`. `archived_at` (nullable).
  - Única por `(game_id, ply)`.
- **`exercise_attempts`:** `id`, `exercise_id`, `user_id`, `first_try_correct`, `used_hint`, `viewed_solution`, `created_at`.
- **`app_config`:** `key` (PK), `value`. Guarda `max_users = 20`; es la única fuente del tope de cuentas (D11).
- **`rate_limits`:** `key` (PK), `window_start`, `count`. Una fila por clave (D11).
- **Borrado:** todas las FK de `analyses`, `exercises` y `exercise_attempts` hacia `games` y `user` son `ON DELETE CASCADE`. El usuario puede borrar una partida (`games.delete`), lo que borra su análisis, ejercicios e intentos.

**Validación del análisis en el servidor.** El análisis se calcula en el cliente y se envía con tRPC. El servidor:
- reproduce el PGN guardado con chess.js;
- valida con Zod la forma, que `positions` tenga N+1 elementos y `moves` N, y que el tamaño sea < 200 KB;
- comprueba que cada UCI (`best`, `second`, `pv`, `brilliantMissed`) sea legal en su posición.

No recalcula las evaluaciones: si un usuario manipula su propio análisis, solo afecta sus propios ejercicios. Pero nunca se guardan jugadas ilegales que rompan el tablero de práctica.

### D9. Practicar: mis errores y brillantes
El análisis se guarda siempre que hay sesión (D8). Los ejercicios se generan **en el servidor a partir del análisis guardado**, en la misma transacción. Así el banco de ejercicios siempre corresponde a análisis persistidos, y reanalizar actualiza ambos.

Los ejercicios salen de las jugadas de **los dos bandos**: las del usuario (`side = me`) y las de sus rivales (`side = opponent`). Las posiciones de partidas propias son las que el usuario reconoce, y los errores del rival enseñan lo mismo desde el otro lado. Hay dos tipos:
- **`mistake` (Corrige el error):** cada jugada de cualquiera de los dos bandos clasificada **Blunder u Oportunidad perdida**. Las Imprecisiones y los Errores no generan ejercicio; se practican en el repaso de la partida (D9b).
- **`brilliant` (Encuentra la brillante):** solo con Brillantes que pasaron D4b, incluida la condición de respuesta única. Se generan en dos casos, para los dos bandos:
  - **No vista** (`brilliant_played = false`): había una Brillante (`brilliantMissed`) y quien movía no la jugó. Es el caso más valioso, sobre todo cuando era el turno del usuario.
  - **Jugada** (`brilliant_played = true`): alguien sí la jugó. Si fue el rival, se practica el patrón que se le pasó al usuario; si fue el usuario, sirve de repaso.

  Si una posición es a la vez `mistake` y `brilliant` (alguien falló donde había una Brillante), se crea un solo ejercicio de tipo `brilliant` con la refutación del error.

Sin `user_color`, los ejercicios se generan igual con `side = null` y se etiquetan "Blancas" o "Negras". Al indicar el color, se rellena `side`.

**Reanálisis:** se hace upsert por `(game_id, ply)`.
- Si `kind` y `best_uci` no cambian, se conserva el progreso (`box`, `due_at`, intentos).
- Si cambian, la respuesta del ejercicio es otra, así que el progreso se reinicia (`box = 0`, `due_at = now`). Los intentos viejos se conservan como historial.
- Los ejercicios que ya no califican se archivan (`archived_at`), no se borran. Si vuelven a calificar, se desarchivan.
- **Sesión:**
  - Se toman hasta 10 ejercicios no archivados ni dominados con `due_at ≤ now`, primero los más atrasados; si no hay pendientes, se toman nuevos (`attempts = 0`).
  - Un ejercicio fallado se vuelve a poner una vez al final de la sesión en curso.
  - Filtros: tipo de ejercicio (errores, brillantes), de quién (mías, de rivales), tipo de error, fase (apertura/medio juego/final, según el número de jugada y el material) y partida.
  - En todos los ejercicios el tablero se orienta al bando que mueve, con la posición previa.
  - `mistake`: el texto es "¿Qué era mejor aquí?". La jugada original ("jugaste ♞f3??" o "tu rival jugó ♞f3??") se muestra después de responder, no antes, para no sesgar.
  - `brilliant`: el texto es "Hay una jugada brillante. Encuéntrala." Avisar que existe es parte del ejercicio, como en los puzzles. Después se indica si se jugó o quién la dejó pasar.
- **Validación:**
  - `brilliant`: solo cuenta la jugada Brillante. D4b garantiza que no hay otra igual de buena.
  - `mistake`: es correcta si la jugada está en `accepted_uci`.
  - Si no está, el motor del cliente analiza la posición previa a profundidad 14 dos veces: con `searchmoves <jugada del usuario>` y con `searchmoves <best_uci>`. Las dos evals salen de la misma raíz y la misma profundidad, así que se comparan sin el ruido de mezclar profundidades. Es correcta si la pérdida es < 0.05; no se exige la mejor exacta, igual que en Lichess.
  - Al fallar se ofrece un reintento, una pista (se resalta la pieza a mover) y "Ver solución".
- **Explicación:** después de responder se anima la refutación de la jugada original (`refutation_pv`: lo que el rival podía hacer) y luego la mejor línea, con la evaluación antes y después.
- **Repetición espaciada (Leitner):**
  - Al terminar cada ejercicio, el cliente manda **una sola** llamada `practice.submitResult({ exerciseId, firstTryCorrect, usedHint, viewedSolution })`. El servidor calcula la caja. La repetición del mismo ejercicio al final de la sesión no cambia la caja.
  - Correcto al primer intento sin pista: `box += 1`. Incorrecto, con pista o con solución vista: `box = 0`.
  - Intervalos por caja: 0 → ahora, 1 → 1 d, 2 → 3 d, 3 → 7 d, 4 → 21 d, 5 → dominado (sale de la cola).
  - La validación del intento es solo en el cliente; el servidor registra el resultado. Es aceptable porque solo afecta al propio usuario.
- **Resumen:** ejercicios pendientes, dominados y racha, más un contador por tipo de error, separando mías y de rivales.
  - "Pendientes" compara `due_at ≤ now` con timestamps, sin problemas de zona horaria.
  - La racha cuenta días consecutivos con al menos un resultado, en la **zona horaria del navegador**: el cliente manda `tz` (IANA) y el servidor agrupa con `AT TIME ZONE`.

### D9b. Repasar la partida (estilo "Retry" de chess.com)
El resto de las jugadas se practica dentro de la propia partida, sin banco de ejercicios ni repetición espaciada:
- **Reintentar una jugada:** en la revisión, cualquier jugada con clase Imprecisión, Error, Blunder u Oportunidad perdida muestra el botón "Reintentar". El tablero vuelve a la posición previa y el usuario busca una jugada mejor.
- **Modo repaso:** el botón "Repasar partida" reproduce la partida desde el inicio, jugada por jugada, con el tablero orientado al bando elegido (por defecto, el del usuario).
  - En cada momento clave de ese bando (Imprecisión, Error, Blunder u Oportunidad perdida, más las Brillantes no vistas) se pausa y pide "Encuentra una jugada mejor".
  - El usuario puede intentar, pedir pista, ver la mejor jugada u "Omitir".
  - Las jugadas buenas se reproducen solas. Las teclas ◀ ▶ siguen funcionando.
  - Al final se muestra un resumen: momentos clave acertados de N.
- **Validación:** la misma que en los ejercicios de tipo `mistake` (D9). Primero la mejor jugada guardada y la segunda línea si pierde < 0.05; si no, comparación con `searchmoves` a profundidad 14. En un momento de Brillante no vista, la jugada Brillante se celebra como "¡Brillante!" y otra jugada aceptable cuenta como acierto.
- **Persistencia:** no se guarda nada; es práctica libre. Funciona también sin cuenta, sobre un análisis en memoria.

### D10. UI y diseño
- **Base:** Tailwind 4 + shadcn/ui, tema oscuro por defecto con verde tablero (paleta propia inspirada en chess.com, sin copiar sus assets). Se diseña desde 360 px de ancho.
- **Pantalla de análisis en móvil:**
  - De arriba abajo: jugador rival, tablero a todo el ancho con la barra de evaluación vertical delgada a la izquierda, jugador propio, gráfica de evaluación compacta (tocar un punto lleva a esa jugada), lista de jugadas horizontal desplazable y barra inferior fija con ⏮ ◀ ▶ ⏭.
  - Se navega con swipe sobre la gráfica y con las flechas del teclado.
- **En escritorio:** tablero a la izquierda y panel lateral con el resumen (precisión, conteo por clase como en el Game Review de chess.com) y la lista de jugadas.
- **Iconos de clasificación propios en SVG:** no se usan los de chess.com, que son assets con derechos. Se sigue la convención de colores y símbolos:

| Clase | Color | Símbolo |
|---|---|---|
| Brillante | turquesa | !! |
| Gran jugada | azul | ! |
| Mejor | verde | ★ |
| Excelente | verde | 👍 |
| Buena | verde claro | ✓ |
| Teoría | café | 📖 |
| Forzada | gris | → |
| Imprecisión | amarillo | ?! |
| Error | naranja | ? |
| Oportunidad perdida | rosa | ✕ |
| Blunder | rojo | ?? |

  El icono se dibuja sobre la casilla de destino con el `squareRenderer` de react-chessboard y se repite en la lista de jugadas. La mejor jugada se muestra con una flecha.
- **Tablero:** react-chessboard v5 (MIT, requiere React 19). chessground tiene mejor soporte táctil pero es GPL y su wrapper de React no es oficial. Se queda react-chessboard, que es el mismo que usa WintrChess y facilita portar. Se habilita "tocar origen, tocar destino" además de arrastrar, porque en el celular arrastrar es incómodo [POR VERIFICAR la experiencia táctil de arrastre en iOS].
- **Accesibilidad:** cada icono tiene `aria-label` con el nombre de la clase. El contraste se mantiene AA y los botones táctiles miden ≥ 44 px.

### D11. Cuentas: correo y contraseña sin verificación, máximo 20 cuentas
- Better Auth en `app/api/auth/[...all]/route.ts` con `emailAndPassword: { enabled: true, requireEmailVerification: false }` y el plugin `nextCookies()` al final de la lista de plugins.
- No se verifica el correo y se aceptan correos falsos, así que no hace falta servicio de correo. La contraseña mide mínimo 8 caracteres (el default de Better Auth).
- **Sin recuperación de contraseña:** sin correo real no hay cómo enviarla. Si alguien la olvida, el operador la restablece con un script CLI (`reset-password <email>`).

**Tope de 20 cuentas.** El valor vive en **un solo lugar**: la fila `max_users` de `app_config` (D8). La crea una migración con 20 y se cambia con un `UPDATE`, sin redeploy. *Se descartaron* la variable `MAX_USERS` y el setting de base `app.max_users`, que daban dos fuentes de verdad, y `ALTER DATABASE ... SET` podría no estar permitido en Neon.

Se bloquea en tres capas, para que no lo salte ni un cliente modificado ni dos registros simultáneos:
1. **Front:** tRPC público `auth.signupStatus` → `{ open: boolean }`. Con `open = false`, `/registro` muestra "Registro cerrado: se alcanzó el límite de cuentas", sin formulario. El enlace "Crear cuenta" del login se reemplaza por ese aviso. Si la consulta falla, se muestra el formulario y decide el back.
2. **Back:** el hook `databaseHooks.user.create.before` de Better Auth compara `count(user)` con `app_config.max_users` y lanza `APIError("FORBIDDEN", { message: "SIGNUP_CLOSED" })` si ya se alcanzó. El front traduce ese código al mismo aviso. Sirve para quien llame `/api/auth/sign-up/email` directo.
3. **Base de datos:** el conteo del hook tiene una carrera (dos registros simultáneos con 19 cuentas). Por eso hay un trigger `BEFORE INSERT` en `user` que toma `pg_advisory_xact_lock(<constante>)`, lee `app_config.max_users` y lanza una excepción si `count(*) >= max_users`. Es la garantía final.
   - El lock de transacción funciona con el pooler (D2).
   - En el caso raro de la carrera, el perdedor puede recibir un error genérico en lugar del 403 [POR VERIFICAR cómo propaga Better Auth la excepción del trigger; si sale como 500, se mapea a `SIGNUP_CLOSED` por el código de error de la excepción]. Lo que se garantiza es que nunca hay una cuenta 21.

**Rate limits:**
- **Auth:** el `rateLimit` integrado de Better Auth, con `storage: "database"`. En Vercel la memoria no se comparte entre instancias serverless, así que el almacenamiento en memoria no sirve. Límites: sign-in y sign-up 5 por minuto por IP, el resto 60 por minuto. Better Auth toma la IP de `x-forwarded-for`, que Vercel fija [POR VERIFICAR la cabecera que usa en Vercel].
- **Rutas propias:** un helper `rateLimit(key, max, windowSec)` sobre `rate_limits`, con una fila por clave y un upsert atómico.
  - El upsert reinicia la ventana si ya venció y si no incrementa: `ON CONFLICT DO UPDATE SET count = CASE WHEN window_start < now() - window THEN 1 ELSE count + 1 END, ...`, con `RETURNING count`.
  - Una fila por clave evita que la tabla crezca sin control.
  - Límites:
    - `/api/import/chesscom/[type]/[id]`: 10 por minuto por IP. Llama a un tercero y es pública.
    - `games.import`: 10 por minuto por usuario.
    - `analysis.save`: 30 por minuto por usuario.
    - `practice.submitResult`: 120 por minuto por usuario.
  - Al excederlo responde 429 / `TOO_MANY_REQUESTS`.
- Las llamadas a Lichess y Chess.com desde el navegador no pasan por el servidor, así que no llevan rate limit propio. Ahí aplican los límites de cada plataforma (D6).

**Sesión y CSRF:**
- La sesión se lee en el servidor con `auth.api.getSession` dentro del contexto de tRPC. Hay un `protectedProcedure` para todo lo que sea por usuario.
- `middleware.ts` (Next 15, D1) solo hace la redirección optimista a `/login` en `/partidas` y `/practicar`. La verificación real es la del procedimiento.
- **CSRF:**
  - La cookie de sesión de Better Auth es `SameSite=Lax`, así que el navegador no la manda en POST de otros sitios.
  - Las mutaciones de tRPC son siempre POST con JSON.
  - Better Auth valida el `Origin` contra `trustedOrigins` (`BETTER_AUTH_URL`).
  - Las queries de tRPC (GET) solo leen.
- **Enumeración de correos:** el registro responde "Ya existe una cuenta con ese correo". Se acepta: son 20 cuentas personales y el rate limit frena el barrido.
- **Contraseña olvidada:** el script `reset-password` usa la API interna de Better Auth (`ctx.password.hash` y `internalAdapter.updatePassword`), no un hash propio, e invalida las sesiones del usuario.

**Sin cuenta:**
- Se puede importar por PGN o link y analizar en `/analizar`, una ruta solo de cliente. La partida y el análisis viven en memoria.
- Al pulsar "Guardar y crear ejercicios" se pide iniciar sesión o registrarse. El PGN y el análisis quedan pendientes en `sessionStorage` (misma pestaña, < 5 MB), y al volver se guardan sin reanalizar.
- Si el registro está cerrado y el visitante no tiene cuenta, se le dice que no se puede guardar. El análisis sigue en pantalla.

### D12. Estructura
```
src/
  app/            rutas: / (importar), /analizar (análisis en memoria, sin cuenta), /partidas, /partidas/[id] (análisis guardado), /practicar, /login, /registro
  server/         db (Drizzle schema), api (routers tRPC), auth
  lib/classify/   EP, clases, brillante, seguridad de piezas (puro + tests)
  lib/engine/     wrapper UCI del Worker de Stockfish
  lib/import/     PGN, Lichess, Chess.com
  components/     board, eval-bar, eval-graph, move-list, class-icon
public/engine/    stockfish lite (js + wasm)
```
Tests con `node --test` + `tsx`, como en QR-generator. Los de `lib/classify` y `lib/import` son puros. Los de servidor (tope de cuentas, rate limit, aislamiento por usuario, generación de ejercicios, validación del análisis) corren contra el Postgres local (D2).

### D13. PWA instalable
- **Nombre:** "Chess Puzzle Creator". **Dominio:** `chess-puzzle-creator.vercel.app`.
- **Manifest** con `app/manifest.ts`, que Next soporta de forma nativa:
  - `display: standalone`, colores del tema e iconos 192, 512 y maskable;
  - `apple-touch-icon` y meta tags para iOS.
- **Service worker** con Serwist (`@serwist/next`) [POR VERIFICAR compatibilidad con Next 15 y Turbopack en dev; si no, un `sw.js` escrito a mano].
  - **Precache:** los binarios de Stockfish (`public/engine/`), el libro de aperturas, `/_next/static/*` y el HTML de las páginas públicas que funcionan sin red: `/` y `/analizar`.
  - **Network-only:** tRPC, `/api/*` (incluido auth) y las páginas con datos del usuario (`/partidas*`, `/practicar`). Así nunca se sirve desde caché HTML con datos de una sesión, ni se le muestra a otro usuario del mismo dispositivo.
  - Una navegación sin red a una página no cacheada muestra una página `/offline` precacheada.
- **Botón "Instalar app":**
  - En Android y escritorio se captura `beforeinstallprompt` y se muestra el botón en el menú. Desaparece si la app ya corre en modo `standalone`.
  - En iOS no existe ese evento, así que se muestran las instrucciones "Compartir → Agregar a pantalla de inicio".
- **Sin conexión:** la app abre y se puede analizar un PGN pegado, porque el motor está en caché. Lo que necesita red (importar por usuario o link, guardar, practicar) muestra "Sin conexión".
- **Actualizaciones:** con una versión nueva del service worker se muestra el aviso "Hay una nueva versión · Recargar".

### Variables de entorno
- `DATABASE_URL`: Neon, directa; se usa para migraciones.
- `DATABASE_URL_POOLED`: Neon, pooler; la usa la app.
- `DATABASE_URL_TEST`: Postgres local de docker compose (`chess_test`); solo para pruebas y nunca en Vercel.
- `BETTER_AUTH_SECRET`.
- `BETTER_AUTH_URL`: `https://chess-puzzle-creator.vercel.app` en producción.

El `src/env.js` de T3 se ajusta, porque por defecto solo pide `DATABASE_URL`.

## Risks / Trade-offs
- **Análisis lento en celulares viejos:** a profundidad 16 con MultiPV 2, una partida de 40 jugadas puede tardar minutos con un solo hilo. Se mitiga con los presets, el progreso visible, que los resultados parciales se vayan mostrando y, más adelante, con multihilo o cloud eval de Lichess. Hay que medirlo (tarea 3.6).
- **Clasificación distinta a chess.com:** su modelo de EP depende del rating y no es público. Se acepta la aproximación. `classifier_version` permite reanalizar si cambian las reglas.
- **Falsos Brillantes:** son el riesgo principal de la calidad de los ejercicios. Se mitigan con D4b (reanálisis profundo, sacrificio sostenido, respuesta única) y con el set de calibración con meta de 0 falsos positivos. Es preferible perder un Brillante real que crear un ejercicio falso.
- **Endpoint no oficial de Chess.com:** puede cambiar sin aviso. Está aislado en una sola ruta y tiene alternativa: pegar el PGN o importar por usuario.
- **Neon suspendido:** la primera consulta tras 5 min sin uso tarda ~1 s. Es aceptable para un proyecto personal.
- **Base compartida entre producción y desarrollo** (decisión del usuario): se acepta porque todos los datos son de prueba y se pueden borrar. Los tests automatizados nunca tocan Neon (helper restringido a localhost, D2).
- **Pestaña suspendida en el celular:** iOS y Android pueden matar la pestaña a medio análisis, y se pierde el progreso. Se mitiga con Wake Lock y con los presets. Guardar el progreso parcial en IndexedDB queda para después si resulta molesto.
- **GPL:** el repo es público bajo GPL-3.0 (D5). Cualquier dependencia que se agregue debe ser compatible con GPL-3.0; MIT, BSD, Apache-2.0 y CC0 lo son.

## Migration Plan
Proyecto nuevo. Las migraciones se aplican a mano con `pnpm db:migrate` (contra `DATABASE_URL`) antes de desplegar (D2).

*Se descartó* migrar en el build de Vercel: cada deploy de preview, de cualquier rama de git, aplicaría a la única base migraciones de código sin terminar.

## Open Questions
1. ~~Licencia del repo~~ **Decidido:** opción A, repo público bajo GPL-3.0 y portar el clasificador de WintrChess (D5).
2. ~~Métodos de login~~ **Decidido:** correo y contraseña sin verificación, con tope de 20 cuentas (D11).
3. ~~Nombre y dominio~~ **Decidido:** Chess Puzzle Creator, en `chess-puzzle-creator.vercel.app` (D13).
4. ~~Imprecisiones como ejercicios~~ **Decidido:** solo Blunders, Brillantes y Oportunidades perdidas generan ejercicios. El resto se practica en el repaso de la partida (D9b).

## Fuentes verificadas (2026-10-18)
- Clasificación chess.com: https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
- Precisión y Win% de Lichess: https://lichess.org/page/accuracy
- WintrChess (GPL-3.0), clasificador en `shared/src/lib/reporter/`: https://github.com/WintrCat/wintrchess
- Stockfish.js v19: https://github.com/nmrugg/stockfish.js · COOP/COEP: https://web.dev/articles/coop-coep
- react-chessboard v5: https://github.com/Clariity/react-chessboard · chess.js: https://github.com/jhlywa/chess.js
- Lichess API: https://lichess.org/api · Chess.com Published-Data API: https://www.chess.com/news/view/published-data-api
- Aperturas: https://github.com/lichess-org/chess-openings
- create-t3-app: https://github.com/t3-oss/create-t3-app · Better Auth + Next: https://www.better-auth.com/docs/integrations/next
- Vercel límites: https://vercel.com/docs/limits · Neon: https://neon.com/pricing · Netlify: https://www.netlify.com/pricing/
- Lichess "Learn from your mistakes": https://lichess.org/@/lichess/blog/learn-from-your-mistakes/WFvLpiQA
