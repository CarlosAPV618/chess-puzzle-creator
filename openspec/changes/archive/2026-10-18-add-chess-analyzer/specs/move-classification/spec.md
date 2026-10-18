## ADDED Requirements

### Requirement: Convención de evaluación
Las evaluaciones guardadas SHALL estar siempre desde el punto de vista de blancas, como `{ cp }` o `{ mate }`. El wrapper del motor SHALL convertir el `score` de Stockfish, que viene desde el bando que mueve. El clasificador SHALL convertir a la perspectiva del que mueve cuando calcule EP.

#### Scenario: Negras mueven
- **WHEN** en una posición con turno de negras Stockfish reporta `score cp 120`
- **THEN** se guarda `{ cp: -120 }`

### Requirement: Puntos esperados
El clasificador SHALL convertir cada evaluación a puntos esperados del bando que mueve con `EP = 1 / (1 + e^(-0.00368208 · cp))`. El cp SHALL limitarse a ±1000 antes de la conversión. Un mate a favor SHALL valer 1 y un mate en contra 0.

#### Scenario: Igualdad
- **WHEN** la evaluación es 0 cp
- **THEN** EP es 0.5

#### Scenario: Mate
- **WHEN** la evaluación es mate en 3 a favor del que mueve
- **THEN** EP es 1

### Requirement: Clasificación por pérdida
El clasificador SHALL calcular `pérdida = max(0, EP(mejor línea antes) − EP(después))` y SHALL clasificar así:
- Mejor si la jugada es la primera del motor.
- Excelente si la pérdida es < 0.02.
- Buena si es < 0.05.
- Imprecisión si es < 0.10.
- Error si es < 0.20.
- Blunder en otro caso.

Las transiciones que involucran mate SHALL seguir las reglas de design D4.

#### Scenario: Blunder
- **WHEN** el EP del que mueve pasa de 0.55 a 0.25
- **THEN** la jugada es Blunder

#### Scenario: Perder un mate ganado
- **WHEN** había mate en 2 a favor y tras la jugada hay mate en 1 en contra
- **THEN** la jugada es Blunder

### Requirement: Forzada y Teoría
Una jugada SHALL ser Forzada si era la única legal. SHALL ser Teoría si la posición resultante está en el libro de aperturas de lichess-org/chess-openings. Ambas comprobaciones SHALL aplicarse antes de la tabla de pérdida.

#### Scenario: Apertura conocida
- **WHEN** las primeras jugadas son 1.e4 e5 2.Cf3 Cc6 3.Ab5
- **THEN** las cinco jugadas son Teoría y la apertura de la partida es "Ruy Lopez"

### Requirement: Gran jugada
Una jugada SHALL ser Gran jugada solo si cumple todo lo siguiente:
- es la primera del motor;
- la segunda mejor línea no da ya ≥ +700 cp;
- no queda perdiendo;
- no es coronación a dama;
- el que mueve no estaba en jaque;
- no es un mate encontrado;
- no captura una pieza colgada;
- la segunda mejor jugada pierde ≥ 0.10 EP frente a la mejor.

#### Scenario: Única jugada
- **WHEN** la mejor jugada mantiene la igualdad y la segunda pierde 0.15 EP
- **THEN** la jugada es Gran jugada

#### Scenario: Capturar material regalado
- **WHEN** la mejor jugada captura una dama colgada
- **THEN** la jugada no es Gran jugada

### Requirement: Brillante
Una jugada SHALL ser Brillante solo si se cumple todo lo siguiente:
- es la primera jugada del motor;
- cumple el precandidato crítico;
- deja al menos una pieza propia que no es peón ni rey, insegura y de mayor valor que lo capturado;
- esa pieza no estaba ya atrapada;
- su captura no deja al rival una amenaza mayor ni mate en 1;
- sin jaque, no reduce el número de piezas colgadas.

Las coronaciones y los sacrificios de peón no SHALL ser Brillantes.

#### Scenario: Sacrificio de dama correcto
- **WHEN** la jugada del motor deja la dama atacada por un peón, el rival no está ganando ya, y tomarla lleva a mate o a ventaja decisiva
- **THEN** la jugada es Brillante

