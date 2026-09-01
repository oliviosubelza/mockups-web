# 30 Consultar qué pedidos ya están planificados — endpoint para MS Ventas

Diagrama: `PedidosPlanificados.drawio` — una página, sección **30**. Última revisión: **2026-08-19**,
cruzada contra el contrato EL3 (§31) — ver el aviso del §1.3, que afecta el grano de todo el documento. Numeración según la convención del
proyecto: el doc oficial `Documento Tecnico v1 (8).pdf` usa **1-19 y 21-25**, la **20** se deja libre,
`Productos.drawio` tomó **26** y **27**, `zonas/Zonas.drawio` tomó **28** y **29**. **Próxima libre: la
31.** Los retornos no se numeran en el diagrama.

---

## 1. Lo primero: el vendedor nos llega y lo tiramos

Ventas pidió consultar "por vendedor, cliente y algo más". **Por vendedor no se puede hoy** — pero no
porque el dato no exista: porque **no lo guardamos**. Verificado sobre el DDL completo: ninguna tabla
del esquema tiene el `employee_id` del vendedor.

Los cuatro `employee_id` que sí existen son **otra persona**:

| Columna | Quién es |
|---|---|
| `dispatch_plans.employee_id` (`:99`) | El **planificador** que armó el plan |
| `routes.employee_id` (`:208`) | El **supervisor** que aprueba el ruteo |
| `routes.driver_employee_id` / `helper_employee_id` (`:209-212`) | **Chofer** y **ayudante** |

El vendedor sí existe, y **ya nos llega**. Verificado el 2026-08-19 contra
`Documento Tecnico v1 (8).pdf`:

- **`getEmployee()` paso 1.4** (§01, *Abrir módulo de planificación*) devuelve
  `[{ "employeeId": 1, "name": "D. Cespedes" }, ...]` — es la lista que alimenta el dropdown de
  vendedores. El propio doc trae un pendiente escrito al margen: `// add distributorId, code, rol`.
- **`FilterOrdersDto`** (§03 *Seleccionar Filtro*, `POST /orders-by-filter`, pasos 2.2-2.4) acepta
  **`employees: number[]` — "Lista de IDs de vendedores"**, junto a `cities`, `channels`, `markets` y
  `zones`.
- La respuesta de **MS_Sales** en el paso **2.3 / `listOrders` 2.4** trae, **por orden**:
  `{ "orderId": 1, "ownerId": 1, "deliveryPointId": 123, "employeeId": 456, "employeeName": "John Doe", ... }`
- Y el *Response Principal* de ese paso devuelve esos mismos campos al Frontend dentro de `listOrder[]`.

**O sea: el vendedor entra al sistema con id Y nombre, en cada orden, y encima ya es un criterio de
filtro.** Lo perdemos exactamente en un punto: **el `INSERT` a `candidate_orders`**, que no tiene
columna donde ponerlo. No se pierde "más adelante" — muere en el primer guardado, y todo lo que viene
después (OT, entregas) nunca lo tuvo.

Peor: **ese `INSERT` no está documentado en ningún flujo.** No hay `INSERT INTO candidate_orders` en
ninguno de nuestros documentos ni diagramas. El intake es el paso que nadie escribió, y es justo donde
se cae el dato.

### Las dos salidas

- **A — Ventas manda `salesOrderIds[]`.** El vendedor es SU dato: ellos saben qué pedidos son de
  "V001", nos preguntan por esa lista y les devolvemos cuáles están planificados. **Cero cambio de
  esquema, funciona hoy.**
- **B — Persistir el vendedor en `candidate_orders`.** Ver §1.1. **No requiere que Ventas cambie
  nada**: el dato ya viaja en el paso 2.3. Es una migración más mapear un campo que hoy se descarta.

**Recomendación: B, y A mientras tanto.** B dejó de ser costoso cuando se verificó que MS_Sales ya
manda `employeeId` y `employeeName` — el bloqueo que se le atribuía ("que Ventas empiece a mandarlo")
no existe. Pero B tiene un cutover con datos históricos incompletos (§1.2), así que A sigue siendo la
única forma de responder por pedidos anteriores a la migración.

