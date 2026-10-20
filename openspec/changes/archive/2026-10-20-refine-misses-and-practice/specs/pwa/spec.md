## MODIFIED Requirements

### Requirement: App instalable
La app SHALL publicar un web manifest ("Chess Puzzle Creator Pro", `display: standalone`, iconos 192, 512 y maskable) y un service worker, de modo que sea instalable en Android, escritorio e iOS desde `chess-puzzle-creator-pro.vercel.app`.

El icono maskable SHALL llevar el caballo centrado y lo más grande posible sin salir del círculo seguro (radio 40 % del lienzo; hoy ocupa 42 % de alto y llega al 27 %), con el mismo verde del SVG. Al cambiar un icono, su nombre de archivo SHALL cambiar, para que Android regenere el icono de la app instalada.

#### Scenario: Botón instalar en Android
- **WHEN** el navegador dispara `beforeinstallprompt`
- **THEN** el menú muestra "Instalar app" y al pulsarlo aparece el diálogo nativo

#### Scenario: Icono instalado
- **WHEN** el usuario instala la app en un Android con máscara redonda o de squircle
- **THEN** el caballo se ve centrado, sin recortes y con un tamaño comparable al de los iconos vecinos

#### Scenario: iOS
- **WHEN** el usuario abre el menú en Safari de iOS sin la app instalada
- **THEN** ve "Instalar app" con las instrucciones "Compartir → Agregar a pantalla de inicio"

#### Scenario: Ya instalada
- **WHEN** la app corre en modo `standalone`
- **THEN** no se muestra "Instalar app"
