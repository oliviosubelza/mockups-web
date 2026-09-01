# Monitoreo en tiempo real

> **v0.0.3** — 2026-07-31. **Las columnas de `trips` van a `routes`, no a `transport_order`.** La
> tabla `trips` se sigue anulando, pero lo que llevaba (`truck_id`, `distributor_id`,
> `driver_employee_id`, `name_driver_employee`, `helper_employee_id`, `name_helper_employee`,
> `status`, `departure_date`, `completed_date`) pasa a la **ruta**: la salida física del camión es
> ahora `routes`. Versión anterior, para diff: `../v0.0.2/`.
>
> **Lo que eso cambia de fondo:** el vínculo que queda entre documento y salida es
> `transport_order.route_id` (`UltimaVersion.sql:286`, FK `:301`), **nullable y sin UNIQUE**. Vuelve
> el **muchos-a-uno** —una ruta puede llevar N órdenes—, se cae el 1:1 de v0.0.2 y la clave del
> tracking pasa de `ORDER#{transportOrderId}` a **`ROUTE#{routeId}`**.
>
> El esquema no acompaña: `UltimaVersion.sql:206-225` sigue creando `trips`, `:285` sigue declarando
> `transport_order.trip_id` y `:233` sigue declarando `routes.trip_id`. Este documento describe el
> modelo acordado, no el `.sql` de hoy.

Todo lo del módulo vive en esta carpeta.

| Archivo | Qué es |
|---|---|
| `Monitoreo.drawio` | **Diagramas de secuencia** (5 páginas), en el mismo estilo que `UltimaVersion.drawio` |
| `DocumentacionTecnica.md` | Contrato: endpoints, DTOs y funciones, paso por paso |
| `DetalleMapa.md` / `.docx` | El detalle en el mapa, método por método. **Parte A** el snapshot, **Parte B** el tiempo real |
| `Streaming.md` | Cómo viaja el tiempo real: SSE, los dos canales, heartbeat, parcheo parcial. Va como **§ 26** |
| `Eventos.md` / `.docx` | **Catálogo de eventos al frontend**: método publicador, DTO y JSON por evento. Va como **§ 40**. Es el documento para el dev de la app del chofer |
| `Cobros.md` / `.docx` | De dónde sale la data de cobros y cómo llega a la pantalla |
| `Frontend.md` | Qué muestra cada pantalla y de dónde sale cada dato |
| `db-script-actual/` | Anexo técnico local para § 25 y § 26, aterrizado al `db_script.sql` actual: snapshot del detalle, streaming y diagrama `.puml` con joins reales |
| `mockup-actual/` | Paquete auxiliar con la UI actual del mockup documentada por frente: listado, viaje en diálogo, detalle con mapa y eje plan-vs-ejecutado |
| `Secuencia.puml` | Los mismos flujos en PlantUML. Redundante con el `.drawio` — ver *Pendientes* |
| `../../UltimaVersion.sql` | Esquema relacional (el monitoreo NO agrega tablas ahí) |
| `../../DB.puml` | ERD completo, con la columna 7 de monitoreo |

`mockup-actual/` no redefine el backend de `v0.0.3/`. Su función es más acotada: capturar el
comportamiento real de la UI que hoy renderiza `src/mockup/monitoreo/`, para que las pantallas nuevas
se puedan llevar al documento técnico sin reabrir todos los componentes.

`db-script-actual/` cumple otra función: no documenta el modelo objetivo, sino el que hoy sí se puede
defender contra `db_script.sql`. Es útil cuando hace falta bajar el endpoint y los eventos a tablas,
joins y claves reales sin mezclarlo con columnas que todavía no existen en base.

---

## En qué quedamos con las tablas

### Postgres: no se crea NINGUNA

El monitoreo es un **lector puro** sobre el esquema que ya existe. Estas son las tablas que consume:

| Tabla | Para qué |
|---|---|
| `transport_order` | La **unidad de navegación**: una fila del listado es una orden. Trae `route_id`, que es el puntero a la salida y la clave del merge con Dynamo |
| `transport_order_histories` | Bitácora del documento |
| `routes` | **La salida física.** `encode_polyline` de la ruta seleccionada (`is_selected`) y, desde v0.0.3, `truck_id`, `driver_employee_id`, `name_driver_employee`, el estado de la salida, `departure_date` y `completed_date` |
| `trucks` | La placa — el camión es un maestro y no se disuelve |
| `route_delivery_points` | `sequence` — el número de cada pin |
| `dispatch_delivery_points` | La parada: cliente, ventana, peso, volumen |
| `candidate_orders` | Los pedidos que la parada agrupa |
| `delivery_orders` | La entrega: `status`, `arrived_at`, `delivered_at` |
| `delivery_order_items` | Productos consolidados (pestaña Pedido) |
| `delivery_order_histories` | Timeline de la entrega |
| `delivery_incidents` | Incidencias |
| `proof_of_deliveries` | Comprobante: firma, foto, receptor |

### DynamoDB: se crea UNA

**`truck_tracking`** — single-table, **dos tipos de ítem escritos en cada ping**:

```
A) TRAZA    PK = ROUTE#{routeId}         SK = TS#{trackedAt}       TTL 30 días
            latitude, longitude, battery, employeeId, receivedAt

B) ACTUAL   PK = FLEET#{distributorId}   SK = ROUTE#{routeId}      overwrite
            latitude, longitude, battery, trackedAt, receivedAt
```

- **A** responde *"¿por dónde anduvo esta salida?"* → `Query PK`, o `SK BETWEEN t1 AND t2`.
  Última posición: `ScanIndexForward=false, Limit=1`.
- **B** existe **solo** para traer toda la flota de un distribuidor en **una** Query. Con la PK de la
  traza serían N consultas, una por camión.

Es la denormalización que Dynamo pide a cambio de que las dos preguntas del monitor cuesten una Query
cada una.

**Ojo con la PK de la flota**: su forma no cambió en tres versiones, pero su origen sí. Hasta v0.0.2
salía de `transport_order.distributor_id` (`:284`, `NOT NULL`) y no había nada que migrar. Ahora el
ping habla de la ruta, y **`routes` no tiene esa columna**: hay que heredar `trips.distributor_id`
(`:209`) o la clave no se puede componer. Es el hueco (9) de `DocumentacionTecnica.md`.

### Descartadas (y por qué)

| Tabla / idea | Por qué no |
|---|---|
| `transport_order_positions` (Postgres) | La telemetría se fue a DynamoDB. Tenerla también en Postgres serían **dos fuentes de verdad** para el mismo dato, y se desincronizan |
| `trip_histories` (Postgres) | Se descartó en v0.0.1 por duplicar `transport_order_histories`. **Ese argumento ya no cierra igual**: con la salida en `routes` y el documento en `transport_order`, la bitácora del documento no audita el ciclo de vida de la salida. Queda como decisión abierta, no como descarte firme |

`departure_date` y `completed_date` son ahora columnas de `routes`, y son el único registro del ciclo
de vida de la salida. Son campos pisables y **no tienen bitácora detrás**: en v0.0.2 eso lo cubría
`transport_order_histories` porque era la misma fila; acá no.

---

## Por qué el tracking se guarda por RUTA

La regla no cambió nunca; lo que cambia en cada versión es **qué fila representa la salida**:

> Se **guarda** por lo que físicamente existe. Se **navega** por lo que el usuario busca.

El GPS está en el camión durante una salida. Con el viaje disuelto en `routes`, la salida **es** la
ruta: es la fila que lleva el `truck_id`, el chofer y la ventana `departure_date` →
`completed_date`. El listado, en cambio, se navega por **orden de transporte**, porque es el documento
que el planificador busca. Las dos cosas vuelven a ser distintas, como en v0.0.1 — y esta vez el
cruce es más barato, porque `transport_order.route_id` ya existe con FK declarada.

### Las tres claves candidatas