## 1.1 Dónde va la columna: `candidate_orders`, no `dispatch_delivery_points`

`candidate_orders` es la primera tabla nuestra que ve un `sales_order_id`, y el grano coincide: **una
fila por pedido de venta**, igual que el vendedor, que en el payload de MS_Sales viene en la cabecera
de la orden. 1 a 1.

`dispatch_delivery_points` **sería un error**, aunque tiente porque ya denormaliza `owner_name` y
`customer_name`. El propio DDL lo delata:

- `:143` — `total_weight_kg`: *"**Sumatoria** de peso acumulado en la parada"*
- `:146` — `forced_planning_truck_id`: *"Camión forzado en **unificación** manual"*
- `:195` — `candidate_orders.dispatch_delivery_point_id` es FK **muchos-a-uno**

Una parada **unifica varios pedidos**, y esos pedidos pueden ser de **vendedores distintos** — dos
vendedores que le vendieron al mismo cliente el mismo día caen en la misma parada. Poner `employee_id`
ahí colapsa N vendedores en una columna y gana el último que escribió: un valor plausible y equivocado.

```sql
ALTER TABLE candidate_orders
    ADD COLUMN employee_id   BIGINT,
    ADD COLUMN employee_code VARCHAR(20),
    ADD COLUMN employee_name VARCHAR(100);

CREATE INDEX idx_candidate_orders_employee
    ON candidate_orders (employee_id)
 WHERE deleted_at IS NULL AND employee_id IS NOT NULL;
```

Los tres campos, no solo el id, porque **no existe tabla `employees`** (verificado): sin
`employee_name` la respuesta solo puede devolver un número, no "D. Cespedes". Mismo criterio que
`routes.name_driver_employee` y que `dispatch_delivery_points.owner_name`. `employee_code` va porque el
pendiente `// add ... code, rol` del paso 1.4 apunta a eso y es lo que muestra la UI de Ventas.

Sin FK, igual que `zones.city_id`. Y es un **snapshot**: si Ventas reasigna el pedido a otro vendedor,
nuestra copia queda vieja — mismo trato que `customer_name` o `unit_price_snapshot`.

## 1.2 El cutover: `partialData`

La columna **no se puede rellenar hacia atrás**. Las filas ya cargadas quedan en `NULL` para siempre,
porque el dato se descartó en su momento. Consecuencia: filtrando por vendedor, los pedidos anteriores
a la migración **no aparecen**, y Ventas lo lee como "este vendedor no tuvo pedidos".

Es el mismo patrón que ya apareció dos veces en estos endpoints — `OUT_OF_ZONE` vs
`NO_ZONES_DEFINED` (§29), `NOT_RECEIVED` vs `EXCLUDED` (§2.1): **"no hay" y "no lo sabemos" son
respuestas distintas y hay que devolverlas distintas.** La respuesta marca `partialData: true` y
`vendorDataSince: "<fecha del cutover>"` cuando el rango consultado toca fechas previas.

Este documento especifica el endpoint aceptando **las dos formas de consulta** (§3.1), con `salesOrderIds`
como la principal.

---

## 1.3 AVISO: el grano de esta sección cambió

**Escrito el 2026-08-19, después de la segunda revisión de EL3** (ver
`diagrams/ventas/DocumentacionTecnica.md` §2). Ventas agregó `saleOrderSplitId` e `isCooled`, y en su
ejemplo **dos elementos son el mismo pedido** (`saleOrderId: 1`) partido en dos splits, uno seco y uno
frío.

Si la unidad planificable es el **split**, esta sección está especificada en el grano equivocado:

- `plannedSalesOrderIds: number[]` **no puede expresar un pedido parcialmente planificado.** El split
  seco entra al plan de hoy y el frío no, porque no había camión con termo. Devolver `1` dice que el
  pedido está planificado; omitirlo dice que no lo está. **Las dos respuestas son falsas.**
