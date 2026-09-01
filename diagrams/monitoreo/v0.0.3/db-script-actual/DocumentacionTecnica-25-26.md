# Monitoreo backend + DB sustentado en `db_script.sql`

Base de contraste:

- `../../../db_script.sql`
- borrador funcional de § 25 y § 26 entregado el **2026-08-25**

Este documento toma ese borrador y lo aterriza al esquema real actual.

---

## Regla de este anexo

Se documenta solo lo que cae en una de estas tres categorías:

1. **Existe como tabla/columna en `db_script.sql`**
2. **Se obtiene por join defendible sobre tablas existentes**
3. **No existe en SQL y por eso se marca explícitamente como derivado o hueco**

No se mezclan como si fueran lo mismo.

---

## 25 Detalle del viaje

### Endpoint

**Tipo:** `GET /monitoring/orders/{transportOrderId}`

Objetivo: devolver en una sola respuesta el detalle operativo de la orden monitoreada:

- cabecera de la orden
- depósito de salida
- ruta seleccionada y su camion/chofer por join
- paradas planificadas
- entregas ejecutadas
- pedidos despachados por parada
- ítems, cobros, incidencias, comprobante e historial
- última posición conocida del camión

### Parámetro de entrada

| Atributo | Tipo | Oblig. | Respaldo |
|---|---|---|---|
| `transportOrderId` | number | Sí | `transport_orders.id` |

### Secuencia técnica recomendada

| Paso | Función | Fuente |
|---|---|---|
| `25.1` | `getOrderDetail(transportOrderId)` | Gateway / Controller |
| `25.2` | `findOrderHeader(transportOrderId)` | `transport_orders` |
| `25.2a` | `findDeposito(distributorId)` | `distributors` |
| `25.3` | `findRoute(routeId)` | `routes` |
| `25.3a` | `findTruckByPlanningTruck(route.planningTruckId)` | `planning_trucks` + `trucks` |
| `25.4` | `findRouteDeliveryPoints(routeId)` | `route_delivery_points` |
| `25.5` | `findDispatchPoints(dispatchDeliveryPointIds)` | `dispatch_delivery_points` |
| `25.6` | `findCandidateOrders(dispatchDeliveryPointIds)` | `candidate_orders` |
| `25.7` | `getDeliveryPoints(deliveryPointIds)` | servicio externo |
| `25.8` | `findDeliveriesByOrder(transportOrderId)` | `delivery_orders` |
| `25.8a` | `findDeliveryOrderSalesByDeliveryIds(deliveryOrderIds)` | `delivery_order_sales` |
| `25.8b` | `findPaymentReferencesByDeliverySaleIds(deliveryOrderSaleIds)` | `delivery_payment_references` |
| `25.8c` | `findItemsByDeliverySaleIds(deliveryOrderSaleIds)` | `delivery_order_items` |
| `25.8d` | `findIncidentsByDeliveryIds(deliveryOrderIds)` | `delivery_incidents` |
| `25.8e` | `findPodsByDeliveryIds(deliveryOrderIds)` | `proof_of_deliveries` |
| `25.8f` | `findHistoriesByDeliveryIds(deliveryOrderIds)` | `delivery_order_histories` |
| `25.9` | `queryLastTracking(routeId)` | DynamoDB `truck_tracking` |
| `25.10` | `buildOrderDetailDto(...)` | Service |

### 25.A `findOrderHeader(transportOrderId)`

Fuente real: `transport_orders`

Campos respaldados:

| DTO | Respaldo real |
|---|---|
| `transportOrderId` | `transport_orders.id` |
| `routeId` | `transport_orders.route_id` |
| `distributorId` | `transport_orders.distributor_id` |
| `status` | `transport_orders.status` |
| `departureDate` | `transport_orders.departure_date` |
| `completedDate` | `transport_orders.completed_date` |
| `assignedWeightKg` | `transport_orders.assigned_weight_kg` |
| `assignedVolumeM3` | `transport_orders.assigned_volume_m3` |
| `totalKm` | `transport_orders.total_km` |

Campo con regla de transformación:

| DTO | Respaldo real | Nota |
|---|---|---|
| `code` | `transport_orders.code` | En SQL es `BIGINT`. Si se quiere `OT-2026-004471`, eso es formateo de servicio, no columna |

