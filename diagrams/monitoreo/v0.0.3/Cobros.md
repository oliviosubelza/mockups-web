# Monitoreo — Cobros: cómo se obtiene la data

Cómo el **monitor web** consigue la información de cobros de una entrega para mostrarla en la pestaña
*Cobro* del panel del mapa. Método por método, con lo que consulta cada uno y el JSON que devuelve.

Complementa a `DetalleMapa.md` (los flujos del mapa) y a `DocumentacionTecnica.md` § 25 (el snapshot del
detalle). Acá solo el dinero.

**Lo que este documento NO cubre:** cómo la app del chofer registra el cobro (es § 35 del doc oficial y
los flujos de última milla), ni la pasarela bancaria. El monitor **solo lee**.

---

## 1. La pregunta primero: ¿se jala o llega?

**Las dos cosas, y en momentos distintos.** No hay un endpoint de cobros que el frontend consulte cada
tanto:

| Momento | Cómo llega | Quién lo pide |
|---|---|---|
| **Al abrir la pantalla** | Dentro del **snapshot del detalle**, anidado en `paradas[].cobro` | El frontend, UNA vez (`GET /monitoring/orders/{transportOrderId}`) |
| **Mientras la pantalla está abierta** | Por **SSE**, dos eventos con scope `ORDER#{transportOrderId}` | Nadie: el servidor los empuja |

**El frontend NO hace polling y NO habla con el banco.** Esto es lo que más se confunde, porque el QR
sí se consulta periódicamente — pero eso pasa **entre el backend y Ms Cobranzas**, no entre la pantalla
y el backend:

```
   App del chofer          Backend                Ms Cobranzas / Banco        Monitor web
   ──────────────          ───────                ────────────────────        ───────────
   genera QR      ──▶  POST .../qr/generate  ──▶  emite el QR
                       INSERT ...references
                       (status = PENDING)
                                             ◀──  el cliente paga
                       consulta o webhook    ◀──  COMPLETED
                       UPDATE status
                       publish al bus SSE ─────────────────────────────────▶  event: payment_status
```

Si el monitor consultara el estado del QR por su cuenta, cada pantalla abierta sumaría una consulta al
banco por segundo. El backend lo resuelve **una vez** y se lo cuenta a todas.

---

## 2. Participantes (lifelines)

| Lifeline | Qué es | Aparece en |
|---|---|---|
| **Frontend (monitor)** | La pestaña *Cobro* del panel | A, B |
| **Gateway Controller** | Puerta HTTP | A, B |
| **Monitoring Service** | Arma el snapshot | A |
| **Delivery Payment Reference DB** | `delivery_payment_references` — **la única tabla de cobros que existe** | A.1, B |
| **Delivery Order Item DB** | `delivery_order_items` — de acá sale el MONTO | A.2 |
| **Candidate Order DB** | `candidate_orders` — qué parte va a crédito | A.3 |
| **SSE Bus** | Bus de eventos en memoria | B |
| **App del chofer** | Registra los cobros | B |
| **Collections Controller** | `POST /api/v1/collections/qr/generate` (§ 35) | B.2 |
| **Ms Cobranzas** | Microservicio externo, habla con el banco | B.2, B.3 |

---

# PARTE A — Al abrir la pantalla

El cobro **no tiene endpoint propio**: viaja dentro del snapshot del detalle (§ 25). Estos tres pasos
son parte de ese mismo `GET`, y se documentan acá porque son los que producen el dinero.

| Paso | Método | Lifeline | En § 25 |
|---|---|---|---|
| A.1 | `findPaymentsByDeliveryIds(deliveryOrderIds)` | Delivery Payment Reference DB | *(nuevo)* |
| A.2 | `findItemsByDeliveryIds(deliveryOrderIds)` | Delivery Order Item DB | 25.9a |
| A.3 | `findCandidateOrders(dispatchDeliveryPointIds)` | Candidate Order DB | 25.7a |
| A.4 | `buildCobro(items, pedidos, pagos)` | Monitoring Service | 25.11 |

---

## A.1 · findPaymentsByDeliveryIds(deliveryOrderIds)

**Lifeline:** Delivery Payment Reference DB

**Qué hace:** trae los cobros registrados. Una llamada con el arreglo de `deliveryOrderId` de todas las
paradas, no una por parada.

**Hoy devuelve SOLO los QR.** `delivery_payment_references` es la única tabla de cobros del esquema, y
está pensada para la pasarela: guarda el id del banco y el estado. Efectivo, transferencia y cheque se
registran en la app y **no tienen dónde guardarse** — ver *Huecos* (1).