- La clave de todas las consultas pasa a ser **`(saleOrderId, saleOrderSplitId)`**.
- Aparece un noveno estado a nivel pedido: **`PARTIALLY_PLANNED`**.
- `candidate_orders` necesita `sale_order_split_id` y el índice único sobre la clave compuesta — hoy dos
  splits del mismo pedido son **filas indistinguibles**.

Forma corregida de la respuesta:

```json
{
  "plannedSalesOrderIds": [1],
  "partiallyPlannedSalesOrderIds": [1],
  "details": [
    { "saleOrderId": 1, "saleOrderSplitId": 1, "isCooled": false, "status": "PLANNED", "reversible": true },
    { "saleOrderId": 1, "saleOrderSplitId": 2, "isCooled": true,  "status": "RECEIVED_NOT_PLANNED",
      "reason": "Sin camión refrigerado disponible en el plan de esa fecha." }
  ]
}
```

**No reescribí el resto del documento todavía a propósito.** Antes hay que confirmar con Ventas qué eje
es el split — frío/seco, empresa, o los dos a la vez (§2.2 de la §31). Si son dos ejes, un pedido puede
partirse en 4 unidades y el cambio es más profundo que renombrar una clave. Todo lo que sigue vale tal
cual **si la unidad resulta ser el pedido**; si es el split, hay que sustituir `salesOrderId` por la
clave compuesta en las §3.1, §B, §C, §D y §4.

## 2. Qué significa "ya está planificado"

Un `sales_order_id` atraviesa cuatro tablas nuestras, y en cada salto significa algo distinto:

| Etapa | Dónde se ve | Qué implica |
|---|---|---|
| Recibido | `candidate_orders` con `dispatch_delivery_point_id IS NULL` | Lo tenemos, todavía no entró a un plan |
| Excluido | `is_included = FALSE` | Lo tenemos y el planificador decidió **no** planificarlo |
| Planificado | `dispatch_delivery_point_id` cargado, plan en `DRAFT`/`IN_OPTIMIZATION` | Está en un plan, **todavía reversible** |
| Plan aprobado | `plan_status.name = 'APPROVED'` | El plan se cerró |
| Despachado | fila en `transport_order_sales` | Hay Orden de Transporte |
| En última milla | fila en `delivery_order_sales` | Salió a entregar |

**"Planificado" a secas no alcanza como respuesta**, y colapsar todo en un booleano pierde justo la
distinción que Ventas necesita: un pedido en un plan `DRAFT` todavía se puede sacar; uno con OT creada,
no. Y `EXCLUDED` es el peor de todos para esconder — Ventas lo leería como "no llegó" y lo reenviaría,
cuando en realidad llegó y lo descartamos.

Por eso la respuesta trae **el array que pidieron** (`plannedSalesOrderIds`) **y** un `details[]` con la
etapa exacta de cada id. El array resuelve el caso de uso inmediato; el detalle evita que dentro de un
mes haya que romper el contrato para agregarlo.

### 2.1 Los ocho estados

| `status` | Condición |
|---|---|
| `NOT_RECEIVED` | No hay fila en `candidate_orders` con ese `sales_order_id` |
| `RECEIVED_NOT_PLANNED` | Fila con `dispatch_delivery_point_id IS NULL` |
| `EXCLUDED` | Fila con `is_included = FALSE` |
| `PLANNED` | En un plan, `plan_status.name` en `DRAFT` / `IN_OPTIMIZATION` |
| `PLAN_APPROVED` | En un plan con `plan_status.name = 'APPROVED'` |
| `DISPATCHED` | Fila en `transport_order_sales` con OT viva |
| `IN_DELIVERY` | Fila en `delivery_order_sales`, `delivery_orders.status` no terminal |
| `DELIVERED` | `delivery_orders.status = 'DELIVERED'` |