### 25.A.1 `findDeposito(distributorId)`

Fuente real: `distributors`

| DTO | Respaldo real |
|---|---|
| `distributorId` | `distributors.id` |
| `name` | `distributors.name` |
| `latitude` | `distributors.latitude` |
| `longitude` | `distributors.longitude` |

### 25.B `findRoute(routeId)` y `findTruckByPlanningTruck(...)`

Fuente real:

- `routes`
- `planning_trucks`
- `trucks`

Lo que **sí** existe hoy en `routes`:

| DTO | Respaldo real |
|---|---|
| `routeId` | `routes.id` |
| `routeName` | `routes.name` |
| `planningTruckId` | `routes.planning_truck_id` |
| `driverEmployeeId` | `routes.driver_employee_id` |
| `nameDriverEmployee` | `routes.name_driver_employee` |
| `helperEmployeeId` | `routes.helper_employee_id` |
| `nameHelperEmployee` | `routes.name_helper_employee` |
| `executedAt` | `routes.executed_at` |
| `etaTotalDistanceM` | `routes.eta_total_distance_m` |
| `etaTotalTimeS` | `routes.eta_total_time_s` |
| `score` | `routes.score` |
| `totalCost` | `routes.total_cost` |
| `isSelected` | `routes.is_selected` |
| `encodePolyline` | `routes.encode_polyline` |
| `colorHex` | `routes.color_hex` |

Lo que sale por join:

| DTO | Join real |
|---|---|
| `truckId` | `routes.planning_truck_id -> planning_trucks.truck_id` |
| `licensePlate` | `planning_trucks.truck_id -> trucks.plate` |

Lo que **no** existe hoy en `routes` y no debe documentarse como columna propia:

| Campo del borrador | Situación real |
|---|---|
| `route.distributorId` | no existe en `routes` |
| `route.transportStatus` | no existe en `routes` |
| `route.departureDate` | no existe en `routes` |
| `route.completedDate` | no existe en `routes` |

Si esos cuatro campos se quieren en la respuesta, hoy salen así:

- `distributorId`: de `transport_orders.distributor_id`
- `status`: de `transport_orders.status`
- `departureDate`: de `transport_orders.departure_date`
- `completedDate`: de `transport_orders.completed_date`

### 25.C `findRouteDeliveryPoints(routeId)`

Fuente real: `route_delivery_points`

| DTO | Respaldo real |
|---|---|
| `routeDeliveryPointId` | `route_delivery_points.id` |
| `dispatchDeliveryPointId` | `route_delivery_points.dispatch_delivery_point_id` |
| `sequence` | `route_delivery_points.sequence` |
| `estimatedDistanceM` | `route_delivery_points.estimated_distance_m` |
| `estimatedTravelS` | `route_delivery_points.estimated_travel_s` |
| `estimatedTotalCost` | `route_delivery_points.estimated_total_cost` |
| `isActive` | `route_delivery_points.is_active` |

### 25.D `findDispatchPoints(dispatchDeliveryPointIds)`

Fuente real: `dispatch_delivery_points`

| DTO | Respaldo real |
|---|---|
| `dispatchDeliveryPointId` | `dispatch_delivery_points.id` |
| `deliveryPointId` | `dispatch_delivery_points.delivery_point_id` |
| `saleChannelId` | `dispatch_delivery_points.sale_channel_id` |
| `ownerId` | `dispatch_delivery_points.owner_id` |
| `ownerName` | `dispatch_delivery_points.owner_name` |
| `customerId` | `dispatch_delivery_points.customer_id` |
| `customerName` | `dispatch_delivery_points.customer_name` |
| `phoneNumber` | `dispatch_delivery_points.phone_number` |
| `address` | `dispatch_delivery_points.address` |
| `deliveryWindowStart` | `dispatch_delivery_points.delivery_window_start` |
| `deliveryWindowEnd` | `dispatch_delivery_points.delivery_window_end` |
| `totalWeightKg` | `dispatch_delivery_points.total_weight_kg` |
| `totalVolumeM3` | `dispatch_delivery_points.total_volume_m3` |
| `totalNeto` | `dispatch_delivery_points.total_neto` |
| `observations` | `dispatch_delivery_points.observations` |

