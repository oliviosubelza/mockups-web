# Monitoreo en tiempo real

Todo lo del módulo vive en esta carpeta.

| Archivo | Qué es |
|---|---|
| `Monitoreo.drawio` | **Diagramas de secuencia** (4 páginas), en el mismo estilo que `UltimaVersion.drawio` |
| `Frontend.md` | Qué muestra cada pantalla y de dónde sale cada dato |
| `Secuencia.puml` | Los mismos flujos en PlantUML. Redundante con el `.drawio` — ver *Pendientes* |
| `../../UltimaVersion.sql` | Esquema relacional (el monitoreo NO agrega tablas ahí) |
| `../../DB.puml` | ERD completo, con la columna 7 de monitoreo |

---

## En qué quedamos con las tablas

### Postgres: no se crea NINGUNA

El monitoreo es un **lector puro** sobre el esquema que ya existe. Estas son las tablas que consume:

| Tabla | Para qué |
|---|---|
| `transport_order` | La **unidad de navegación**: una fila del listado = una orden |
| `transport_order_histories` | Bitácora de la orden |
| `trips` | Camión, chofer y `departure_date` de esa carga |
| `trucks` | La placa |
| `routes` | `encode_polyline` de la ruta seleccionada (`is_selected`) |
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
A) TRAZA    PK = TRIP#{tripId}          SK = TS#{trackedAt}     TTL 30 días
            latitude, longitude, battery, employeeId, receivedAt

B) ACTUAL   PK = FLEET#{distributorId}  SK = TRIP#{tripId}      overwrite
            latitude, longitude, battery, trackedAt, receivedAt
```

- **A** responde *"¿por dónde anduvo este viaje?"* → `Query PK`, o `SK BETWEEN t1 AND t2`.
  Última posición: `ScanIndexForward=false, Limit=1`.
- **B** existe **solo** para traer toda la flota de un distribuidor en **una** Query. Con la PK de la
  traza serían N consultas, una por camión.

Es la denormalización que Dynamo pide a cambio de que las dos preguntas del monitor cuesten una Query
cada una.

### Descartadas (y por qué)

| Tabla | Por qué no |
|---|---|
| `trip_positions` (Postgres) | La telemetría se fue a DynamoDB. Tenerla también en Postgres serían **dos fuentes de verdad** para el mismo dato, y se desincronizan |
| `trip_histories` (Postgres) | La unidad de navegación es la orden, así que `transport_order_histories` ya cubre la trazabilidad. Una bitácora de viaje habría escrito una fila por cada una de las 2-3 órdenes del camión para registrar **una sola salida física** |

Lo que se acepta perder con la segunda: `trips.departure_date` y `completed_date` quedan como único
registro del ciclo de vida del viaje — campos pisables, sin quién ni por qué.

---

## Por qué el tracking se guarda por TRIP y el listado se navega por ORDEN

Parece una incoherencia y no lo es. La regla de fondo:

> Se **guarda** por lo que físicamente existe. Se **navega** por lo que el usuario busca.

El GPS está en el camión durante una salida — eso es el `trip`. La orden de transporte es el
documento que el planificador busca en la tabla.

### Las tres claves candidatas

| Clave | Qué representa | Veredicto |
|---|---|---|
| `truckId` | El camión físico | **No.** Un camión hace 2-3 viajes por día. Al no estar acotado en el tiempo, la traza de la mañana y la de la tarde caen en la misma partición y se pierde el "recorrido de ESTA salida" |
| `transportOrderId` | El papel | **No.** Si una carga lleva 2 órdenes, cada ping escribe **2 ítems con las mismas coordenadas**. Datos duplicados que, si divergen por un reintento o una falla parcial, dejan dos "verdades" para un solo camión sin forma de elegir |
| `tripId` | **La salida física** | **Sí.** Acotado en el tiempo (`departure_date` → `completed_date`) y es exactamente lo que tiene una posición |

### Cómo conviven en el listado

El `trip_id` ya viene en la fila que traés de Postgres, así que el cruce no cuesta una consulta extra:

```
1. Postgres  →  SELECT órdenes despachadas del distribuidor
                [{ transportOrderId, codigo, tripId, camión, chofer, progreso, ... }]

