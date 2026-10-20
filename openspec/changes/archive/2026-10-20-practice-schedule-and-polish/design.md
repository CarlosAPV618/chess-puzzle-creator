## Context

`refine-misses-and-practice` y el commit `a586b14` están en producción. Este change sale de capturas del usuario del 2026-10-19 y de lo que se revisó en el código y en Neon:

- **Ejercicio de O-O** (CarlosAPV vs JihadGhaziri, ply 20):
  - `kind = miss`, `class = miss`, `ep_loss = 0.067`, `best_uci = a2a4`, `box = 2`, `attempts = 2`;
  - análisis con `classifier_version = 2` a profundidad 12.
- **Análisis en producción:** 21 en total. 12 son v3, 7 son v2 y 2 son v1.

Decisiones del usuario (2026-10-19):
- Un ejercicio fallado vuelve ya y con prioridad.
- Para dominarlo hacen falta 3 aciertos **seguidos**.
- "Compartir" es el del ejercicio, y en celular se conserva la hoja nativa de compartir.
- La franja de jugadas se hace más baja, no más angosta.
- El menú hamburguesa es solo para celular; el escritorio se queda como está.
- Se pueden modificar datos de producción si hace falta.

## Goals / Non-Goals

**Goals:**
- Que un ejercicio no se pueda "resolver" con la jugada de la partida.
- Que la práctica siga la regla del usuario: nuevos y fallados primero, al azar, 2 meses, 6 meses y retirado.
- Revisión, menú y listas cómodas en 360 px sin desplazamientos inesperados.

**Non-Goals:**
- Reanalizar en lote los 9 análisis viejos. El aviso de "Reanalizar" ya existe por partida.
- Compartir partidas completas. Solo se comparten ejercicios.
- Cambiar el motor, la profundidad o el clasificador.

## Decisions

### D1. La jugada de la partida nunca es correcta

**Causa.** Una Oportunidad perdida es una Imprecisión o un Error, con pérdida de 0.05 a 0.20 EP. `checkMove` acepta toda jugada que pierda < 0.05 a profundidad 14.

Con otra profundidad, la misma jugada puede quedar por debajo del umbral. O-O perdió 0.067 a profundidad 12, y a 14 pasó. El fallo es de la validación, no del dato: aunque se reanalice, cualquier Imprecisión cercano a 0.05 tiene el mismo riesgo.

**Regla en `judgeMove`, el único punto por donde pasan los ejercicios, "Reintentar" y "Repasar partida":**
1. Nuevo parámetro `playedUci`. Si `uci === playedUci` y `playedUci !== bestUci`, la jugada es incorrecta sin llamar al motor.
   - La excepción de `bestUci` es para la Brillante jugada, cuya respuesta es justo la jugada de la partida.
2. Nuevo parámetro `minPoints`. En `miss` sin Brillante (`brilliant_played` null), y en "Reintentar" o el repaso de una jugada `miss`, se pasa `MISS_WIN`. Una alternativa que no está en la lista aceptada es correcta solo si pierde < 0.05 EP **y** deja `EP ≥ MISS_WIN` para quien mueve.
   - Es la definición de Oportunidad perdida: la respuesta tiene que conservar la posición ganadora.
   - `checkMove` devuelve también los EP de la jugada del usuario.
3. En las listas aceptadas, la segunda línea de un `miss` solo se añade si también da `EP ≥ MISS_WIN`. Aplica a `buildExercises` y a `acceptedMoves` en la revisión.

**Orden de comprobación en `judgeMove`:**
1. `uci === bestUci` → correcta;
2. `uci === playedUci` → incorrecta;
3. está en `accepted` → correcta;
4. `strict` → incorrecta;
5. si no, motor (pérdida < 0.05 y, con `minPoints`, `EP ≥ minPoints`).

El paso 2 va antes que la lista aceptada, por si una lista vieja contuviera la jugada jugada.

**Datos existentes.** En general no se puede saber qué intentos se "resolvieron" con la jugada de la partida, porque `exercise_attempts` no guarda la jugada; la migración de D2 los trata como a todos.

El de O-O (JihadGhaziri, ply 20) sí está confirmado. Tras la migración se pone a mano en `box = 0` y `due_at = now()` (tarea 8.4), con autorización del usuario para tocar producción.

