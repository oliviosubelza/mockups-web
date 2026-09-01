# Monitoreo — Eventos publicados al Frontend (SSE)

> **v0.0.3.** Catálogo de los eventos que el backend empuja al monitor web cuando algo pasa en la app
> del chofer. Un evento por hecho, con su **nombre de método publicador**, su **scope**, su **DTO** y
> su **JSON**.
>
> **Dónde va en el documento grande:** como **§ 40**, después de *39 Cierre de Hoja de Ruta*. Es el
> cierre natural del bloque de última milla (§ 27-39): esas secciones documentan lo que el chofer
> escribe, y esta documenta lo que de eso sale hacia el monitor.

**Documentos hermanos.** Los tres cubren el mismo streaming desde ángulos distintos y no se repiten:

| Documento | Qué responde |
|---|---|
| `Streaming.md` (§ 26) | **Cómo viaja** — SSE, canales, heartbeat, parcheo parcial |
| `DetalleMapa.docx` § B | **Quién lo produce** — el flujo completo de cada evento, tabla por tabla |
| **Este documento (§ 40)** | **Qué se manda** — método, DTO y JSON de cada evento |

---

## Cómo usar este documento

Está escrito para el dev que documenta la **app del chofer**. La idea es que no tengas que inventar
nada ni preguntar: cada sección de acá te da la **línea exacta** que va al final de tu diagrama de
secuencia.

Cuando termines de documentar una acción del chofer —*Cobrar*, *Marcar llegada*, *Finalizar entrega*—
tu diagrama termina hoy en el `return` al móvil. Le falta un paso: **antes de retornar, el servicio
publica el hecho al monitor.** Eso son dos líneas más:

```
   ...
   3.6  Delivery History DB  ──▶  return historyId
   3.7  Monitoring Publisher ──▶  publishDeliveryEnroute(deliveryEnrouteEventDto)
   3.8  SSE Bus              ──▶  publish(delivery_enroute, ORDER#{transportOrderId})
   3.9  return onTheWayResponse
```

Buscá tu sección en la tabla de la § 40.2, copiá el nombre del método y el scope, y listo.

**Tres cosas que conviene saber antes de copiar nada:**

1. **El evento se publica DESPUÉS de escribir en la base, nunca antes.** Si la transacción falla, no
   se publica: el monitor no puede ver un estado que la base no tiene. Es la razón por la que el
   `publish` va como último paso y no en paralelo.
2. **El publish no bloquea la respuesta al móvil.** El bus es en memoria: publicar es empujar a una
   cola, no esperar a nadie. Si no hay ningún monitor mirando esa orden, el evento se descarta y no
   pasa nada. **El chofer nunca se queda esperando al monitor.**
3. **El evento ya trae el dato.** No es un aviso de *"algo cambió, andá a buscarlo"*: el frontend
   recibe el JSON, parchea y repinta, sin ninguna petición adicional.

---

## § 40.1 · El publicador: un método, un evento, un scope

### Las dos lifelines nuevas de tu diagrama

| Lifeline | Qué es | Qué hace |
|---|---|---|
| **Monitoring Event Publisher** | Componente compartido del backend | Arma el DTO del evento, resuelve el scope y llama al bus. **Es el que nombrás en tu diagrama** |
| **SSE Bus** | Bus de eventos en memoria | Recibe `(evento, scope, payload)` y lo escribe en cada conexión abierta que esté suscrita a ese scope |

El publicador existe para que los servicios de última milla y de cobranzas **no conozcan el
streaming**. `Last-Mile Service` no sabe qué es un scope ni cuántos monitores hay mirando: llama a
`publishDeliveryEnroute(dto)` y sigue. Toda la mecánica de SSE vive de ese método para adentro.

### El primitivo

Todos los métodos del catálogo terminan llamando al mismo:

```
publish(eventName: string, scope: string, payload: object): void
```

| Parámetro | Descripción |
|---|---|
| `eventName` | El nombre que viaja en la línea `event:` del cable y con el que el frontend registra el listener |
| `scope` | `FLEET#{distributorId}`, `ROUTE#{routeId}` o `ORDER#{transportOrderId}` — a quién le llega |
| `payload` | El DTO del evento, serializado a JSON en la línea `data:` |

### Los tres scopes

| Scope | Qué agrupa | Quién está suscrito |
|---|---|---|
| `FLEET#{distributorId}` | Toda la flota de una distribuidora | La pantalla del **listado** de órdenes despachadas |
| `ROUTE#{routeId}` | Una salida física (un camión andando) | La pantalla del **mapa** de esa orden |
| `ORDER#{transportOrderId}` | Una orden de transporte | La pantalla del **mapa** de esa orden |

**No existe un scope `ORDER_SALE#{deliveryOrderSaleId}`.** La vista por pedido no abre un canal nuevo:
se proyecta desde el mismo `ORDER#{transportOrderId}` y, cuando hay cobros, el payload trae
`deliveryOrderSaleId` para ubicar el pedido correcto dentro de la parada.

**Por qué la posición va por ruta y las entregas por orden.** Son hechos de entidades distintas: la
posición es del **camión**, la entrega es del **documento**. Con el modelo muchos-a-uno de v0.0.3 —
varias órdenes pueden compartir una ruta— colapsarlos obligaría al servidor a consultar Postgres *en
cada ping* para traducir de ruta a órdenes. Por eso el mapa abre **una conexión con dos
suscripciones**.

### Cómo se ve en el cable