2. DynamoDB  →  Query PK = FLEET#{distributorId}          ← UNA sola Query
                [{ SK: TRIP#88, latitude, longitude, battery, trackedAt }, ...]

3. merge     →  orden.tracking = porTripId[orden.tripId]
```

Una Query para toda la flota, sean 40 órdenes o 120. Ese es el motivo de que el ítem **B** tenga
`PK = FLEET#{distributorId}`: si su PK fuera el trip, harían falta 40 consultas.

En el detalle, igual de barato:

```
GET /monitoring/orders/{transportOrderId}
  → Postgres: la orden trae su trip_id
  → Dynamo:   Query PK = TRIP#{trip_id}
```

### El caso que decide la elección

Hoy, con este flujo, **trip y orden son 1:1**: el chofer sale con una carga, la entrega entera,
vuelve y recarga. Las dos claves darían lo mismo.

Pero el esquema no lo garantiza — `transport_order.trip_id` es *muchos a uno* y nullable, y el flujo
de unificación existe justamente para meter varias órdenes en una carga. Si eso llega a pasar:

- **Con `TRIP#`** → una posición, correcta. Las dos filas del listado muestran el mismo camión en el
  mismo lugar, que es la verdad: es un camión llevando dos órdenes.
- **Con `ORDER#`** → dos posiciones idénticas escritas físicamente, el doble de writes, y un riesgo de
  inconsistencia que no compra nada.

`TRIP#` es correcta en los dos mundos; `ORDER#` solo en uno. Por eso se eligió, aun cuando hoy sean
equivalentes.

---

## Reglas del modelo que más se confunden

**Un viaje = una carga = una orden de transporte.** El chofer no intercala órdenes: sale, entrega
toda la orden, vuelve al almacén, recarga y recién ahí arranca la siguiente. Por eso el mismo camión
y el mismo chofer se repiten en el listado con horarios de salida distintos.

**La ruta es del CAMIÓN, no de la orden.** `routes` tiene `planning_truck_id` y `trip_id`, no
`transport_order_id`. La FK vive del otro lado (`transport_order.route_id`), es *nullable* y **sin
UNIQUE**. Y el orden de creación lo confirma: la ruta la calcula el optimizador antes de que existan
las órdenes.

**Una parada NO es un pedido.** `dispatch_delivery_points` es un cliente en una ubicación y **agrupa
N pedidos** (`candidate_orders.dispatch_delivery_point_id`). Los totales de la parada son sumas. El
camión frena una vez y baja los 3 pedidos de ese cliente.

```
viaje ──< orden de transporte ──< ENTREGA >── parada ──< pedido ──< producto
  1            N                    N          1          N          N
```

**Varias rutas por viaje son CANDIDATAS, no caminos distintos.** Por eso `routes` tiene `engine`,
`score`, `total_cost` e `is_selected`. En el mapa se dibuja la seleccionada.

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
| Listado | Cambios de estado al instante; pings de GPS **agrupados ~30 s** | `tracking` (agrupado) · `order_progress` · `trip_status` | En la tabla un ping solo cambia "última señal". Reenviar 3,3 eventos/s haría parpadear la tabla para no decir nada nuevo |
| Detalle | Todo, ping por ping | `tracking` (ping a ping) · `delivery_started` · `delivery_closed` | Acá cada posición mueve el pin |

Los dos vocabularios son **distintos a propósito**, y estuvieron divergiendo entre documentos hasta que
se los puso en una sola tabla. El listado no recibe `delivery_started` / `delivery_closed` porque no
muestra paradas, muestra el CONTADOR de la orden: `order_progress` manda ese contador ya resuelto, que es
el mismo hecho agregado al nivel que la pantalla usa. Y el detalle no recibe `order_progress` porque
tiene las entregas una por una y el contador lo calcula solo. La tabla canónica vive en
`src/mockup/monitoreo/use-flota-viva.ts`.

**Los dos streams están simulados en el mock**, con la misma división:
`use-flota-viva.ts` para el listado (snapshot con una Query a la flota + deltas, pings agrupados a 30 s,
parcheo por id) y `use-seguimiento-vivo.ts` para el detalle (ping a ping, escribiendo los dos ítems de
`truck_tracking` en cada uno). Antes el listado **no tenía transporte**: calculaba sus filas una vez al
importar el módulo, así que el progreso, las incidencias y la última señal estaban congelados en la
pantalla que existe para verlos moverse.

**La frecuencia del ping no la define el transporte.** Ningún protocolo hace que el dato sea más
fresco que el reporte del celular (10-15 s). La fluidez del mapa se resuelve **interpolando en el
cliente**, no pidiendo más seguido: subir el ping a 2 s quema la batería del chofer.

---

## Endpoints

| Método | Ruta | Quién |
|---|---|---|
| `POST` | `/monitoring/tracks` | App del chofer — un ping de posición |
| `GET` | `/monitoring/orders?distributorId={id}` | Web — snapshot del listado |
| `GET` | `/monitoring/stream?distributorId={id}` | Web — SSE de flota |
| `GET` | `/monitoring/orders/{transportOrderId}` | Web — snapshot del detalle |
| `GET` | `/monitoring/orders/{transportOrderId}/stream` | Web — SSE de un viaje |
| `POST` | `/delivery-orders/{id}/start` | App del chofer — "Iniciar entrega" |
| `PATCH` | `/delivery-orders/{id}/items` | App del chofer — "Entregar pedido" |
| `POST` | `/delivery-orders/{id}/finish` | App del chofer — "Finalizar" |

El tracking se guarda con `tripId`, no con `transportOrderId`: el GPS está físicamente **en el
camión**. Para consultar por orden se resuelve `transport_order.trip_id` en Postgres — un campo que
la query ya trajo.

---

## Pendientes

1. **`Secuencia.puml` duplica a `Monitoreo.drawio`.** Los dos están al día, pero dos diagramas del
   mismo flujo en formatos distintos no se mantienen sincronizados en la práctica. El `.drawio` es el
   que sigue la convención del proyecto, así que el `.puml` debería irse.
   **No se borró porque `diagrams/` está en `.gitignore`**: lo que se elimine acá no se recupera.
   Requiere un OK explícito.
2. **Huecos de esquema abiertos**: catálogo de `delivery_result_code` (está `-- POR DEFINIR`), no hay
   incidencias de VIAJE (`delivery_incidents.delivery_order_id` es NOT NULL), `receiver_name`
   duplicado, `proof_of_deliveries.device_id` sin FK, `trips.truck_id` y `driver_employee_id` sin FK,
   y el teléfono del chofer para el botón de llamar. Detalle en `Frontend.md`.
   Se agregaron al ensayar el contrato de tracking, y el primero **bloquea el mapa**:
   `dispatch_delivery_points` **no tiene columnas de coordenadas** (`UltimaVersion.sql:131-156`) y sin
   ellas no hay pines, ni encuadre, ni ruta que optimizar; `transport_order` no tiene columna de
   código/número visible aunque el listado lo muestre como primera columna;
   `delivery_order_histories.created_by` se declara como origen y no hay autor modelado; y el color con
   el que se pinta la ruta y el camión sale de la UI del planificador, no de una tabla. Detalle, con
   evidencia e impacto, en `Frontend.md`.
3. **Contradicción sin resolver**: `Frontend.md` afirma el invariante "solo aparecen viajes DESPACHADOS",
   pero el mock genera ~20% de viajes en estado "Sin salir" y el listado ofrece ese filtro. Falta
   decisión de producto; el código quedó como está.
4. **Ninguno de los diagramas se pudo renderizar** en este entorno (no hay `java`/`plantuml` ni
   draw.io). El XML del `.drawio` valida y las llaves del `.puml` balancean, pero conviene abrirlos
   antes de circularlos.
