# Documentación técnica — Zonas de reparto (28 y 29)

Diagrama: `Zonas.drawio` — dos páginas, secciones **28** (crear la zona) y **29** (resolver la zona de
un punto, para MS Ventas). Última revisión: **2026-08-19**, cruzado contra el contrato EL3 (§31).
Numeración según la convención del proyecto (`UltimaVersion.drawio` es la referencia). **Los retornos
no se numeran en el diagrama.**

**Secciones ocupadas, verificado el 2026-08-19** contra el texto extraído de
`Documento Tecnico v1 (8).pdf`: el doc oficial usa **1-19 y 21-25** (su §24 es *Tracking del camión* y
su §25 *Detalle*, o sea Monitoreo ya está absorbido). La **20** se deja libre a propósito — es el único
hueco del doc oficial. `planificacion/Productos.drawio` tomó **26** y **27**. De ahí que estos dos
flujos sean **28** y **29**.

---

> ## ⚠ ANTES DE IMPLEMENTAR LA 29: falta una confirmación que puede tirarla abajo
>
> **Verificado el 2026-08-19.** El contrato `EL3 · POST /logistics/orders` que publicó Ventas —el
> intake, documentado en `diagrams/ventas/DocumentacionTecnica.md` §31— devuelve **`zoneId` y `zone`
> por cada pedido**:
>
> ```json
> "zoneId": 1, "zone": "Norte"
> ```
>
> O sea que Ventas ya tiene una zona asignada al pedido ANTES de que nosotros la calculemos. Dos
> lecturas, y son incompatibles:
>
> | | Qué significa | Qué pasa con la 29 |
> |---|---|---|
> | **(a)** Ventas llama nuestra `POST /zones/resolve` al crear el pedido y guarda el resultado | Nos devuelve NUESTRO id. El ciclo cierra | **Se implementa.** Es su única fuente |
> | **(b)** Ventas mantiene su propio catálogo de zonas | Dos fuentes de verdad. El `zoneId` que nos mandan **no es FK válida** contra `zones(id)` | **No tiene sentido.** Nadie la consumiría |
>
> En el caso (b) además se rompe el intake: `dispatch_delivery_points.zone_id` tiene FK a `zones(id)`
> (`UltimaVersionUltima.sql:156`), así que un id de otro catálogo hace **fallar el `INSERT`**.
>
> Señal de alarma concreta: EL3 manda `"zone": "Norte"` y nuestra `zones.name` de ejemplo es
> `"Zona Norte"`. **No matchean por nombre.** Es débil como prueba —puede ser solo datos de ejemplo—
> pero es exactamente lo que se vería si los catálogos fueran distintos.
>
> **Esta pregunta va primero que cualquier línea de código de la 29.** Está también en el §6.1 y en el
> §9 del doc de ventas.

## 1. Por qué son dos flujos y no uno

| | Pregunta | Quién la hace | Operación |
|---|---|---|---|
| **28** | ¿Cómo entra una zona nueva al sistema? | Operador de logística, desde nuestro back-office | **Escritura** en `zones` |
| **29** | ¿Este punto cae dentro de alguna zona? | **MS Ventas**, al crear un pedido | **Lectura pura**, sin efectos |

La 28 es dato maestro: se dibuja una vez por ciudad y después la usan muchos planes. La 29 es una
consulta de altísima frecuencia — se dispara en cada creación de pedido — y **no persiste nada**.

### 1.1 El GET ya existe, no se renumera

`GET /zones` ya está documentado como paso **1.6** (`getZones()` en *Abrir módulo de planificación*,
`UltimaVersion.drawio:260,316-338`). Es el filtro del planificador. **Lo que no existía en ningún
diagrama ni documento es la escritura (`POST`/`PATCH`) ni la resolución por coordenada** — eso es lo
que agregan la 28 y la 29.

---

## 2. La tabla, columna por columna

