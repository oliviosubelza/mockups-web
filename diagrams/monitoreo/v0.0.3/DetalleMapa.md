# Monitoreo — Detalle en el MAPA: método por método

Pantalla `/monitoreo/seguimiento/{transportOrderId}` — el mapa con sus dos paneles. Este documento está
escrito para poder **dibujar el diagrama de secuencia**: cada método con su lifeline, lo que consulta, el
JSON que devuelve, y al final la respuesta armada.

Está partido en dos, porque son dos cosas distintas:

- **PARTE A — Obtener toda la información del mapa.** Ocurre **una sola vez**, al abrir la pantalla.
- **PARTE B — Cómo cambia la información en tiempo real.** Ocurre **mientras la pantalla está abierta**,
  y no es un refresco: es un flujo de eventos con dos orígenes distintos.

Complementa a `DocumentacionTecnica.md` § 25, que es el contrato formal (DTOs y validaciones). Acá cada
paso lleva su consulta y su JSON de retorno para que el diagrama salga sin adivinar nada.

**Fuera de alcance, a propósito:**

- **La subida de fotos a AWS.** La app del chofer sube el archivo a
  `POST /api/uploadFolderCustomersAwsS3` y recibe un `fileUrl` de S3, que después manda en
  `registerProofOfDelivery` (§ 29) o `registerDeliveryIncident` (§ 30). **El monitor solo consume esa
  URL**: no sube, no firma, no valida el bucket.
- **El cobro** está documentado como **propuesta** (B.6 y el anexo), porque su endpoint todavía no
  existe y el monto no tiene columna en el esquema.

---

## Participantes del diagrama (lifelines)

Una lifeline por tabla o sistema, que es la convención de `UltimaVersion.drawio`.

| Lifeline | Qué es | Aparece en |
|---|---|---|
| **Planificador** | El usuario (actor) | A, B |
| **Frontend** | La pantalla del mapa | A, B |
| **Gateway Controller** | Puerta de entrada HTTP | A, B |
| **Monitoring Controller** | Valida y delega | A, B |
| **Monitoring Service** | El único que orquesta | A, B |
| **Transport Order DB** | `transport_order` | A.1 |
| **Distributor DB** | `distributors` | A.1a |
| **Route DB** | `routes` — la SALIDA en v0.0.3 | A.2 |
| **Truck DB** | `trucks` (la placa) | A.2a |
| **Route Delivery Point DB** | `route_delivery_points` (el orden de visita) | A.3 |
| **Dispatch Delivery Point DB** | `dispatch_delivery_points` (la parada) | A.4 |
| **Candidate Order DB** | `candidate_orders` (los pedidos) | A.5 |
| **DeliveryPoint Service** | **Externo**: las coordenadas | A.6 |
| **Delivery Order DB** | `delivery_orders` (la entrega) | A.7, B.3-B.5 |
| **Delivery Order Item DB** | `delivery_order_items` | A.8 |
| **Delivery Incident DB** | `delivery_incidents` | A.9, B.5 |
| **Proof Of Delivery DB** | `proof_of_deliveries` | A.10, B.5 |
| **Delivery Order History DB** | `delivery_order_histories` | A.11, B.3-B.5 |
| **Truck Tracking (DynamoDB)** | `truck_tracking` | A.12, B.2 |
| **SSE Bus** | Bus de eventos en memoria | B |
| **App del chofer** | Produce TODO lo de la Parte B | B |

---

# PARTE A — Obtener toda la información del mapa

**Un solo endpoint, trece pasos, una respuesta.** El Service hace once lecturas (diez a Postgres/servicio
externo y una a DynamoDB) y arma el resultado. No hay un endpoint por panel ni uno por pestaña.

```
GET /monitoring/orders/{transportOrderId}
```

| Paso | Método | Lifeline | § 25 |
|---|---|---|---|
| A.0 | `GET /monitoring/orders/{id}` | Gateway Controller | 25.1 |
| A.0a | `getOrderDetail(id)` | Monitoring Controller → Service | 25.2 / 25.3 |
| A.1 | `findOrderWithRoute(transportOrderId)` | Transport Order DB | 25.4 |
| A.1a | `join distributors` | Distributor DB | 25.4a |
| A.2 | `findSelectedRoute(routeId)` | Route DB | 25.5 |
| A.2a | `join trucks` | Truck DB | 25.5a |
| A.3 | `findRouteDeliveryPoints(routeId)` | Route Delivery Point DB | 25.6 |
| A.4 | `findDispatchPoints(ids)` | Dispatch Delivery Point DB | 25.7 |
| A.5 | `findCandidateOrders(ids)` | Candidate Order DB | 25.7a |
| A.6 | `getDeliveryPoints(ids)` | **DeliveryPoint Service** | 25.8 |
| A.7 | `findDeliveriesByOrder(transportOrderId)` | Delivery Order DB | 25.9 |
| A.8 | `findItemsByDeliveryIds(ids)` | Delivery Order Item DB | 25.9a |
| A.9 | `findIncidentsByDeliveryIds(ids)` | Delivery Incident DB | 25.9b |
| A.10 | `findPodsByDeliveryIds(ids)` | Proof Of Delivery DB | 25.9c |
| A.11 | `findHistoriesByDeliveryIds(ids)` | Delivery Order History DB | 25.9d |
| A.12 | `query(PK=ROUTE#{routeId})` | Truck Tracking (DynamoDB) | 25.10 |
| A.13 | `buildDetail(...)` | Monitoring Service | 25.11 |

**Regla que se repite en A.4 a A.11: se llama UNA vez con el arreglo de ids, no una vez por parada.**
Con 20 paradas, hacerlo por parada son 160 consultas en vez de 8.

---

## A.0 · Entrada

**Método:** `GET /monitoring/orders/{transportOrderId}` → `getOrderDetail(transportOrderId)`

El Gateway recibe, el Controller valida el path param, el Service orquesta.

| Atributo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `transportOrderId` | number | Sí | `transport_order.id`. Va en el PATH: identifica el recurso |

```json
{ "transportOrderId": 4471 }
```

---

## A.1 · findOrderWithRoute(transportOrderId) + A.1a join distributors

**Lifelines:** Transport Order DB · Distributor DB

**Qué hace:** trae la orden y **resuelve el `route_id`**, que es lo que se necesita para consultar la
ruta (A.2) y el tracking (A.12). En el mismo `SELECT` trae el **depósito**, porque el recorrido del mapa
empieza y termina ahí.

**Consulta:**

```sql
SELECT o.id, o.distributor_id, o.route_id, o.status,
       o.assigned_weight_kg, o.assigned_volume_m3,
       d.name, d.latitude, d.longitude
FROM   transport_order o
JOIN   distributors d ON d.id = o.distributor_id     -- A.1a
WHERE  o.id = $1 AND o.deleted_at IS NULL;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `transportOrderId` | number | `transport_order.id` (`:282`) | Identidad de la pantalla |
| `code` | string | **SIN COLUMNA** | El código visible del encabezado — hueco (1) |
| `distributorId` | number | `distributor_id` (`:284`) | Scope, y la PK del ítem de flota |
| `routeId` | number \| null | `route_id` (`:286`) | **La clave del tracking.** Sin él no hay Query a Dynamo ni stream de posición |
| `orderStatus` | string | `status` (`:287`) | Estado del **documento** (no del viaje) |
| `assignedWeightKg` | number | `:289` | Peso de la carga |
| `assignedVolumeM3` | number | `:290` | Volumen de la carga |
| `deposito.name` | string | `distributors.name` (`:7`) | Tooltip del pin del almacén |
| `deposito.latitude` | number | `distributors.latitude` (`:8`) | **Origen del recorrido** |
| `deposito.longitude` | number | `distributors.longitude` (`:9`) | Ídem |

**JSON recuperado:**

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

Si `routeId` viene `null`: la orden está despachada sin ruta. Se saltan A.2, A.3 y A.12 — hay paradas
pero no hay recorrido ni camión que seguir.

---

## A.2 · findSelectedRoute(routeId) + A.2a join trucks

**Lifelines:** Route DB · Truck DB

**Qué hace:** trae **la salida física**. En v0.0.3 `routes` es el viaje: lleva el camión, el chofer, el
estado y las fechas, además de la polilínea del recorrido.

**Consulta:**

```sql
SELECT r.id, r.distributor_id, r.encode_polyline,
       r.truck_id, r.driver_employee_id, r.name_driver_employee,
       r.transport_status, r.departure_date, r.completed_date,
       r.eta_total_distance_m, r.eta_total_time_s,
       t.plate