```
event: delivery_arrived
data: {"deliveryOrderId":90113,"status":"ARRIVED","arrivedAt":"2026-07-16T09:02:00.000Z", ...}

```

Nombre del evento, JSON en una línea, y **una línea en blanco que cierra el bloque**. Sin esa línea en
blanco el navegador se queda esperando y no dispara nada.

---

## § 40.2 · Índice: qué acción del chofer publica qué

Esta es la tabla para buscar tu caso. La columna **Método** es la que copiás a tu diagrama.

| § | Acción en la app del chofer | Evento | Método publicador | Scope |
|---|---|---|---|---|
| 24 | Ping de GPS *(automático)* | `tracking` | `publishTracking(dto)` | `ROUTE#{routeId}` **+** `FLEET#{distributorId}` |
| 28 | **Iniciar ruta** | `transport_status` | `publishTransportStatus(dto)` | `FLEET#{distributorId}` |
| 29 | **Estoy en camino** | `delivery_enroute` | `publishDeliveryEnroute(dto)` | `ORDER#{transportOrderId}` |
| 30 | **Marcar llegada** | `delivery_arrived` | `publishDeliveryArrived(dto)` | `ORDER#{transportOrderId}` |
| 31 | Verificar productos | — | — | — |
| 32 | Subir foto a S3 | — | — | — |
| 33 | Registrar comprobante (POD) | — | — | — |
| 34 | **Registrar incidencia** | `delivery_closed` **+** `order_progress` | `publishDeliveryClosed(dto)` · `publishOrderProgress(dto)` | `ORDER#` · `FLEET#` |
| 35 | **Generar cobro QR** | `payment_registered` | `publishPaymentRegistered(dto)` | `ORDER#{transportOrderId}` |
| 36 | **Confirmar cobro QR** | `payment_status` | `publishPaymentStatus(dto)` | `ORDER#{transportOrderId}` |
| 37 | **Cobrar en efectivo** | `payment_registered` | `publishPaymentRegistered(dto)` | `ORDER#{transportOrderId}` |
| 38 | **Finalizar entrega** | `delivery_closed` **+** `order_progress` | `publishDeliveryClosed(dto)` · `publishOrderProgress(dto)` | `ORDER#` · `FLEET#` |
| 39 | **Finalizar hoja de ruta** | `transport_status` | `publishTransportStatus(dto)` | `FLEET#{distributorId}` |

**Ocho eventos en total, para trece acciones.** Cinco acciones no publican nada y eso es deliberado —
está justificado una por una en la § 40.11.

### Dos casos que suelen confundir

**§ 34 y § 38 publican el MISMO evento.** Cerrar bien y cerrar mal son el mismo hecho para el monitor:
*la parada dejó de estar abierta*. Lo que cambia es el `status` de adentro (`DELIVERED` vs `INCIDENT`),
no el evento. Si fueran dos eventos, el frontend tendría dos caminos de parcheo para actualizar la
misma tarjeta.

**§ 35 y § 37 también.** Un cobro es un cobro, pague con QR o en efectivo. Lo que cambia es
`paymentMethod` y el `status` con el que **nace**: el efectivo nace `COMPLETED` (el chofer tiene la
plata en la mano) y el QR nace `PENDING` (el banco todavía no confirmó). Por eso el QR necesita un
segundo evento —`payment_status`, § 36— y el efectivo no.

---

## § 40.3 · `tracking` — posición del camión

**Lo dispara:** § 24 · `POST /monitoring/tracks`. Lo manda el **celular** del chofer de forma
automática, cada 10-15 s en movimiento, sin que nadie toque nada.

**Dónde se publica:** en `Tracking Service`, después de los dos `putItem` de DynamoDB (pasos 24.5 y
24.6). **Los dos ítems primero, el evento después:** si Dynamo falla, el monitor no muestra una
posición que no quedó guardada.

**Método:** `publishTracking(trackingEventDto)`
**Scope:** `ROUTE#{routeId}` y `FLEET#{distributorId}` — es el **único** evento que se publica a dos
scopes, porque la posición le interesa al mapa y al listado por igual.
**Cadencia:** ping por ping en el mapa; **agrupado a ~30 s** en el listado *(ver § 40.10)*.

**En tu diagrama de secuencia:**

```
   24.7  Monitoring Publisher ──▶ publishTracking(trackingEventDto)
   24.8  SSE Bus              ──▶ publish(tracking, ROUTE#{routeId})
   24.9  SSE Bus              ──▶ publish(tracking, FLEET#{distributorId})
```

### Parámetro de entrada: `trackingEventDto`

| Atributo | Tipo | Oblig. | Origen / Descripción |
|---|---|---|---|
| `routeId` | number | Sí | `trackDto.routeId`. **La clave del parcheo**: el frontend busca por acá |
| `latitude` | number | Sí | Grados decimales, 6 decimales |
| `longitude` | number | Sí | Grados decimales, 6 decimales |
| `battery` | number | Sí | 0-100. Batería del dispositivo del chofer |
| `trackedAt` | string | Sí | Reloj del **dispositivo**: cuándo el GPS fijó la posición |
| `receivedAt` | string | Sí | Reloj del **servidor**: cuándo llegó el paquete. Estampado en 24.4 |

### Salida (lo que llega al frontend)

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

**Qué repinta:** el pin del camión, el trazo recorrido, la batería y el indicador de *"última señal"*.

**Lo que NO trae, a propósito:** ningún estado de entrega. Un ping son coordenadas, batería y hora.
Si el chofer entregó algo, eso llega por su propio evento, en su propio momento — **el monitor no
espera al próximo pulso para enterarse de una entrega**.

