## ADDED Requirements

### Requirement: Menú principal
**Escritorio (`≥ md`):** el encabezado SHALL mostrar el logo, los enlaces Importar, Mis partidas y Practicar, y el avatar de la cuenta. El avatar abre un menú con:
- el correo;
- "Instalar app" (si aplica);
- "Cerrar sesión", o "Iniciar sesión".

**Celular (`< md`):**
- No SHALL haber menú fijo inferior.
- El encabezado SHALL mostrar el logo y un botón de menú hamburguesa (tres barras, `aria-label="Menú"`).
- El panel SHALL mostrar, en este orden:
  1. el avatar y el correo del usuario, o "Sin cuenta";
  2. Importar, Mis partidas y Practicar, con la página actual marcada;
  3. "Instalar app" (si aplica);
  4. "Cerrar sesión", o "Iniciar sesión".

**Cierre:** el panel SHALL cerrarse al elegir una página (también la actual), al volver atrás, con Escape (devolviendo el foco al botón) o al tocar fuera. No SHALL haber un botón "Cerrar" dentro del menú.

**Visibilidad:** el encabezado SHALL quedarse visible al hacer scroll.

#### Scenario: Navegar en celular
- **WHEN** en 360 px el usuario toca la hamburguesa y elige "Practicar"
- **THEN** va a `/practicar` y el panel se cierra

#### Scenario: Elegir la página actual
- **WHEN** el usuario está en `/practicar`, abre la hamburguesa y toca "Practicar"
- **THEN** el panel se cierra

#### Scenario: Orden del panel
- **WHEN** un usuario con sesión abre la hamburguesa
- **THEN** ve primero su avatar y su correo, luego las tres páginas y al final "Cerrar sesión"

#### Scenario: Sin menú inferior
- **WHEN** el usuario abre cualquier página en 360 px y hace scroll
- **THEN** no hay barra de navegación fija abajo, salvo la barra ◀ ▶ de la revisión

#### Scenario: Escritorio sin cambios
- **WHEN** el usuario abre la app en 1280 px
- **THEN** ve los enlaces en el encabezado y el avatar, sin hamburguesa