FROM   routes r
LEFT JOIN trucks t ON t.id = r.truck_id              -- A.2a
WHERE  r.id = $1 AND r.is_selected = TRUE AND r.deleted_at IS NULL;
```

`is_selected = TRUE` no es decorativo: `routes` guarda también las **candidatas** que el optimizador
descartó, y una candidata no tiene salida real.

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `routeId` | number | `routes.id` (`:229`) | La clave del tracking y del scope SSE |
| `distributorId` | number | `routes.distributor_id` | **La columna no existe hoy** — hueco (9) |
| `encodePolyline` | string \| null | `encode_polyline` (`:244`) | El trazo del recorrido |
| `licensePlate` | string | `trucks.plate` (`:56`) | "Camión" en la cabecera |
| `nameDriverEmployee` | string | `name_driver_employee` | "Chofer" en la cabecera |
| `driverEmployeeId` | number \| null | `driver_employee_id` | El `employeeId` que audita cada ping |
| `transportStatus` | string | `transport_status` | Estado del viaje: `PENDING` / `EN_RUTA` / `FINALIZADO` |
| `departureDate` | string \| null | `departure_date` | Hora de salida |
| `completedDate` | string \| null | `completed_date` | Hora de retorno |
| `etaTotalDistanceM` | number \| null | `:238` | Distancia planificada |
| `etaTotalTimeS` | number \| null | `:239` | Tiempo planificado |

**JSON recuperado:**

```json
{
  "routeId": 512,
  "distributorId": 1,
  "encodePolyline": "}_o~F~ps|U_ulLnnqC_mqNvxq`@",
  "truckId": 880012,
  "licensePlate": "3456-ABC",
  "driverEmployeeId": 456,
  "nameDriverEmployee": "Carlos Mamani",
  "transportStatus": "EN_RUTA",
  "departureDate": "2026-07-16T08:00:00.000Z",
  "completedDate": null,
  "etaTotalDistanceM": 48250.00,
  "etaTotalTimeS": 9600.00
}
```

---

## A.3 · findRouteDeliveryPoints(routeId)

**Lifeline:** Route Delivery Point DB

**Qué hace:** trae **el orden de visita**. `sequence` es el número que se dibuja en cada pin, el que
ordena el panel izquierdo y el que define el corte de "hecho vs pendiente".

**Consulta:**

```sql
SELECT id, dispatch_delivery_point_id, sequence,
       estimated_distance_m, estimated_travel_s, estimated_total_cost, is_active
FROM   route_delivery_points
WHERE  route_id = $1 AND is_active = TRUE AND deleted_at IS NULL
ORDER  BY sequence;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `routeDeliveryPointId` | number | `:259` | Identidad de la parada dentro de la ruta |
| `dispatchDeliveryPointId` | number | `:261` | **El pivote** con la parada planificada (A.4) |
| `sequence` | number | `:262` | **El número del pin** y el orden de la lista |
| `estimatedDistanceM` | number \| null | `:264` | Metros HACIA este punto (no acumulados) |
| `estimatedTravelS` | number \| null | `:265` | Segundos de viaje hacia este punto |
| `isActive` | boolean | `:267` | Una parada desactivada del plan **no se dibuja** |

**JSON recuperado:**

```json
[
  {
    "routeDeliveryPointId": 88301,
    "dispatchDeliveryPointId": 4021,
    "sequence": 1,
    "estimatedDistanceM": 5400.00,
    "estimatedTravelS": 780.00,
    "isActive": true
  },
  {
    "routeDeliveryPointId": 88302,
    "dispatchDeliveryPointId": 4022,
    "sequence": 2,
    "estimatedDistanceM": 3120.00,
    "estimatedTravelS": 540.00,
    "isActive": true
  },
  { "...": "..." }
]
```

---

## A.4 · findDispatchPoints(dispatchDeliveryPointIds)

**Lifeline:** Dispatch Delivery Point DB

**Qué hace:** trae **la parada planificada**: cliente, ventana horaria, peso y volumen. Una llamada con
el arreglo de ids que devolvió A.3.

**Consulta:**

```sql
SELECT id, delivery_point_id, owner_id, owner_name, customer_name,
       delivery_window_start, delivery_window_end,
       total_weight_kg, total_volume_m3, total_neto
FROM   dispatch_delivery_points
WHERE  id = ANY($1) AND deleted_at IS NULL;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `dispatchDeliveryPointId` | number | `:132` | Clave para cruzar con A.3, A.5 y A.7 |
| `deliveryPointId` | number | `:135` | **Sin FK**: apunta al maestro EXTERNO. Es lo que A.6 usa |
| `customerName` | string | `:138` | Título de la tarjeta y del panel derecho |
| `deliveryWindowStart` / `End` | string | `:144-145` | "Ventana" — tipo `TIME`, se muestra `HH:mm` |
| `totalWeightKg` / `totalVolumeM3` | number | `:146-147` | Cabecera del panel derecho. Son **sumas** de los pedidos |
| `totalNeto` | number | — | Monto neto consolidado (viene del plan, ver el anexo del cobro) |

**No trae `latitude` ni `longitude`: la tabla no las tiene.** Ese es el paso A.6.

**JSON recuperado:**

```json
[
  {
    "dispatchDeliveryPointId": 4021,
    "deliveryPointId": 45,
    "customerName": "Casa La Ramada",
    "deliveryWindowStart": "08:00",
    "deliveryWindowEnd": "12:00",
    "totalWeightKg": 620.40,
    "totalVolumeM3": 2.30,
    "totalNeto": 2572.67
  },
  { "...": "..." }
]
```

---

## A.5 · findCandidateOrders(dispatchDeliveryPointIds)

**Lifeline:** Candidate Order DB

**Qué hace:** trae **los pedidos que cada parada agrupa** — la mitad de arriba de la pestaña *Pedido*.
Responde lo que más se confunde del modelo: la parada **no es** un pedido, agrupa N.

**Consulta:**

```sql
SELECT id, dispatch_delivery_point_id, sales_order_id, document_id,
       total_weight_kg, total_volume_m3, type_movement
FROM   candidate_orders
WHERE  dispatch_delivery_point_id = ANY($1)
  AND  is_included = TRUE AND deleted_at IS NULL;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `candidateOrderId` | number | `:177` | Identidad del pedido |
