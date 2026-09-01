# Documentación técnica — Productos con stock confirmado (26 y 27)

Acompaña a `Productos.drawio`. Cada función lleva **su número de paso del diagrama**; si se agrega un
paso hay que tocar las dos cosas.

Los retornos **no se numeran** en el diagrama, así que acá se los referencia por el paso que los
produce (ej: "salida de 26.4").

Referencias de esquema: `:NNN` es línea de `diagrams/UltimaVersion.sql`; `DB.puml:NN` es línea del
ERD oficial.

---

## Servicios externos que estos dos flujos consumen

### MS Ventas / SAP — `sales_order_item`

**Es el único origen del dato de stock.** No hay tabla local que lo replique, no se hace `JOIN`
contra él: se consume por HTTP. En el ERD está en el paquete `(Snapshots, Cache, Datos externos)`
marcado `<<MS Ventas - SAP>>` (`DB.puml:24-31`) y **no aparece en `UltimaVersion.sql`**.

Los dos endpoints que hay que pedirle a Ventas (hoy **ninguno de los dos existe**):

| Método | Ruta | Usado en |
|---|---|---|
| `POST` | `/sales/orders/items:batch` | 26.5 — el listado |
| `GET` | `/sales/orders/{salesOrderId}/items` | 27.5 — el detalle |

**Contrato de la línea** (idéntico en los dos endpoints):

| Atributo | Tipo TypeScript | Oblig. | Descripción / Origen |
|---|---|---|---|
| `productId` | number | Sí | `sales_order_item.product_id` (`DB.puml:28`) |
| `requestedQty` | number | Sí | `sales_order_item.requested_qty` (`DB.puml:29`). Lo que el cliente pidió |
| `confirmedQty` | number | Sí | `sales_order_item.confirmed_qty` (`DB.puml:30`). **Lo que Ventas confirmó con stock** |
| `description` | string | — | **No existe hoy.** Ver §27.D: o lo agrega Ventas acá, o se amplía `product_snapshot` |
| `unit` | string | — | Ídem |

### Servicios que estos flujos NO consumen

- **`01 DeliveryPoint`** — el punto de entrega ya lo resolvió el listado de pedidos; acá no se toca.
- **Cualquier cosa de última milla** — `delivery_orders`, `truck_inventories`,
  `transport_order_sales_items`: todas existen recién después de planificar. Ver `Productos.md` §2.4.

---

# 26 Obtener pedidos candidatos con estado de stock

## Endpoint

```
GET /planning/candidate-orders?distributorId=1&deliveryDate=2026-08-05&channels=horizontal,tradicional
```

Es el listado del Paso 1. **El estado de stock viaja en la misma respuesta**, no en una segunda
llamada: el color de la fila tiene que estar en el primer render o el planificador ya empezó a
destildar pedidos sin saber cuáles están cortos.

## Request Principal (`FilterCandidateOrdersDto`)

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `distributorId` | number | `@IsInt()` | Sí | Scope **obligatorio**. `candidate_orders.distributor_id` (`:182`), FK a `distributors` (`:202`) |
| `deliveryDate` | string | `@IsDateString()` | Sí | Fecha de la planificación (`YYYY-MM-DD`) |
| `channels` | string[] | `@IsArray()` `@IsOptional()` | No | Narrowing por canal. Vacío = todos |
| `includeOutOfCutoff` | boolean | `@IsBoolean()` `@IsOptional()` | No | Default `false`. Los de fuera del corte tienen su propia pestaña |

```json
{
  "distributorId": 1,
  "deliveryDate": "2026-08-05",
  "channels": ["horizontal", "tradicional"],
  "includeOutOfCutoff": false
}
```

## A. `getCandidateOrdersWithStock(dto)` 26.2 y 26.3

Orquesta el flujo completo: consulta local (26.4), enriquecimiento contra Ventas (26.5) y resumen
(26.6). No hace acceso a datos por sí misma.

- **Entrada:** `FilterCandidateOrdersDto`.
- **Salida:** `CandidateOrderWithStockDto[]` (26.7).

## B. `findCandidateOrders(dto)` 26.4

La consulta a **`candidate_orders`** (`:176-203`), que es la única tabla nuestra que toca este flujo.

