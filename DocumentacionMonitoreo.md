# Documentacion tecnica - Monitoreo e Historial de OT

> **v1.2.0 - 2026-08-26.** Rehecho contra `db_script.sql` vigente y ajustado considerando Dynamo para telemetria.  
> Este documento **no usa `trip` ni `TRIP#...` como base del modelo relacional**.

## 1. Fuente de verdad

Las fuentes de verdad para este documento son:

1. `db_script.sql` para el modelo relacional operativo
2. DynamoDB para telemetria de monitoreo:
   - traza historica del camion
   - posicion actual del camion

Fuentes auxiliares, solo para entender pantallas y alcance funcional:

1. `src/mockup/views/MonitoreoEHistorialOTView.tsx`
2. `src/mockup/views/HistorialOrdenesTransporteView.tsx`
3. `src/mockup/views/HistorialRevisionesView.tsx`
4. `src/mockup/monitoreo/*.tsx`

Regla de este documento:

- si un campo no existe en `db_script.sql`, no se documenta como parte del **modelo relacional** vigente;
- la telemetria de posicion actual y traza historica se documenta como componente **Dynamo**, separado del relacional;
- si una pantalla mock lo usa igual, se marca como **desalineacion del mockup**;
- como en este repo no hay controladores backend reales para este modulo, los endpoints de este documento son **inferencias de API** basadas en la DB actual y en el flujo de pantalla.

## 2. Archivos trabajados el 2026-08-25

Los cambios de ayer que impactan este modulo fueron estos:

| Estado | Archivo | Uso en el modulo |
|---|---|---|
| `A` | `src/mockup/views/MonitoreoEHistorialOTView.tsx` | Nueva vista maestra con tres lentes: `LIVE`, `HISTORY`, `AUDIT` |
| `M` | `src/mockup/monitoreo/MonitoreoView.tsx` | Listado vivo por OT y por pedido |
| `M` | `src/mockup/monitoreo/MonitoreoDetalleView.tsx` | Seguimiento detallado |
| `M` | `src/mockup/monitoreo/ViajeDialog.tsx` | Dialogo de detalle del viaje |
| `M` | `src/mockup/monitoreo/TablaViajeMonitoreo.tsx` | Tabla por parada |
| `A` | `src/mockup/monitoreo/TablaPedidosViaje.tsx` | Nueva tabla por pedido |
| `M` | `src/mockup/monitoreo/use-flota-viva.ts` | Mock de refresco vivo |
| `M` | `src/mockup/monitoreo/monitoreo-data.ts` | Proyeccion mock de orden, parada y cobro |
| `M` | `src/mockup/views/HistorialOrdenesTransporteView.tsx` | Historial y liquidacion |
| `M` | `src/mockup/views/HistorialRevisionesView.tsx` | Auditoria de carga |
| `A` | `src/mockup/historial-revisiones-data.ts` | Dataset mock de auditoria |
| `M` | `src/mockup/utils/excel-export.ts` | Exportacion Excel |
| `M` | `src/mockup/routes.tsx` | Rutas UI del modulo |
| `M` | `db_script.sql` | Modelo relacional vigente |

## 3. Flujo funcional actual

La UI quedo organizada en una entrada maestra:

- ruta UI: `/monitoreo-historial`

Con tres pestanas:

1. `LIVE`: monitoreo operativo de OTs en curso
2. `HISTORY`: historial y liquidacion de viajes cerrados
3. `AUDIT`: auditoria de carga y sesiones de conteo

Rutas UI relacionadas:

| Ruta UI | Uso |
|---|---|
| `/monitoreo-historial` | Entrada principal del modulo |
| `/monitoreo` | Entra directo al lente `LIVE` |
| `/monitoreo/seguimiento/:ordenId` | Seguimiento detallado de una OT |
| `/monitoreo/seguimiento/pedido/:pedidoId` | Seguimiento entrando desde un pedido |
| `/reportes/historial-ordenes-transporte` | Listado historico de OTs |
| `/reportes/historial-ordenes-transporte/:otId` | Detalle historico de una OT |
| `/reportes/historial-revisiones` | Historial de revisiones y auditoria |

## 4. Modelo de datos vigente en la DB

## 4.1 Cabecera de OT y contexto operativo

Tablas base:

| Tabla | Uso |
|---|---|
| `transport_orders` | Cabecera operativa de la OT |
| `distributors` | Centro de distribucion |
| `routes` | Ruta asignada y geometria planeada (`encode_polyline`) |
| `trucks` | Camion asignado |
| `dispatch_plans` | Fecha operativa y plan de despacho origen |

Campos relevantes de `transport_orders`:

| Campo | Uso |
|---|---|
| `id` | PK de la OT |
| `dispatch_plan_id` | Plan origen |
| `distributor_id` | Distribuidora responsable |
| `route_id` | Ruta asignada |
| `truck_id` | Camion asignado |
| `driver_employee_id`, `name_driver_employee` | Chofer |
| `helper_employee_id`, `name_helper_employee` | Ayudante |
| `supervisor_employee_id`, `name_supervisor_employee` | Supervisor |
| `code` | Codigo numerico de OT |
| `status` | Estado operativo |
| `checked_by` | Usuario/chofer que valida conteo |
| `departure_date` | Salida real |
| `completed_date` | Cierre real |
| `total_km` | Kilometros recorridos |
| `assigned_weight_kg` | Peso asignado |
| `assigned_volume_m3` | Volumen asignado |
| `total_stops_count` | Paradas planificadas |
| `completed_stops_count` | Paradas entregadas exitosamente |
| `total_revenue_expected` | Monto esperado |
| `total_revenue_collected` | Monto recaudado |

## 4.1.1 Telemetria fuera del modelo relacional

Ademas del modelo relacional, el monitoreo considera una fuente separada en DynamoDB para:

1. traza historica del recorrido;
2. posicion actual del camion;
3. consulta rapida del ultimo punto reportado.

Reglas de documentacion para esta parte:

- Dynamo **si existe** como origen del monitoreo en vivo;
- no se toma de `db_script.sql` porque no forma parte del esquema relacional;
- en esta version del documento no se fijan nombres de claves fisicas de Dynamo como contrato, porque lo que vos observaste como incorrecto fue precisamente mezclar esas claves con la DB actual;
- la retencion de la traza **no es de 30 dias ni TTL corto**: puede permanecer por anos y su eliminacion depende de decision operativa/manual.

## 4.2 Paradas y ejecucion de la OT

Tablas base:

| Tabla | Uso |
|---|---|
| `dispatch_delivery_points` | Maestro operativo de la parada |
| `route_delivery_points` | Secuencia planificada en la ruta |
| `delivery_orders` | Ejecucion real de la parada |

Campos relevantes:

### `dispatch_delivery_points`

- `sale_channel_id`
- `delivery_point_id`
- `zone_id`
- `owner_id`, `owner_name`
- `customer_id`, `customer_name`
- `phone_number`
- `address`
- `delivery_window_start`, `delivery_window_end`
- `total_weight_kg`
- `total_volume_m3`
- `total_neto`
- `observations`

### `route_delivery_points`

- `route_id`
- `dispatch_delivery_point_id`
- `sequence`
- `estimated_distance_m`
- `estimated_travel_s`

### `delivery_orders`

- `transport_order_id`
- `dispatch_delivery_point_id`
- `executed_sequence`
- `delivery_note_number`
- `delivery_result_code`
- `status`
- `arrival_latitude`, `arrival_longitude`
- `arrived_at`
- `delivered_at`
- `departure_at`
- `service_time_seconds`
- `travel_time_seconds`

## 4.3 Pedidos, productos, cobros y evidencia

Tablas base:

| Tabla | Uso |
|---|---|
| `delivery_order_sales` | Documentos/pedidos comerciales descargados en la parada |
| `delivery_order_items` | Detalle de producto entregado/devuelto |
| `delivery_payment_references` | Cobros de la entrega |
| `proof_of_deliveries` | POD de la entrega |
| `delivery_incidents` | Incidencias de calle |
| `delivery_order_histories` | Historial de estado por parada |

## 4.4 Auditoria de carga y control de salida

Tablas base:

| Tabla | Uso |
|---|---|
| `truck_inventories` | Inventario consolidado final del camion |
| `transport_order_count_sessions` | Cabecera de sesiones de conteo |
| `transport_order_count_session_items` | Conteo por producto |
| `transport_order_histories` | Historial general de la OT |
| `transport_order_assets` | Activos logisticos de salida/retorno |
| `logistic_assets` | Catalogo de activos logisticos |

## 5. Desalineaciones detectadas entre mockup y DB actual

Estas observaciones son clave para no volver a mezclar mock y modelo real:

1. `transport_orders` **no tiene** `trip_id`.
2. `db_script.sql` **no define** la persistencia de telemetria, porque esa parte vive en DynamoDB y no en Postgres.
3. `routes.encode_polyline` si existe, pero representa la **ruta planificada**, no la traza GPS real del camion.
4. `proof_of_deliveries` tiene `image_url` unico; no hay tabla hija de fotos POD multiples.
5. `image_delivery_points` existe, pero esta ligada a `dispatch_delivery_points`; sirve para fotos del punto, no para evidencia POD historica de entrega.
6. El mock actual de monitoreo mezcla decisiones tecnicas de prototipo con contrato de datos real; esa parte debe alinearse mejor con la arquitectura final.

## 6. Lo que si se puede documentar con la DB actual

Con la base vigente si se puede documentar:

1. el listado de OTs en curso o cerradas;
2. el avance operativo por paradas;
3. la secuencia planificada vs secuencia ejecutada;
4. el detalle por pedido/documento descargado en cada parada;
5. los productos entregados, devueltos o rechazados;
6. los cobros registrados por entrega;
7. el POD de cada entrega;
8. las incidencias y su historial;
9. la auditoria de carga, diferencias y sesiones de conteo;
10. el control de activos logisticos del viaje;
11. la traza y posicion actual del camion como componente de DynamoDB.

## 7. Lo que no se debe documentar como modelo vigente

Con la arquitectura actual no corresponde documentar como vigente, salvo que se valide aparte:

1. `tripId` como clave del monitoreo;
2. `PK = TRIP#...` o `SK = TRIP#...`;
3. un TTL automatico de 30 dias para la traza;
4. un ETL corto como politica de depuracion;
5. cualquier esquema fisico de claves Dynamo que no este validado con arquitectura;
6. cualquier payload de stream que no este validado con backend.

## 8. Inferencias de API basadas en la DB actual

Importante:

- estos endpoints no salen de controladores reales del repo;
- se proponen para documentar la solucion siguiendo la DB actual.

## 8.1 Obtener OTs para monitoreo operativo

Endpoint inferido:

```http
GET /transport-orders/monitoring?distributorId=1&status=ENROUTE&search=
```

Request principal:

| Campo | Tipo | Regla |
|---|---|---|
| `distributorId` | number | Requerido |
| `status` | string | No requerido |
| `search` | string | No requerido |
| `routeId` | number | No requerido |
| `truckId` | number | No requerido |

Fuentes de datos:

- `transport_orders`
- `routes`
- `trucks`
- `dispatch_plans`
- `delivery_orders`
- DynamoDB para posicion actual y traza, cuando la pantalla necesite ubicacion en vivo

Regla de armado:

Para cada OT, el backend debe proyectar:

1. cabecera de `transport_orders`;
2. datos de ruta y camion;
3. resumen de avance real por `delivery_orders`;
4. montos esperados y recaudados de `transport_orders`;
5. posicion actual desde DynamoDB, si hay monitoreo en vivo habilitado.

Response principal:

```json
{
  "status": "Successfully",
  "code": 200,
  "data": [
    {
      "id": 100451,
      "code": 100451,
      "codeLabel": "OT-100451",
      "status": "ENROUTE",
      "distributorId": 1,
      "dispatchPlanId": 78,
      "route": {
        "id": 31,
        "name": "Ruta 01 - Centro / Equipetrol"
      },
      "truck": {
        "id": 12,
        "code": "CAM-012",
        "plate": "3012-ABC",
        "truckType": "Furgon 5 Tn",
        "isRefrigerated": true
      },
      "driver": {
        "employeeId": 101,
        "name": "Carlos Mendoza Vargas"
      },
      "helper": {
        "employeeId": 210,
        "name": "Roberto Quispe Lima"
      },
      "supervisor": {
        "employeeId": 15,
        "name": "Marco Antonio Vaca"
      },
      "departureDate": "2026-08-25T06:30:00Z",
      "completedDate": null,
      "totalKm": 48.5,
      "assignedWeightKg": 3820.0,
      "assignedVolumeM3": 15.4,
      "totalStopsCount": 12,
      "completedStopsCount": 7,
      "totalRevenueExpected": 52400.0,
      "totalRevenueCollected": 34550.0,
      "deliverySummary": {
        "pending": 3,
        "enroute": 1,
        "arrived": 1,
        "delivered": 6,
        "rejected": 1,
        "partialRejected": 1
      },
      "tracking": {
        "currentPosition": {
          "latitude": -17.783210,
          "longitude": -63.182441,
          "capturedAt": "2026-08-26T14:32:10Z"
        },
        "source": "DYNAMODB"
      }
    }
  ]
}
```