### 2.1 `zones` — NUESTRA (`UltimaVersionUltima.sql:41-53`)

```sql
CREATE TABLE zones (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    polygon_geojson JSONB,
    city_id BIGINT NOT NULL,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
```

| Columna | Rol en estos flujos |
|---|---|
| `id` | Lo que devuelve la 29 y lo que Ventas guarda de su lado |
| `name` | Lo que devuelve la 29 para mostrar. `VARCHAR(50)`: valídalo en el DTO |
| `polygon_geojson` | La geometría. **Nullable** — ver §2.2 |
| `city_id` | Scope. **Sin FK: no existe tabla `cities`** |
| `is_active`, `deleted_at` | Filtro obligatorio de la 29: una zona apagada o borrada no resuelve |

Única FK entrante en todo el esquema: `dispatch_delivery_points.zone_id` (`:134`), que es **por plan**
y se escribe recién al planificar.

### 2.2 `polygon_geojson` es `JSONB`, no `geometry` — la consecuencia real

La base **no valida absolutamente nada** de la geometría. Un anillo abierto, un anillo de 3 posiciones
o un polígono en moño (auto-intersección) pasan el `INSERT` sin una queja y revientan recién en el
`pointInPolygon` de la 29, con un resultado silenciosamente incorrecto — no una excepción.

Por eso el paso **28.4** no es opcional ni cortesía: es la única validación que hay.

Y además: al ser `JSONB`, **no hay índice espacial**. La 29 sin índice escanea todas las zonas activas
en cada pedido. Con las cinco zonas de hoy no se nota; con doscientas, sí. Tres salidas, hay que
elegir una — ver §5.

### 2.3 `delivery_points` no existe en nuestro esquema

Verificado sobre los 25 `CREATE TABLE` de `UltimaVersionUltima.sql`: el punto de entrega es dato de
Ventas. Nosotros solo guardamos `delivery_point_id` como número, dentro de
`dispatch_delivery_points`.

**Por eso la 29 es stateless.** `deliveryPointId` viaja en el request únicamente para el log de
trazabilidad; no es clave de escritura ni de cache. No hay dónde persistir "el punto X pertenece a la
zona Y", y tampoco corresponde: cuando Ventas pregunta todavía no existe ningún plan.

---

# 28 Crear zona de reparto

## Endpoint

```http
POST /zones
```

Complementos del mismo recurso, mismo cuerpo de validación:

```http
PATCH  /zones/{zoneId}      # renombrar o redibujar
DELETE /zones/{zoneId}      # soft delete: deleted_at = now(), is_active = false
```

## Request Principal (`CreateZoneDto`) 28.1

| Campo | Tipo | Regla |
|---|---|---|
| `name` | `string` | Requerido, 1-50 caracteres (límite de la columna) |
| `cityId` | `number` | Requerido |
| `polygonGeojson` | `object` | Requerido. `{ "type": "Polygon", "coordinates": [[[lng, lat], ...]] }` |

```json
{
  "name": "Zona Norte",
  "cityId": 1,
  "polygonGeojson": {
    "type": "Polygon",
    "coordinates": [[[-63.207, -17.758], [-63.157, -17.758], [-63.157, -17.808], [-63.207, -17.808], [-63.207, -17.758]]]
  }
}
```

**El orden es `[lng, lat]`**, como manda GeoJSON y como se guarda en la columna. Leaflet trabaja en
`[lat, lng]`: esa conversión es responsabilidad del Frontend y **no cruza el endpoint**. En el mockup
la frontera está aislada en dos funciones, `latLngAPoligono` y `poligonoALatLng`
(`src/mockup/zones-store.ts:36-53`), y el resto de la pantalla nunca vuelve a tocar el orden.

## A. `validateRing(polygonGeojson)` 28.4

Cuatro checks, todos con el mismo desenlace: `422 INVALID_POLYGON`.