- **Alternativa descartada:** subir la profundidad de validación a la del análisis. Cuesta más en el celular y no elimina el borde de 0.05.

### D2. Repetición: racha de aciertos seguidos, en vez de cajas de Leitner

**Columna.** `exercises.box` se reutiliza como **racha de aciertos seguidos**, de 0 a 3, para no hacer una migración de esquema:

| `box` | Significado | `due_at` tras el resultado |
|---|---|---|
| 0 | nuevo o fallado | ahora |
| 1 | 1 acierto | ahora + 60 días |
| 2 | 2 aciertos seguidos | ahora + 180 días |
| 3 | dominado | ahora + 180 días (no se usa: sale de "Empezar") |

El `due_at` de un dominado no lo lee el código nuevo. Se fija lejos para que, si conviviera con código viejo (rollback o un preview), este no lo vuelva a encolar enseguida.

**Resultados.**
- Acierto = a la primera, sin pista y sin solución. Hace `box = min(3, box + 1)`.
- Cualquier otro resultado pone `box = 0`.
- **Todo resultado del dueño cuenta**: sesión, "Practicar partida" o `/practicar/<id>`. Es lo que pidió el usuario: abrirlo 3 veces seguidas y acertarlo lo retira.
- Se quitan las dos excepciones actuales: `SESSION_REPEAT_MS` y "ya intentado y aún no vence". Ya no hay repetición en la sesión (D3), y abrirlo antes de tiempo ahora sí cuenta.

**Cola de "Empezar"** (`practice.queue` sin `gameId`):
- Entran los ejercicios con `box < 3` y que cumplan `box = 0` o `due_at ≤ ahora`.
- El orden es `order by (box = 0) desc, random()`: primero los nuevos y fallados, luego los repasos vencidos, al azar dentro de cada grupo.
- La sesión sigue siendo de hasta 10.
- **Alternativa descartada:** barajar en el cliente. Habría que traer todos los ejercicios para tomar 10.

**"Practicar partida"** (`queue` con `gameId`) no cambia: todos los ejercicios de esa partida, dominados incluidos, en orden de jugada.

**Resumen.**
- "Pendientes hoy" = `box < 3 and (box = 0 or due_at ≤ now())`, el mismo filtro de la cola.
- "Dominados" = `box ≥ 3`.
- `MASTERED_BOX = 3`. La lista usa la misma constante para el trofeo.

**Reanálisis.** Sin cambios: misma respuesta conserva `box` y `due_at`; respuesta nueva pone `box = 0` y `due_at = ahora`.

**Migración `0003_streak_schedule.sql`** (solo datos, `pnpm db:generate --custom`):

```sql
with t as (
  select e.id, e.box,
    (select max(a.created_at) from exercise_attempts a where a.exercise_id = e.id) as last,
    -- aciertos limpios desde el último resultado que no lo fue
    (select count(*) from exercise_attempts a
      where a.exercise_id = e.id and a.first_try_correct and not a.used_hint and not a.viewed_solution
        and a.created_at > coalesce((select max(b.created_at) from exercise_attempts b
              where b.exercise_id = e.id
                and not (b.first_try_correct and not b.used_hint and not b.viewed_solution)), '-infinity')
    )::int as run
  from exercises e)
update exercises e set
  box = least(t.box, t.run, 3),
  due_at = case least(t.box, t.run, 3)
    when 0 then now()
    when 1 then t.last + interval '60 days'
    when 2 then t.last + interval '180 days'
    else greatest(e.due_at, t.last + interval '180 days') end
from t
where t.id = e.id;
```

**Por qué `least(box, run)`.** La caja vieja **no** siempre es una racha:
- La regla "ya intentado y aún no vence" no subía la caja con un acierto, y tampoco la bajaba con un fallo. Así que la caja podía quedar por encima de la racha real.
- La repetición dentro de la sesión podía dejar `run` por encima de la caja, con un acierto justo después de ver la respuesta.

El mínimo de los dos nunca da una racha mayor que la real. Con `box > 0` siempre hay intentos, así que `t.last` no es null.

**Datos de producción al 2026-10-19:**

| `box` | Ejercicios activos |
|---|---|
| 0 | 41 |
| 1 | 16 |
| 2 | 2 |
| ≥ 3 | 0 |