**Por qué van los dos relojes.** La diferencia entre `trackedAt` y `receivedAt` es lo que delata un
celular sin señal: si el ping tardó cuatro minutos en llegar, el camión estuvo cuatro minutos en un
lugar que el mapa no mostró. Con un solo reloj eso no se puede distinguir de un camión detenido.

---

## § 40.4 · `transport_status` — la salida arrancó o terminó

**Lo dispara:** dos acciones distintas del chofer, **el mismo evento**:

| § | Acción | Transición |
|---|---|---|
| 28 | **Iniciar ruta** — `POST /api/v1/last-mile/transport-orders/:id/start-route` | `PENDING` → `EN_RUTA` |
| 39 | **Finalizar hoja de ruta** — `POST /api/v1/last-mile/transport-orders/:id/complete` | `EN_RUTA` → `COMPLETED` |

**Dónde se publica:** **después de que SAP confirme** (`zws022` — 28: paso 2.8 · 39: paso 14.9). Si SAP
rechaza el cambio, el estado local se revierte y el monitor no debe haber visto nada. Ese es el único
requisito duro; el número de paso concreto es el último de cada secuencia, y **las dos secuencias no
tienen el mismo orden interno**:

| § | Orden de los pasos | Publicar en |
|---|---|---|
| 28 | `updateTransportOrderStatus` 2.3/2.4 → `createTransportOrderHistory` 2.5/2.6 → **SAP 2.7/2.8** → `getActiveRouteHeader` 2.9/2.10 → `getAllStopsByOT` 2.11/2.12 → `buildActiveRouteSheetResponse` 2.13 | **2.14 / 2.15** |
| 39 | `updateTransportOrderToCompleted` 14.6/14.7 → **SAP 14.8/14.9** → `createTransportOrderHistory` 14.10/14.11 | **14.12 / 14.13** |

En el § 28 el historial va **antes** de SAP y en el § 39 va **después**. Y ojo con el § 28: los pasos
2.9 a 2.13 ya están ocupados armando la hoja de ruta que se le devuelve al chofer, así que el
publicador no puede meterse ahí — va al final, en 2.14.

**Método:** `publishTransportStatus(transportStatusEventDto)`
**Scope:** `FLEET#{distributorId}`
**Cadencia:** 2 veces por salida (una al arrancar, una al cerrar).

**En tu diagrama de secuencia (§ 28):**

```
   2.14  Monitoring Publisher ──▶ publishTransportStatus(transportStatusEventDto)
   2.15  SSE Bus              ──▶ publish(transport_status, FLEET#{distributorId})
```

### Parámetro de entrada: `transportStatusEventDto`

| Atributo | Tipo | Oblig. | Origen / Descripción |
|---|---|---|---|
| `routeId` | number | Sí | **La clave del parcheo.** El listado indexa por ruta para este evento |
| `transportOrderId` | number | Sí | Para que el listado ubique la fila si la ruta trae varias órdenes |
| `transportStatus` | string | Sí | `PENDING` · `EN_RUTA` · `COMPLETED` |
| `departureDate` | string \| null | No | **`routes.departure_date`, y NO se llena en § 28** — ver la nota de abajo. Viaja igual en los dos eventos, sin cambiar |
| `completedDate` | string \| null | No | `null` hasta § 39. **El § 39 lo escribe como `ended_at`** y lo devuelve como `endedAt`; en el evento y en el snapshot de § 19/§ 25 la columna es `routes.completed_date`. Es el mismo instante con tres nombres — unificar |
| `licensePlate` | string | Sí | Redundante con el snapshot, y a propósito: evita que el listado tenga que ir a buscar la placa para repintar la fila |
| `driverName` | string | Sí | Ídem |

**`departureDate` es la salida PLANIFICADA, no la real.** Es un error fácil de cometer al leer el § 28:
`updateTransportOrderStatus` (2.3/2.4) toca **solo la columna `status`**, y la respuesta del endpoint no
devuelve ninguna fecha. La fecha nace mucho antes, en la planificación — § 10.4.1 la setea al crear la
salida. Así que cuando el chofer aprieta "Iniciar ruta" el evento viaja con la hora **prevista**, no con
la hora en que arrancó de verdad. **Si el planificador necesita ver el arranque real, hoy no hay columna
donde vive.** Queda como residuo (§ 40.14).

**`endKm` no viaja, a propósito.** El § 39 registra el odómetro final (`end_km`), pero es un dato de
flota, no de monitoreo: no repinta nada en el listado. Si más adelante hace falta, entra por el
snapshot, no por el stream.

### Salida — al iniciar la ruta (§ 28)

```json
{
  "routeId": 512,
  "transportOrderId": 4471,
  "transportStatus": "EN_RUTA",
  "departureDate": "2026-07-16T08:00:00.000Z",
  "completedDate": null,
  "licensePlate": "3456-ABC",
  "driverName": "Carlos Mamani"
}
```

### Salida — al cerrar la hoja de ruta (§ 39)

```json
{
  "routeId": 512,
  "transportOrderId": 4471,
  "transportStatus": "COMPLETED",
  "departureDate": "2026-07-16T08:00:00.000Z",
  "completedDate": "2026-07-16T16:00:00.000Z",
  "licensePlate": "3456-ABC",
  "driverName": "Carlos Mamani"
}
```

**Qué repinta:** el badge de estado de la fila y la columna de fechas.