### 25.E `findCandidateOrders(dispatchDeliveryPointIds)`

Fuente real: `candidate_orders`

| DTO | Respaldo real |
|---|---|
| `candidateOrderId` | `candidate_orders.id` |
| `dispatchDeliveryPointId` | `candidate_orders.dispatch_delivery_point_id` |
| `salesOrderId` | `candidate_orders.sales_order_id` |
| `documentId` | `candidate_orders.document_id` |
| `distributorId` | `candidate_orders.distributor_id` |
| `totalWeightKg` | `candidate_orders.total_weight_kg` |
| `totalVolumeM3` | `candidate_orders.total_volume_m3` |
| `typeMovement` | `candidate_orders.type_movement` |

Campos del borrador que **no** salen de `candidate_orders`:

| Campo del borrador | Situación real |
|---|---|
| `total` | no existe en `candidate_orders`; el monto agregado de la parada vive en `dispatch_delivery_points.total_neto` |
| `formaPago` | no existe en `candidate_orders` |

### 25.F `getDeliveryPoints(deliveryPointIds)`

Respaldo: **servicio externo**

Motivo técnico: `db_script.sql` no guarda latitud/longitud del punto en `dispatch_delivery_points`.
Solo guarda el puntero `delivery_point_id`.

Este paso sigue siendo válido aunque no salga del SQL, porque justamente el SQL demuestra que no hay
otra fuente interna para las coordenadas del cliente.

### 25.G `findDeliveriesByOrder(transportOrderId)`

Fuente real: `delivery_orders`

| DTO | Respaldo real |
|---|---|
| `deliveryOrderId` | `delivery_orders.id` |
| `transportOrderId` | `delivery_orders.transport_order_id` |
| `dispatchDeliveryPointId` | `delivery_orders.dispatch_delivery_point_id` |
| `executedSequence` | `delivery_orders.executed_sequence` |
| `deliveryNoteNumber` | `delivery_orders.delivery_note_number` |
| `deliveryResultCode` | `delivery_orders.delivery_result_code` |
| `status` | `delivery_orders.status` |
| `arrivalLatitude` | `delivery_orders.arrival_latitude` |
| `arrivalLongitude` | `delivery_orders.arrival_longitude` |
| `arrivedAt` | `delivery_orders.arrived_at` |
| `deliveredAt` | `delivery_orders.delivered_at` |

Campos del borrador que hoy **no** viven en `delivery_orders`:

| Campo del borrador | Situación real |
|---|---|
| `receiverName` | sale de `proof_of_deliveries.receiver_name`, no de `delivery_orders` |
| `receiverRelationship` | sale de `proof_of_deliveries.receiver_relationship` |

### 25.H `findDeliveryOrderSalesByDeliveryIds(deliveryOrderIds)`

Fuente real: `delivery_order_sales`

Esta tabla es clave porque el esquema actual cuelga **ítems y pagos** de `delivery_order_sale_id`, no
de `candidate_order_id`.

| DTO | Respaldo real |
|---|---|
| `deliveryOrderSaleId` | `delivery_order_sales.id` |
| `deliveryOrderId` | `delivery_order_sales.delivery_order_id` |
| `salesOrderId` | `delivery_order_sales.sale_order_id` |
| `companyCode` | `delivery_order_sales.company_code` |
| `invoiceId` | `delivery_order_sales.invoice_id` |
| `totalInvoice` | `delivery_order_sales.total_invoice` |

### 25.I `findPaymentReferencesByDeliverySaleIds(deliveryOrderSaleIds)`

Fuente real: `delivery_payment_references`

| DTO | Respaldo real |
|---|---|
| `paymentId` | `delivery_payment_references.id` |
| `deliveryOrderSaleId` | `delivery_payment_references.delivery_order_sale_id` |
| `collectionPaymentId` | `delivery_payment_references.collection_payment_id` |
| `paymentMethod` | `delivery_payment_references.payment_method` |
| `referenceNumber` | `delivery_payment_references.reference_number` |
| `amount` | `delivery_payment_references.amount` |
| `currency` | `delivery_payment_references.currency` |
| `status` | `delivery_payment_references.status` |
| `metadata` | `delivery_payment_references.metadata` |
| `notes` | `delivery_payment_references.notes` |
| `registeredAt` | `delivery_payment_references.created_at` |