```sql
SELECT id, sales_order_id, document_id, distributor_id,
       total_weight_kg, total_volume_m3, type_movement, is_included
  FROM candidate_orders
 WHERE distributor_id = $1
   AND deleted_at IS NULL;
```

**Acá está el punto de todo el flujo:** esta tabla **no tiene ni una línea de producto**. No hay
`product_id`, no hay cantidades. Guarda dos agregados y el puntero a Ventas. Por eso el paso 26.5 no
es una optimización, es obligatorio.

- **Entrada:** `distributorId` (number), `deliveryDate` (string).
- **Salida:** `listCandidateOrder` (salida de 26.4).

**Tabla de atributos de `listCandidateOrder`**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `candidateOrderId` | number | `@IsInt()` | Sí | `candidate_orders.id` (`:177`) |
| `salesOrderId` | number | `@IsInt()` | Sí | `candidate_orders.sales_order_id` (`:179`). **La clave del paso 26.5**: es el id con el que Ventas conoce el pedido |
| `documentId` | number | `@IsInt()` | Sí | `candidate_orders.document_id` (`:180`). Documento SAP |
| `distributorId` | number | `@IsInt()` | Sí | `candidate_orders.distributor_id` (`:182`) |
| `totalWeightKg` | number | `@IsNumber()` | Sí | `candidate_orders.total_weight_kg` (`:185`). **Agregado**: no se deriva de las líneas |
| `totalVolumeM3` | number | `@IsNumber()` | Sí | `candidate_orders.total_volume_m3` (`:186`). Ídem |
| `typeMovement` | string | `@IsString()` | Sí | `candidate_orders.type_movement` (`:188`) |
| `isIncluded` | boolean | `@IsBoolean()` | Sí | `candidate_orders.is_included` (`:190`) |

**Ejemplo JSON (filas de Postgres, salida de 26.4)**

```json
[
  {
    "candidateOrderId": 9041,
    "salesOrderId": 88214,
    "documentId": 4471002,
    "distributorId": 1,
    "totalWeightKg": 486.00,
    "totalVolumeM3": 1.70,
    "typeMovement": "VENTA",
    "isIncluded": true
  },
  {
    "candidateOrderId": 9042,
    "salesOrderId": 88215,
    "documentId": 4471003,
    "distributorId": 1,
    "totalWeightKg": 1240.00,
    "totalVolumeM3": 4.30,
    "typeMovement": "VENTA",
    "isIncluded": true
  },
  { "...": "..." }
]
```

Fijate que **no hay ningún campo de stock ni de producto**. Todo lo que sigue existe para completar
esa ausencia.

## C. `getSalesOrderItemsBatch(salesOrderIds)` 26.5

La llamada a **MS Ventas**. Se hace **una sola vez con el arreglo completo** de `salesOrderId`, no
una por pedido: con 216 pedidos en el listado, una llamada por pedido son 216 round-trips a SAP antes
de poder pintar la primera fila. El arreglo se **deduplica** antes de enviar.

```
POST /sales/orders/items:batch
{ "salesOrderIds": [88214, 88215, 88216] }
```

- **Entrada:** `salesOrderIds` (number[]).
- **Salida:** `Map<salesOrderId, SalesOrderItem[]>` (salida de 26.5).

**Ejemplo JSON (respuesta de Ventas, salida de 26.5)**

```json
{
  "88214": [
    { "productId": 70211, "requestedQty": 44, "confirmedQty": 44 },
    { "productId": 70455, "requestedQty": 14, "confirmedQty": 2 },
    { "productId": 70880, "requestedQty": 30, "confirmedQty": 30 }
  ],
  "88215": [
    { "productId": 70211, "requestedQty": 12, "confirmedQty": 12 },
    { "productId": 70102, "requestedQty": 60, "confirmedQty": 0 }
  ],
  "88216": [
    { "productId": 70455, "requestedQty": 8, "confirmedQty": 8 }
  ]
}
```

Leelo así: el pedido `88214` tiene **una** línea corta (14 pedidas, 2 confirmadas) y el `88215` tiene
una **sin stock** (60 pedidas, 0 confirmadas). El `88216` está entero.

## D. `summarizeStock(orders, itemsBySalesOrder)` 26.6

Cálculo en memoria, sin acceso a datos. Colapsa las líneas de cada pedido a **dos números y un
estado**: el listado no necesita el detalle, necesita saber si pintar la fila.

