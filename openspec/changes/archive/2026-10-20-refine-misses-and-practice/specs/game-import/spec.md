## MODIFIED Requirements

### Requirement: Color del usuario
Cuando no pueda detectarse por usuario de plataforma, el sistema SHALL buscar los nombres registrados en `player_names` (sin distinguir mayúsculas).

Si no hay coincidencia, la partida queda sin color y "Mis partidas" SHALL mostrar el selector "Yo soy" (blancas o negras). Al elegir uno, `games.setUserColor` SHALL, en una transacción:
- guardar el color;
- actualizar el `side` de sus ejercicios;
- registrar ese nombre en `player_names`;
- asignar el color a las demás partidas del usuario sin color donde ese nombre juega.

Una partida con color detectado no SHALL ofrecer el selector.

#### Scenario: Elegir el color
- **WHEN** el usuario elige "Blancas" en una partida sin color donde blancas es `Carlos_MX`
- **THEN** sus ejercicios pasan a `side = me` u `opponent` según el bando
- **AND** `carlos_mx` queda registrado
- **AND** sus otras partidas sin color donde juega `Carlos_MX` reciben su color

#### Scenario: Corregir el color
- **WHEN** el usuario cambia el color de una partida de blancas a negras (`games.setUserColor`)
- **THEN** sus ejercicios con `side = me` pasan a `opponent` y viceversa

#### Scenario: PGN de partida propia
- **WHEN** se importa un PGN con White `Carlos_MX` y el usuario ya registró `carlos_mx` como su nombre
- **THEN** `user_color` se asigna a blancas sin preguntar