| `dispatchDeliveryPointId` | number | `:178` | La parada a la que pertenece |
| `salesOrderId` | string | `:179` | El número que Ventas conoce — se muestra en la pestaña |
| `documentId` | string | `:180` | El documento SAP |
| `totalWeightKg` / `totalVolumeM3` | number | `:185-186` | Kg y m³ del pedido |
| `typeMovement` | string \| null | `:188` | Distingue venta de devolución o traslado |
| `total` | number | **SIN COLUMNA** | Monto en Bs. **Viene del pedido de SAP** — ver el anexo del cobro |
| `formaPago` | string | **SIN COLUMNA** | `Contado` / `Crédito` / `Transferencia`. También de SAP |

**JSON recuperado:**

```json
[
  {
    "candidateOrderId": 7781,
    "dispatchDeliveryPointId": 4021,
    "salesOrderId": "SO-88213",
    "documentId": "1000026565",
    "totalWeightKg": 320.40,
    "totalVolumeM3": 1.10,
    "typeMovement": "VENTA"
  },
  {
    "candidateOrderId": 7782,
    "dispatchDeliveryPointId": 4021,
    "salesOrderId": "SO-88240",
    "documentId": "1000026571",
    "totalWeightKg": 300.00,
    "totalVolumeM3": 1.20,
    "typeMovement": "VENTA"
  },
  { "...": "..." }
]
```

---

## A.6 · getDeliveryPoints(deliveryPointIds) — SERVICIO EXTERNO

**Lifeline:** DeliveryPoint Service (fuera del microservicio)

**Qué hace:** trae **las coordenadas de las paradas**. Sin este paso no hay pines, ni encuadre, ni trazo
que cortar: `dispatch_delivery_points` no tiene columnas de posición.

Es **una llamada por lote**, con los `deliveryPointId` de todas las paradas.

**Entrada:**

```json
{ "deliveryPointId": [45, 46, 51, 78], "ownerId": 4, "customerId": null }
```

**JSON recuperado:**

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

Las claves llegan **en español** (`latitud` / `longitud`) porque son las del contrato externo. La
traducción a `latitude` / `longitude` ocurre en A.13; normalizarlas antes haría creer que el contrato es
nuestro.

**Qué pasa si este servicio falla:** sin coordenadas no hay mapa, pero **sí** hay panel de paradas,
estados y evidencia. Hay que decidir entre degradar (mapa vacío con aviso) o `500`. Está declarado, no
resuelto.

---

## A.7 · findDeliveriesByOrder(transportOrderId)

**Lifeline:** Delivery Order DB

**Qué hace:** trae **las entregas** — una fila por parada de esta orden. Es lo que el chofer ejecuta, y
la tabla que la Parte B va a ir modificando.

**Consulta:**

```sql
SELECT id, dispatch_delivery_point_id, status,
       arrived_at, delivered_at, arrival_latitude, arrival_longitude,
       receiver_name, receiver_relationship, delivery_result_code
FROM   delivery_orders
WHERE  transport_order_id = $1 AND deleted_at IS NULL;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `deliveryOrderId` | number | `:382` | **La clave del parcheo** de todos los eventos de la Parte B |
| `dispatchDeliveryPointId` | number | `:384` | Cruce con A.3, A.4 y A.5 |
| `status` | string | `:392` | **Color e insignia del pin**, y la etiqueta de la tarjeta |
| `arrivedAt` | string \| null | `:395` | "Llegada" |
| `deliveredAt` | string \| null | `:396` | "Cierre" |
| `arrivalLatitude` / `Longitude` | number \| null | `:393-394` | **Dónde marcó la llegada** — sirve para compararla con la posición del camión |
| `receiverName` | string \| null | — | Quién recibió. **Duplicado** con el POD (A.10) |
| `receiverRelationship` | string \| null | `:390` | Cargo del receptor. **Está acá, no en el POD** como dice § 29 |
| `deliveryResultCode` | string \| null | `:391` | El motivo, solo cuando no se entregó |

**JSON recuperado:**

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
    "receiverName": "Lic. Roberto Gómez",
    "receiverRelationship": "ENCARGADO_ALMACEN",
    "deliveryResultCode": null
  },
  {
    "deliveryOrderId": 90113,
    "dispatchDeliveryPointId": 4022,
    "status": "INCIDENT",
    "arrivedAt": "2026-07-16T09:02:00.000Z",
    "deliveredAt": "2026-07-16T09:11:00.000Z",
    "arrivalLatitude": -17.771002,
    "arrivalLongitude": -63.160877,
    "receiverName": null,
    "receiverRelationship": null,
    "deliveryResultCode": "CLIENTE_AUSENTE"
  },
  { "...": "..." }
]
```

---

## A.8 · findItemsByDeliveryIds(deliveryOrderIds)

**Lifeline:** Delivery Order Item DB

**Qué hace:** trae **los productos consolidados** de cada parada — la mitad de abajo de la pestaña
*Pedido*. Es POR PRODUCTO, no por pedido: si el cliente pidió el mismo aceite en dos pedidos, el chofer
baja una sola cantidad.

**Consulta:**

```sql
SELECT id, delivery_order_id, product_id,
       planned_qty, loaded_qty, delivered_qty, returned_qty, item_status
FROM   delivery_order_items
WHERE  delivery_order_id = ANY($1) AND deleted_at IS NULL;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `deliveryOrderItemId` | number | `:412` | Identidad de la línea |
| `deliveryOrderId` | number | `:411` | La entrega a la que pertenece |
| `productId` | number | `:414` | El nombre y la unidad los resuelve el snapshot **Product** |
| `plannedQty` | number | `:413` | Lo que el plan asignó |
| `loadedQty` | number | `:414` | Lo que subió al camión. `loaded < planned` es **faltante de carga** |
| `deliveredQty` | number | `:415` | Columna "Entr." |
| `returnedQty` | number | `:416` | Columna "Dev." — en rojo si es mayor a cero |
| `itemStatus` | string \| null | `:418` | Estado por línea |
| `unitPrice` / `subtotal` | number | **SIN COLUMNA** | La app del chofer los usa (§ 29) y `unit_price_snapshot` **no existe en el esquema** |

**JSON recuperado:**

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

---

## A.9 · findIncidentsByDeliveryIds(deliveryOrderIds)

**Lifeline:** Delivery Incident DB

**Qué hace:** trae **las incidencias** — la pestaña *Incidencias* y el ⚠️ de la tarjeta. Lo normal es
que devuelva vacío: una incidencia es la excepción.

**Consulta:**

```sql
SELECT id, delivery_order_id, incident_code, incident_type, severity,
       description, photo_url, requires_return,
       resolution_status, resolved_at, created_at
FROM   delivery_incidents
WHERE  delivery_order_id = ANY($1) AND deleted_at IS NULL
ORDER  BY created_at;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `incidentId` | number | `:458` | Identidad |
| `deliveryOrderId` | number | `:459` | **Solo cuelga de una ENTREGA**: no hay incidencias de la salida (camión averiado) — hueco (2) |
| `incidentCode` | string | `:460` | Código: `CLIENTE_AUSENTE`, `PRODUCTO_DANIADO`… (catálogo en § 30) |
| `incidentType` | string | `:461` | `LOGISTICO` / `PRODUCTO` / `COMERCIAL` (§ 30) |
| `severity` | string | `:462` | `BAJA` / `MEDIA` / `ALTA` / `CRITICA` — **cuatro** niveles (§ 30) |
| `description` | string \| null | `:463` | Lo que escribió el chofer |
| `photoUrl` | string \| null | `:464` | **La foto es la prueba.** URL de S3 |
| `requiresReturn` | boolean | `:465` | Si es `true`, la app además abre la devolución en SAP (§ 30) |
| `resolutionStatus` | string \| null | `:466` | `PENDING` mientras espera al supervisor. **Hoy el panel no lo muestra, y debería** |
| `createdAt` | string | `:471` | Hora del reporte |

