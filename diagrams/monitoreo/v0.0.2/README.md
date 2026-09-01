# Monitoreo en tiempo real

> **v0.0.2** — 2026-07-30. **Se anula la tabla `trips`**: sus columnas (`truck_id`,
> `driver_employee_id`, `name_driver_employee`, `helper_employee_id`, `name_helper_employee`,
> `status`, `departure_date`, `completed_date`) pasan a `transport_order`, que ya tenía
> `distributor_id`. Desaparece `transport_order.trip_id` y el modelo queda **1:1**: una orden de
> transporte = un camión = una salida física. Versión anterior, para diff: `../v0.0.1/`.
>
> El esquema todavía no acompaña: `UltimaVersion.sql:206-225` sigue creando `trips` y `:285` sigue
> declarando `transport_order.trip_id`. Este documento describe el modelo acordado, no el `.sql` de
> hoy.

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
| `transport_order` | La **unidad de navegación** y la salida física: una fila del listado = una orden = un camión. Trae `truck_id`, `driver_employee_id`, `name_driver_employee`, `status`, `departure_date` y `completed_date` |
| `transport_order_histories` | Bitácora de la orden |
| `trucks` | La placa — el único dato del camión que la orden no heredó |
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
A) TRAZA    PK = ORDER#{transportOrderId}   SK = TS#{trackedAt}            TTL 30 días
            latitude, longitude, battery, employeeId, receivedAt

B) ACTUAL   PK = FLEET#{distributorId}      SK = ORDER#{transportOrderId}  overwrite
            latitude, longitude, battery, trackedAt, receivedAt
```

- **A** responde *"¿por dónde anduvo esta orden?"* → `Query PK`, o `SK BETWEEN t1 AND t2`.
  Última posición: `ScanIndexForward=false, Limit=1`.
- **B** existe **solo** para traer toda la flota de un distribuidor en **una** Query. Con la PK de la
  traza serían N consultas, una por camión.

Es la denormalización que Dynamo pide a cambio de que las dos preguntas del monitor cuesten una Query
cada una.

### Descartadas (y por qué)

| Tabla / idea | Por qué no |
|---|---|
| `transport_order_positions` (Postgres) | La telemetría se fue a DynamoDB. Tenerla también en Postgres serían **dos fuentes de verdad** para el mismo dato, y se desincronizan |
| Una bitácora de la salida, aparte (Postgres) | Con `trips` anulada, la salida física **es** la orden de transporte, así que `transport_order_histories` ya registra ese ciclo de vida. Una segunda bitácora anotaría el mismo hecho, sobre la misma fila, dos veces |

Lo que la versión anterior aceptaba perder cambia de forma: `departure_date` y `completed_date` son
ahora columnas de `transport_order`, la misma fila que ya tiene bitácora. Siguen siendo campos
pisables, pero el ciclo de vida de la salida ya no necesita una tabla propia para auditarse — alcanza
con que el cambio de `transport_status` se escriba en `transport_order_histories`. Que hoy se escriba
o no es un pendiente, no un límite del modelo.

---

## Por qué el tracking se guarda por ORDEN

Hasta `v0.0.1` esto era una tensión real: se guardaba por `trip` y se navegaba por orden, y había que
justificar el cruce. Con `trips` anulada la tensión desaparece, porque la regla de fondo apunta a la
misma fila:

> Se **guarda** por lo que físicamente existe. Se **navega** por lo que el usuario busca.

El GPS está en el camión durante una salida, y esa salida **es** la orden de transporte: la fila trae
su `truck_id`, su chofer y su ventana `departure_date` → `completed_date`. Lo que se guarda y lo que
se busca dejaron de ser dos cosas.

### Las dos claves candidatas

| Clave | Qué representa | Veredicto |
|---|---|---|
| `truckId` | El camión físico | **No.** Un camión hace 2-3 salidas por día. Al no estar acotado en el tiempo, la traza de la mañana y la de la tarde caen en la misma partición y se pierde el "recorrido de ESTA salida" |
| `transportOrderId` | **La salida física, que ahora es también el documento** | **Sí.** Acotada en el tiempo (`departure_date` → `completed_date`) y es exactamente lo que tiene una posición |

Lo que antes descartaba a `transportOrderId` era el escenario "una carga con 2 órdenes": cada ping
escribiría dos ítems con las mismas coordenadas. Ese escenario ya no se puede expresar. Sin `trip_id`
no hay muchos-a-uno dónde colgarlo: la duplicación no es improbable, es **imposible de escribir**.

### Cómo conviven en el listado

Ya no hay dos claves que cruzar. La fila de Postgres y el ítem de Dynamo se identifican con el mismo
número:

```
1. Postgres  →  SELECT órdenes despachadas del distribuidor
                [{ transportOrderId, codigo, camión, chofer, progreso, ... }]