Decisión recomendada: en eventos y DTOs, usar `paymentId = delivery_payment_references.id`. El SQL
actual no tiene otra identidad natural del pago.

### 25.J `findItemsByDeliverySaleIds(deliveryOrderSaleIds)`

Fuente real: `delivery_order_items`

| DTO | Respaldo real |
|---|---|
| `deliveryOrderItemId` | `delivery_order_items.id` |
| `deliveryOrderSaleId` | `delivery_order_items.delivery_order_sale_id` |
| `productId` | `delivery_order_items.product_id` |
| `plannedQty` | `delivery_order_items.planned_qty` |
| `deliveredQty` | `delivery_order_items.delivered_qty` |
| `returnedQty` | `delivery_order_items.returned_qty` |
| `unitPriceSnapshot` | `delivery_order_items.unit_price_snapshot` |
| `rejectionReasonCode` | `delivery_order_items.rejection_reason_code` |
| `itemStatus` | `delivery_order_items.item_status` |
| `notes` | `delivery_order_items.notes` |

### 25.K `findIncidentsByDeliveryIds(deliveryOrderIds)`

Fuente real: `delivery_incidents`

| DTO | Respaldo real |
|---|---|
| `incidentId` | `delivery_incidents.id` |
| `deliveryOrderId` | `delivery_incidents.delivery_order_id` |
| `productId` | `delivery_incidents.product_id` |
| `incidentCode` | `delivery_incidents.incident_code` |
| `severity` | `delivery_incidents.severity` |
| `description` | `delivery_incidents.description` |
| `imageUrl` | `delivery_incidents.image_url` |
| `requiresReturn` | `delivery_incidents.requires_return` |
| `resolutionStatus` | `delivery_incidents.resolution_status` |
| `resolvedAt` | `delivery_incidents.resolved_at` |
| `createdAt` | `delivery_incidents.created_at` |

Campo del borrador no respaldado:

| Campo del borrador | Situación real |
|---|---|
| `incidentType` | no existe hoy en `delivery_incidents` |

### 25.L `findPodsByDeliveryIds(deliveryOrderIds)`

Fuente real: `proof_of_deliveries`

| DTO | Respaldo real |
|---|---|
| `podId` | `proof_of_deliveries.id` |
| `deliveryOrderId` | `proof_of_deliveries.delivery_order_id` |
| `receiverName` | `proof_of_deliveries.receiver_name` |
| `receiverDocument` | `proof_of_deliveries.receiver_document` |
| `receiverRelationship` | `proof_of_deliveries.receiver_relationship` |
| `signatureUrl` | `proof_of_deliveries.signature_url` |
| `imageUrl` | `proof_of_deliveries.image_url` |
| `latitude` | `proof_of_deliveries.latitude` |
| `longitude` | `proof_of_deliveries.longitude` |
| `status` | `proof_of_deliveries.status` |
| `deviceId` | `proof_of_deliveries.device_id` |
| `capturedAt` | `proof_of_deliveries.captured_at` |
| `uploadedAt` | `proof_of_deliveries.uploaded_at` |
| `notes` | `proof_of_deliveries.notes` |

### 25.M `findHistoriesByDeliveryIds(deliveryOrderIds)`

Fuente real: `delivery_order_histories`

| DTO | Respaldo real |
|---|---|
| `historyId` | `delivery_order_histories.id` |
| `deliveryOrderId` | `delivery_order_histories.delivery_order_id` |
| `status` | `delivery_order_histories.status` |
| `reason` | `delivery_order_histories.reason` |
| `capturedAt` | `delivery_order_histories.captured_at` |
| `createdAt` | `delivery_order_histories.created_at` |

### 25.N `queryLastTracking(routeId)`

Fuente: DynamoDB `truck_tracking`

Consulta esperada:

```text
Query  TableName = truck_tracking
       KeyConditionExpression = "pk = :pk"
       ExpressionAttributeValues = { ":pk": "ROUTE#512" }
       ScanIndexForward = false
       Limit = 1
```

DTO para pantalla:

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

### Response final recomendada

La forma más consistente con el esquema actual es anidar `pedidos`, `pagos` e `items` por
`deliveryOrderSaleId`, no colgarlos directo de la parada como si todo viviera en `delivery_order_id`.

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

