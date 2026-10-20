## MODIFIED Requirements

### Requirement: Importar por usuario
El sistema SHALL traer las N partidas más recientes (por defecto 20, máximo 100) de un usuario de Lichess o Chess.com desde el navegador, con peticiones en serie, y SHALL detectar el color del usuario en cada partida.

Con sesión, si el usuario ya tiene partidas de Lichess o Chess.com con su color conocido, el formulario SHALL prellenar, por plataforma, el nombre con el que juega más veces; a igualdad, el de la partida más reciente. Mientras el usuario no haya elegido otra pestaña ni escrito nada, SHALL abrir la pestaña "Usuario" con la plataforma de la partida más reciente. Un nombre que el usuario ya editó no SHALL sobrescribirse.

#### Scenario: Usuario prellenado
- **WHEN** CarlosAPV, que ya importó partidas de chess.com como `CarlosAPV`, abre "Importar"
- **THEN** ve la pestaña "Usuario" con Chess.com elegido y `CarlosAPV` escrito, y puede pulsar "Traer partidas" directamente

#### Scenario: Cambiar de plataforma
- **WHEN** el usuario también tiene partidas de Lichess como `carlos_lich` y cambia a Lichess sin haber editado el campo
- **THEN** el campo pasa a `carlos_lich`

#### Scenario: Partidas importadas de otro jugador
- **WHEN** el usuario tiene 40 partidas de chess.com como `CarlosAPV` y ayer importó 10 de `hikaru` para estudiarlas
- **THEN** el campo de Chess.com se prellena con `CarlosAPV`

#### Scenario: Sin partidas de plataforma
- **WHEN** el usuario solo tiene partidas pegadas como PGN, o no tiene sesión
- **THEN** el formulario abre en "Pegar PGN" con el campo de usuario vacío

#### Scenario: Usuario de Chess.com
- **WHEN** el usuario escribe `hikaru` con plataforma Chess.com y N = 20
- **THEN** se piden los archivos mensuales del más reciente hacia atrás, uno a la vez, hasta juntar 20 partidas, y cada una trae `user_color`

#### Scenario: Límite de peticiones
- **WHEN** Lichess o Chess.com responde 429
- **THEN** se espera 60 s antes de reintentar, se muestra "La plataforma nos pidió esperar un minuto" y las partidas ya recibidas se conservan

#### Scenario: Usuario inexistente
- **WHEN** la plataforma responde 404 para el usuario
- **THEN** se muestra "No encontramos ese usuario en Lichess/Chess.com"
