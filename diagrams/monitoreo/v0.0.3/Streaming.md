# Monitoreo — El streaming en tiempo real

> **v0.0.3.** Sección dedicada al transporte de datos en vivo de las dos pantallas del monitor.
> Consolida lo que hoy está repartido entre `DocumentacionTecnica.md § 18.16-18.19` (stream de flota)
> y `DetalleMapa.docx § B.0-B.9` (stream del detalle), y agrega lo que ninguno de los dos explica: la
> mecánica del protocolo y el contrato de actualización parcial.
>
> Los flujos por evento (qué método escribe en qué tabla antes de publicar) **no se repiten acá**:
> viven en `DetalleMapa.docx § B.2-B.6`. Esta sección responde *cómo viaja* y *qué llega*, no *quién
> lo produce*.
>
> **Dónde va en el documento grande:** reemplaza la **§ 26 "actualización de la información en tiempo
> real"**, que hoy es un stub de diez líneas y encima está **cortado a mitad de frase** (*"La posicion
> es del cami"*). Esa § 26 tiene las dos líneas de `subscribe(...)` y nada más — es exactamente la
> razón por la que el streaming no se entiende leyendo el Word.

---

## S.0 · La pregunta de fondo: ¿el frontend pide, o le llega?

**Le llega. El frontend no pide nada después de abrir la pantalla.**

Esta es la confusión más común y vale desarmarla con precisión, porque hay tres modelos posibles y
solo uno es el que usamos:

| Modelo | Cómo funciona | ¿Es el nuestro? |
|---|---|---|
| **Polling** | El frontend pregunta *"¿algo nuevo?"* cada N segundos. N peticiones por minuto, casi todas devolviendo lo mismo | **No** |
| **Long polling** | El frontend pregunta, el servidor retiene la respuesta hasta que haya algo, contesta, y el cliente **vuelve a preguntar** | **No** |
| **SSE (Server-Sent Events)** | El frontend abre **UNA** petición que **no se cierra**. El servidor escribe dentro de esa respuesta abierta cada vez que tiene algo | **Sí** |

La diferencia que importa: en polling el cliente **pregunta**; en SSE el cliente **espera**. No hay una
petición por evento. Hay **una petición para toda la sesión**, y los eventos son escrituras sucesivas
dentro del cuerpo de esa única respuesta.

### El malentendido a evitar

> *"Llega un evento → el frontend hace un GET para traer el dato."*

**No.** El evento **ya trae el dato**. No es una notificación de *"algo cambió, andá a buscarlo"*: es
el cambio en sí. El frontend recibe el JSON, parchea su estado local y repinta. Cero peticiones
adicionales.

La única excepción está anotada como decisión abierta en `DetalleMapa § B.5`: el evento
`delivery_closed` **no trae la evidencia** (comprobante, incidencia, cantidades finales), solo
`hasProof` / `hasIncident`. Si se decide mostrar la evidencia al instante, ahí sí haría falta un
`GET /monitoring/deliveries/{deliveryOrderId}` bajo demanda. Hoy no existe.

---

## S.1 · Cómo funciona, mecánicamente

### Del lado del servidor

Una respuesta HTTP normal se ve así: cabeceras, cuerpo, cierre. El navegador sabe que terminó porque
la conexión se cierra o porque se cumplió el `Content-Length`.

Una respuesta SSE **omite el `Content-Length` y nunca se cierra**. El servidor manda las cabeceras, y
después escribe bloques de texto en el cuerpo cuando quiere. El navegador va leyendo lo que llega y
dispara un evento de JavaScript por cada bloque completo.

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

La última es la que más se olvida y la que rompe todo en producción: sin ella, Nginx **acumula** el
cuerpo en su buffer y lo entrega por lotes. La conexión sigue viva, los eventos siguen llegando, pero
llegan de a diez y con retraso — y el "tiempo real" desaparece sin ningún error visible.

### El formato de cable

Cada evento son tres líneas y **una línea en blanco que lo termina**. La línea en blanco no es
cosmética: es el delimitador del protocolo. Sin ella el navegador sigue esperando y no dispara nada.