**`plannedSalesOrderIds` = los ids de `PLANNED` en adelante**, o sea todo lo que ya está comprometido en
una operación. `NOT_RECEIVED`, `RECEIVED_NOT_PLANNED` y `EXCLUDED` quedan afuera del array pero
aparecen en `details[]`.

---

# Endpoint

```http
POST /planning/sales-orders/planned-status
```

`POST` y no `GET`: `salesOrderIds[]` puede traer cientos de ids y no entran en un query string.

## 3.1 Request Principal (`PlannedStatusQueryDto`) 30.1

**Dos modos de consulta. Hay que usar exactamente uno.**

### Modo lista (recomendado)

| Campo | Tipo | Requerido |
|---|---|---|
| `salesOrderIds` | `number[]` | ✅ 1 a 500 elementos |
| `distributorId` | `number` | ❌ Acota el scope |

```json
{ "salesOrderIds": [88214, 88219, 88301, 88477], "distributorId": 1 }
```

### Modo filtro

Al menos uno de `customerId` o `deliveryPointId`. Todo lo demás acota.

| Campo | Tipo | Nota |
|---|---|---|
| `customerId` | `number` | `dispatch_delivery_points.customer_id` |
| `deliveryPointId` | `number` | `dispatch_delivery_points.delivery_point_id` |
| `saleChannelId` | `number` | `dispatch_delivery_points.sale_channel_id` |
| `distributorId` | `number` | `candidate_orders.distributor_id` |
| `planDateFrom` / `planDateTo` | `date` | `dispatch_plans.plan_date`. **Ver la advertencia de abajo** |

```json
{ "customerId": 18, "distributorId": 1, "planDateFrom": "2026-08-19", "planDateTo": "2026-08-21" }
```

**`employeeId` no es un campo válido.** Si llega, la respuesta es `400 UNSUPPORTED_FILTER` con el
mensaje del §1 — **no se ignora en silencio**. Un filtro ignorado es peor que un error: Ventas creería
que preguntó por un vendedor y recibiría los pedidos de todos, sin ninguna señal.

### La advertencia del filtro por fecha

`plan_date` vive en `dispatch_plans`, y solo se llega ahí atravesando `dispatch_delivery_point_id`. Una
candidata que todavía no entró a un plan **no tiene fecha**. Consecuencia directa: en modo filtro con
`planDateFrom`/`planDateTo`, los `RECEIVED_NOT_PLANNED` **no pueden aparecer** — no hay por dónde
fecharlos. Si Ventas necesita verlos, tiene que usar el modo lista.

Los dos modos son consistentes en todo lo demás; en esto no pueden serlo, y esconderlo haría que un
pedido recibido parezca inexistente.

## A. `validateQuery(dto)` 30.3a

| Check | Resultado |
|---|---|
| Ni `salesOrderIds` ni (`customerId` \| `deliveryPointId`) | `400 MISSING_CRITERIA` |
| Los dos modos a la vez | `400 AMBIGUOUS_CRITERIA` |
| `salesOrderIds.length > 500` | `400 TOO_MANY_IDS` |
| `employeeId` presente | `400 UNSUPPORTED_FILTER` |

El tope de 500 no es decorativo: sin él, un `ANY(:ids)` con 50.000 elementos es un incidente de base
disparado desde afuera.

## B. Estado de planificación 30.4, 30.4a-c

**Una sola consulta**, con tres `LEFT JOIN`:

```sql
SELECT co.sales_order_id,
       co.is_included,
       co.dispatch_delivery_point_id,
       ddp.customer_id,
       ddp.delivery_point_id,
       dpl.id        AS dispatch_plan_id,
       dpl.plan_date,
       ps.name       AS plan_status
  FROM candidate_orders co
  LEFT JOIN dispatch_delivery_points ddp
         ON ddp.id = co.dispatch_delivery_point_id
        AND ddp.deleted_at IS NULL                          -- 30.4a
  LEFT JOIN dispatch_plans dpl
         ON dpl.id = ddp.dispatch_plan_id
        AND dpl.deleted_at IS NULL                           -- 30.4b
  LEFT JOIN plan_status ps ON ps.id = dpl.plan_status_id      -- 30.4c
 WHERE co.deleted_at IS NULL
   AND co.sales_order_id IS NOT NULL
   AND co.sales_order_id = ANY(:salesOrderIds);
```

