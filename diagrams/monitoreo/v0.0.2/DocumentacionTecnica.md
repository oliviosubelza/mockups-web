# Documentación Técnica — Monitoreo en tiempo real

> **v0.0.2 — 2026-07-30.** Cambio de esta versión: **se anula la tabla `trips`**. Sus columnas
> (`truck_id`, `driver_employee_id`, `name_driver_employee`, `helper_employee_id`,
> `name_helper_employee`, `status`, `departure_date`, `completed_date`) pasan a `transport_order` —que
> ya tenía `distributor_id`— y desaparece `transport_order.trip_id`: **una orden de transporte es una
> salida física, y la relación queda 1:1**. La versión anterior queda congelada en `../v0.0.1/`.
>
> **El esquema todavía NO refleja la decisión**, y conviene saberlo antes de abrir el SQL y concluir
> que este documento se equivoca: `../../UltimaVersion.sql` sigue declarando `trips` (`:206-225`),
> `transport_order.trip_id` (`:285`) con su FK `fk_transport_order_trip` (`:300`) y el bloque de
> DynamoDB con `PK TRIP#{tripId}` (`:513`, `:523`). Lo mismo vale para la implementación de referencia
> (`src/mockup/monitoreo/`), que sigue el modelo de v0.0.1. Acá se especifica el modelo nuevo, y cada
> columna de `transport_order` que hoy vive en `trips` se cita con su línea de origen para que la
> migración sea rastreable.

Especificación de endpoints, DTOs y funciones del módulo de monitoreo, en la misma convención que
`../../UltimaVersion.pdf`. La numeración continúa la de ese documento: los flujos de planificación y
despacho llegan hasta el **17**, y el monitoreo ocupa el **18** y el **19**, que son exactamente los
prefijos de paso de las páginas `M1` y `M2` de `Monitoreo.drawio`.

**Alcance del módulo.** El monitoreo es un **lector puro sobre Postgres**: no crea ni actualiza
ninguna tabla del esquema relacional, solo consulta las que la planificación y la última milla ya
escribieron (`transport_order`, `trucks`, `delivery_orders`, `delivery_incidents` y sus
hijas). **Ya no lee `trips`**: la tabla se anuló y lo que el módulo necesitaba de ella —camión,
chofer, estado y fechas de la salida— son ahora columnas de `transport_order`. Lo único que
**escribe** es la telemetría, y la escribe **solo en DynamoDB**, en la tabla
`truck_tracking` (`../../UltimaVersion.sql:497-539`). Esa asimetría es deliberada: la traza de posiciones
es append-only de alto volumen y en Postgres serían decenas de millones de filas al año con
particionado y retención obligatorios, mientras que en Dynamo el TTL lo resuelve solo.

De los cinco endpoints web del módulo (`README.md:196-211`), este documento especifica los **dos que
tienen página de secuencia numerada**: el listado (`18`) con su stream, y el ping del camión (`19`).
El detalle de la orden y su stream (`M3`) y la ejecución de la entrega (`M4`) quedan como flujos
separados.

Ver también: `README.md` (por qué estas tablas y estas claves) · `Frontend.md` (de dónde sale cada
dato de cada pantalla) · `Monitoreo.drawio` (diagramas de secuencia, páginas `M1` y `M2`) ·
`../../UltimaVersion.sql` (esquema) · implementación de referencia en `src/mockup/monitoreo/`.

---

## Convenciones

Se enuncian una sola vez acá para no repetirlas en cada endpoint.

**Envoltura de respuesta.** Toda respuesta HTTP con cuerpo viaja como
`{ "success": true, "code": 200, "data": … }`. `code` repite el status HTTP dentro del cuerpo —
redundante a propósito: los clientes que loguean solo el payload no pierden el código.

**Fechas e instantes.** ISO-8601 en **UTC con milisegundos**: `2026-07-16T08:24:39.000Z`. Aplica a
todo lo que es un instante (`trackedAt`, `receivedAt`, `departureDate`, `completedDate`). La `SK` de
la traza usa el mismo formato justamente porque en ISO-8601 UTC el orden **lexicográfico** coincide
con el **cronológico**, y eso es lo que permite que `Query` ordene la partición sin índice adicional.

**Horas del día.** `HH:mm` (`"08:00"`). Es el formato de las columnas `TIME` del esquema
(`dispatch_delivery_points.delivery_window_start/end`, `../../UltimaVersion.sql:144-145`) y de la
columna "Salida" del listado, que renderiza la hora de `transport_order.departure_date` (migrada de
`trips.departure_date`, `:215`) sin la fecha.

**Decimales y unidades.**

| Magnitud | Formato | Origen de la decisión |
|---|---|---|
| `latitude` / `longitude` | 6 decimales | Es la precisión declarada en el esquema: `distributors.latitude NUMERIC(9,6)` (`:8-9`) y `delivery_orders.arrival_latitude DECIMAL(12,6)` (`:393-394`). Seis decimales son ~11 cm; más dígitos no son señal, son ruido del GPS |
| Pesos | KG | La unidad va **en el nombre de la columna**: `transport_order.assigned_weight_kg` (`:289`), `dispatch_delivery_points.total_weight_kg` (`:146`), `trucks.capacity_weight_kg` (`:57`) |
| Volúmenes | M3 | Igual: `assigned_volume_m3` (`:290`), `total_volume_m3` (`:147`), `capacity_volume_m3` (`:58`) |
| `battery` | entero 0-100 | Porcentaje del dispositivo del chofer. Es un atributo de DynamoDB, no de Postgres |

Por eso **estos flujos no llevan campos de unidad** (`weightUnit`, `volumeUnit`) como sí los lleva la
respuesta de SAP del flujo 01: acá la unidad es parte del contrato de la columna y no un dato variable.

**Códigos HTTP que estos dos endpoints devuelven.** Solo estos:

| Código | Cuándo |
|---|---|
| `200` | `GET /monitoring/orders` con el snapshot, y `GET /monitoring/stream` al quedar la conexión abierta |
| `202` | `POST /monitoring/tracks`: el ping se aceptó y se escribieron los dos ítems. No hay recurso que devolver, así que no es un `201` |
| `400` | `distributorId` ausente o no numérico; `latitude`/`longitude` fuera de rango; `trackedAt` que no parsea como ISO-8601; `transportOrderId` ausente |
| `500` | Falla de Postgres o de DynamoDB |

`404` y `409` **no aparecen en estos dos flujos**, y conviene decir por qué para que nadie los agregue
por simetría: el listado es una **colección acotada por distribuidor**, así que una flota sin órdenes
en curso es un `200` con `data: []` y no un "no encontrado"; y el ítem ACTUAL se escribe por clave con
semántica de **overwrite**, así que pisar el valor anterior es el comportamiento esperado del segundo
ping y no un conflicto. El `404` sí corresponde al detalle (`GET /monitoring/orders/{id}`), que no es
parte de este documento.

**Paginación y filtrado.** **No hay paginación**, y es una decisión, no un olvido: la respuesta está
acotada por `distributorId`, o sea por el tamaño de la flota de una distribuidora — entre 40 y 120
filas. Paginar obligaría a que el stream SSE supiera en qué página está el cliente para decidir si
un evento le corresponde, que es complejidad pura a cambio de nada. Los filtros del listado
(`plate`, `transportStatus`) se aceptan como query params opcionales, pero la implementación de
referencia los aplica **en el cliente** sobre el estado vivo (`MonitoreoView.tsx:78-84`), y esa es la
razón: una fila que el stream acaba de pasar a `finalizado` tiene que salir del filtro "En ruta" sin
refetch. Filtrar en el servidor y parchear en el cliente son dos verdades que se desincronizan en
cuanto llega el primer evento.

**Nombres: el contrato va en inglés, la UI puede estar en español.** Los atributos de todo DTO de este
documento son camelCase en inglés, igual que el resto de la documentación técnica (`filterTrucksDto`
usa `plate`, no `placa`). El estado interno del frontend NO sigue esa regla y no tiene por qué: la
pantalla nombra sus filtros `camion` y `estadoViaje` (`MonitoreoView.tsx:34-40`) porque son variables
de UI, no el contrato. La correspondencia, para que nadie la busque dos veces:

| Estado de la UI | Atributo del DTO |
|---|---|
| `camion` | `plate` |
| `estadoViaje` | `transportStatus` |

**Placeholders en los JSON.** Cuando un ejemplo tiene que mostrar "y más elementos como este", se usa
`{ "...": "..." }` y no el `{ ... }` del PDF: los bloques de este documento son **JSON válido** y se
validan con un parser, así que el placeholder tiene que ser parseable.

---

## Servicios Externos de los Snapshots

### 01 DeliveryPoint

**Parámetro de entrada:** `deliveryPointId`, `ownerId`, `customerId`.