Campos principales:

| Campo | Tipo | Regla |
|---|---|---|
| `id` | number | Requerido |
| `code` | number | Requerido |
| `codeLabel` | string | Inferido para UI |
| `status` | string | Requerido |
| `route` | object | Requerido |
| `truck` | object | Requerido |
| `driver` | object | No requerido |
| `helper` | object | No requerido |
| `supervisor` | object | No requerido |
| `departureDate` | string | No requerido |
| `completedDate` | string \| null | No requerido |
| `totalStopsCount` | number | Requerido |
| `completedStopsCount` | number | Requerido |
| `deliverySummary` | object | Inferido por agregacion de `delivery_orders` |
| `tracking` | object \| null | No requerido. Sale de DynamoDB |

## 8.2 Detalle del viaje

Contrato base:

```http
GET /monitoring/orders/{transportOrderId}
```

Objetivo:

- obtener en una sola respuesta toda la informacion necesaria para el monitoreo de una OT;
- combinar modelo relacional de la OT con tracking actual desde DynamoDB.

Request principal:

| Atributo | Tipo | Oblig. | Descripcion / Restriccion |
|---|---|---|---|
| `transportOrderId` | number | Si | Identificador de la orden |

Fuentes de datos:

- `transport_orders`
- `distributors`
- `routes`
- `planning_trucks`
- `trucks`
- `route_delivery_points`
- `dispatch_delivery_points`
- `delivery_orders`
- `delivery_order_sales`
- `delivery_order_items`
- `delivery_payment_references`
- `proof_of_deliveries`
- `delivery_incidents`
- `delivery_order_histories`
- DynamoDB para posicion actual y traza

JSON response final:

```json
{
  "success": true,
  "code": 200,
  "data": {
    "order": {
      "transportOrderId": 4471,
      "code": 4471,
      "codeFormatted": "OT-2026-004471",
      "distributorId": 1,
      "routeId": 512,
      "status": "ENROUTE",
      "departureDate": "2026-07-16T08:00:00.000Z",
      "completedDate": null,
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
      "planningTruckId": 9201,
      "truckId": 880012,
      "licensePlate": "3456-ABC",
      "driverEmployeeId": 456,
      "nameDriverEmployee": "Carlos Mamani",
      "encodePolyline": "}_o~F~ps|U_ulLnnqC_mqNvxq`@",
      "etaTotalDistanceM": 48250.00,
      "etaTotalTimeS": 9600.00,
      "colorHex": "2E86DE"
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
        "executedSequence": 1,
        "customerName": "Casa La Ramada",
        "latitude": -17.786510,
        "longitude": -63.174220,
        "deliveryWindowStart": "08:00",
        "deliveryWindowEnd": "12:00",
        "totalWeightKg": 620.40,
        "totalVolumeM3": 2.30,
        "totalNeto": 2572.67,
        "estimatedDistanceM": 5400.00,
        "estimatedTravelS": 780.00,
        "status": "DELIVERED",
        "arrivedAt": "2026-07-16T08:25:00.000Z",
        "deliveredAt": "2026-07-16T08:34:00.000Z",
        "arrivalLatitude": -17.786498,
        "arrivalLongitude": -63.174241,
        "deliveryResultCode": null,
        "pedidos": [
          {
            "deliveryOrderSaleId": 88021,
            "salesOrderId": 88213,
            "invoiceId": 5001,
            "totalInvoice": 1592.67,
            "candidateOrderId": 7781,
            "documentId": 1000026565,
            "typeMovement": "VENTA",
            "pagos": [
              {
                "paymentId": 12001,
                "collectionPaymentId": 1052,
                "paymentMethod": "QR",
                "referenceNumber": "25051501009100893840",
                "amount": 200.00,
                "currency": "BOB",
                "status": "PENDING"
              }
            ],
            "items": [
              {
                "deliveryOrderItemId": 55201,
                "productId": 78,
                "plannedQty": 24,
                "deliveredQty": 24,
                "returnedQty": 0,
                "unitPriceSnapshot": 66.36,
                "itemStatus": "DELIVERED"
              }
            ]
          }
        ],
        "incidencias": [],
        "comprobante": {
          "podId": 12044,
          "receiverName": "Lic. Roberto Gómez",
          "receiverDocument": "4829102 SC",
          "receiverRelationship": "ENCARGADO_ALMACEN",
          "signatureUrl": "https://venado-logistics-s3.s3.amazonaws.com/pod/2026/07/pod_1001_sign.png",
          "imageUrl": "https://venado-logistics-s3.s3.amazonaws.com/pod/2026/07/pod_1001_photo.jpg",
          "latitude": -17.786492,
          "longitude": -63.174233,
          "status": "CAPTURED",
          "capturedAt": "2026-07-16T08:34:00.000Z",
          "uploadedAt": "2026-07-16T08:36:12.000Z"
        },
        "historial": [
          {
            "historyId": 77010,
            "status": "PENDING",
            "reason": null,
            "capturedAt": "2026-07-16T08:00:00.000Z"
          }
        ]
      }
    ]
  }
}
```

Cambios necesarios sobre este contrato:

1. `tracking` se mantiene y sale de DynamoDB. Esto si queda.
2. `deposito` se mantiene y sale de `distributors`. Esto si queda.
3. `route.planningTruckId` se mantiene porque existe `routes.planning_truck_id`.
4. `route.truckId` puede quedar, pero es una **proyeccion**; no existe como columna en `routes`.
5. `route.licensePlate` puede quedar, pero es una **proyeccion** de `trucks` o `transport_orders.truck_id`.
6. `paradas.sequence` se mantiene y debe salir de `route_delivery_points.sequence`.
7. `paradas.executedSequence` se mantiene y sale de `delivery_orders.executed_sequence`.
8. `paradas.estimatedDistanceM` y `estimatedTravelS` se mantienen y salen de `route_delivery_points`.
9. `paradas.latitude` y `paradas.longitude` no salen del DDL actual de `dispatch_delivery_points`; si se dejan, deben documentarse como coordenadas del maestro externo de puntos de entrega.
10. `pedidos.candidateOrderId` y `pedidos.typeMovement` pueden quedarse, pero son **proyecciones** que requieren resolver `candidate_orders`; en el DDL actual no hay FK directa desde `delivery_order_sales`.

## 8.2.1 Actualizacion de la informacion en tiempo real

Este contrato anterior sigue siendo una buena base, con estos componentes:

### Lifelines

| Lifeline | Que es | Que hace |
|---|---|---|
| `Monitoring Event Publisher` | Componente compartido del backend | Arma el DTO del evento, resuelve el scope y publica |
| `SSE Bus` | Bus de eventos en memoria | Reparte el evento a las conexiones suscritas al scope |

Metodo comun:

```ts
publish(eventName: string, scope: string, payload: object): void
```

Scopes:

| Scope | Que agrupa | Quien escucha |
|---|---|---|
| `FLEET#{distributorId}` | Toda la flota de una distribuidora | Listado de OTs despachadas |
| `ROUTE#{routeId}` | Una salida fisica | Mapa del seguimiento |
| `ORDER#{transportOrderId}` | Una OT | Mapa del seguimiento |

### 26.1 `tracking`

Se mantiene.

- `POST /monitoring/tracks`
- scopes:
  - `ROUTE#{routeId}`
  - `FLEET#{distributorId}`

El payload propuesto sigue siendo valido:

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

### 26.2 `transport_status`

Se mantiene la idea, pero hay que revisar el estado final.

Cambio necesario:

- `EN_RUTA` / `ENROUTE` como salida de inicio esta bien;
- `COMPLETED` debe validarse contra el estado real de `transport_orders.status`, porque el comentario del DDL hoy habla de `CREATED`, `ENROUTE`, `CHECKED_OK`, `DISCREPANCY`.

Conclusion:

- si `COMPLETED` es un estado de viaje fisico y no el estado persistido final de la OT, se puede dejar en el evento;
- si no existe esa separacion, conviene cambiarlo por el estado final real del backend.

### 26.3 `delivery_enroute`

Se mantiene.

- `delivery_orders.status` contempla `ENROUTE`
- scope correcto: `ORDER#{transportOrderId}`

### 26.4 `delivery_arrived`

Se mantiene.

- `delivery_orders.status` contempla `ARRIVED`
- `arrivedAt`, `arrivalLatitude`, `arrivalLongitude` si tienen respaldo en la DB

### 26.5 `delivery_closed`

La idea se mantiene, pero hay dos correcciones:

1. El disparador no debe decir `PATCH /api/v1/last-mile/deliveries/:id/arrive`; eso parece un error de copia.
2. `status = INCIDENT` no existe como estado documentado en `delivery_orders.status`.

Recomendacion:

- mantener `eventName = delivery_closed`;
- usar en payload un estado persistible como `DELIVERED` o `REJECTED`;
- dejar `hasIncident = true` y `deliveryResultCode` para distinguir el cierre con incidencia.

### 26.6 `payment_registered`

Se mantiene.

Esto calza bien con:

- `delivery_payment_references.collection_payment_id`
- `payment_method`
- `amount`
- `currency`
- `status`

El sub-DTO `summary` tambien se puede mantener como proyeccion de backend.

### 26.7 `order_progress`

Se mantiene como evento agregado de flota, con dos observaciones:

1. `failed` y `returned` no salen como columnas directas; son **derivados de negocio**.
2. En `times`, el nombre correcto deberia ser consistente:
   - `avgAttentionS`
   - `avgTransitS`
   - `onRoadS`

Tambien corregiria esta linea del documento viejo:

- `Times.avgAttentionsS` -> `times.avgAttentionS`

## 8.3 Obtener historial y liquidacion de OTs

Endpoint inferido:

```http
GET /transport-orders/history?distributorId=1&dateFrom=2026-08-20&dateTo=2026-08-25&search=&status=
```

Request principal:

| Campo | Tipo | Regla |
|---|---|---|
| `distributorId` | number | Requerido |
| `dateFrom` | string | No requerido |
| `dateTo` | string | No requerido |
| `search` | string | No requerido |
| `status` | string | No requerido |
| `truckId` | number | No requerido |
| `routeId` | number | No requerido |

Fuentes de datos:

- `transport_orders`
- `routes`
- `trucks`
- `delivery_orders`
- `delivery_order_sales`
- `delivery_payment_references`
- `proof_of_deliveries`
- `transport_order_assets`

Response principal:

```json
{
  "status": "Successfully",
  "code": 200,
  "data": [
    {
      "id": 100451,
      "code": 100451,
      "codeLabel": "OT-100451",
      "status": "CHECKED_OK",
      "departureDate": "2026-08-20T06:30:00Z",
      "completedDate": "2026-08-20T14:45:00Z",
      "routeName": "Ruta 01 - Centro / Equipetrol",
      "truck": {
        "id": 12,
        "code": "CAM-012",
        "plate": "3012-ABC"
      },
      "driverName": "Carlos Mendoza Vargas",
      "helperName": "Roberto Quispe Lima",
      "supervisorName": "Marco Antonio Vaca",
      "assignedWeightKg": 3820.0,
      "assignedVolumeM3": 15.4,
      "totalKm": 48.5,
      "totalStopsCount": 12,
      "completedStopsCount": 12,
      "totalRevenueExpected": 52400.0,
      "totalRevenueCollected": 51656.0
    }
  ]
}
```

## 8.4 Obtener detalle historico de una OT

Endpoint inferido:

```http
GET /transport-orders/history/{transportOrderId}
```

Response principal:

```json
{
  "status": "Successfully",
  "code": 200,
  "data": {
    "order": {
      "id": 100451,
      "code": 100451,
      "codeLabel": "OT-100451",
      "status": "CHECKED_OK",
      "departureDate": "2026-08-20T06:30:00Z",
      "completedDate": "2026-08-20T14:45:00Z",
      "totalKm": 48.5,
      "assignedWeightKg": 3820.0,
      "assignedVolumeM3": 15.4,
      "totalRevenueExpected": 52400.0,
      "totalRevenueCollected": 51656.0
    },
    "deliveries": [],
    "assets": [],
    "transportOrderHistories": []
  }
}
```

## 8.5 Obtener historial de auditoria de carga

Endpoint inferido:

```http
GET /transport-orders/audit-history?distributorId=1&dateFrom=2026-08-20&dateTo=2026-08-25&search=
```

Request principal:

| Campo | Tipo | Regla |
|---|---|---|
| `distributorId` | number | Requerido |
| `dateFrom` | string | No requerido |
| `dateTo` | string | No requerido |
| `search` | string | No requerido |
| `status` | string | No requerido |
| `truckId` | number | No requerido |
| `routeId` | number | No requerido |

Fuentes de datos:

- `transport_orders`
- `truck_inventories`
- `transport_order_count_sessions`
- `transport_order_count_session_items`
- `trucks`
- `routes`