Tres detalles que no son opcionales:

1. **`sales_order_id IS NOT NULL`.** La columna es nullable (`:179`) a propósito: una candidata puede
   venir de `refund_order_id` (devolución) o `transfer_id` (traslado) y no tener pedido de venta.
2. **Los `JOIN` son `LEFT`, no `INNER`.** `dispatch_delivery_point_id` es nullable (`:178`) y es
   exactamente el corte entre `RECEIVED_NOT_PLANNED` y `PLANNED`. Con `INNER JOIN`, las candidatas sin
   plan desaparecen del resultado y Ventas las ve como `NOT_RECEIVED` — o sea, las reenvía.
3. **`deleted_at IS NULL` en las tres tablas.** Un plan borrado no planifica nada, pero sus
   `dispatch_delivery_points` siguen apuntando a él.

## C. Despacho 30.5, 30.5a

```sql
SELECT tos.sales_order_id, tos.sales_order_split_id, tord.id, tord.code, tord.status
  FROM transport_order_sales tos
  JOIN transport_orders tord
    ON tord.id = tos.transport_order_id AND tord.deleted_at IS NULL   -- 30.5a
 WHERE tos.deleted_at IS NULL AND tos.sales_order_id = ANY(:salesOrderIds);
```

**Puede devolver más de una fila por `sales_order_id`**: `sales_order_split_id` existe porque a la
altura de la OT el pedido puede estar partido por empresa. Se agrupa por `sales_order_id` y se
devuelven todas las OT en `transportOrders[]` — quedarse con la primera esconde media entrega.

## D. Última milla 30.6, 30.6a

```sql
SELECT dos.sale_order_id, dord.id, dord.status
  FROM delivery_order_sales dos
  JOIN delivery_orders dord
    ON dord.id = dos.delivery_order_id AND dord.deleted_at IS NULL     -- 30.6a
 WHERE dos.deleted_at IS NULL AND dos.sale_order_id = ANY(:salesOrderIds);
```

**`sale_order_id`, singular.** `candidate_orders:179` y `transport_order_sales:301` usan
`sales_order_id`; `delivery_order_sales:403` usa `sale_order_id`. Tres tablas, dos grafías. El typo
**no falla**: devuelve vacío, y el pedido entregado se reporta como si nunca hubiera salido. Vale un
alias explícito en el repositorio para que quede a la vista.

## E. `classifyStage(...)` 30.7

Gana **la etapa más avanzada** encontrada para ese id:

```
DELIVERED > IN_DELIVERY > DISPATCHED > PLAN_APPROVED > PLANNED > EXCLUDED > RECEIVED_NOT_PLANNED > NOT_RECEIVED
```

El orden importa porque las etapas **no son excluyentes en la base**: la fila de `candidate_orders`
sigue existiendo cuando ya hay OT y cuando ya hay entrega. Sin una precedencia explícita, el mismo
pedido se clasifica distinto según el orden en que se recorran los tres resultados.

`EXCLUDED` va por debajo de `PLANNED` a propósito: si una candidata quedó excluida de un plan pero
entró en otro, lo que manda es que **sí** está planificada.

## 4. Response Principal (30.7 → cliente)