**Salida:**

```json
[
  {
    "deliveryPointId": 45,
    "ownerId": 4,
    "ownerName": "Cliente padre 1",
    "customerId": 78,
    "customerName": "Cliente hijo 2",
    "latitud": -17.265640,
    "longitud": 49.456400
  },
  { "...": "..." }
]
```

**Este servicio es la resolución de las coordenadas de las paradas, y el monitoreo depende de él.**
La parada planificada (`dispatch_delivery_points`, `../../UltimaVersion.sql:131-160`) guarda cliente,
ventana horaria, peso y volumen, pero **no guarda `latitude` ni `longitude`**. El puntero a la
ubicación es `dispatch_delivery_points.delivery_point_id BIGINT NOT NULL` (`:135`), comentado
*"Referencia del cliente/punto de entrega"*, y **no tiene FK declarada** — a propósito: el maestro de
puntos de entrega es **externo** a este microservicio, así que no hay tabla local a la que apuntar.
Un `grep CREATE TABLE` sobre el esquema devuelve solo `dispatch_delivery_points`,
`image_delivery_points` y `route_delivery_points`; ninguna es ese maestro.

Ni `routes.encode_polyline` (`:244`) ni `route_delivery_points` (`:258-278`) sustituyen a este
servicio, y vale tenerlo claro para no volver a proponerlo: la polilínea es la **geometría del
trayecto** —una lista de vértices **sin identidad**, que no puede decir *"este punto es la parada del
cliente X"*— y `route_delivery_points` aporta `sequence`, `estimated_distance_m` y
`estimated_travel_s`, ningún par lat/lon. Tampoco sirven
`delivery_orders.arrival_latitude/longitude` (`:393-394`) ni `proof_of_deliveries.gps_lat/lon`
(`:438-439`): esas son **dónde el chofer marcó la llegada**, un dato que existe DESPUÉS de la entrega
y solo si se hizo.

Quién lo consume: **el mapa del detalle de la orden** (`M3`), que dibuja un pin por parada. El listado
(`18`) **no** lo llama —es una tabla, no tiene mapa—, así que el servicio se declara a nivel de
módulo y no como paso de la secuencia 18. Se documenta acá porque sin él el módulo no tiene mapa, y
porque el pedido de coordenadas es por lote: una sola llamada con los `deliveryPointId` de todas las
paradas de la orden, no una por pin.

### Servicios que estos dos flujos NO consumen

Se listan para acotar el contrato:

- **Sales Order / Sales Order Item** y **Product**: los consume la pestaña *Pedido* del detalle
  (`candidate_orders` y `delivery_order_items`), no el listado ni el ping.
- **Employee**: no hace falta. El nombre del chofer está **desnormalizado** en
  `transport_order.name_driver_employee VARCHAR(50)` (migrada de `trips.name_driver_employee`,
  `:211`), así que el listado lo lee de la misma fila que ya trajo —literalmente la misma, desde que
  el viaje se anuló— y no resuelve `driver_employee_id` contra ningún servicio. El `employeeId` del
  ping es `transport_order.driver_employee_id` (migrada de `trips.driver_employee_id`, `:210`) y viaja
  como número, sin resolverse.

---

## 18 Obtener el listado de monitoreo

### Endpoint.

**Tipo:** (HTTP) GET /monitoring/orders

Obtener el estado actual de todas las órdenes de transporte despachadas de una distribuidora, con su
camión, su progreso de entregas y la última posición conocida del camión.

### Especificación de DTOs y funciones

#### Request Principal (GET /monitoring/orders)

Se requiere el id de la distribuidora, que es el único parámetro obligatorio: acota la consulta a
Postgres y **es la partición de DynamoDB** (`PK = FLEET#{distributorId}`), así que sin él no hay
Query posible. Los filtros son opcionales y son exactamente los dos que la pantalla ofrece.

**Parámetros de entrada:** `filterMonitoringDto`

**Tabla de atributos filterMonitoringDto**

| Atributo | Tipo | Oblig. | Descripción / Restricción |
|---|---|---|---|
| `distributorId` | number | Sí | ID de la distribuidora. Acota la consulta (`transport_order.distributor_id`, `../../UltimaVersion.sql:284`) y compone la PK del ítem ACTUAL (`FLEET#{distributorId}`). Los cuatro endpoints web del módulo están acotados por él |
| `plate` | string | No | Coincidencia parcial sobre la placa del camión (`trucks.plate`, `:56`). Es un `LIKE`, no una igualdad: el planificador escribe tres dígitos de la placa, no la placa entera |
| `transportStatus` | string | No | Estado de la salida física, heredado de `trips.status` (`:214`) al anularse la tabla. **No es `orderStatus`**: `transport_order.status` (`:287`) ya existe y es otra dimensión, así que el estado heredado necesita nombre propio en el DTO y columna propia en el esquema. Valores que la pantalla ofrece: `PENDING`, `EN_RUTA`, `FINALIZADO`. Ver *Huecos abiertos*: ni el nombre de la columna ni el dominio están decididos |

No hay más filtros. Un buscador por código de orden sería el natural y **no se documenta como
existente** porque el código de la orden no tiene columna (ver *Huecos abiertos*): filtrar por un
campo sin origen sería especificar un filtro que el backend no puede implementar.

> **Propuesto, no implementado.** Un filtro `senalVieja: boolean` (camiones con
> `now() - trackedAt > 15 min`) sería el más útil de la pantalla, porque es la única fila que exige
> una acción inmediata. No está en el contrato porque es un **derivado** que hoy se calcula en el
> cliente (`minutosSinSenal`, `tracking-dynamo.ts`) y moverlo al servidor obliga a filtrar DESPUÉS del
> merge con Dynamo, no en el `WHERE` de Postgres. Queda como propuesta explícita.

**Request en JSON.**

```json
{
  "distributorId": 1,
  "plate": "3456",
  "transportStatus": "EN_RUTA"
}
```

#### A. getMonitoringOrders(distributorId) 18.2 y 18.3

El Gateway Controller recibe el `GET /monitoring/orders` (18.1) y lo delega al Monitoring Controller
(18.2), que valida la estructura de los query params mediante class-validator y llama al Monitoring
Service (18.3). El Service es el único que orquesta: hace las tres consultas a Postgres, la Query a
DynamoDB y el merge, en ese orden.

- **Parámetro de entrada:** `filterMonitoringDto`.
- **Parámetro de salida:** `listMonitoringOrder` (ver 18.13).

#### B. findDispatchedOrders(distributorId) 18.4

Función responsable de traer las órdenes de transporte despachadas de la distribuidora desde la tabla
`transport_order`. Es la consulta que define **la unidad de navegación del módulo**: una fila del
listado es una orden de transporte, que desde v0.0.2 es también el camión y la salida física.

Con `trips` anulada, esta fila trae **todo lo que antes obligaba a resolver el viaje**: `truck_id`,
`driver_employee_id`, `name_driver_employee`, el estado de la salida, `departure_date` y
`completed_date`. Y el cruce con DynamoDB deja de necesitar una clave hacia otra tabla: **el id de la
orden ES la clave del merge** (paso 18.12), porque el ítem de Dynamo se escribe con ese mismo id. El
tracking se guarda por orden porque la orden es la salida física del camión, que es justamente lo que
el GPS reporta; el listado se navega por orden porque es el documento que el planificador busca. Las
dos cosas coinciden, y esa coincidencia es el cambio.

- **Parámetro de entrada:** `distributorId` (number).
- **Parámetro de salida:** `listTransportOrder` (18.5).

**Tabla de atributos de listTransportOrder**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `transportOrderId` | number | `@IsInt()` | Sí | `transport_order.id` (`:282`) |
| `distributorId` | number | `@IsInt()` | Sí | `transport_order.distributor_id` (`:284`), con FK a `distributors` (`:298`) |
| `truckId` | number \| null | `@IsInt()` `@IsOptional()` | No | `transport_order.truck_id` (migrada de `trips.truck_id`, `:208`). **Sin FK declarada**: no la tenía en `trips` y la migración no la agrega. Es con lo que 18.6 resuelve la placa |
| `routeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `transport_order.route_id` (`:286`). La ruta es del CAMIÓN, no de la orden: la FK vive de este lado, es nullable y sin UNIQUE |
| `orderStatus` | string | `@IsString()` | Sí | `transport_order.status` (`:287`). Estado del **documento** |
| `transportStatus` | string | `@IsString()` | Sí | Estado de la **salida física**, heredado de `trips.status` (`:214`). Nombre propio para no chocar con `orderStatus`; la columna destino está sin decidir (ver *Huecos abiertos*) |
| `driverEmployeeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `transport_order.driver_employee_id` (migrada de `trips.driver_employee_id`, `:210`). **Sin FK declarada**; el maestro de empleados es externo |
| `nameDriverEmployee` | string | `@IsString()` | Sí | `transport_order.name_driver_employee` (migrada de `:211`). Desnormalizado: por eso el listado no llama a ningún servicio de empleados |
| `departureDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `transport_order.departure_date` (migrada de `:215`). `null` mientras el camión no salió. La pantalla renderiza solo `HH:mm` |
| `completedDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `transport_order.completed_date` (migrada de `:216`). Junto con `departure_date` son el **único** registro del ciclo de vida de la salida: se descartó la bitácora `trip_histories` (`:544-553`), y la trazabilidad de estados del documento ya la cubre `transport_order_histories` (`:304-317`) |
| `assignedWeightKg` | number | `@IsNumber()` | Sí | `transport_order.assigned_weight_kg` (`:289`) |
| `assignedVolumeM3` | number | `@IsNumber()` | Sí | `transport_order.assigned_volume_m3` (`:290`) |

