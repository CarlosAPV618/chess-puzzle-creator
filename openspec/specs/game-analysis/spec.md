# game-analysis Specification

## Purpose
TBD - created by archiving change add-chess-analyzer. Update Purpose after archive.
## Requirements
### Requirement: Análisis en el cliente
El sistema SHALL analizar las partidas con Stockfish 19 lite (WASM) en un Web Worker del navegador, con MultiPV 2 y la profundidad del preset elegido (Rápido 12, Normal 16, Profundo 20). El servidor no SHALL ejecutar el motor.

#### Scenario: Historial y fin de partida
- **WHEN** la partida termina en jaque mate, o una posición intermedia es una triple repetición
- **THEN** la posición final se evalúa sin el motor (mate 0 o 0 cp) y el motor recibe cada posición con `position fen <inicial> moves ...`, de modo que la repetición se evalúa como tablas

#### Scenario: Progreso
- **WHEN** el usuario pulsa "Analizar" en una partida de 40 jugadas
- **THEN** ve una barra de progreso por jugada, y la gráfica y los iconos aparecen conforme avanzan

#### Scenario: Cancelar
- **WHEN** el usuario pulsa "Cancelar" o sale de la página a medio análisis
- **THEN** el Worker se detiene y no se guarda un análisis parcial

#### Scenario: Navegador sin WebAssembly
- **WHEN** el navegador no soporta WebAssembly
- **THEN** se usa la build ASM.js o, si tampoco carga, se muestra "Tu navegador no puede ejecutar el motor"

### Requirement: Pantalla de revisión
La pantalla de análisis SHALL mostrar:
- el tablero orientado al color del usuario;
- la barra de evaluación;
- la gráfica de evaluación navegable;
- la flecha de la mejor jugada;
- el icono de clasificación sobre la casilla de destino y en la lista de jugadas;
- la precisión de cada jugador;
- el conteo por clase.

SHALL funcionar desde 360 px de ancho.

#### Scenario: Navegar jugadas en móvil
- **WHEN** el usuario toca ▶ en la barra inferior o un punto de la gráfica
- **THEN** el tablero va a esa jugada, la barra de evaluación se actualiza y la jugada queda resaltada y visible en la lista

#### Scenario: Navegar con teclado
- **WHEN** el usuario presiona ← o → en escritorio
- **THEN** retrocede o avanza una jugada

#### Scenario: Explorar una variante
- **WHEN** el usuario mueve una pieza en el tablero durante la revisión
- **THEN** se muestra la evaluación de la nueva posición sin modificar la partida guardada, y "Volver a la partida" restaura la posición

### Requirement: Guardar el análisis
Con sesión, el sistema SHALL guardar el análisis completo al terminar, de forma automática. Incluye:
- `positions` (N+1): eval desde blancas, mejor y segunda línea, PV corta;
- `moves` (N): clase, pérdida de EP y datos de Brillante;
- precisiones, profundidad, versión del motor y versión del clasificador.

El servidor SHALL:
- reproducir el PGN guardado;
- validar con Zod la forma, los tamaños (N+1 y N) y el tamaño total < 200 KB;
- rechazar cualquier UCI que no sea legal en su posición.

#### Scenario: Abrir partida ya analizada
- **WHEN** el usuario abre una partida guardada que ya tiene análisis
- **THEN** la revisión se muestra de inmediato sin volver a correr el motor

#### Scenario: Análisis inconsistente
- **WHEN** el cliente envía un análisis cuyo número de posiciones no es N+1, o con una `best.uci` ilegal en su posición
- **THEN** el servidor responde BAD_REQUEST y no guarda nada

#### Scenario: Reanalizar
- **WHEN** el usuario reanaliza con otro preset o hay una versión nueva del clasificador
- **THEN** el análisis nuevo reemplaza al anterior y los ejercicios se actualizan sin perder el progreso

### Requirement: Mis partidas
El sistema SHALL listar las partidas guardadas del usuario, de la más reciente a la más antigua, con rival, resultado, apertura, precisión (si hay análisis) y número de errores y brillantes.

#### Scenario: Lista con estado
- **WHEN** el usuario abre "Mis partidas"
- **THEN** cada partida muestra si está analizada y las no analizadas tienen un botón "Analizar"

#### Scenario: Borrar partida
- **WHEN** el usuario borra una partida y confirma
- **THEN** se borran en cascada su análisis, sus ejercicios y sus intentos

### Requirement: Licencia del motor
La app SHALL mostrar un aviso de que usa Stockfish (GPL-3.0) con un enlace a su código fuente.

#### Scenario: Aviso visible
- **WHEN** el usuario abre "Acerca de" o el pie de la pantalla de análisis
- **THEN** ve el aviso de Stockfish y el enlace a su repositorio

### Requirement: Reintentar jugadas y repasar la partida
En la revisión, toda jugada clasificada Imprecisión, Error, Blunder u Oportunidad perdida SHALL ofrecer "Reintentar", que vuelve a la posición previa para buscar una jugada mejor. El modo "Repasar partida" SHALL reproducir la partida para el bando elegido y SHALL pausar en cada momento clave de ese bando (Imprecisión, Error, Blunder, Oportunidad perdida o Brillante no vista) para que el usuario intente una jugada mejor, con pista, solución y "Omitir". La validación SHALL ser la misma que en los ejercicios `mistake`. El repaso no SHALL guardar nada y SHALL funcionar sin cuenta.

#### Scenario: Reintentar una imprecisión
- **WHEN** el usuario toca "Reintentar" en una jugada ?! y juega una jugada que pierde < 0.05 EP frente a la mejor
- **THEN** se marca "¡Mejor!" con la evaluación, y "Volver a la partida" restaura la posición

#### Scenario: Repaso completo
- **WHEN** el usuario pulsa "Repasar partida" con su bando y la partida tiene 4 momentos clave suyos
- **THEN** las demás jugadas se reproducen solas, se pausa en los 4 momentos y al final ve "Acertaste 3 de 4"

#### Scenario: Sin cuenta
- **WHEN** un visitante sin sesión repasa una partida recién analizada
- **THEN** el repaso funciona igual y no se hace ninguna llamada de guardado

