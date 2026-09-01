# Documentación técnica: Devoluciones (motor de aprobación de notas de crédito)

Sección **48** del documento técnico. Las secciones 41-45 son la revisión semáforo y las 46-47 las
restricciones de planificación; 48 es la primera libre.

## Diagramas de secuencia

Viven en `diagrams/` con el prefijo `dev_`, siguiendo el formato de
`diagrams/historial_04_post_supervisor_discrepancy_review.plantuml`.

| # | Endpoint | Diagrama |
|---|---|---|
| 48.1 | `GET /refunds/returnable-products` | `dev_15_get_returnable_products.plantuml` |
| 48.2 | `POST /refunds` | `dev_01_post_create_refund_order.plantuml` |
| 48.3 | `GET /refunds` | `dev_02_get_refunds_list.plantuml` |
| 48.4 | `GET /refunds/:id` | `dev_03_get_refund_order_detail.plantuml` |
| 48.5 | `POST /refunds/:id/levels/current/view` | `dev_04_post_register_level_view.plantuml` |
| 48.6 | `POST /refunds/:id/levels/1/item-selection` | `dev_05_post_level1_item_selection.plantuml` |
| 48.7 | `POST /refunds/:id/levels/current/approve` | `dev_06_post_approve_level.plantuml` |
| 48.8 | `POST /refunds/:id/levels/current/reject` | `dev_07_post_reject_level.plantuml` |
| 48.9 | `PUT /refunds/:id/items` | `dev_09_put_seller_edit_items.plantuml` |
| 48.10 | `POST /refunds/:id/resubmit` | `dev_10_post_seller_resubmit.plantuml` |
| 48.11 | `POST /refunds/:id/reactivate` | `dev_08_post_reactivate_refund_order.plantuml` |
| 48.12 | `POST /refunds/:id/cancel` | `dev_11_post_cancel_refund_order.plantuml` |
| 48.13 | `POST /refunds/:id/comments` | `dev_16_post_refund_comment.plantuml` |
| 48.14 | `GET /refunds/:id/history` | `dev_12_get_refund_history.plantuml` |
| 48.15 | `GET /refunds/:id/approvers` | `dev_14_get_role_directory_approvers.plantuml` |
| 48.16 | `GET` y `POST /refund-approval-levels` | `dev_13_refund_approval_levels_config.plantuml` |

## 1. Fuente de verdad

- **Esquema:** `db_script.sql` del repositorio, bloque `refund_*`. Es la referencia normativa de este
  documento, y el 31/08/2026 se lo completó con lo que el flujo pedía y no existía (§5).
  `docs/devoluciones/refund_orders_schema.sql` quedó atrasado y **no** debe usarse: tiene `seller_code`,
  `client_id`, `item_selection_locked` y `workflow_version_id` en los niveles de instancia, y le faltan las
  tres tablas de evidencia.
- **Flujo del motor:** `docs/devoluciones/diagramas/motor-aprobacion-flujo.excalidraw`.
- **Comportamiento observable:** el mockup en `src/mockup/devoluciones/` (bandeja y detalle/decisión).
- **Estado del contrato:** todos los endpoints de este documento son **CONTRATO PROPUESTO**. Ninguno está
  implementado en backend; el mockup los simula con servicios en memoria.

### Los bloques de ejemplo

Los dos casos narrados al final del script (sin disociación y con disociación) **se reescribieron** para que
compilen contra el DDL: antes usaban `seller_code`, `client_id`, `activation_min_amount` en los niveles de
instancia, y `actor_type` y `at` en las acciones, que no existen. Ahora incluyen la semilla de motivos y de la
escalera, las fotos y los orígenes, y cierran escribiendo `approved_total` y `settlement_type`.

`refund_orders.owner_id` y `customer_id` conviven sin comentario que las separe: `owner_id` está anotado como
"Cliente" y `customer_id` no está anotado. Este documento asume `owner_id` = cliente dueño de la nota y
`customer_id` = cliente facturado, y **queda pendiente confirmarlo**.

## 2. Modelo de datos

Diez tablas, en cuatro capas.

### Configuración

- **`refund_reasons`** — catálogo cerrado de motivos. Cada motivo declara qué evidencia exige:
  `lot_requirement` y `due_date_requirement` en `REQUIRED` / `OPTIONAL` / `HIDDEN`, más `requires_photo` y
  `requires_notes`. `refund_order_details.reason` es FK a este catálogo: **ya no es texto libre**, y la
  validación del formulario de Ventas sale de acá y no del front.
- **`refund_approval_levels`** — la escalera publicada. `workflow_version_id` agrupa las filas de una misma
  versión; `activation_min_amount` es el piso del nivel y el techo es el piso del siguiente;
  `approval_policy` ∈ {`ANY`, `ALL`, `QUORUM`} con `required_approvals` solo para `QUORUM`;
  `on_reject` ∈ {`TERMINATE`, `RETURN_PREVIOUS`, `RETURN_INITIATOR`}; `sla_hours` nulo = sin plazo.

### Negocio

- **`refund_orders`** — la nota. `note_number` **no es único**: la original y sus disociadas lo comparten y se
  distinguen por `split_sequence` (0 = original) y `document_type` ∈ {`ORIGINAL`, `DISSOCIATED`}.
  `source_refund_order_id` apunta a la nota de la que salió. `status` ∈ {`OPEN`, `APPROVED`, `REJECTED`,
  `ANNULLED`} es el resultado de negocio, no el paso del workflow. `current_workflow_instance_id` señala el
  intento vigente. `total` es la suma de `quantity × price_unit` de los detalles `ACTIVE`.
- **`refund_order_details`** — las líneas. `source_quantity` se congela al crear y nunca cambia; `quantity` es
  la vigente y el CHECK exige `0 ≤ quantity ≤ source_quantity`. `price_unit` queda congelado al momento del
  reclamo. `line_status` ∈ {`ACTIVE`, `DISSOCIATED`}. `source_detail_id` da la trazabilidad hacia la línea de
  la nota de origen.

### Evidencia

- **`refund_order_detail_sources`** — de qué factura y de qué lote sale lo que se devuelve:
  `invoice_number`, `invoice_sap_doc` (referencia lógica, SAP no es nuestra base), `invoiced_at`, `lot`,
  `due_date` y `quantity`. La suma de `quantity` de los orígenes debe dar **exactamente** la `quantity` de la
  línea; se valida en la transacción del intake, no con un CHECK de fila. Un origen sin factura y sin lote se
  rechaza por CHECK.
- **`refund_order_detail_photos`** — las fotos del reclamo, que son lo primero que abre el revisor.
  `storage_key` es la fuente (clave en el bucket, con UNIQUE) y `url` la que hoy sirve el CDN; `sort_order`
  ordena el carrusel, y `taken_at` / `uploaded_by` dejan la trazabilidad de quién subió qué.

### Workflow

- **`refund_workflow_instances`** — un intento por fila. `attempt` numera el intento,
  `reactivated_from_instance_id` encadena la reactivación, `status` ∈ {`EDITING`, `IN_APPROVAL`, `APPROVED`,
  `REJECTED`, `CANCELLED`} y `current_level_order` es el nivel activo (`NULL` cuando la instancia cerró).