- Entre los intentados, `run` va de 0 a 4 y nunca queda por debajo de `box`. El mínimo conserva, por ejemplo, 2 ejercicios con `box = 1` y `run = 4` en 1.
- Hoy ningún ejercicio queda dominado por la migración.

**Orden de despliegue: primero el código, luego la migración, seguidos.**
- El código nuevo funciona con los datos viejos: cajas 4 y 5 cuentan como dominadas, y las cajas 1 y 2 con vencimientos cortos solo adelantan repasos.
- El código viejo con datos migrados volvería a encolar los ejercicios con `box = 3`, porque para él no están dominados.
- Los resultados guardados entre el deploy y la migración ya tienen la forma nueva, y la migración llega al mismo valor para ellos.

### D3. La sesión no repite fallados

- Se quitan el `setList((l) => [...l, ex])` de `Session`, la prop `repeat` de `ExerciseView` y la etiqueta "Repaso".
- El ejercicio fallado vuelve en la siguiente sesión, porque queda en `box = 0`.
- El resumen final dice "N de M a la primera" con M = tamaño de la sesión.

### D4. "Siguiente" en `/practicar/<id>`

**Endpoint.** `practice.next({ id, side?, gameId? })`, solo para el dueño (`protectedProcedure`). Devuelve el id que sigue al actual en el **orden de la lista**, con los mismos filtros, o null:

```sql
with o as (
  select e.id, lead(e.id) over (order by <recentOrder>) as nxt
  from exercises e join games g on g.id = e.game_id
  where <ownerFilters>)
select nxt from o where id = $id
```

**Desempate.** `recentOrder` gana `games.id` antes del ply: `coalesce(played_at, created_at) desc, created_at desc, games.id desc, ply`. "Mis partidas" usa el mismo desempate, sin el ply.
- "Guardar todas" inserta varias partidas en una sola sentencia, así que comparten `created_at`. Un PGN sin fecha tiene `played_at` null.
- Sin desempate, el orden entre esas partidas no es estable: la carga por partes (D12) puede repetir o saltar tarjetas y "Siguiente" podría ciclar.

**Filtros.** Las tarjetas de la lista enlazan a `/practicar/<id>?lado=…&partida=…` con los filtros activos. La página los lee con la misma validación que `/practicar` y los pasa a `next` y al enlace del siguiente.

**Comportamiento.**
- Tras el resultado, el dueño ve "Siguiente" si hay uno, y "Volver a la lista" si es el último o si el actual ya no está en la lista (archivado, o filtros que no lo incluyen).
- Para quien no es dueño no se llama a `next` ni se muestra el botón. Si se llamara con el id de otro, el filtro `user_id` devuelve null sin filtrar nada.

### D5. Compartir: enlace o imagen

"Compartir" abre un menú con dos opciones. Está para dueños y visitantes, como ahora.

**"Enlace":** igual que hoy. `navigator.share({ url })`; si no existe, se copia y aparece "Enlace copiado".

**"Imagen":** `src/components/share-image.ts` dibuja en un `<canvas>` de 1080 × 1200:
- el tablero orientado al bando que mueve, con colores `board-light`/`board-dark`, coordenadas y piezas cburnett de `/pieces/cburnett/*.svg`;
- debajo, solo "Juegan blancas" o "Juegan negras", en `system-ui`, para no depender de que Geist esté cargada en el canvas;
- sin nombres, evaluación, última jugada, logo ni URL ("sin más contexto").

**Piezas.** Los reyes cburnett (`wK`, `bK`) solo traen `viewBox`; las demás ya tienen `width="45" height="45"` (comprobado el 2026-10-19: repetir los atributos deja el XML inválido y `decode()` falla). Firefox no dibuja en canvas un SVG sin tamaño intrínseco. Por eso se piden con `fetch`, se les añade `width="45" height="45"` solo si faltan y se cargan desde un `blob:` del mismo origen, con `img.decode()`. Son 12 piezas y se cachean en memoria. `[POR VERIFICAR]` que el canvas no queda bloqueado en Safari y Firefox (tarea 4.3). Si `toBlob` lanza `SecurityError`, se muestra "No se pudo crear la imagen" y el enlace sigue disponible.

**Celular contra escritorio.** El usuario pidió "descargar una imagen", conservando en celular la hoja nativa:
- con `matchMedia("(pointer: coarse)")` y `navigator.canShare({ files: [png] })`: `navigator.share({ files })`, la hoja nativa con redes sociales;
- en los demás casos se descarga `ejercicio.png`. Chrome en Windows también tiene `share` con archivos, pero abriría la hoja de Windows en vez de descargar.