| Check | Por qué |
|---|---|
| `type === "Polygon"` | No aceptamos `MultiPolygon` todavía — ver §6.3 |
| Anillo **cerrado**: primera posición `==` última | Sin cierre, el ray casting pierde el último segmento |
| **≥ 4 posiciones** en el anillo exterior (3 distintas + el cierre) | Con menos no hay área |
| **Sin auto-intersección** | Un polígono en moño da "dentro" y "fuera" en la misma región |

Con PostGIS los dos últimos son `ST_IsValid(ST_GeomFromGeoJSON(...))`. Sin PostGIS hay que
implementarlos: el de auto-intersección es un chequeo de cruce por pares de segmentos.

**Sentido de giro:** RFC 7946 pide el anillo exterior antihorario. Ni el ray casting ni
`ST_Contains` dependen de eso, así que **no se valida ni se rechaza** — se normaliza al guardar, o se
deja como viene. Es una nota, no un error.

## B. `findOverlaps(polygonGeojson, zonasCiudad)` 28.5, 28.5a

Trae las zonas activas de la misma ciudad (**28.5**) y busca intersección con la nueva (**28.5a**).

**El solapamiento es AVISO, no error — y esto NO contradice que la meta sea que no haya solapes.**
Es la distinción que más fácil se colapsa, así que va explícita:

| Capa | Qué hace |
|---|---|
| **El editor** (frontend) | Lo hace **imposible por construcción**: imanta los vértices al borde de la vecina, y avisa en vivo si igual te montaste |
| **El endpoint** (28.5a) | Lo **registra** y deja pasar |

Bloquearlo en el endpoint haría imposible corregir un borde compartido: cualquier ajuste de un vértice
pasa transitoriamente por un estado solapado, y un `422` a mitad de camino dejaría la zona a medio
arreglar. Además hay que poder **guardar zonas que ya estaban mal dibujadas** mientras se las corrige;
si el `POST` las rechaza, quedan congeladas en su estado incorrecto para siempre.

Quien resuelve el solapamiento en LECTURA es la regla de la **29.5a**, no una restricción de escritura.

### 28.5b Lo que ya hace el editor (verificado el 2026-08-19)

El mockup implementa las dos mitades, y sirve como especificación de lo que se espera del frontend real:

- **Imantado** (`src/mockup/map/geo/snapping.ts`): al poner o mover un vértice se pega a los vértices y
  aristas de las zonas vecinas dentro de 12 px. Un borde compartido pasa a ser **el mismo punto** en las
  dos zonas, no dos trazos que pasan cerca. Todo el cálculo va en **píxeles de pantalla**, no en grados
  ni en metros: un radio en grados sería una elipse (un grado de longitud y uno de latitud no miden lo
  mismo) y uno en metros se volvería enorme al alejar el mapa y microscópico al acercarlo.
- **Detección** (`src/mockup/map/geo/solapamiento.ts`): `seSolapan(a, b)` responde sí/no. Avisa en vivo
  mientras se dibuja y resalta en rojo las zonas en conflicto.

**La trampa del detector, y es la parte que hay que replicar sí o sí en el backend: COMPARTIR UN BORDE
NO ES SOLAPARSE.** Con el imantado prendido, dos vecinas comparten vértices y aristas EXACTOS — es el
objetivo. Un test de intersección ingenuo diría que cada vecina se pisa con cada vecina: avisaría siempre
y no serviría para nada. Dos precauciones lo evitan:

1. Solo cuenta el **cruce propio** de dos aristas: los cuatro signos del producto cruz tienen que ser
   **estrictos**. Con `<= 0` entrarían el contacto en un extremo compartido y el solape colineal de dos
   bordes pegados, que es justo lo que produce el imán.
2. Un vértice sobre el borde de la otra zona **no prueba nada**: tiene que estar *estrictamente* adentro.
   Se descarta con una prueba de "está en el borde" (distancia a segmento ≤ `1e-9` grados ≈ 0,1 mm) antes
   de correr ray casting, que sobre el borde es inestable por definición.