**Puede tocar N filas.** Si esa ruta lleva varias órdenes de transporte, el cambio de estado de la
salida las afecta a todas. El frontend parchea **todas las filas con ese `routeId`**, no una. Es la
misma asimetría de `tracking` y la razón por la que el listado necesita dos índices.

**Con el cierre de la ruta se cierra el stream de posición.** Después de `COMPLETED` no llegan más
pings: el `ROUTE#{routeId}` deja de tener productor. El monitor tiene que aceptar que la última
posición se congele — no es una señal perdida, es una ruta terminada.

---

## § 40.5 · `delivery_enroute` — el chofer salió hacia la parada

**Lo dispara:** § 29 · `PATCH /api/v1/last-mile/deliveries/:id/on-the-way`. Lo aprieta el chofer.

**Dónde se publica:** después de `createDeliveryHistory` (paso 3.6) y **antes o después de la
notificación al cliente** (`evenado MS`, 3.7) — son independientes: una va al cliente final por
WhatsApp y la otra al planificador por SSE.

**Método:** `publishDeliveryEnroute(deliveryEnrouteEventDto)`
**Scope:** `ORDER#{transportOrderId}`
**Cadencia:** 1 vez por parada.

**En tu diagrama de secuencia:**

```
   3.9   Monitoring Publisher ──▶ publishDeliveryEnroute(deliveryEnrouteEventDto)
   3.10  SSE Bus              ──▶ publish(delivery_enroute, ORDER#{transportOrderId})
```

### El paso que falta y hay que hacer explícito

El endpoint recibe `deliveryOrderId`, pero **el scope se compone con `transportOrderId`**. Hay que
resolverlo, y sale de la misma fila que ya estás actualizando:

```sql
SELECT transport_order_id FROM delivery_orders WHERE id = $1;
-- delivery_orders.transport_order_id — UltimaVersion.sql:383, BIGINT NOT NULL
```

**No hace falta una consulta aparte:** el `UPDATE` del paso 3.3 ya toca esa fila, así que se devuelve
en el `RETURNING`. Vale lo mismo para § 30, § 34, § 35, § 37 y § 38 — **los seis eventos de entrega
necesitan este dato y ninguno debería ir a buscarlo dos veces**.

### Parámetro de entrada: `deliveryEnrouteEventDto`

| Atributo | Tipo | Oblig. | Origen / Descripción |
|---|---|---|---|
| `deliveryOrderId` | number | Sí | **La clave del parcheo.** El mapa indexa las paradas por acá |
| `transportOrderId` | number | Sí | Solo para componer el scope. **No viaja en el payload** |
| `status` | string | Sí | `ENROUTE` |
| `changedAt` | string | Sí | Reloj del servidor al procesar el cambio |
| `etaTime` | string \| null | No | Hora estimada de llegada, si se calculó |

### Salida

```json
{
  "deliveryOrderId": 90113,
  "status": "ENROUTE",
  "changedAt": "2026-07-16T08:52:00.000Z",
  "etaTime": "09:02"
}
```

**Qué repinta:** el color del pin de esa parada y la etiqueta de su tarjeta, que pasa a *"En camino"*.

**Sin este evento el mapa pierde el paso intermedio:** la parada saltaría de *pendiente* a *entregada*
sin mostrar nunca que el camión iba hacia ella, que es justo lo que el planificador mira para saber si
va atrasado.

---

## § 40.6 · `delivery_arrived` — el camión llegó al punto

**Lo dispara:** § 30 · `PATCH /api/v1/last-mile/deliveries/:id/arrive`. El chofer lo aprieta **en la
puerta del cliente**, y la app captura el GPS en ese momento.

**Dónde se publica:** después de `createDeliveryHistory` (paso 4.6).

**Método:** `publishDeliveryArrived(deliveryArrivedEventDto)`
**Scope:** `ORDER#{transportOrderId}`
**Cadencia:** 1 vez por parada.

**En tu diagrama de secuencia:**

```
   4.9   Monitoring Publisher ──▶ publishDeliveryArrived(deliveryArrivedEventDto)
   4.10  SSE Bus              ──▶ publish(delivery_arrived, ORDER#{transportOrderId})
```

### Parámetro de entrada: `deliveryArrivedEventDto`

| Atributo | Tipo | Oblig. | Origen / Descripción |
|---|---|---|---|
| `deliveryOrderId` | number | Sí | La clave del parcheo |
| `transportOrderId` | number | Sí | Solo para el scope |
| `status` | string | Sí | `ARRIVED` |
| `arrivedAt` | string | Sí | `delivery_orders.arrived_at` — reloj del servidor |
| `arrivalLatitude` | number | Sí | `delivery_orders.arrival_latitude` — **dónde estaba el celular al marcar llegada** |
| `arrivalLongitude` | number | Sí | `delivery_orders.arrival_longitude` |
| `outOfWindow` | boolean | Sí | Derivado: `arrivedAt` cae fuera de `delivery_window_start`-`end` |

### Salida

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

**Qué repinta:** el pin pasa a *"En el punto"* y la tarjeta muestra la hora de llegada.

**Las coordenadas de llegada NO son las del punto de entrega, y esa es la gracia.** El punto planificado
sale del servicio de `delivery_point`; estas salen del celular del chofer. La distancia entre las dos es
lo que permite responder *"¿marcó llegada desde adentro del local o desde la esquina?"*. Si el evento
mandara solo `arrivedAt`, esa pregunta se pierde.