- **`refund_workflow_instance_levels`** — el *snapshot* de la escalera para ese intento: copia
  `level_name`, `role_code`, `min_amount`, `max_amount`, `approval_policy`, `required_approvals`,
  `on_reject` y `sla_hours` desde la configuración, para que republicar la
  escalera no reescriba la historia. `max_amount` es `NULL` en el último nivel, que no tiene techo.
  `decision_mode` ∈ {`ITEM_SELECTION`, `DOCUMENT_DECISION`}:
  **solo el nivel 1 del primer intento selecciona ítems**. `status` ∈ {`PENDING`, `IN_PROGRESS`, `APPROVED`,
  `REJECTED`, `SKIPPED`}. `first_viewed_at` / `first_viewed_by` se sellan una sola vez.
- **`refund_workflow_actions`** — bitácora append-only. `action` ∈ {`CREATED`, `VIEWED`,
  `LEVEL1_ITEM_SELECTION`, `DISSOCIATED_CREATED`, `APPROVE`, `REJECT`, `RETURNED_PREVIOUS`,
  `SELLER_RESUBMITTED`, `AUTO_ROUTED`, `REACTIVATE`, `CANCEL`, `COMMENT`, `CLOSED`}, con CHECK. `workflow_instance_level_id` es `NULL` en las acciones que no pertenecen
  a un nivel (`CREATED`, `DISSOCIATED_CREATED`). `related_refund_order_id` es la **fila puente**: vive en la
  instancia de la original y apunta a la disociada. `system_summary` es la frase autogenerada;
  `amount_before` / `amount_after` solo en las acciones que mueven el monto.
- **`refund_order_detail_decisions`** — la selección binaria del nivel 1 y nada más:
  `decision` ∈ {`SELECTED`, `DISSOCIATED`}, colgada de la acción `LEVEL1_ITEM_SELECTION`.

### Integridad declarada

El DDL declara ahora lo que antes quedaba en manos de la aplicación:

- `UNIQUE (note_number, split_sequence)` y `UNIQUE (external_sales_id, split_sequence)`, ambos parciales sobre
  `deleted_at IS NULL`: el número de nota se repite entre la original y sus disociadas, pero el par no.
- `CHECK` de coherencia del split: la `ORIGINAL` va con `split_sequence = 0` y sin fuente; la `DISSOCIATED`
  con `split_sequence > 0` y fuente obligatoria.
- `CHECK` de catálogo en `status`, `document_type`, `settlement_type`, `line_status`, `decision_mode`,
  `approval_policy`, `on_reject`, `action` y `decision`.
- `CHECK` de coherencia de la instancia: solo `IN_APPROVAL` tiene `current_level_order`.
- `CHECK` de política: `required_approvals >= 1` solo con `QUORUM`, y `= 1` en el resto;
  `RETURN_PREVIOUS` prohibido en el nivel 1.
- `CHECK` de motivo obligatorio en `REJECT`, `REACTIVATE` y `CANCEL`, y de que solo
  `DISSOCIATED_CREATED` apunte a otra nota.
- `UNIQUE (workflow_instance_level_id, actor_employee_code) WHERE action = 'APPROVE'`: **una firma por persona
  y por nivel**, garantizada en la base y no solo en el servicio.
- Índices de bandeja (`distributor_id, status, created_at`), de vendedor, de familia del split, de niveles
  abiertos por rol, de historial por instancia y de "de dónde salió esta disociada".

Lo que sigue delegado a la aplicación: los FK a `distributors`, `employees`, clientes y `products` — el
comentado de `distributors` se dejó como estaba, para no acoplar el bloque de devoluciones a un orden de
creación que hoy el script no garantiza.

## 3. Reglas del motor de aprobación

### 3.1 La escalera de montos

`refund_approval_levels` guarda **un piso por nivel** (`activation_min_amount`). El techo es el piso del nivel
siguiente y el último nivel no tiene techo. Al materializar la instancia, cada nivel se copia a
`refund_workflow_instance_levels` **con la banda ya resuelta** en `min_amount` y `max_amount`, para que
republicar la configuración no reescriba la historia.

- El **nivel 1 siempre entra**, cualquiera sea el monto.
- Un nivel cuyo piso quedó por encima del total nace `SKIPPED`.
- Al cerrarse un nivel: si `total <= max_amount` de ese nivel, la nota se liquida ahí y los niveles superiores
  pasan a `SKIPPED`. Si no, se abre el siguiente. **El flujo solo sube o se detiene, nunca baja.**
- Escalera de referencia del mockup: `0 / 500 / 2.000 / 5.000` Bs para Analista CX, Gerente CX,
  Gerente Comercial y Gerente General.

### 3.2 Políticas de firma

| `approval_policy` | Firmas necesarias |
|---|---|
| `ANY` | 1 |
| `ALL` | tantas como aprobadores tenga el rol (mínimo 1) |
| `QUORUM` | `required_approvals`, topeado por la cantidad de aprobadores (mínimo 1) |

`required_approvals` solo tiene sentido con `QUORUM`. Una misma persona **no puede firmar dos veces el mismo
nivel del mismo intento**: se comprueba contra las acciones `APPROVE` ya registradas. Mientras faltan firmas,
el nivel sigue `IN_PROGRESS` y solo se acumula la acción.

### 3.3 Rechazo (`on_reject`)

| Valor | Efecto |
|---|---|
| `TERMINATE` | instancia `REJECTED`, `current_level_order = NULL`, nota `REJECTED`. Reabrirla exige `REACTIVATE`. |
| `RETURN_PREVIOUS` | vuelve al nivel anterior, que se reabre `IN_PROGRESS`. La instancia sigue `IN_APPROVAL`. |
| `RETURN_INITIATOR` | la instancia pasa a `EDITING` y la nota vuelve al vendedor, que corrige y reenvía. |

El destino **nunca lo elige quien rechaza**: se lee del nivel activo, con `TERMINATE` por defecto.
`RETURN_PREVIOUS` en el nivel 1 es inválido: no hay nivel anterior. Configuración de referencia del mockup:
nivel 1 `RETURN_INITIATOR`, niveles 2-4 `TERMINATE`.

### 3.4 Plazo (SLA)

`sla_hours` es por nivel y queda congelado en el snapshot. El vencimiento es
`started_at + sla_hours` horas; `sla_hours` nulo o `started_at` nulo significa sin plazo. Un nivel abierto y
vencido no cambia ningún estado persistido: es una **derivación de lectura** que la bandeja muestra como
demorada. Referencia del mockup: 24 h en el nivel 1, sin plazo en el 2, 48 h en el 3 y 72 h en el 4.

### 3.5 Selección de ítems y disociación

Solo el nivel con `decision_mode = 'ITEM_SELECTION'` muestra casillas, y el DDL lo reserva para el
**nivel 1 del primer intento**. Ahí el analista marca cada línea como `SELECTED` o `DISSOCIATED`:

- **Selección total:** no pasa nada más, la nota sigue con su total intacto.
- **Selección parcial:** las líneas excluidas pasan a `line_status = 'DISSOCIATED'`, la original recalcula su
  total y nace una **nota disociada** con el mismo `note_number`, `split_sequence` incrementado,
  `source_refund_order_id` apuntando a la original y `document_type = 'DISSOCIATED'`. La disociada arranca en
  una instancia propia en `EDITING`: el vendedor la corrige y la reenvía. La acción `DISSOCIATED_CREATED`
  es la **fila puente**: vive en la instancia de la original y apunta a la disociada con
  `amount_before` / `amount_after`.

De ahí en adelante nadie vuelve a ver casillas: los niveles superiores y todos los intentos posteriores son
`DOCUMENT_DECISION` — se aprueba o se rechaza el documento completo.

### 3.6 Reintentos

Una nota `REJECTED` se reactiva con `POST /refunds/:id/reactivate`: se crea una **instancia nueva** con
`attempt + 1` y `reactivated_from_instance_id` apuntando a la anterior, que queda intacta como evidencia.
La escalera se vuelve a leer de la configuración vigente, así que el intento nuevo puede tener niveles
distintos. `ANNULLED` y `APPROVED` son terminales: no se reactivan.

### 3.7 Corrección del vendedor

Con la instancia en `EDITING` el vendedor solo puede **bajar cantidades**: el CHECK de la tabla exige
`0 <= quantity <= source_quantity`, y `price_unit` queda congelado. No puede agregar ni quitar productos.
Al reenviar (`SELLER_RESUBMITTED`) la escalera se recalcula con el total nuevo: recortar la nota puede hacer
que necesite menos niveles. La corrección se admite **una sola vez por nota**, y el contador es
`refund_orders.edit_count`.

### 3.8 Elegibilidad (alta desde Ventas)

Nada vuelve si no se vendió. La ventana es de **90 días** de facturación y el disponible por producto es
`MAX(0, facturado - reclamado)`, donde lo reclamado suma las líneas `ACTIVE` de las notas del cliente que no
estén `REJECTED` ni `ANNULLED`. El histórico de facturación es del ERP/SAP: **no está en nuestras tablas**.

### 3.9 Estados derivados

`refund_orders.status` y `refund_workflow_instances.status` son lo único persistido. La bandeja muestra
además un **estado de workflow derivado**: `APROBADA`, `RECHAZADA`, `EN_EDICION` o `ESPERANDO_LVL{n}` según el
nivel abierto, más la marca de demora cuando el nivel venció su SLA. No hay que persistirlo.

## 4. Contrato propuesto

Todas las respuestas usan el envelope del proyecto: `{ "success": boolean, "code": number, "data": … }`.
Los errores devuelven `{ "success": false, "code": <http>, "error": { "code": "<SLUG>", "message": "…" } }`.
Los montos son `DECIMAL(12,2)` serializados como número.

---

# 48. Devoluciones: motor de aprobación

## 48.1 Consultar productos devolubles de un cliente

**Objetivo:** decirle a Ventas qué puede reclamar el cliente y hasta cuánto, antes de crear la nota.

```http
GET /refunds/returnable-products?clientId=777&excludeRefundOrderId=1004
```

### Parámetros