```
pendingLines   = COUNT(items WHERE confirmedQty < requestedQty)
noStockLines   = COUNT(items WHERE confirmedQty = 0)
stockStatus    = pendingLines = 0        → 'CONFIRMED'
                 pendingLines > 0        → 'PENDING'
                 (sin datos de Ventas)   → 'UNKNOWN'   ← ver 26.6a
```

- **Entrada:** `listCandidateOrder` (26.4), `Map<salesOrderId, SalesOrderItem[]>` (26.5).
- **Salida:** `CandidateOrderWithStockDto[]` (26.7).

**Tabla de atributos de `stockSummary`**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `stockStatus` | `'CONFIRMED' \| 'PENDING' \| 'UNKNOWN'` | `@IsEnum()` | Sí | Derivado. `UNKNOWN` solo si Ventas no respondió |
| `totalLines` | number | `@IsInt()` | Sí | Cuántas líneas tiene el pedido |
| `pendingLines` | number | `@IsInt()` | Sí | Cuántas vinieron cortas. **Es el número de la columna "N a confirmar"** |
| `noStockLines` | number | `@IsInt()` | Sí | Cuántas vinieron en cero. Subconjunto de `pendingLines` |

## E. `markStockUnknown(orders)` 26.6a

El camino del `alt` cuando Ventas da timeout o 5xx. Marca **todos** los pedidos con
`stockStatus: 'UNKNOWN'`, `pendingLines: 0`.

Consecuencias, que son deliberadas: la fila **no se pinta**, la columna dice `—` y el aviso de
"Continuar a Traslados" **no cuenta esos pedidos**. El listado se devuelve igual, con `200`.

> El stock a confirmar es información **adicional**, no un requisito para planificar. Un pedido se
> despacha igual sin saber si Ventas ya lo confirmó; lo que no se puede es dejar al planificador sin
> listado porque un servicio externo se cayó.

## Response Principal (26.9)

```json
{
  "success": true,
  "code": 200,
  "data": [
    {
      "candidateOrderId": 9041,
      "salesOrderId": 88214,
      "documentId": 4471002,
      "totalWeightKg": 486.00,
      "totalVolumeM3": 1.70,
      "isIncluded": true,
      "stockSummary": {
        "stockStatus": "PENDING",
        "totalLines": 3,
        "pendingLines": 1,
        "noStockLines": 0
      }
    },
    {
      "candidateOrderId": 9042,
      "salesOrderId": 88215,
      "documentId": 4471003,
      "totalWeightKg": 1240.00,
      "totalVolumeM3": 4.30,
      "isIncluded": true,
      "stockSummary": {
        "stockStatus": "PENDING",
        "totalLines": 2,
        "pendingLines": 1,
        "noStockLines": 1
      }
    },
    {
      "candidateOrderId": 9043,
      "salesOrderId": 88216,
      "documentId": 4471004,
      "totalWeightKg": 902.00,
      "totalVolumeM3": 3.10,
      "isIncluded": true,
      "stockSummary": {
        "stockStatus": "CONFIRMED",
        "totalLines": 1,
        "pendingLines": 0,
        "noStockLines": 0
      }
    }
  ]
}
```

Con Ventas caído (26.6a), el mismo `200` pero:

```json
{ "stockStatus": "UNKNOWN", "totalLines": 0, "pendingLines": 0, "noStockLines": 0 }
```

---

# 27 Obtener el detalle de productos de un pedido

## Endpoint

```
GET /planning/candidate-orders/{candidateOrderId}/items
```

Se dispara al hacer click en la fila. **Endpoint aparte y no un campo más de la 26** porque traer las
líneas de los 216 pedidos del listado para mostrar un color es traer todo el pedido de SAP para no
usarlo.

## Request Principal

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `candidateOrderId` | number | `@IsInt()` | Sí | Path param. `candidate_orders.id` (`:177`) |

## A. `getOrderItems(candidateOrderId)` 27.2 y 27.3

Orquesta: resolver el `salesOrderId` (27.4), pedir las líneas (27.5), resolver los productos (27.6) y
clasificar (27.7-27.8).

## B. `findCandidateOrder(candidateOrderId)` 27.4

**Una fila de `candidate_orders`**, y para una sola cosa: obtener el `sales_order_id`.