**`outOfWindow` se calcula en el servidor y viaja resuelto.** Podría derivarlo el cliente, pero
necesitaría la ventana horaria de esa parada a mano — y el listado de flota no la tiene. Se resuelve una
vez, del lado que sí tiene el dato.

---

## § 40.7 · `delivery_closed` — la parada dejó de estar abierta

**Lo disparan dos acciones distintas, con el mismo evento:**

| § | Acción | `status` resultante |
|---|---|---|
| 38 | **Finalizar entrega** — `POST /api/v1/last-mile/deliveries/:id/complete` | `DELIVERED` |
| 34 | **Registrar incidencia** — `POST /api/v1/last-mile/deliveries/:id/incidents` | `INCIDENT` |

**Dónde se publica:** después de `createDeliveryHistory` (38: paso 13.6 · 34: paso 9.8), y **junto con
`order_progress`** — los dos salen del mismo cierre *(ver § 40.10)*.

**Método:** `publishDeliveryClosed(deliveryClosedEventDto)`
**Scope:** `ORDER#{transportOrderId}`
**Cadencia:** 1 vez por parada.

**En tu diagrama de secuencia (§ 38):**

```
   13.7  Monitoring Publisher ──▶ publishDeliveryClosed(deliveryClosedEventDto)
   13.8  SSE Bus              ──▶ publish(delivery_closed, ORDER#{transportOrderId})
   13.9  Monitoring Publisher ──▶ publishOrderProgress(orderProgressEventDto)
   13.10 SSE Bus              ──▶ publish(order_progress, FLEET#{distributorId})
```

### Corrección: el POD (§ 33) NO cierra la parada

Vale aclararlo porque es un error fácil de cometer al armar el diagrama. La documentación de monitoreo
anterior daba a entender que el evento salía al registrar el comprobante. **No es así**, y el propio
§ 33 lo dice: su respuesta cierra con `nextActionButtonLabel: "Continuar al Registro de Cobro"`. El POD
es evidencia intermedia; la parada sigue en `ARRIVED`.

La secuencia real es: **§ 33 POD → § 35-37 cobro → § 38 cierre**. El evento sale recién al final.

### Parámetro de entrada: `deliveryClosedEventDto`

| Atributo | Tipo | Oblig. | Origen / Descripción |
|---|---|---|---|
| `deliveryOrderId` | number | Sí | La clave del parcheo |
| `transportOrderId` | number | Sí | Solo para el scope |
| `status` | string | Sí | `DELIVERED` (§ 38) o `INCIDENT` (§ 34) |
| `deliveredAt` | string | Sí | `delivery_orders.delivered_at` — hora real del cierre |
| `deliveryResultCode` | string \| null | No | Motivo cuando no se entregó: `CLIENTE_AUSENTE`, `RECHAZO_TOTAL`… |
| `receiverName` | string \| null | No | Quién **recibió**. `null` si hubo incidencia |
| `hasProof` | boolean | Sí | Si existe fila en `proof_of_deliveries` |
| `hasIncident` | boolean | Sí | Si existe fila en `delivery_incidents` |

### Salida — parada entregada (§ 38)

```json
{
  "deliveryOrderId": 90112,
  "status": "DELIVERED",
  "deliveredAt": "2026-07-16T08:34:00.000Z",
  "deliveryResultCode": null,
  "receiverName": "Lic. Roberto Gómez",
  "hasProof": true,
  "hasIncident": false
}
```

### Salida — parada con incidencia (§ 34)

```json
{
  "deliveryOrderId": 90113,
  "status": "INCIDENT",
  "deliveredAt": "2026-07-16T09:11:00.000Z",
  "deliveryResultCode": "CLIENTE_AUSENTE",
  "receiverName": null,
  "hasProof": false,
  "hasIncident": true
}
```

**Qué repinta:** el color y la insignia del pin, el estado de la tarjeta, el tiempo *"llegada → cierre"*
y —vía `order_progress`— la barra de progreso.

### Lo que este evento NO trae, y es una decisión abierta

**No viaja la evidencia**: ni la foto del comprobante, ni la firma, ni el detalle de la incidencia, ni
las cantidades finales por producto. Solo las dos banderas `hasProof` / `hasIncident`.

La razón: es un evento que se emite **por cada parada de cada camión de la flota**, y meterle adentro
tres URLs de S3 más el detalle de ítems lo engorda para un dato que el planificador mira en una parada
de veinte. **El costo se paga siempre y el beneficio se usa a veces.**

La consecuencia: si el planificador tiene el panel abierto en esa parada justo cuando se cierra, ve las
banderas pero **no ve la foto hasta recargar**. Las dos salidas son mandar todo adentro del evento, o
exponer un `GET /monitoring/deliveries/{deliveryOrderId}` bajo demanda. **Hoy no existe ninguna de las
dos** y hay que decidirlo.

---

## § 40.8 · `payment_registered` — se registró un cobro

**Lo disparan dos endpoints, con el mismo evento:**

| § | Acción | Nace con `status` |
|---|---|---|
| 35 | **Generar cobro QR** — `POST /api/v1/collections/qr/generate` | `PENDING` |
| 37 | **Cobrar en efectivo** — `POST /api/v1/collections/cash/register` | `COMPLETED` |

**Dónde se publica:** después de `createPaymentReference` (35: paso 10.6 · 37: paso 12.6).

**Método:** `publishPaymentRegistered(paymentRegisteredEventDto)`
**Scope:** `ORDER#{transportOrderId}`
**Cadencia:** **1 a 3 veces por parada.** Los cobros pueden ser **parciales y múltiples**: 200 en QR,
300 en efectivo y 500 a deber es un caso normal, no un borde.