**JSON recuperado:**

```json
[
  {
    "incidentId": 3301,
    "deliveryOrderId": 90113,
    "incidentCode": "CLIENTE_AUSENTE",
    "incidentType": "LOGISTICO",
    "severity": "ALTA",
    "description": "Local cerrado en horario comercial. No responden llamadas.",
    "photoUrl": "https://venado-logistics-s3.s3.amazonaws.com/incidents/2026/07/inc_1001.jpg",
    "requiresReturn": true,
    "resolutionStatus": "PENDING",
    "resolvedAt": null,
    "createdAt": "2026-07-16T09:08:00.000Z"
  },
  { "...": "..." }
]
```

---

## A.10 · findPodsByDeliveryIds(deliveryOrderIds)

**Lifeline:** Proof Of Delivery DB

**Qué hace:** trae **el comprobante** — la pestaña *Comprobante*. Devuelve **menos filas que entregas**,
y eso es correcto: solo la entrega efectiva deja firma.

**Consulta:**

```sql
SELECT id, delivery_order_id, receiver_name, receiver_document,
       signature_url, photo_url, gps_lat, gps_lon,
       pod_status, pod_result_code, device_id,
       captured_at, uploaded_at, notes
FROM   proof_of_deliveries
WHERE  delivery_order_id = ANY($1) AND deleted_at IS NULL;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `podId` | number | `:432` | Identidad |
| `deliveryOrderId` | number | `:433` | La entrega |
| `receiverName` | string | `:434` | "Recibió" |
| `receiverDocument` | string \| null | `:435` | "Documento" |
| `signatureUrl` | string \| null | `:436` | **La firma.** URL de S3, no el archivo |
| `photoUrl` | string \| null | `:437` | **La foto de la entrega.** `null` = cerró sin foto, y el panel lo dice |
| `gpsLat` / `gpsLon` | number \| null | `:438-439` | Dónde se capturó la firma — puede diferir de la parada: el chofer firma en la puerta |
| `podStatus` | string \| null | `:440` | `CAPTURED` / `APPROVED` (§ 29) |
| `deviceId` | number \| null | `:442` | **Un `BIGINT` sin FK** — hueco (4) |
| `capturedAt` | string | `:443` | Reloj del dispositivo |
| `uploadedAt` | string \| null | `:444` | Reloj del servidor. Se separan si el chofer firmó sin cobertura |
| `isOfflineCaptured` | boolean | **SIN COLUMNA** | La app lo manda (§ 29). Es lo que EXPLICA la diferencia de arriba |

**JSON recuperado:**

```json
[
  {
    "podId": 12044,
    "deliveryOrderId": 90112,
    "receiverName": "Lic. Roberto Gómez",
    "receiverDocument": "4829102 SC",
    "signatureUrl": "https://venado-logistics-s3.s3.amazonaws.com/pod/2026/07/pod_1001_sign.png",
    "photoUrl": "https://venado-logistics-s3.s3.amazonaws.com/pod/2026/07/pod_1001_photo.jpg",
    "gpsLat": -17.786492,
    "gpsLon": -63.174233,
    "podStatus": "CAPTURED",
    "podResultCode": null,
    "deviceId": 9041,
    "capturedAt": "2026-07-16T08:34:00.000Z",
    "uploadedAt": "2026-07-16T08:36:12.000Z",
    "notes": null
  },
  { "...": "..." }
]
```

---

## A.11 · findHistoriesByDeliveryIds(deliveryOrderIds)

**Lifeline:** Delivery Order History DB

**Qué hace:** trae **el timeline de cada entrega** — la pestaña *Historial*. Es la bitácora de la
ENTREGA; el ciclo de vida del viaje (`departure_date` → `completed_date`) **no tiene bitácora** en
v0.0.3 — hueco (12).

**Consulta:**

```sql
SELECT id, delivery_order_id, status, reason, created_at, created_by
FROM   delivery_order_histories
WHERE  delivery_order_id = ANY($1) AND deleted_at IS NULL
ORDER  BY created_at;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en el mapa |
|---|---|---|---|
| `historyId` | number | `:480` | Identidad |
| `deliveryOrderId` | number | `:481` | La entrega |
| `status` | string | `:482` | Cada punto del timeline, con su color |
| `reason` | string \| null | `:483` | La nota debajo del punto |
| `createdAt` | string | `:487` | La hora |
| `createdBy` | string \| null | `:485` | **Sin autor modelado**: `VARCHAR` libre, sin FK — hueco (10) |

**JSON recuperado:**

```json
[
  { "historyId": 77010, "deliveryOrderId": 90112, "status": "PENDING",  "reason": null, "createdAt": "2026-07-16T08:00:00.000Z", "createdBy": null },
  { "historyId": 77012, "deliveryOrderId": 90112, "status": "ENROUTE",  "reason": null, "createdAt": "2026-07-16T08:13:00.000Z", "createdBy": null },
  { "historyId": 77014, "deliveryOrderId": 90112, "status": "ARRIVED",  "reason": null, "createdAt": "2026-07-16T08:25:00.000Z", "createdBy": null },
  { "historyId": 77019, "deliveryOrderId": 90112, "status": "DELIVERED","reason": null, "createdAt": "2026-07-16T08:34:00.000Z", "createdBy": null },
  { "...": "..." }
]
```

---

## A.12 · query(PK=ROUTE#{routeId}) — DynamoDB

**Lifeline:** Truck Tracking (DynamoDB)

**Qué hace:** trae **la última posición conocida** del camión. Es la Query de la TRAZA, no del ítem
ACTUAL, porque esta pantalla también quiere el recorrido real y el ACTUAL se pisa en cada ping.

**Consulta:**

```
Query  TableName = truck_tracking
       KeyConditionExpression = "pk = :pk"
       ExpressionAttributeValues = { ":pk": "ROUTE#512" }
       ScanIndexForward = false          -- del más nuevo al más viejo
       Limit = 1
```

Para el recorrido real (opcional, si se quiere dibujar por dónde anduvo de verdad y no la polilínea
planificada): la misma `pk` **sin** `Limit`, o `SK BETWEEN 'TS#t1' AND 'TS#t2'`.

**JSON recuperado (ítem crudo de Dynamo):**

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

**Y ya resuelto para la pantalla** (`pk`/`sk` no se exponen; `trackedAt` sale del prefijo `TS#`):

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

---

## A.13 · buildDetail(...) — el armado y la RESPUESTA FINAL

**Lifeline:** Monitoring Service (auto-llamada)

**Qué hace:** cruza todo por sus claves y ordena las paradas por `sequence`.

**Los cruces, en orden:**

```
A.3.dispatchDeliveryPointId  ─┬─▶  A.4  (la parada)
                              ├─▶  A.5  (sus pedidos)
                              └─▶  A.7  (su entrega)
A.4.deliveryPointId          ───▶  A.6  (sus coordenadas)
A.7.deliveryOrderId          ─┬─▶  A.8  (ítems)
                              ├─▶  A.9  (incidencias)
                              ├─▶  A.10 (comprobante)
                              └─▶  A.11 (historial)
```

**Tres cosas se DERIVAN acá** y por eso no salen de ninguna consulta:

| Derivado | Cómo se calcula |
|---|---|
| `progress` | Conteo de `status` sobre las entregas de A.7 |
| `outOfWindow` (por parada) | `deliveredAt` fuera de `deliveryWindowStart/End` |
| El corte "hecho vs pendiente" del trazo | La última entrega cerrada por `sequence` |

**Y el recorrido se compone de tres fuentes:**