| Parámetro | Ubicación | Tipo | Oblig. | Regla |
|---|---|---|---|---|
| `clientId` | Query | number | Sí | Cliente dueño de la nota (`refund_orders.owner_id`) |
| `excludeRefundOrderId` | Query | number | No | Excluye del cálculo de reclamado la nota que se está corrigiendo |

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "windowDays": 90,
    "items": [
      {
        "productId": 900,
        "invoicedQuantity": 24,
        "claimedQuantity": 10,
        "availableQuantity": 14,
        "blockedReason": null,
        "invoices": [
          { "invoiceNumber": "F-004512", "invoiceSapDoc": "4500231", "quantity": 12, "invoicedAt": "2026-07-14" },
          { "invoiceNumber": "F-004890", "invoiceSapDoc": "4500377", "quantity": 12, "invoicedAt": "2026-08-02" }
        ]
      },
      {
        "productId": 901,
        "invoicedQuantity": 4,
        "claimedQuantity": 4,
        "availableQuantity": 0,
        "blockedReason": "ALREADY_RETURNED",
        "invoices": []
      }
    ]
  }
}
```

### Diccionario

| Campo | Tipo | Descripción |
|---|---|---|
| `windowDays` | number | Ventana de elegibilidad, hoy 90 días |
| `items[].invoicedQuantity` | number | Facturado al cliente dentro de la ventana, según ERP/SAP |
| `items[].claimedQuantity` | number | `SUM(quantity)` de las líneas `ACTIVE` de sus notas vigentes |
| `items[].availableQuantity` | number | `MAX(0, invoiced - claimed)` |
| `items[].blockedReason` | string \| null | `NOT_INVOICED`, `ALREADY_RETURNED` o `null` si hay disponible |
| `items[].invoices[]` | array | Facturas de origen; `invoiceSapDoc` es referencia lógica sin FK local |

### Reglas y errores

- `404 CLIENT_NOT_FOUND` si el cliente no existe.
- `502 ERP_UNAVAILABLE` si el histórico de facturación no responde: **sin ERP no hay elegibilidad**.
- Un cliente sin facturas en la ventana responde `200` con `items: []`.

Diagrama: `diagrams/dev_15_get_returnable_products.plantuml`.

## 48.2 Crear la nota (intake de Ventas)

**Objetivo:** registrar la nota y arrancar el workflow en un solo movimiento. **Logística no tiene formulario
de alta:** este endpoint es el contrato con Ventas.

```http
POST /refunds
```

### Request principal

```json
{
  "externalSalesId": "SALE-2001",
  "noteNumber": "DEV-2001",
  "distributorId": 10,
  "employeeId": 555,
  "ownerId": 777,
  "customerId": 661,
  "replacementDate": "2026-09-05",
  "justification": "Producto entregado con empaque dañado en la última visita.",
  "items": [
    {
      "productId": 900,
      "quantity": 5,
      "priceUnit": 60.00,
      "reason": "CONTAMINACION_FISICA",
      "notes": "Tres cajas con el film roto.",
      "sources": [
        { "invoiceNumber": "F-004512", "invoiceSapDoc": "4500231", "lot": "L-2291", "dueDate": "2026-11-30", "quantity": 5 }
      ],
      "photos": ["https://…/evidencia-1.jpg"]
    },
    { "productId": 901, "quantity": 2, "priceUnit": 250.00, "reason": "VENCIDO", "notes": "Vencido en góndola.", "sources": [], "photos": ["https://…/evidencia-2.jpg"] }
  ]
}
```

### Diccionario del request

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `externalSalesId` | string | Sí | Id de la nota en Ventas. Con `UNIQUE (external_sales_id, split_sequence)` es la llave de idempotencia del intake |
| `noteNumber` | string | Sí | Correlativo de Ventas. **No es único**: la original y sus disociadas lo comparten |
| `distributorId` | number | Sí | Distribuidora bajo la que se registra |
| `employeeId` | number | Sí | Vendedor que registra |
| `ownerId` / `customerId` | number | Sí | Cliente dueño / cliente facturado (ver la deriva del §1) |
| `replacementDate` | date | No | Reposición acordada con el cliente |
| `justification` | string | Sí | El motivo en palabras del vendedor, a nivel cabecera |
| `items[].quantity` | number | Sí | `> 0`; se copia también a `source_quantity` y ahí queda congelada |
| `items[].priceUnit` | number | Sí | Precio congelado al momento del reclamo |
| `items[].reason` | string | Sí | Motivo clasificado, **por línea** (distinto de `justification`) |
| `items[].reason` | — | — | FK a `refund_reasons`: un motivo fuera del catálogo se rechaza |
| `items[].sources[]` | array | Sí | Van a `refund_order_detail_sources`; la suma de `quantity` debe ser exactamente `items[].quantity` |
| `items[].photos[]` | array | Sí | Van a `refund_order_detail_photos`. Al menos una si el motivo declara `requires_photo` |
| `items[].lot` / `dueDate` | — | según motivo | `REQUIRED` exige el dato, `HIDDEN` lo descarta: lo dice `refund_reasons` |

### Response principal

```json
{
  "success": true,
  "code": 201,
  "data": {
    "refundOrderId": 2001,
    "noteNumber": "DEV-2001",
    "splitSequence": 0,
    "documentType": "ORIGINAL",
    "status": "OPEN",
    "total": 800.00,
    "workflowInstanceId": 90,
    "attempt": 1,
    "currentLevel": { "levelOrder": 1, "levelName": "Analista CX", "roleCode": "analista_cx", "decisionMode": "ITEM_SELECTION", "slaHours": 24 },
    "levels": [
      { "levelOrder": 1, "levelName": "Analista CX", "minAmount": 0.00, "maxAmount": 500.00, "status": "IN_PROGRESS" },
      { "levelOrder": 2, "levelName": "Gerente CX", "minAmount": 500.00, "maxAmount": 2000.00, "status": "PENDING" },
      { "levelOrder": 3, "levelName": "Gerente Comercial", "minAmount": 2000.00, "maxAmount": 5000.00, "status": "SKIPPED" },
      { "levelOrder": 4, "levelName": "Gerente General", "minAmount": 5000.00, "maxAmount": null, "status": "SKIPPED" }
    ]
  }
}
```

### Reglas y errores

- `total = SUM(quantity × price_unit)` de las líneas `ACTIVE`; el ICE no se suma y no hay descuento.
- `422 NO_ITEMS` sin líneas; `422 QUANTITY_NOT_ELIGIBLE` si supera el disponible del §48.1;
  `422 SOURCES_MISMATCH` si los orígenes no suman exactamente la cantidad de la línea;
  `422 REASON_REQUIRED` si falta el motivo de una línea.
- `409 NO_ACTIVE_LADDER` si no hay versión publicada en `refund_approval_levels`: sin escalera no se crea nada.
- Todo ocurre en **una transacción**: nota, líneas, instancia, snapshot de niveles y la acción `CREATED`.
- **Idempotente:** reintentar el mismo `externalSalesId` no crea otra nota — el UNIQUE lo rechaza y el
  servicio responde `200` con la nota ya creada.
- `422 REASON_NOT_FOUND` si el motivo no está en el catálogo o está inactivo; `422 EVIDENCE_REQUIRED` si falta
  la foto, el lote o el vencimiento que el motivo exige.

Diagrama: `diagrams/dev_01_post_create_refund_order.plantuml`.

## 48.3 Bandeja de notas

**Objetivo:** una página de notas con el nivel en curso y el plazo, filtrable por el alcance del rol.

```http
GET /refunds?distributorId=10&employeeId=555&status=OPEN&workflowState=ESPERANDO_LVL1
    &from=2026-08-17&to=2026-08-31&search=Ferreter%C3%ADa&documentType=ORIGINAL
    &awaitingEmployeeCode=57&page=1&pageSize=20
```

### Parámetros

| Parámetro | Tipo | Oblig. | Regla |
|---|---|---|---|
| `distributorId` | number | Sí | Filtro exacto |
| `employeeId` | number | No | Vendedor que registró. **Forzado** al del usuario para los roles de venta |
| `status` | string | No | `OPEN`, `APPROVED`, `REJECTED`, `ANNULLED` |
| `workflowState` | string | No | Derivado: `APROBADA`, `RECHAZADA`, `EN_EDICION`, `ESPERANDO_LVL{n}` |
| `documentType` | string | No | `ORIGINAL` o `DISSOCIATED` |
| `from` / `to` | date | No | Inclusivos sobre `created_at`; por defecto los últimos 14 días |
| `search` | string | No | Nombre del cliente y `note_number` |
| `awaitingEmployeeCode` | number | No | "Esperando mi firma": ver la regla abajo |
| `page` / `pageSize` | number | No | 1 y 20 por defecto; `pageSize` máximo 100 |

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "items": [
      {
        "refundOrderId": 1001,
        "noteNumber": "DEV-1001",
        "splitSequence": 0,
        "documentType": "ORIGINAL",
        "status": "OPEN",
        "workflowState": "ESPERANDO_LVL2",
        "total": 600.00,
        "clientName": "Ferretería El Tornillo",
        "sellerName": "Rocío Justiniano",
        "distributorName": "Centro Santa Cruz",
        "attempt": 1,
        "currentLevel": {
          "levelOrder": 2,
          "levelName": "Gerente CX",
          "roleCode": "gerente_cx",
          "position": "2 de 4",
          "approvalPolicy": "ANY",
          "signaturesNeeded": 1,
          "signaturesReceived": 0,
          "slaHours": null,
          "startedAt": "2026-08-30T14:05:00Z",
          "dueAt": null,
          "overdue": false
        },
        "createdAt": "2026-08-29T11:20:00Z"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### Reglas y errores

- Orden estable: `created_at DESC, id DESC`.
- `awaitingEmployeeCode` deja solo las notas donde ese empleado **pertenece al rol del nivel abierto y
  todavía no firmó**. Quien ya firmó un quórum desaparece de su propia bandeja. Es un filtro del mismo
  recurso, no un endpoint aparte.
- Un rol de venta que pida `employeeId` de otro recibe su propio alcance, sin error.
- `overdue` y `workflowState` se derivan en lectura; no hay columna que los guarde.
- Página vacía: `200` con `items: []`.

Diagrama: `diagrams/dev_02_get_refunds_list.plantuml`.

## 48.4 Detalle de la nota

**Objetivo:** todo lo que la pantalla de decisión necesita, en una sola llamada.

```http
GET /refunds/1001
```

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "refundOrderId": 1001,
    "noteNumber": "DEV-1001",
    "splitSequence": 0,
    "documentType": "ORIGINAL",
    "status": "OPEN",
    "total": 600.00,
    "justification": "Producto entregado con empaque dañado.",
    "replacementDate": "2026-09-05",
    "client": { "ownerId": 777, "customerId": 661, "name": "Ferretería El Tornillo", "nit": "3412907016", "channel": "TRADICIONAL" },
    "items": [
      {
        "detailId": 4001, "productId": 900, "productName": "Aceite 900 ml",
        "sourceQuantity": 10, "quantity": 10, "priceUnit": 60.00, "lineTotal": 600.00,
        "lineStatus": "ACTIVE", "reason": "CONTAMINACION_FISICA", "notes": "Film roto.",
        "sources": [{ "invoiceNumber": "F-004512", "invoiceSapDoc": "4500231", "lot": "L-2291", "dueDate": "2026-11-30", "quantity": 10 }],
        "photos": [{ "photoId": 8801, "url": "https://…/evidencia-1.jpg", "sortOrder": 1 }],
        "reasonLabel": "Contaminación física",
        "lotRequirement": "REQUIRED",
        "dueDateRequirement": "REQUIRED",
        "level1Decision": "SELECTED"
      },
      {
        "detailId": 4002, "productId": 901, "productName": "Detergente 2 kg",
        "sourceQuantity": 4, "quantity": 4, "priceUnit": 100.00, "lineTotal": 400.00,
        "lineStatus": "DISSOCIATED", "reason": "VENCIDO", "notes": null,
        "sources": [], "photos": [], "level1Decision": "DISSOCIATED",
        "movedToRefundOrderId": 1004
      }
    ],
    "family": {
      "sourceRefundOrderId": null,
      "dissociated": [{ "refundOrderId": 1004, "splitSequence": 1, "status": "OPEN", "total": 400.00 }]
    },
    "currentInstance": {
      "workflowInstanceId": 55, "attempt": 1, "status": "IN_APPROVAL", "currentLevelOrder": 1,
      "reactivatedFromInstanceId": null,
      "levels": [
        {
          "levelId": 210, "levelOrder": 1, "levelName": "Analista CX", "roleCode": "analista_cx",
          "minAmount": 0.00, "maxAmount": 500.00, "decisionMode": "ITEM_SELECTION", "status": "IN_PROGRESS",
          "approvalPolicy": "ANY", "requiredApprovals": 1, "onReject": "RETURN_INITIATOR", "slaHours": 24,
          "firstViewedAt": "2026-08-29T12:00:00Z", "firstViewedBy": "57",
          "startedAt": "2026-08-29T11:20:00Z", "finishedAt": null,
          "signaturesNeeded": 1, "signaturesReceived": 0, "dueAt": "2026-08-30T11:20:00Z", "overdue": false
        }
      ]
    },
    "previousInstances": [],
    "permissions": { "canDecide": true, "showItemCheckboxes": true, "canEditItems": false, "canResubmit": false, "canReactivate": false, "canCancel": true }
  }
}
```

