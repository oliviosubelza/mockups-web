# Monitoreo Frontend

Documento corto para alimentar solo las vistas de monitoreo:

1. `/monitoreo`
2. dialogo de detalle del viaje
3. `/monitoreo/seguimiento/:ordenId`
4. SSE de monitoreo

No cubre:

1. historial
2. reportes
3. auditoria de carga

## 1. Vistas y fuente de datos

### 1.1 `/monitoreo`

Un solo snapshot inicial alimenta:

1. vista `Ordenes`
2. vista `Pedidos`
3. boton de abrir dialogo

Endpoint:

```http
GET /monitoring/orders?distributorId=1
```

Luego se refresca por SSE:

```http
GET /monitoring/stream?distributorId=1
Accept: text/event-stream
```

### 1.2 Dialogo del viaje

No necesita un endpoint aparte.

Debe usar el detalle completo de la OT:

```http
GET /monitoring/orders/{transportOrderId}
```

Y mantenerse vivo con SSE:

```http
GET /monitoring/orders/{transportOrderId}/stream
Accept: text/event-stream
```

### 1.3 Pantalla del mapa

Usa exactamente la misma base que el dialogo:

```http
GET /monitoring/orders/{transportOrderId}
GET /monitoring/orders/{transportOrderId}/stream
```

## 2. Snapshot para `/monitoreo`

## 2.1 Para que sirve

Este snapshot tiene que alcanzar para pintar:

1. tabla de `Ordenes`
2. tabla de `Pedidos`
3. resumen superior
4. apertura del dialogo

## 2.2 Campos que usa la tabla `Ordenes`

Cada fila necesita:

1. `transportOrderId`
2. `codeFormatted`
3. `truck.licensePlate`
4. `driver.name`
5. `transportStatus`
6. `departureDate`
7. `progress.total`
8. `progress.delivered`
9. `progress.failed`
10. `progress.returned`
11. `progress.pending`
12. `progress.progressPct`
13. `progress.incidents`
14. `times.avgAttentionS`
15. `times.onRoadS`
16. `tracking.trackedAt`
17. `tracking.battery`

## 2.3 Campos que usa la tabla `Pedidos`

Se derivan del mismo snapshot, recorriendo `paradas[].pedidos[]`.

Cada fila necesita:

1. `pedido.deliveryOrderSaleId`
2. `pedido.salesOrderId`
3. `pedido.documentId`
4. `order.transportOrderId`
5. `order.codeFormatted`
6. `parada.deliveryOrderId`
7. `parada.sequence`
8. `parada.customerName`
9. `parada.saleChannelId`
10. `parada.status`
11. `parada.totalWeightKg`
12. `pedido.totalInvoice`
13. `pedido.typeMovement`
14. `tracking.trackedAt`
15. `progress.incidents`

## 2.4 Response recomendado

```json
{
  "success": true,
  "code": 200,
  "data": [
    {
      "order": {
        "transportOrderId": 4471,
        "code": 4471,
        "codeFormatted": "OT-2026-004471",
        "distributorId": 1,
        "routeId": 512,
        "transportStatus": "ENROUTE",
        "departureDate": "2026-07-16T08:00:00.000Z",
        "completedDate": null,
        "assignedWeightKg": 3480.50,
        "assignedVolumeM3": 14.20
      },
      "truck": {
        "truckId": 880012,
        "licensePlate": "3456-ABC"
      },
      "driver": {
        "employeeId": 456,
        "name": "Carlos Mamani"
      },
      "tracking": {
        "routeId": 512,
        "latitude": -17.783412,
        "longitude": -63.181245,
        "battery": 74,
        "trackedAt": "2026-07-16T08:24:39.000Z",
        "receivedAt": "2026-07-16T08:24:40.180Z"
      },
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
      },
      "paradas": [
        {
          "deliveryOrderId": 90112,
          "dispatchDeliveryPointId": 4021,
          "deliveryPointId": 45,
          "sequence": 1,
          "executedSequence": 1,
          "customerName": "Casa La Ramada",
          "saleChannelId": 3,
          "status": "DELIVERED",
          "totalWeightKg": 620.40,
          "totalVolumeM3": 2.30,
          "totalNeto": 2572.67,
          "deliveryResultCode": null,
          "pedidos": [
            {
              "deliveryOrderSaleId": 88021,
              "salesOrderId": 88213,
              "documentId": 1000026565,
              "typeMovement": "VENTA",
              "totalInvoice": 1592.67
            }
          ]
        }
      ]
    }
  ]
}
```

## 3. SSE para `/monitoreo`

Endpoint:

```http
GET /monitoring/stream?distributorId=1
Accept: text/event-stream
```

Scope:

```text
FLEET#{distributorId}
```

## 3.1 Eventos minimos para que viva la tabla `Ordenes`

### `tracking`

Actualiza:

1. ultima senal
2. bateria

```text
event: tracking
data: {"routeId":512,"latitude":-17.783412,"longitude":-63.181245,"battery":74,"trackedAt":"2026-07-16T08:24:39.000Z","receivedAt":"2026-07-16T08:24:40.180Z"}
```

### `transport_status`

Actualiza:

1. estado del viaje
2. hora de salida o cierre

```text
event: transport_status
data: {"routeId":512,"transportOrderId":4471,"transportStatus":"ENROUTE","departureDate":"2026-07-16T08:00:00.000Z","completedDate":null,"licensePlate":"3456-ABC","driverName":"Carlos Mamani"}
```

### `order_progress`

Actualiza:

1. barra de progreso
2. incidencias
3. tiempos agregados