Ese epsilon no necesita calibrarse: es enorme frente al error de coma flotante que deja la proyección
del imantado y ridículo frente a cualquier solape real, que se mide en metros.

Verificado compilando el módulo y corriéndolo con node: **7/7 casos**, incluidos "comparte borde exacto
→ `false`" y "vértice soldado a una arista → `false`".

**Si el backend implementa 28.5a con un test ingenuo, va a devolver un `warning` por cada zona vecina**
y el campo se vuelve ruido que nadie mira.

## C. `INSERT` 28.6

`name`, `polygon_geojson`, `city_id`, `created_by` (del token). `is_active` queda en el `DEFAULT TRUE`.

## Response Principal (28.6 → cliente)

```json
{
  "id": 6,
  "name": "Zona Norte",
  "cityId": 1,
  "polygonGeojson": { "type": "Polygon", "coordinates": [[[-63.207, -17.758], "..."]] },
  "isActive": true,
  "createdAt": "2026-08-19T14:02:11Z",
  "createdBy": "j.perez",
  "warnings": [
    { "code": "OVERLAPS_EXISTING_ZONE", "zoneId": 2, "zoneName": "Zona Centro" }
  ]
}
```

`201 Created` incluso con `warnings` cargados. Un warning no es un fallo parcial: la zona quedó
escrita y es usable.

---

# 29 Resolver la zona de un punto

## Endpoint

```http
POST /zones/resolve
```

`POST` y no `GET` a propósito: el cuerpo es una coordenada más contexto, y un `GET` con lat/lng en el
query string termina en los access logs de todos los proxies del camino. Además deja lugar al batch
del §6.1 sin cambiar el verbo.

## Request Principal (`ResolveZoneDto`) 29.1

| Campo | Tipo | Requerido | Para qué |
|---|---|---|---|
| `latitude` | `number` | ✅ | `-90 .. 90` |
| `longitude` | `number` | ✅ | `-180 .. 180` |
| `cityId` | `number` | ❌ | Si viene, acota el escaneo a esa ciudad |
| `deliveryPointId` | `number` | ❌ | **Solo trazabilidad en el log.** No se escribe (§2.3) |

```json
{ "latitude": -17.783, "longitude": -63.182, "cityId": 1, "deliveryPointId": 7 }
```

**Campos con nombre, nunca un par posicional.** GeoJSON guarda `[lng, lat]` y casi todo lo demás dice
"lat, long": el swap es EL bug clásico de este flujo, y lo peor es que no falla — devuelve la zona
equivocada, o ninguna, sin error. Un `[number, number]` en el contrato lo garantizaría; dos campos
nombrados lo hacen imposible.

## A. `validateCoordinates(latitude, longitude)` 29.3a

Rango y presencia. Fuera de rango, faltante o no numérico es **`400 INVALID_COORDINATES`**, no
`OUT_OF_ZONE`: un `-999` de longitud es un bug del llamador, y responderle "no está en ninguna zona"
lo esconde para siempre.

`(0, 0)` merece mención aparte: es una coordenada válida en el Golfo de Guinea y el valor por defecto
de medio mundo cuando el GPS no fijó. Es válida para el contrato — cae en `OUT_OF_ZONE` — pero
conviene loguearla aparte.

## B. Traer candidatas 29.4

```sql
SELECT id, name, city_id, polygon_geojson
  FROM zones
 WHERE is_active = TRUE
   AND deleted_at IS NULL
   AND polygon_geojson IS NOT NULL
   AND (:cityId IS NULL OR city_id = :cityId);
```

Los tres filtros son obligatorios y cada uno tapa un caso real:

- `is_active = FALSE` → zona apagada temporalmente. No resuelve.
- `deleted_at IS NOT NULL` → soft delete. El registro se conserva porque un plan viejo todavía apunta
  a ese `zone_id`, pero **no** debe resolver pedidos nuevos.