### Reglas y errores

- `404 REFUND_ORDER_NOT_FOUND` también cuando un rol "solo mis documentos" pide la nota de otro vendedor:
  **no se revela la existencia** del documento con un 403.
- `items[]` trae las líneas `ACTIVE` y las `DISSOCIATED`; estas últimas con `movedToRefundOrderId`, que sale
  de la fila puente `DISSOCIATED_CREATED`.
- `showItemCheckboxes` es `true` solo si el nivel abierto tiene `decision_mode = 'ITEM_SELECTION'`.
- `client`, `productName` y `invoiceSapDoc` **no están en nuestras tablas**: los resuelve Ventas/SAP.
- `previousInstances[]` trae los intentos anteriores completos: son la evidencia del rechazo previo.

Diagrama: `diagrams/dev_03_get_refund_order_detail.plantuml`.

## 48.5 Sellar la primera apertura del nivel

**Objetivo:** dejar registrado quién y cuándo abrió el nivel por primera vez, para medir el plazo real.

```http
POST /refunds/2001/levels/current/view
```

Sin body. Response: `{ "firstViewedAt": "2026-08-30T14:12:00Z", "firstViewedBy": "72" }`.

### Reglas y errores

- **Idempotente:** si `first_viewed_at` ya estaba sellado responde `200` sin escribir.
- `403 NOT_LEVEL_APPROVER` si el actor no pertenece al rol del nivel: que un tercero mire el detalle no sella
  nada.
- `409 NO_OPEN_LEVEL` si la instancia no tiene nivel `IN_PROGRESS`.
- No mueve el SLA: el plazo se cuenta desde `started_at`, no desde la primera apertura.

Diagrama: `diagrams/dev_04_post_register_level_view.plantuml`.

## 48.6 Selección de ítems del nivel 1 (y disociación)

**Objetivo:** decidir qué líneas siguen en la nota y separar el resto en una nota disociada.

```http
POST /refunds/1001/levels/1/item-selection
```

### Request principal

```json
{
  "items": [
    { "detailId": 4001, "decision": "SELECTED" },
    { "detailId": 4002, "decision": "DISSOCIATED" }
  ],
  "comment": "El detergente vencido va por separado, falta la factura de origen."
}
```

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "refundOrderId": 1001,
    "total": 600.00,
    "amountBefore": 1000.00,
    "amountAfter": 600.00,
    "dissociatedOrder": { "refundOrderId": 1004, "splitSequence": 1, "total": 400.00, "instanceStatus": "EDITING" },
    "workflowActionId": 601,
    "itemSelectionClosed": true
  }
}
```

### Reglas y errores

- `409 SELECTION_NOT_ALLOWED` si el nivel abierto no es `ITEM_SELECTION`: **la selección ocurre una sola vez**,
  en el nivel 1 del primer intento.
- `422 INCOMPLETE_SELECTION` si la selección no cubre todas las líneas `ACTIVE`.
- `422 EMPTY_SELECTION` si no queda ninguna línea `SELECTED`: para no dejar nada hay que rechazar, no disociar
  todo.
- `403 NOT_LEVEL_APPROVER` si el actor no pertenece al rol del nivel.
- Selección total: no nace ninguna disociada y `dissociatedOrder` es `null`.
- Todo en una transacción: decisiones, `line_status`, totales, la nota nueva, su instancia en `EDITING` y la
  fila puente `DISSOCIATED_CREATED` con `amount_before` / `amount_after`.
- Este endpoint **no aprueba el nivel**: registra la selección. La firma va por §48.7.

Diagrama: `diagrams/dev_05_post_level1_item_selection.plantuml`.

## 48.7 Aprobar el nivel activo

```http
POST /refunds/2001/levels/current/approve
```

### Request principal

```json
{ "comment": "Evidencia fotográfica correcta, corresponde nota de crédito." }
```

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "refundOrderId": 2001,
    "orderStatus": "OPEN",
    "instanceStatus": "IN_APPROVAL",
    "levelClosed": true,
    "signaturesReceived": 1,
    "signaturesNeeded": 1,
    "currentLevel": { "levelOrder": 2, "levelName": "Gerente CX", "roleCode": "gerente_cx", "slaHours": null },
    "skippedLevels": [3, 4],
    "settledHere": false,
    "workflowActionId": 502
  }
}
```

