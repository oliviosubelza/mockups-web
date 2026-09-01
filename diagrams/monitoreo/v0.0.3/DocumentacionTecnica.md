# Documentación Técnica — Monitoreo en tiempo real

> **v0.0.3 — 2026-07-31.** Cambio de esta versión: **las columnas de `trips` ya no van a
> `transport_order`, van a `routes`**. La tabla `trips` se sigue anulando, pero lo que llevaba
> (`truck_id`, `distributor_id`, `driver_employee_id`, `name_driver_employee`, `helper_employee_id`,
> `name_helper_employee`, `status`, `departure_date`, `completed_date`) pasa a la ruta, así que
> **la salida física del camión es ahora la RUTA**. La versión anterior queda congelada en
> `../v0.0.2/`.
>
> **La consecuencia que hay que leer antes que ninguna otra:** con el viaje dentro de `routes`, el
> único vínculo que queda entre el documento y la salida es `transport_order.route_id`
> (`../../UltimaVersion.sql:286`, FK `fk_transport_order_route` `:301`), que es **nullable y sin
> UNIQUE**. Vuelve el **muchos-a-uno** —una ruta puede llevar N órdenes—, se cae el 1:1 de v0.0.2 y
> con él se cae su clave de tracking: **`ORDER#{transportOrderId}` pasa a `ROUTE#{routeId}`**.
>
> **El esquema tampoco refleja esta decisión**, y conviene saberlo antes de abrir el SQL y concluir
> que este documento se equivoca: `../../UltimaVersion.sql` sigue declarando `trips` (`:206-225`),
> `transport_order.trip_id` (`:285`) con su FK (`:300`), `routes.trip_id` (`:233`) con la suya
> (`:254`), y el bloque de DynamoDB con `PK TRIP#{tripId}` (`:513`, `:523`). La implementación de
> referencia (`src/mockup/monitoreo/`) sigue el modelo de v0.0.1. Acá se especifica el modelo nuevo,
> y cada columna que este documento ubica en `routes` se cita con su línea de origen en `trips` para
> que la migración sea rastreable.

Especificación de endpoints, DTOs y funciones del módulo de monitoreo, en la misma convención que
`../../UltimaVersion.pdf`. La numeración continúa la de ese documento, que ocupa las secciones
**1-19, 21 y 22** (`Documento Tecnico v1 (7).pdf`, índice) más la **23** que agrega
`GinoDiagramas.drawio`.

**El mapa de secciones, que no es obvio y hay que tenerlo a mano:**

| Flujo | Página del `.drawio` | Prefijo en el diagrama | Sección en ESTE documento |
|---|---|---|---|
| Listado de monitoreo + stream de flota | `M1` | `19.x` | **18** ⚠️ |
| Ping del camión (tracking) | `M2` | `24.x` | **19** ⚠️ |
| Detalle del viaje + su stream | `M3` | `25.x` (a estampar) | **25** ✔ |
| Entrega en el punto | `M4` | sin numerar | sin documentar |

