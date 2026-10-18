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

Los controles "Analizar"/"Reanalizar" con la profundidad, y el aviso de reanálisis, SHALL ir debajo de la tabla de precisión cuando ya hay análisis. Sin análisis, SHALL ir arriba.

En pantallas menores a `lg` (celular y tablet), "Repasar partida" (que durante el repaso pasa a "Salir del repaso") y "Girar tablero" SHALL estar en la barra fija de navegación, visibles sin scroll y sin duplicarse en el panel. Al iniciar el repaso, la página SHALL desplazarse para que el tablero quede a la vista. En escritorio, esos botones se quedan en el panel.

En pantallas táctiles, la gráfica de evaluación SHALL responder solo a toques: un toque lleva a esa jugada y deslizar el dedo sobre ella hace scroll de la página. Con mouse SHALL seguir permitiendo arrastrar.

En todos los tableros (revisión, repaso, ejercicios), con mouse SHALL poder dibujarse flechas arrastrando con el botón derecho y marcarse casillas con clic derecho. Un clic izquierdo SHALL borrar las marcas.

SHALL funcionar desde 360 px de ancho sin scroll horizontal.

#### Scenario: Abrir una partida
- **WHEN** el usuario abre una partida analizada desde "Mis partidas"
- **THEN** el tablero muestra la posición inicial y ▶ avanza a la primera jugada

#### Scenario: Navegar jugadas en móvil
- **WHEN** el usuario toca ▶ en la barra inferior o un punto de la gráfica
- **THEN** el tablero va a esa jugada, la barra de evaluación se actualiza y la jugada queda resaltada y visible en la lista

#### Scenario: Scroll sobre la gráfica
- **WHEN** en un celular el usuario desliza el dedo verticalmente empezando sobre la gráfica
- **THEN** la página hace scroll y la jugada seleccionada no cambia

#### Scenario: Repasar desde el celular
- **WHEN** en un celular de 360 px el usuario toca "Repasar partida" en la barra fija
- **THEN** el repaso empieza con el tablero completo a la vista

#### Scenario: Navegar con teclado
- **WHEN** el usuario presiona ← o → en escritorio
- **THEN** retrocede o avanza una jugada

#### Scenario: Marcar con clic derecho
- **WHEN** el usuario arrastra con el botón derecho de e2 a e4 y hace clic derecho en d5
- **THEN** aparecen una flecha e2→e4 y la casilla d5 resaltada, y un clic izquierdo las borra

#### Scenario: Explorar una variante
- **WHEN** el usuario mueve una pieza en el tablero durante la revisión
- **THEN** se muestra la evaluación de la nueva posición sin modificar la partida guardada, y "Volver a la partida" restaura la posición

### Requirement: Mis partidas
El sistema SHALL listar las partidas guardadas del usuario, de la más reciente a la más antigua: por fecha de la partida y, a igualdad, por fecha de importación.

Cada partida SHALL mostrar:
- a la izquierda, una miniatura de la posición final;
- a la derecha, los jugadores con su Elo, el resultado, el ritmo, la precisión (si hay análisis) y el botón de borrar;
- el icono de Brillante con su número, solo si la partida tiene alguna.

No SHALL mostrar el contador de errores. El selector "Yo soy" (blancas o negras) SHALL aparecer solo si no se pudo detectar el color del usuario, y SHALL desaparecer al elegir uno.

#### Scenario: Lista con estado
- **WHEN** el usuario abre "Mis partidas"
- **THEN** cada partida muestra su miniatura final, si está analizada, y las no analizadas tienen un botón "Analizar"

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
- **THEN** no hay scroll horizontal y el menú inferior sigue fijo al hacer scroll

#### Scenario: Borrar partida
- **WHEN** el usuario borra una partida y confirma
- **THEN** se borran en cascada su análisis, sus ejercicios y sus intentos

### Requirement: Licencia del motor
La app SHALL mostrar un aviso de que usa Stockfish (GPL-3.0) con un enlace a su código fuente, una sola vez: al pie de `/practicar`. No SHALL repetirse en la revisión ni en cada ejercicio. El README SHALL conservar los créditos.

#### Scenario: Aviso visible
- **WHEN** el usuario baja al final de "Practicar"
- **THEN** ve el aviso de Stockfish y el enlace a su repositorio
- **AND** no lo ve en la pantalla de análisis ni dentro de un ejercicio