- `polygon_geojson IS NULL` → la columna es nullable: puede haber una zona creada sin dibujar. Sin
  este filtro, el `pointInPolygon` recibe un `null` y explota.

## C. `pointInPolygon(latitude, longitude, candidatas)` 29.5

Ray casting (par-impar) sobre el anillo exterior, en el plano de coordenadas geográficas. A esta
escala — zonas urbanas de pocos km — la distorsión de no proyectar es irrelevante.

**El borde cuenta como DENTRO.** Es una decisión, no un detalle: dos zonas que comparten un borde y
lo tratan como "fuera" dejan una línea de puntos que no pertenecen a ninguna, y un cliente en una
avenida divisoria queda sin zona. Inclusivo y determinista.

## D. `pickSmallestArea(coincidencias)` 29.5a

Se ejecuta solo cuando el punto cae en **2 o más** zonas. Y va a pasar: la 28.5a avisa el solapamiento
pero no lo impide.

**Desempate: gana la de menor área. Si empatan, el `id` más bajo.** Menor área = más específica, que
es lo que se espera de un recorte dentro de una zona grande. El `id` es el desempate final para que la
regla sea **total**: sin él, dos zonas de área idéntica devolverían una u otra según el orden en que
las traiga el `SELECT`, y el mismo punto daría respuestas distintas entre llamadas. Ventas vería un
sistema que se contradice, que es peor que un sistema con una regla discutible.

La respuesta marca `ambiguous: true` y lista `overlappingZoneIds` — así el operador puede ir a
arreglar el dibujo, en vez de que el solapamiento quede invisible para siempre.

**Este paso es la red de seguridad, no la solución.** Lo que evita el solapamiento es el imantado del
editor (§28.5b); esto existe para que un dato ya mal cargado devuelva algo determinista igual. Si el
editor hace bien su trabajo, `ambiguous` debería ser cada vez más raro — y si no baja nunca, es señal de
que el imantado no se está usando.

## Response Principal (29.5 → cliente)

Cuatro resultados, **todos `200 OK`**:

### `IN_ZONE` — el punto cae en una zona

```json
{
  "status": "IN_ZONE",
  "zone": { "id": 1, "name": "Zona Norte", "cityId": 1 },
  "ambiguous": false
}
```

### `IN_ZONE` con solapamiento (29.5a)

```json
{
  "status": "IN_ZONE",
  "zone": { "id": 3, "name": "Zona Centro", "cityId": 1 },
  "ambiguous": true,
  "overlappingZoneIds": [1, 3]
}
```

### `OUT_OF_ZONE` — hay zonas dibujadas, el punto no cae en ninguna

```json
{ "status": "OUT_OF_ZONE", "zone": null }
```

### `NO_ZONES_DEFINED` — no hay ninguna zona con geometría en el scope consultado

```json
{ "status": "NO_ZONES_DEFINED", "zone": null }
```

## Por qué `OUT_OF_ZONE` y `NO_ZONES_DEFINED` son estados distintos

Es el punto más importante del contrato y el más fácil de colapsar en un solo `zone: null`.

- **`OUT_OF_ZONE`** es una **respuesta de negocio**: dibujamos el mapa, y ese cliente quedó afuera del
  área de reparto. Ventas puede decidir bloquear el pedido, pedir autorización o marcarlo.
- **`NO_ZONES_DEFINED`** es un **hueco de configuración nuestro**: todavía no dibujamos esa ciudad.
  Ventas **no debe bloquear el pedido** por esto — el pedido es perfectamente válido y el que está
  incompleto somos nosotros.

Con un solo `null` para los dos casos, el día que se dé de alta una ciudad nueva Ventas rechaza todos
sus pedidos, y el mensaje de error apunta al cliente en vez de a nuestra configuración faltante.

## Por qué nada de esto es 404