### Reglas y errores

- `409 ORDER_NOT_OPEN` si la nota no está `OPEN` o la instancia no está `IN_APPROVAL`.
- `403 NOT_LEVEL_APPROVER` si el actor no pertenece al rol del nivel activo.
- `409 ALREADY_SIGNED` si ese empleado ya firmó este nivel en este intento.
- `409 ITEM_SELECTION_PENDING` si el nivel es `ITEM_SELECTION` y todavía no se registró la selección.
- Con la política **no** satisfecha: se registra el `APPROVE` y el nivel sigue `IN_PROGRESS`
  (`levelClosed: false`).
- Con la política satisfecha: el nivel cierra `APPROVED` y se resuelve el destino por banda —
  `total <= max_amount` liquida acá (`settledHere: true`, niveles superiores `SKIPPED`, instancia `APPROVED`,
  nota `APPROVED`, acción `CLOSED`), si no se abre el siguiente y se registra `AUTO_ROUTED`.
- Al cerrar la nota se escriben `approved_total`, `rejected_total` y `settlement_type`
  (`NOTA_CREDITO` o `CAMBIO_STOCK`): antes el resultado comercial no quedaba en ninguna parte.
- El flujo **solo sube o se detiene**: aprobar nunca devuelve la nota a un nivel anterior.

Diagrama: `diagrams/dev_06_post_approve_level.plantuml`.

## 48.8 Rechazar el nivel activo

```http
POST /refunds/2001/levels/current/reject
```

### Request principal

```json
{ "reason": "La factura de origen no corresponde al cliente.", "comment": "Adjuntar la nota de entrega firmada." }
```

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "refundOrderId": 2001,
    "orderStatus": "REJECTED",
    "instanceStatus": "REJECTED",
    "onReject": "TERMINATE",
    "currentLevelOrder": null,
    "workflowActionId": 504
  }
}
```

### Reglas y errores

- `422 REASON_REQUIRED`: en `REJECT` el motivo es obligatorio, el comentario no.
- `403 NOT_LEVEL_APPROVER`, `409 ORDER_NOT_OPEN` igual que en la aprobación.
- El destino sale del nivel, **nunca del payload**: `TERMINATE` cierra la nota `REJECTED`;
  `RETURN_PREVIOUS` reabre el nivel anterior y la instancia sigue `IN_APPROVAL`; `RETURN_INITIATOR` deja la
  instancia en `EDITING` y devuelve la nota al vendedor.
- Un rechazo `TERMINATE` **no borra nada**: la nota se reabre solo con `REACTIVATE`, que crea otro intento.

Diagrama: `diagrams/dev_07_post_reject_level.plantuml`.

## 48.9 Corregir las líneas (vendedor)

```http
PUT /refunds/1004/items
```

### Request principal

```json
{
  "items": [{ "detailId": 4010, "quantity": 2, "notes": "Solo dos unidades tienen el lote observado." }],
  "justification": "Se ajusta la cantidad tras revisar el lote con el cliente."
}
```

### Response principal

```json
{ "success": true, "code": 200, "data": { "refundOrderId": 1004, "total": 200.00, "amountBefore": 400.00, "amountAfter": 200.00 } }
```

### Reglas y errores

- `409 NOT_EDITABLE` si la instancia no está `EDITING`: una nota en aprobación no se edita.
- `403 NOT_ORDER_OWNER` si el actor no es el vendedor dueño de la nota.
- `422 QUANTITY_ABOVE_SOURCE` si `quantity > source_quantity` — es el CHECK de la tabla.
- `422 EMPTY_NOTE` si todas las líneas quedan en 0: para dejarla sin nada se anula.
- **Solo baja cantidades.** No se agregan ni se quitan productos, y `price_unit` no se toca.
- La edición **no genera acción de workflow**: el movimiento del monto se registra al reenviar.
- `409 EDIT_LIMIT_REACHED` si `edit_count >= 1`: el tope es **una sola corrección por nota**. El contador
  vive en `refund_orders.edit_count` y se incrementa en este endpoint.
- Al recortar la línea hay que recortar sus `refund_order_detail_sources`: la suma tiene que seguir dando
  `quantity`.

Diagrama: `diagrams/dev_09_put_seller_edit_items.plantuml`.

## 48.10 Reenviar a aprobación (vendedor)

```http
POST /refunds/1004/resubmit
```

Request: `{ "comment": "Corregido según lo observado." }`

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "refundOrderId": 1004,
    "instanceStatus": "IN_APPROVAL",
    "total": 200.00,
    "currentLevel": { "levelOrder": 1, "levelName": "Analista CX", "roleCode": "analista_cx", "decisionMode": "DOCUMENT_DECISION" },
    "workflowActionId": 604
  }
}
```

### Reglas y errores

- `409 NOT_EDITABLE` si la instancia no está `EDITING`; `403 NOT_ORDER_OWNER`; `422 EMPTY_NOTE` con total 0.
- La escalera **se recalcula con el total nuevo**: recortar la nota puede eliminar niveles.
- El nivel 1 del reenvío es `DOCUMENT_DECISION`: **nunca vuelve a haber casillas**.
- La acción `SELLER_RESUBMITTED` lleva `previous_status = 'EDITING'`, `new_status = 'IN_APPROVAL'` y el
  movimiento `amount_before` / `amount_after`.

Diagrama: `diagrams/dev_10_post_seller_resubmit.plantuml`.

## 48.11 Reactivar (nuevo intento)

```http
POST /refunds/2001/reactivate
```