```
id: 1784201079000-512
event: tracking
data: {"routeId":512,"latitude":-17.783412,"longitude":-63.181245,"battery":74,"trackedAt":"2026-07-16T08:24:39.000Z","receivedAt":"2026-07-16T08:24:40.180Z"}

id: 1784201082000-1001
event: delivery_arrived
data: {"deliveryOrderId":1001,"status":"ARRIVED","arrivedAt":"2026-07-31T08:15:00.000Z","arrivalLatitude":-17.783312,"arrivalLongitude":-63.182145}

: heartbeat

```

| Línea | Para qué |
|---|---|
| `id:` | Identificador del evento. Formato `{epochMs}-{claveDelPayload}` |
| `event:` | El nombre que el cliente escucha. Es lo que permite tener varios tipos en un mismo canal |
| `data:` | El payload, JSON en **una sola línea** (un salto de línea acá cortaría el evento) |
| *(línea vacía)* | **Termina el evento.** Obligatoria |
| `: heartbeat` | Comentario del protocolo. El cliente lo descarta. Ver S.7 |

### Del lado del cliente

El navegador ya trae el protocolo implementado. No hay librería:

```js
const es = new EventSource(`/monitoring/orders/${transportOrderId}/stream`);

es.addEventListener('tracking',        e => patchByRouteId(JSON.parse(e.data)));
es.addEventListener('delivery_enroute', e => patchByDeliveryOrderId(JSON.parse(e.data)));
es.addEventListener('delivery_arrived', e => patchByDeliveryOrderId(JSON.parse(e.data)));
es.addEventListener('delivery_closed',  e => patchByDeliveryOrderId(JSON.parse(e.data)));
```

Fijate que **no hay ningún `fetch` adentro de los handlers**. Eso es la prueba visual del modelo: el
handler recibe, parsea y parchea. No sale a buscar nada.

---

## S.2 · Los dos canales

Son dos streams distintos, uno por pantalla. **Nunca están los dos abiertos a la vez**, porque son dos
pantallas distintas.

| | **Canal de FLOTA** | **Canal de DETALLE** |
|---|---|---|
| Pantalla | Listado de órdenes despachadas | Mapa de una orden |
| Endpoint | `GET /monitoring/stream?distributorId={id}` | `GET /monitoring/orders/{transportOrderId}/stream` |
| Snapshot previo | `GET /monitoring/orders?distributorId={id}` | `GET /monitoring/orders/{transportOrderId}` |
| Suscripciones | **1** — `FLEET#{distributorId}` | **2** — `ROUTE#{routeId}` + `ORDER#{transportOrderId}` |
| Alcance | Todos los camiones de la distribuidora | Un camión y una orden |
| Eventos | `tracking`, `order_progress`, `transport_status` | `tracking`, `delivery_enroute`, `delivery_arrived`, `delivery_closed`, `payment_registered`, `payment_status` |
| Cadencia de `tracking` | **Agrupado ~30 s** | **Ping por ping** |
| Pasos | 18.16 → 18.19 | B.1.1 → B.1.4 |

**La vista por pedido NO abre un tercer canal.** Si el frontend muestra una tabla plana de pedidos,
esa tabla sale de un snapshot proyectado y se mantiene con estos mismos eventos:

- `tracking` por `routeId`,
- `delivery_*` por `deliveryOrderId`,
- `payment_*` por `deliveryOrderSaleId` + `paymentId` cuando hay cobros.

No existe un scope `ORDER_SALE#{deliveryOrderSaleId}` ni un evento `pedido_updated`: mientras el negocio
no introduzca operaciones independientes por pedido, el pedido monitoreado es una **proyección** del
estado de su parada y de sus cobros.

### Una conexión, no una por camión

El canal de flota es **una sola conexión con scope de FLOTA**, no 40 conexiones (una por camión). El
stream transporta los eventos de todos los camiones de la distribuidora y el cliente parchea por id.

Esto no es una optimización opcional: sobre HTTP/1.1 el navegador limita a **6 conexiones por
dominio**, así que 40 streams son imposibles. Y aun con HTTP/2, mantener 40 suscripciones para una
pantalla es desperdicio puro.