**En tu diagrama de secuencia (§ 37):**

```
   12.7  Monitoring Publisher ──▶ publishPaymentRegistered(paymentRegisteredEventDto)
   12.8  SSE Bus              ──▶ publish(payment_registered, ORDER#{transportOrderId})
```

### Parámetro de entrada: `paymentRegisteredEventDto`

| Atributo | Tipo | Oblig. | Origen / Descripción |
|---|---|---|---|
| `deliveryOrderId` | number | Sí | La parada a la que pertenece el pago |
| `deliveryOrderSaleId` | number | Sí | **La clave del pedido monitoreado**. Sale de `delivery_order_sales.id` y es el FK real de `delivery_payment_references` |
| `transportOrderId` | number | Sí | Solo para el scope |
| `paymentId` | string | Sí | Identidad del pago **dentro** de la entrega. Es lo que `payment_status` usa después para ubicarlo |
| `collectionPaymentId` | number | Sí | ID del cobro en Ms Cobranzas |
| `paymentMethod` | string | Sí | `CASH` · `TRANSFER` · `QR` · `CHECK` |
| `amount` | number | Sí | Monto de **este** pago, no el total de la entrega |
| `currency` | string | Sí | `BOB` |
| `status` | string | Sí | `PENDING` (QR recién emitido) o `COMPLETED` (efectivo) |
| `reference` | string \| null | No | `id_qr` (QR), `receiptNumber` (efectivo), nº de operación o de cheque |
| `registeredAt` | string | Sí | Hora del registro |
| `summary` | object | Sí | Los cuatro montos de la entrega, **ya sumados** |

### Sub-DTO: `summary`

| Atributo | Tipo | Descripción |
|---|---|---|
| `aCobrar` | number | `Σ delivered_qty × unit_price_snapshot`, menos lo que va a crédito |
| `cobrado` | number | Σ de los pagos **confirmados** |
| `enProceso` | number | Σ de los QR emitidos y **no confirmados todavía** |
| `saldo` | number | `aCobrar − cobrado − enProceso` |

### Salida — QR emitido (§ 35)

```json
{
  "deliveryOrderId": 90112,
  "deliveryOrderSaleId": 88021,
  "paymentId": "pay-90112-1",
  "collectionPaymentId": 1052,
  "paymentMethod": "QR",
  "amount": 200.00,
  "currency": "BOB",
  "status": "PENDING",
  "reference": "25051501009100893840",
  "registeredAt": "2026-07-16T08:31:00.000Z",
  "summary": { "aCobrar": 1000.00, "cobrado": 300.00, "enProceso": 200.00, "saldo": 500.00 }
}
```

### Salida — efectivo (§ 37)

```json
{
  "deliveryOrderId": 90112,
  "deliveryOrderSaleId": 88022,
  "paymentId": "pay-90112-2",
  "collectionPaymentId": 2041,
  "paymentMethod": "CASH",
  "amount": 300.00,
  "currency": "BOB",
  "status": "COMPLETED",
  "reference": "REC-90123",
  "registeredAt": "2026-07-16T08:29:00.000Z",
  "summary": { "aCobrar": 1000.00, "cobrado": 300.00, "enProceso": 0.00, "saldo": 700.00 }
}
```

**Qué repinta:** la pestaña *Cobro* del panel derecho — la lista de pagos y los cuatro montos. En una
vista plana de pedidos, `deliveryOrderSaleId` es la clave que permite tocar **solo** el pedido que cobró.

**El `qrBase64` NO viaja.** Es para que la app le muestre el QR al cliente; el monitor no tiene que
renderizar nada escaneable. Mandarlo sería empujar ~4 KB de imagen por un dato que nadie mira.

**El `summary` viaja resuelto y no calculado por el cliente.** Con cobros parciales el frontend tendría
que acumular todos los pagos que vio, y **si se perdió uno durante una reconexión la suma queda mal para
siempre**. El servidor ya tiene la cuenta completa: la manda hecha. Es la misma razón por la que
`order_progress` manda el contador sumado.

---

## § 40.9 · `payment_status` — el banco confirmó el QR

**Lo dispara:** § 36 · `GET /api/v1/collections/qr/status/{paymentId}`. **No lo dispara el chofer**: lo
dispara la app consultando periódicamente, o la banca vía Ms Cobranzas. Es el único evento del catálogo
cuyo origen no es un botón.

**Dónde se publica:** después de `updatePaymentReferenceStatus` (paso 11.6), y **solo si el estado
cambió**. La app consulta cada pocos segundos; publicar en cada consulta sería mandar veinte eventos
idénticos para un solo cambio.

**Método:** `publishPaymentStatus(paymentStatusEventDto)`
**Scope:** `ORDER#{transportOrderId}`
**Cadencia:** 1 vez por QR (o 2, si además vence).

**En tu diagrama de secuencia:**

```
   11.9   opt [status cambió]
   11.10    Monitoring Publisher ──▶ publishPaymentStatus(paymentStatusEventDto)
   11.11    SSE Bus              ──▶ publish(payment_status, ORDER#{transportOrderId})
```

### Parámetro de entrada: `paymentStatusEventDto`