**Activación de usuario.** `navigator.share` exige que se llame poco después del toque. En Safari la ventana es corta, y generar el PNG puede tardar más. Por eso el PNG se genera **al abrir el menú "Compartir"**, y la opción "Imagen" lo usa ya listo; si aún no está, la opción se muestra con un spinner y deshabilitada. Si `share` falla con `NotAllowedError`, se descarga. `AbortError` se ignora en las dos opciones. `[POR VERIFICAR]` en iOS Safari (tarea 4.3).

- **Sin dependencias nuevas.** `html-to-image` y similares no hacen falta para un tablero de 64 casillas.

### D6. Menú hamburguesa solo en celular

**En `< md`:**
- Se quita el `<nav>` fijo inferior.
- El botón de la derecha del encabezado pasa a un icono `Menu` (tres barras) con `aria-label="Menú"` y `aria-expanded`.
- El panel muestra, en orden:
  1. avatar (inicial del correo) y correo; sin sesión, icono de usuario y "Sin cuenta";
  2. Importar, Mis partidas, Practicar, con la página actual marcada (`aria-current`);
  3. "Instalar app" (si aplica) e instrucciones de iOS;
  4. "Cerrar sesión", o "Iniciar sesión".
- Se cierra:
  - al tocar cualquier enlace (`onClick`), también el de la página actual, porque ahí `pathname` no cambia;
  - al cambiar `pathname`, por ejemplo con atrás;
  - con Escape, devolviendo el foco al botón;
  - al tocar fuera.

**En `≥ md`:** no cambia. Nav en el encabezado y avatar con su menú actual.

**En ambos:** se elimina el botón "Cerrar".

**Efectos colaterales:**
- `main` pasa de `pb-24` a `pb-10`.
- La barra fija ◀ ▶ de la revisión baja a `bottom-0` con `pb-[env(safe-area-inset-bottom)]`.
- El encabezado sigue `sticky`, así que el menú queda accesible al hacer scroll.
- El e2e deja de exigir el menú inferior y comprueba la hamburguesa.

### D7. Revisión

**Número de jugada y bando.** Nuevo `moveLabel(fenBefore, san)` en `chess.ts`, a partir del número de jugada y el turno del FEN: "12. b5" para blancas, "12… b5" para negras. Se usa en:
- el prompt de "Reintentar" y del repaso: "Encuentra una jugada mejor que 12. b5 (blancas)";
- `PendingPanel` y `MoveVerdict`;
- el ejercicio: "En la partida: jugaste 11. O-O".

La tarjeta de la lista de ejercicios también toma "Jugada N" del FEN. Hoy usa `floor(ply / 2) + 1`, que es incorrecto en partidas que empiezan desde un FEN con otro número de jugada.

**Gráfica.**
- Marca brillantes, grandes jugadas, imprecisiones, errores, oportunidades perdidas y errores graves.
- Solo los del color del usuario (`userColor`). Si no se conoce, por ejemplo en `/analizar` sin cuenta, marca los de los dos bandos.

**Fila bajo el tablero.**
- Orden: "Repasar partida" (o "Salir del repaso"), "Practicar partida" (solo si hay ejercicios) y Girar.
- `flex-nowrap`, separación de 6 px; los dos botones de texto con `flex-1` y Girar de 44 px.
- Con 336 px útiles a 360 px, cada botón de texto mide unos 140 px. Bajo `sm`, los iconos de los botones de texto se ocultan y se usa `text-[13px]`, para que quepa "Practicar partida" sin cortar el texto.
- "Practicar partida" lleva `text-sm` (o `text-[13px]` bajo `sm`) en el propio botón. `btn-primary` no fija tamaño de letra y hoy sale en 16 px, frente a los 14 de `btn-secondary`; por eso se veía desigual.
  - No se cambia `.btn-primary` global, para no alterar los demás botones primarios (unos 20 usos).

**Franja de jugadas en celular.** Botones `min-h-9` y contenedor con `py-0.5`: unos 40 px en vez de unos 70. En `lg` no cambia.