`helper_employee_id` y `name_helper_employee` (`:212-213`) también migran a `transport_order`, pero
**ningún DTO de este documento las expone**: el listado no muestra ayudante y el ping no lo reporta.

**Ejemplo JSON (filas de Postgres, paso 18.5)**

```json
[
  {
    "transportOrderId": 4471,
    "distributorId": 1,
    "truckId": 880012,
    "routeId": 512,
    "orderStatus": "DISPATCHED",
    "transportStatus": "EN_RUTA",
    "driverEmployeeId": 456,
    "nameDriverEmployee": "Carlos Mamani",
    "departureDate": "2026-07-16T08:00:00.000Z",
    "completedDate": null,
    "assignedWeightKg": 3480.50,
    "assignedVolumeM3": 14.20
  },
  { "...": "..." }
]
```

#### C. getTrucksByIds(truckIds) 18.6 y 18.6a

Función responsable de resolver **la placa**, que es lo único de la fila del listado que no vive en
`transport_order`. Se llama **una vez con el arreglo de `truckId`** que devolvió el paso 18.5, no una
vez por orden: con 40 órdenes eso serían 40 consultas para traer 40 filas de la misma tabla.

**Este paso hace una consulta menos por request que en v0.0.1**: la que leía `trips`. Antes había que
resolver el viaje entero acá —camión, chofer, hora de salida y estado— con un
`trips JOIN trucks ON trips.truck_id = trucks.id`; ahora chofer, salida y estado ya vienen en la fila
de 18.5 y lo único que falta es la placa: `SELECT id, plate FROM trucks WHERE id = ANY($1)`, una sola
tabla y sin join. El listado se sigue resolviendo con tres idas a Postgres (18.4, 18.6, 18.8): lo que
se ahorra es la lectura de la tabla que ya no existe, no un round trip.

`trucks` **no** se disuelve, y por eso este paso sobrevive: el camión es un maestro con placa,
capacidad y estado propios (`:53-61`), no un documento del despacho. En el diagrama, `18.6` y `18.6a`
—que eran dos lifelines, `Trip DB` y `Truck DB`— quedan sobre la única que sobrevive, **`Truck DB`**.
La numeración se conserva tal cual para no romper la correspondencia con `Monitoreo.drawio`.

El vínculo con `trucks` sigue **sin estar respaldado por una FK declarada**: `trips.truck_id` no la
tenía (`:206-225`, donde la única constraint es `fk_trip_distributor`, `:224`) y la columna migra a
`transport_order` sin ganarla. Es una resolución por valor, no una integridad garantizada: si el
`truck_id` apunta a un camión borrado, la fila del listado se queda sin placa y eso hay que decidirlo
en el servicio, no confiar en la base.

- **Parámetro de entrada:** `truckIds` (number[]).
- **Parámetro de salida:** `listTruck` (18.7).

**Tabla de atributos de listTruck**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `truckId` | number | `@IsInt()` | Sí | `trucks.id` (`:54`). Es la clave con la que el servicio indexa el resultado |
| `licensePlate` | string | `@IsString()` | Sí | `trucks.plate` (`:56`), `NOT NULL`. Es el **único** dato que este paso aporta al listado |

Dos columnas y nada más. Todo lo que la versión anterior traía en este paso —chofer, estado, salida—
ahora viaja en la fila de la orden, y pedirlo de nuevo acá sería traer dos veces el mismo dato.

**Ejemplo JSON (placas resueltas, paso 18.7)**

```json
[
  {
    "truckId": 880012,
    "licensePlate": "3456-ABC"
  },
  { "...": "..." }
]
```

#### D. countStatusesByOrder(orderIds) 18.8

Función responsable de calcular, **en el servidor y por agregación**, los tres contadores que la
tabla muestra: progreso, paradas e incidencias. Es un `GROUP BY` sobre `delivery_orders.status`
(`:392`) más un conteo de `delivery_incidents` (`:457-476`) de esas entregas.

Está en el servidor a propósito. Mandarle al cliente las 20 entregas de cada una de las 40 órdenes
para que recalcule un "7 de 12" son 800 objetos transportados para producir 40 números — y obligaría
al stream de flota a reenviar el detalle de cada entrega, que es justamente el evento que ese stream
**no** lleva (ver 18.16-18.19).

- **Parámetro de entrada:** `orderIds` (number[]).
- **Parámetro de salida:** `progressDto` por orden (18.9).

**Tabla de atributos de progressDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `total` | number | `@IsInt()` | Sí | `count(delivery_orders)` de la orden (`:381-406`). Es la columna "Paradas" del listado |
| `delivered` | number | `@IsInt()` | Sí | Entregas con `delivery_orders.status` de entrega cumplida (`:392`) |
| `failed` | number | `@IsInt()` | Sí | Entregas cerradas sin entregar |
| `returned` | number | `@IsInt()` | Sí | Entregas cerradas con devolución |
| `pending` | number | `@IsInt()` | Sí | **Derivado**: `total - (delivered + failed + returned)` |
| `progressPct` | number | `@IsInt()` | Sí | **Derivado**: cerradas / `total`, redondeado. `0` cuando `total = 0` |
| `incidents` | number | `@IsInt()` | Sí | `count(delivery_incidents)` de las entregas de la orden (`:459`). Es la columna "Incid." |
| `outOfWindow` | number | `@IsInt()` | Sí | **Derivado**: entregas con `delivered_at` (`:396`) fuera de `delivery_window_start/end` (`:386-387`) |

**Ejemplo JSON (contadores de una orden, paso 18.9)**

```json
{
  "total": 12,
  "delivered": 6,
  "failed": 1,
  "returned": 0,
  "pending": 5,
  "progressPct": 58,
  "incidents": 1,
  "outOfWindow": 0
}
```

#### E. query(PK=FLEET#{distributorId}) 18.10

Función responsable de traer la última posición conocida de **toda la flota** de la distribuidora
desde DynamoDB. La consulta es exactamente:

```
Query  TableName = truck_tracking
       KeyConditionExpression = "pk = :pk"
       ExpressionAttributeValues = { ":pk": "FLEET#1" }
```

**Es UNA sola Query para la flota entera, sean 40 órdenes o 120.** Ese es el motivo de que el ítem
ACTUAL tenga `PK = FLEET#{distributorId}` en vez de `ORDER#{transportOrderId}`: con la PK de la traza,
"dónde está toda la flota" serían **N Queries, una por camión**, y el listado es la pantalla que se
deja abierta todo el día. Esta PK **no cambió** con la anulación de `trips`, y no es casualidad:
`distributor_id` ya vivía en `transport_order` (`../../UltimaVersion.sql:284`, `NOT NULL`), así que no
era un dato que el viaje aportara y no hay nada que migrar. El precio de esa lectura es un segundo
write por ping (ver 19.6), y es la denormalización que Dynamo pide a cambio de que las dos preguntas
del monitor cuesten una Query cada una.

Cada ítem devuelto es una **orden en curso**: cuando la orden se cierra, su ítem ACTUAL se borra de la
partición (`borrarActual`, `use-flota-viva.ts:303`), así que la partición `FLEET#` es la flota **en
curso** y no el histórico. La traza no se toca: la borra el TTL a los 30 días.

- **Parámetro de entrada:** `distributorId` (number).
- **Parámetro de salida:** `listItemActual` (18.11).