```
recorrido = [ depósito (A.1a) , ...paradas por sequence (A.3 + A.6) , depósito (A.1a) ]
```

Se devuelven **por separado** —`deposito`, `paradas[]` y `route.encodePolyline`— y no como una lista de
vértices ya armada: si viniera mezclada, el frontend no podría distinguir *"este vértice es una
esquina"* de *"este vértice es el cliente X"*.

### RESPUESTA FINAL del snapshot

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
      "licensePlate": "3456-ABC",
      "nameDriverEmployee": "Carlos Mamani",
      "driverEmployeeId": 456,
      "transportStatus": "EN_RUTA",
      "departureDate": "2026-07-16T08:00:00.000Z",
      "completedDate": null,
      "encodePolyline": "}_o~F~ps|U_ulLnnqC_mqNvxq`@",
      "etaTotalDistanceM": 48250.00,
      "etaTotalTimeS": 9600.00
    },
    "progress": {
      "total": 6,
      "delivered": 1,
      "failed": 0,
      "returned": 0,
      "incidents": 1,
      "pending": 4,
      "progressPct": 33,
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
        "receiverName": "Lic. Roberto Gómez",
        "deliveryResultCode": null,
        "outOfWindow": false,
        "pedidos": [
          { "candidateOrderId": 7781, "salesOrderId": "SO-88213", "documentId": "1000026565", "totalWeightKg": 320.40, "totalVolumeM3": 1.10, "typeMovement": "VENTA" },
          { "...": "..." }
        ],
        "items": [
          { "deliveryOrderItemId": 55201, "productId": 78, "plannedQty": 24, "loadedQty": 24, "deliveredQty": 24, "returnedQty": 0, "itemStatus": "DELIVERED" },
          { "...": "..." }
        ],
        "incidencias": [],
        "comprobante": {
          "podId": 12044,
          "receiverName": "Lic. Roberto Gómez",
          "receiverDocument": "4829102 SC",
          "signatureUrl": "https://venado-logistics-s3.s3.amazonaws.com/pod/2026/07/pod_1001_sign.png",
          "photoUrl": "https://venado-logistics-s3.s3.amazonaws.com/pod/2026/07/pod_1001_photo.jpg",
          "gpsLat": -17.786492,
          "gpsLon": -63.174233,
          "podStatus": "CAPTURED",
          "capturedAt": "2026-07-16T08:34:00.000Z",
          "uploadedAt": "2026-07-16T08:36:12.000Z"
        },
        "historial": [
          { "historyId": 77010, "status": "PENDING", "reason": null, "createdAt": "2026-07-16T08:00:00.000Z" },
          { "historyId": 77019, "status": "DELIVERED", "reason": null, "createdAt": "2026-07-16T08:34:00.000Z" }
        ]
      },
      { "...": "una por parada" }
    ]
  }
}
```

**Y con eso la pantalla ya tiene TODO.** El panel izquierdo, los pines, el trazo y las cinco pestañas del
panel derecho se pintan de este JSON. **Abrir una parada no genera ninguna llamada más.**

---

# PARTE B — Cómo cambia la información en tiempo real

## B.0 · La pregunta primero: ¿cada pulso nos manda todo?

**No.** Y esta es la parte que más conviene tener clara, porque el mapa tiene **dos productores
distintos** y se comportan distinto:

| Qué cambia | Quién lo produce | Cada cuánto | Evento | Scope |
|---|---|---|---|---|
| **Posición del camión** | El **celular** del chofer, **automático**, sin que nadie toque nada | Cada **10-15 s** mientras se mueve | `tracking` | `ROUTE#{routeId}` |
| "En camino a la parada" | El **chofer**, apretando un botón | **1 vez** por parada | `delivery_enroute` | `ORDER#{transportOrderId}` |
| "Llegué a la parada" | El chofer, apretando un botón | 1 vez por parada | `delivery_arrived` | `ORDER#{transportOrderId}` |
| "Entregado / con incidencia" | El chofer, al cerrar | 1 vez por parada | `delivery_closed` | `ORDER#{transportOrderId}` |
| **Cobro registrado** | El chofer, al cobrar | **1 a 3 veces** (puede ser parcial) | `payment_registered` | `ORDER#{transportOrderId}` |
| **Confirmación del banco** | Ms Cobranzas, cuando el QR se paga | 1 vez por QR | `payment_status` | `ORDER#{transportOrderId}` |

Tres consecuencias que hay que leer juntas:

1. **El pulso de posición NO lleva estados.** Un ping trae coordenadas, batería y hora. Nada más. Si el
   chofer entregó algo, eso llega por su propio evento, en su propio momento.
2. **Los cambios de estado NO esperan al próximo pulso.** Se publican al instante: el planificador ve
   "entregado" cuando el chofer cierra, no hasta 15 segundos después.
3. **Nadie pregunta cada tanto.** No hay polling en ninguna de las dos vías: cada productor emite cuando
   tiene algo. Entre parada y parada, lo único que viaja son los pings de posición.

```
   App del chofer                    Backend                     Pantalla del mapa
   ─────────────                     ───────                     ─────────────────
   GPS cada 10-15 s  ──▶ POST /monitoring/tracks ──▶ escribe 2 items ──▶ event: tracking
                                                     publica al bus        (scope ROUTE#)

   Botón "en camino" ──▶ PATCH .../on-the-way  ──▶ UPDATE + historial ──▶ event: delivery_enroute
   Botón "llegada"   ──▶ PATCH .../arrive      ──▶ UPDATE + historial ──▶ event: delivery_arrived
   Cierra (POD/inc.) ──▶ POST .../pod|incidents──▶ UPDATE + historial ──▶ event: delivery_closed
                                                                          (scope ORDER#)
```

---

## B.1 · Abrir la conexión (una sola, dos scopes)

**Método:**

```
GET /monitoring/orders/{transportOrderId}/stream        (Accept: text/event-stream)
```

**Cadena de métodos:**

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.1.1 | `GET /monitoring/orders/{id}/stream` | Gateway Controller | Recibe la petición y la mantiene abierta |
| B.1.2 | `openDetailStream(transportOrderId)` | Monitoring Controller → Service | Resuelve el `routeId` de la orden (ya lo tiene de A.1) |
| B.1.3 | `subscribe(ROUTE#{routeId})` | SSE Bus | Suscribe al scope del **camión** |
| B.1.4 | `subscribe(ORDER#{transportOrderId})` | SSE Bus | Suscribe al scope de la **orden** |

**Una sola conexión HTTP, dos suscripciones.** Los dos scopes existen porque los hechos son de dos
entidades distintas: la posición es del camión (la ruta) y la entrega es de la orden. Colapsarlos
obligaría al servidor a traducir de ruta a órdenes consultando Postgres **en cada ping**.

**Cabeceras de la respuesta:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no          -- para que el proxy no acumule el cuerpo
```

Con `routeId = null` se abre igual, solo con el scope de la orden: una orden sin ruta puede recibir
eventos de entrega, no de posición.

---

## B.2 · Pulso de posición (el ping del camión)

**Quién lo dispara:** el celular del chofer, **automáticamente**, cada 10-15 s en movimiento, solo si se
desplazó más de ~50 m, y se corta cuando el camión está detenido. Es lo que evita quemar la batería.

**Cadena de métodos (§ 24 del doc oficial):**

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.2.1 | `POST /monitoring/tracks` | Gateway → Tracking Controller | Recibe el ping |
| B.2.2 | `saveTrack(trackDto)` | Tracking Service | Valida y orquesta |
| B.2.3 | `stampReceivedAt(track)` | Tracking Service | Estampa el reloj del **servidor** |
| B.2.4 | `putItem(TRAZA)` | Truck Tracking (DynamoDB) | **Append**: `PK=ROUTE#{routeId}`, `SK=TS#{trackedAt}` |
| B.2.5 | `putItem(ACTUAL)` | Truck Tracking (DynamoDB) | **Overwrite**: `PK=FLEET#{distributorId}`, `SK=ROUTE#{routeId}` |
| B.2.6 | `publish(tracking, routeId)` | SSE Bus | Publica con scope de RUTA |
| B.2.7 | `event: tracking` | Frontend | Lo reciben todas las pantallas suscritas a esa ruta |
| B.2.8 | `patchByRouteId(item)` | Frontend | Parchea el estado local |