**Consulta:**

```sql
SELECT id, delivery_order_id, collection_payment_id, id_qr,
       amount, currency, status, created_at, updated_at
FROM   delivery_payment_references
WHERE  delivery_order_id = ANY($1)
ORDER  BY created_at;
```

**Diccionario de datos:**

| Campo | Tipo | Columna | Para qué sirve en la pantalla |
|---|---|---|---|
| `paymentReferenceId` | number | `id` | Identidad del cobro |
| `deliveryOrderId` | number | `delivery_order_id` | **La clave del parcheo** y del agrupamiento por parada |
| `collectionPaymentId` | number | `collection_payment_id` | El id en **Ms Cobranzas**. Es con lo que se rastrea el cobro fuera de nuestro sistema |
| `idQr` | string | `id_qr` | La referencia del QR en el banco. Es lo que el panel muestra como "referencia" |
| `amount` | number | `amount` | El monto de ESE cobro, no el total de la entrega |
| `currency` | string | `currency` | `BOB` por defecto |
| `status` | string | `status` | `PENDING` · `COMPLETED` · `EXPIRED` · `CANCELLED` |
| `createdAt` | string | `created_at` | Cuándo se emitió el QR |
| `updatedAt` | string | `updated_at` | Cuándo cambió de estado. **Es lo más parecido a "cuándo se pagó" que hay** — ver *Huecos* (3) |

**JSON recuperado:**

```json
[
  {
    "paymentReferenceId": 701,
    "deliveryOrderId": 1001,
    "collectionPaymentId": 1052,
    "idQr": "25051501009100893840",
    "amount": 200.00,
    "currency": "BOB",
    "status": "COMPLETED",
    "createdAt": "2026-07-31T09:52:00.000Z",
    "updatedAt": "2026-07-31T09:57:12.000Z"
  },
  {
    "paymentReferenceId": 702,
    "deliveryOrderId": 1002,
    "collectionPaymentId": 1053,
    "idQr": "25051501009100893999",
    "amount": 150.00,
    "currency": "BOB",
    "status": "PENDING",
    "createdAt": "2026-07-31T10:14:00.000Z",
    "updatedAt": "2026-07-31T10:14:00.000Z"
  },
  { "...": "..." }
]
```

---

## A.2 · findItemsByDeliveryIds(deliveryOrderIds) — de acá sale el MONTO

**Lifeline:** Delivery Order Item DB · **es el paso 25.9a**, no una consulta nueva

**Qué hace:** el monitor no pregunta "cuánto hay que cobrar" a ninguna tabla de cobros: lo **calcula**
desde los ítems, porque `delivery_order_items` guarda el precio congelado al despachar.

```sql
SELECT delivery_order_id, sales_order_id, product_id,
       planned_qty, delivered_qty, returned_qty,
       unit_price_snapshot, rejection_reason_code
FROM   delivery_order_items
WHERE  delivery_order_id = ANY($1);
```

| Campo | Para qué sirve en el cobro |
|---|---|
| `plannedQty × unitPriceSnapshot` | **Facturado**: lo que decía la nota de entrega |
| `deliveredQty × unitPriceSnapshot` | **A cobrar**: lo que el cliente realmente recibió |
| `returnedQty` + `rejectionReasonCode` | Explica la diferencia entre los dos |
| `salesOrderId` | Permite atribuir el ítem a su pedido, y con eso saber si va a crédito |

**`unit_price_snapshot` es un SNAPSHOT y no un join al maestro de precios**: si mañana sube la lista, la
entrega de ayer se sigue cobrando a lo de ayer. Sin esta columna, el monto habría que traerlo de SAP en
cada apertura de pantalla.

```json
[
  {
    "deliveryOrderId": 1001,
    "salesOrderId": 88213,
    "productId": 78,
    "plannedQty": 24,
    "deliveredQty": 21,
    "returnedQty": 3,
    "unitPriceSnapshot": 280.00,
    "rejectionReasonCode": "DANIADO"
  },
  { "...": "..." }
]
```

Ese ejemplo vale por todo el documento: se facturaron **6 720** y se cobran **5 880**, porque el cliente
rechazó tres cajas dañadas.

---

## A.3 · findCandidateOrders(dispatchDeliveryPointIds) — qué parte va a crédito

**Lifeline:** Candidate Order DB · **es el paso 25.7a**