`OUT_OF_ZONE` **no es** `404 Not Found`. La consulta se resolvió con éxito y la respuesta es
información válida. Un `404` en un cliente HTTP típico dispara reintentos, cuenta como error en las
métricas y prende alarmas: convertiríamos el resultado más normal del flujo — un cliente fuera del
área — en ruido operativo permanente.

`404` queda reservado para lo que de verdad no existe: `GET /zones/{zoneId}` con un id inválido.

---

## 3. Resumen: qué se toca por paso

| Paso | Contra qué | Operación |
|---|---|---|
| 28.4 | — | Validación en memoria |
| 28.5 | `zones` | `SELECT` de la ciudad |
| 28.5a | — | Cálculo en memoria (solapamiento) |
| 28.6 | `zones` | **`INSERT`** ← la única escritura de los dos flujos |
| 29.3a | — | Validación en memoria |
| 29.4 | `zones` | `SELECT` de candidatas activas |
| 29.5 | — | Cálculo en memoria (ray casting) |
| 29.5a | — | Cálculo en memoria (desempate) |

La **29 no escribe en ninguna tabla**. Ni cache, ni log de negocio, ni `zone_id` en ningún lado.

---

## 4. Índices

```sql
-- 29.4: el filtro de todas las consultas de resolución.
CREATE INDEX idx_zones_active_city
    ON zones (city_id)
 WHERE deleted_at IS NULL AND is_active AND polygon_geojson IS NOT NULL;
```

El índice espacial de verdad depende de la decisión del §5.

---

## 5. La decisión pendiente: dónde corre el punto-en-polígono

`polygon_geojson` es `JSONB`. Hay tres formas de resolver la 29.5 y hay que elegir **una**:

- **A — PostGIS al vuelo.** `ST_Contains(ST_GeomFromGeoJSON(polygon_geojson), ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))`.
  Cero cambios de esquema. `ST_GeomFromGeoJSON` es `IMMUTABLE`, así que hasta admite un índice
  funcional GiST. Contra: parsea el JSON en cada evaluación.
- **B — Columna generada + GiST.** Agregar `geom geometry(Polygon, 4326) GENERATED ALWAYS AS
  (ST_GeomFromGeoJSON(polygon_geojson)) STORED` y `CREATE INDEX ... USING GIST (geom)`. Es lo más
  rápido y lo que escala, y el `ST_IsValid` de la 28.4 sale gratis. Contra: cambio de esquema y
  dependencia de PostGIS.
- **C — En memoria, con cache.** Traer las zonas activas a la aplicación y hacer el ray casting ahí.
  Cero dependencia de PostGIS, y las zonas son dato maestro que cambia poquísimo, así que el cache es
  seguro. Contra: hay que invalidarlo en la 28.6 y en cada `PATCH`/`DELETE`.

**Recomendación: B si PostGIS está disponible; si no, C.** A es el punto medio que no gana nada de
B — si vas a depender de PostGIS igual, la columna generada te da además el índice y la validación.

---

## 6. Lo que hay que confirmar

### 6.1 Con Ventas

0. **¿DE DÓNDE SALE EL `zoneId` QUE NOS MANDAN EN EL3?** Va con cero porque va antes que todo lo demás:
   si Ventas tiene catálogo propio de zonas, este endpoint **no se implementa**. Ver el aviso del
   principio y el §5 de `diagrams/ventas/DocumentacionTecnica.md`.
1. **¿Una coordenada por llamada, o batch?** El alta de un pedido es un punto, así que el endpoint
   simple alcanza. Si algún día validan una cartera entera de clientes, hace falta
   `POST /zones/resolve:batch` con `points[]` — sin él, son N round-trips.
2. **¿Qué hacen con cada `status`?** Concretamente: **¿`OUT_OF_ZONE` bloquea la creación del pedido, o
   solo lo marca?** Cambia si necesitan un mensaje para el vendedor. Y hay que dejar por escrito que
   **`NO_ZONES_DEFINED` nunca bloquea**.