### Por qué el detalle necesita DOS suscripciones y la flota una

Es la consecuencia directa del muchos-a-uno de v0.0.3 (una ruta lleva N órdenes):

```
subscribe(ROUTE#{routeId})           → tracking
subscribe(ORDER#{transportOrderId})  → delivery_enroute · delivery_arrived · delivery_closed
```

Los eventos son **hechos de dos entidades distintas**:

- La **posición es del CAMIÓN** (la ruta). Si se publicara por orden, el publisher tendría que
  consultar Postgres en cada ping para saber cuántas órdenes van en ese camión, y publicar N veces.
- La **entrega es de la ORDEN**. Si se publicara por ruta, las otras N-1 órdenes del camión recibirían
  un evento que no les corresponde.

Colapsarlos en un scope único rompe una de las dos cosas. No hay atajo.

> Con `routeId = null` la conexión se abre igual, solo con el scope de la orden: una orden sin ruta
> puede recibir eventos de entrega, no de posición.

---

## S.3 · Por qué SSE y no otra cosa

| Opción | Por qué no |
|---|---|
| **Polling** | Con 40 camiones y refresco de 5 s son 12 peticiones/min que traen el estado completo cada vez. La mayoría no trae nada nuevo, y el retraso promedio es la mitad del intervalo |
| **WebSockets** | Es bidireccional y el monitor **solo lee**. La vía cliente→servidor no se usaría nunca. Y reconexión automática y `Last-Event-ID` —que SSE trae nativos del navegador— hay que implementarlos a mano sobre WS: justo la parte cara |
| **SSE** | Unidireccional, que es exactamente la forma del problema. Es HTTP normal: atraviesa proxies, se autentica igual, se depura con las herramientas de red del navegador |

**Requisito:** HTTP/2. Sobre HTTP/1.1 el stream se come una de las 6 conexiones por dominio.

### Dónde SÍ se usa polling, y por qué está bien

Hay un caso en el sistema que **sí hace polling a propósito**, y conviene tenerlo escrito para que no
parezca una incoherencia: la **verificación del pago QR** (§ 36), donde la doc dice textualmente
*"consulta periódica (polling) o verificación manual ejecutada desde la App Móvil"*.

Es correcto, y la razón es la única que justifica polling:

> **El productor del hecho es un tercero que no puede notificarnos.** La confirmación del pago la tiene
> el banco. Nadie de nuestro lado sabe cuándo el cliente escanea el QR, así que no hay nada que
> "empujar": hay que preguntar.

Las dos situaciones no se parecen y conviene no confundirlas:

| | Monitor web (SSE) | Pago QR (polling) |
|---|---|---|
| Quién produce el hecho | Nuestro backend | La banca, vía Ms Cobranzas |
| ¿Sabemos cuándo pasa? | **Sí** — lo escribimos nosotros | **No** |
| Quién consulta | Nadie | La app del chofer |
| Frecuencia | — | Cada pocos segundos, con QR en pantalla |

Y las dos se conectan: cuando el polling del chofer confirma el pago, **ahí sí** el backend ya sabe el
hecho y puede publicar `payment_status` al bus. El polling termina donde empieza el push.

> Cuidado con cuál de los dos eventos sale de acá. El polling del § 36 publica **`payment_status`**, no
> `payment_registered`: la fila del pago ya existía desde que se emitió el QR en el § 35. Lo que el
> polling aporta es la confirmación del banco sobre una fila que ya está en pantalla.

---

## S.4 · El contrato: snapshot + deltas

Este es el núcleo. Son **dos fases con responsabilidades distintas**, y confundirlas es el error que
esta sección existe para evitar.

```
FASE 1 — SNAPSHOT        Una vez, al abrir la pantalla
  GET /monitoring/orders?distributorId=1
  → el estado COMPLETO: las 40 órdenes con su progreso y su última posición

FASE 2 — DELTAS          Mientras la pantalla está abierta
  GET /monitoring/stream?distributorId=1
  → solo lo que cambió, evento por evento
```