#### Scenario: Recaptura
- **WHEN** la jugada recaptura una pieza en un cambio equilibrado
- **THEN** la jugada no es Brillante

#### Scenario: Ya ganaba
- **WHEN** la segunda mejor línea ya daba +900 cp
- **THEN** la jugada no es Brillante aunque sacrifique una pieza

#### Scenario: Pieza que se perdía igual
- **WHEN** la pieza sacrificada ya estaba atrapada antes de la jugada
- **THEN** la jugada no es Brillante

### Requirement: Verificación de Brillantes
Todo candidato a Brillante, jugado o disponible y no jugado (`brilliantMissed`), SHALL verificarse antes de guardarse:
- reanálisis de la posición previa a profundidad 22 con MultiPV 3, y la jugada debe seguir siendo la primera y pasar todas las condiciones;
- el sacrificio debe sostenerse en los siguientes 4 plies de la línea principal;
- la diferencia de EP entre profundidades no debe superar 0.05.

Si alguna comprobación falla, el candidato no SHALL marcarse Brillante. Si cumple todo menos la jugada única (la segunda pierde < 0.10 EP), SHALL guardarse con `exerciseEligible = false`. Se SHALL verificar como máximo 6 candidatos por partida: primero los del bando del usuario y después los de mayor ganancia de EP. Los que excedan el tope no se marcan.

#### Scenario: Brillante que no aguanta profundidad
- **WHEN** un candidato es la mejor a profundidad 16 pero a profundidad 22 el motor prefiere otra jugada
- **THEN** la jugada no se marca Brillante

#### Scenario: Cambio diferido
- **WHEN** la "pieza colgada" se recupera con ventaja en los 4 plies siguientes de la línea principal, sin déficit de material sostenido
- **THEN** la jugada no se marca Brillante

#### Scenario: Brillante no jugada
- **WHEN** el usuario no hizo la jugada del motor y esa jugada pasaría la verificación de Brillante
- **THEN** el ply se marca `brilliantMissed` sin cambiar la clase de la jugada hecha

#### Scenario: Teoría con casilla al paso
- **WHEN** la posición tras 1.e4 tiene casilla al paso en el FEN de chess.js pero no en el dataset, o al revés
- **THEN** igual se reconoce como Teoría, porque la comparación usa solo piezas, turno y enroques

### Requirement: Calibración del clasificador
El repositorio SHALL incluir un set de posiciones etiquetadas con evals fijas (Brillantes reconocidos y casos engañosos) y un test que lo corra sin motor. El test SHALL fallar si hay algún falso positivo de Brillante o si el recall baja de 70 %.

#### Scenario: Regresión
- **WHEN** un cambio al clasificador hace que una recaptura del set salga Brillante
- **THEN** el test falla

### Requirement: Oportunidad perdida
Una jugada clasificada Imprecisión o Error por la tabla SHALL pasar a Oportunidad perdida si:
- la jugada previa del rival fue Error o Blunder;
- la mejor jugada daría EP ≥ 0.75.

Un Blunder SHALL seguir siendo Blunder.

#### Scenario: No castigar el blunder rival
- **WHEN** el rival deja una pieza colgada, capturarla daría EP 0.85 y el usuario juega una jugada que deja EP 0.72 (pérdida 0.13, Error por la tabla)
- **THEN** la jugada es Oportunidad perdida

#### Scenario: Blunder tras blunder rival
- **WHEN** en la misma situación el usuario juega una jugada que deja EP 0.40 (pérdida 0.45)
- **THEN** la jugada sigue siendo Blunder

### Requirement: Precisión
El sistema SHALL calcular la precisión de cada jugador con la fórmula por jugada de Lichess, `103.1668 · e^(−0.04354 · Δwin%) − 3.1669`, limitada a [0, 100] y promediada.

#### Scenario: Partida perfecta
- **WHEN** todas las jugadas de un jugador son la del motor
- **THEN** su precisión es 100