### Divergencias obligatorias contra el borrador recibido

| Borrador | Ajuste sustentado en SQL |
|---|---|
| `findSelectedRoute()` traía estado y fechas desde `routes` | hoy salen de `transport_orders` |
| `findDeliveriesByOrder()` traía receptor | hoy el receptor vive en `proof_of_deliveries` |
| `findItemsByDeliveryIds()` colgaba de `deliveryOrderId` | hoy cuelga de `deliveryOrderSaleId` |
| faltaban los pagos del snapshot | hoy hay que leer `delivery_payment_references` |
| `candidate_orders` sostenía todo el pedido monitoreado | hoy la identidad operativa correcta es `delivery_order_sales` |
| `incidentType` figuraba como columna | hoy no existe en `delivery_incidents` |

---

## 26 Actualización de la información en tiempo real

### Infraestructura común

Lifelines lógicas:

| Lifeline | Qué es |
|---|---|
| `Monitoring Event Publisher` | componente backend que arma el DTO y llama al bus |
| `SSE Bus` | bus en memoria que distribuye a las conexiones suscritas |

Método común:

```ts
publish(eventName: string, scope: string, payload: object): void
```

Scopes:

| Scope | Qué agrupa | Fuente real del scope |
|---|---|---|
| `FLEET#{distributorId}` | toda la flota de una distribuidora | `transport_orders.distributor_id` |
| `ROUTE#{routeId}` | una salida/ruta física | `transport_orders.route_id` |
| `ORDER#{transportOrderId}` | una orden de transporte | `transport_orders.id` |

### 26.1 `tracking`

Origen: `POST /monitoring/tracks`

Scopes:

- `ROUTE#{routeId}`
- `FLEET#{distributorId}`

Payload:

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

Nombre de evento conservado por contrato, pero respaldo actual en SQL:

- `transport_orders.status`
- `transport_orders.departure_date`
- `transport_orders.completed_date`
- `transport_orders.route_id`
- `transport_orders.distributor_id`
- `routes.name_driver_employee`
- `planning_trucks -> trucks.plate`

Payload recomendado:

```json
{
  "routeId": 512,
  "transportOrderId": 4471,
  "status": "ENROUTE",
  "departureDate": "2026-07-16T08:00:00.000Z",
  "completedDate": null,
  "licensePlate": "3456-ABC",
  "driverName": "Carlos Mamani"
}
```

Nota técnica: el nombre `transport_status` es defendible; lo que no es defendible con el SQL actual es
documentarlo como si saliera de columnas `routes.transport_status`, `routes.departure_date` o
`routes.completed_date`, porque hoy no existen.

### 26.3 `delivery_enroute`

Respaldo: `delivery_orders.status = 'ENROUTE'`

Scope:

- `ORDER#{transportOrderId}`

Payload:

```json
{
  "deliveryOrderId": 90113,
  "status": "ENROUTE",
  "changedAt": "2026-07-16T08:52:00.000Z",
  "etaTime": "09:02"
}
```

`etaTime` es derivado; no existe columna dedicada en `db_script.sql`.

### 26.4 `delivery_arrived`

Respaldo:

- `delivery_orders.status`
- `delivery_orders.arrived_at`
- `delivery_orders.arrival_latitude`
- `delivery_orders.arrival_longitude`

Scope:

- `ORDER#{transportOrderId}`

Payload:

```json
{
  "deliveryOrderId": 90113,
  "status": "ARRIVED",
  "arrivedAt": "2026-07-16T09:02:00.000Z",
  "arrivalLatitude": -17.771002,
  "arrivalLongitude": -63.160877,
  "outOfWindow": false
}
```

`outOfWindow` es derivado contra `dispatch_delivery_points.delivery_window_start/end`.

### 26.5 `delivery_closed`

Respaldo mínimo:

- `delivery_orders.status`
- `delivery_orders.delivered_at`
- `delivery_orders.delivery_result_code`
- `proof_of_deliveries`
- `delivery_incidents`

Scope:

- `ORDER#{transportOrderId}`

Payload defendible con el SQL actual:

```json
{
  "deliveryOrderId": 90112,
  "status": "DELIVERED",
  "deliveredAt": "2026-07-16T08:34:00.000Z",
  "deliveryResultCode": null,
  "hasProof": true,
  "hasIncident": false
}
```