**1 · Lo que manda la app (`trackDto`):**

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

**2 · Después de `stampReceivedAt` (B.2.3):**

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

**Por qué DOS relojes:** `trackedAt` lo pone el celular, `receivedAt` el servidor. Un celular en zona
muerta buferea y sube tarde, y ahí los dos se separan minutos. Con un solo reloj **no hay forma de
distinguir "no se movió" de "no reportó"**.

**3 · Los dos ítems que se escriben (B.2.4 y B.2.5):**

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

**Dos escrituras por ping, a propósito:** la TRAZA responde *"¿por dónde anduvo esta salida?"* y el
ACTUAL existe **solo** para que el listado de flota traiga 40 camiones en **una** Query. Son ~192.000
escrituras/día con 40 camiones, y es el precio de que las dos preguntas del monitor cuesten una Query.

**4 · El evento que llega a la pantalla (B.2.7):**

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

**Tal como llega por el cable:**

```
id: 1784201079000-512
event: tracking
data: {"routeId":512,"latitude":-17.783412,"longitude":-63.181245,"battery":74,
       "trackedAt":"2026-07-16T08:24:39.000Z","receivedAt":"2026-07-16T08:24:40.180Z"}

```

**5 · Qué repinta (B.2.8):** el pin del camión (interpolando entre la posición anterior y la nueva), la
batería de la cabecera, el "última señal" y el corte del trazo recorrido. **Ninguna parada se toca.**

---

## B.3 · Cambio a "En camino"

**Quién lo dispara:** el chofer, botón **"Estoy en camino"** (§ 28 del doc oficial). Una vez por parada.

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.3.1 | `PATCH /last-mile/deliveries/{id}/on-the-way` | Gateway → Delivery Controller | Recibe |
| B.3.2 | `setDeliveryOnTheWay(deliveryOrderId)` | Delivery Service | Orquesta |
| B.3.3 | `UPDATE delivery_orders SET status='ENROUTE'` | Delivery Order DB | Cambia el estado |
| B.3.4 | `INSERT delivery_order_histories` | Delivery Order History DB | Deja el rastro en el timeline |
| B.3.5 | `sendOnTheWayNotification(...)` | evenado MS | **Avisa al CLIENTE** (fuera del monitor) |
| B.3.6 | `publish(delivery_enroute, transportOrderId)` | SSE Bus | Publica con scope de ORDEN |
| B.3.7 | `event: delivery_enroute` | Frontend | Llega a la pantalla |
| B.3.8 | `patchByDeliveryOrderId(evento)` | Frontend | Parchea **una** parada |

**Lo que se escribe en la BD:**

```json
{
  "deliveryOrderId": 1001,
  "status": "ENROUTE",
  "updatedBy": "driver_78"
}
```

**El evento que llega a la pantalla:**

```json
{
  "deliveryOrderId": 1001,
  "status": "ENROUTE",
  "etaTime": "08:30"
}
```

**Qué repinta:** el pin de esa parada y su tarjeta pasan a "En camino". **Sin este evento el mapa pierde
el estado más útil de una pantalla de vigilancia**: saber hacia dónde va el camión ahora.

---

## B.4 · Cambio a "Llegó al punto"

**Quién lo dispara:** el chofer, botón **"Marcar llegada"** (§ 28). Captura el GPS real del camión en el
local del cliente.

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.4.1 | `PATCH /last-mile/deliveries/{id}/arrive` | Gateway → Delivery Controller | Recibe con las coordenadas |
| B.4.2 | `markDeliveryArrival(id, dto)` | Delivery Service | Orquesta |
| B.4.3 | `UPDATE delivery_orders SET arrived_at, status='ARRIVED', arrival_latitude, arrival_longitude` | Delivery Order DB | Escribe la llegada |
| B.4.4 | `INSERT delivery_order_histories` | Delivery Order History DB | Timeline |
| B.4.5 | `sendArrivalNotification(...)` | evenado MS | Avisa al cliente (fuera del monitor) |
| B.4.6 | `publish(delivery_arrived, transportOrderId)` | SSE Bus | Scope de ORDEN |
| B.4.7 | `event: delivery_arrived` | Frontend | Llega |
| B.4.8 | `patchByDeliveryOrderId(evento)` | Frontend | Parchea una parada |

**Lo que manda la app:**

```json
{
  "arrivalLat": -17.783312,
  "arrivalLon": -63.182145
}
```

**El evento que llega a la pantalla:**

```json
{
  "deliveryOrderId": 1001,
  "status": "ARRIVED",
  "arrivedAt": "2026-07-31T08:15:00.000Z",
  "arrivalLatitude": -17.783312,
  "arrivalLongitude": -63.182145
}
```

**Qué repinta:** el pin pasa a "En el punto" y la tarjeta muestra la hora de llegada.

**Para qué sirve el GPS de la llegada, si ya tenemos el del camión:** para **compararlos**. Si el chofer
marcó llegada a 800 m del cliente, el pin de la parada y el del camión no coinciden y eso se ve en el
mapa. Es el dato que delata una llegada marcada desde la esquina.

---

## B.5 · Cierre de la parada (entregada, o con incidencia)

**Quién lo dispara:** el chofer, al registrar el **comprobante** (§ 29) o una **incidencia** (§ 30).

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.5.1 | `POST /api/uploadFolderCustomersAwsS3` | AWS S3 | **Fuera de alcance**: sube la foto/firma y devuelve la URL |
| B.5.2 | `POST .../pod` o `POST .../incidents` | Gateway → Delivery Controller | Recibe con la URL de S3 |
| B.5.3 | `INSERT proof_of_deliveries` | Proof Of Delivery DB | Firma, foto, receptor, GPS |
| B.5.3b | `INSERT delivery_incidents` | Delivery Incident DB | Si hubo incidencia |
| B.5.4 | `UPDATE delivery_orders SET delivered_at, status, delivery_result_code, receiver_name` | Delivery Order DB | Cierra la entrega |
| B.5.5 | `UPDATE delivery_order_items SET delivered_qty, returned_qty` | Delivery Order Item DB | Cantidades finales |
| B.5.6 | `INSERT delivery_order_histories` | Delivery Order History DB | Timeline |
| B.5.7 | `publish(delivery_closed, transportOrderId)` | SSE Bus | Scope de ORDEN |
| B.5.8 | `event: delivery_closed` | Frontend | Llega |
| B.5.9 | `patchByDeliveryOrderId(evento)` | Frontend | Parchea una parada + el progreso |

**El evento — parada entregada:**

```json
{
  "deliveryOrderId": 1001,
  "status": "DELIVERED",
  "deliveredAt": "2026-07-31T09:52:00.000Z",
  "deliveryResultCode": null,
  "receiverName": "Lic. Roberto Gómez",
  "hasIncident": false,
  "hasProof": true
}
```

**El evento — parada con incidencia:**