```text
event: order_progress
data: {"transportOrderId":4471,"progress":{"total":12,"delivered":7,"failed":1,"returned":0,"pending":4,"progressPct":67,"incidents":1,"outOfWindow":0},"times":{"avgAttentionS":540,"avgTransitS":1020,"onRoadS":7920}}
```

## 3.2 Eventos extra si la vista `Pedidos` debe quedar viva sin recargar

La tabla `Pedidos` muestra estado de parada por fila.

Si esa vista debe actualizarse en vivo, hace falta que estos eventos lleguen tambien al scope de flota, o que exista un agregado equivalente:

### `delivery_enroute`

```text
event: delivery_enroute
data: {"deliveryOrderId":90113,"status":"ENROUTE","changedAt":"2026-07-16T08:52:00.000Z","etaTime":"09:02"}
```

### `delivery_arrived`

```text
event: delivery_arrived
data: {"deliveryOrderId":90113,"status":"ARRIVED","arrivedAt":"2026-07-16T09:02:00.000Z","arrivalLatitude":-17.771002,"arrivalLongitude":-63.160877,"outOfWindow":false}
```

### `delivery_closed`

```text
event: delivery_closed
data: {"deliveryOrderId":90113,"status":"DELIVERED","deliveredAt":"2026-07-16T09:11:00.000Z","deliveryResultCode":null,"receiverName":"Lic. Roberto Gómez","hasProof":true,"hasIncident":false}
```

Si esos eventos no llegan a `FLEET#{distributorId}`, la vista `Pedidos` solo quedará correcta en el snapshot inicial.

## 4. Snapshot para dialogo y mapa

Endpoint:

```http
GET /monitoring/orders/{transportOrderId}
```

## 4.1 Para que sirve

Este snapshot alimenta:

1. cabecera del viaje
2. dialogo detalle
3. dialogo plan vs ejecutado
4. mapa
5. panel de paradas
6. panel de detalle de parada

## 4.2 Estructura recomendada

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

## 5. SSE para dialogo y mapa

Endpoint:

```http
GET /monitoring/orders/{transportOrderId}/stream
Accept: text/event-stream
```

Suscripciones lógicas:

1. `ORDER#{transportOrderId}` para cambios de paradas, pagos y POD
2. `ROUTE#{routeId}` para tracking del camion

El backend puede resolver esos dos scopes detrás del mismo endpoint.

## 5.1 Eventos necesarios

### `tracking`

Mueve el pin y actualiza última señal.

```text
event: tracking
data: {"routeId":512,"latitude":-17.783412,"longitude":-63.181245,"battery":74,"trackedAt":"2026-07-16T08:24:39.000Z","receivedAt":"2026-07-16T08:24:40.180Z"}
```

### `delivery_enroute`

Marca la siguiente parada como en camino.

```text
event: delivery_enroute
data: {"deliveryOrderId":90113,"status":"ENROUTE","changedAt":"2026-07-16T08:52:00.000Z","etaTime":"09:02"}
```

### `delivery_arrived`

Marca llegada y si cayó fuera de ventana.

```text
event: delivery_arrived
data: {"deliveryOrderId":90113,"status":"ARRIVED","arrivedAt":"2026-07-16T09:02:00.000Z","arrivalLatitude":-17.771002,"arrivalLongitude":-63.160877,"outOfWindow":false}
```

### `delivery_closed`

Cierra la parada.

```text
event: delivery_closed
data: {"deliveryOrderId":90112,"status":"DELIVERED","deliveredAt":"2026-07-16T08:34:00.000Z","deliveryResultCode":null,"receiverName":"Lic. Roberto Gómez","hasProof":true,"hasIncident":false}
```

### `payment_registered`

Actualiza cobro de la parada.

```text
event: payment_registered
data: {"deliveryOrderId":90112,"paymentId":"pay-90112-1","collectionPaymentId":1052,"paymentMethod":"QR","amount":200.00,"currency":"BOB","status":"PENDING","reference":"25051501009100893840","registeredAt":"2026-07-16T08:31:00.000Z","summary":{"aCobrar":1000.00,"cobrado":300.00,"enProceso":200.00,"saldo":500.00}}
```

### `transport_status`

Solo si el mapa/dialogo también debe reflejar cierre completo de la hoja de ruta.

```text
event: transport_status
data: {"routeId":512,"transportOrderId":4471,"transportStatus":"COMPLETED","departureDate":"2026-07-16T08:00:00.000Z","completedDate":"2026-07-16T16:00:00.000Z","licensePlate":"3456-ABC","driverName":"Carlos Mamani"}
```

## 6. Resumen mínimo

Si querés alimentar el frontend actual con lo mínimo ordenado:

1. `GET /monitoring/orders?distributorId=1`
   - alimenta `/monitoreo`
2. `GET /monitoring/stream?distributorId=1`
   - mantiene viva la tabla principal
3. `GET /monitoring/orders/{transportOrderId}`
   - alimenta dialogo y mapa
4. `GET /monitoring/orders/{transportOrderId}/stream`
   - mantiene vivo dialogo y mapa

Y los SSE mínimos son:

1. `tracking`
2. `transport_status`
3. `order_progress`
4. `delivery_enroute`
5. `delivery_arrived`
6. `delivery_closed`
7. `payment_registered`

## 7. Hueco a decidir

Si la vista `Pedidos` de `/monitoreo` debe quedar viva de verdad, los eventos `delivery_*` tienen que llegar también al listado de flota, o el backend debe publicar un agregado equivalente para `FLEET#{distributorId}`.