**Sin desplazamientos solos.**
- `MoveList` hoy llama a `scrollIntoView`, que desplaza también la ventana. Cada ◀ ▶ y cada paso automático del repaso arrastra la página hasta la lista. Se reemplaza por `ol.scrollTo` calculado sobre el propio contenedor (`left` en la franja, `top` en `lg`).
- Se quita el `scrollIntoView` de `startReview`. Su motivo, que el botón estaba en la barra fija, ya no existe desde `a586b14`.
- El veredicto ("d5 es teoría") ocupa un hueco de alto fijo, con texto de una línea truncado. En el ply 0 se reserva el hueco con "Posición inicial" para que la gráfica no salte al pasar a la jugada 1.

**Encabezado de `/partidas/<id>`.**
- Botón atrás de 36 px y título `text-sm`.
- Antes de los nombres, una etiqueta:
  - con color conocido: "Ganaste" (verde), "Perdiste" (rojo) o "Tablas" (gris);
  - sin color: "Ganan blancas", "Ganan negras" o "Tablas";
  - con `result = "*"` u otro valor, sin etiqueta.

### D8. Tarjeta de "Mis partidas"

- La tarjeta es `relative` y tiene un solo `Link` "estirado" (`after:absolute after:inset-0`) con `aria-label="Abrir X vs Y"`.
- Borrar y el selector "Yo soy" llevan `relative z-10`, para quedar encima del enlace y no anidar elementos interactivos dentro de un `<a>`.
- Se quitan los demás enlaces internos. "Analizar" pasa a ser una etiqueta visual, porque toda la tarjeta ya lleva a la partida.
- La miniatura usa `self-center`.

### D9. Prellenar usuarios al importar

**Endpoint.** `players.accounts` (protegido) devuelve `{ lichess, chesscom }`. Cada uno es `{ name, at }` o null: el nombre con el que el usuario juega **más veces** en esa fuente, con `user_color` conocido. A igualdad, gana el de la partida más reciente. `at` es la fecha de su última partida.

```sql
select distinct on (source) source, name, at
from (
  select source, max(case when user_color = 'w' then white else black end) as name,
         count(*) as n, max(coalesce(played_at, created_at)) as at
  from games
  where user_id = $1 and source in ('lichess', 'chesscom') and user_color is not null
  group by source, lower(case when user_color = 'w' then white else black end)
) s
order by source, n desc, at desc
```

**Por qué "más veces" y no "más reciente".** "Importar por usuario" marca `user_color` con el bando del usuario **buscado** (comprobado en `fetchChesscomUserGames` y `fetchLichessUserGames`). Si CarlosAPV importa partidas de `hikaru` para estudiarlas, esas partidas quedan con el color de hikaru. Con "la más reciente", el formulario prellenaría `hikaru`. El nombre más frecuente casi siempre es el propio, y el campo sigue siendo editable.

- **Sin migración.** Sale de las partidas, que ya guardan nombre con mayúsculas y fuente, y cubre lo importado por link y por usuario.
- `player_names` no sirve: no guarda la plataforma y está en minúsculas.

**Cliente.**
- Mientras el usuario no haya tocado la pestaña ni escrito nada: si hay alguna cuenta, se abre "Usuario" con la plataforma cuyo `at` es más reciente.
- El campo se rellena con el nombre de la plataforma elegida mientras el usuario no lo haya editado. Cambiar de plataforma rellena la otra con la misma condición.
- Sin sesión, no se pide nada.

### D10. Tableros sin selección de texto

- `select-none` y `[-webkit-touch-callout:none]` en `MiniBoard` y `EvalBar`, y el `touch-callout` en `Board`, que ya tiene `select-none`.
- Las `<img>` de `MiniBoard` ya son `draggable={false}`.

### D12. Carga por partes al hacer scroll, sin paginación

**Tamaños.** "Mis partidas" carga 30 por tanda y la lista de `/practicar` 28: 7 filas de 4 columnas en escritorio, 14 de 2 en celular.

**Servidor.**
- `games.list({ cursor? })` y `practice.list({ side?, gameId?, cursor? })` devuelven `{ items, nextCursor }`.
- El cursor es un offset (`z.number().int().min(0).max(100_000).nullish()`) sobre el orden con desempate de D4. tRPC lo inyecta en `useInfiniteQuery`, con `@trpc/react-query` 11 del proyecto.
- `nextCursor` es null cuando la tanda llega incompleta.
- `games.list` sigue rellenando `final_fen` null, ahora solo para las filas de la tanda.
- `practice.list` ya no devuelve `total`, `page` ni `pageSize`. El conteo total del estado vacío sale de `summary.total`, como hoy.