```sql
SELECT id, sales_order_id, document_id
  FROM candidate_orders
 WHERE id = $1 AND deleted_at IS NULL;
```

- **Entrada:** `candidateOrderId` (number).
- **Salida:** salida de 27.4.

| Atributo | Tipo TypeScript | Oblig. | Descripción / Restricción |
|---|---|---|---|
| `candidateOrderId` | number | Sí | `candidate_orders.id` (`:177`) |
| `salesOrderId` | number | Sí | `candidate_orders.sales_order_id` (`:179`) |
| `documentId` | number | Sí | `candidate_orders.document_id` (`:180`) |

```json
{ "candidateOrderId": 9041, "salesOrderId": 88214, "documentId": 4471002 }
```

Tres campos. **`candidate_orders` es un puente y nada más** en este flujo.

## C. `getSalesOrderItems(salesOrderId)` 27.5

```
GET /sales/orders/88214/items
```

- **Entrada:** `salesOrderId` (number).
- **Salida:** `SalesOrderItem[]` (salida de 27.5).

**Ejemplo JSON (respuesta de Ventas, salida de 27.5)**

```json
[
  { "productId": 70211, "requestedQty": 44, "confirmedQty": 44 },
  { "productId": 70455, "requestedQty": 14, "confirmedQty": 2 },
  { "productId": 70880, "requestedQty": 30, "confirmedQty": 30 }
]
```

**Fijate lo que NO trae: el nombre del producto.** Solo el `productId`. De ahí el paso siguiente.

## D. `findProductSnapshots(productIds)` 27.6

La consulta a **`product_snapshot`** (`DB.puml:35-40`), cache local del catálogo de SAP. Una sola
consulta con el `IN`, no una por producto.

```sql
SELECT product_id, weight, volume
  FROM product_snapshot
 WHERE product_id IN ($1, $2, $3);
```

- **Entrada:** `productIds` (number[]), deduplicado.
- **Salida:** salida de 27.6.

| Atributo | Tipo TypeScript | Oblig. | Descripción / Restricción |
|---|---|---|---|
| `productId` | number | Sí | `product_snapshot.product_id` (`DB.puml:36`) |
| `weight` | number | Sí | `product_snapshot.weight` (`DB.puml:38`) |
| `volume` | number | Sí | `product_snapshot.volume` (`DB.puml:39`) |
| `description` | string | — | ❌ **NO EXISTE HOY** |
| `unit` | string | — | ❌ **NO EXISTE HOY** |

**Ejemplo JSON — lo que devuelve HOY (salida de 27.6)**

```json
[
  { "productId": 70211, "weight": 8.40, "volume": 0.031 },
  { "productId": 70455, "weight": 11.20, "volume": 0.048 },
  { "productId": 70880, "weight": 6.00, "volume": 0.022 }
]
```

**Este es el hueco más concreto de todo el flujo.** Con eso, el panel solo puede escribir
`70455 — 2/14`. No hay forma de mostrar "Aceite girasol 900 ml · cajas". Dos salidas, hay que elegir:

| | Cómo | A favor | En contra |
|---|---|---|---|
| **A** | Agregar `description` y `unit` a `product_snapshot` | El panel responde sin depender de SAP | Hay que mantener la sincronización del cache |
| **B** | Que Ventas los devuelva en el payload de 27.5 | Cero cambios de esquema | El detalle queda atado a que SAP responda |

**Ejemplo JSON — lo que haría falta que devuelva (opción A)**

```json
[
  { "productId": 70211, "description": "Papel higiénico x4", "unit": "packs", "weight": 8.40, "volume": 0.031 },
  { "productId": 70455, "description": "Aceite girasol 900 ml", "unit": "cajas", "weight": 11.20, "volume": 0.048 },
  { "productId": 70880, "description": "Arroz grano largo 5 kg", "unit": "bolsas", "weight": 6.00, "volume": 0.022 }
]
```

## E. `classifyLine(item)` 27.7

Cálculo en memoria. **Es la regla completa del "stock a confirmar"**, y son dos columnas comparadas:

| Condición | `lineStatus` | Cómo se ve en el panel |
|---|---|---|
| `confirmedQty >= requestedQty` | `CONFIRMED` | Grupo "Con stock", en gris |
| `0 < confirmedQty < requestedQty` | `PARTIAL` | Grupo "A confirmar", en ámbar |
| `confirmedQty == 0` | `NO_STOCK` | Grupo "A confirmar", en ámbar |