La forma de pago del pedido decide qué se cobra en el punto: contado y transferencia sí, **crédito no**.
El crédito viaja en el camión pero se cobra en oficina.

**Ojo:** `candidate_orders` **no tiene columna de forma de pago**. Hoy ese dato viene del pedido de SAP
por el snapshot de ventas — ver *Huecos* (5).

---

## A.4 · buildCobro(items, pedidos, pagos)

**Lifeline:** Monitoring Service (auto-llamada, dentro de 25.11)

**Qué hace:** cruza las tres fuentes y produce el objeto que la pantalla consume. **Ninguno de los
cuatro montos se guarda**: los cuatro se derivan, y por eso no pueden desincronizarse con los pagos.

| Monto | Fórmula |
|---|---|
| `facturado` | `Σ plannedQty × unitPriceSnapshot` |
| `aCobrar` | `Σ deliveredQty × unitPriceSnapshot`, por la proporción que **no** va a crédito |
| `cobrado` | `Σ amount` de los pagos con estado `COMPLETED` |
| `enProceso` | `Σ amount` de los pagos con estado `PENDING` |
| `saldo` | `aCobrar − cobrado − enProceso` |

Y el estado del cobro sale de esos números, no de una columna:

| Estado | Cuándo |
|---|---|
| `no_corresponde` | Todos los pedidos de la parada van a crédito: no hay nada que cobrar en el punto |
| `pendiente` | Hay algo que cobrar y no se registró ningún pago |
| `parcial` | Se cobró algo y quedó saldo |
| `en_proceso` | No queda saldo, pero hay un QR que el banco no confirmó |
| `cobrado` | Sin saldo y sin nada en proceso |

**`no_corresponde` y `pendiente` no son lo mismo**, y confundirlos es el error que borra la deuda de la
pantalla: el primero dice "acá no se cobra", el segundo dice "acá se cobra y todavía no se cobró".

**JSON que viaja en el snapshot (`paradas[].cobro`):**

```json
{
  "facturado": 6720.00,
  "aCobrar": 5880.00,
  "cobrado": 300.00,
  "enProceso": 200.00,
  "saldo": 5380.00,
  "estado": "parcial",
  "moneda": "BOB",
  "pagos": [
    {
      "id": "pay-1001-1",
      "metodo": "efectivo",
      "monto": 300.00,
      "referencia": "REC-452883",
      "banco": null,
      "estado": "confirmado",
      "hora": "2026-07-31T09:50:00.000Z",
      "collectionPaymentId": null
    },
    {
      "id": "pay-1001-2",
      "metodo": "qr",
      "monto": 200.00,
      "referencia": "25051501009100893840",
      "banco": "BNB",
      "estado": "pendiente",
      "hora": "2026-07-31T09:52:00.000Z",
      "collectionPaymentId": 1052
    }
  ]
}
```

**Los `pagos` son una LISTA a propósito.** Un cliente paga 200 en QR, 300 en efectivo y deja 500 a
deber: eso son dos filas y un saldo, no un booleano. Con un solo campo "cobrado" no hay forma de
contestar *"¿con qué pagó?"*, que es la primera pregunta cuando la caja del chofer no cuadra.

---

# PARTE B — Mientras la pantalla está abierta

Tres cosas pueden pasar, y las tres llegan por la **misma conexión SSE** del detalle, con scope
`ORDER#{transportOrderId}`. El cobro es de un DOCUMENTO, no del camión: por eso no usa el scope de ruta.

| # | Qué pasa | Evento | Lo dispara |
|---|---|---|---|
| B.1 | El chofer cobra en efectivo, transferencia o cheque | `payment_registered` | La app del chofer |
| B.2 | El chofer genera un QR | `payment_registered` (estado `pendiente`) | La app + Ms Cobranzas |
| B.3 | El banco confirma o el QR vence | `payment_status` | Ms Cobranzas |

---

## B.1 · Cobro en efectivo, transferencia o cheque

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.1.1 | `POST /last-mile/deliveries/{id}/payment` | Gateway → Delivery Controller | **Endpoint sin documentar todavía** |
| B.1.2 | `INSERT ...` | *(tabla que no existe)* | **Hueco (1)** |
| B.1.3 | `publish(payment_registered, transportOrderId)` | SSE Bus | Scope de ORDEN |
| B.1.4 | `event: payment_registered` | Frontend | Llega al monitor |
| B.1.5 | `patchByDeliveryOrderId(evento)` | Frontend | Parchea UNA parada |

**Payload del evento:**