**Nunca se reenvía el estado completo por el stream.** El snapshot ocurre una vez, y a partir de ahí
el cliente es el dueño del estado y solo recibe modificaciones.

### La cuenta que justifica el diseño

Una fila del listado (`MonitoringOrderDto` con `progress` y `tracking` anidados) pesa ~450 bytes.
Cuarenta filas son **~18 KB**. Un evento `tracking` pesa **~180 bytes**.

Si el stream reenviara la flota entera en cada ping, con 40 camiones reportando cada 10-15 s serían
~3,3 pings/s × 18 KB ≈ **60 KB/s** para comunicar que un camión se movió 30 metros. Con deltas es
~600 bytes/s. Dos órdenes de magnitud, y el ahorro real es mayor: el navegador no tiene que
re-parsear ni re-renderizar 40 filas para cambiar una.

### Qué pasa concretamente

Estado del cliente antes del evento:

```js
{
  "4471": { transportOrderId: 4471, routeId: 512, orderStatus: "DISPATCHED",
            truckPlate: "3456-ABC", progress: { delivered: 6, pending: 5, progressPct: 58 },
            tracking:  { routeId: 512, latitude: -17.783412, longitude: -63.181245,
                         battery: 74, trackedAt: "08:24:39" } },
  "4472": { ... },   // otras 39 órdenes
  "4473": { ... }
}
```

Llega un evento de 180 bytes:

```
event: tracking
data: {"routeId":512,"latitude":-17.784001,"longitude":-63.180900,"battery":73,"trackedAt":"2026-07-16T08:24:54.000Z","receivedAt":"2026-07-16T08:24:55.100Z"}
```

Estado después: **cambió `tracking` de la orden 4471 y nada más.** Las otras 39 filas quedan
**intactas y con la misma referencia en memoria**, así que React no las vuelve a renderizar.

---

## S.5 · Catálogo completo de eventos

### Canal de FLOTA

| Evento | Clave del payload | Cadencia | Payload | Qué repinta |
|---|---|---|---|---|
| `tracking` | `routeId` | **Agrupado ~30 s** | `trackingSnapshotDto`: `routeId`, `latitude`, `longitude`, `battery`, `trackedAt`, `receivedAt` | Columna "Última señal" y batería |
| `order_progress` | `transportOrderId` | **Al instante** | `progressDto`: `total`, `delivered`, `failed`, `returned`, `pending`, `progressPct`, `incidents`, `outOfWindow` | Barra de progreso y contadores |
| `transport_status` | `routeId` | **Al instante** | `routeId`, `transportStatus`, `completedDate` | Estado de la salida. **Puede tocar N filas** |

**Por qué `tracking` se agrupa y los estados no.** En la tabla del listado un ping solo cambia el texto
"Última señal", que pasa de *"hace 0 min"* a *"hace 0 min"*: la tabla parpadearía para no decir nada
nuevo. Los ~30 s son una **ventana de agrupación del servidor**, no un intervalo de polling del
cliente. Al vaciarse la ventana se emite **un evento por camión** que reportó, con su **última**
posición — no la ráfaga de pings intermedios, que quedaron en la TRAZA de DynamoDB.

Un cambio de **estado**, en cambio, es información nueva: que una entrega falle, el planificador lo
tiene que ver cuando pasa. **Los estados no se agrupan nunca.**

Y son N eventos en vez de uno con un arreglo, para que el cliente tenga **un solo camino de parcheo por
id** — el mismo para los tres tipos de evento.

### Canal de DETALLE