**Tabla de atributos de listItemActual**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `pk` | string | `@IsString()` | Sí | `FLEET#{distributorId}`. Clave de partición. El prefijo es lo que permite que este tipo de ítem y la traza convivan en la misma tabla sin colisionar |
| `sk` | string | `@IsString()` | Sí | `ORDER#{transportOrderId}`. Clave de ordenamiento. Es la **orden dentro de la flota**; el id se recupera des-componiendo el prefijo |
| `latitude` | number | `@IsLatitude()` | Sí | Grados decimales, 6 decimales |
| `longitude` | number | `@IsLongitude()` | Sí | Grados decimales, 6 decimales |
| `battery` | number | `@IsInt()` | Sí | Batería del dispositivo del chofer, 0-100. Explica la mayoría de los cortes de señal, y por eso viaja EN el ping |
| `trackedAt` | string | `@IsISO8601()` | Sí | Reloj del **DISPOSITIVO**: cuándo el GPS fijó la posición. Acá es atributo porque la `sk` la ocupa la orden |
| `receivedAt` | string | `@IsISO8601()` | Sí | Reloj del **SERVIDOR**: cuándo llegó el paquete. Siempre `>= trackedAt` |

`trackedAt` es atributo en este tipo de ítem y **parte de la clave** en la traza (`SK = TS#{trackedAt}`).
Es el mismo dato con otro lugar de residencia, y es la razón de que las dos formas no sean
intercambiables.

**Ejemplo JSON (ítems ACTUAL de la flota, paso 18.11)**

```json
[
  {
    "pk": "FLEET#1",
    "sk": "ORDER#4471",
    "latitude": -17.783412,
    "longitude": -63.181245,
    "battery": 74,
    "trackedAt": "2026-07-16T08:24:39.000Z",
    "receivedAt": "2026-07-16T08:24:40.180Z"
  },
  { "...": "..." }
]
```

#### F. mergeTrackingByOrderId(orders, items) 18.12

Función responsable de cruzar las filas de Postgres con los ítems de DynamoDB. **El cruce ya no
necesita una clave foránea**: se hace sobre el id que la fila **ya trae**. Hasta v0.0.1 había que
arrastrar `transport_order.trip_id` hasta acá solo para poder emparejar; ahora el ítem de Dynamo se
escribe con el `transportOrderId` (`sk = ORDER#{transportOrderId}`), que es el mismo id con el que la
orden salió de 18.5, así que el merge cruza la fila consigo misma. Se hace con un índice
`Map<transportOrderId, ItemActual>` y un solo recorrido, no buscando en el arreglo por cada orden — es
la misma razón por la que el ítem ACTUAL existe: una Query, un recorrido, y no N búsquedas.

Las claves de Dynamo **no se exponen** en la respuesta: el DTO lleva `transportOrderId` ya resuelto.
`pk` y `sk` son la forma de almacenamiento, y filtrarlas acá evita que el frontend aprenda a parsear
prefijos.

Una orden **sin ítem** devuelve `tracking: null`, y es un caso normal, no un error: el camión todavía
no salió, o ya terminó y su ítem salió de la partición.

- **Parámetro de entrada:** `listTransportOrder`, `listTruck`, `progressDto[]`, `listItemActual`.
- **Parámetro de salida:** `MonitoringOrderDto[]` (18.13, que el Controller devuelve tal cual en 18.14 y 18.15).

**Tabla de atributos de MonitoringOrderDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `transportOrderId` | number | `@IsInt()` | Sí | `transport_order.id` (`:282`). Es el id con el que el cliente **parchea por id** al recibir un evento |
| `code` | string | `@IsString()` | Sí | Código visible de la orden — primera columna del listado. **SIN ORIGEN EN EL ESQUEMA**: `transport_order` (`:281-302`) no tiene columna de código/número. Ver *Huecos abiertos* |
| `routeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `transport_order.route_id` (`:286`) |
| `orderStatus` | string | `@IsString()` | Sí | `transport_order.status` (`:287`) |
| `licensePlate` | string | `@IsString()` | Sí | `trucks.plate` (`:56`) vía `transport_order.truck_id` (migrada de `trips.truck_id`, `:208`), resuelta en 18.6. Columna "Camión" |
| `driverName` | string | `@IsString()` | Sí | `transport_order.name_driver_employee` (migrada de `:211`). Columna "Chofer" |
| `transportStatus` | string | `@IsString()` | Sí | Estado de la salida física, heredado de `trips.status` (`:214`). Columna "Viaje" — la pantalla mantiene esa etiqueta, que es UI y no contrato |
| `departureDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `transport_order.departure_date` (migrada de `:215`). Columna "Salida", renderizada como `HH:mm` |
| `progress` | progressDto | `@ValidateNested()` `@Type(() => progressDto)` | Sí | Contadores del paso 18.8. Ver Sub-DTO |
| `tracking` | trackingSnapshotDto \| null | `@ValidateNested()` `@IsOptional()` `@Type(() => trackingSnapshotDto)` | No | Ítem ACTUAL del paso 18.11, ya cruzado. `null` si el camión no salió o ya terminó. Ver Sub-DTO |

**Se eliminó la fila `tripId`**, y no es un rename: su única función era ser la **clave del merge** con
Dynamo (18.12), y ese papel lo cumple ahora `transportOrderId`, que el DTO ya llevaba en la primera
fila. Renombrarla sería exponer dos veces el mismo id; dejarla como estaba sería publicar un puntero a
una tabla que no existe. `truckId` tampoco ocupa su lugar: el listado muestra la placa, no el id del
camión.

**`tripStatus` pasa a llamarse `transportStatus`**, y el rename no es cosmético:
`transport_order.status` (`:287`) **ya existe** y viaja en este mismo DTO como `orderStatus` —el estado
del **documento**: `DISPATCHED` y compañía—, mientras que el estado heredado de `trips.status`
(`:214`) es otra dimensión: `PENDING` / `EN_RUTA` / `FINALIZADO`, dónde está el camión. Al fusionarse
las dos tablas, los dos estados quedan en la misma fila, así que necesitan dos nombres o uno pisa al
otro. **Qué nombre lleva la columna en el esquema es una decisión abierta** (`transport_status`,
`dispatch_status`): ver *Huecos abiertos*.

**Sub-DTO: progressDto**

Es el mismo DTO del paso 18.9; se anida sin cambios. La tabla de atributos está en **D.
countStatusesByOrder(orderIds) 18.8**.

**Sub-DTO: trackingSnapshotDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `transportOrderId` | number | `@IsInt()` | Sí | Resuelto desde `sk` (`ORDER#{transportOrderId}`). Reemplaza a `pk`/`sk`, que no se exponen |
| `latitude` | number | `@IsLatitude()` | Sí | DynamoDB `truck_tracking.latitude` |
| `longitude` | number | `@IsLongitude()` | Sí | DynamoDB `truck_tracking.longitude` |
| `battery` | number | `@IsInt()` | Sí | DynamoDB `truck_tracking.battery`, 0-100 |
| `trackedAt` | string | `@IsISO8601()` | Sí | DynamoDB `truck_tracking.trackedAt`. **Se devuelve crudo**: la columna "Última señal" es un derivado (`now() - trackedAt`) que el cliente calcula, así el número envejece solo |
| `receivedAt` | string | `@IsISO8601()` | Sí | DynamoDB `truck_tracking.receivedAt`. Se expone para poder distinguir *"el GPS no fija"* de *"el celular buferea sin cobertura"* |

El `transportOrderId` del sub-DTO **repite** el de la fila que lo contiene, y es deliberado: este mismo
objeto viaja solo como payload del evento `tracking` (19.9), donde es la única clave que el cliente
tiene para saber qué fila parchear.

**Ejemplo JSON (Response)**

```json
{
  "success": true,
  "code": 200,
  "data": [
    {
      "transportOrderId": 4471,
      "code": "OT-2026-004471",
      "routeId": 512,
      "orderStatus": "DISPATCHED",
      "transportStatus": "EN_RUTA",
      "licensePlate": "3456-ABC",
      "driverName": "Carlos Mamani",
      "departureDate": "2026-07-16T08:00:00.000Z",
      "progress": {
        "total": 12,
        "delivered": 6,
        "failed": 1,
        "returned": 0,
        "pending": 5,
        "progressPct": 58,
        "incidents": 1,
        "outOfWindow": 0
      },
      "tracking": {
        "transportOrderId": 4471,
        "latitude": -17.783412,
        "longitude": -63.181245,
        "battery": 74,
        "trackedAt": "2026-07-16T08:24:39.000Z",
        "receivedAt": "2026-07-16T08:24:40.180Z"
      }
    },
    {
      "transportOrderId": 4472,
      "code": "OT-2026-004472",
      "routeId": 515,
      "orderStatus": "DISPATCHED",
      "transportStatus": "PENDING",
      "licensePlate": "7788-XYZ",
      "driverName": "J. Rojas",
      "departureDate": null,
      "progress": {
        "total": 9,
        "delivered": 0,
        "failed": 0,
        "returned": 0,
        "pending": 9,
        "progressPct": 0,
        "incidents": 0,
        "outOfWindow": 0
      },
      "tracking": null
    },
    { "...": "..." }
  ]
}
```

---