3. **¿Guardan el `zoneId` de su lado?** Nosotros no lo persistimos (§2.3). Si lo necesitan en el
   pedido, la columna es suya.
4. **¿Nos mandan `cityId`?** Si su modelo de cliente lo tiene, acota el escaneo. Si no, la 29.4 corre
   sin filtro de ciudad y funciona igual.

### 6.2 Huecos del esquema `zones`

1. **No hay `UNIQUE (city_id, name)`.** La 29 devuelve el **nombre**, y dos "Zona Norte" en la misma
   ciudad son indistinguibles para Ventas. Falta:
   `CREATE UNIQUE INDEX ON zones (city_id, name) WHERE deleted_at IS NULL;`
2. **`city_id` no tiene FK porque no existe tabla `cities`.** Nada impide una zona con
   `city_id = 9999`, invisible para siempre porque nadie va a filtrar por esa ciudad.
3. **Deriva `DB.puml` vs SQL:** `DB.puml:145` le pone `department_id` a `zones`; el SQL vigente
   (`UltimaVersionUltima.sql:41`) no lo tiene. Manda el SQL.

### 6.3 Alcance de la geometría

`type: "Polygon"` con un solo anillo, y nada más. Quedan afuera, a propósito:

- **`MultiPolygon`** — una zona en dos pedazos separados.
- **Anillos interiores (huecos)** — un enclave que pertenece a otra zona.

Si aparece alguno de los dos, cambian la 28.4 **y** la 29.5. Vale confirmar con logística si el
recorte real de las zonas los necesita antes de implementar.

---

## 7. Códigos HTTP

| Código | Cuándo |
|---|---|
| `200 OK` | 29: los **cuatro** `status`, incluido `OUT_OF_ZONE` |
| `201 Created` | 28: zona creada, con o sin `warnings` |
| `400 Bad Request` | 29: `INVALID_COORDINATES` — falta lat/lng, no es número, fuera de rango |
| `401 / 403` | Token ausente o sin permiso. La 28 exige rol de logística; la 29, la credencial de servicio de Ventas |
| `404 Not Found` | Solo `GET`/`PATCH`/`DELETE /zones/{zoneId}` con id inexistente. **Nunca** la 29 |
| `409 Conflict` | 28, si se adopta el `UNIQUE (city_id, name)` del §6.2 |
| `422 Unprocessable Entity` | 28: `INVALID_POLYGON` — anillo abierto, menos de 4 posiciones, auto-intersección, `type` no soportado |
| `500` | Error nuestro. La 29 **no** debe devolver 500 por una zona con geometría corrupta: se saltea, se loguea, y se sigue con el resto |

---

## 8. Referencias

- `diagrams/zonas/Zonas.drawio` — el diagrama de secuencia (páginas 28 y 29)
- `diagrams/zonas/formater.json` — payloads de ejemplo de los dos endpoints
- `diagrams/UltimaVersionUltima.sql:41-53` — DDL de `zones`; `:129-158` — `dispatch_delivery_points`
- `diagrams/DB.puml:145` — `zones` en el ERD (ojo con la deriva del §6.2.3)
- `diagrams/UltimaVersion.drawio:260,316-338` — el `getZones()` 1.6 que ya existe
- `src/mockup/zones-store.ts` — el flujo 28 del lado del mockup: `addZona`, `latLngAPoligono`, `poligonoALatLng`
- `src/mockup/zonas/ZonasWorkspaceView.tsx` — la pantalla de zonas (paso 28.1 del Frontend)
- `src/mockup/map/geo/snapping.ts` — el imantado del §28.5b
- `src/mockup/map/geo/solapamiento.ts` — la detección del §28.5b
- `diagrams/ventas/DocumentacionTecnica.md` — §31, el intake. Su §5 es el que decide si la 29 existe