2. DynamoDB  →  Query PK = FLEET#{distributorId}          ← UNA sola Query
                [{ SK: ORDER#4471, latitude, longitude, battery, trackedAt }, ...]

3. merge     →  orden.tracking = porTransportOrderId[orden.transportOrderId]
```

Una Query para toda la flota, sean 40 órdenes o 120. Ese es el motivo de que el ítem **B** tenga
`PK = FLEET#{distributorId}`: si su PK fuera la orden, harían falta 40 consultas. Esa PK es
justamente la parte que **no** cambió al anular `trips` — sobrevive porque `distributor_id` ya vivía
en `transport_order`.

En el detalle, más barato todavía: el id de la URL ya **es** la clave de partición, así que no hay
nada que resolver antes.

```
GET /monitoring/orders/{transportOrderId}
  → Dynamo:   Query PK = ORDER#{transportOrderId}
```

### Lo único que sigue necesitando una consulta aparte

La placa. `transport_order` heredó `truck_id`, pero el texto que la pantalla muestra sale de
`trucks.plate`, y `trucks` no se anula. Es un join contra un maestro chico y estable, no una
resolución de identidad: ningún dato del tracking depende de él. El camión, el chofer y la salida ya
vienen con la orden.

---

## Reglas del modelo que más se confunden

**Una orden de transporte = una carga = una salida física.** El chofer no intercala órdenes: sale,
entrega toda la orden, vuelve al almacén, recarga y recién ahí arranca la siguiente. Por eso el mismo
camión y el mismo chofer se repiten en el listado con horarios de salida distintos: son filas
distintas de `transport_order`, cada una con su `departure_date`.

**La ruta es del CAMIÓN, no de la orden.** El argumento perdió una pata al anular `trips` —
`routes.trip_id` pasa a ser `routes.transport_order_id`, así que la columna ya no prueba nada por sí
sola — pero se sostiene con las otras dos: `routes` se ancla en `planning_truck_id`, y la FK del lado
de la orden (`transport_order.route_id`) es *nullable* y **sin UNIQUE**. Y el orden de creación lo
confirma: la ruta la calcula el optimizador antes de que existan las órdenes, así que
`routes.transport_order_id` recién se llena cuando la carga se arma.

**Una parada NO es un pedido.** `dispatch_delivery_points` es un cliente en una ubicación y **agrupa
N pedidos** (`candidate_orders.dispatch_delivery_point_id`). Los totales de la parada son sumas. El
camión frena una vez y baja los 3 pedidos de ese cliente.

```
orden de transporte ──< ENTREGA >── parada ──< pedido ──< producto
         1                 N          1          N           N
```

**Varias rutas por orden son CANDIDATAS, no caminos distintos.** Por eso `routes` tiene `engine`,
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
| Listado | Cambios de estado al instante; pings de GPS **agrupados ~30 s** | `tracking` (agrupado) · `order_progress` · `transport_status` | En la tabla un ping solo cambia "última señal". Reenviar 3,3 eventos/s haría parpadear la tabla para no decir nada nuevo |
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
| `GET` | `/monitoring/orders/{transportOrderId}/stream` | Web — SSE de una orden |
| `POST` | `/delivery-orders/{id}/start` | App del chofer — "Iniciar entrega" |
| `PATCH` | `/delivery-orders/{id}/items` | App del chofer — "Entregar pedido" |
| `POST` | `/delivery-orders/{id}/finish` | App del chofer — "Finalizar" |

El tracking se guarda con `transportOrderId`. El GPS sigue estando físicamente **en el camión**,
pero al anularse `trips` la orden es la salida de ese camión, así que ya no hay nada que resolver en
Postgres antes de consultar Dynamo: el id que viaja en la URL es la clave de partición.

---

## Pendientes

1. **`Secuencia.puml` duplica a `Monitoreo.drawio`.** Los dos están al día con la anulación de
   `trips` —el `.drawio` se regeneró por script desde el de `v0.0.1/` para conservar geometría y
   estilos, y suma una página `M0` con el análisis de impacto—, así que hoy no divergen. Pero el
   riesgo que este punto anticipa sigue vivo: dos diagramas del mismo flujo en formatos distintos no
   se mantienen sincronizados solos, y esta vez costó dos pasadas. El `.drawio` es el que sigue la
   convención del proyecto, así que hay que elegir: o se va el `.puml`, o se asume que el canónico
   pasó a ser él.
   **No se borró porque `diagrams/` está en `.gitignore`**: lo que se elimine acá no se recupera.
   Requiere un OK explícito.
   **Deriva de numeración, previa a este cambio**: la página `M2` del `.drawio` numera los pasos como
   `24.x` mientras `DocumentacionTecnica.md` los documenta como `19.x`, y hay un `19.10` suelto entre
   los `24.x`. Se arrastra desde `v0.0.1/` y se conservó tal cual para que el diff entre versiones
   muestre solo el cambio de modelo. Hay que alinearlo aparte.
2. **Huecos de esquema abiertos**: catálogo de `delivery_result_code` (está `-- POR DEFINIR`), no hay
   incidencias de la SALIDA (`delivery_incidents.delivery_order_id` es NOT NULL), `receiver_name`
   duplicado, `proof_of_deliveries.device_id` sin FK, `transport_order.truck_id` y
   `driver_employee_id` sin FK — heredadas de `trips`, y la falta viaja con ellas —,
   y el teléfono del chofer para el botón de llamar. Detalle en `Frontend.md`.
   Se agregaron al ensayar el contrato de tracking, y el primero **bloquea el mapa**:
   `dispatch_delivery_points` **no tiene columnas de coordenadas** (`UltimaVersion.sql:131-156`) y sin
   ellas no hay pines, ni encuadre, ni ruta que optimizar; `transport_order` no tiene columna de
   código/número visible aunque el listado lo muestre como primera columna;
   `delivery_order_histories.created_by` se declara como origen y no hay autor modelado; y el color con
   el que se pinta la ruta y el camión sale de la UI del planificador, no de una tabla. Detalle, con
   evidencia e impacto, en `Frontend.md`.
3. **Contradicción sin resolver**: `Frontend.md` afirma el invariante "solo aparecen órdenes
   DESPACHADAS", pero el listado igual muestra filas "Sin salir" y ofrece ese filtro. Falta decisión
   de producto; el código quedó como está. Lo que sí cambió es el ORIGEN de esas filas: ya no son un
   estado sorteado por orden, sino las cargas posteriores de un camión que está repartiendo otra
   (ver *Invariante 2* en `Frontend.md`), lo que las hace más defendibles pero no zanja la decisión.
4. **Ninguno de los diagramas se pudo renderizar** en este entorno (no hay `java`/`plantuml` ni
   draw.io). El XML del `.drawio` valida y las llaves del `.puml` balancean, pero conviene abrirlos
   antes de circularlos.