## 18.16-18.19 Suscripción al stream (SSE)

### Endpoint.

**Tipo:** (HTTP) GET /monitoring/stream?distributorId={id}

Mantener el listado actualizado enviando **solo lo que cambió**, sin reenviar nunca la flota entera.

El patrón es **snapshot + deltas**: el `GET /monitoring/orders` se hace **una vez** al abrir la
pantalla (18.1-18.15) y este stream entrega los cambios (18.16-18.19). Es **una sola conexión con
scope de FLOTA, no 40 conexiones por camión**: el stream transporta los eventos de todos los camiones
de la distribuidora y el cliente parchea por id.

Se eligió **SSE y no WebSockets** porque el monitor solo lee: WS es bidireccional y no aporta nada
acá, mientras que SSE trae reconexión automática y `Last-Event-ID` nativos del navegador — justo la
parte cara de implementar sobre WS. Requiere **HTTP/2**: sobre HTTP/1.1 el navegador limita a 6
conexiones por dominio y una pantalla abierta se quedaría con una de esas seis.

Pasos de la secuencia: `get /monitoring/stream?distributorId={id}` (18.16) →
`openStream(distributorId)` (18.17) → `subscribe(FLEET#{distributorId})` (18.18) → conexión SSE
abierta (18.19).

### Formato de cable

Cabeceras de la respuesta: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, `X-Accel-Buffering: no` (esta última para que el proxy no acumule el cuerpo
y anule el punto del stream).

Cada evento son líneas `id:`, `event:`, `data:` y **una línea en blanco que lo termina**. `data:` lleva
el payload en JSON en una sola línea:

```
id: 1784197479000-4471
event: tracking
data: {"transportOrderId":4471,"latitude":-17.783412,"longitude":-63.181245,"battery":74,"trackedAt":"2026-07-16T08:24:39.000Z","receivedAt":"2026-07-16T08:24:40.180Z"}

id: 1784197481500-4471
event: order_progress
data: {"transportOrderId":4471,"total":12,"delivered":7,"failed":1,"returned":0,"pending":4,"progressPct":66,"incidents":1,"outOfWindow":0}

: heartbeat

```

La línea que empieza con `:` es un **comentario** del protocolo: el cliente la descarta y su única
función es que la conexión no quede ociosa. Se manda cada ~15 s porque una flota puede pasar minutos
sin novedades y los intermediarios cierran conexiones sin tráfico; sin el heartbeat, el cliente
reconectaría en loop justo cuando no pasa nada.

### Eventos de este stream

| Evento | Cadencia | Payload | Por qué |
|---|---|---|---|
| `tracking` | **Agrupado ~30 s** | `trackingSnapshotDto` | En la tabla un ping solo cambia "Última señal": un texto que pasa de "hace 0 min" a "hace 0 min". Con 40 camiones reportando cada 10-15 s son ~3,3 eventos/s y la tabla parpadearía para no decir nada nuevo. Los ~30 s son la **ventana de agrupación del servidor**, no un intervalo de polling del cliente |
| `order_progress` | Al instante | `progressDto` + `transportOrderId` | Un cambio de ESTADO es información nueva: que una entrega falle, el planificador lo tiene que ver cuando pasa. Los estados **no se agrupan nunca** |
| `transport_status` | Al instante | `transportOrderId`, `transportStatus`, `completedDate` | Ídem: el camión salió o terminó. El evento se llamaba `trip_status` y lleva el nombre del atributo que transporta |

Al vaciarse la ventana se emite **un evento `tracking` por camión** que reportó, con su **última**
posición de la ventana — no la ráfaga de pings intermedios. Los intermedios no se pierden: quedaron en
la TRAZA, que existe justamente para eso. Y son N eventos en vez de uno con un arreglo porque así el
cliente tiene **un solo camino de parcheo por id**, el mismo que usan `order_progress` y
`transport_status`; un payload con arreglo obligaría a un segundo parser a cambio de nada, ya que los
eventos salen en el mismo flush.

**Este stream NO lleva `delivery_started` ni `delivery_closed`.** Esos son del stream del detalle
(`GET /monitoring/orders/{transportOrderId}/stream`), y los dos vocabularios de **evento** siguen
siendo distintos a propósito: el listado no muestra paradas, muestra el CONTADOR de la orden, y
`order_progress` manda ese contador ya resuelto — es el mismo hecho, agregado al nivel que la pantalla
usa. Mantener las 20 entregas de cada una de las 40 órdenes solo para recalcular un "7 de 12" sería
trabajo de cliente para un dato que el servidor ya tiene.

**Lo que sí se unificó en v0.0.2 es la identidad.** Hasta v0.0.1 los dos streams se identificaban con
claves distintas —el listado parcheaba por `transportOrderId` y el del detalle por `tripId`— y esa
diferencia estaba documentada como deliberada, porque eran dos entidades distintas. Al anularse
`trips` dejaron de serlo: **las dos puntas parchean por `transportOrderId`**, que es también la `sk`
del ítem ACTUAL y la `pk` de la traza. El cliente ya no tiene que traducir entre dos ids para saber
qué fila mover.

**Ejemplo JSON (payload de `tracking`)**

```json
{
  "transportOrderId": 4471,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
```

**Ejemplo JSON (payload de `order_progress`)**

```json
{
  "transportOrderId": 4471,
  "total": 12,
  "delivered": 7,
  "failed": 1,
  "returned": 0,
  "pending": 4,
  "progressPct": 66,
  "incidents": 1,
  "outOfWindow": 0
}
```

**Ejemplo JSON (payload de `transport_status`)**

```json
{
  "transportOrderId": 4471,
  "transportStatus": "FINALIZADO",
  "completedDate": "2026-07-16T15:42:10.000Z"
}
```

Cuando `transport_status` llega con la salida terminada, el cliente además tiene que poner
`tracking: null` en esa fila: el ítem ACTUAL salió de la partición `FLEET#{distributorId}` porque ya no
hay nada activo que listar (18.10), así que seguir mostrando la última posición sería mostrar un
camión que ya volvió al depósito.

### Reconexión

`EventSource` reconecta solo, pero durante el corte se pierden eventos. La regla es:
**al reconectar se re-pide el snapshot** (`GET /monitoring/orders`), no se reproduce el historial.

`Last-Event-ID` se **ignora deliberadamente**, aunque el navegador lo mande en la cabecera. Tres
razones:

1. Un monitor necesita el estado **de AHORA**, no el historial de lo que pasó mientras nadie miraba.
2. Reproducir cuatro minutos de eventos `tracking` agrupados animaría el pasado y después saltaría al
   presente — peor que no mostrar nada.
3. Re-pedir el snapshot cuesta tres consultas a Postgres y **una** Query a Dynamo: exactamente lo
   mismo que abrir la pantalla. No hay ahorro que justifique mantener un buffer de replay por
   conexión en el servidor.

El campo `id:` se sigue emitiendo porque sirve para correlacionar logs entre servidor y cliente. El
"parcheo por id" del cliente, en cambio, es por el `transportOrderId` del **payload** —uno solo desde
v0.0.2—, no por el id del evento SSE: son dos cosas distintas que comparten la palabra.

---

## 19 Tracking del camión

### Endpoint.

**Tipo:** (HTTP) POST /monitoring/tracks

Registrar un ping de posición del camión. Lo escribe la **app del chofer**, automáticamente y sin
acción del usuario.

Cadencia: cada **10-15 s en movimiento**, solo si el camión se desplazó más de ~50 m, y el ping se
corta cuando está detenido. Es lo que evita quemar la batería del chofer. **La frecuencia del ping no
la define el transporte**: ningún protocolo hace que el dato sea más fresco que el reporte del
celular, y la fluidez del mapa se resuelve **interpolando en el cliente**, no pidiendo más seguido.

### Especificación de DTOs y funciones

#### Request Principal (POST /monitoring/tracks)

Se requiere la orden de transporte, la distribuidora, la posición, quién reportó y el instante en que
el GPS fijó la posición. La batería es el único campo opcional: un dispositivo puede no exponerla y eso no invalida
la posición.

**Parámetros de entrada:** `trackDto`

**Tabla de atributos trackDto**