**Cliente.**
- `useInfiniteQuery` (tRPC `cursor` / `getNextPageParam`).
- Un sentinel al final de la lista con `IntersectionObserver` (`rootMargin: 400px`) pide la siguiente tanda.
- Botón "Cargar más" visible como respaldo: sin `IntersectionObserver`, o si la carga falla, con el error al lado.
- Los items se deduplican por `id` al unir tandas.
- Se quitan `?pagina=`, `PageLink` y la navegación de páginas. Un enlace viejo con `?pagina=` se ignora y abre la primera tanda.

**Invalidación.**
- Borrar una partida, elegir "Yo soy", importar o guardar un análisis invalidan `games.list`.
- Al terminar una sesión se invalida `practice.list`.
- React Query vuelve a pedir las tandas ya cargadas, así que un borrado no deja huecos ni duplicados.

- **Alternativa descartada: keyset.** Es más robusto ante inserciones concurrentes, pero el orden de ejercicios mezcla `desc` y `asc` (ply) y obliga a una comparación por partes. Para listas de un solo usuario, que cambian casi solo en la misma pestaña, offset + deduplicación + invalidación basta.
- **Trade-off.** Al volver desde una partida, la posición de scroll depende de que la caché siga viva. Con `?pagina=` estaba en la URL. Se acepta: la caché de React Query conserva las tandas durante la sesión.

### D11. Specs al día con `a586b14`

En las deltas se documenta lo que ya está en producción:
- sin "Lo que podía pasar";
- botones bajo el tablero, no en la barra fija;
- "Practicar partida" directo a la sesión;
- sin ejercicios duplicados por posición entre partidas.

## Risks / Trade-offs

- **[Retirar rápido]** Abrir un ejercicio 3 veces seguidas desde la lista y acertarlo lo retira, aunque en la primera se haya visto la solución en otro momento. → Es la regla pedida. Ver la solución pone la racha en 0, así que siguen haciendo falta 3 aciertos limpios después.
- **[Aleatorio en SQL]** `random()` recorre todas las filas del usuario. → Son cientos; con miles, muestrear con `tablesample` o una columna de orden aleatorio.
- **[Imagen en iOS viejo]** Sin `canShare` de archivos se descarga el PNG. En iOS < 15 la descarga abre el visor. → Aceptable.
- **[Racha migrada]** La migración puede subestimar la racha (D2). → Solo adelanta repasos; nunca retira nada de más.
- **[Menos espacio en botones]** 13 px sin iconos en 360 px. → Se comprueba en e2e que los tres botones quedan en la misma fila a 360 px.
- **[Previews contra producción]** `[POR VERIFICAR]` si los deploys de preview de Vercel usan la misma `DATABASE_URL` de Neon (tarea 8.3). Si es así:
  - practicar en un preview escribe en producción con las reglas nuevas;
  - no se practica en el preview antes del merge;
  - el `due_at` lejano de `box = 3` (D2) evita que el código viejo lo encole.

## Migration Plan

1. Archivar `refine-misses-and-practice`. Sus tareas manuales pendientes (7.x, 8.3, 10.1) pasan a la sección 9 de este change.
2. Implementar y probar en local con la base de Docker, incluida la migración `0003` sobre datos de prueba:
   - cajas 0 a 5;
   - intentos con fallos intercalados;
   - repetición en la sesión;
   - ejercicios sin intentos.
3. **Respaldo en Neon:** `create table exercises_box_backup_20261019 as select id, box, due_at from exercises`.
4. Merge y deploy del código. Justo después, `pnpm db:migrate` en Neon (0003); el orden se explica en D2. Comprobar que no queda `box > 3`. Poner en `box = 0` el ejercicio de O-O (D1).
5. Smoke test:
   - el ejercicio de O-O rechaza O-O;
   - "Empezar" da otro orden al repetirlo;
   - menú hamburguesa en celular.
6. **Rollback:** revertir el deploy **y** restaurar `box` y `due_at` desde la tabla de respaldo. Con el código viejo, los ejercicios con `box = 3` volverían a encolarse. La tabla se borra cuando el usuario confirme que todo está bien.