Request: `{ "reason": "El cliente presentó la factura faltante." }`

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "refundOrderId": 2001,
    "orderStatus": "OPEN",
    "workflowInstanceId": 91,
    "attempt": 2,
    "reactivatedFromInstanceId": 90,
    "currentLevel": { "levelOrder": 1, "levelName": "Analista CX", "decisionMode": "DOCUMENT_DECISION" }
  }
}
```

### Reglas y errores

- `409 NOT_REACTIVABLE` si la nota no está `REJECTED`: `APPROVED` y `ANNULLED` son terminales.
- `422 REASON_REQUIRED`; `403 NOT_ALLOWED_ROLE` si el actor no tiene rol de supervisión.
- El intento anterior **no se modifica**: queda `REJECTED` como evidencia y se referencia con
  `reactivated_from_instance_id`.
- La escalera se relee de la configuración vigente: el intento nuevo puede tener otros niveles.
- Todos los niveles del intento nuevo son `DOCUMENT_DECISION`.

Diagrama: `diagrams/dev_08_post_reactivate_refund_order.plantuml`.

## 48.12 Anular la nota

```http
POST /refunds/2001/cancel
```

Request: `{ "reason": "El cliente retiró el reclamo." }`

Response: `{ "orderStatus": "ANNULLED", "instanceStatus": "CANCELLED", "skippedLevels": [2, 3, 4] }`

### Reglas y errores

- `409 NOT_CANCELLABLE` si la nota no está `OPEN`.
- `422 REASON_REQUIRED`; `403 NOT_ALLOWED` si el actor no es el vendedor dueño ni tiene rol de supervisión.
- Los niveles abiertos y pendientes pasan a `SKIPPED`; la instancia cierra `CANCELLED` y la nota `ANNULLED`.
- `ANNULLED` es **terminal**: no hay reactivación. Las disociadas que ya salieron de ella siguen su curso.

Diagrama: `diagrams/dev_11_post_cancel_refund_order.plantuml`.

## 48.13 Comentar sin decidir

```http
POST /refunds/2001/comments
```

Request: `{ "comment": "Pedí al vendedor la nota de entrega firmada." }`

### Reglas y errores

- `422 EMPTY_COMMENT`; `409 NO_WORKFLOW_INSTANCE`; `403 NOT_A_PARTICIPANT` si el actor no es el vendedor dueño
  ni pertenece al rol de algún nivel del intento.
- **No consume la firma** del nivel ni cambia ningún estado.
- `'COMMENT'` ya está en el CHECK de `action`, y el CHECK de `reason` no lo alcanza: el motivo solo es
  obligatorio en `REJECT`, `REACTIVATE` y `CANCEL`.

Diagrama: `diagrams/dev_16_post_refund_comment.plantuml`.

## 48.14 Historial de la nota

```http
GET /refunds/1001/history
```

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "attempts": [
      {
        "workflowInstanceId": 55,
        "attempt": 1,
        "status": "APPROVED",
        "reactivatedFromInstanceId": null,
        "startedAt": "2026-08-29T11:20:00Z",
        "finishedAt": "2026-08-29T16:40:00Z",
        "actions": [
          { "actionId": 600, "action": "CREATED", "levelName": null, "actorEmployeeCode": 555, "actorRoleCode": "vendedor", "systemSummary": "Nota registrada por Bs 1.000,00.", "comment": null, "reason": null, "previousStatus": null, "newStatus": "IN_APPROVAL", "amountBefore": null, "amountAfter": 1000.00, "createdAt": "2026-08-29T11:20:00Z" },
          { "actionId": 601, "action": "LEVEL1_ITEM_SELECTION", "levelName": "Analista CX", "actorEmployeeCode": 57, "actorRoleCode": "analista_cx", "systemSummary": "Se seleccionó 1 de 2 ítems.", "decisions": [{ "detailId": 4001, "decision": "SELECTED" }, { "detailId": 4002, "decision": "DISSOCIATED" }], "createdAt": "2026-08-29T12:05:00Z" },
          { "actionId": 602, "action": "DISSOCIATED_CREATED", "levelName": null, "relatedRefundOrderId": 1004, "systemSummary": "Se disoció 1 ítem por Bs 400,00.", "amountBefore": 1000.00, "amountAfter": 600.00, "createdAt": "2026-08-29T12:05:00Z" },
          { "actionId": 603, "action": "APPROVE", "levelName": "Analista CX", "actorEmployeeCode": 57, "previousStatus": "IN_APPROVAL", "newStatus": "APPROVED", "createdAt": "2026-08-29T16:40:00Z" }
        ]
      }
    ]
  }
}
```

### Reglas y errores

- Se agrupa **por intento** (`attempt ASC`) y dentro de cada uno por `created_at, id`. El DDL tiene `at`
  comentado: el orden sale de `created_at`.
- `levelName` es `NULL` en `CREATED`, `DISSOCIATED_CREATED`, `REACTIVATE`, `SELLER_RESUBMITTED` y `CANCEL`:
  son acciones que no pertenecen a un nivel.
- La frase visible es `system_summary` (autogenerada) + `comment` (del revisor) + `reason` (obligatorio en
  `REJECT`, `REACTIVATE` y `CANCEL`).
- La fila puente se lee en los dos sentidos: desde la original con `related_refund_order_id`, y desde la
  disociada buscando `related_refund_order_id = :id AND action = 'DISSOCIATED_CREATED'`.

Diagrama: `diagrams/dev_12_get_refund_history.plantuml`.

## 48.15 Aprobadores del nivel