```json
{
  "deliveryOrderId": 1002,
  "status": "INCIDENT",
  "deliveredAt": "2026-07-31T10:14:00.000Z",
  "deliveryResultCode": "CLIENTE_AUSENTE",
  "receiverName": null,
  "hasIncident": true,
  "hasProof": false
}
```

**Qué repinta:** el color y la insignia del pin (✓ / ✕ / ↩), la tarjeta del panel izquierdo, **la barra
de progreso** de la cabecera, y el panel derecho si esa parada está abierta.

### Lo que este evento NO trae, y hay que decidir

**No trae la evidencia**: ni el comprobante, ni el detalle de la incidencia, ni las cantidades finales.
`hasProof` y `hasIncident` son el parche mínimo para que el panel no mienta —puede decir "hay
comprobante, recargá" en vez de "sin comprobante"— pero no reemplazan al dato.

Las dos salidas: mandar el POD y la incidencia **dentro** del evento —engorda un evento que se emite
igual cuando nadie mira— o exponer un `GET /monitoring/deliveries/{deliveryOrderId}` para re-pedir solo
esa parada. **Es el único caso de toda la pantalla donde un endpoint por parada se justifica.**

---

## B.6 · Cobro registrado — el QR ya tiene tabla

**Esto cambió con el esquema nuevo, y cambió a favor.** Ya no es una propuesta a ciegas:

| Pieza | Antes | Ahora |
|---|---|---|
| El MONTO a cobrar | Sin columna. Había que traerlo de SAP | **`delivery_order_items.unit_price_snapshot`**. Y sale mejor: `delivered_qty × unit_price_snapshot` es lo que el cliente REALMENTE recibió |
| El cobro por **QR** | Sin tabla | **`delivery_payment_references`** (`collection_payment_id`, `id_qr`, `amount`, `currency`, `status`) |
| Efectivo · transferencia · cheque | Sin tabla | **Siguen sin tabla.** La app los registra y no hay dónde guardarlos |