| Atributo | Tipo | Oblig. | Origen / Descripción |
|---|---|---|---|
| `deliveryOrderId` | number | Sí | La parada a la que pertenece el pago |
| `deliveryOrderSaleId` | number | Sí | La fila de pedido a la que pertenece el QR |
| `transportOrderId` | number | Sí | Solo para el scope |
| `paymentId` | string | Sí | **Cuál** de los pagos de esa entrega cambió |
| `collectionPaymentId` | number | Sí | ID en Ms Cobranzas |
| `status` | string | Sí | `COMPLETED` · `EXPIRED` · `CANCELLED` |
| `transactionNumber` | string \| null | No | Comprobante bancario de la transferencia |
| `paidAt` | string \| null | No | Cuándo se efectivizó el pago |
| `summary` | object | Sí | Los cuatro montos, recalculados |

### Salida

```json
{
  "deliveryOrderId": 90112,
  "deliveryOrderSaleId": 88021,
  "paymentId": "pay-90112-1",
  "collectionPaymentId": 1052,
  "status": "COMPLETED",
  "transactionNumber": "TRX-880192",
  "paidAt": "2026-07-16T08:33:12.000Z",
  "summary": { "aCobrar": 1000.00, "cobrado": 500.00, "enProceso": 0.00, "saldo": 500.00 }
}
```

**Qué repinta:** ese pago pasa de *"esperando al banco"* a confirmado, y los cuatro montos se ajustan.

### Por qué son dos eventos y no uno

`payment_registered` y `payment_status` podrían ser el mismo evento con el `status` adentro. **No
conviene, por dos razones:**

1. **`payment_registered` CREA una fila en la lista de pagos; `payment_status` MODIFICA una existente.**
   Con un solo evento el frontend tiene que adivinar cuál de las dos cosas hacer, y si el `paymentId` ya
   está en su estado local. Reusar el mismo nombre para crear y actualizar es exactamente cómo se
   duplican filas.
2. **Llegan separados en el tiempo.** El QR se emite y el banco confirma **minutos después**, incluso
   con la parada ya cerrada. El monitor tiene que aceptar que la pestaña *Cobro* se complete fuera de
   orden, y eventos distintos lo hacen explícito.

> **Nota de consistencia:** `Streaming.md § S.2` y `§ S.5` ya están alineados con este modelo de dos
> eventos y tres productores. Si se toca uno, tocar el otro.

---

## § 40.10 · `order_progress` — el contador de la orden

**Lo dispara:** no es una acción del chofer. **Es derivado**: se recalcula y se publica cada vez que una
parada se cierra (§ 34 y § 38). El chofer no aprieta nada que diga *"actualizar progreso"*.

**Dónde se publica:** inmediatamente después de `publishDeliveryClosed`, en el mismo bloque.

**Método:** `publishOrderProgress(orderProgressEventDto)`
**Scope:** `FLEET#{distributorId}`
**Cadencia:** 1 vez por parada cerrada.

### Parámetro de entrada: `orderProgressEventDto`

| Atributo | Tipo | Descripción |
|---|---|---|
| `transportOrderId` | number | **La clave del parcheo.** Acá se indexa por orden, no por ruta |
| `progress.total` | number | `count(delivery_orders)` de la orden |
| `progress.delivered` | number | Entregas cerradas y cumplidas |
| `progress.failed` | number | Cerradas sin entregar |
| `progress.returned` | number | Cerradas con devolución |
| `progress.pending` | number | Derivado: `total − (delivered + failed)` |
| `progress.progressPct` | number | Derivado: `cerradas / total` |
| `progress.incidents` | number | `count(delivery_incidents)` de la orden |
| `progress.outOfWindow` | number | Paradas atendidas fuera de la ventana horaria |