```http
GET /refunds/2001/approvers?roleCode=gerente_cx
```

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "levelOrder": 2,
    "roleCode": "gerente_cx",
    "approvalPolicy": "QUORUM",
    "requiredApprovals": 2,
    "signaturesNeeded": 2,
    "signaturesReceived": 1,
    "approvers": [
      { "employeeCode": 72, "employeeName": "Daniel Durán Melgar", "hasActed": true, "actedAt": "2026-08-30T15:10:00Z" },
      { "employeeCode": 94, "employeeName": "Rocío Justiniano Áñez", "hasActed": false, "actedAt": null }
    ]
  }
}
```

### Reglas y errores

- Nuestras tablas guardan **solo `role_code`**: la lista de personas es del directorio externo y **no se
  persiste**, así que puede cambiar entre dos consultas.
- `signaturesNeeded`: `ANY` → 1; `ALL` → cantidad de aprobadores; `QUORUM` → `required_approvals` topeado por
  la cantidad de aprobadores.
- `502 ROLE_DIRECTORY_UNAVAILABLE` si el directorio no responde.
- `hasActed` sale de las acciones `APPROVE` del nivel, no de una columna.

Diagrama: `diagrams/dev_14_get_role_directory_approvers.plantuml`.

## 48.16 Configuración de la escalera

```http
GET  /refund-approval-levels
POST /refund-approval-levels
```

### Request de publicación

```json
{
  "levels": [
    { "levelOrder": 1, "name": "Analista CX", "roleCode": "analista_cx", "activationMinAmount": 0.00, "approvalPolicy": "ANY", "requiredApprovals": 1, "onReject": "RETURN_INITIATOR", "slaHours": 24 },
    { "levelOrder": 2, "name": "Gerente CX", "roleCode": "gerente_cx", "activationMinAmount": 500.00, "approvalPolicy": "ANY", "requiredApprovals": 1, "onReject": "TERMINATE", "slaHours": null },
    { "levelOrder": 3, "name": "Gerente Comercial", "roleCode": "gerente_comercial", "activationMinAmount": 2000.00, "approvalPolicy": "QUORUM", "requiredApprovals": 2, "onReject": "TERMINATE", "slaHours": 48 },
    { "levelOrder": 4, "name": "Gerente General", "roleCode": "gerente_general", "activationMinAmount": 5000.00, "approvalPolicy": "ALL", "requiredApprovals": 1, "onReject": "TERMINATE", "slaHours": 72 }
  ]
}
```

### Response del GET

```json
{
  "success": true,
  "code": 200,
  "data": {
    "workflowVersionId": 7,
    "levels": [
      { "id": 41, "levelOrder": 1, "name": "Analista CX", "roleCode": "analista_cx", "activationMinAmount": 0.00, "ceilingAmount": 500.00, "band": "Hasta Bs 500", "approvalPolicy": "ANY", "requiredApprovals": 1, "onReject": "RETURN_INITIATOR", "slaHours": 24, "isActive": true }
    ]
  }
}
```

### Reglas y errores

- `403 NOT_WORKFLOW_ADMIN`: publicar es privilegio de administración (`gerente_general`), no de aprobación.
- `422` si el primer nivel no tiene `activationMinAmount = 0`; si los pisos no son estrictamente crecientes;
  si un nivel apunta a un rol sin empleados; si `QUORUM` pide más firmas que aprobadores o menos de 1;
  si una política distinta de `QUORUM` trae `requiredApprovals` distinto de 1; si `onReject` sale del
  catálogo; o si el nivel 1 declara `RETURN_PREVIOUS`, que no tiene anterior.
- Publicar **archiva** la versión previa (`is_active = FALSE`) e inserta las filas nuevas con un
  `workflow_version_id` nuevo. No se borra nada.
- Las instancias en curso **no se ven afectadas**: ya congelaron su snapshot en
  `refund_workflow_instance_levels`.
- El techo (`ceilingAmount`) es derivado: es el `activationMinAmount` del nivel siguiente, y `null` en el
  último.

Diagrama: `diagrams/dev_13_refund_approval_levels_config.plantuml`.

---

## 5. Lo que se agregó al DDL

El flujo pedía siete cosas que el esquema no tenía. Se agregaron el 31/08/2026 en `db_script.sql`:

| Necesidad | Cómo quedó |
|---|---|
| **Fotos de evidencia** por línea | tabla nueva `refund_order_detail_photos` (`storage_key` con UNIQUE, `url`, `content_type`, `size_bytes`, `sort_order`, `taken_at`, `uploaded_by`) |
| **Orígenes de la línea** (factura, doc SAP, lote, vencimiento, cantidad) | tabla nueva `refund_order_detail_sources`, con `CHECK quantity > 0` y CHECK de que el origen esté identificado por factura o lote |
| **Motivo con catálogo cerrado** | tabla nueva `refund_reasons` + FK desde `refund_order_details.reason`, que además pasó a `NOT NULL`. El catálogo declara `lot_requirement`, `due_date_requirement`, `requires_photo` y `requires_notes` |
| **Idempotencia con Ventas** | `refund_orders.external_sales_id NOT NULL` + `UNIQUE (external_sales_id, split_sequence)` |
| **Contador de correcciones** | `refund_orders.edit_count SMALLINT NOT NULL DEFAULT 0`; el tope de negocio (1) lo aplica el servicio |
| **Liquidación y totales del cierre** | `refund_orders.settlement_type` (`NOTA_CREDITO` / `CAMBIO_STOCK`), `approved_total` y `rejected_total`, todos NULL hasta que la instancia cierra |
| **`action = 'COMMENT'`** | agregado al catálogo, junto con `RETURNED_PREVIOUS` para el rechazo que devuelve al nivel anterior |

Y tres arreglos de coherencia que salieron al escribir esto:

1. `refund_workflow_instance_levels` no congelaba la política de firma: se le agregaron `approval_policy`,
   `required_approvals`, `on_reject` y `sla_hours`. Sin eso, republicar la escalera cambiaba las reglas de las
   notas en curso — justo lo que el snapshot existe para evitar.
2. `max_amount` era `NOT NULL`, y el último nivel no tiene techo: pasó a admitir `NULL`.
3. Se declararon los CHECK de catálogo, los UNIQUE y los índices del §2.

**Sin ejecutar.** No hay Postgres ni Docker en este entorno, así que el script se revisó de forma estática
(balance de paréntesis y de comillas, y coherencia de los ejemplos contra los CHECK nuevos), no corriéndolo.
Conviene pasarlo por una base limpia antes de darlo por bueno.

Queda pendiente una decisión de negocio: `owner_id` frente a `customer_id` (§1).

### Divergencias entre el mockup y el DDL

Al implementar, **manda el DDL**. Las tres diferencias a resolver antes de codificar:

1. **Quién decide ítems.** El mockup deja decidir ítem por ítem en *todos* los niveles, con estados
   `APPROVED` / `REJECTED` / `PENDING` y cantidad aprobada parcial. El DDL admite una única selección binaria
   (`SELECTED` / `DISSOCIATED`) y solo en el nivel `ITEM_SELECTION`. Este documento sigue al DDL y al
   excalidraw del motor.
2. **Nombres del agregado.** El mockup todavía usa el vocabulario `Return*` y una máquina de estados propia
   (`PROCESANDO`, `REVERTIDO`, `DISOCIADO`, `EDITADO`…). El modelo objetivo es `RefundOrder*` con
   `OPEN / APPROVED / REJECTED / ANNULLED` más los estados derivados del §3.9.
3. **Plantillas versionadas.** El mockup tiene un motor genérico con `WorkflowDefinition` / `WorkflowVersion` /
   `WorkflowInstance` y varios `targetType`. El DDL no: la escalera es configuración plana leída directo y el
   runtime cuelga del propio `refund_order_id`.

## 6. Máquina de estados

### La nota (`refund_orders.status`)

```
            ┌──────────── REACTIVATE ────────────┐
            v                                    │
  (alta) → OPEN ──── aprueba el último nivel ──> APPROVED   (terminal)
            │ ├──── REJECT con TERMINATE ──────> REJECTED ──┘
            │ └──── CANCEL ───────────────────> ANNULLED   (terminal)
```

### El intento (`refund_workflow_instances.status`)

```
  EDITING ──SELLER_RESUBMITTED──> IN_APPROVAL ──todos los niveles firmados──> APPROVED
     ^                                │
     └──── REJECT / RETURN_INITIATOR ─┤
                                      ├── REJECT / TERMINATE ──> REJECTED
                                      └── CANCEL ─────────────> CANCELLED
```

`RETURN_PREVIOUS` no cambia el estado de la instancia: sigue `IN_APPROVAL` y solo retrocede
`current_level_order`.

### El nivel (`refund_workflow_instance_levels.status`)

`PENDING` → `IN_PROGRESS` → `APPROVED` | `REJECTED`, o directo a `SKIPPED` cuando el monto no lo alcanza o la
nota se liquidó antes.

## 7. Transacciones obligatorias

| Endpoint | Todo o nada |
|---|---|
| §48.2 crear | nota + líneas + instancia + snapshot de niveles + acción `CREATED` |
| §48.6 selección | decisiones + `line_status` + total de la original + nota disociada + sus líneas + su instancia + fila puente |
| §48.7 aprobar | acción `APPROVE` + cierre del nivel + apertura del siguiente o cierre de instancia y nota + `SKIPPED` |
| §48.8 rechazar | acción `REJECT` + cierre del nivel + destino según `on_reject` |
| §48.10 reenviar | snapshot de niveles del reenvío + estado de la instancia + acción `SELLER_RESUBMITTED` |
| §48.11 reactivar | instancia nueva + snapshot + estado de la nota + acción `REACTIVATE` |
| §48.12 anular | `SKIPPED` de los niveles abiertos + cierre de instancia + estado de la nota + acción `CANCEL` |
| §48.16 publicar | archivado de la versión previa + inserción de la versión nueva |

Los `GET` no escriben nada. La única excepción es §48.5, que sella `first_viewed_at` una sola vez y por eso es
un `POST`.