| Atributo | Tipo | Oblig. | Descripción / Restricción |
|---|---|---|---|
| `transportOrderId` | number | Sí | `transport_order.id` (`../../UltimaVersion.sql:282`). Es la **salida física** y compone la PK de la TRAZA. Hasta v0.0.1 acá viajaba `tripId` con el argumento de que *"el GPS está en el camión, no en el papel"*; anulada la tabla `trips`, el papel y el camión son la misma fila, así que el id de la orden **es** el id de la salida que el GPS está reportando |
| `distributorId` | number | Sí | `transport_order.distributor_id` (`:284`, `NOT NULL`). Compone la PK del ítem ACTUAL (`FLEET#{distributorId}`). Sin él el ping no se puede escribir. Ya estaba en `transport_order`: no es un dato que la migración mueva |
| `latitude` | number | Sí | Grados decimales, 6 decimales. Rango `-90..90` |
| `longitude` | number | Sí | Grados decimales, 6 decimales. Rango `-180..180` |
| `employeeId` | number | Sí | `transport_order.driver_employee_id` (migrada de `trips.driver_employee_id`, `:210`). **Quién** reportó: es el dato de auditoría del ping |
| `trackedAt` | string | Sí | ISO-8601 UTC. Reloj del **DISPOSITIVO**. El servidor no lo toca |
| `battery` | number | No | Entero 0-100. Batería del dispositivo del chofer |

Del payload se **descartaron a propósito** cuatro campos (`../../UltimaVersion.sql:535-539`), y decirlo
evita que vuelvan a proponerse: `heading` (el ícono se orienta con la dirección del segmento de la
polilínea), `accuracy` (solo serviría para validar el rango del botón "Iniciar entrega", fuera de
alcance), `speed` (derivable de dos puntos consecutivos de la traza, que ahora existe) y
`currentDeliveryOrderId` (derivado: primera entrega no cerrada por `route_delivery_points.sequence`).

**Request en JSON.**

```json
{
  "transportOrderId": 4471,
  "distributorId": 1,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "employeeId": 456,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "battery": 74
}
```

#### A. saveTrack(trackDto) 19.2 y 19.3

El Gateway Controller recibe el `POST /monitoring/tracks` (19.1) y lo delega al Tracking Controller
(19.2), que valida el payload con class-validator y llama al Tracking Service (19.3). El Service es
el que estampa `receivedAt`, escribe los dos ítems y publica el evento.

- **Parámetro de entrada:** `trackDto`.
- **Parámetro de salida:** confirmación `202` (ver *Response Principal*).

#### B. stampReceivedAt(track) 19.4

Función responsable de estampar el reloj del **servidor** sobre el ping: `receivedAt = now()`.

**Por qué existen los dos timestamps.** `trackedAt` lo pone el **celular**, cuando el GPS fija la
posición; `receivedAt` lo pone el **servidor**, cuando llega el paquete. Un celular en zona muerta
buferea y sube tarde, y ahí los dos valores se separan minutos. Con un solo reloj se pierde la mitad
del diagnóstico: **no hay forma de distinguir "no se movió" de "no reportó"**. Si solo se guardara
`trackedAt`, un camión detenido y un camión sin cobertura se ven idénticos; si solo se guardara
`receivedAt`, un lote de pings subido al salir del túnel aparecería todo junto en el instante de la
subida y el recorrido quedaría deformado.

Hay una segunda razón, de auditoría: **`trackedAt` no sirve como evidencia**, porque el reloj del
equipo es alterable por el usuario. Para eso está `receivedAt`.

Invariante que el servicio garantiza: `receivedAt >= trackedAt`. Un ping cuyo `trackedAt` viniera del
futuro respecto del reloj del servidor es un reloj desfasado en el equipo, no un dato válido.

- **Parámetro de entrada:** `trackDto`.
- **Parámetro de salida:** `trackDto` + `receivedAt` (string ISO-8601).

**Ejemplo JSON (ping ya estampado)**

```json
{
  "transportOrderId": 4471,
  "distributorId": 1,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "employeeId": 456,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z",
  "battery": 74
}
```

#### C. putItem(TRAZA) 19.5

Función responsable de escribir el ítem **A) TRAZA** en `truck_tracking`. Es **append**: un ítem por
ping, nunca se pisa. Responde la pregunta *"¿por dónde anduvo ESTA salida?"*.

Composición de la clave y consultas que habilita:

```
PK  ORDER#{transportOrderId}
SK  TS#{trackedAt}

· última posición de la orden  ->  Query PK, ScanIndexForward=false, Limit=1
· recorrido entre dos horas    ->  Query PK, SK BETWEEN 'TS#t1' AND 'TS#t2'
```

La partición es la **salida** y no el camión, y ese argumento sobrevive intacto al cambio de modelo:
un camión hace 2-3 salidas por día, así que con `TRUCK#{truckId}` la traza de la mañana y la de la
tarde caerían en la misma partición y se perdería *"el recorrido de ESTA salida"*. Lo que cambia es
**cómo se nombra la salida**: hasta v0.0.1 era el viaje (`TRIP#{tripId}`) y ahora es la orden
(`ORDER#{transportOrderId}`), porque la orden **es** la salida.

El motivo por el que v0.0.1 rechazaba `ORDER#{transportOrderId}` —*"si una carga lleva dos órdenes,
cada ping escribiría dos ítems con las mismas coordenadas"*— **ya no aplica**: con la relación 1:1 no
hay dos órdenes compartiendo camión, así que un ping físico es un ítem.

Conviene decirlo también al revés, porque es la parte frágil de esta clave: **`ORDER#` es correcto
SOLO porque el modelo es 1:1**. Es un supuesto que sostiene la partición, no un detalle de nombres. Si
alguna vez dos órdenes vuelven a viajar en el mismo camión, esta clave reintroduce exactamente el
defecto que el diseño anterior rechazaba —N ítems con las mismas coordenadas por cada ping, N pines
superpuestos en el mapa y N trazas duplicadas de un solo recorrido, que divergen en cuanto una de las
N escrituras falle— y habría que volver a tener una entidad de salida separada de la orden. Queda
anotado en *Huecos abiertos* (9).

`trackedAt` **no se duplica como atributo**: viaja dentro de la `sk`, que es lo que ordena la traza por
tiempo dentro de la partición. Tenerlo también como atributo sería el mismo dato en dos lugares del
mismo ítem, con la posibilidad de que discrepen.

**Tabla DTO:** TruckTrackingItem (A — TRAZA)

| Atributo | Tipo | Oblig. | Descripción / Mapeo |
|---|---|---|---|
| `pk` | string | Sí | `ORDER#{transportOrderId}` ← `trackDto.transportOrderId` |
| `sk` | string | Sí | `TS#{trackedAt}` ← `trackDto.trackedAt`. ISO-8601 UTC: el orden lexicográfico es el cronológico |
| `latitude` | number | Sí | ← `trackDto.latitude` |
| `longitude` | number | Sí | ← `trackDto.longitude` |
| `battery` | number | No | ← `trackDto.battery` |
| `employeeId` | number | Sí | ← `trackDto.employeeId` (`transport_order.driver_employee_id`, migrada de `:210`). Solo está en la TRAZA: es el dato de auditoría del ping, y el ACTUAL no lo necesita porque el listado ya trae el chofer en la fila de la orden |
| `receivedAt` | string | Sí | ← paso 19.4 |
| `expiresAt` | number | Sí | **Atributo de TTL**: epoch en SEGUNDOS (el formato que Dynamo exige) = `trackedAt + 30 días`. Nadie lo lee ni lo borra a mano: se declara una vez como atributo de TTL de la tabla y Dynamo resuelve el vencimiento en background. Está en el ítem solo para que el ping nazca con su fecha de muerte |

**Ejemplo JSON (ítem TRAZA escrito)**

```json
{
  "pk": "ORDER#4471",
  "sk": "TS#2026-07-16T08:24:39.000Z",
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "employeeId": 456,
  "receivedAt": "2026-07-16T08:24:40.180Z",
  "expiresAt": 1786782279
}
```

#### D. putItem(ACTUAL) 19.6

Función responsable de escribir el ítem **B) ACTUAL**. Es **overwrite**: un ítem por orden en curso, y
cada ping pisa el anterior. Existe **solo** para que la flota entera de una distribuidora salga en
**una** Query (paso 18.10); con la PK de la traza harían falta N consultas, una por camión.

```
PK  FLEET#{distributorId}     (sin cambios)
SK  ORDER#{transportOrderId}
```

**La PK sobrevive a la anulación de `trips` y vale explicar por qué**, porque es la única clave del
módulo que no se tocó: `distributor_id` **ya vivía en `transport_order`**
(`../../UltimaVersion.sql:284`, `NOT NULL`), no era un dato que el viaje aportara, así que la
partición de la flota no depende de la tabla que se disuelve. Lo único que cambia es la `SK`, que pasa
de `TRIP#{tripId}` a `ORDER#{transportOrderId}`.

El overwrite es la semántica correcta y no una pérdida de información: lo que se pisa está guardado en
la TRAZA, que es append. Este ítem es una **proyección de última posición**, no un registro histórico
— por eso tampoco lleva TTL: el ítem se borra explícitamente cuando la orden se cierra y sale de la
flota en curso.

**Tabla DTO:** TruckTrackingItem (B — ACTUAL)