```json
{
  "deliveryOrderId": 1001,
  "pago": {
    "id": "pay-1001-1",
    "metodo": "efectivo",
    "monto": 300.00,
    "moneda": "BOB",
    "referencia": "REC-452883",
    "banco": null,
    "estado": "confirmado",
    "collectionPaymentId": null,
    "hora": "2026-07-31T09:50:00.000Z"
  },
  "resumen": { "aCobrar": 5880.00, "cobrado": 300.00, "enProceso": 0, "saldo": 5580.00 }
}
```

**El `resumen` viaja en el evento y no se recalcula en el cliente**, por la misma razón que
`order_progress` manda el contador ya sumado: el servidor tiene los datos, el cliente tendría que
rehacer la cuenta con lo que le llegó, y dos implementaciones de la misma suma terminan discrepando.

Los tres métodos nacen **confirmados**: el chofer tiene la plata en la mano. Solo el QR espera.

---

## B.2 · Generación del QR (§ 35 del doc oficial)

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.2.1 | `POST /api/v1/collections/qr/generate` | Gateway → Collections Controller | Recibe `deliveryOrderId`, `amount` y el `transcationUuid` de idempotencia |
| B.2.2 | `requestQrGenerationFromMsCobranzas(payload)` | **Ms Cobranzas** | Pide el QR a la pasarela |
| B.2.3 | `createPaymentReference(...)` | Delivery Payment Reference DB | `INSERT` con `status = 'PENDING'` |
| B.2.4 | `publish(payment_registered, transportOrderId)` | SSE Bus | Scope de ORDEN |

**Entrada (B.2.1):**

```json
{
  "deliveryOrderId": 1001,
  "transcationUuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "customerId": 90,
  "employeeId": 12,
  "debtDocumentId": 301,
  "amount": 200.00,
  "currency": "BOB",
  "glosa": "Pago Factura #301 - Entrega #1001",
  "expirationMinutes": 30
}
```

**Lo que devuelve Ms Cobranzas (B.2.2):**

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

**Lo que se guarda (B.2.3):**

```json
{
  "deliveryOrderId": 1001,
  "collectionPaymentId": 1052,
  "idQr": "25051501009100893840",
  "amount": 200.00,
  "currency": "BOB",
  "status": "PENDING"
}
```

**Tres cosas que el monitor NO recibe, y no son un olvido:**

| Dato | Por qué no |
|---|---|
| `qrBase64` | Es la imagen que el chofer le muestra al cliente. En el monitor no se escanea nada, y son ~30 KB por cobro |
| `transcationUuid` | Es la clave de idempotencia entre el backend y Ms Cobranzas. Al monitor no le sirve |
| `glosa` | Texto para el cliente del banco, no para el planificador |

**`expiresAt` sí debería llegar** y hoy no se guarda: es lo que permitiría mostrar "el QR vence en 12
min" en vez de un `PENDING` que no se sabe si sigue vivo — ver *Huecos* (4).

---

## B.3 · El banco confirma (o el QR vence)

**Acá está la parte que hay que decidir**, y el documento oficial no la cierra: § 35 genera el QR y
menciona un "Diagrama 11" para consultar el estado. Las dos formas de enterarse:

| Opción | Cómo | Costo |
|---|---|---|
| **(a) Webhook** — Ms Cobranzas nos avisa | Un `POST` nuestro que ellos llaman al confirmarse el pago | Hay que exponer un endpoint y asegurarlo. **Es la correcta**: el aviso llega cuando pasa |
| **(b) Polling** — nosotros preguntamos | Un job que consulta los `PENDING` cada N segundos | Simple, pero el monitor muestra el cobro con retraso, y consulta de más para nada |

En cualquiera de las dos, lo que sigue es igual:

| Paso | Método | Lifeline | Qué hace |
|---|---|---|---|
| B.3.1 | `confirmPayment(collectionPaymentId, estado)` | Collections Service | Recibe la novedad |
| B.3.2 | `UPDATE delivery_payment_references SET status` | Delivery Payment Reference DB | `PENDING` → `COMPLETED` / `EXPIRED` |
| B.3.3 | `publish(payment_status, transportOrderId)` | SSE Bus | Scope de ORDEN |
| B.3.4 | `event: payment_status` | Frontend | El QR pasa de azul a confirmado |

**Payload del evento:**

```json
{
  "deliveryOrderId": 1001,
  "pagoId": "pay-1001-2",
  "collectionPaymentId": 1052,
  "estado": "confirmado",
  "confirmadoAt": "2026-07-31T09:57:12.000Z",
  "resumen": { "aCobrar": 5880.00, "cobrado": 500.00, "enProceso": 0, "saldo": 5380.00 }
}
```