| Evento | Clave del payload | Cadencia | Payload | Qué repinta |
|---|---|---|---|---|
| `tracking` | `routeId` | **Ping por ping** (10-15 s) | `routeId`, `latitude`, `longitude`, `battery`, `trackedAt`, `receivedAt` | Pin del camión (interpolado), trazo recorrido, batería, "última señal" |
| `delivery_enroute` | `deliveryOrderId` | 1 vez por parada | `deliveryOrderId`, `status`, `etaTime` | Color del pin y etiqueta de la tarjeta |
| `delivery_arrived` | `deliveryOrderId` | 1 vez por parada | `deliveryOrderId`, `status`, `arrivedAt`, `arrivalLatitude`, `arrivalLongitude` | Pin a "En el punto" + hora de llegada |
| `delivery_closed` | `deliveryOrderId` | 1 vez por parada | `deliveryOrderId`, `status`, `deliveredAt`, `deliveryResultCode`, `receiverName`, `hasIncident`, `hasProof` | Color e insignia del pin, tarjeta, barra de progreso |
| `payment_registered` | `deliveryOrderSaleId` + `paymentId` | **1 a 3 veces por parada** | `deliveryOrderId`, `deliveryOrderSaleId`, `paymentId`, `collectionPaymentId`, `paymentMethod`, `amount`, `currency`, `status`, `reference`, `registeredAt`, `summary` | Pestaña Cobro: **AGREGA** una fila de pago y reajusta los cuatro montos |
| `payment_status` | `deliveryOrderSaleId` + `paymentId` | 1 vez por QR (2 si además vence) | `deliveryOrderId`, `deliveryOrderSaleId`, `paymentId`, `collectionPaymentId`, `status`, `transactionNumber`, `paidAt`, `summary` | Pestaña Cobro: **MODIFICA** una fila existente y reajusta los cuatro montos |

**El cobro son DOS eventos y TRES productores.** El detalle completo de los DTOs está en `Eventos.md`
§ 40.8 y § 40.9; acá va solo lo que el frontend necesita para suscribirse:

| Evento | § | Endpoint | Dónde se publica | `status` resultante |
|---|---|---|---|---|
| `payment_registered` | 35 · **Generar QR** | `POST /api/v1/collections/qr/generate` | Después de `createPaymentReference` (10.6) | `PENDING` |
| `payment_registered` | 37 · **Efectivo** | `POST /api/v1/collections/cash/register` | Después de `createPaymentReference` (12.6) | `COMPLETED` |
| `payment_status` | 36 · **Confirmar QR** | `GET /api/v1/collections/qr/status/{paymentId}` | Después de `updatePaymentReferenceStatus` (11.6), **solo si el estado cambió** | `COMPLETED` · `EXPIRED` · `CANCELLED` |

**Por qué no es un evento con el `status` adentro.** Porque uno **crea** una fila en la lista de pagos y
el otro **modifica** una que ya está. Con un solo nombre el frontend tiene que adivinar cuál de las dos
cosas hacer, y así es exactamente como se duplican filas.

**Los cobros son parciales y múltiples.** 200 en QR, 300 en efectivo y 500 a deber es un caso normal, no
un borde: por eso `payment_registered` puede llegar hasta tres veces para la misma parada, y por eso cada
evento trae el `summary` **ya sumado** — el frontend no recalcula montos, los reemplaza.

**Y a nivel pedido el identificador correcto es `deliveryOrderSaleId`, no `deliveryOrderId`.**
`deliveryOrderId` sigue viajando porque ubica la parada y permite recalcular el agregado del panel, pero
los pagos viven en `delivery_payment_references.delivery_order_sale_id`; sin ese dato, una tabla plana de
pedidos tendría que adivinar a cuál de los tres pedidos de la parada pertenece el cobro.

**El QR se completa fuera de orden.** El QR nace `PENDING` (el banco todavía no confirmó) y el efectivo
nace `COMPLETED` (el chofer tiene la plata en la mano). Un `payment_status` puede llegar **minutos
después** del cierre de la parada, con la fila ya cerrada en pantalla. El monitor tiene que aceptarlo:
no es un evento tardío, es un banco lento. Y `payment_status` **no reabre la parada** — solo toca la
pestaña Cobro.

> **Los dos siguen bloqueados por el mismo hueco de esquema.** `delivery_payment_references` no soporta
> el cobro en efectivo (`id_qr` es `NOT NULL`) y le faltan `payment_method`, `transaction_number` y
> `receipt_number`. Hasta que se resuelva, de los tres productores **solo el § 35 se puede implementar**.
> Ver S.9.

**Acá `tracking` NO se agrupa**, y es la diferencia deliberada con el canal de flota: en el mapa cada
posición mueve el pin. Agrupar a 30 s dejaría el camión a saltos.