Si se quiere `receiverName` en el evento, sale de `proof_of_deliveries.receiver_name`, no de
`delivery_orders`.

Nota de esquema: el borrador usaba `INCIDENT` como estado de cierre. El SQL actual comenta
`DELIVERED` / `REJECTED` como vocabulario de `delivery_orders.status`. Si se va a emitir `INCIDENT`
como estado, primero hay que fijar ese catálogo.

### 26.6 `payment_registered`

Respaldo:

- `delivery_payment_references`
- `delivery_order_sales`

Scope:

- `ORDER#{transportOrderId}`

Clave de parcheo recomendada:

- `deliveryOrderSaleId + paymentId`

Payload:

```json
{
  "deliveryOrderId": 90112,
  "deliveryOrderSaleId": 88021,
  "paymentId": 12001,
  "collectionPaymentId": 1052,
  "paymentMethod": "QR",
  "amount": 200.00,
  "currency": "BOB",
  "status": "PENDING",
  "referenceNumber": "25051501009100893840",
  "registeredAt": "2026-07-16T08:31:00.000Z",
  "summary": {
    "aCobrar": 1000.00,
    "cobrado": 300.00,
    "enProceso": 200.00,
    "saldo": 500.00
  }
}
```

Decisión técnica recomendada:

- `paymentId = delivery_payment_references.id`
- `referenceNumber = delivery_payment_references.reference_number`

### 26.7 `payment_status`

Respaldo:

- `delivery_payment_references.status`
- `delivery_payment_references.updated_at`
- `delivery_payment_references.metadata`

Scope:

- `ORDER#{transportOrderId}`

Payload:

```json
{
  "deliveryOrderId": 90112,
  "deliveryOrderSaleId": 88021,
  "paymentId": 12001,
  "collectionPaymentId": 1052,
  "status": "COMPLETED",
  "transactionNumber": "TRX-880192",
  "changedAt": "2026-07-16T08:33:12.000Z",
  "summary": {
    "aCobrar": 1000.00,
    "cobrado": 500.00,
    "enProceso": 0.00,
    "saldo": 500.00
  }
}
```

Observación importante: el SQL actual no tiene una columna dedicada `paid_at`. Si el contrato quiere
ese dato, hoy solo hay dos alternativas defendibles:

1. usar `updated_at` como instante de cambio de estado
2. agregar una columna propia

### 26.8 `order_progress`

Respaldo derivado:

- `delivery_orders`
- `delivery_incidents`
- `dispatch_delivery_points`
- `delivery_orders.arrived_at/delivered_at`

Scope:

- `FLEET#{distributorId}`

Payload:

```json
{
  "transportOrderId": 4471,
  "progress": {
    "total": 12,
    "delivered": 7,
    "failed": 1,
    "returned": 0,
    "pending": 4,
    "progressPct": 67,
    "incidents": 1,
    "outOfWindow": 0
  },
  "times": {
    "avgAttentionS": 540,
    "avgTransitS": 1020,
    "onRoadS": 7920
  }
}
```

Reglas de derivación:

- `avgAttentionS`: promedio de `delivered_at - arrived_at`
- `avgTransitS`: derivado entre cierres/llegadas ordenados por `executed_sequence`
- `onRoadS`: desde `transport_orders.departure_date` hasta la última marca cerrada o `completed_date`

### Reglas transversales

1. Publicar después del commit.
2. Mandar estado absoluto, no incrementos.
3. Parchear por la misma clave siempre.
4. No mezclar `candidateOrderId` con `deliveryOrderSaleId` en eventos de cobro.

### Divergencias obligatorias contra el borrador recibido

| Borrador | Ajuste sustentado en SQL |
|---|---|
| `payment_registered` sin `deliveryOrderSaleId` | hoy debe llevarlo; es el FK real de pagos |
| `paymentId` textual inventado | hoy conviene usar `delivery_payment_references.id` |
| `payment_status.paidAt` | hoy no existe columna dedicada |
| `transport_status` saliendo de `routes` | hoy sale de `transport_orders` + joins |
| `delivery_closed.status = INCIDENT` | hoy el catálogo de `delivery_orders.status` no lo sustenta claramente |

