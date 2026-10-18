# user-accounts Specification

## Purpose
TBD - created by archiving change add-chess-analyzer. Update Purpose after archive.
## Requirements
### Requirement: Registro con correo y contraseña sin verificación
El sistema SHALL permitir crear una cuenta con correo y contraseña (mínimo 8 caracteres) mediante Better Auth, sin verificar el correo. La sesión SHALL quedar activa al registrarse. La cookie SHALL ser `Secure` cuando `BETTER_AUTH_URL` es https.

#### Scenario: Registro exitoso
- **WHEN** un visitante se registra con `x@noexiste.test` y una contraseña de 8 caracteres
- **THEN** la cuenta se crea, la sesión queda activa y no se envía ningún correo

#### Scenario: Correo repetido
- **WHEN** alguien se registra con un correo que ya existe
- **THEN** se rechaza con "Ya existe una cuenta con ese correo"

#### Scenario: Cerrar sesión
- **WHEN** un usuario con sesión pulsa "Cerrar sesión"
- **THEN** la sesión se invalida en el servidor y la app vuelve a modo sin cuenta

### Requirement: Tope de cuentas
El sistema SHALL rechazar la creación de usuarios cuando el número de cuentas alcance `app_config.max_users` (20), única fuente del tope. El rechazo SHALL aplicarse en tres capas:
- en el front, con `auth.signupStatus`, ocultando el formulario;
- en el back, con el hook `user.create.before`, respondiendo 403 `SIGNUP_CLOSED`;
- en la base de datos, con un trigger `BEFORE INSERT` serializado con `pg_advisory_xact_lock`.

Iniciar sesión con cuentas existentes SHALL seguir funcionando.

#### Scenario: Registro cerrado en el front
- **WHEN** ya hay 20 cuentas y un visitante abre `/registro`
- **THEN** ve "Registro cerrado: se alcanzó el límite de cuentas" y no hay formulario

#### Scenario: Llamada directa a la API
- **WHEN** ya hay 20 cuentas y alguien hace POST directo a `/api/auth/sign-up/email`
- **THEN** el servidor responde 403 `SIGNUP_CLOSED` y no crea el usuario

#### Scenario: Registros simultáneos
- **WHEN** hay 19 cuentas y llegan dos registros al mismo tiempo
- **THEN** se crea exactamente uno; el otro recibe un error (idealmente 403 `SIGNUP_CLOSED`) y no se crea su usuario

#### Scenario: Cambiar el tope
- **WHEN** el operador ejecuta `UPDATE app_config SET value = '25' WHERE key = 'max_users'`
- **THEN** el registro vuelve a abrirse sin redeploy, en el front y en el back

#### Scenario: Usuarios existentes
- **WHEN** ya hay 20 cuentas y un usuario existente inicia sesión
- **THEN** entra normalmente

### Requirement: Rate limit
- Los endpoints de Better Auth SHALL tener rate limit con almacenamiento en base de datos: sign-in y sign-up 5 por minuto por IP, el resto 60 por minuto.
- Las rutas propias SHALL limitarse por ventana fija en Postgres:
  - `/api/import/chesscom/[type]/[id]`: 10 por minuto por IP;
  - `games.import`: 10 por minuto por usuario;
  - `analysis.save`: 30 por minuto por usuario;
  - `practice.submitResult`: 120 por minuto por usuario.
- Al excederse, el sistema SHALL responder 429 o `TOO_MANY_REQUESTS`, y el front SHALL mostrar "Demasiados intentos, espera un momento".

#### Scenario: Fuerza bruta de login
- **WHEN** una IP intenta iniciar sesión 6 veces en un minuto
- **THEN** el sexto intento recibe 429, aunque cada petición caiga en una instancia serverless distinta

#### Scenario: Abuso del proxy de Chess.com
- **WHEN** una IP llama 11 veces en un minuto a `/api/import/chesscom/[type]/[id]`
- **THEN** la llamada 11 recibe 429 sin consultar a Chess.com

### Requirement: Restablecer contraseña por CLI
Como no hay correo, el operador SHALL poder restablecer la contraseña de un usuario con el script `reset-password <email>`. El script SHALL fallar si el usuario no existe y SHALL invalidar sus sesiones.

#### Scenario: Usuario olvidó la contraseña
- **WHEN** el operador ejecuta `reset-password ana@x.test`
- **THEN** se imprime una contraseña temporal, las sesiones de ana se cierran y ella puede entrar con la nueva

### Requirement: Uso sin cuenta
El sistema SHALL permitir importar por PGN o link y analizar sin sesión. Guardar partidas, ver "Mis partidas" y practicar SHALL requerir sesión.

#### Scenario: Analizar sin cuenta
- **WHEN** un visitante sin sesión pega un PGN y pulsa "Analizar"
- **THEN** ve el análisis completo en `/analizar` y un botón "Guardar y crear ejercicios" que pide iniciar sesión

#### Scenario: Registro cerrado sin cuenta
- **WHEN** un visitante sin cuenta pulsa "Guardar y crear ejercicios" y el registro está cerrado
- **THEN** ve que puede iniciar sesión si ya tiene cuenta, que no se pueden crear cuentas nuevas, y el análisis sigue en pantalla

#### Scenario: Guardar tras iniciar sesión
- **WHEN** el visitante pulsa "Guardar y crear ejercicios", inicia sesión o se registra y vuelve
- **THEN** la partida y su análisis se guardan en su cuenta sin volver a analizar

### Requirement: Aislamiento de datos por usuario
Todo procedimiento que lea o modifique partidas, análisis, ejercicios o intentos SHALL verificar la sesión en el servidor y SHALL filtrar por el `user_id` de la sesión. La redirección de `middleware.ts` no cuenta como verificación.

#### Scenario: Acceso a recurso ajeno
- **WHEN** un usuario pide la partida o el ejercicio con un id que pertenece a otro usuario
- **THEN** el servidor responde NOT_FOUND y no revela que existe

#### Scenario: Sin sesión
- **WHEN** se llama un procedimiento protegido sin sesión válida
- **THEN** el servidor responde UNAUTHORIZED