### Tres consecuencias que hay que leer juntas

1. **El pulso de posición NO lleva estados.** Un ping trae coordenadas, batería y hora. Nada más. Si
   el chofer entregó algo, eso llega por su propio evento, en su propio momento.
2. **Los cambios de estado NO esperan al próximo pulso.** Se publican al instante: el planificador ve
   "entregado" cuando el chofer cierra, no hasta 15 segundos después.
3. **Nadie pregunta cada tanto.** No hay polling en ninguna de las dos vías. Entre parada y parada, lo
   único que viaja son los pings de posición.

---

## S.6 · El parcheo parcial

### Los dos índices

El cliente necesita **dos índices**, y es la misma asimetría de los scopes:

```
Map<routeId, ...>            → para tracking      (puede tocar N filas)
Map<deliveryOrderId, ...>    → para las entregas  (toca UNA parada)
```

En el canal de flota los índices son `Map<routeId>` y `Map<transportOrderId>`; en el detalle son
`Map<routeId>` y `Map<deliveryOrderId>`. La regla es la misma: **un índice por clave de payload que
llegue por el stream.**

**Con un solo índice, un ping mueve una fila y deja la otra congelada.** Con el 1:1 de v0.0.2 alcanzaba
uno porque orden y salida eran el mismo hecho; con el muchos-a-uno vuelven a ser dos.

### El merge tiene que ser inmutable y por entidad

```js
// CORRECTO — se reemplaza UNA entrada, las demás conservan su referencia
setOrders(prev => ({
  ...prev,
  [id]: { ...prev[id], tracking: evento }
}));
```

```js
// INCORRECTO — reconstruye la colección y re-renderiza las 40 filas
setOrders(fetchOrdersAgain());
```

El segundo es el error que anula todo el diseño: si en cada evento se vuelve a pedir el estado
completo, el stream quedó decorativo y volvimos a polling — pero con una conexión SSE abierta al lado,
gastando recursos para nada.

### `tracking` puede tocar N filas y los demás una

En el listado, dos órdenes del mismo camión comparten `routeId`. Un evento `tracking` **parchea las
dos**, y eso es correcto: es un camión. Por eso el índice es por `routeId` y el parcheo es un
`filter`/`forEach` sobre las filas de esa ruta, no un acceso directo por id de fila.

`order_progress` y los eventos de entrega, en cambio, tocan **exactamente una** entidad.

---

## S.7 · Ciclo de vida de la conexión

### Heartbeat

Cada ~15 s el servidor manda `: heartbeat` — un comentario del protocolo. No es un evento y el cliente
lo descarta.

Existe porque una salida puede pasar minutos sin novedades y **los intermediarios cierran conexiones
sin tráfico**. Sin heartbeat, el cliente reconectaría en loop justo cuando no pasa nada.

### Reconexión: se re-pide el snapshot

`EventSource` reconecta solo, pero **durante el corte se pierden eventos**. La regla es re-pedir el
snapshot completo (la Fase 1 otra vez), **no** reproducir con `Last-Event-ID`:

1. Un monitor necesita el estado de **AHORA**, no el historial de lo que pasó mientras nadie miraba.
2. Reproducir cuatro minutos de `tracking` **animaría el pasado** y después saltaría al presente.
3. Re-pedir es lo único que recupera la evidencia de las paradas que cerraron durante el corte.

Es más simple y siempre correcto. El costo es bajo: tres consultas a Postgres y **una** Query a
DynamoDB.

### Indicador de frescura

El cliente muestra **"En vivo" / "Actualizado hace X min"**, y eso es de la **CONEXIÓN**, no de un
camión. Sin ese indicador, una pantalla muerta se ve idéntica a una flota detenida — el peor modo de
falla de un monitor: mentir en silencio.

### Cierre

Al salir de la pantalla, `es.close()`. Sin eso queda una conexión colgada por navegación, y el bus
sigue publicando a un suscriptor que nadie mira.

> Del lado del servidor, si no hay conexiones abiertas para ese scope **no se publica nada**. La
> escritura en DynamoDB ocurre igual: el ping se guarda aunque nadie esté mirando.