| Clave | Qué representa | Veredicto |
|---|---|---|
| `truckId` | El camión físico | **No.** Un camión hace 2-3 salidas por día. Al no estar acotado en el tiempo, la traza de la mañana y la de la tarde caen en la misma partición y se pierde el "recorrido de ESTA salida" |
| `transportOrderId` | El documento | **No.** Si dos órdenes viajan en el mismo camión, cada ping escribiría dos ítems con las mismas coordenadas: dos pines superpuestos y dos trazas de un solo recorrido, que divergen en cuanto una de las dos escrituras falle. Era la clave de v0.0.2 y solo servía mientras la relación fuera 1:1 |
| `routeId` | **La salida física** | **Sí.** Acotada en el tiempo, es lo que el camión está ejecutando, y N órdenes en un camión comparten una sola |

Lo que hay que garantizar cambió de lado. v0.0.2 necesitaba que **una orden no compartiera camión**;
v0.0.3 necesita que **una salida no se parta en varias rutas**. El comentario de `routes.trip_id`
(`:233`) dice que un viaje se validaba contra *"este viaje o n rutas"*, así que la restricción no
está: hoy nada impide que un camión salga con tres rutas y su recorrido quede partido en tres
particiones.

### Cómo conviven en el listado

```
1. Postgres  →  SELECT órdenes despachadas del distribuidor
                [{ transportOrderId, routeId, codigo, progreso, ... }]

2. Postgres  →  SELECT rutas de esos routeId (deduplicados) JOIN trucks
                [{ routeId, placa, chofer, departureDate, transportStatus }]

3. DynamoDB  →  Query PK = FLEET#{distributorId}          ← UNA sola Query
                [{ SK: ROUTE#512, latitude, longitude, battery, trackedAt }, ...]

4. merge     →  orden.tracking = porRouteId[orden.routeId]      ← fan-out, no join 1:1
```

Una Query para toda la flota, sean 40 rutas o 120. El paso 4 **puede repartir un ítem entre varias
filas**: dos órdenes del mismo camión muestran la misma posición, y eso es correcto — es un camión.
Lo que obliga es a que el mapa dibuje **un pin por ruta, no por fila**.

En el detalle hay un paso de traducción más que en v0.0.2, y es barato: la URL trae el
`transportOrderId`, y el `route_id` viene en la misma fila que el snapshot ya lee.

```
GET /monitoring/orders/{transportOrderId}
  → Postgres: transport_order.route_id
  → Dynamo:   Query PK = ROUTE#{routeId}
```

---

## Reglas del modelo que más se confunden

**Una orden de transporte es un DOCUMENTO; la salida física es la RUTA.** Un camión puede salir con
más de una orden: comparten `route_id`, comparten camión, chofer y hora de salida, y avanzan cada una
con su propio contador de entregas. El chofer no intercala cargas —sale, entrega, vuelve, recarga—,
así que el mismo camión se repite en el listado con horarios de salida distintos: son rutas
distintas.

**La ruta es del CAMIÓN, y ahora el esquema lo dice solo.** El argumento no necesita defensa desde
que la ruta lleva el `truck_id`: `routes` se ancla en `planning_truck_id` (`:231`), hereda el camión
real, y la FK del lado de la orden (`transport_order.route_id`) es *nullable* y **sin UNIQUE**. El
orden de creación lo confirma: la ruta la calcula el optimizador antes de que existan las órdenes.

**Una parada NO es un pedido.** `dispatch_delivery_points` es un cliente en una ubicación y **agrupa
N pedidos** (`candidate_orders.dispatch_delivery_point_id`). Los totales de la parada son sumas. El
camión frena una vez y baja los 3 pedidos de ese cliente.

```
ruta ──< orden de transporte ──< ENTREGA >── parada ──< pedido ──< producto
  1              N                  N          1          N          N
```

**Varias rutas de un mismo camión pueden ser CANDIDATAS, no salidas distintas.** Por eso `routes`
tiene `engine`, `score`, `total_cost` e `is_selected`. En el mapa se dibuja la seleccionada — y con
las columnas de la salida ahora en esta tabla, hay que garantizar que solo la seleccionada las lleve
con datos reales (hueco 10).

---