⚠️ **Las dos primeras filas no coinciden, y es una deriva conocida** —el *Pendiente 1* del `README.md`—:
el diagrama se renumeró para calzar con el documento oficial (donde la sección 19 es *"Obtener ordenes
Despachadas"*, p. 96) y este documento todavía usa los prefijos `18.x` / `19.x` de `v0.0.1`. Alinearlo es
un pase aparte, mecánico pero grande: los números de paso también difieren dentro de cada sección, porque
el diagrama **no numera los retornos** y este documento sí. La sección **25** se escribió ya alineada.

**Alcance del módulo.** El monitoreo es un **lector puro sobre Postgres**: no crea ni actualiza
ninguna tabla del esquema relacional, solo consulta las que la planificación y la última milla ya
escribieron (`transport_order`, `routes`, `trucks`, `delivery_orders`, `delivery_incidents` y sus
hijas). **Ya no lee `trips`**: la tabla se anuló y lo que el módulo necesitaba de ella —camión,
chofer, estado y fechas de la salida— son ahora columnas de `routes`. El cambio de peso respecto de
v0.0.2 es ese: `routes` deja de ser la tabla de la polilínea y pasa a ser **la tabla del viaje**, así
que el listado vuelve a leerla en cada request. Lo único que **escribe** es la telemetría, y la
escribe **solo en DynamoDB**, en la tabla `truck_tracking` (`../../UltimaVersion.sql:497-539`). Esa
asimetría es deliberada: la traza de posiciones es append-only de alto volumen y en Postgres serían
decenas de millones de filas al año con particionado y retención obligatorios, mientras que en Dynamo
el TTL lo resuelve solo.

De los cinco endpoints web del módulo (`README.md` § *Endpoints*), este documento especifica **cuatro**:
el listado (`18`) con su stream, el ping del camión (`19`), y el **detalle del viaje (`25`) con su
stream**. El único que queda fuera es la ejecución de la entrega (`M4`: los tres `POST`/`PATCH` de la app
del chofer), que es de última milla y no del monitor — el monitor solo LEE lo que ese flujo escribe.

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
columna "Salida" del listado, que renderiza la hora de `routes.departure_date` (migrada de
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
| `400` | `distributorId` ausente o no numérico; `latitude`/`longitude` fuera de rango; `trackedAt` que no parsea como ISO-8601; `routeId` ausente |
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
  `routes.name_driver_employee VARCHAR(50)` (migrada de `trips.name_driver_employee`, `:211`), así
  que el listado lo lee de la fila de la ruta que ya trajo en 18.7 y no resuelve
  `driver_employee_id` contra ningún servicio. El `employeeId` del ping es
  `routes.driver_employee_id` (migrada de `trips.driver_employee_id`, `:210`) y viaja como número,
  sin resolverse.

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
| `transportStatus` | string | No | Estado de la salida física, heredado de `trips.status` (`:214`) a **`routes`**. **No es `orderStatus`**: `transport_order.status` (`:287`) es el estado del documento y vive en otra tabla, así que los dos estados ya no comparten fila —pero sí comparten pantalla, y el DTO los tiene que distinguir igual. Ojo con el destino: `routes.status` está **comentado** en el esquema (`:237`) con dominio de optimizador (`CALCULATED`, `FAILED`, `APPLIED`), así que la columna heredada entra como `transport_status` y no como `status`. Valores que la pantalla ofrece: `PENDING`, `EN_RUTA`, `FINALIZADO`. Ver *Huecos abiertos* |

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
listado es una orden de transporte, no un camión y no una ruta.

Con el viaje en `routes`, esta fila **ya no trae** el camión, el chofer ni las fechas de la salida:
trae el puntero. `route_id` (`:286`) vuelve a ser el dato crítico de este paso, y cumple **dos
papeles a la vez**: es con lo que 18.6 resuelve el viaje y es **la clave del merge con DynamoDB**
(18.12), porque el ítem se escribe con ese mismo id. La regla de fondo vuelve a ser la de v0.0.1, con
otro dueño:

> Se **guarda** por lo que físicamente existe —la ruta, que es la salida—. Se **navega** por lo que
> el usuario busca —la orden, que es el documento—.

Lo que no vuelve de v0.0.1 es la incomodidad de arrastrar una columna sin FK: `route_id` **ya está
declarada con integridad** (`fk_transport_order_route`, `:301`), cosa que `trip_id` también tenía
pero apuntando a una tabla que ahora desaparece.

- **Parámetro de entrada:** `distributorId` (number).
- **Parámetro de salida:** `listTransportOrder` (18.5).

**Tabla de atributos de listTransportOrder**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `transportOrderId` | number | `@IsInt()` | Sí | `transport_order.id` (`:282`) |
| `distributorId` | number | `@IsInt()` | Sí | `transport_order.distributor_id` (`:284`), con FK a `distributors` (`:298`) |
| `routeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `transport_order.route_id` (`:286`), FK `fk_transport_order_route` (`:301`). **Nullable y muchos-a-uno**: una ruta puede llevar varias órdenes. Es la clave del merge con Dynamo y la entrada de 18.6 |
| `orderStatus` | string | `@IsString()` | Sí | `transport_order.status` (`:287`). Estado del **documento** |
| `assignedWeightKg` | number | `@IsNumber()` | Sí | `transport_order.assigned_weight_kg` (`:289`) |
| `assignedVolumeM3` | number | `@IsNumber()` | Sí | `transport_order.assigned_volume_m3` (`:290`) |

Seis columnas: exactamente las que tenía en v0.0.1 salvo que `tripId` pasó a ser `routeId`. Las siete
que v0.0.2 había agregado acá —camión, chofer, ayudante, estado de la salida y las dos fechas— **se
van a la fila de la ruta** (18.7). Un `transportStatus` en este DTO sería el mismo dato dos veces y,
peor, N veces: con varias órdenes en una ruta, cada fila repetiría el estado de la misma salida.

**Ejemplo JSON (filas de Postgres, paso 18.5)**

```json
[
  {
    "transportOrderId": 4471,
    "distributorId": 1,
    "routeId": 512,
    "orderStatus": "DISPATCHED",
    "assignedWeightKg": 3480.50,
    "assignedVolumeM3": 14.20
  },
  { "...": "..." }
]
```

#### C. getRoutesByIds(routeIds) 18.6 y join trucks 18.6a

Función responsable de resolver **la salida** de cada orden: camión, chofer, hora de salida y estado.
Se llama **una vez con el arreglo de `routeId`** que devolvió el paso 18.5, no una vez por orden: con
40 órdenes eso serían 40 consultas para traer 40 filas de la misma tabla. Y el arreglo se
**deduplica** antes de consultar, porque varias órdenes pueden compartir ruta — es la primera
consecuencia práctica del muchos-a-uno.

La placa sale de `trucks.plate` (`:56`) uniendo por `routes.truck_id` (migrada de `trips.truck_id`,
`:208`). Ese join se resuelve **dentro de la misma consulta**
(`routes JOIN trucks ON routes.truck_id = trucks.id`): es **un solo viaje a la base**, no una segunda
llamada. En el diagrama aparece dibujado aparte como el paso **`18.6a`**, porque la placa no vive en
`routes` y el diagrama mantiene una lifeline por tabla; el paso separado documenta de qué tabla sale
el dato, no un round trip extra. La lifeline vuelve a llamarse **`Route,Truck DB`**, como en v0.0.1
era `Trip,Truck DB`.

**Este paso vuelve a existir, y ese es el costo del cambio.** En v0.0.2 se había reducido a resolver
la placa, porque el viaje estaba en la fila de la orden. Con el viaje en `routes` el listado vuelve a
pagar un lookup completo. Sigue siendo la misma cantidad de idas a Postgres que en las dos versiones
anteriores —tres: 18.4, 18.6 y 18.8—, así que lo que crece es **qué** se lee, no cuántas veces.

Hay un filtro que este paso no puede olvidar: `routes` guarda **candidatas**, no solo la ruta
ejecutada (`engine`, `score`, `total_cost`, `is_selected`, `:235-243`). La fila que trae la salida es
la de `is_selected = true`; las demás son hipótesis del optimizador. Como `transport_order.route_id`
apunta a **una** fila concreta, en el camino feliz el filtro es redundante — pero nada en el esquema
impide que apunte a una descartada. Ver *Huecos abiertos* (10).

El vínculo con `trucks` **no está respaldado por una FK declarada**: `trips.truck_id` no la tenía
(`:206-225`, donde la única constraint es `fk_trip_distributor`, `:224`) y la columna migra a `routes`
sin ganarla. Es una unión por valor: si el `truck_id` apunta a un camión borrado, la fila del listado
se queda sin placa y hay que decidirlo en el servicio, no confiar en la base.

- **Parámetro de entrada:** `routeIds` (number[], deduplicado).
- **Parámetro de salida:** `listRoute` (18.7).

**Tabla de atributos de listRoute**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `routeId` | number | `@IsInt()` | Sí | `routes.id` (`:229`). Es la clave con la que el servicio indexa el resultado |
| `distributorId` | number | `@IsInt()` | Sí | `routes.distributor_id` (migrada de `trips.distributor_id`, `:209`). **La columna no existe hoy en `routes`** y hay que agregarla: sin ella no se compone `FLEET#{distributorId}`. Ver *Huecos abiertos* (9) |
| `truckId` | number \| null | `@IsInt()` `@IsOptional()` | No | `routes.truck_id` (migrada de `trips.truck_id`, `:208`). **Sin FK declarada**. No confundir con `routes.planning_truck_id` (`:231`), que sí tiene FK pero apunta a `planning_trucks` |
| `licensePlate` | string | `@IsString()` | Sí | `trucks.plate` (`:56`), resuelta por `truckId` en el join 18.6a |
| `driverEmployeeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `routes.driver_employee_id` (migrada de `:210`). **Sin FK declarada**; el maestro de empleados es externo. No confundir con `routes.employee_id` (`:234`), que ya existía y no tiene dueño declarado |
| `nameDriverEmployee` | string | `@IsString()` | Sí | `routes.name_driver_employee` (migrada de `:211`). Desnormalizado: por eso el listado no llama a ningún servicio de empleados |
| `transportStatus` | string | `@IsString()` | Sí | Estado de la **salida física**, heredado de `trips.status` (`:214`). Entra como `routes.transport_status` porque `routes.status` está comentado (`:237`) con dominio de optimizador |
| `departureDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `routes.departure_date` (migrada de `:215`). `null` mientras el camión no salió. La pantalla renderiza solo `HH:mm` |
| `completedDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `routes.completed_date` (migrada de `:216`). Junto con `departure_date` son el **único** registro del ciclo de vida de la salida: se descartó la bitácora `trip_histories` (`:544-553`) y `routes` no tiene bitácora propia. Ver *Huecos abiertos* (12) |

`helper_employee_id` y `name_helper_employee` (`:212-213`) también migran a `routes`, pero **ningún
DTO de este documento las expone**: el listado no muestra ayudante y el ping no lo reporta.

**Ejemplo JSON (rutas resueltas, paso 18.7)**

```json
[
  {
    "routeId": 512,
    "distributorId": 1,
    "truckId": 880012,
    "licensePlate": "3456-ABC",
    "driverEmployeeId": 456,
    "nameDriverEmployee": "Carlos Mamani",
    "transportStatus": "EN_RUTA",
    "departureDate": "2026-07-16T08:00:00.000Z",
    "completedDate": null
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

**Es UNA sola Query para la flota entera, sean 40 rutas o 120.** Ese es el motivo de que el ítem
ACTUAL tenga `PK = FLEET#{distributorId}` en vez de `ROUTE#{routeId}`: con la PK de la traza, "dónde
está toda la flota" serían **N Queries, una por camión**, y el listado es la pantalla que se deja
abierta todo el día. El precio de esa lectura es un segundo write por ping (ver 19.6).

**La forma de esta PK no cambia, pero deja de ser gratis.** En v0.0.2 sobrevivía sin tocar nada
porque `distributor_id` ya vivía en `transport_order` (`:284`, `NOT NULL`). Ahora la partición se
compone desde la **ruta**, y `routes` **no tiene esa columna**: hay que heredar `trips.distributor_id`
(`:209`). Sin esa migración, el ping tendría que resolver la distribuidora con un join antes de poder
escribir, que es exactamente lo que una escritura de telemetría no puede pagar. Es el hueco (9) y
bloquea este paso tanto como el 19.6.

Cada ítem devuelto es una **ruta en curso**, no una orden: si tres órdenes viajan en el mismo camión,
la partición tiene **un** ítem, no tres. Cuando la salida se cierra, su ítem ACTUAL se borra de la
partición, así que `FLEET#` es la flota **en curso** y no el histórico. La traza no se toca: la borra
el TTL a los 30 días.

- **Parámetro de entrada:** `distributorId` (number).
- **Parámetro de salida:** `listItemActual` (18.11).

**Tabla de atributos de listItemActual**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `pk` | string | `@IsString()` | Sí | `FLEET#{distributorId}`. Clave de partición. El prefijo es lo que permite que este tipo de ítem y la traza convivan en la misma tabla sin colisionar |
| `sk` | string | `@IsString()` | Sí | `ROUTE#{routeId}`. Clave de ordenamiento. Es la **salida dentro de la flota**; el id se recupera des-componiendo el prefijo |
| `latitude` | number | `@IsLatitude()` | Sí | Grados decimales, 6 decimales |
| `longitude` | number | `@IsLongitude()` | Sí | Grados decimales, 6 decimales |
| `battery` | number | `@IsInt()` | Sí | Batería del dispositivo del chofer, 0-100. Explica la mayoría de los cortes de señal, y por eso viaja EN el ping |
| `trackedAt` | string | `@IsISO8601()` | Sí | Reloj del **DISPOSITIVO**: cuándo el GPS fijó la posición. Acá es atributo porque la `sk` la ocupa la ruta |
| `receivedAt` | string | `@IsISO8601()` | Sí | Reloj del **SERVIDOR**: cuándo llegó el paquete. Siempre `>= trackedAt` |

`trackedAt` es atributo en este tipo de ítem y **parte de la clave** en la traza (`SK = TS#{trackedAt}`).
Es el mismo dato con otro lugar de residencia, y es la razón de que las dos formas no sean
intercambiables.

**Ejemplo JSON (ítems ACTUAL de la flota, paso 18.11)**

```json
[
  {
    "pk": "FLEET#1",
    "sk": "ROUTE#512",
    "latitude": -17.783412,
    "longitude": -63.181245,
    "battery": 74,
    "trackedAt": "2026-07-16T08:24:39.000Z",
    "receivedAt": "2026-07-16T08:24:40.180Z"
  },
  { "...": "..." }
]
```

#### F. mergeTrackingByRouteId(orders, routes, items) 18.12

Función responsable de cruzar las filas de Postgres con los ítems de DynamoDB. **El cruce vuelve a
ser por una clave ajena**: `transport_order.route_id` (`:286`), que la fila trae desde 18.5. Es la
misma clave con la que 18.6 resolvió el camión, así que el servicio arma **un** índice
`Map<routeId, …>` y lo usa dos veces: para la ruta y para el ítem de tracking.

**Y no es un join 1:1, es un fan-out.** Un ítem de Dynamo puede alimentar **N filas** del listado,
porque N órdenes pueden compartir ruta. Dos filas de la misma placa mostrando la misma posición **no
son un bug**: son dos documentos del mismo camión, que está en un solo lugar. Lo que sí obliga es a
que el mapa dibuje **un pin por ruta y no uno por fila** — si dibuja por fila, muestra N camiones
donde hay uno. Ver *Huecos abiertos* (11).

Las claves de Dynamo **no se exponen** en la respuesta: el DTO lleva `routeId` ya resuelto. `pk` y
`sk` son la forma de almacenamiento, y filtrarlas acá evita que el frontend aprenda a parsear
prefijos.

Una orden **sin ítem** devuelve `tracking: null`, y es un caso normal, no un error: el camión todavía
no salió, o ya terminó y su ítem salió de la partición. Una orden **sin `routeId`** también: la
columna es nullable, así que una orden despachada sin ruta asignada no tiene salida que seguir.

- **Parámetro de entrada:** `listTransportOrder`, `listRoute`, `progressDto[]`, `listItemActual`.
- **Parámetro de salida:** `MonitoringOrderDto[]` (18.13, que el Controller devuelve tal cual en 18.14 y 18.15).

**Tabla de atributos de MonitoringOrderDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `transportOrderId` | number | `@IsInt()` | Sí | `transport_order.id` (`:282`). Es el id con el que el cliente parchea la fila al recibir `order_progress` |
| `code` | string | `@IsString()` | Sí | Código visible de la orden — primera columna del listado. **SIN ORIGEN EN EL ESQUEMA**: `transport_order` (`:281-302`) no tiene columna de código/número. Ver *Huecos abiertos* |
| `routeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `transport_order.route_id` (`:286`). **Es la clave de la salida**: con ella llegan los eventos `tracking` y `transport_status`, y el cliente la necesita para saber qué filas parchear |
| `orderStatus` | string | `@IsString()` | Sí | `transport_order.status` (`:287`) |
| `licensePlate` | string | `@IsString()` | Sí | `trucks.plate` (`:56`) vía `routes.truck_id` (migrada de `trips.truck_id`, `:208`), resuelta en 18.6a. Columna "Camión" |
| `driverName` | string | `@IsString()` | Sí | `routes.name_driver_employee` (migrada de `:211`). Columna "Chofer" |
| `transportStatus` | string | `@IsString()` | Sí | Estado de la salida física (`routes.transport_status`, heredado de `trips.status`, `:214`). Columna "Viaje" — la pantalla mantiene esa etiqueta, que es UI y no contrato |
| `departureDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `routes.departure_date` (migrada de `:215`). Columna "Salida", renderizada como `HH:mm` |
| `progress` | progressDto | `@ValidateNested()` `@Type(() => progressDto)` | Sí | Contadores del paso 18.8. Ver Sub-DTO |
| `tracking` | trackingSnapshotDto \| null | `@ValidateNested()` `@IsOptional()` `@Type(() => trackingSnapshotDto)` | No | Ítem ACTUAL del paso 18.11, ya cruzado por `routeId`. `null` si el camión no salió, ya terminó, o la orden no tiene ruta. Ver Sub-DTO |

**`tripId` no vuelve con otro nombre: vuelve `routeId`**, que ya estaba en el DTO de v0.0.2 pero como
dato informativo. Ahora es estructural — es la clave del merge (18.12), la clave del ítem de Dynamo y
la clave con la que llegan los eventos de tracking—, así que el frontend no la puede ignorar como
hacía hasta ahora.

**El DTO expone dos identidades a propósito, y conviene no "simplificarlo".** `transportOrderId`
identifica la **fila**; `routeId` identifica el **camión en la calle**. Con el 1:1 de v0.0.2 eran el
mismo hecho y se podía usar una sola; con el muchos-a-uno vuelven a ser dos, y el cliente necesita las
dos para parchear correctamente: `order_progress` llega por orden, `tracking` llega por ruta.

**`transportStatus` conserva su nombre de v0.0.2** aunque el motivo cambió. Ya no es para evitar una
colisión dentro de la misma fila —`transport_order.status` quedó en otra tabla—, sino porque la
columna destino tampoco puede llamarse `status`: `routes.status` está comentado en el esquema
(`:237`) con dominio de optimizador (`CALCULATED` / `FAILED` / `APPLIED`), y reusar ese nombre sería
mezclar "cómo salió el cálculo" con "dónde está el camión".

**Sub-DTO: progressDto**

Es el mismo DTO del paso 18.9; se anida sin cambios. La tabla de atributos está en **D.
countStatusesByOrder(orderIds) 18.8**.

**Sub-DTO: trackingSnapshotDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `routeId` | number | `@IsInt()` | Sí | Resuelto desde `sk` (`ROUTE#{routeId}`). Reemplaza a `pk`/`sk`, que no se exponen |
| `latitude` | number | `@IsLatitude()` | Sí | DynamoDB `truck_tracking.latitude` |
| `longitude` | number | `@IsLongitude()` | Sí | DynamoDB `truck_tracking.longitude` |
| `battery` | number | `@IsInt()` | Sí | DynamoDB `truck_tracking.battery`, 0-100 |
| `trackedAt` | string | `@IsISO8601()` | Sí | DynamoDB `truck_tracking.trackedAt`. **Se devuelve crudo**: la columna "Última señal" es un derivado (`now() - trackedAt`) que el cliente calcula, así el número envejece solo |
| `receivedAt` | string | `@IsISO8601()` | Sí | DynamoDB `truck_tracking.receivedAt`. Se expone para poder distinguir *"el GPS no fija"* de *"el celular buferea sin cobertura"* |

El `routeId` del sub-DTO **repite** el de la fila que lo contiene, y es deliberado: este mismo objeto
viaja solo como payload del evento `tracking` (19.9), donde es la única clave que el cliente tiene
para saber qué filas parchear — en plural, porque pueden ser varias.

**Ejemplo JSON (Response)**

Las dos primeras filas comparten `routeId`: son dos órdenes en el mismo camión, y por eso llevan la
misma placa, el mismo chofer y **el mismo `tracking`**. Es el caso que v0.0.2 no podía representar.

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
        "routeId": 512,
        "latitude": -17.783412,
        "longitude": -63.181245,
        "battery": 74,
        "trackedAt": "2026-07-16T08:24:39.000Z",
        "receivedAt": "2026-07-16T08:24:40.180Z"
      }
    },
    {
      "transportOrderId": 4473,
      "code": "OT-2026-004473",
      "routeId": 512,
      "orderStatus": "DISPATCHED",
      "transportStatus": "EN_RUTA",
      "licensePlate": "3456-ABC",
      "driverName": "Carlos Mamani",
      "departureDate": "2026-07-16T08:00:00.000Z",
      "progress": {
        "total": 4,
        "delivered": 2,
        "failed": 0,
        "returned": 0,
        "pending": 2,
        "progressPct": 50,
        "incidents": 0,
        "outOfWindow": 0
      },
      "tracking": {
        "routeId": 512,
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
| `transport_status` | Al instante | `routeId`, `transportStatus`, `completedDate` | Ídem: el camión salió o terminó. Viaja con `routeId` y no con `transportOrderId` porque el hecho es de la SALIDA: un evento puede tener que actualizar varias filas |

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

**Lo que v0.0.2 había unificado y esta versión vuelve a separar es la IDENTIDAD.** Con el 1:1, los
dos streams parcheaban por `transportOrderId` y el cliente tenía una sola clave. Con el viaje en
`routes` vuelven a ser dos, y la regla es la del hecho que transporta el evento:

| Evento | Clave del payload | Por qué |
|---|---|---|
| `tracking` | `routeId` | Es una posición del CAMIÓN. Un ping puede tocar N filas del listado |
| `transport_status` | `routeId` | El camión salió o terminó: es la misma salida para todas sus órdenes |
| `order_progress` | `transportOrderId` | Es el contador de UNA orden. Dos órdenes del mismo camión avanzan distinto |

El cliente necesita entonces **dos índices**: uno por `transportOrderId` (la fila) y uno por `routeId`
(las filas de esa salida). No es complejidad gratuita: es la que corresponde a que un camión pueda
llevar dos documentos. Con un solo índice, un evento `tracking` movería una fila y dejaría la otra con
la posición vieja.

**Ejemplo JSON (payload de `tracking`)**

```json
{
  "routeId": 512,
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
  "routeId": 512,
  "transportStatus": "FINALIZADO",
  "completedDate": "2026-07-16T15:42:10.000Z"
}
```

Cuando `transport_status` llega con la salida terminada, el cliente además tiene que poner
`tracking: null` en **todas** las filas de esa ruta: el ítem ACTUAL salió de la partición
`FLEET#{distributorId}` porque ya no hay nada activo que listar (18.10), así que seguir mostrando la
última posición sería mostrar un camión que ya volvió al depósito.

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
"parcheo por id" del cliente, en cambio, es por la clave del **payload** —`routeId` o
`transportOrderId` según el evento, ver la tabla de arriba—, no por el id del evento SSE: son dos
cosas distintas que comparten la palabra.

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
| `routeId` | number | Sí | `routes.id` (`../../UltimaVersion.sql:229`). Es la **salida física** y compone la PK de la TRAZA. En v0.0.2 acá viajaba `transportOrderId`, con el argumento de que la orden y el camión eran la misma fila; con el viaje en `routes` vuelven a ser dos cosas, y lo que el GPS reporta es la ruta que el camión está ejecutando, no el documento que lleva en la cabina |
| `distributorId` | number | Sí | `routes.distributor_id` (migrada de `trips.distributor_id`, `:209`). Compone la PK del ítem ACTUAL (`FLEET#{distributorId}`). Sin él el ping no se puede escribir — y hoy **esa columna no existe en `routes`**: ver *Huecos abiertos* (9) |
| `latitude` | number | Sí | Grados decimales, 6 decimales. Rango `-90..90` |
| `longitude` | number | Sí | Grados decimales, 6 decimales. Rango `-180..180` |
| `employeeId` | number | Sí | `routes.driver_employee_id` (migrada de `trips.driver_employee_id`, `:210`). **Quién** reportó: es el dato de auditoría del ping |
| `trackedAt` | string | Sí | ISO-8601 UTC. Reloj del **DISPOSITIVO**. El servidor no lo toca |
| `battery` | number | No | Entero 0-100. Batería del dispositivo del chofer |

La app del chofer **manda la ruta, no la orden**, y eso hay que bajarlo a la app: hoy su contexto
natural es "la carga que llevo". Con varias órdenes en un camión, el dato que identifica el recorrido
es el `routeId`, y es el que tiene que viajar en el login del turno o en el arranque del viaje.

Del payload se **descartaron a propósito** cuatro campos (`../../UltimaVersion.sql:535-539`), y decirlo
evita que vuelvan a proponerse: `heading` (el ícono se orienta con la dirección del segmento de la
polilínea), `accuracy` (solo serviría para validar el rango del botón "Iniciar entrega", fuera de
alcance), `speed` (derivable de dos puntos consecutivos de la traza, que ahora existe) y
`currentDeliveryOrderId` (derivado: primera entrega no cerrada por `route_delivery_points.sequence`).

**Request en JSON.**

```json
{
  "routeId": 512,
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
  "routeId": 512,
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
PK  ROUTE#{routeId}
SK  TS#{trackedAt}

· última posición de la salida  ->  Query PK, ScanIndexForward=false, Limit=1
· recorrido entre dos horas     ->  Query PK, SK BETWEEN 'TS#t1' AND 'TS#t2'
```

La partición es la **salida** y no el camión, y ese argumento sobrevive a las tres versiones: un
camión hace 2-3 salidas por día, así que con `TRUCK#{truckId}` la traza de la mañana y la de la tarde
caerían en la misma partición y se perdería *"el recorrido de ESTA salida"*. Lo que cambia entre
versiones es **cómo se nombra la salida**: `TRIP#{tripId}` en v0.0.1, `ORDER#{transportOrderId}` en
v0.0.2, y ahora `ROUTE#{routeId}`.

**Este cambio recupera la propiedad que v0.0.2 tenía en riesgo.** Aquella versión aceptaba
`ORDER#{transportOrderId}` solo porque el modelo era 1:1, y dejaba anotado que si dos órdenes volvían
a compartir camión, cada ping se escribiría N veces —N ítems con las mismas coordenadas, N pines
superpuestos y N trazas duplicadas de un solo recorrido, que divergen en cuanto una de las N
escrituras falle—. Con la salida en `routes`, **ese escenario deja de ser un riesgo**: dos órdenes en
un camión comparten `route_id`, así que un ping físico es **un** ítem, sin restricción de negocio que
haya que garantizar aparte.

Lo que sí hay que garantizar es lo simétrico, y es el hueco (8): que **una salida sea una sola ruta**.
El comentario de `routes.trip_id` (`:233`) dice que un viaje se validaba contra *"este viaje o n
rutas"*, o sea que un camión podía salir con varias. Si eso se mantiene, un solo recorrido físico se
parte en N particiones y el problema de v0.0.2 reaparece del otro lado: en vez de N ítems iguales por
ping, N trazas parciales del mismo camión.

`trackedAt` **no se duplica como atributo**: viaja dentro de la `sk`, que es lo que ordena la traza por
tiempo dentro de la partición. Tenerlo también como atributo sería el mismo dato en dos lugares del
mismo ítem, con la posibilidad de que discrepen.

**Tabla DTO:** TruckTrackingItem (A — TRAZA)

| Atributo | Tipo | Oblig. | Descripción / Mapeo |
|---|---|---|---|
| `pk` | string | Sí | `ROUTE#{routeId}` ← `trackDto.routeId` |
| `sk` | string | Sí | `TS#{trackedAt}` ← `trackDto.trackedAt`. ISO-8601 UTC: el orden lexicográfico es el cronológico |
| `latitude` | number | Sí | ← `trackDto.latitude` |
| `longitude` | number | Sí | ← `trackDto.longitude` |
| `battery` | number | No | ← `trackDto.battery` |
| `employeeId` | number | Sí | ← `trackDto.employeeId` (`routes.driver_employee_id`, migrada de `:210`). Solo está en la TRAZA: es el dato de auditoría del ping, y el ACTUAL no lo necesita porque el listado ya trae el chofer en la fila de la ruta |
| `receivedAt` | string | Sí | ← paso 19.4 |
| `expiresAt` | number | Sí | **Atributo de TTL**: epoch en SEGUNDOS (el formato que Dynamo exige) = `trackedAt + 30 días`. Nadie lo lee ni lo borra a mano: se declara una vez como atributo de TTL de la tabla y Dynamo resuelve el vencimiento en background. Está en el ítem solo para que el ping nazca con su fecha de muerte |

**Ejemplo JSON (ítem TRAZA escrito)**

```json
{
  "pk": "ROUTE#512",
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

Función responsable de escribir el ítem **B) ACTUAL**. Es **overwrite**: un ítem por salida en curso,
y cada ping pisa el anterior. Existe **solo** para que la flota entera de una distribuidora salga en
**una** Query (paso 18.10); con la PK de la traza harían falta N consultas, una por camión.

```
PK  FLEET#{distributorId}     (misma forma, otro origen)
SK  ROUTE#{routeId}
```

**La PK conserva la forma pero cambia de dueño, y esa es la diferencia con v0.0.2.** Allá se pudo
decir "esta clave no se toca" porque `distributor_id` ya vivía en `transport_order`
(`../../UltimaVersion.sql:284`, `NOT NULL`). Acá el ping ya no habla de la orden: habla de la ruta, y
`routes` **no tiene `distributor_id`**. Hay que heredar `trips.distributor_id` (`:209`) o el write
tendría que resolverla con un join contra `dispatch_plans` en el camino crítico de una escritura de
telemetría. Es el hueco (9), y es de los que bloquean.

El overwrite es la semántica correcta y no una pérdida de información: lo que se pisa está guardado en
la TRAZA, que es append. Este ítem es una **proyección de última posición**, no un registro histórico
— por eso tampoco lleva TTL: el ítem se borra explícitamente cuando la salida se cierra y sale de la
flota en curso.

**Tabla DTO:** TruckTrackingItem (B — ACTUAL)

| Atributo | Tipo | Oblig. | Descripción / Mapeo |
|---|---|---|---|
| `pk` | string | Sí | `FLEET#{distributorId}` ← `trackDto.distributorId` |
| `sk` | string | Sí | `ROUTE#{routeId}` ← `trackDto.routeId`. La partición es la flota, así que la salida es la clave de ordenamiento |
| `latitude` | number | Sí | ← `trackDto.latitude` |
| `longitude` | number | Sí | ← `trackDto.longitude` |
| `battery` | number | No | ← `trackDto.battery`. Está en los **dos** tipos de ítem porque cada ping escribe los dos |
| `trackedAt` | string | Sí | ← `trackDto.trackedAt`. Acá **sí** es atributo, porque la `sk` la ocupa la ruta |
| `receivedAt` | string | Sí | ← paso 19.4 |

Sin `employeeId` y sin `expiresAt`, y las dos ausencias son deliberadas: la auditoría de quién reportó
vive en la traza, y el ciclo de vida de este ítem lo gobierna el cierre de la salida, no un
vencimiento.

**Ejemplo JSON (ítem ACTUAL escrito)**

```json
{
  "pk": "FLEET#1",
  "sk": "ROUTE#512",
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
```

**Volumen de escritura, sin maquillaje.** Son **dos ítems por ping**. Con ~40 camiones × 1 ping cada
12 s × 8 h de jornada: **≈ 96.000 pings/día ≈ 192.000 escrituras/día**. El número se cuenta **por
camión**, no por orden, y con la clave por ruta eso vuelve a ser exacto: si dos órdenes viajan juntas,
v0.0.2 habría escrito el doble para el mismo recorrido. Es el precio explícito de que las dos
preguntas del monitor —una salida / toda la flota— cuesten **una Query cada una** en vez de N. Si el
número se vuelve un problema, la palanca no es dejar de escribir el ACTUAL (eso devuelve las N
consultas del listado, que es la pantalla que está abierta todo el día): es bajar la cadencia del ping
o escribir el ACTUAL cada k pings, aceptando que la "última posición" del listado atrase k×12 s.

#### E. publish(tracking, routeId) 19.7

Función responsable de publicar el evento `tracking` en el bus SSE en memoria, con scope de **salida**.

**Si no hay conexiones abiertas para esa ruta, no se publica nada** — y la escritura en Dynamo ocurre
igual. Ese orden importa: la persistencia no depende de que alguien esté mirando. Un bus que fuera
también el que persiste convertiría "nadie tiene la pantalla abierta" en "se perdió el recorrido".

El scope es la ruta y no la orden, así que el bus **no tiene que saber** cuántas órdenes viajan en esa
salida: publica una vez y cada suscriptor decide a qué filas aplica. Traducir de ruta a órdenes en el
publisher sería consultar Postgres en el camino de cada ping.

- **Parámetro de entrada:** `routeId` (number), `trackingSnapshotDto`.
- **Parámetro de salida:** ninguno (fire-and-forget hacia los suscriptores).

#### F. Lógica de fanout del evento tracking (event: tracking 19.8 y event: tracking 19.9)

El mismo write se entrega a **dos streams con granularidades distintas**. No son dos eventos
distintos: es un evento con dos cadencias de entrega.

1. **Stream del DETALLE (`event: tracking` 19.8)**:
   `GET /monitoring/orders/{transportOrderId}/stream`. Entrega **ping por ping**, sin agrupar. Acá
   cada posición mueve el pin, que es lo único que la pantalla hace. La suscripción se abre por la
   orden de la URL, pero internamente escucha **dos scopes**: `ROUTE#{routeId}` para `tracking` y
   `ORDER#{transportOrderId}` para `delivery_started` / `delivery_closed`.
2. **Stream de FLOTA / listado (`event: tracking` 19.9)**:
   `GET /monitoring/stream?distributorId={id}`. Entrega **agrupado ~30 s**, con la última posición de
   cada camión de la ventana. En la tabla un ping solo mueve "Última señal", así que reenviar ~3,3
   eventos/s la haría parpadear para no decir nada nuevo.
3. Los cambios de **estado** (`order_progress`, `transport_status`, `delivery_started`, `delivery_closed`)
   **nunca se agrupan**, en ninguno de los dos streams: que una entrega falle es información nueva.

La ventana de agrupación del listado se lleva ahora **por ruta**, no por orden. Con dos órdenes en un
camión, agrupar por orden emitiría dos eventos con las mismas coordenadas al vaciar la ventana.

**Tabla DTO:** trackingEventDto

| Atributo | Tipo | Oblig. | Descripción / Mapeo |
|---|---|---|---|
| `routeId` | number | Sí | ← `sk` del ítem ACTUAL (`ROUTE#{routeId}`), des-compuesta. Es la clave con la que el cliente parchea **todas** las filas de esa salida |
| `latitude` | number | Sí | ← ítem ACTUAL `latitude` |
| `longitude` | number | Sí | ← ítem ACTUAL `longitude` |
| `battery` | number | No | ← ítem ACTUAL `battery` |
| `trackedAt` | string | Sí | ← ítem ACTUAL `trackedAt`. Crudo: "última señal" es derivado del cliente |
| `receivedAt` | string | Sí | ← ítem ACTUAL `receivedAt` |

**Ejemplo JSON (evento `tracking` en cualquiera de los dos streams)**

```json
{
  "routeId": 512,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
```

#### G. patchByRouteId(item) 19.10

Función **del cliente**: al recibir el evento, parchea su estado local buscando por `routeId` y deja
intactas las demás filas o paradas. Nunca se reemplaza la colección entera.

**Puede tocar más de una fila**, y ahí está la diferencia con v0.0.2: el índice del cliente es
`Map<routeId, transportOrderId[]>`, y un ping mueve todas las filas de esa salida. Si el cliente
indexara solo por orden, un camión con dos órdenes mostraría una fila al día y otra congelada.

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
    "routeId": 512,
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

## 25 Detalle del viaje (snapshot + SSE)

### Endpoint.

**Tipo:** (HTTP) GET /monitoring/orders/{transportOrderId}

Obtener TODO lo de una salida en una sola respuesta: el recorrido planificado, las paradas con su
estado y su evidencia, y la última posición conocida del camión. Es la pantalla de mapa
(`M3` de `Monitoreo.drawio`, `/monitoreo/seguimiento/:ordenId`).

**Por qué la sección es la 25.** El documento técnico oficial ocupa las secciones **1-19, 21 y 22**, y
`GinoDiagramas.drawio` agrega la **23**. El monitoreo ya se quedó con la **19** (listado, que el doc
oficial llama *"Obtener ordenes Despachadas"*, p. 96) y con la **24** (ping del camión). La **25** es la
siguiente libre; la **20** se deja para el doc oficial, que es el único hueco que le queda entre su 19 y
su 21.

**El recurso es la ORDEN, la clave del tracking es la RUTA.** Esa asimetría es de v0.0.3 y no un
descuido: la URL lleva el `transportOrderId` porque es el documento que el planificador abrió desde el
listado, mientras que la posición se guarda por `routeId` porque es lo que físicamente se mueve (ver
*19 C. putItem(TRAZA) 19.5*). El puente cuesta **cero consultas extra**: `transport_order.route_id`
(`../../UltimaVersion.sql:286`) viene en la misma fila que este flujo necesita leer igual para armar la
cabecera.

### Numeración de los pasos

El diagrama `M3` tiene las secciones `M3.1` / `M3.2` / `M3.3` pero **todavía no tiene los números de
paso**, así que esta tabla es la que hay que estampar en el `.drawio` para que las dos cosas se puedan
cruzar. Convención del archivo: se numeran las **llamadas**, no los retornos; los sub-pasos llevan
sufijo de letra.

| Paso | Etiqueta en el diagrama | Lifeline destino |
|---|---|---|
| `25.1` | `GET /monitoring/orders/{transportOrderId}` | Gateway Controller |
| `25.2` | `getOrderDetail(transportOrderId)` | Monitoring Controller |
| `25.3` | `getOrderDetail(transportOrderId)` | Monitoring Service |
| `25.4` | `findOrderWithRoute(transportOrderId)` | **Transport Order DB** — falta la lifeline |
| `25.4a` | `join distributors ON transport_order.distributor_id` | Distributor DB — falta la lifeline |
| `25.5` | `findSelectedRoute(routeId)` | Route DB |
| `25.5a` | `join trucks ON routes.truck_id` | Truck DB — falta la lifeline |
| `25.6` | `findRouteDeliveryPoints(routeId)` | Route Delivery Point DB |
| `25.7` | `findDispatchPoints(dispatchDeliveryPointIds)` | Dispatch Delivery Point DB |
| `25.7a` | `findCandidateOrders(dispatchDeliveryPointIds)` *(enriquecimiento opcional del plan)* | Candidate Order DB — falta la lifeline |
| `25.8` | `getDeliveryPoints(deliveryPointIds)` | **01 DeliveryPoint** (servicio externo) — falta la lifeline |
| `25.9` | `findDeliveriesByOrder(transportOrderId)` | Delivery Order DB |
| `25.9a` | `findItemsByDeliveryIds(deliveryOrderIds)` | Delivery Order Item DB — falta la lifeline |
| `25.9b` | `findIncidentsByDeliveryIds(deliveryOrderIds)` | Delivery Incident DB — falta la lifeline |
| `25.9c` | `findPodsByDeliveryIds(deliveryOrderIds)` | Proof Of Delivery DB — falta la lifeline |
| `25.9d` | `findHistoriesByDeliveryIds(deliveryOrderIds)` | Delivery Order History DB — falta la lifeline |
| `25.10` | `query(PK=ROUTE#{routeId})` | Truck Tracking (DynamoDB) |
| `25.11` | `buildDetail(...)` | auto-llamada del Service |
| `25.12` | `GET /monitoring/orders/{transportOrderId}/stream` | Gateway Controller |
| `25.13` | `openDetailStream(transportOrderId)` | Monitoring Controller |
| `25.14` | `subscribe(ROUTE#{routeId} + ORDER#{transportOrderId})` | SSE Hub |
| `25.15` | `event: tracking` | Frontend |
| `25.16` | `event: delivery_started` | Frontend |
| `25.17` | `event: delivery_closed` | Frontend |
| `25.18` | `patchByRouteId / patchByDeliveryOrderId` | Frontend (auto-llamada) |
| `25.19` | `GET /monitoring/orders/{transportOrderId}` (se RE-PIDE el snapshot) | Gateway Controller |

**Diez pasos de esta lista no están dibujados**, y los diez son consultas reales: `25.4` (resolver la
orden y su ruta), `25.4a` (el depósito), `25.5a` (la placa contra `trucks`), `25.7a` (enriquecimiento
opcional del plan), `25.8` (las coordenadas de las paradas, que es la dependencia que sostiene el mapa)
y los cuatro `25.9a-d` (ítems, incidencias, comprobantes e historial). En el diagrama de hoy esos cuatro viajan implícitos en el paso
`25.9` contra `Delivery Order DB`, lo que contradice la regla de "una lifeline por tabla" — y es
justamente lo que hacía imposible ver **de dónde sale el comprobante**. Acá cada uno es un paso con su
DTO y su JSON.

**Y hay un paso lógico adicional que esta versión del documento deja explícito aunque todavía no esté
numerado en la tabla:** la vista a nivel pedido se apoya en `delivery_order_sales`, no en
`candidate_orders`. `candidate_orders` vive en planificación; `delivery_order_sales` es la relación
real pedido-parada ya despachada. La sección *F.1* fija esa regla para que el listado plano de pedidos
y los cobros no nazcan atados a una identidad equivocada.

### ¿Dónde está el endpoint de los comprobantes? No hay: vienen todos acá

Las cuatro pestañas del panel de detalle —*Historial*, *Incidencias*, *Comprobante*, *Pedido*— y la
quinta —*Cobro*— **no hacen ninguna llamada propia**. Todo llega dentro de este único snapshot,
anidado en `paradas[]`: al hacer click en una parada el frontend no pide nada, solo muestra lo que ya
tiene.

Y es una decisión, no una comodidad. La alternativa —un `GET /monitoring/deliveries/{id}/proof` y
compañía, uno por pestaña— serían **cuatro endpoints más** para traer unos pocos KB que ya se leyeron:
una salida tiene 4-20 paradas, y el snapshot completo pesa menos que una foto del comprobante. Peor:
con carga diferida, el planificador que abre cinco paradas seguidas para comparar dispara veinte
requests, y la pantalla que existe para vigilar se llena de spinners.

Lo que sí queda por resolver es el otro lado: **cuando el stream cierra una parada en vivo, el evento
no trae la evidencia** (ver *25.16-25.17*). Ahí sí haría falta re-pedir algo, y es la única razón
defendible para un endpoint por parada.

### Códigos HTTP

Los mismos del listado más **uno que allá no existe**:

| Código | Cuándo |
|---|---|
| `200` | El detalle completo, y el stream al quedar la conexión abierta |
| `400` | `transportOrderId` no numérico |
| `404` | **La orden no existe.** Acá sí corresponde, y es la diferencia con el listado: el listado es una colección acotada por distribuidora (una flota vacía es `200` con `data: []`), esto es **un recurso identificado por su id** — pedir una orden que no está no es "una lista vacía", es un id que no resuelve |
| `500` | Falla de Postgres, de DynamoDB o del servicio de puntos de entrega |

Una orden que existe pero **no tiene `route_id`** es un `200`, no un `404`: es una orden despachada sin
ruta asignada. La respuesta trae la cabecera, las paradas y `recorrido: []` con `tracking: null`.

**No hay paginación de paradas**, por lo mismo que en el listado: una salida tiene 4-20 paradas y
paginarlas obligaría al stream a saber en qué página está el cliente.

### Especificación de DTOs y funciones

#### Request Principal (GET /monitoring/orders/{transportOrderId})

**Parámetros de entrada:** path param.

| Atributo | Tipo | Oblig. | Descripción / Restricción |
|---|---|---|---|
| `transportOrderId` | number | Sí | `transport_order.id` (`:282`). Va en el PATH y no en query porque identifica el recurso |

No lleva `distributorId`. Podría discutirse por seguridad —hoy cualquiera con el id ve la orden— pero
como **dato** sería redundante: la orden ya trae su `distributor_id` (`:284`, `NOT NULL`).

#### A. getOrderDetail(transportOrderId) 25.2 y 25.3

El Gateway recibe el `GET` (25.1) y lo delega al Monitoring Controller (25.2), que valida el path param
y llama al Monitoring Service (25.3). El Service orquesta: seis lecturas a Postgres, una llamada al
servicio externo de puntos de entrega, una Query a DynamoDB y el armado (25.11), en ese orden.

- **Parámetro de entrada:** `transportOrderId` (number).
- **Parámetro de salida:** `monitoringOrderDetailDto` (25.11).

#### B. findOrderWithRoute(transportOrderId) 25.4

Función responsable de traer la orden **y el puntero a su salida**: es la que resuelve el `route_id` con
el que se consultan Dynamo (25.10) y la ruta (25.5). Una sola consulta, no dos: la cabecera de la
pantalla necesita esa fila igual.

**Este paso no existía en v0.0.2** y es el precio del cambio de modelo. Allá el id de la URL ya era la
clave de partición de la traza, así que no había nada que resolver antes de ir a Dynamo. Con el viaje en
`routes` vuelve la traducción — la misma que tenía v0.0.1 con `trip_id`, y por el mismo motivo.

**Y trae el DEPÓSITO, en el sub-paso 25.4a.** `transport_order.distributor_id` tiene FK a `distributors`
(`:298`), así que es un join en la misma consulta: `distributors.name`, `latitude` y `longitude`
(`:8-9`). No es un extra decorativo — **el recorrido empieza y termina en el depósito**, y sin esas dos
coordenadas el mapa no puede dibujar el primer tramo (depósito → parada 1), ni el último (última parada →
depósito), ni el pin del almacén. Es el único par lat/lon del módulo que **sí** vive en una tabla nuestra;
todos los demás son del servicio externo (25.8) o de DynamoDB.

- **Parámetro de entrada:** `transportOrderId` (number).
- **Parámetro de salida:** `orderHeaderDto` + `depositoDto`.

**Tabla de atributos de orderHeaderDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `transportOrderId` | number | `@IsInt()` | Sí | `transport_order.id` (`:282`) |
| `code` | string | `@IsString()` | Sí | Código visible. **SIN ORIGEN EN EL ESQUEMA** — ver *Huecos abiertos* (1) |
| `distributorId` | number | `@IsInt()` | Sí | `transport_order.distributor_id` (`:284`) |
| `routeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `transport_order.route_id` (`:286`). **Es la clave del tracking**: sin él no hay Query a Dynamo ni suscripción al stream |
| `orderStatus` | string | `@IsString()` | Sí | `transport_order.status` (`:287`) — estado del **documento** |
| `assignedWeightKg` | number | `@IsNumber()` | Sí | `transport_order.assigned_weight_kg` (`:289`) |
| `assignedVolumeM3` | number | `@IsNumber()` | Sí | `transport_order.assigned_volume_m3` (`:290`) |

**Tabla de atributos de depositoDto** — el join 25.4a

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `distributorId` | number | `@IsInt()` | Sí | `distributors.id`. Es el mismo `distributorId` de la cabecera: viaja acá porque este objeto se consume solo |
| `name` | string | `@IsString()` | Sí | `distributors.name` — se muestra en el tooltip del pin del almacén |
| `latitude` | number | `@IsLatitude()` | Sí | `distributors.latitude NUMERIC(9,6)` (`:8`). **Origen del recorrido** |
| `longitude` | number | `@IsLongitude()` | Sí | `distributors.longitude NUMERIC(9,6)` (`:9`). Ídem |

**Ejemplo JSON (retorno de 25.4 + 25.4a)**

```json
{
  "order": {
    "transportOrderId": 4471,
    "code": "OT-2026-004471",
    "distributorId": 1,
    "routeId": 512,
    "orderStatus": "DISPATCHED",
    "assignedWeightKg": 3480.50,
    "assignedVolumeM3": 14.20
  },
  "deposito": {
    "distributorId": 1,
    "name": "Planta Santa Cruz",
    "latitude": -17.771200,
    "longitude": -63.142100
  }
}
```

#### C. findSelectedRoute(routeId) 25.5 y join trucks 25.5a

Función responsable de traer **la salida y su recorrido**: en v0.0.3 las dos cosas viven en la misma
fila de `routes`. Antes este paso solo traía la polilínea.

Trae la ruta **seleccionada**: `WHERE id = $1 AND is_selected = true`. El filtro es redundante en el
camino feliz —`route_id` apunta a una fila concreta— pero nada en el esquema impide que apunte a una
candidata descartada, y una candidata no tiene salida real (ver *Huecos abiertos* (10)).

La placa sale de `trucks.plate` (`:56`) por `routes.truck_id`, **dentro de la misma consulta** (25.5a):
`routes JOIN trucks ON routes.truck_id = trucks.id`. En el diagrama es un paso aparte porque la placa no
vive en `routes` y la convención es una lifeline por tabla; no es un round trip extra.

- **Parámetro de entrada:** `routeId` (number).
- **Parámetro de salida:** `routeDetailDto`.

**Tabla de atributos de routeDetailDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `routeId` | number | `@IsInt()` | Sí | `routes.id` (`:229`) |
| `distributorId` | number | `@IsInt()` | Sí | `routes.distributor_id` (migrada de `trips.distributor_id`, `:209`). **La columna no existe hoy** — hueco (9) |
| `encodePolyline` | string \| null | `@IsString()` `@IsOptional()` | No | `routes.encode_polyline` (`:244`). La **geometría** del trayecto, sin identidad de parada |
| `licensePlate` | string | `@IsString()` | Sí | `trucks.plate` (`:56`) vía `routes.truck_id`, resuelta en 25.5a |
| `nameDriverEmployee` | string | `@IsString()` | Sí | `routes.name_driver_employee` (migrada de `:211`) |
| `driverEmployeeId` | number \| null | `@IsInt()` `@IsOptional()` | No | `routes.driver_employee_id` (migrada de `:210`). Es el `employeeId` que audita cada ping |
| `transportStatus` | string | `@IsString()` | Sí | Estado de la salida (`routes.transport_status`, heredado de `trips.status`, `:214`) |
| `departureDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `routes.departure_date` (migrada de `:215`) |
| `completedDate` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `routes.completed_date` (migrada de `:216`) |
| `etaTotalDistanceM` | number \| null | `@IsNumber()` `@IsOptional()` | No | `routes.eta_total_distance_m` (`:238`) |
| `etaTotalTimeS` | number \| null | `@IsNumber()` `@IsOptional()` | No | `routes.eta_total_time_s` (`:239`) |

**El color con el que se pinta el recorrido no está acá y no está en ninguna tabla**: sale de la UI del
planificador. Es el hueco (11) de `Frontend.md`, y se nota justo en esta pantalla — es lo único que ata
visualmente al mismo camión entre planificación y monitoreo.

**Ejemplo JSON (retorno de 25.5 + 25.5a)**

```json
{
  "routeId": 512,
  "distributorId": 1,
  "encodePolyline": "}_o~F~ps|U_ulLnnqC_mqNvxq`@",
  "licensePlate": "3456-ABC",
  "nameDriverEmployee": "Carlos Mamani",
  "driverEmployeeId": 456,
  "transportStatus": "EN_RUTA",
  "departureDate": "2026-07-16T08:00:00.000Z",
  "completedDate": null,
  "etaTotalDistanceM": 48250.00,
  "etaTotalTimeS": 9600.00
}
```

#### D. findRouteDeliveryPoints(routeId) 25.6

Función responsable del **orden de visita**. `route_delivery_points.sequence` (`:262`) es el número que
se dibuja en cada pin, el que ordena el panel de paradas y el que define el corte de "hecho vs
pendiente". Sin este paso hay paradas pero no hay recorrido.

- **Parámetro de entrada:** `routeId` (number).
- **Parámetro de salida:** `routeStopDto[]`.

**Tabla de atributos de routeStopDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `routeDeliveryPointId` | number | `@IsInt()` | Sí | `route_delivery_points.id` (`:259`) |
| `dispatchDeliveryPointId` | number | `@IsInt()` | Sí | `:261`, `NOT NULL` con FK. Es el pivote con la parada planificada |
| `sequence` | number | `@IsInt()` | Sí | `:262`, `NOT NULL`. **El número del pin** |
| `estimatedDistanceM` | number \| null | `@IsNumber()` `@IsOptional()` | No | `:264` — metros HACIA este punto, no acumulados |
| `estimatedTravelS` | number \| null | `@IsNumber()` `@IsOptional()` | No | `:265` — segundos de viaje hacia este punto |
| `estimatedTotalCost` | number \| null | `@IsNumber()` `@IsOptional()` | No | `:269` |
| `isActive` | boolean | `@IsBoolean()` | Sí | `:267`. Una parada desactivada del plan **no se dibuja** |

**Ejemplo JSON (retorno de 25.6)**

```json
[
  {
    "routeDeliveryPointId": 88301,
    "dispatchDeliveryPointId": 4021,
    "sequence": 1,
    "estimatedDistanceM": 5400.00,
    "estimatedTravelS": 780.00,
    "estimatedTotalCost": 42.50,
    "isActive": true
  },
  {
    "routeDeliveryPointId": 88302,
    "dispatchDeliveryPointId": 4022,
    "sequence": 2,
    "estimatedDistanceM": 3120.00,
    "estimatedTravelS": 540.00,
    "estimatedTotalCost": 24.10,
    "isActive": true
  },
  { "...": "..." }
]
```

#### E. findDispatchPoints(dispatchDeliveryPointIds) 25.7

Función responsable de la **parada planificada**: quién es el cliente, en qué ventana recibe y cuánto
pesa lo que le toca (`dispatch_delivery_points`, `:131-160`). Se llama **una vez con el arreglo de ids**
que devolvió 25.6, no una vez por parada: con 20 paradas serían 20 consultas para traer 20 filas de la
misma tabla.

- **Parámetro de entrada:** `dispatchDeliveryPointIds` (number[]).
- **Parámetro de salida:** `dispatchPointDto[]`.

**Tabla de atributos de dispatchPointDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `dispatchDeliveryPointId` | number | `@IsInt()` | Sí | `dispatch_delivery_points.id` (`:132`) |
| `deliveryPointId` | number | `@IsInt()` | Sí | `:135`, `NOT NULL` **sin FK**: apunta al maestro EXTERNO. Es la clave con la que 25.8 pide las coordenadas |
| `customerName` | string | `@IsString()` | Sí | `:138` — desnormalizado del maestro |
| `deliveryWindowStart` | string | `@IsString()` | Sí | `:144`, tipo `TIME` → `HH:mm` |
| `deliveryWindowEnd` | string | `@IsString()` | Sí | `:145`, tipo `TIME` → `HH:mm` |
| `totalWeightKg` | number | `@IsNumber()` | Sí | `:146`. Es una **SUMA** de los pedidos de la parada |
| `totalVolumeM3` | number | `@IsNumber()` | Sí | `:147`. Ídem |

**No trae `latitude` ni `longitude`, y no es un olvido de este documento: la tabla no las tiene.**
Es el paso 25.8.

**Ejemplo JSON (retorno de 25.7)**

```json
[
  {
    "dispatchDeliveryPointId": 4021,
    "deliveryPointId": 45,
    "customerName": "Casa La Ramada",
    "deliveryWindowStart": "08:00",
    "deliveryWindowEnd": "12:00",
    "totalWeightKg": 620.40,
    "totalVolumeM3": 2.30
  },
  { "...": "..." }
]
```

#### F. findCandidateOrders(dispatchDeliveryPointIds) 25.7a

Función responsable del **enriquecimiento de planificación** de los pedidos que cada parada agrupa. La
pregunta que resuelve es útil para la UI —*de qué documento de ventas vino esta parada*—, pero **no**
define la identidad operativa del pedido monitoreado. Esa identidad sale de `delivery_order_sales`; ver
*F.1*.

La parada no es un pedido, agrupa N. El camión frena una vez y baja los tres pedidos de ese cliente.

Se llama con el mismo arreglo de ids que 25.7 y se agrupa por `dispatch_delivery_point_id` (`:178`).

- **Parámetro de entrada:** `dispatchDeliveryPointIds` (number[]).
- **Parámetro de salida:** `pedidoDto[]`, indexado por parada.

**Tabla de atributos de pedidoDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `candidateOrderId` | number | `@IsInt()` | Sí | `candidate_orders.id` (`:177`) |
| `dispatchDeliveryPointId` | number | `@IsInt()` | Sí | `:178`. La parada a la que pertenece |
| `salesOrderId` | string | `@IsString()` | Sí | `:179`, `NOT NULL` — el número con el que Ventas lo conoce |
| `documentId` | string | `@IsString()` | Sí | `:180`, `NOT NULL` — el documento SAP |
| `totalWeightKg` | number | `@IsNumber()` | Sí | `:185` |
| `totalVolumeM3` | number | `@IsNumber()` | Sí | `:186` |
| `typeMovement` | string \| null | `@IsString()` `@IsOptional()` | No | `:188`. Distingue venta de devolución o traslado |
| `total` | number | `@IsNumber()` | Sí | **Monto en Bs. NO ES UNA COLUMNA**: `candidate_orders` (`:176-203`) guarda peso y volumen y ningún monto. Viene del pedido de SAP |
| `formaPago` | string | `@IsString()` | Sí | `Contado` / `Crédito` / `Transferencia`. **Tampoco es columna**: viene del pedido de SAP. Es lo que decide qué se cobra en el punto (ver `cobroDto`) |

Las dos últimas filas son la razón por la que la pestaña *Cobro* está marcada como propuesta: los dos
únicos datos con los que se puede construir un cobro **entran por SAP y no por nuestro esquema**.

**Ejemplo JSON (retorno de 25.7a)**

```json
[
  {
    "candidateOrderId": 7781,
    "dispatchDeliveryPointId": 4021,
    "salesOrderId": "SO-88213",
    "documentId": "1000026565",
    "totalWeightKg": 320.40,
    "totalVolumeM3": 1.10,
    "typeMovement": "VENTA",
    "total": 1592.67,
    "formaPago": "Contado"
  },
  {
    "candidateOrderId": 7782,
    "dispatchDeliveryPointId": 4021,
    "salesOrderId": "SO-88240",
    "documentId": "1000026571",
    "totalWeightKg": 300.00,
    "totalVolumeM3": 1.20,
    "typeMovement": "VENTA",
    "total": 980.00,
    "formaPago": "Crédito"
  },
  { "...": "..." }
]
```

#### F.1 Ajuste de modelo — el pedido monitoreado sale de `delivery_order_sales`

Desde el esquema vigente, la vista *por pedido* del monitoreo debe tomar como **fuente de verdad**
`delivery_order_sales` (`../../../db_script.sql:594-608` en el repo actual), no `candidate_orders`.
La razón es simple:

- `candidate_orders` modela el pedido en **planificación**.
- `delivery_order_sales` modela el pedido ya **asignado a una parada ejecutable**.
- `delivery_payment_references` y `delivery_order_items` cuelgan de `delivery_order_sale_id`, así que
  el detalle real de cobros e ítems ya usa esa identidad.

Si el diagrama se vuelve a dibujar, entre `25.9 findDeliveriesByOrder(...)` y el actual `25.9a` debería
aparecer un paso lógico:

`findDeliveryOrderSalesByDeliveryIds(deliveryOrderIds)` → Delivery Order Sales DB

Ese paso devuelve la base del `pedidoDto` monitoreado; `25.7a` queda como enriquecimiento opcional por
`salesOrderId` / `dispatchDeliveryPointId`, útil para completar `documentId`, `typeMovement`, peso y
volumen si todavía no están resueltos en última milla.

**Forma recomendada del pedido monitoreado (`pedidoDto`)**

| Atributo | Oblig. | Origen |
|---|---|---|
| `deliveryOrderSaleId` | Sí | `delivery_order_sales.id` |
| `deliveryOrderId` | Sí | `delivery_order_sales.delivery_order_id` |
| `salesOrderId` | Sí | `delivery_order_sales.sale_order_id` |
| `companyCode` | No | `delivery_order_sales.company_code` |
| `invoiceId` | No | `delivery_order_sales.invoice_id` |
| `totalInvoice` | Sí | `delivery_order_sales.total_invoice` |
| `candidateOrderId` | No | Enriquecimiento opcional desde `candidate_orders.id` |
| `documentId` | No | Enriquecimiento opcional desde `candidate_orders.document_id` |
| `typeMovement` | No | Enriquecimiento opcional desde `candidate_orders.type_movement` |
| `totalWeightKg` / `totalVolumeM3` | No | Enriquecimiento opcional desde `candidate_orders` |
| `paymentType` | No | Enriquecimiento externo si todavía no existe columna local |

**Consecuencia para el contrato web:** si se expone una tabla plana de pedidos, el snapshot recomendado
es un endpoint proyectado propio — por ejemplo `GET /monitoring/order-sales?distributorId={id}` —, pero
el detalle de la orden puede seguir trayendo `paradas[].pedidos[]` en la respuesta de `25.11`.
**No hace falta un stream SSE nuevo por pedido**: la proyección se actualiza con los mismos eventos de
ruta, orden y parada.

#### G. 01 DeliveryPoint (servicio externo) 25.8

**Este paso es el que hace posible el mapa, y es el único del módulo que sale del microservicio.**
`dispatch_delivery_points` **no tiene `latitude` ni `longitude`** (`:131-160`): el puntero es
`delivery_point_id` (`:135`), un `BIGINT` sin FK porque el maestro es externo. Sin esta llamada no hay
pines, ni encuadre, ni trazo que cortar.

Es **una sola llamada por lote**, con los `deliveryPointId` de todas las paradas de la orden — no una
por pin. El contrato es el del snapshot **01 DeliveryPoint** documentado al principio de este documento.

**Ejemplo JSON (entrada de 25.8)**

```json
{
  "deliveryPointId": [45, 46, 51, 78],
  "ownerId": 4,
  "customerId": null
}
```

**Ejemplo JSON (retorno de 25.8)**

```json
[
  {
    "deliveryPointId": 45,
    "ownerId": 4,
    "ownerName": "Cliente padre 1",
    "customerId": 78,
    "customerName": "Cliente hijo 2",
    "latitud": -17.786510,
    "longitud": -63.174220
  },
  { "...": "..." }
]
```

Las claves `latitud` / `longitud` van **en español y sin normalizar** a propósito: son las del servicio
externo tal como están especificadas en *Servicios Externos de los Snapshots*. Renombrarlas acá haría
creer que el contrato es nuestro. El DTO de salida de la pantalla sí las expone como
`latitude` / `longitude`, y la traducción ocurre en 25.11.

##### ¿No se resolvieron antes? Hay TRES tratamientos distintos de la misma dependencia

La pregunta natural es si esto no se hizo ya en la planificación, o si no hay una tabla de snapshot
donde buscarlas. La respuesta corta es que **no hay ninguna tabla**, y la larga es que la documentación
del proyecto trata esta misma dependencia de tres formas que no coinciden:

| Dónde | Cómo la resuelve | Evidencia |
|---|---|---|
| **Este documento** (monitoreo, 25.8) | **Servicio externo, por LOTE**: una llamada con todos los `deliveryPointId` de la orden | *Servicios Externos de los Snapshots* → `01 Delivery Point` |
| **Doc oficial § 08** *Obtener Puntos de entregas* (planificación) | Entidad **`delivery_point DB`** —una "tabla externa"— resuelta **en un LOOP, un registro por vez**: *"Obtención de Datos en Bucle (Loop 8.4 - 8.5) … `groupByDeliveryPoint(deliveryPointId)` (8.4): obtiene los detalles geográficos y de ubicación de la entidad `delivery_point DB`"* | `Documento Tecnico v1 (7).pdf`, § 08 |
| **Doc oficial § 21-22** (conteo a ciegas) | Una **tabla local de snapshot**: *"los cruza con el catálogo de (`product_snapshot`)"*, y las tablas descriptivas citan `product_snapshot.product_id` como *"Campo Equivalente en BD"* | Ídem, § 21 y 22 |

Tres consecuencias concretas:

1. **La planificación SÍ resuelve las coordenadas antes** —las necesita para pintar su propio mapa— pero
   **no las guarda**: `dispatch_delivery_points` (`:131-160`) no tiene columnas de posición. Así que el
   monitoreo no puede reusar ese trabajo y las pide de nuevo en cada apertura del detalle.
2. **El patrón de tabla snapshot ya existe en el proyecto, pero no en el esquema.** El doc oficial
   escribe contra `product_snapshot` como si fuera una tabla, y `../../UltimaVersion.sql` declara
   **23 tablas y ninguna es un snapshot**. O sea que el precedente para hacer lo mismo con los puntos de
   entrega (`delivery_point_snapshot`) está tomado, y le falta bajar al esquema igual que a este.
3. **El § 08 lo hace en un loop por registro.** Con 60 paradas en un plan son 60 idas a una fuente
   externa. Este documento especifica el lote a propósito, y esa diferencia hay que resolverla en una
   dirección u otra: no puede ser que la misma dependencia sea un `N+1` en planificación y una llamada
   por lote en monitoreo.

**Qué hay que decidir** (es el hueco (4), acá con las tres opciones sobre la mesa):

- **(a) Al vuelo, por lote** —lo que este documento especifica—: el dato vive donde pertenece, una
  ubicación de cliente no cambia por despacho, y el costo es una llamada externa en el camino crítico de
  la pantalla.
- **(b) Desnormalizar en `dispatch_delivery_points`** al armar el plan: dos columnas más, la ubicación
  queda **congelada tal como estaba ese día** —que para una entrega es lo correcto: si el cliente se
  mudó, la parada de ayer se hizo en la dirección de ayer—, y el monitoreo deja de depender de un
  servicio externo para dibujar el mapa.
- **(c) Una tabla `delivery_point_snapshot`**, como el `product_snapshot` que el doc oficial ya usa:
  resuelve las dos pantallas de una vez y se refresca cuando el maestro cambie.

Este documento no la resuelve, pero deja de ser una pregunta abierta sin datos: **(b)** es la que le
saca la dependencia externa al camino crítico del mapa, y **(c)** la que además arregla el `N+1` del
§ 08.

**Qué pasa si falla:** es la decisión que hay que tomar antes de implementar. Sin coordenadas la
pantalla no puede dibujar el mapa, pero **sí** puede dibujar el panel de paradas, los estados y toda la
evidencia. Las dos salidas defendibles son degradar (mapa vacío con aviso, lista completa) o `500`. Este
documento no la resuelve; la declara.

#### H. findDeliveriesByOrder(transportOrderId) 25.9

Función responsable de las **entregas**: `delivery_orders` (`:381-406`) es el cruce de la orden con cada
parada, y es lo que el chofer ejecuta. Una fila por parada de esta orden.

- **Parámetro de entrada:** `transportOrderId` (number).
- **Parámetro de salida:** `deliveryRowDto[]`.

**Tabla de atributos de deliveryRowDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `deliveryOrderId` | number | `@IsInt()` | Sí | `delivery_orders.id` (`:382`). **Es la clave con la que el cliente parchea** los eventos de entrega |
| `dispatchDeliveryPointId` | number | `@IsInt()` | Sí | El pivote con la parada planificada |
| `status` | string | `@IsString()` | Sí | `:392` — estado de la entrega |
| `arrivedAt` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `:395` — cuándo marcó la llegada |
| `deliveredAt` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `:396` — cuándo cerró |
| `arrivalLatitude` | number \| null | `@IsLatitude()` `@IsOptional()` | No | `:393`. **Dónde marcó la llegada**, no dónde está el camión ni dónde está el cliente |
| `arrivalLongitude` | number \| null | `@IsLongitude()` `@IsOptional()` | No | `:394` |
| `receiverName` | string \| null | `@IsString()` `@IsOptional()` | No | `receiver_name`. **Duplicado** con `proof_of_deliveries.receiver_name` — hueco (3) de `Frontend.md` |
| `deliveryResultCode` | string \| null | `@IsString()` `@IsOptional()` | No | `:391`, `-- POR DEFINIR`. El motivo, solo cuando no se entregó |

**Ejemplo JSON (retorno de 25.9)**

```json
[
  {
    "deliveryOrderId": 90112,
    "dispatchDeliveryPointId": 4021,
    "status": "DELIVERED",
    "arrivedAt": "2026-07-16T08:25:00.000Z",
    "deliveredAt": "2026-07-16T08:34:00.000Z",
    "arrivalLatitude": -17.786498,
    "arrivalLongitude": -63.174241,
    "receiverName": "La Ramada",
    "deliveryResultCode": null
  },
  {
    "deliveryOrderId": 90113,
    "dispatchDeliveryPointId": 4022,
    "status": "FAILED",
    "arrivedAt": "2026-07-16T09:02:00.000Z",
    "deliveredAt": "2026-07-16T09:11:00.000Z",
    "arrivalLatitude": -17.771002,
    "arrivalLongitude": -63.160877,
    "receiverName": null,
    "deliveryResultCode": "CLIENTE_AUSENTE"
  },
  { "...": "..." }
]
```

#### I. findItemsByDeliveryIds(deliveryOrderIds) 25.9a

Función responsable de los **productos consolidados** de cada parada — la pestaña *Pedido*, mitad de
abajo. Se llama **una vez con el arreglo de `deliveryOrderId`**, no una por parada: son 20 consultas
contra una.

Es el consolidado POR PRODUCTO, no por pedido: si el cliente pidió el mismo aceite en dos pedidos
distintos, el chofer baja una sola cantidad. Por eso la pestaña muestra primero los pedidos (25.7a) y
después esto — si mostrara solo productos, se perdería de vista que la parada junta tres documentos.

- **Parámetro de entrada:** `deliveryOrderIds` (number[]).
- **Parámetro de salida:** `itemDto[]`, indexado por `deliveryOrderId`.

**Tabla de atributos de itemDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `deliveryOrderItemId` | number | `@IsInt()` | Sí | `delivery_order_items.id` (`:412`) |
| `deliveryOrderId` | number | `@IsInt()` | Sí | La entrega a la que pertenece |
| `productId` | number | `@IsInt()` | Sí | `:414`. El nombre y la unidad los resuelve el snapshot **Product**, no una tabla local |
| `plannedQty` | number | `@IsNumber()` | Sí | Lo que el plan asignó |
| `loadedQty` | number | `@IsNumber()` | Sí | Lo que subió al camión. `loaded < planned` es un **faltante de carga** |
| `deliveredQty` | number | `@IsNumber()` | Sí | Lo que bajó |
| `returnedQty` | number | `@IsNumber()` | Sí | Lo que volvió. En una parada cerrada, `delivered + returned` tiene que dar `loaded` |
| `itemStatus` | string \| null | `@IsString()` `@IsOptional()` | No | Estado por línea |

**No hay columna de desvío.** `delivery_order_items` no tiene el equivalente de
`truck_inventories.variance_qty` (`:362`): el faltante se deduce restando `planned - loaded`, y si
alguna vez hay que auditarlo hace falta la columna.

**Ejemplo JSON (retorno de 25.9a)**

```json
[
  {
    "deliveryOrderItemId": 55201,
    "deliveryOrderId": 90112,
    "productId": 78,
    "plannedQty": 24,
    "loadedQty": 24,
    "deliveredQty": 24,
    "returnedQty": 0,
    "itemStatus": "DELIVERED"
  },
  {
    "deliveryOrderItemId": 55202,
    "deliveryOrderId": 90112,
    "productId": 91,
    "plannedQty": 12,
    "loadedQty": 10,
    "deliveredQty": 10,
    "returnedQty": 0,
    "itemStatus": "DELIVERED"
  },
  { "...": "..." }
]
```

#### J. findIncidentsByDeliveryIds(deliveryOrderIds) 25.9b

Función responsable de las **incidencias** — la pestaña *Incidencias*. Una llamada con el arreglo de ids.
Lo normal es que devuelva vacío: una incidencia es la excepción, y una parada que falló casi siempre
tiene una.

- **Parámetro de entrada:** `deliveryOrderIds` (number[]).
- **Parámetro de salida:** `incidenciaDto[]`, indexado por `deliveryOrderId`.

**Tabla de atributos de incidenciaDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `incidentId` | number | `@IsInt()` | Sí | `delivery_incidents.id` (`:458`) |
| `deliveryOrderId` | number | `@IsInt()` | Sí | `:459`, `NOT NULL` con FK. **Solo cuelga de una ENTREGA**: no hay incidencias de la salida (camión averiado, calle cortada) — hueco (2) de `Frontend.md` |
| `incidentCode` | string \| null | `@IsString()` `@IsOptional()` | No | `:460`, `-- POR DEFINIR` |
| `incidentType` | string | `@IsString()` | Sí | `:461` |
| `severity` | string | `@IsString()` | Sí | `:462`, `-- POR DEFINIR`. Sin catálogo el panel las **cuenta** pero no las puede clasificar, que es lo que decide a quién llamar primero |
| `description` | string \| null | `@IsString()` `@IsOptional()` | No | `:463` |
| `photoUrl` | string \| null | `@IsString()` `@IsOptional()` | No | `:464`, TEXT. **La foto es la prueba**: sin ella "producto dañado" es la palabra del chofer contra la del cliente |
| `requiresReturn` | boolean | `@IsBoolean()` | Sí | `:465` |
| `resolutionStatus` | string \| null | `@IsString()` `@IsOptional()` | No | `:466`. Hoy la pantalla no lo muestra |
| `resolvedAt` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `:467` |
| `createdAt` | string | `@IsISO8601()` | Sí | `:471` |

**Ejemplo JSON (retorno de 25.9b)**

```json
[
  {
    "incidentId": 3301,
    "deliveryOrderId": 90113,
    "incidentCode": null,
    "incidentType": "Producto dañado",
    "severity": "alta",
    "description": "Producto dañado reportado por el chofer en el punto.",
    "photoUrl": "https://cdn.example/incidents/3301.jpg",
    "requiresReturn": true,
    "resolutionStatus": null,
    "resolvedAt": null,
    "createdAt": "2026-07-16T09:08:00.000Z"
  },
  { "...": "..." }
]
```

#### K. findPodsByDeliveryIds(deliveryOrderIds) 25.9c

Función responsable del **comprobante** — la pestaña *Comprobante*. Una llamada con el arreglo de ids.
Solo la entrega efectiva deja comprobante: un "no entregado" no tiene firma ni receptor, así que este
paso devuelve **menos filas que entregas** y eso es correcto.

- **Parámetro de entrada:** `deliveryOrderIds` (number[]).
- **Parámetro de salida:** `comprobanteDto[]`, indexado por `deliveryOrderId` (0 o 1 por entrega).

**Tabla de atributos de comprobanteDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `podId` | number | `@IsInt()` | Sí | `proof_of_deliveries.id` (`:432`) |
| `deliveryOrderId` | number | `@IsInt()` | Sí | `:433`, `NOT NULL` con FK |
| `receiverName` | string | `@IsString()` | Sí | `:434` |
| `receiverDocument` | string \| null | `@IsString()` `@IsOptional()` | No | `:435` |
| `signatureUrl` | string \| null | `@IsString()` `@IsOptional()` | No | `:436`, TEXT: **la URL, no el archivo**. `null` = cerró sin firma |
| `photoUrl` | string \| null | `@IsString()` `@IsOptional()` | No | `:437`, TEXT. `null` = cerró sin foto, que es un caso real y el panel lo dice |
| `gpsLat` | number \| null | `@IsLatitude()` `@IsOptional()` | No | `:438`. **Dónde se capturó la firma** — puede no ser la coordenada del maestro: el chofer firma en la puerta |
| `gpsLon` | number \| null | `@IsLongitude()` `@IsOptional()` | No | `:439` |
| `podStatus` | string \| null | `@IsString()` `@IsOptional()` | No | `:440`, `-- POR DEFINIR` |
| `podResultCode` | string \| null | `@IsString()` `@IsOptional()` | No | `:441`, `-- POR DEFINIR` |
| `deviceId` | number \| null | `@IsInt()` `@IsOptional()` | No | `:442`. **Un `BIGINT` que no apunta a ninguna tabla** — hueco (4) de `Frontend.md` |
| `capturedAt` | string | `@IsISO8601()` | Sí | `:443` — reloj del dispositivo |
| `uploadedAt` | string \| null | `@IsISO8601()` `@IsOptional()` | No | `:444` — reloj del servidor. Se separan cuando el celular subió sin cobertura: es el **mismo par** que `trackedAt`/`receivedAt` del ping |
| `notes` | string \| null | `@IsString()` `@IsOptional()` | No | `:445` |

**La evidencia se devuelve para MOSTRARSE, no para anunciarse.** El panel no dice "hay foto": abre la
foto y la firma. Un comprobante que no se puede abrir no sirve para lo único que se le pide, que es
contestarle al cliente que dice que no recibió la mercadería. Las dos URLs son el contrato; que en el
mock la firma se genere como SVG y las fotos salgan del maestro de puntos (`mock-fotos.ts`) es
implementación, no contrato.

**Ejemplo JSON (retorno de 25.9c)**

```json
[
  {
    "podId": 12044,
    "deliveryOrderId": 90112,
    "receiverName": "La Ramada",
    "receiverDocument": "6721394",
    "signatureUrl": "https://cdn.example/pod/12044-sign.svg",
    "photoUrl": "https://cdn.example/pod/12044.jpg",
    "gpsLat": -17.786492,
    "gpsLon": -63.174233,
    "podStatus": null,
    "podResultCode": null,
    "deviceId": 9041,
    "capturedAt": "2026-07-16T08:34:00.000Z",
    "uploadedAt": "2026-07-16T08:36:12.000Z",
    "notes": null
  },
  { "...": "..." }
]
```

#### L. findHistoriesByDeliveryIds(deliveryOrderIds) 25.9d

Función responsable del **timeline de cada entrega** — la pestaña *Historial*. Una llamada con el
arreglo de ids, ordenada por `created_at`.

Es la bitácora de la ENTREGA, no de la salida: el ciclo de vida del viaje (`departure_date` →
`completed_date`) **no tiene bitácora** en v0.0.3, porque vive en `routes` y esa tabla no tiene tabla de
histories. Es el hueco (12).

- **Parámetro de entrada:** `deliveryOrderIds` (number[]).
- **Parámetro de salida:** `eventoDto[]`, indexado por `deliveryOrderId`.

**Tabla de atributos de eventoDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `historyId` | number | `@IsInt()` | Sí | `delivery_order_histories.id` (`:480`) |
| `deliveryOrderId` | number | `@IsInt()` | Sí | `:481`, `NOT NULL` con FK |
| `status` | string | `@IsString()` | Sí | `:482`, `NOT NULL` |
| `reason` | string \| null | `@IsString()` `@IsOptional()` | No | `:483`. El motivo del cierre cuando no se entregó |
| `createdAt` | string | `@IsISO8601()` | Sí | `:487` |
| `createdBy` | string \| null | `@IsString()` `@IsOptional()` | No | `:485`. **Sin autor modelado**: `VARCHAR` libre, sin FK, y el mock no lo llena — hueco (10) de `Frontend.md`. Una bitácora sin autor no sirve para lo único que se le pide: "quién cerró esta entrega así" |

**Ejemplo JSON (retorno de 25.9d)**

```json
[
  {
    "historyId": 77010,
    "deliveryOrderId": 90112,
    "status": "PENDING",
    "reason": null,
    "createdAt": "2026-07-16T08:00:00.000Z",
    "createdBy": null
  },
  {
    "historyId": 77014,
    "deliveryOrderId": 90112,
    "status": "ARRIVED",
    "reason": null,
    "createdAt": "2026-07-16T08:25:00.000Z",
    "createdBy": null
  },
  {
    "historyId": 77019,
    "deliveryOrderId": 90112,
    "status": "DELIVERED",
    "reason": null,
    "createdAt": "2026-07-16T08:34:00.000Z",
    "createdBy": null
  },
  { "...": "..." }
]
```

#### M. query(PK=ROUTE#{routeId}) 25.10

Función responsable de la **última posición conocida** de la salida. Es la Query de la TRAZA, no la del
ítem ACTUAL:

```
Query  TableName = truck_tracking
       KeyConditionExpression = "pk = :pk"
       ExpressionAttributeValues = { ":pk": "ROUTE#512" }
       ScanIndexForward = false
       Limit = 1
```

**Por qué la traza y no el ítem ACTUAL**, si el ACTUAL es exactamente "la última posición": porque esta
pantalla también quiere el **recorrido real** (`Query PK` sin `Limit`, o `SK BETWEEN` dos horas), y el
ACTUAL no lo tiene — se pisa en cada ping. Con una sola partición se responden las dos preguntas. El
ítem ACTUAL existe para la otra pantalla, la que necesita 40 camiones en una Query (18.10).

Con `routeId = null` este paso **no se ejecuta**: no hay partición que consultar.

- **Parámetro de entrada:** `routeId` (number).
- **Parámetro de salida:** `trackingSnapshotDto` (o `null`).

**Ejemplo JSON (ítem crudo de la TRAZA que devuelve Dynamo)**

```json
{
  "pk": "ROUTE#512",
  "sk": "TS#2026-07-16T08:24:39.000Z",
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "employeeId": 456,
  "receivedAt": "2026-07-16T08:24:40.180Z",
  "expiresAt": 1786782279
}
```

**Ejemplo JSON (`trackingSnapshotDto`, ya resuelto para la pantalla)**

```json
{
  "routeId": 512,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
```

`pk` y `sk` **no se exponen**: el DTO lleva `routeId` ya des-compuesto y `trackedAt` sacado del prefijo
`TS#` de la `sk`. Filtrarlas acá evita que el frontend aprenda a parsear claves de Dynamo. `expiresAt` y
`employeeId` tampoco viajan: el TTL es interno y el chofer ya está en la cabecera.

#### N. buildDetail(...) 25.11

Función responsable de armar la respuesta: cruza las paradas del plan (25.6) con la parada planificada
(25.7), sus pedidos monitoreados (`delivery_order_sales`, ver F.1, con enriquecimiento opcional 25.7a),
sus coordenadas (25.8) y su entrega con las cuatro hijas (25.9 a 25.9d),
las ordena por `sequence` y agrega la cabecera, el progreso y el tracking.

**Tres cosas se DERIVAN acá y no salen de ninguna consulta**, y conviene tenerlas juntas porque son las
que alguien va a buscar en el esquema sin encontrarlas:

| Derivado | Cómo se calcula | Por qué no se guarda |
|---|---|---|
| `progress` | Conteo de `status` sobre las entregas de 25.9 | Guardarlo sería un contador que se desincroniza con la primera entrega que cierre |
| `outOfWindow` (por parada) | `deliveredAt` fuera de `deliveryWindowStart/End` | Ídem: es una comparación de dos datos que ya viajan |
| `cobro` | De `formaPago` y `total` de los pedidos (25.7a): contado y transferencia se cobran en el punto, el crédito no | **NO EXISTE LA TABLA.** No hay paso en la secuencia porque no hay nada que consultar — ver `cobroDto` |

El **corte de "hecho vs pendiente"** del mapa y del riel del panel también se deriva: es la última
entrega cerrada por `sequence`.

**Y el RECORRIDO que el mapa dibuja se compone acá**, con tres fuentes distintas:

```
recorrido = [ depósito (25.4a) , ...paradas por sequence (25.6 + 25.8) , depósito (25.4a) ]
```

El contrato devuelve las tres piezas por separado —`deposito`, `paradas[]` con sus coordenadas, y
`route.encodePolyline`— y **no** una lista de vértices ya armada. Es a propósito: `encode_polyline` es la
geometría real por calles que calculó el optimizador, y las coordenadas de las paradas son los pines. Si
el backend mandara una sola lista mezclada, el frontend no podría distinguir *"este vértice es una
esquina"* de *"este vértice es el cliente X"*.

**Ojo con la implementación de referencia**: el mock **no decodifica** la polilínea. Dibuja segmentos
rectos depósito → paradas → depósito (`viaje.recorrido` en `monitoreo-data.ts`), porque no hay ninguna
polilínea real que decodificar. `decodePolyline` existe en el proyecto (`src/mockup/map/geo/polyline.ts`)
y esta pantalla no lo usa. Lo que la aproximación NO puede validar, y hay que revisar con datos reales:
cuánto ocupa una ruta de verdad en pantalla, si el camión aparece "fuera" del trazo al interpolar, y el
costo de re-renderizar una polilínea de cientos de puntos en cada ping.

- **Parámetro de salida:** `monitoringOrderDetailDto`, que el Controller devuelve tal cual.

**Tabla de atributos de monitoringOrderDetailDto**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `order` | orderHeaderDto | `@ValidateNested()` | Sí | Cabecera del paso 25.4 |
| `deposito` | depositoDto | `@ValidateNested()` | Sí | El almacén, del join 25.4a. **El recorrido empieza y termina acá** |
| `route` | routeDetailDto \| null | `@ValidateNested()` `@IsOptional()` | No | La salida del paso 25.5. `null` si la orden no tiene ruta |
| `progress` | progressDto | `@ValidateNested()` | Sí | **Derivado**. Es el mismo DTO del listado (18.8); se recalcula acá porque esta pantalla es deep-linkeable y puede abrirse sin pasar por el listado |
| `tracking` | trackingSnapshotDto \| null | `@ValidateNested()` `@IsOptional()` | No | Paso 25.10. `null` si no salió, ya volvió, o no tiene ruta |
| `paradas` | paradaDetalleDto[] | `@ValidateNested({ each: true })` | Sí | Las paradas en orden de visita |

**Sub-DTO: paradaDetalleDto** — es el cruce de todo lo anterior. Una por parada.

| Atributo | Tipo TypeScript | Oblig. | Origen (paso) |
|---|---|---|---|
| `deliveryOrderId` | number | Sí | 25.9. **La clave con la que el cliente parchea** los eventos de entrega |
| `dispatchDeliveryPointId` | number | Sí | 25.6 / 25.7 |
| `deliveryPointId` | number | Sí | 25.7 — puntero al maestro externo |
| `sequence` | number | Sí | 25.6 |
| `customerName` | string | Sí | 25.7 |
| `latitude` / `longitude` | number | Sí | **25.8** (servicio externo), renombradas desde `latitud`/`longitud` |
| `deliveryWindowStart` / `deliveryWindowEnd` | string | Sí | 25.7 |
| `totalWeightKg` / `totalVolumeM3` | number | Sí | 25.7 |
| `estimatedDistanceM` / `estimatedTravelS` | number \| null | No | 25.6 |
| `status` | string | Sí | 25.9 |
| `arrivedAt` / `deliveredAt` | string \| null | No | 25.9 |
| `arrivalLatitude` / `arrivalLongitude` | number \| null | No | 25.9 |
| `receiverName` | string \| null | No | 25.9 |
| `deliveryResultCode` | string \| null | No | 25.9 |
| `outOfWindow` | boolean | Sí | **Derivado** en 25.11 |
| `pedidos` | pedidoDto[] | Sí | `delivery_order_sales` (F.1) + enriquecimiento opcional 25.7a |
| `items` | itemDto[] | Sí | 25.9a |
| `incidencias` | incidenciaDto[] | Sí | 25.9b. Vacío es lo normal |
| `comprobante` | comprobanteDto \| null | No | 25.9c. `null` si no se entregó |
| `historial` | eventoDto[] | Sí | 25.9d |
| `cobro` | cobroDto | Sí | **Derivado** en 25.11 — sin tabla |

**Sub-DTO: cobroDto — ⚠️ SIN RESPALDO EN EL ESQUEMA**

Se especifica porque la pantalla lo muestra, y se marca así porque **no hay ninguna tabla de cobros**.
No tiene paso en la secuencia: no hay nada que consultar.

| Atributo | Tipo | Origen |
|---|---|---|
| `montoTotal` | number | Suma de `pedidos[].total` (25.7a) — **del pedido de SAP**, no de una columna |
| `montoCobrable` | number | **Derivado**: suma de los pedidos con `formaPago` distinta de `Crédito`. Regla del negocio, no del esquema |
| `montoCobrado` | number | **NO EXISTE** |
| `estado` | string | **NO EXISTE** — `cobrado` / `parcial` / `pendiente` / `no_corresponde` |
| `moneda` | string | `BOB`. Constante hoy: no hay columna de moneda en ninguna parte |
| `recibo` | string \| null | **NO EXISTE** (`receipt_number`) |
| `cobradoAt` | string \| null | **NO EXISTE** (`collected_at`) |

Para que esto sea implementable hace falta una tabla por entrega —`delivery_payments`
(`delivery_order_id`, `method`, `amount`, `currency`, `receipt_number`, `collected_by`,
`collected_at`)— y decidir si el monto se desnormaliza en `candidate_orders` al armar el plan o se
resuelve por servicio contra SAP. **Mientras no exista, el `cobroDto` es una propuesta**, y la pantalla
lo dice en pantalla.

**Ejemplo JSON (Response completa, dos paradas de las N)**

Una parada entregada con su comprobante y su cobro, y una fallida con su incidencia y sin comprobante:

```json
{
  "success": true,
  "code": 200,
  "data": {
    "order": {
      "transportOrderId": 4471,
      "code": "OT-2026-004471",
      "distributorId": 1,
      "routeId": 512,
      "orderStatus": "DISPATCHED",
      "assignedWeightKg": 3480.50,
      "assignedVolumeM3": 14.20
    },
    "deposito": {
      "distributorId": 1,
      "name": "Planta Santa Cruz",
      "latitude": -17.771200,
      "longitude": -63.142100
    },
    "route": {
      "routeId": 512,
      "distributorId": 1,
      "encodePolyline": "}_o~F~ps|U_ulLnnqC_mqNvxq`@",
      "licensePlate": "3456-ABC",
      "nameDriverEmployee": "Carlos Mamani",
      "driverEmployeeId": 456,
      "transportStatus": "EN_RUTA",
      "departureDate": "2026-07-16T08:00:00.000Z",
      "completedDate": null,
      "etaTotalDistanceM": 48250.00,
      "etaTotalTimeS": 9600.00
    },
    "progress": {
      "total": 6,
      "delivered": 1,
      "failed": 1,
      "returned": 0,
      "pending": 4,
      "progressPct": 33,
      "incidents": 1,
      "outOfWindow": 0
    },
    "tracking": {
      "routeId": 512,
      "latitude": -17.783412,
      "longitude": -63.181245,
      "battery": 74,
      "trackedAt": "2026-07-16T08:24:39.000Z",
      "receivedAt": "2026-07-16T08:24:40.180Z"
    },
    "paradas": [
      {
        "deliveryOrderId": 90112,
        "dispatchDeliveryPointId": 4021,
        "deliveryPointId": 45,
        "sequence": 1,
        "customerName": "Casa La Ramada",
        "latitude": -17.786510,
        "longitude": -63.174220,
        "deliveryWindowStart": "08:00",
        "deliveryWindowEnd": "12:00",
        "totalWeightKg": 620.40,
        "totalVolumeM3": 2.30,
        "estimatedDistanceM": 5400.00,
        "estimatedTravelS": 780.00,
        "status": "DELIVERED",
        "arrivedAt": "2026-07-16T08:25:00.000Z",
        "deliveredAt": "2026-07-16T08:34:00.000Z",
        "arrivalLatitude": -17.786498,
        "arrivalLongitude": -63.174241,
        "receiverName": "La Ramada",
        "deliveryResultCode": null,
        "outOfWindow": false,
        "pedidos": [
          {
            "candidateOrderId": 7781,
            "dispatchDeliveryPointId": 4021,
            "salesOrderId": "SO-88213",
            "documentId": "1000026565",
            "totalWeightKg": 320.40,
            "totalVolumeM3": 1.10,
            "typeMovement": "VENTA",
            "total": 1592.67,
            "formaPago": "Contado"
          },
          { "...": "..." }
        ],
        "items": [
          {
            "deliveryOrderItemId": 55201,
            "deliveryOrderId": 90112,
            "productId": 78,
            "plannedQty": 24,
            "loadedQty": 24,
            "deliveredQty": 24,
            "returnedQty": 0,
            "itemStatus": "DELIVERED"
          },
          { "...": "..." }
        ],
        "incidencias": [],
        "comprobante": {
          "podId": 12044,
          "deliveryOrderId": 90112,
          "receiverName": "La Ramada",
          "receiverDocument": "6721394",
          "signatureUrl": "https://cdn.example/pod/12044-sign.svg",
          "photoUrl": "https://cdn.example/pod/12044.jpg",
          "gpsLat": -17.786492,
          "gpsLon": -63.174233,
          "podStatus": null,
          "podResultCode": null,
          "deviceId": 9041,
          "capturedAt": "2026-07-16T08:34:00.000Z",
          "uploadedAt": "2026-07-16T08:36:12.000Z",
          "notes": null
        },
        "historial": [
          {
            "historyId": 77010,
            "deliveryOrderId": 90112,
            "status": "PENDING",
            "reason": null,
            "createdAt": "2026-07-16T08:00:00.000Z",
            "createdBy": null
          },
          {
            "historyId": 77019,
            "deliveryOrderId": 90112,
            "status": "DELIVERED",
            "reason": null,
            "createdAt": "2026-07-16T08:34:00.000Z",
            "createdBy": null
          }
        ],
        "cobro": {
          "montoTotal": 1592.67,
          "montoCobrable": 1592.67,
          "montoCobrado": 1592.67,
          "estado": "cobrado",
          "moneda": "BOB",
          "recibo": "REC-418302",
          "cobradoAt": "2026-07-16T08:34:00.000Z"
        }
      },
      {
        "deliveryOrderId": 90113,
        "dispatchDeliveryPointId": 4022,
        "deliveryPointId": 46,
        "sequence": 2,
        "customerName": "Mercado Los Pozos",
        "latitude": -17.771002,
        "longitude": -63.160877,
        "deliveryWindowStart": "08:00",
        "deliveryWindowEnd": "13:00",
        "totalWeightKg": 410.00,
        "totalVolumeM3": 1.80,
        "estimatedDistanceM": 3120.00,
        "estimatedTravelS": 540.00,
        "status": "FAILED",
        "arrivedAt": "2026-07-16T09:02:00.000Z",
        "deliveredAt": "2026-07-16T09:11:00.000Z",
        "arrivalLatitude": -17.771002,
        "arrivalLongitude": -63.160877,
        "receiverName": null,
        "deliveryResultCode": "CLIENTE_AUSENTE",
        "outOfWindow": false,
        "pedidos": [
          {
            "candidateOrderId": 7790,
            "dispatchDeliveryPointId": 4022,
            "salesOrderId": "SO-88301",
            "documentId": "1000026588",
            "totalWeightKg": 410.00,
            "totalVolumeM3": 1.80,
            "typeMovement": "VENTA",
            "total": 2240.00,
            "formaPago": "Contado"
          }
        ],
        "items": [
          {
            "deliveryOrderItemId": 55240,
            "deliveryOrderId": 90113,
            "productId": 78,
            "plannedQty": 18,
            "loadedQty": 18,
            "deliveredQty": 0,
            "returnedQty": 18,
            "itemStatus": "RETURNED"
          }
        ],
        "incidencias": [
          {
            "incidentId": 3301,
            "deliveryOrderId": 90113,
            "incidentCode": null,
            "incidentType": "Rechazo del cliente",
            "severity": "alta",
            "description": "Local cerrado, nadie recibe.",
            "photoUrl": "https://cdn.example/incidents/3301.jpg",
            "requiresReturn": true,
            "resolutionStatus": null,
            "resolvedAt": null,
            "createdAt": "2026-07-16T09:08:00.000Z"
          }
        ],
        "comprobante": null,
        "historial": [
          {
            "historyId": 77031,
            "deliveryOrderId": 90113,
            "status": "ARRIVED",
            "reason": null,
            "createdAt": "2026-07-16T09:02:00.000Z",
            "createdBy": null
          },
          {
            "historyId": 77035,
            "deliveryOrderId": 90113,
            "status": "FAILED",
            "reason": "CLIENTE_AUSENTE",
            "createdAt": "2026-07-16T09:11:00.000Z",
            "createdBy": null
          }
        ],
        "cobro": {
          "montoTotal": 2240.00,
          "montoCobrable": 2240.00,
          "montoCobrado": 0,
          "estado": "pendiente",
          "moneda": "BOB",
          "recibo": null,
          "cobradoAt": null
        }
      },
      { "...": "..." }
    ]
  }
}
```

**Ejemplo JSON (`404`, la orden no existe)**

```json
{
  "success": false,
  "code": 404,
  "message": "La orden de transporte 999999 no existe."
}
```

---

## 25.12-25.19 Stream del detalle (SSE)

### Endpoint.

**Tipo:** (HTTP) GET /monitoring/orders/{transportOrderId}/stream

Mantener la pantalla al día enviando **solo lo que cambió**. Mismo patrón que el listado —snapshot una
vez, deltas por SSE— y misma envoltura de cable (cabeceras, `id:`/`event:`/`data:`, heartbeat cada
~15 s): está en *18.16-18.19*, no se repite.

La diferencia con el listado es la **granularidad**: acá el `tracking` va **ping por ping**, sin
agrupar, porque cada posición mueve el pin. Agrupar a 30 s en esta pantalla dejaría el camión a saltos.

**Y la vista por pedido NO abre un tercer stream ni introduce un evento nuevo.** Es una proyección del
mismo estado vivo:

- `tracking` afecta a todas las filas hijas de la misma `routeId`,
- `delivery_*` afecta a todas las filas hijas del mismo `deliveryOrderId`,
- `payment_*` —si esta pantalla muestra la pestaña Cobro en tiempo real— afecta a una fila de pago y,
  a nivel pedido, a un `deliveryOrderSaleId`.

### La suscripción tiene DOS scopes 25.14

Es la consecuencia más incómoda de v0.0.3 y conviene tenerla escrita:

```
subscribe(ROUTE#{routeId})              → tracking
subscribe(ORDER#{transportOrderId})     → delivery_started · delivery_closed
```

**Una sola conexión, dos scopes**, porque los eventos son hechos de dos entidades distintas: la posición
es del CAMIÓN (la ruta) y la entrega es de la ORDEN. Colapsarlos en uno obligaría a que el publisher
tradujera de ruta a órdenes consultando Postgres en el camino de cada ping (19.7), o a que el ping se
publicara N veces.

Con `routeId = null` se abre igual, solo con el scope de la orden: una orden sin ruta puede recibir
eventos de entrega, no de posición.

### Eventos de este stream

| Evento | Cadencia | Clave del payload | Payload |
|---|---|---|---|
| `tracking` | Ping por ping | `routeId` | `trackingSnapshotDto` |
| `delivery_started` | Al instante | `deliveryOrderId` | Llegada al punto (`arrived_at`) |
| `delivery_closed` | Al instante | `deliveryOrderId` | Cierre de la entrega (`delivered_at`) |

**Este stream NO necesita un evento `pedido_updated` ni un scope `ORDER_SALE#{...}`.** El pedido
monitoreado hereda el estado de su parada mientras el negocio no introduzca operaciones independientes
por pedido. El cliente recalcula la vista plana a partir de los mismos eventos que ya entiende esta
pantalla. `order_progress` tampoco viaja acá, y es deliberado: están las entregas una por una, así que
el contador se calcula en el cliente. El listado sí lo recibe porque muestra el contador y no las
paradas. Los dos vocabularios son distintos a propósito — la tabla canónica está en
`src/mockup/monitoreo/use-flota-viva.ts`.

**Ejemplo JSON (evento `tracking` 25.15)**

```json
{
  "routeId": 512,
  "latitude": -17.783412,
  "longitude": -63.181245,
  "battery": 74,
  "trackedAt": "2026-07-16T08:24:39.000Z",
  "receivedAt": "2026-07-16T08:24:40.180Z"
}
```

**Ejemplo JSON (evento `delivery_started` 25.16)**

```json
{
  "deliveryOrderId": 90114,
  "status": "ARRIVED",
  "arrivedAt": "2026-07-16T09:40:00.000Z",
  "arrivalLatitude": -17.759881,
  "arrivalLongitude": -63.142004
}
```

**Ejemplo JSON (evento `delivery_closed` 25.17)**

```json
{
  "deliveryOrderId": 90114,
  "status": "DELIVERED",
  "deliveredAt": "2026-07-16T09:52:00.000Z",
  "deliveryResultCode": null,
  "receiverName": "Distribuidora El Cruce"
}
```

**Ejemplo del cable (lo que ve el navegador)**

```
id: 1784201079000-512
event: tracking
data: {"routeId":512,"latitude":-17.783412,"longitude":-63.181245,"battery":74,"trackedAt":"2026-07-16T08:24:39.000Z","receivedAt":"2026-07-16T08:24:40.180Z"}

id: 1784201520000-90114
event: delivery_closed
data: {"deliveryOrderId":90114,"status":"DELIVERED","deliveredAt":"2026-07-16T09:52:00.000Z","deliveryResultCode":null,"receiverName":"Distribuidora El Cruce"}

: heartbeat

```

**Lo que `delivery_closed` NO trae, y hay que decidir:** ni el comprobante (`proof_of_deliveries`) ni las
incidencias que se cargaron al cerrar, ni las cantidades finales de los ítems. Hoy el panel de esa parada
se queda con la cabecera actualizada y **sin evidencia hasta que se re-pida el snapshot** (25.19). Las
dos salidas son mandar el POD y las incidencias en el evento —engorda un evento que se emite igual sin
nadie mirando— o exponer un `GET` por parada, que es el único caso en que un endpoint por pestaña se
justifica. Este documento no lo resuelve.

### Parcheo por id 25.18

El cliente necesita **dos índices**, y es la misma asimetría de la suscripción:

- `tracking` → por `routeId`. Mueve el pin y la cabecera (batería, última señal).
- `delivery_started` / `delivery_closed` → por `deliveryOrderId`. Toca **una** tarjeta del panel y **un**
  pin del mapa.
- `payment_registered` / `payment_status` → por `deliveryOrderSaleId` + `paymentId` cuando el payload lo
  traiga; si la pantalla no abrió la pestaña Cobro, esos eventos se pueden ignorar sin romper el resto.

El merge es por entidad e inmutable (`{ ...prev, [id]: { ... } }`). No es purismo: reconstruir la
colección re-renderiza las 20 paradas en cada ping.

### Reconexión 25.19

Igual que el listado: **se re-pide el snapshot**, no se reproduce con `Last-Event-ID`. Y acá pesa más el
argumento, porque el snapshot de esta pantalla es lo único que trae la evidencia (ver arriba): reproducir
eventos dejaría las paradas cerradas durante el corte sin comprobante.

### Lo que esta pantalla NO pide

Se lista para acotar el contrato:

- **El listado.** Es deep-linkeable: se entra por URL sin pasar por `/monitoreo`, así que recalcula su
  propio `progress` (25.11) en vez de heredarlo.
- **`truck_inventories`.** El conteo a ciegas de la carga es otro flujo (secciones 18 y 21-23 del doc
  oficial).
- **Employee.** El chofer viaja desnormalizado en `routes.name_driver_employee`. El **teléfono** no
  existe en ninguna tabla, y es justo esta pantalla la que tiene el botón natural para llamarlo — hueco
  (5).
- **Nada para el COLOR de la ruta ni del pin del camión.** No hay paso que lo traiga porque no hay
  columna: sale de la UI del planificador (`rutaPorCamionId(...)?.color`). Es el hueco (11) de
  `Frontend.md`, y esta es la pantalla donde se nota — el color es lo único que ata visualmente al mismo
  camión entre planificación y monitoreo. Hay que decidir si se persiste en `trucks` (y entonces es
  identidad del camión) o si las dos pantallas lo recalculan con la MISMA función estable del `truck_id`.

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

Solo los que afectan **este** contrato. Cada uno con su evidencia. Los siete primeros venían de
v0.0.2 y se reformulan sobre el modelo nuevo; del **(8)** en adelante son los que abre mover el viaje
a `routes`.

1. **`transport_order` no tiene columna de código/número visible** — `../../UltimaVersion.sql:281-302`.
   La tabla declara `id`, `dispatch_plan_id`, `distributor_id`, `route_id`, `status`, `checked_by`,
   los dos campos asignados y la auditoría. Ninguna es un código de negocio.
   **Impacto directo sobre este contrato:** `code` es la **primera columna del listado** y el campo
   por el que el planificador identifica la orden —es lo que busca, lo que dicta por teléfono y lo que
   copia en un mail—, y **el atributo `code` de `MonitoringOrderDto` no tiene fuente**. Mientras no
   exista la columna, cada consumidor lo va a derivar del `id` a su manera y dos pantallas van a
   mostrar dos códigos distintos para la misma orden. Es el hueco que más pesa acá, porque no es un
   dato decorativo sino la clave con la que se habla de la orden.

2. **El estado de la salida no tiene dominio declarado, y ahora es una columna de `routes`** —
   `../../UltimaVersion.sql:214`: `status VARCHAR(50), -- Ej: PENDING, LOADING, DISPATCHED`, hoy
   todavía en `trips`. Es un comentario con un **ejemplo**, no un `CHECK` ni una tabla de catálogo, y
   al migrar la columna el hueco viaja con ella. **Impacto:** `transportStatus` es a la vez un **valor
   de filtro** del request (`filterMonitoringDto`) y un atributo de la respuesta, así que un dominio
   inestable rompe las dos puntas. La implementación de referencia usa `PENDING` / `EN_RUTA` /
   `FINALIZADO` (`monitoreo-estado.ts:105-113`) y solo el primero coincide con el ejemplo del esquema
   — por casualidad. Se agrava respecto de v0.0.2: el destino `routes` **ya tiene un `status`
   comentado** (`:237`) con otro dominio (`CALCULATED`, `FAILED`, `APPLIED`), así que si alguien
   descomenta esa línea y reusa el nombre, dos dominios distintos terminan en la misma columna.

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
   `name_driver_employee` (`:211`) —las dos columnas que migran de `trips` (`:206-225`) a `routes`—, y
   nada más. **Impacto:** el listado muestra el chofer del camión que va tarde y el paso natural es
   llamarlo, pero no hay número que devolver, así que **ningún DTO de este documento lo declara**.
   Resolverlo pide una decisión previa: o el maestro de empleados lo expone como servicio externo (y
   entonces es una llamada más, por lote), o se desnormaliza junto al nombre en `routes` (y entonces
   queda congelado al momento en que se armó la ruta, que para un teléfono es defendible).

6. **`routes.truck_id` y `routes.driver_employee_id` sin FK declarada** — las dos columnas llegan
   desde `trips` (`../../UltimaVersion.sql:206-225`, donde la única constraint es
   `fk_trip_distributor`, `:224`) y **la migración no agrega las FK que nunca existieron**. La tabla
   destino sí declara FK para `dispatch_plan_id`, `planning_truck_id` y `trip_id` (`:252-254`), así
   que la asimetría va a quedar a la vista dentro de la misma tabla — y más marcada que en v0.0.2,
   porque `routes` va a tener **dos** referencias a camión y solo una con integridad. **Impacto sobre
   18.6a:** la placa se resuelve **por valor** contra `trucks` (`:56`), así que el servicio tiene que
   decidir qué hace con un `truck_id` que no resuelve — hoy la fila se quedaría sin `licensePlate`,
   que es una de las dos columnas fijadas del listado.

7. **Colisiones de nombre y de semántica DENTRO de `routes`.** Es lo que reemplaza al hueco de
   `transport_order.status` de v0.0.2, y son cuatro pares, no uno:

   | Lo que llega de `trips` | Lo que ya está en `routes` | Qué hay que decidir |
   |---|---|---|
   | `truck_id` (`:208`) | `planning_truck_id` (`:231`, FK a `planning_trucks`) | Dos camiones en la misma fila: uno planificado, uno real. Cuál manda si difieren, y si el segundo es redundante |
   | `driver_employee_id` (`:210`) | `employee_id` (`:234`, sin comentario) | Dos personas sin dueño declarado. Puede que `employee_id` ya fuera el chofer, y entonces no hay nada que migrar |
   | `status` (`:214`) | `status` comentado (`:237`, dominio de optimizador) | El heredado entra como `transport_status`; queda decidir si el comentado se descarta o se descomenta con su propio dominio |
   | `departure_date` / `completed_date` (`:215-216`) | `executed_at` (`:236`) | Tres marcas de tiempo solapadas. `executed_at` probablemente sea "cuándo corrió el optimizador", pero el esquema no lo dice |

   **Impacto:** ninguna de las cuatro se puede mapear a una columna real hasta que se resuelvan, así
   que el DTO de 18.7 (`listRoute`) está escrito contra nombres **propuestos**, no contra el esquema.

8. **¿Una salida es UNA sola ruta?** — `../../UltimaVersion.sql:233` declara `routes.trip_id BIGINT`
   con el comentario *"cuando se cree el viaje y se asocie a un chofer recien se valida que esta ruta
   esta incluida en este viaje o n rutas"*: el esquema dice, con todas las letras, que **un viaje
   podía incluir N rutas**. Disolver el viaje DENTRO de la ruta convierte cada ruta en su propia
   salida. **Impacto:** si un camión sale con tres rutas, el recorrido físico se parte en **tres
   particiones de DynamoDB** (`ROUTE#`), el listado muestra tres salidas donde hubo una, y la ventana
   `departure_date` → `completed_date` se escribe tres veces para el mismo movimiento. Es el espejo
   del bloqueo que v0.0.2 declaraba en su punto (9), y se cierra igual: con una **restricción
   explícita** —una salida = una ruta— antes de que la clave `ROUTE#{routeId}` sea segura. La
   contrapartida buena es real y conviene decirla: la duplicación por orden que v0.0.2 no podía
   descartar **desaparece**, porque N órdenes en un camión comparten ruta.

9. **`routes` no tiene `distributor_id`, y la PK de la flota depende de eso** —
   `../../UltimaVersion.sql:228-255`: la tabla se ancla en `dispatch_plan_id` y `planning_truck_id`,
   pero no lleva la distribuidora. `trips` sí la tenía (`:209`, con FK `fk_trip_distributor`, `:224`).
   **Impacto:** `PK = FLEET#{distributorId}` es la clave del ítem ACTUAL (18.10 y 19.6) y la del
   `subscribe` del stream. Con el ping hablando de rutas, esa PK **no se puede componer** sin heredar
   la columna: la alternativa sería resolverla con un join contra `dispatch_plans` en cada escritura
   de telemetría, ~192.000 veces por día. Es el hueco que hay que cerrar **primero**, junto con el
   (7): los demás se pueden documentar, estos dos no se pueden implementar.

10. **`routes` guarda CANDIDATAS, no solo la ruta que se ejecutó** — `engine` (`:235`), `score`
    (`:240`), `total_cost` (`:242`) e `is_selected` (`:243`). Camión, chofer, hora de salida y estado
    son hechos de **una salida real**, y al ponerlos en esta tabla también caen en las filas que el
    optimizador descartó. **Impacto:** hace falta un **índice único parcial** (`planning_truck_id`
    `WHERE is_selected`) para que no haya dos rutas seleccionadas del mismo camión, y una regla de qué
    pasa si se **recalcula** la ruta después de que el camión salió: si el recálculo crea una fila
    nueva y le pasa el `is_selected`, la traza queda colgada de un `routeId` que ya nadie mira. Con el
    viaje en una tabla propia esto no existía: un viaje no se recalcula.

11. **N órdenes por ruta rompe un invariante que el frontend ya tiene escrito** —
    `Frontend.md` (*Invariante 2*) afirma que **nunca hay dos filas de la misma placa "En ruta"**, y
    de ahí deduce que el mapa puede dibujar un pin por carga. Con `transport_order.route_id` nullable
    y **sin UNIQUE** (`:286`, `:301`) eso pasa a ser un estado legítimo: dos órdenes del mismo camión,
    las dos en ruta, con la misma posición. **Impacto:** el mapa tiene que dibujar **un pin por
    `routeId`**, no uno por fila, o muestra N camiones donde hay uno; y el listado tiene que decidir
    si agrupa visualmente las órdenes de una misma salida o las deja repetidas. La contradicción de
    producto que v0.0.2 arrastraba (filas "Sin salir" contra el invariante 1) sigue abierta y ahora
    tiene una hermana.

12. **La salida vuelve a no tener bitácora** — `transport_order_histories` (`:304-317`) registra el
    ciclo de vida del **documento**, y `routes` no tiene tabla de histories. En v0.0.2 el argumento
    cerraba solo, porque documento y salida eran la misma fila; ahora no: `departure_date` y
    `completed_date` (`:215-216`) son otra vez el **único** registro del ciclo de vida de la salida, y
    son campos pisables. **Impacto sobre este contrato:** el evento `transport_status` informa un
    cambio que no queda auditado en ningún lado. Se descartó `trip_histories` (`:544-553`) por
    duplicar `transport_order_histories`, y ese argumento ya no aplica igual: hay que decidir si
    `routes` gana su propia bitácora o si el cambio de estado de la salida se escribe en la del
    documento, aceptando que se escriba N veces cuando la ruta lleve N órdenes.