```json
{
  "plannedSalesOrderIds": [88214, 88219, 88477],
  "details": [
    {
      "salesOrderId": 88214,
      "status": "PLANNED",
      "isPlanned": true,
      "dispatchPlanId": 41,
      "planDate": "2026-08-20",
      "planStatus": "DRAFT",
      "reversible": true,
      "transportOrders": []
    },
    {
      "salesOrderId": 88219,
      "status": "DISPATCHED",
      "isPlanned": true,
      "dispatchPlanId": 41,
      "planDate": "2026-08-20",
      "planStatus": "APPROVED",
      "reversible": false,
      "transportOrders": [{ "transportOrderId": 10045, "code": 1000456, "status": "ENROUTE" }]
    },
    {
      "salesOrderId": 88301,
      "status": "EXCLUDED",
      "isPlanned": false,
      "reason": "El planificador lo excluyó del plan (is_included = false)."
    },
    {
      "salesOrderId": 88477,
      "status": "DELIVERED",
      "isPlanned": true,
      "reversible": false,
      "deliveryOrders": [{ "deliveryOrderId": 77120, "status": "DELIVERED" }]
    },
    {
      "salesOrderId": 88999,
      "status": "NOT_RECEIVED",
      "isPlanned": false,
      "reason": "No existe candidate_orders para ese sales_order_id."
    }
  ]
}
```

`details[]` responde por **todos** los ids consultados, incluidos los que no encontramos. Devolver solo
los encontrados obligaría a Ventas a hacer la diferencia de conjuntos para saber qué pasó con el resto
— y a adivinar si el id faltante es un "no planificado" o un "no llegó".

`reversible` es el campo que resume la pregunta operativa real: **¿todavía puede Ventas modificar o
anular este pedido?** `true` solo en `PLANNED` con plan `DRAFT`/`IN_OPTIMIZATION`.

---

## 5. Resumen: qué se toca por paso

| Paso | Contra qué | Operación |
|---|---|---|
| 30.3a | — | Validación en memoria |
| 30.4 + 30.4a-c | `candidate_orders` ⨝ `dispatch_delivery_points` ⨝ `dispatch_plans` ⨝ `plan_status` | `SELECT`, **una** consulta |
| 30.5 + 30.5a | `transport_order_sales` ⨝ `transport_orders` | `SELECT` |
| 30.6 + 30.6a | `delivery_order_sales` ⨝ `delivery_orders` | `SELECT` |
| 30.7 | — | Clasificación en memoria |

**Ninguna escritura.** El flujo es de lectura pura, igual que la 26, la 27 y la 29. Tres consultas y no
una sola porque las tres ramas parten de tablas distintas sin camino de `JOIN` entre ellas: el puente
es el `sales_order_id`, que no es FK en ninguna de las tres.

---

## 6. Índices

Ninguna de las tres columnas puente está indexada hoy. Sin esto, cada consulta de Ventas es un scan
secuencial de las tres tablas:

```sql
CREATE INDEX idx_candidate_orders_sales_order
    ON candidate_orders (sales_order_id) WHERE deleted_at IS NULL AND sales_order_id IS NOT NULL;

CREATE INDEX idx_transport_order_sales_sales_order
    ON transport_order_sales (sales_order_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_delivery_order_sales_sale_order
    ON delivery_order_sales (sale_order_id) WHERE deleted_at IS NULL;
```

Para el modo filtro:

```sql
CREATE INDEX idx_ddp_customer ON dispatch_delivery_points (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ddp_delivery_point ON dispatch_delivery_points (delivery_point_id) WHERE deleted_at IS NULL;
```

---

## 7. Códigos HTTP

| Código | Cuándo |
|---|---|
| `200 OK` | Siempre que la consulta se resuelva, **incluso si los ocho estados salen `NOT_RECEIVED`** |
| `400 MISSING_CRITERIA` | Ni `salesOrderIds` ni `customerId`/`deliveryPointId` |
| `400 AMBIGUOUS_CRITERIA` | Los dos modos en el mismo request |
| `400 TOO_MANY_IDS` | `salesOrderIds.length > 500` |
| `400 UNSUPPORTED_FILTER` | Llegó `employeeId` (vendedor) — ver §1 |
| `401 / 403` | Credencial de servicio de Ventas ausente o sin permiso |
| `500` | Error nuestro |