## Transporte en tiempo real

**SSE, no WebSockets.** El monitor solo lee; WS es bidireccional y no aporta nada acá. SSE trae
reconexión automática y `Last-Event-ID` nativos del navegador — justo la parte cara de implementar
sobre WS. Requiere HTTP/2 (sobre HTTP/1.1 el navegador limita a 6 conexiones por dominio).

**Patrón snapshot + deltas.** Nunca se reenvía la flota entera:

1. `GET` del estado completo, **una vez** al abrir la pantalla.
2. Conexión SSE: cada evento trae **solo lo que cambió**, con su id.
3. El cliente **parchea por id** contra su estado local.

**Reconexión: se re-pide el snapshot**, no se reproduce con `Last-Event-ID`. Un monitor necesita el
estado de AHORA, no el historial de lo que pasó mientras nadie miraba. Más simple y siempre correcto.

**Granularidad distinta por pantalla:**

| Pantalla | Stream | Eventos | Por qué |
|---|---|---|---|
| Listado | Cambios de estado al instante; pings de GPS **agrupados ~30 s** | `tracking` (agrupado) · `order_progress` · `transport_status` | En la tabla un ping solo cambia "última señal". Reenviar 3,3 eventos/s haría parpadear la tabla para no decir nada nuevo |
| Detalle | Todo, ping por ping | `tracking` (ping a ping) · `delivery_started` · `delivery_closed` | Acá cada posición mueve el pin |

**Vuelven las dos identidades**, y esta vez son estructurales, no un accidente de vocabulario:
`tracking` y `transport_status` viajan con **`routeId`** —son hechos del camión, y pueden tocar N
filas—, mientras que `order_progress`, `delivery_started` y `delivery_closed` viajan con
**`transportOrderId`** —son hechos de un documento—. El cliente necesita **dos índices**: uno por
orden y uno por ruta. Con uno solo, un ping mueve una fila y deja la otra congelada. La tabla canónica
vive en `src/mockup/monitoreo/use-flota-viva.ts`.

**Los dos streams están simulados en el mock**, con la misma división: `use-flota-viva.ts` para el
listado y `use-seguimiento-vivo.ts` para el detalle. **Los dos siguen en el modelo de v0.0.1**
(clave `TRIP#`), así que hay que portarlos: el cambio de clave es mecánico, el índice doble del
cliente no.

**La frecuencia del ping no la define el transporte.** Ningún protocolo hace que el dato sea más
fresco que el reporte del celular (10-15 s). La fluidez del mapa se resuelve **interpolando en el
cliente**, no pidiendo más seguido: subir el ping a 2 s quema la batería del chofer.

---

## Endpoints

| Método | Ruta | Quién |
|---|---|---|
| `POST` | `/monitoring/tracks` | App del chofer — un ping de posición, con `routeId` |
| `GET` | `/monitoring/orders?distributorId={id}` | Web — snapshot del listado |
| `GET` | `/monitoring/stream?distributorId={id}` | Web — SSE de flota |
| `GET` | `/monitoring/orders/{transportOrderId}` | Web — snapshot del detalle |
| `GET` | `/monitoring/orders/{transportOrderId}/stream` | Web — SSE de una orden |
| `POST` | `/delivery-orders/{id}/start` | App del chofer — "Iniciar entrega" |
| `PATCH` | `/delivery-orders/{id}/items` | App del chofer — "Entregar pedido" |
| `POST` | `/delivery-orders/{id}/finish` | App del chofer — "Finalizar" |

Las URLs de la web **no cambian**: se sigue navegando por orden. Lo que cambia es lo que la app del
chofer manda —`routeId` en vez de `transportOrderId`— y lo que el stream del detalle escucha por
dentro: `ROUTE#{routeId}` para el tracking y `ORDER#{transportOrderId}` para las entregas.

---

## Pendientes