`PARTIAL` y `NO_STOCK` van al mismo grupo pero se distinguen por el `0/N`: no es lo mismo "faltan 12
de 14" que "no hay ninguno".

## F. `mergeProductInfo(items, snapshots)` 27.8

Une por `productId` las líneas de Ventas (27.5) con el catálogo (27.6), y **parte la lista en dos**:
las cortas primero, las confirmadas después. El orden se define **en el backend**, no en el
front — es la misma regla para cualquier consumidor.

Si un `productId` no está en el snapshot, la línea se devuelve igual con
`description: null`: el dato de stock es el que importa, y esconder la línea sería peor que mostrarla
sin nombre.

## Response Principal (27.10)

```json
{
  "success": true,
  "code": 200,
  "data": {
    "candidateOrderId": 9041,
    "salesOrderId": 88214,
    "documentId": 4471002,
    "summary": {
      "stockStatus": "PENDING",
      "totalLines": 3,
      "pendingLines": 1,
      "noStockLines": 0
    },
    "pending": [
      {
        "productId": 70455,
        "description": "Aceite girasol 900 ml",
        "unit": "cajas",
        "requestedQty": 14,
        "confirmedQty": 2,
        "lineStatus": "PARTIAL"
      }
    ],
    "confirmed": [
      {
        "productId": 70211,
        "description": "Papel higiénico x4",
        "unit": "packs",
        "requestedQty": 44,
        "confirmedQty": 44,
        "lineStatus": "CONFIRMED"
      },
      {
        "productId": 70880,
        "description": "Arroz grano largo 5 kg",
        "unit": "bolsas",
        "requestedQty": 30,
        "confirmedQty": 30,
        "lineStatus": "CONFIRMED"
      }
    ]
  }
}
```

**Tabla de atributos de `OrderItemDto`**

| Atributo | Tipo TypeScript | Validación | Oblig. | Descripción / Restricción |
|---|---|---|---|---|
| `productId` | number | `@IsInt()` | Sí | `sales_order_item.product_id` (`DB.puml:28`) |
| `description` | string \| null | `@IsString()` `@IsOptional()` | No | De `product_snapshot` (27.6). **`null` mientras el hueco de §D no se cierre** |
| `unit` | string \| null | `@IsString()` `@IsOptional()` | No | Ídem |
| `requestedQty` | number | `@IsNumber()` | Sí | `sales_order_item.requested_qty` (`DB.puml:29`) |
| `confirmedQty` | number | `@IsNumber()` | Sí | `sales_order_item.confirmed_qty` (`DB.puml:30`) |
| `lineStatus` | `'CONFIRMED' \| 'PARTIAL' \| 'NO_STOCK'` | `@IsEnum()` | Sí | Derivado en 27.7 |

---

## Códigos HTTP

| Código | Cuándo | Cuerpo |
|---|---|---|
| `200` | Todo bien, **y también con Ventas caído** (26.6a) | El listado / el detalle |
| `400` | Falta `distributorId` o `deliveryDate` mal formada | Error de validación |
| `404` | El `candidateOrderId` no existe o está borrado (27.4) | Error |
| `502` | **Solo en 27.** Ventas no responde | Error |

La asimetría es a propósito: en la **26** la caída de Ventas degrada a `UNKNOWN` y devuelve `200`,
porque el listado sirve igual. En la **27** el detalle **es** el dato de Ventas — no hay nada que
mostrar en el panel, así que devuelve `502` y el panel muestra el error con reintento.

---

## Lo que hay que confirmar con Ventas

1. Los dos endpoints (`:batch` y el de detalle). **Hoy no existe ninguno.**
2. `description` y `unit`: ¿los devuelve Ventas o ampliamos `product_snapshot`?
3. **Qué es `sales_order_split_id`.** Aparece una sola vez en todo el repo (`DB.puml:27`), sin
   entidad `sales_order_split` definida. Si Ventas **parte el pedido** cuando falta stock, lo que
   llega no son líneas cortas dentro de un pedido sino **dos pedidos distintos** — y este documento
   entero cambia: no habría "stock a confirmar" que mostrar, habría pedidos hermanos que relacionar.
