## MODIFIED Requirements

### Requirement: Pantalla de revisión
La pantalla de análisis SHALL mostrar:
- el tablero orientado al color del usuario;
- la barra de evaluación;
- la gráfica de evaluación navegable;
- la flecha de la mejor jugada;
- el icono de clasificación sobre la casilla de destino y en la lista de jugadas;
- la precisión de cada jugador y el conteo por clase.

Al abrir una partida, el tablero SHALL estar en la posición inicial (ply 0).

**Encabezado de `/partidas/<id>`:** SHALL ser compacto (botón atrás de 36 px). Antes de los nombres SHALL mostrar el resultado:
- con color de usuario: "Ganaste", "Perdiste" o "Tablas";
- sin color: "Ganan blancas", "Ganan negras" o "Tablas";
- sin etiqueta si la partida no terminó (`*`).

**Gráfica de evaluación:**
- SHALL marcar con un punto del color de su clase las Brillantes, Grandes jugadas, Imprecisiones, Errores, Oportunidades perdidas y Errores graves;
- solo las del usuario cuando se conoce su color, y las de los dos bandos cuando no.
- En pantallas táctiles SHALL responder solo a toques: un toque lleva a esa jugada y deslizar el dedo hace scroll de la página. Con mouse SHALL seguir permitiendo arrastrar.

**Textos de una jugada** (veredicto, momento del repaso, "Encuentra una jugada mejor que…"): SHALL incluir el número de jugada y el bando: "12. b5" para blancas, "12… b5" para negras, y "(blancas)" o "(negras)" en el prompt de reintento.

**Botones bajo el tablero:** "Repasar partida" (que durante el repaso pasa a "Salir del repaso"), "Practicar partida" (solo si la partida tiene ejercicios) y "Girar tablero", en ese orden.
- SHALL estar en una sola fila desde 360 px, sin cortar el texto. Si no cabe, se ocultan antes los iconos de los botones de texto.
- La barra ◀ ▶ SHALL ir fija abajo en pantallas menores a `lg`.

**Lista de jugadas en celular:** una franja horizontal de unos 40 px de alto.

**Sin desplazamientos solos:** navegar con ◀ ▶, con la gráfica, con la lista, y el avance automático de "Repasar partida", no SHALL desplazar la página. Solo la lista de jugadas se desplaza dentro de su franja para mostrar la jugada activa. El veredicto de la jugada SHALL ocupar un alto fijo, también en la posición inicial.

**Controles de análisis:** "Analizar"/"Reanalizar" con la profundidad, y el aviso de reanálisis, SHALL ir debajo de la tabla de precisión cuando ya hay análisis. Sin análisis, SHALL ir arriba.

**Marcas con mouse:** en todos los tableros (revisión, repaso, ejercicios) SHALL poder dibujarse flechas arrastrando con el botón derecho y marcarse casillas con clic derecho. Un clic izquierdo SHALL borrar las marcas.

**Tableros:** las piezas y casillas de todos los tableros (revisión, ejercicios y miniaturas) no SHALL poder seleccionarse como texto ni abrir el menú de imagen con un toque largo.

SHALL funcionar desde 360 px de ancho sin scroll horizontal.

#### Scenario: Abrir una partida
- **WHEN** el usuario abre una partida analizada desde "Mis partidas"
- **THEN** el tablero muestra la posición inicial y ▶ avanza a la primera jugada

#### Scenario: Encabezado con resultado
- **WHEN** CarlosAPV, con blancas, abre una partida que terminó 1-0
- **THEN** el encabezado dice "Ganaste" antes de "CarlosAPV vs JihadGhaziri"

#### Scenario: Navegar sin que la página se mueva
- **WHEN** en un celular de 360 px el usuario está viendo el tablero y toca ▶ cinco veces
- **THEN** el tablero avanza cinco jugadas, la jugada activa queda visible en la franja de jugadas y la página no se desplaza

#### Scenario: Repasar sin arrastrar la página
- **WHEN** el usuario toca "Repasar partida" y el repaso avanza solo
- **THEN** la página no se desplaza

#### Scenario: Prompt con número y bando
- **WHEN** el usuario toca "Reintentar" en la jugada 12 de blancas, b5
- **THEN** ve "Encuentra una jugada mejor que 12. b5 (blancas)"

#### Scenario: Gráfica del usuario
- **WHEN** CarlosAPV, con blancas, abre una partida donde cometió 2 Imprecisiones y su rival 3 Errores
- **THEN** la gráfica muestra los 2 puntos de Imprecisión de blancas y ninguno de los Errores de negras

#### Scenario: Botones en una fila
- **WHEN** el usuario abre una partida con ejercicios en 360 px
- **THEN** "Repasar partida", "Practicar partida" y el botón de girar quedan en la misma fila, con el texto completo

#### Scenario: Scroll sobre la gráfica
- **WHEN** en un celular el usuario desliza el dedo verticalmente empezando sobre la gráfica
- **THEN** la página hace scroll y la jugada seleccionada no cambia

#### Scenario: Repaso sin pistas
- **WHEN** durante "Repasar partida" el repaso se detiene en una jugada mala y muestra "Repasar" / "Continuar"
- **THEN** el tablero no dibuja la flecha de la mejor jugada; solo aparece al pedir "Ver solución"

#### Scenario: Navegar con teclado
- **WHEN** el usuario presiona ← o → en escritorio
- **THEN** retrocede o avanza una jugada