1. **`Secuencia.puml` duplica a `Monitoreo.drawio`.** Los dos están al día con el cambio, pero el
   riesgo que este punto anticipa sigue vivo: dos diagramas del mismo flujo en formatos distintos no
   se mantienen sincronizados solos, y van tres versiones. El `.drawio` es el que sigue la convención
   del proyecto, así que hay que elegir: o se va el `.puml`, o se asume que el canónico pasó a ser él.
   **No se borró porque `diagrams/` está en `.gitignore`**: lo que se elimine acá no se recupera.
   Requiere un OK explícito.
   **Deriva de numeración, previa a estos dos cambios**: la página `M1` del `.drawio` numera los pasos
   como `19.x` y la `M2` como `24.x`, mientras `DocumentacionTecnica.md` los documenta como `18.x` y
   `19.x`. Se arrastra desde antes y se conservó tal cual para que el diff entre versiones muestre
   solo el cambio de modelo. Hay que alinearlo aparte, y no es solo el prefijo: el diagrama **no numera
   los retornos** y el documento sí, así que los pasos también difieren dentro de cada sección. El mapa
   completo de secciones está al principio de `DocumentacionTecnica.md`.
3. **La página `M3` del `.drawio` le debe nueve pasos a su documentación (§ 25).** El contrato ya está
   completo —cada paso con su DTO y su JSON—; el diagrama es el que quedó corto:
   - **Los números `25.1` a `25.19`**, que la sección *Numeración de los pasos* lista etiqueta por
     etiqueta. Hoy la página solo tiene las secciones `M3.1` / `M3.2` / `M3.3`.
   - **Seis lifelines que faltan**, y todas son consultas reales: `Transport Order DB` (`25.4`, resolver
     `route_id` — nuevo en v0.0.3), `Truck DB` (`25.5a`, la placa), `Candidate Order DB` (`25.7a`, los
     pedidos de la parada), `Delivery Order Item DB` (`25.9a`), `Delivery Incident DB` (`25.9b`),
     `Proof Of Delivery DB` (`25.9c`) y `Delivery Order History DB` (`25.9d`) — más el servicio externo
     `01 DeliveryPoint` (`25.8`), que es **el que sostiene el mapa**: sin coordenadas no hay pines.
   - Hoy la evidencia (comprobante, incidencias, ítems, historial) viaja implícita en un solo paso contra
     `Delivery Order DB`, y **eso es lo que hacía imposible ver de dónde sale el comprobante**.
4. **Huecos de esquema abiertos.** Los doce están en `DocumentacionTecnica.md` § *Huecos abiertos*,
   con evidencia. Los dos que **bloquean la implementación** son de esta versión: `routes` no tiene
   `distributor_id` (sin ella no hay `FLEET#{distributorId}`) y las cuatro colisiones de columnas
   dentro de `routes` (`truck_id` vs `planning_truck_id`, `driver_employee_id` vs `employee_id`,
   `status` comentado, `executed_at` vs las dos fechas). Siguen abiertos de antes: coordenadas de las
   paradas, código visible de la orden, catálogo de `delivery_result_code`, teléfono del chofer,
   incidencias de la salida y `delivery_order_histories.created_by`.
5. **Dos contradicciones de producto, no una.** Sigue abierta la de v0.0.2 —`Frontend.md` afirma que
   solo aparecen órdenes DESPACHADAS pero el listado muestra filas "Sin salir"— y se agrega la que
   trae el muchos-a-uno: el *Invariante 2* dice que nunca hay dos filas de la misma placa "En ruta", y
   con N órdenes por ruta eso pasa a ser un estado legítimo. El mapa tiene que dibujar por ruta, y el
   listado tiene que decidir si agrupa las órdenes de una salida o las repite.
6. **La implementación de referencia sigue en v0.0.1** (`src/mockup/monitoreo/`, clave `TRIP#`). Con
   este cambio el port es más chico de lo que parece: `TRIP#` → `ROUTE#` es un rename, y la
   cardinalidad muchos-a-uno que el mock ya tenía vuelve a ser la correcta.
7. **Ninguno de los diagramas se pudo renderizar** en este entorno (no hay `java`/`plantuml` ni
   draw.io). El XML del `.drawio` valida, pero conviene abrirlo antes de circularlo.