| Atributo | Tipo | Oblig. | Descripción / Mapeo |
|---|---|---|---|
| `pk` | string | Sí | `FLEET#{distributorId}` ← `trackDto.distributorId` |
| `sk` | string | Sí | `ORDER#{transportOrderId}` ← `trackDto.transportOrderId`. La partición es la flota, así que la orden es la clave de ordenamiento |
| `latitude` | number | Sí | ← `trackDto.latitude` |
| `longitude` | number | Sí | ← `trackDto.longitude` |
| `battery` | number | No | ← `trackDto.battery`. Está en los **dos** tipos de ítem porque cada ping escribe los dos |
| `trackedAt` | string | Sí | ← `trackDto.trackedAt`. Acá **sí** es atributo, porque la `sk` la ocupa la orden |
| `receivedAt` | string | Sí | ← paso 19.4 |

Sin `employeeId` y sin `expiresAt`, y las dos ausencias son deliberadas: la auditoría de quién reportó
vive en la traza, y el ciclo de vida de este ítem lo gobierna el cierre de la orden, no un
vencimiento.

**Ejemplo JSON (ítem ACTUAL escrito)**

```json
{
  "pk": "FLEET#1",
  "sk": "ORDER#4471",
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
```

**Volumen de escritura, sin maquillaje.** Son **dos ítems por ping**. Con ~40 camiones × 1 ping cada
12 s × 8 h de jornada: **≈ 96.000 pings/día ≈ 192.000 escrituras/día**. Es el precio explícito de que
las dos preguntas del monitor —una orden / toda la flota— cuesten **una Query cada una** en vez de N.
Si el número se vuelve un problema, la palanca no es dejar de escribir el ACTUAL (eso devuelve las N
consultas del listado, que es la pantalla que está abierta todo el día): es bajar la cadencia del ping
o escribir el ACTUAL cada k pings, aceptando que la "última posición" del listado atrase k×12 s.

#### E. publish(tracking, transportOrderId) 19.7

Función responsable de publicar el evento `tracking` en el bus SSE en memoria, con scope de orden.

**Si no hay conexiones abiertas para esa orden, no se publica nada** — y la escritura en Dynamo ocurre
igual. Ese orden importa: la persistencia no depende de que alguien esté mirando. Un bus que fuera
también el que persiste convertiría "nadie tiene la pantalla abierta" en "se perdió el recorrido".

- **Parámetro de entrada:** `transportOrderId` (number), `trackingSnapshotDto`.
- **Parámetro de salida:** ninguno (fire-and-forget hacia los suscriptores).

#### F. Lógica de fanout del evento tracking (event: tracking 19.8 y event: tracking 19.9)

El mismo write se entrega a **dos streams con granularidades distintas**. No son dos eventos
distintos: es un evento con dos cadencias de entrega.

1. **Stream del DETALLE (`event: tracking` 19.8)**:
   `GET /monitoring/orders/{transportOrderId}/stream`. Entrega **ping por ping**, sin agrupar. Acá
   cada posición mueve el pin, que es lo único que la pantalla hace.
2. **Stream de FLOTA / listado (`event: tracking` 19.9)**:
   `GET /monitoring/stream?distributorId={id}`. Entrega **agrupado ~30 s**, con la última posición de
   cada camión de la ventana. En la tabla un ping solo mueve "Última señal", así que reenviar ~3,3
   eventos/s la haría parpadear para no decir nada nuevo.
3. Los cambios de **estado** (`order_progress`, `transport_status`, `delivery_started`, `delivery_closed`)
   **nunca se agrupan**, en ninguno de los dos streams: que una entrega falle es información nueva.

**Tabla DTO:** trackingEventDto

| Atributo | Tipo | Oblig. | Descripción / Mapeo |
|---|---|---|---|
| `transportOrderId` | number | Sí | ← `sk` del ítem ACTUAL (`ORDER#{transportOrderId}`), des-compuesta. Es la clave con la que el cliente parchea, y desde v0.0.2 es la misma en los dos streams |
| `latitude` | number | Sí | ← ítem ACTUAL `latitude` |
| `longitude` | number | Sí | ← ítem ACTUAL `longitude` |
| `battery` | number | No | ← ítem ACTUAL `battery` |
| `trackedAt` | string | Sí | ← ítem ACTUAL `trackedAt`. Crudo: "última señal" es derivado del cliente |
| `receivedAt` | string | Sí | ← ítem ACTUAL `receivedAt` |

**Ejemplo JSON (evento `tracking` en cualquiera de los dos streams)**

```json
{
  "transportOrderId": 4471,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
```

#### G. patchByOrderId(item) 19.10

Función **del cliente**: al recibir el evento, parchea su estado local buscando por
`transportOrderId` y deja intactas las demás filas o paradas. Nunca se reemplaza la colección entera.

No es solo fidelidad al contrato: conservar la identidad referencial de las filas que no cambiaron es
lo que evita que la tabla re-renderice 40 filas para mover una, y en el detalle es lo que evita
re-renderizar la lista completa de 20 paradas en cada ping. El merge tiene que ser **por entidad e
inmutable** (`{ ...prev, [id]: { ... } }`).

- **Parámetro de entrada:** `trackingEventDto`.
- **Parámetro de salida:** ninguno (estado local del cliente).

### Response Principal

Devuelve la confirmación de que el ping se aceptó y se escribió. No devuelve el ítem: el cliente que
lo mandó ya lo tiene, y la app del chofer no consume el estado del monitor.

```json
{
  "success": true,
  "code": 202,
  "message": "Ping registrado.",
  "data": {
    "transportOrderId": 4471,
    "trackedAt": "2026-07-16T08:24:39.000Z",
    "receivedAt": "2026-07-16T08:24:40.180Z"
  }
}
```

`receivedAt` viaja de vuelta a propósito: es lo único que la app no sabe, y le permite medir el
desfase de su propio reloj y el atraso de subida sin un endpoint de hora.

> **Divergencia a resolver.** `Secuencia.puml:65` documenta `204 No Content` para este endpoint,
> mientras que `Monitoreo.drawio` (`M2`) no declara código. Este documento especifica **`202` con
> cuerpo**, porque devolver `receivedAt` tiene un uso concreto (el párrafo de arriba) y un `204` no
> puede llevar cuerpo. Hay que alinear el `.puml`.

---

## Derivados

Qué devuelve la API ya calculado y qué calcula el cliente. La regla: **se guarda el instante, se
deriva el minuto**. Un derivado guardado no se puede des-derivar —de un "hace 37 min" no se recupera
a qué hora fijó el GPS— y además queda clavado mientras el reloj sigue.

| Dato | Quién lo calcula | Cómo |
|---|---|---|
| `progress` (progreso, paradas, incidencias) | **API** (18.8) | Agregación sobre `delivery_orders.status` y `delivery_incidents`. Va en el servidor para no transportar 800 entregas y producir 40 números |
| `pending`, `progressPct`, `outOfWindow` | **API** (18.8) | Derivados de los conteos, dentro del mismo `progressDto` |
| `trackedAt`, `latitude`, `longitude`, `battery` | **API** — crudos | Se devuelve el ítem tal como está en DynamoDB |
| `ultimaSenalMin` ("hace X min") | **Cliente** | `now() - trackedAt`. **No se guarda ni se devuelve.** La API devuelve `trackedAt` crudo justamente para que el número envejezca solo |
| Umbral "sin señal" (15 min) | **Cliente** | Una sola constante compartida por la tabla y el mapa, para que no discrepen sobre qué camión está caído. Son 60-90 pings consecutivos perdidos: dos órdenes de magnitud arriba de un túnel |
| Posición como par `[lat, lng]` | **Cliente** | El ítem guarda los dos números por separado, como el contrato; la tupla se arma en el borde de la vista |
| Interpolación del pin entre pings | **Cliente** | Fluidez del mapa y frecuencia del ping son problemas distintos |
| Frescura de la pantalla ("En vivo" / "Actualizado hace X") | **Cliente** | Es del **stream**, no del camión: dice "la conexión se murió y estás mirando datos congelados", mientras "última señal" dice "a este camión se le cayó el GPS" |

**Definidos y NO implementados.** El cálculo está especificado, no hay código que lo haga y ninguna
pantalla lo muestra. Se listan para que la tabla siga sirviendo como especificación y no se lea como
si todo estuviera hecho:

| Dato | Cómo saldría | Por qué todavía no |
|---|---|---|
| **Velocidad** | Dos puntos consecutivos de la TRAZA | La traza ya existe y alcanza para calcularla, pero ninguna pantalla tiene dónde ponerla. Es la razón por la que `speed` se sacó del payload (`../../UltimaVersion.sql:538`) |
| **Orientación del camión** | Dirección del segmento de la polilínea | El pin es un círculo con un ícono, no una flecha. Con el recorrido aproximado por rectas, la orientación sería la de la recta y no la de la calle |
| **"En camino a X"** | Primera entrega no cerrada por `route_delivery_points.sequence` (`:262`) | El estado existe por entrega, pero nadie compone el texto "en camino a *tal cliente*" |
| **"Fuera de ruta"** | `arrived_at` (`:395`) en orden distinto al `sequence` planificado | Nada compara el orden real de llegada contra el planificado |

---

## Huecos abiertos

Solo los que afectan **este** contrato. Cada uno con su evidencia.

1. **`transport_order` no tiene columna de código/número visible** — `../../UltimaVersion.sql:281-302`.
   La tabla declara `id`, `dispatch_plan_id`, `distributor_id`, `route_id`, `status`, `checked_by`,
   los dos campos asignados y la auditoría —más, desde v0.0.2, las columnas que hereda de `trips`—.
   Ninguna es un código de negocio.
   **Impacto directo sobre este contrato:** `code` es la **primera columna del listado** y el campo
   por el que el planificador identifica la orden —es lo que busca, lo que dicta por teléfono y lo que
   copia en un mail—, y **el atributo `code` de `MonitoringOrderDto` no tiene fuente**. Mientras no
   exista la columna, cada consumidor lo va a derivar del `id` a su manera y dos pantallas van a
   mostrar dos códigos distintos para la misma orden. Es el hueco que más pesa acá, porque no es un
   dato decorativo sino la clave con la que se habla de la orden.

2. **El estado de la salida no tiene dominio declarado, y ahora es una columna de
   `transport_order`** — `../../UltimaVersion.sql:214`:
   `status VARCHAR(50), -- Ej: PENDING, LOADING, DISPATCHED`, hoy todavía en `trips`. Es un comentario
   con un **ejemplo**, no un `CHECK` ni una tabla de catálogo, y al migrar la columna el hueco viaja
   con ella. **Impacto:** `transportStatus` es a la vez un **valor de filtro** del request
   (`filterMonitoringDto`) y un atributo de la respuesta, así que un dominio inestable rompe las dos
   puntas. La implementación de referencia usa `PENDING` / `EN_RUTA` / `FINALIZADO`
   (`monitoreo-estado.ts:105-113`) y solo el primero coincide con el ejemplo del esquema — por
   casualidad. Hay que declarar el dominio antes de que alguien filtre por un literal que el backend
   no reconoce.

3. **`delivery_result_code`, `incident_code`, `severity` y `pod_status` están `-- POR DEFINIR`** —
   `delivery_orders.delivery_result_code` (`:391`), `delivery_incidents.incident_code` (`:460`) y
   `severity` (`:462`), `proof_of_deliveries.pod_status` (`:440`). **Impacto sobre este contrato:** el
   listado cuenta incidencias (`progressDto.incidents`) pero no las puede **clasificar**: sin
   catálogo de `severity` no hay forma de que la columna distinga "una incidencia grave" de "tres
   observaciones", que es lo que el planificador necesita para decidir a quién llamar primero. El
   contador es lo máximo que se puede especificar hoy.

4. **Coordenadas de las paradas: dependencia externa, no columna faltante.** Se resuelven por el
   servicio **`01 DeliveryPoint`** documentado arriba, contra `dispatch_delivery_points.delivery_point_id`
   (`:135`), que es un `BIGINT NOT NULL` **sin FK** porque el maestro vive fuera de este
   microservicio. **Esto es una dependencia a declarar, no un hueco de esquema**: la ubicación de un
   cliente no cambia por despacho, así que el dato pertenece al maestro y no a la parada. Lo que sí
   queda por decidir es si además se **desnormaliza** en `dispatch_delivery_points` al armar el plan,
   para congelar la ubicación tal como estaba ese día. En el esquema hay lat/lon en exactamente tres
   lugares y **ninguno es la parada planificada**: `distributors.latitude/longitude` (`:8-9`, el
   depósito), `delivery_orders.arrival_latitude/longitude` (`:393-394`, dónde el camión **ya llegó**) y
   DynamoDB `truck_tracking` (el camión).

5. **El teléfono del chofer no existe** — del chofer se guardan `driver_employee_id` (`:210`) y
   `name_driver_employee` (`:211`) —las dos columnas que migran de `trips` (`:206-225`) a
   `transport_order`—, y nada más. **Impacto:** el listado muestra el chofer del camión que
   va tarde y el paso natural es llamarlo, pero no hay número que devolver, así que **ningún DTO de
   este documento lo declara**. Resolverlo pide una decisión previa: o el maestro de empleados lo
   expone como servicio externo (y entonces es una llamada más, por lote), o se desnormaliza junto al
   nombre en `transport_order` (y entonces queda congelado al momento del despacho, que para un
   teléfono es defendible).

6. **`transport_order.truck_id` y `transport_order.driver_employee_id` sin FK declarada** — las dos
   columnas llegan desde `trips` (`../../UltimaVersion.sql:206-225`, donde la única constraint es
   `fk_trip_distributor`, `:224`) y **la migración no agrega las FK que nunca existieron**. La tabla
   destino sí declara FK para `distributor_id`, `dispatch_plan_id` y `route_id` (`:298-301`), así que
   la asimetría va a quedar a la vista dentro de la misma tabla. **Impacto sobre 18.6:** la placa se
   resuelve **por valor** contra `trucks` (`:56`), así que el servicio tiene que decidir qué
   hace con un `truck_id` que no resuelve — hoy la fila se quedaría sin `licensePlate`, que es una de
   las dos columnas fijadas del listado.

7. **Colisión de nombres: `transport_order.status` ya existe** — `../../UltimaVersion.sql:287` declara
   `status VARCHAR(50)` en `transport_order`, y este documento lo expone como `orderStatus`: es el
   estado del **documento**. El estado que llega desde `trips.status` (`:214`) es **otra dimensión**
   —`PENDING` / `EN_RUTA` / `FINALIZADO`, dónde está el camión— y al fusionarse las tablas las dos
   quedan en la misma fila, así que no pueden llamarse igual. El DTO ya resuelve su lado con
   `transportStatus`, pero **la columna destino está sin decidir**: `transport_status` y
   `dispatch_status` son los dos candidatos. **Impacto:** bloquea escribir el DTO contra una columna
   real —el mapeo de `transportStatus` no se puede cerrar— y bloquea el filtro, porque
   `filterMonitoringDto.transportStatus` tiene que traducirse a un `WHERE` sobre una columna con
   nombre. Es el hueco que hay que cerrar primero, porque los otros dos de esta versión se pueden
   documentar y este no se puede implementar.

8. **`routes.trip_id` queda huérfano** — `../../UltimaVersion.sql:233` declara `trip_id BIGINT` con el
   comentario *"cuando se cree el viaje y se asocie a un chofer recien se valida que esta ruta esta
   incluida en este viaje o n rutas"*, y la FK `fk_routes_trip` (`:254`) apunta a `trips(id)`. Al
   anular la tabla, esa FK apunta a la nada y el comentario describe una regla —**un viaje incluye N
   rutas**— que se queda sin entidad donde vivir. **Está fuera de este módulo**: el monitoreo lee
   `transport_order.route_id` (`:286`), no `routes.trip_id`. Se anota igual porque **se rompe solo**:
   el `DROP TABLE trips` falla o deja una FK colgada, y hoy nadie es dueño de la decisión de si
   `routes` pasa a apuntar a `transport_order` o si la columna se elimina.

9. **La relación 1:1 es un supuesto, y hoy el esquema declara lo contrario** —
   `../../UltimaVersion.sql:285` declara `trip_id BIGINT , -- que viaje esta asociado, puede ser null`
   con FK `fk_transport_order_trip` (`:300`): **muchos-a-uno y nullable**. El comentario del bloque de
   monitoreo lo dice con todas las letras (`:548`): una bitácora de viaje *"habría escrito una fila por
   cada una de las 2-3 órdenes del camión para registrar UNA sola salida física"*. Y este mismo
   documento lo declaraba así hasta v0.0.1: *"una carga puede llevar varias órdenes"*. **Disolver el
   padre dentro del hijo solo es representable si la relación es 1:1**, y nada en el esquema lo
   garantiza todavía. **Impacto:** si dos órdenes vuelven a compartir camión, un ping físico habría que
   escribirlo N veces —N ítems con las mismas coordenadas, N pines superpuestos en el mapa y N trazas
   duplicadas de un solo recorrido—, que es exactamente el diseño que 19.5 rechazaba. No es un problema
   de volumen: son N verdades para un solo camión, que divergen en cuanto una de las N escrituras
   falle. Hace falta la restricción explícita —una orden por camión y por salida— antes de que la clave
   `ORDER#{transportOrderId}` sea segura.