**Quién lo dispara:** el chofer, después del comprobante (§ 29 cierra con *"Continuar al Registro de
Cobro"*). Son **varios cobros por entrega y pueden ser parciales**: 200 en QR, 300 en efectivo y 500 a
deber es un caso normal, no un borde.

### El QR, paso a paso (§ 35 del doc oficial)

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.6.1 | `POST /api/v1/collections/qr/generate` | Gateway → Collections Controller | Recibe `deliveryOrderId`, `amount`, `transcationUuid` (idempotencia) |
| B.6.2 | `requestQrGenerationFromMsCobranzas(payload)` | **Ms Cobranzas** (externo) | Pide el QR al banco |
| B.6.3 | `createPaymentReference(...)` | Delivery Payment Reference DB | `INSERT` con `status = 'PENDING'` |
| B.6.4 | `publish(payment_registered, transportOrderId)` | SSE Bus | Scope de ORDEN |
| B.6.5 | *(Diagrama 11)* consulta de estado | Ms Cobranzas | El banco confirma: `PENDING` → `COMPLETED` |
| B.6.6 | `publish(payment_status, transportOrderId)` | SSE Bus | **Este es el que importa para el monitor** |

**Entrada de B.6.1:**

```json
{
  "deliveryOrderId": 1001,
  "transcationUuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "customerId": 90,
  "employeeId": 12,
  "debtDocumentId": 301,
  "amount": 150.00,
  "currency": "BOB",
  "glosa": "Pago Factura #301 - Entrega #1001",
  "expirationMinutes": 30
}
```

**Lo que devuelve el banco (B.6.2):**

```json
{
  "code": 200,
  "message": "Qr generado exitosamente",
  "data": {
    "collectionPaymentId": 1052,
    "idQr": "25051501009100893840",
    "qrBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "expiresAt": "2026-07-31T15:30:00Z",
    "status": "PENDING"
  }
}
```

**El `qrBase64` NO le sirve al monitor** —es para que la app del chofer le muestre el QR al cliente—,
así que no viaja al web. Lo que el monitor necesita del QR son tres cosas: cuánto, con qué referencia
y **si el banco ya confirmó**.

### Los dos eventos que el monitor necesita

| Evento | Cuándo | Payload |
|---|---|---|
| `payment_registered` | El chofer registra un cobro (cualquier método) | El pago completo |
| `payment_status` | El banco confirma o vence el QR | Solo el cambio de estado |

```json
{
  "deliveryOrderId": 1001,
  "pago": {
    "id": "pay-1001-1",
    "metodo": "qr",
    "monto": 200.00,
    "moneda": "BOB",
    "referencia": "25051501009100893840",
    "banco": "BNB",
    "estado": "pendiente",
    "collectionPaymentId": 1052,
    "hora": "2026-07-31T09:55:00.000Z"
  },
  "resumen": { "aCobrar": 1000.00, "cobrado": 300.00, "enProceso": 200.00, "saldo": 500.00 }
}
```

```json
{
  "deliveryOrderId": 1001,
  "pagoId": "pay-1001-1",
  "collectionPaymentId": 1052,
  "estado": "confirmado",
  "confirmadoAt": "2026-07-31T09:57:12.000Z",
  "resumen": { "aCobrar": 1000.00, "cobrado": 500.00, "enProceso": 0, "saldo": 500.00 }
}
```

**Scope de ORDEN y no de ruta**, por lo mismo que las entregas: el cobro es de un documento, no del
camión. El `resumen` viaja en los dos eventos a propósito — evita que el cliente tenga que recalcular
sumas que el servidor ya hizo, que es la misma razón por la que `order_progress` manda el contador
resuelto.

### Los cuatro montos que el monitor muestra

| Monto | Cómo sale |
|---|---|
| **Facturado** | `Σ planned_qty × unit_price_snapshot` — lo que decía la nota de entrega |
| **A cobrar** | `Σ delivered_qty × unit_price_snapshot`, menos la parte a crédito. **Lo que el cliente realmente recibió** |
| **Cobrado** | Σ de los pagos confirmados |
| **Saldo** | `aCobrar − cobrado − enProceso` |

La diferencia entre *facturado* y *a cobrar* es lo que el cliente rechazó, y es exactamente lo que hace
que la caja del chofer cuadre o no. Con el total de la factura, ese número no se podía calcular.

### Lo que falta

1. **Tabla para efectivo, transferencia y cheque.** Hoy solo el QR se persiste. Sin ellas, el 70% de
   los cobros del reparto no tiene dónde guardarse — y son justo los que no dejan rastro bancario.
2. **La bandera de `delivery_orders`.** El esquema tiene el comentario `--// booleano si se realizo un
   cobro` sin resolver. Un booleano no alcanza para cobros parciales: hay que decidir si se guarda el
   estado (`SIN_COBRAR` / `PARCIAL` / `COBRADO`) o se deriva de la suma de los pagos.
3. **Atribución por pedido.** `delivery_order_items.sales_order_id` ya existe, así que se puede saber
   qué ítem es de qué pedido y cobrar exacto lo que no va a crédito. El mock lo aproxima en proporción.

## B.7 · Heartbeat y reconexión

**Heartbeat:** cada ~15 s el servidor manda un comentario del protocolo. No es un evento y el cliente lo
descarta; existe porque una salida puede pasar minutos sin novedades y los intermediarios cierran
conexiones ociosas.

```
: heartbeat

```

**Reconexión:** `EventSource` reconecta solo, pero durante el corte se pierden eventos. La regla es
**re-pedir el snapshot** (toda la Parte A otra vez), no reproducir con `Last-Event-ID`:

1. Un monitor necesita el estado **de AHORA**, no el historial de lo que pasó mientras nadie miraba.
2. Reproducir cuatro minutos de `tracking` animaría el pasado y después saltaría al presente.
3. Re-pedir es lo **único** que recupera la evidencia de las paradas que cerraron durante el corte (B.5).

El cliente además muestra la **frescura de la pantalla** ("En vivo" / "Actualizado hace X min"), que es
de la CONEXIÓN y no de un camión: sin ella, una pantalla muerta se ve idéntica a una flota detenida.

---

## B.8 · Resumen: qué repinta cada evento

| Evento | Clave del payload | Mapa | Panel izquierdo | Panel derecho | Progreso |
|---|---|---|---|---|---|
| `tracking` | `routeId` | Pin del camión, trazo recorrido | Batería, última señal | — | — |
| `delivery_enroute` | `deliveryOrderId` | Color del pin | Etiqueta de la tarjeta | Si está abierta | — |
| `delivery_arrived` | `deliveryOrderId` | Color del pin | Hora de llegada | Si está abierta | — |
| `delivery_closed` | `deliveryOrderId` | Color + insignia | Estado y "llegada → cierre" | Si está abierta | **Sí** |
| `payment_registered` | `deliveryOrderId` | — | — | Pestaña *Cobro* | — |
| `payment_status` | `deliveryOrderId` | — | — | Pestaña *Cobro* (el QR pasa a confirmado) | — |

**El cliente necesita DOS índices**, y es la misma asimetría de los scopes:

```
Map<routeId, ...>            → para tracking     (puede tocar N filas)
Map<deliveryOrderId, ...>    → para las entregas (toca UNA parada)
```

Con un solo índice, un ping mueve una fila y deja la otra congelada. El merge tiene que ser **por
entidad e inmutable** (`{ ...prev, [id]: { ... } }`): reconstruir la colección re-renderiza las 20
paradas en cada ping.

---

## B.9 · Lo que NO viaja por el stream, a propósito

| Qué | Por qué no |
|---|---|
| `order_progress` (el contador ya sumado) | Acá están las entregas una por una, el cliente lo calcula. Ese evento es del **listado de flota**, que muestra el contador y no las paradas |
| El chequeo ítem por ítem del chofer (`verifyDeliveryItems`, § 29) | Son decenas de toques por parada y el monitor no muestra el checklist. Se entera del resultado al cerrar |
| Las notificaciones al cliente (`evenado MS`: `DRIVER_ON_THE_WAY`, `DRIVER_ARRIVED`) | Son del cliente final, no del planificador. Se podría mostrar "cliente notificado", y hoy no está pedido |
| La subida de la foto a S3 | Es de la app del chofer. El monitor recibe la URL ya resuelta |

---

# Anexo I — Inventario: cada cosa que se ve en pantalla

`A` = viene en el snapshot (Parte A) · `B.x` = además se actualiza en vivo · `cliente` = derivado.

### Mapa

| Lo que se ve | Campo | Origen |
|---|---|---|
| Pin del almacén | `deposito.latitude` / `longitude` / `name` | A.1a |
| Trazo del recorrido | `route.encodePolyline` + `deposito` + `paradas[].latitude/longitude` | A.2, A.1a, A.6 |
| Corte sólido (hecho) vs punteado (falta) | **Derivado**: última parada cerrada por `sequence` | A.13 + **B.5** |
| Pin numerado de cada parada | `paradas[].sequence` + coordenadas | A.3 + A.6 |
| Color del pin | `paradas[].status` | A.7 + **B.3, B.4, B.5** |
| Insignia ✓ / ✕ / ↩ | `paradas[].status`, solo si cerró | A.7 + **B.5** |
| Pin del camión | `tracking.latitude` / `longitude` | A.12 + **B.2** |
| Movimiento fluido entre pings | **Cliente**: interpola entre dos posiciones | cliente |
| Tooltip del camión (batería, última señal) | `tracking.battery`, `tracking.trackedAt` | A.12 + **B.2** |
| Color del recorrido y del pin del camión | **SIN ORIGEN**: sale de la UI del planificador | — |
| Capa Calles/Satélite, zoom, encuadre | — | cliente |

### Panel izquierdo (paradas)

| Lo que se ve | Campo | Origen |
|---|---|---|
| Placa del camión | `route.licensePlate` | A.2a |
| Chofer | `route.nameDriverEmployee` | A.2 |
| Batería | `tracking.battery` | A.12 + **B.2** |
| Barra de progreso y contador `n/total` | `progress.*` | A.13 + **B.5** |
| "En vivo / Actualizado hace X" | — | cliente (B.7) |
| Buscador y los tres chips | — | cliente |
| Marcador y riel vertical de cada tarjeta | `paradas[].sequence` + `status` | A.3, A.7 + **B.3-B.5** |
| Cliente y punto de entrega | `paradas[].customerName` | A.4 |
| ⚠️ de incidencia | `paradas[].incidencias.length > 0` | A.9 + **B.5** |
| 🕐 fuera de ventana | `paradas[].outOfWindow` | A.13 |
| "Llegada → cierre", o "Ventana HH:mm" | `arrivedAt`, `deliveredAt`, `deliveryWindow*` | A.4, A.7 + **B.4, B.5** |
| Leyenda del encoding | — | cliente |

### Panel derecho (5 pestañas)

| Pestaña | Campo | Origen |
|---|---|---|
| Cabecera | `sequence`, `customerName`, `status`, ventana, llegada, cierre, `N pedidos · peso · volumen`, motivo | A.3, A.4, A.5, A.7 |
| **Historial** | `historial[]`: `status`, `createdAt`, `reason`, `createdBy` | A.11 |
| **Incidencias** | `incidencias[]`: tipo, severidad, código, `requiresReturn`, `photoUrl`, `resolutionStatus` | A.9 |
| **Comprobante** | `comprobante`: receptor, documento, `signatureUrl`, `photoUrl`, GPS, `capturedAt` / `uploadedAt` | A.10 |
| **Pedido** | `pedidos[]` (SAP) + `items[]` (cargado / entregado / devuelto) | A.5, A.8 |
| **Cobro** | ⚠️ **Propuesta** | B.6 |

---

# Anexo II — Lo que no tiene origen y hay que resolver

| Falta | Impacto en esta pantalla |
|---|---|
| **Efectivo, transferencia y cheque** | No tienen tabla. Solo el QR se persiste (`delivery_payment_references`), y es el método que MENOS falta hace registrar: ya deja rastro bancario |
| **La bandera de cobro de `delivery_orders`** | El esquema la deja comentada. Un booleano no alcanza para cobros parciales |
| **Coordenadas de las paradas** | Dependencia externa (A.6). La documentación del proyecto la trata de **tres** formas distintas: servicio por lote (acá), `delivery_point DB` en loop (§ 08) y tabla snapshot (`product_snapshot`, § 21-22). Hay que unificar |
| **Código visible de la orden** | `transport_order` no tiene columna de código; el encabezado lo muestra igual |
| **Color de la ruta / del camión** | Es lo único que ata visualmente al mismo camión entre planificación y monitoreo. Hoy es estado de UI |
| **Teléfono del chofer** | El botón natural de esta pantalla es llamarlo, y no hay número |
| **Autor del historial** (`created_by`) | Una bitácora sin autor no contesta "quién cerró esta entrega así" |
| **`routes.distributor_id`** | Sin ella no se compone `FLEET#{distributorId}`, la PK del ítem ACTUAL |
| **Bitácora de la SALIDA** | `departure_date` / `completed_date` son campos pisables sin historial detrás |
| **Incidencias de la SALIDA** | `delivery_incidents.delivery_order_id` es `NOT NULL`: un camión averiado no tiene dónde registrarse |