#### Scenario: Marcar con clic derecho
- **WHEN** el usuario arrastra con el botón derecho de e2 a e4 y hace clic derecho en d5
- **THEN** aparecen una flecha e2→e4 y la casilla d5 resaltada, y un clic izquierdo las borra

#### Scenario: Explorar una variante
- **WHEN** el usuario mueve una pieza en el tablero durante la revisión
- **THEN** se muestra la evaluación de la nueva posición sin modificar la partida guardada, y "Volver a la partida" restaura la posición

#### Scenario: Seleccionar texto
- **WHEN** el usuario arrastra el mouse sobre varias tarjetas de "Mis partidas" o hace doble clic en un tablero
- **THEN** las piezas y casillas no se resaltan como texto seleccionado

### Requirement: Mis partidas
El sistema SHALL listar las partidas guardadas del usuario, de la más reciente a la más antigua, siempre en el mismo orden:
1. por fecha de la partida;
2. luego por fecha de importación;
3. luego por partida.

SHALL cargar 30 al inicio y 30 más cada vez que el usuario llega al final con el scroll, con "Cargar más" de respaldo, sin repetir ninguna.

Cada partida SHALL mostrar:
- a la izquierda, una miniatura de la posición final, centrada en vertical;
- a la derecha, los jugadores con su Elo, el resultado, el ritmo, la precisión (si hay análisis) y el botón de borrar;
- el icono de Brillante con su número, solo si la partida tiene alguna.

Toda la tarjeta SHALL abrir la partida, salvo el botón de borrar y el selector "Yo soy", que hacen su propia acción.

No SHALL mostrar el contador de errores. El selector "Yo soy" (blancas o negras) SHALL aparecer solo si no se pudo detectar el color del usuario, y SHALL desaparecer al elegir uno.

#### Scenario: Lista con estado
- **WHEN** el usuario abre "Mis partidas"
- **THEN** cada partida muestra su miniatura final y si está analizada; las no analizadas indican "Analizar"

#### Scenario: Carga al hacer scroll
- **WHEN** el usuario tiene 75 partidas y abre "Mis partidas"
- **THEN** ve 30
- **AND** al llegar al final se cargan 30 más, y después las 15 restantes

#### Scenario: Borrar con varias tandas cargadas
- **WHEN** con 60 partidas cargadas el usuario borra la número 10
- **THEN** la lista queda con 59, sin huecos ni duplicados

#### Scenario: Tocar la tarjeta
- **WHEN** el usuario toca el espacio vacío de una tarjeta, junto a la precisión
- **THEN** se abre la partida

#### Scenario: Borrar no abre
- **WHEN** el usuario toca el botón de borrar de una tarjeta
- **THEN** se pide confirmación y no se abre la partida

#### Scenario: Color detectado
- **WHEN** el usuario registró su usuario de chess.com y la partida es suya
- **THEN** su tarjeta no muestra "Yo soy"

#### Scenario: Color desconocido
- **WHEN** el usuario no registró ningún usuario y pegó un PGN
- **THEN** la tarjeta muestra "Yo soy", y al elegir "Blancas" el selector desaparece y sus ejercicios pasan a `side = me` u `opponent`

#### Scenario: Sin brillantes
- **WHEN** una partida analizada no tiene Brillantes
- **THEN** su tarjeta no muestra el icono de Brillante

#### Scenario: Celular
- **WHEN** el usuario abre "Mis partidas" en 360 px
- **THEN** no hay scroll horizontal y el menú hamburguesa sigue accesible en el encabezado al hacer scroll

#### Scenario: Borrar partida
- **WHEN** el usuario borra una partida y confirma
- **THEN** se borran en cascada su análisis, sus ejercicios y sus intentos

### Requirement: Reintentar jugadas y repasar la partida
En la revisión, toda jugada clasificada Imprecisión, Error, Blunder u Oportunidad perdida SHALL ofrecer "Reintentar", que vuelve a la posición previa para buscar una jugada mejor.

El modo "Repasar partida" SHALL:
- reproducir la partida para el bando elegido;
- pausar en cada momento clave de ese bando (Imprecisión, Error, Blunder, Oportunidad perdida o Brillante no vista), para que el usuario intente una jugada mejor con pista, solución y "Omitir".

La validación SHALL ser la misma que en los ejercicios. La jugada de la partida no SHALL contar nunca como correcta, y en una Oportunidad perdida la alternativa SHALL conservar la posición ganadora.

El repaso no SHALL guardar nada y SHALL funcionar sin cuenta.

#### Scenario: Reintentar una imprecisión
- **WHEN** el usuario toca "Reintentar" en una jugada ?! y juega una jugada que pierde < 0.05 EP frente a la mejor
- **THEN** se marca "¡Mejor!" con la evaluación, y "Volver a la partida" restaura la posición

#### Scenario: Reintentar con la misma jugada
- **WHEN** el usuario toca "Reintentar" en 11. O-O (Oportunidad perdida) y vuelve a jugar O-O
- **THEN** se marca "No es la mejor"

#### Scenario: Repaso completo
- **WHEN** el usuario pulsa "Repasar partida" con su bando y la partida tiene 4 momentos clave suyos
- **THEN** las demás jugadas se reproducen solas, se pausa en los 4 momentos y al final ve "Acertaste 3 de 4"

#### Scenario: Sin cuenta
- **WHEN** un visitante sin sesión repasa una partida recién analizada
- **THEN** el repaso funciona igual y no se hace ninguna llamada de guardado