---

## S.8 · Lo que NO viaja por el stream, a propósito

| Qué | Por qué no |
|---|---|
| `order_progress` en el canal de detalle | Ahí están las entregas una por una y el cliente lo calcula. Ese evento es del listado, que muestra el contador y no las paradas |
| El chequeo ítem por ítem del chofer | Son decenas de toques por parada y el monitor no muestra el checklist. Se entera del resultado al cerrar |
| Notificaciones al cliente final (`DRIVER_ON_THE_WAY`, `DRIVER_ARRIVED`) | Son del cliente, no del planificador |
| La subida de la foto a S3 | Es de la app del chofer. El monitor recibe la URL ya resuelta |
| La evidencia del cierre (POD, incidencia, cantidades) | Ver S.0: hoy solo viajan `hasProof` / `hasIncident`. **Decisión abierta** |

---

## S.9 · Residuos y decisiones abiertas

1. **`DocumentacionTecnica.md:693` tiene un residuo de v0.0.2.** El ejemplo de cable del evento
   `tracking` usa `"transportOrderId":4471`, pero el `trackingSnapshotDto` (`:554`) define `routeId`
   como su clave, y `:714` explica que los hechos del camión viajan por ruta. **Corregir el ejemplo a
   `"routeId":512`.**
2. **Los dos eventos de cobro YA están respaldados — con cuatro desajustes de esquema.** El bloqueo que las
   versiones anteriores daban por abierto (*"no hay tabla de cobros ni columna de monto"*) **está
   resuelto**: existe `delivery_payment_references` y `delivery_order_items.unit_price_snapshot`. Pero
   la tabla **no cubre todo lo que los endpoints § 35-37 dicen guardar**:

   ```sql
   CREATE TABLE delivery_payment_references (
       id, delivery_order_id, collection_payment_id NOT NULL,
       id_qr VARCHAR(100) NOT NULL, amount, currency DEFAULT 'BOB',
       status DEFAULT 'PENDING',              -- PENDING, COMPLETED, EXPIRED, CANCELLED
       created_at, updated_at
   )
   ```

   | # | Desajuste | Consecuencia |
   |---|---|---|
   | a | **`id_qr` es `NOT NULL`** y § 37 (efectivo) llama `createPaymentReference` **sin** `idQr` | El cobro en efectivo **no se puede insertar**. Es un bloqueo real, no cosmético |
   | b | **No hay columna `payment_method`**, y § 37 manda `paymentMethod: "CASH"` | No se puede distinguir efectivo de QR en la fila. El evento no puede decir con qué se pagó |
   | c | **No hay `transaction_number`**, y § 36 recibe `transactionNumber` *"para asociar el código de transacción bancaria"* | El comprobante bancario no tiene dónde guardarse |
   | d | **No hay `receipt_number`**, y § 37 devuelve `receiptNumber` de Ms Cobranzas | Ídem con el recibo de caja |

   **Nota de esquema, aparte de los desajustes:** es la única tabla sin `created_by` / `updated_by` /
   `deleted_at`, la única con `TIMESTAMP WITH TIME ZONE` (el resto usa `TIMESTAMP` pelado) y la única
   con `ON DELETE CASCADE`. Para una tabla de dinero, el cascade merece una decisión explícita: borrar
   una entrega borra su rastro de cobro.

   Además `delivery_orders` lleva el comentario `--// booleanao si se realizo un cobro`, así que la
   bandera de "¿esta parada cobró?" todavía es una decisión abierta.
3. **La evidencia del cierre.** Engordar `delivery_closed` —un evento que se emite igual cuando nadie
   mira— o exponer un `GET /monitoring/deliveries/{deliveryOrderId}` bajo demanda.
4. **`routes.distributor_id` no existe** y sin ella no se compone `FLEET#{distributorId}`, que es el
   scope del canal de flota. Bloquea el stream del listado, no solo la escritura del ping.
5. **La ventana de agrupación de ~30 s no está especificada** más allá del número: si se implementa por
   `setInterval` global o por temporizador de scope cambia el comportamiento con flotas chicas.