### Salida

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
  }
}
```

**Qué repinta:** la barra de progreso y los contadores de la fila del **listado**.

**No se publica al canal de detalle, a propósito.** En el mapa están las doce entregas una por una: el
cliente ya tiene con qué sumar. En el listado, en cambio, la fila muestra el contador y **no** las
paradas — sin este evento tendría que abrir la orden para saber que avanzó.

**Por qué el contador viaja sumado y no como *"+1 entregada"*.** Un incremento se pierde si el monitor
estaba reconectando: el contador quedaría desfasado hasta recargar la pantalla. El total absoluto es
idempotente — se puede aplicar dos veces sin romper nada. **Es la regla general de todos los eventos:
mandar estado, no incrementos.**

---

## § 40.11 · Acciones que NO publican, y por qué

Cinco pasos del chofer no generan ningún evento. Es deliberado, y conviene tenerlo escrito para no
agregarlos "por las dudas": cada evento que se agrega se paga en todas las paradas de todos los camiones.

| § | Acción | Por qué no publica |
|---|---|---|
| 27 | Listar sus órdenes aprobadas | Es una **lectura**. No cambia nada que el monitor muestre |
| 31 | Verificar productos ítem por ítem | Son **decenas de toques por parada** y el monitor no muestra el checklist. Se entera del resultado al cerrar, en `delivery_closed` |
| 32 | Subir la foto a S3 | Es de la app del chofer. El monitor recibe la URL ya resuelta, y solo cuando la parada cierra |
| 33 | Registrar el comprobante (POD) | La parada **sigue abierta** — ver § 40.7. La evidencia llega como bandera `hasProof` al cerrar |
| — | Notificar al cliente (`evenado MS`) | `DRIVER_ON_THE_WAY` y `DRIVER_ARRIVED` son **del cliente final**, no del planificador. Se podría mostrar *"cliente notificado"*; hoy no está pedido |

**El criterio, en una línea:** se publica lo que **cambia algo que el monitor está mostrando**. Todo lo
demás es ruido que hay que serializar, mandar y descartar.

---

## § 40.12 · Reglas transversales

Valen para los ocho eventos. Si tu diagrama cumple estas cinco, no hace falta que consultes nada más.

| # | Regla | Por qué |
|---|---|---|
| 1 | **Publicar después del commit, nunca antes** | Si la transacción falla, el monitor no puede haber visto el estado |
| 2 | **Publicar después de SAP cuando SAP puede rechazar** (§ 28, § 39) | Un rechazo revierte el estado local; el evento ya no tendría respaldo |
| 3 | **El publish no bloquea la respuesta al móvil** | El bus es en memoria. El chofer no espera al monitor |
| 4 | **Mandar estado absoluto, no incrementos** | Un incremento perdido en una reconexión desfasa el cliente para siempre |
| 5 | **Una clave de parcheo por evento, y siempre la misma** | El frontend indexa por esa clave. Cambiarla entre eventos lo obliga a tener un camino distinto por tipo |

### Las claves de parcheo, juntas

| Evento | Clave | El frontend indexa por |
|---|---|---|
| `tracking` | `routeId` | `Map<routeId, ...>` — **puede tocar N filas** |
| `transport_status` | `routeId` | `Map<routeId, ...>` — **puede tocar N filas** |
| `order_progress` | `transportOrderId` | `Map<transportOrderId, ...>` |
| `delivery_enroute` · `delivery_arrived` · `delivery_closed` | `deliveryOrderId` | `Map<deliveryOrderId, ...>` |
| `payment_registered` · `payment_status` | `deliveryOrderSaleId` + `paymentId` | La lista de pagos del pedido; `deliveryOrderId` sigue sirviendo para recalcular el agregado de la parada |

---

## § 40.13 · Ejemplo completo: el cobro de una parada

Cómo se ve la secuencia de eventos que el monitor recibe en una parada real donde el cliente paga 200
por QR, 300 en efectivo y queda debiendo 500.

| Momento | Acción del chofer | Evento | Lo que ve el planificador |
|---|---|---|---|
| 08:52 | Aprieta *"Estoy en camino"* | `delivery_enroute` | El pin cambia de color |
| 09:02 | Aprieta *"Marcar llegada"* | `delivery_arrived` | El pin pasa a *"En el punto"*, aparece la hora |
| 09:08 | Registra el comprobante | — | Nada todavía |
| 09:10 | Genera el QR por Bs 200 | `payment_registered` | Aparece el pago, *"esperando al banco"*. Saldo Bs 800 |
| 09:11 | Cobra Bs 300 en efectivo | `payment_registered` | Segundo pago, confirmado. Saldo Bs 500 |
| 09:12 | *(el banco confirma el QR)* | `payment_status` | El QR pasa a confirmado. Cobrado Bs 500 |
| 09:14 | Aprieta *"Finalizar entrega"* | `delivery_closed` + `order_progress` | Pin verde, tarjeta cerrada, la barra sube |

**Siete eventos para una parada.** Cinco los dispara el chofer con un botón, uno lo dispara el banco y
uno es derivado. Ninguno reenvía el estado completo de la orden: cada uno parchea lo suyo.

---

## § 40.14 · Residuos y decisiones abiertas

1. **La evidencia del cierre no viaja** (§ 40.7). Hay que decidir entre engordar `delivery_closed` o
   exponer un `GET` bajo demanda. Hoy no existe ninguna de las dos.
2. ~~**`Streaming.md § S.5` lista `payment_registered` como evento único**~~ — **resuelto.** `Streaming.md`
   § S.2, § S.3 y § S.5 ya reflejan los dos eventos y los tres productores.
3. **`delivery_payment_references` no soporta el efectivo.** `id_qr` es `NOT NULL` y § 37 llama a
   `createPaymentReference` **sin** `idQr`: la fila no se puede insertar. Además faltan las columnas
   `payment_method`, `transaction_number` y `receipt_number`, que los eventos § 40.8 y § 40.9 sí
   mandan. **Es un bloqueo real de esquema, no cosmético** — sin resolverlo, `payment_registered` solo
   se puede emitir para QR.
4. **`routes.distributor_id` no existe en `UltimaVersion.sql`** y sin ella no se compone
   `FLEET#{distributorId}`, que es el scope de `transport_status`, `order_progress` y del `tracking`
   del listado. Es el mismo hueco que arrastra el modelo de v0.0.3 al mover los parámetros de `TRIPS` a
   `ROUTES`.
5. **`paymentId` no tiene origen en la base.** Los eventos de cobro lo usan como identidad del pago
   dentro de la entrega, pero `delivery_payment_references` solo tiene su `id` autoincremental. Lo más
   simple es usar ese `id` directamente y sacarse el formato `pay-{n}-{n}` de encima.
6. **No existe la hora real de arranque de la salida** (§ 40.4). `departureDate` es la fecha
   **planificada** que § 10.4.1 escribe al crear la ruta; el § 28 no estampa nada cuando el chofer
   aprieta "Iniciar ruta". El listado no puede distinguir una salida puntual de una que arrancó dos
   horas tarde. Hace falta una columna nueva (`routes.actual_departure_date` o equivalente) y que el
   § 28 la escriba en 2.3/2.4, junto al `status`.
7. **El instante de cierre tiene tres nombres** (§ 40.4). El § 39 escribe `ended_at` y responde
   `endedAt`; el evento y los snapshots de § 19/§ 25 lo llaman `routes.completed_date`. Es el mismo
   dato. Unificar antes de implementar, o el dev va a buscar una columna que no existe.