Response principal:

```json
{
  "status": "Successfully",
  "code": 200,
  "data": [
    {
      "transportOrderId": 100451,
      "code": 100451,
      "codeLabel": "OT-100451",
      "status": "DISCREPANCY",
      "routeName": "Ruta 01 - Centro / Equipetrol",
      "truck": {
        "id": 12,
        "code": "CAM-012",
        "plate": "3012-ABC",
        "isRefrigerated": true
      },
      "driverName": "Carlos Mendoza Vargas",
      "supervisorName": "Marco Antonio Vaca",
      "inventorySummary": {
        "totalProducts": 8,
        "matchProducts": 6,
        "mismatchProducts": 1,
        "approvedProducts": 1,
        "pendingProducts": 0
      },
      "countSessions": {
        "driverInitial": {
          "status": "COMPLETED",
          "startedAt": "2026-08-25T05:30:00Z",
          "completedAt": "2026-08-25T05:52:00Z"
        },
        "supervisorDiscrepancy": {
          "status": "COMPLETED",
          "reviewScope": "PARTIAL",
          "startedAt": "2026-08-25T06:05:00Z",
          "completedAt": "2026-08-25T06:18:00Z"
        },
        "supervisorSemaphore": {
          "status": "COMPLETED",
          "startedAt": "2026-08-25T06:20:00Z",
          "completedAt": "2026-08-25T06:28:00Z"
        }
      }
    }
  ]
}
```

## 8.6 Obtener detalle de auditoria de una OT

Endpoint inferido:

```http
GET /transport-orders/audit-history/{transportOrderId}
```

Response principal:

```json
{
  "status": "Successfully",
  "code": 200,
  "data": {
    "order": {
      "id": 100451,
      "code": 100451,
      "codeLabel": "OT-100451",
      "status": "DISCREPANCY"
    },
    "inventory": [
      {
        "id": 1,
        "productId": 101,
        "expectedQty": 240,
        "loadedQty": 237,
        "varianceQty": -3,
        "damagedQty": 3,
        "returnedWarehouseQty": 0,
        "temperatureCelsius": null,
        "status": "APPROVED",
        "verifiedSupervisorId": 15
      }
    ],
    "countSessions": [
      {
        "id": 1001,
        "sessionType": "DRIVER_INITIAL",
        "reviewScope": "FULL",
        "status": "COMPLETED",
        "executorId": 101,
        "executorRole": "DRIVER",
        "durationMinutes": 22,
        "startedAt": "2026-08-25T05:30:00Z",
        "completedAt": "2026-08-25T05:52:00Z",
        "notes": "Conteo inicial"
      }
    ],
    "countSessionItems": [
      {
        "id": 5001,
        "transportOrderCountSessionId": 1001,
        "productId": 101,
        "expectedQty": 240,
        "countedQty": 237,
        "countedBoxes": 9,
        "countedLooseUnits": 21,
        "varianceQty": -3,
        "equivalenceBoxUnit": 24,
        "isDamaged": true,
        "damageReasonCode": "BOTELLA_ROTA",
        "itemStatus": "MISMATCH",
        "observation": "Faltaban 3 unidades dañadas"
      }
    ],
    "transportOrderHistories": []
  }
}
```

## 9. Exportacion actual del modulo

Hoy la exportacion trabajada en el mockup es local en navegador:

1. `HistorialOrdenesTransporteView` exporta historial general.
2. `DetalleOrdenTransporteView` exporta una OT puntual.
3. `HistorialRevisionesView` exporta historial de auditoria y detalle individual.

Esto significa que hoy:

- no hay evidencia en el repo de un endpoint backend de exportacion;
- la documentacion de exportacion debe tratarse como comportamiento de frontend, no como contrato de API.

## 10. Recomendaciones para dejar el modulo consistente

1. Mantener la documentacion de monitoreo basada en `transport_orders`, `delivery_orders` y tablas hijas.
2. Mantener DynamoDB documentado como fuente separada para traza y posicion actual.
3. No documentar TTL de 30 dias ni borrado automatico mientras la politica real sea retencion larga y eliminacion manual.
4. Si se va a cerrar el contrato de stream o de tracking, validarlo con arquitectura/backend antes de fijar nombres tecnicos de claves o payloads.
5. Alinear el mock actual de `LIVE` para que deje de usar claves y payloads que no existen en la DB vigente.