**Nunca `404`.** "Ninguno de estos pedidos está planificado" es una respuesta válida con cuerpo, no un
recurso ausente. Mismo criterio que el `OUT_OF_ZONE` de la 29: un `404` en un cliente HTTP dispara
reintentos y alarmas sobre el caso normal.

---

## 8. Lo que hay que confirmar con Ventas

1. **¿Modo lista o modo filtro?** Si es lista, el §1 se resuelve solo y no hay migración. Si necesitan
   preguntar por vendedor sin conocer la lista de pedidos, hay que hacer la opción B del §1 — que
   **ya no depende de Ventas**: EL3 manda `employeeId`, `employeeCode` y `employeeName` en cada
   elemento, y `employeeIds` ya es filtro del request. Es solo migración nuestra.
2. **¿Qué hacen con `EXCLUDED`?** Es el estado que más fácil se malinterpreta: lo recibimos y lo
   descartamos. Si Ventas lo trata como `NOT_RECEIVED`, va a reenviar el pedido en loop.
3. **¿Les alcanza `reversible`, o necesitan la regla completa?** Hoy `reversible = true` solo con plan
   en `DRAFT`/`IN_OPTIMIZATION`. Si tienen su propia política de anulación, la regla es suya y nosotros
   solo damos el estado.
4. **¿Qué eje es `saleOrderSplitId`?** Dejó de ser "un campo sin definición": EL3 lo manda, y su
   ejemplo **refuta** la hipótesis vieja de que el split era por empresa —los dos splits del mismo
   pedido tienen el mismo `companyId`—. Lo que los diferencia es `isCooled`. Falta confirmar si el eje
   es la temperatura, la empresa, o **los dos a la vez**: en ese último caso un pedido se parte en
   2 × 2 = 4 unidades y el modelo no lo soporta en ningún nivel. Detalle completo en el §2 de
   `diagrams/ventas/DocumentacionTecnica.md`. **Es la pregunta que define el grano de esta sección
   entera** (§1.3).

   Corolario que ya vale igual: un `sales_order_id` tiene N OT, así que el `transportOrders[]` del §4
   es obligatorio, no un lujo.
5. **¿Tope de 500 ids?** Si su caso real es "todos los pedidos del día de un vendedor", puede quedar
   corto y conviene paginar.

---

## 9. Deriva de esquema detectada el 2026-08-19

El DDL que pasó el usuario **no coincide** con `diagrams/UltimaVersionUltima.sql` en el área de conteo:

| Repo (`UltimaVersionUltima.sql:354`) | DDL nuevo |
|---|---|
| `truck_inventory_histories` | **eliminada** |
| — | `transport_order_count_sessions` (nueva) |
| — | `transport_order_count_session_items` (nueva) |

Las tablas que usa **este** flujo (`candidate_orders`, `dispatch_delivery_points`, `dispatch_plans`,
`plan_status`, `transport_order_sales`, `transport_orders`, `delivery_order_sales`, `delivery_orders`)
están **idénticas** en las dos versiones, así que la 30 no se ve afectada. Pero
`UltimaVersionUltima.sql` quedó viejo y `diagrams/` está en `.gitignore`: no hay diff que lo recupere.

---

## 10. Referencias

- `diagrams/planificacion/PedidosPlanificados.drawio` — el diagrama de secuencia (sección 30)
- `diagrams/planificacion/PedidosPlanificados.json` — payloads de ejemplo
- `diagrams/planificacion/DocumentacionTecnica.md` — secciones 26 y 27, mismo dominio
- `diagrams/zonas/DocumentacionTecnica.md` — secciones 28 y 29, el otro endpoint para Ventas
- `diagrams/UltimaVersionUltima.sql` — `candidate_orders:176-201`, `dispatch_delivery_points:129-158`,
  `dispatch_plans:92-109`, `transport_order_sales:298-316`, `delivery_order_sales:400-415`
- `format_sales.json` — el payload de Ventas, donde sí está `employeeId`/`employeeCode`/`employeeName`