**Y el caso que casi siempre se olvida — el QR vence:**

```json
{
  "deliveryOrderId": 1001,
  "pagoId": "pay-1001-2",
  "collectionPaymentId": 1052,
  "estado": "expirado",
  "confirmadoAt": null,
  "resumen": { "aCobrar": 5880.00, "cobrado": 300.00, "enProceso": 0, "saldo": 5580.00 }
}
```

Un QR vencido **devuelve la plata al saldo**: los 200 que estaban "en proceso" vuelven a estar
debiéndose. Si el monitor no maneja `EXPIRED`, ese cobro se queda en azul para siempre y la pantalla
muestra una plata que nadie pagó.

---

## B.4 · Qué parchea el cliente

Los dos eventos se parchean **por `deliveryOrderId`**, igual que `delivery_closed`. Tocan:

| Zona | Qué cambia |
|---|---|
| Pestaña *Cobro* de esa parada | Los cuatro montos, el badge de estado y la lista de pagos |
| Nada más | El mapa, el panel izquierdo y el progreso **no se tocan**: un cobro no mueve el camión ni cierra una entrega |

Si esa parada no está abierta, el evento igual se aplica al estado local: cuando el usuario la abra
después, el cobro ya está ahí sin pedir nada.

---

## B.5 · Lo que el frontend NO hace

Vale escribirlo porque es la mitad del diseño:

| No hace | Por qué |
|---|---|
| **No consulta a Ms Cobranzas** | La pantalla no habla con la pasarela. Si lo hiciera, cada monitor abierto sumaría consultas al banco |
| **No hace polling del estado** | Para eso está el SSE. Preguntar cada 5 s por 20 paradas son 240 consultas por minuto para enterarse de algo que pasa una vez |
| **No recalcula los montos** | Llegan en `resumen`. Dos implementaciones de la misma suma terminan discrepando |
| **No muestra el `qrBase64`** | El QR se escanea en el celular del chofer, no en el monitor |
| **No registra cobros** | El monitor es de solo lectura. Cobrar es de la app |

---

# Huecos abiertos (solo los del cobro)

1. **Efectivo, transferencia y cheque no tienen tabla.** `delivery_payment_references` está pensada para
   la pasarela: tiene `collection_payment_id` e `id_qr`, que los otros tres métodos no usan. Y son
   justamente los que MÁS falta hace registrar — el QR ya deja rastro en el banco; el efectivo no deja
   ninguno. **Sin esto, el 70% de los cobros del reparto no se puede mostrar en el monitor.**
   Haría falta una tabla por cobro con `method`, `amount`, `reference`, `bank`, `collected_by` y
   `collected_at`, con la referencia al QR como un caso más.

2. **La bandera de `delivery_orders` está sin resolver.** El esquema tiene el comentario
   `--// booleano si se realizo un cobro`. **Un booleano no alcanza para cobros parciales**: hay que
   decidir entre guardar un estado (`SIN_COBRAR` / `PARCIAL` / `COBRADO`) o derivarlo de la suma de los
   pagos. Derivarlo es más sano —no se desincroniza— pero obliga a leer los pagos para contestar
   "¿esta entrega está cobrada?".

3. **No se guarda QUIÉN cobró ni CUÁNDO se pagó.** `delivery_payment_references` no tiene `employee_id`
   ni un `paid_at`: lo más cercano es `updated_at`, que cambia por cualquier motivo. El `employeeId` se
   MANDA en la generación del QR (§ 35) y se pierde. Sin esos dos campos no hay forma de cerrar la caja
   de un chofer al volver al almacén.

4. **La expiración no se persiste.** Ms Cobranzas devuelve `expiresAt` y no se guarda. Sin eso, un
   `PENDING` puede ser "el cliente está por pagar" o "esto venció hace dos horas", y en la pantalla se
   ven igual.

5. **La forma de pago no está en `candidate_orders`.** Es lo que decide qué se cobra en el punto y qué
   va a crédito, y hoy viene del pedido de SAP. Mientras siga afuera, el `aCobrar` del monitor depende
   de un servicio externo.

6. **No hay conciliación.** Con los cobros por entrega no se puede contestar la pregunta del final del
   día: *"este chofer volvió con Bs 4.200, ¿cuadra?"*. Eso pide un total por ruta y un cierre de caja,
   que hoy no existen en ninguna tabla.
