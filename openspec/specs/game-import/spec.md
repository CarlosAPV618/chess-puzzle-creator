# game-import Specification

## Purpose
TBD - created by archiving change add-chess-analyzer. Update Purpose after archive.
## Requirements
### Requirement: Importar desde PGN pegado
El sistema SHALL aceptar texto PGN con una o varias partidas (máximo 50 partidas y 1 MB), SHALL separarlas y validarlas con chess.js, y SHALL reportar las inválidas sin bloquear las válidas.

#### Scenario: Varias partidas
- **WHEN** el usuario pega un PGN con 3 partidas válidas
- **THEN** ve las 3 en la lista con jugadores, resultado y fecha

#### Scenario: Partida inválida en el lote
- **WHEN** una de las partidas tiene una jugada ilegal
- **THEN** se importan las demás y se muestra "Partida 2: jugada ilegal en 14...Qxe4"

#### Scenario: Excede el límite
- **WHEN** el texto tiene más de 50 partidas o pesa más de 1 MB
- **THEN** se rechaza con un mensaje que indica el límite y no se importa nada

### Requirement: Importar desde link de partida
El sistema SHALL aceptar links de partidas de:
- **Lichess:** `lichess.org/{id}` con o sin color o jugada. Se toman los primeros 8 caracteres de la ruta como id. Se consulta desde el navegador.
- **Chess.com:** `chess.com/game/live/{id}`, `/game/daily/{id}` y `/game/{id}`; el último se trata como `live`. Se resuelve en la ruta del servidor `/api/import/chesscom/[type]/[id]`, que SHALL aceptar solo `type ∈ {live, daily}` e `id` numérico de hasta 15 dígitos, y SHALL construir ella misma las URLs que consulta.

#### Scenario: Link de Lichess
- **WHEN** el usuario pega `https://lichess.org/abcd1234/black`
- **THEN** el navegador descarga el PGN de `lichess.org/game/export/abcd1234` y abre la partida orientada a negras

#### Scenario: Link de Chess.com
- **WHEN** el usuario pega `https://www.chess.com/game/live/123456789`
- **THEN** el servidor obtiene jugadores y fecha, busca la partida en el archivo mensual por `url` y devuelve su PGN

#### Scenario: Chess.com no disponible
- **WHEN** el endpoint no oficial de Chess.com falla o cambia de formato
- **THEN** se muestra "No pudimos traer esta partida. Pega el PGN o importa por usuario" y no se queda cargando

#### Scenario: Id manipulado
- **WHEN** alguien llama `/api/import/chesscom/live/..%2F..%2Fevil` o con un `type` distinto de `live` o `daily`
- **THEN** la ruta responde 400 sin hacer ninguna petición externa

#### Scenario: URL de jugador de Lichess
- **WHEN** el usuario pega `https://lichess.org/abcd1234wxyz` (12 caracteres)
- **THEN** se importa la partida `abcd1234`

#### Scenario: Link no reconocido
- **WHEN** el texto pegado no es PGN ni un link soportado
- **THEN** se muestra qué formatos se aceptan

### Requirement: Importar por usuario
El sistema SHALL traer las N partidas más recientes (por defecto 20, máximo 100) de un usuario de Lichess o Chess.com desde el navegador, con peticiones en serie, y SHALL detectar el color del usuario en cada partida.

#### Scenario: Usuario de Chess.com
- **WHEN** el usuario escribe `hikaru` con plataforma Chess.com y N = 20
- **THEN** se piden los archivos mensuales del más reciente hacia atrás, uno a la vez, hasta juntar 20 partidas, y cada una trae `user_color`

#### Scenario: Límite de peticiones
- **WHEN** Lichess o Chess.com responde 429
- **THEN** se espera 60 s antes de reintentar, se muestra "La plataforma nos pidió esperar un minuto" y las partidas ya recibidas se conservan

#### Scenario: Usuario inexistente
- **WHEN** la plataforma responde 404 para el usuario
- **THEN** se muestra "No encontramos ese usuario en Lichess/Chess.com"

### Requirement: Partidas no soportadas
El sistema SHALL rechazar, reportándolas como "no soportada" sin bloquear las demás:
- las variantes distintas de ajedrez estándar (`[Variant]` distinto de Standard o From Position, o `rules ≠ "chess"` en Chess.com);
- las partidas con menos de 2 jugadas.

Las partidas desde una posición (`[SetUp "1"]` + `[FEN]`) SHALL aceptarse y analizarse desde ese FEN, sin libro de aperturas.

#### Scenario: Chess960 en el lote
- **WHEN** la importación por usuario trae 20 partidas y 2 son Chess960
- **THEN** se importan 18 y se informa "2 no soportadas (variante)"

#### Scenario: PGN con formato irregular
- **WHEN** el PGN pegado tiene BOM, finales de línea CRLF, comentarios `{[%clk ...]}`, variantes entre paréntesis y dos partidas sin línea en blanco entre ellas
- **THEN** se detectan las dos partidas y se importa la línea principal de cada una

### Requirement: Sin duplicados
Al guardar, el sistema SHALL ignorar las partidas que ya existen para el usuario con el mismo `(source, source_id)`. Si un PGN pegado trae `[Site]` de Lichess o `[Link]` de Chess.com, `source` y `source_id` SHALL tomarse de ahí. Si no, `source = pgn` y `source_id` SHALL ser un hash de los movimientos y de los headers White, Black y Date.

#### Scenario: Misma partida por PGN y por link
- **WHEN** el usuario importa por link `lichess.org/abcd1234` y después pega el PGN de esa misma partida, que trae `[Site "https://lichess.org/abcd1234"]`
- **THEN** no se crea una segunda partida

#### Scenario: Reimportar
- **WHEN** el usuario importa por usuario dos veces seguidas
- **THEN** la segunda vez no crea partidas repetidas y muestra "0 nuevas, 20 ya estaban"

### Requirement: Color del usuario
Cuando no pueda detectarse por usuario de plataforma, el sistema SHALL buscar los nombres registrados en `player_names` (sin distinguir mayúsculas). Si no hay coincidencia, SHALL preguntar qué jugador es el usuario (blancas, negras o ninguno) y SHALL guardar el nombre elegido. El usuario SHALL poder cambiar el color de una partida con `games.setUserColor`, que actualiza también el `side` de sus ejercicios.

#### Scenario: Corregir el color
- **WHEN** el usuario cambia el color de una partida de blancas a negras
- **THEN** sus ejercicios con `side = me` pasan a `opponent` y viceversa

#### Scenario: PGN de partida propia
- **WHEN** se importa un PGN con White `Carlos_MX` y el usuario ya registró `carlos_mx` como su nombre
- **THEN** `user_color` se asigna a blancas sin preguntar

