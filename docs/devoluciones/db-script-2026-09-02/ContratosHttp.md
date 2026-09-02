# Devoluciones: contratos HTTP vigentes

## Conclusión

`CONTRATO` Esta versión define exactamente dos endpoints: consulta de motivos y creación de una
devolución original desde Sales. No adopta como vigentes las operaciones propuestas por los
documentos históricos. El alcance y las reglas de aplicación están fijados en
[Decisiones.md](./Decisiones.md).

Fuente persistida: [`db_script.sql:L915-L1172`](../../../db_script.sql#L915-L1172), fotografía del
worktree del `2026-09-02`, basada en `HEAD`
`dd4b92db5509efd2b3800235a665fad90139cf27`, SHA-256
`2c62523505a864bc84c44db70d5f195f74a9b1b99f626399efcce1f41437f185`.

## Alcance

| Grupo | Estado |
|---|---|
| Consulta de motivos | `CONTRATO` Vigente. |
| Creación de devolución original | `CONTRATO` Vigente. |
| Consulta previa de productos | Descartada por decisión explícita. |
| Demás operaciones de documentos anteriores | Históricas y fuera de este work unit. |

## `GET /api/v1/refund-reasons`

`CONTRATO` Sales consume este endpoint para obtener el catálogo seleccionable al construir cada
item de la devolución.

### Request

```http
GET /api/v1/refund-reasons
```

- No acepta filtros.
- No pagina.
- No implica endpoints adicionales de creación, edición, activación o eliminación del catálogo.

### Lectura

`DDL` La fuente es `refund_reasons`
([`db_script.sql:L916-L930`](../../../db_script.sql#L916-L930)).

`APLICACIÓN` La consulta equivalente es:

```sql
SELECT id, name, description, lot_requirement
FROM refund_reasons
WHERE is_active = TRUE
  AND deleted_at IS NULL
ORDER BY name, id;
```

El orden estable por `name` y luego `id` es una decisión de aplicación; no existe un índice ni una
regla de orden persistida que lo sustituya.

### Respuesta 200

```json
[
  {
    "id": 1,
    "name": "Producto vencido",
    "description": "Producto con fecha de vencimiento cumplida",
    "lotRequirement": "REQUIRED"
  },
  {
    "id": 2,
    "name": "Producto dañado",
    "description": "Producto con daño visible",
    "lotRequirement": "OPTIONAL"
  }
]
```

| Campo | Origen | Regla |
|---|---|---|
| `id` | `refund_reasons.id` | Entero positivo representable por `BIGINT`. |
| `name` | `refund_reasons.name` | Texto no vacío, máximo 150 caracteres. |
| `description` | `refund_reasons.description` | Texto no vacío, máximo 300 caracteres. |
| `lotRequirement` | `refund_reasons.lot_requirement` | `REQUIRED`, `OPTIONAL` o `HIDDEN`. |

`CONTRATO` La respuesta expone exactamente esos cuatro campos. No expone `is_active`, `created_by`,
`updated_by`, `created_at`, `updated_at` ni `deleted_at`.

`APLICACIÓN` No emite `name` o `description` vacíos, incluso si contienen solo espacios. Los límites
máximos proceden de `VARCHAR(150)` y `VARCHAR(300)`; la regla de contenido no vacío procede de
[D-002](./Decisiones.md#d-002), porque el DDL solo garantiza `NOT NULL`.

Diagrama: [04-get-refund-reasons.plantuml](../../../diagrams/devoluciones/db-script-2026-09-02/04-get-refund-reasons.plantuml).

## `POST /api/v1/refunds`

`CONTRATO` Sales crea una nota `ORIGINAL`. Sales remite productos ya seleccionados; el servicio
valida la integridad del payload, no la elegibilidad comercial del producto. La frontera de
confianza se define en [D-003](./Decisiones.md#d-003).

### Request exacto

```json
{
  "distributorId": 10,
  "employeeId": 501,
  "ownerId": 7001,
  "customerId": 7001,
  "replacementDate": "2026-09-10",
  "justification": "Reposición solicitada por el cliente",
  "items": [
    {
      "productId": 9001,
      "quantity": 2.0,
      "priceUnit": 18.5,
      "reasonId": 1,
      "notes": "Dos unidades del mismo lote",
      "sources": [
        {
          "invoiceNumber": "F-100",
          "invoicedAt": "2026-08-20",
          "quantity": 2.0,
          "lot": "L-2026-08",
          "dueDate": "2026-09-15"
        }
      ],
      "images": [
        {
          "url": "https://files.example/refunds/9001-1.jpg"
        }
      ]
    }
  ]
}
```

### Límites HTTP

Los límites se validan antes de persistir. Un tipo incompatible o una ausencia estructural produce
`400`; un valor bien formado fuera de estos límites produce `422`.

| Alcance | Regla de aplicación |
|---|---|
| IDs del request | Enteros entre `1` y `9223372036854775807`, rango positivo de `BIGINT`. |
| `items` | Entre 1 y 50 elementos. |
| `sources` | Entre 1 y 50 elementos por item. |
| Decimales persistidos | Máximo 2 decimales y valor entre `0` y `9999999999.99`; `quantity` debe ser mayor que 0. |
| `invoiceNumber` | Si se envía, texto no vacío de hasta 50 caracteres. |
| `lot` | Cuando se admite o exige, texto no vacío de hasta 50 caracteres. |
| `url` | Texto no vacío de hasta 255 caracteres. |

`APLICACIÓN` También comprueba que cada producto `quantity * priceUnit`, cada suma y el `total`
calculado sean representables por `DECIMAL(12,2)` sin redondear silenciosamente una escala mayor.

### Campos de cabecera

| Campo | Tipo | Obligatorio | Persistencia |
|---|---|---:|---|
| `distributorId` | entero | Sí | `refund_orders.distributor_id` |
| `employeeId` | entero | Sí | `refund_orders.employee_id` |
| `ownerId` | entero | Sí | `refund_orders.owner_id` |
| `customerId` | entero | Sí | `refund_orders.customer_id` |
| `replacementDate` | fecha ISO | No | `refund_orders.replacement_date` |
| `justification` | texto | No | `refund_orders.justification` |
| `items` | array | Sí | Entre 1 y 50 filas de `refund_order_details`. |

`DDL` `ownerId` y `customerId` son ambos obligatorios. `PENDIENTE` Su diferencia semántica todavía
debe confirmarse; este contrato no inventa roles distintos ni snapshots asociados.

### Campos de cada item

| Campo | Tipo | Obligatorio | Persistencia |
|---|---|---:|---|
| `productId` | entero | Sí | `refund_order_details.product_id` |
| `quantity` | decimal | Sí | `quantity` y valor inicial de `source_quantity` |
| `priceUnit` | decimal | Sí | `refund_order_details.price_unit` |
| `reasonId` | entero | Sí | `refund_order_details.reason_id` |
| `notes` | texto | No | `refund_order_details.notes` |
| `sources` | array | Sí | Entre 1 y 50 filas de `refund_order_detail_sources`. |
| `images` | array | No | Filas de `refund_order_detail_image`. |

### Campos de cada source

| Campo | Tipo | Obligatorio | Persistencia |
|---|---|---:|---|
| `invoiceNumber` | texto | Condicional | `invoice_number` |
| `invoicedAt` | fecha ISO | No | `invoiced_at` |
| `quantity` | decimal | Sí | `quantity` |
| `lot` | texto | Condicional | `lot` |
| `dueDate` | fecha ISO | No | `due_date` |

### Semántica de `lotRequirement`

`APLICACIÓN` Resuelve el motivo activo de cada item y aplica su `lotRequirement` a cada source antes
de cualquier inserción:

| Valor | Regla por source | Resultado si falla |
|---|---|---|
| `REQUIRED` | `lot` es obligatorio, no vacío y de hasta 50 caracteres. `invoiceNumber` sigue siendo opcional. | `422` |
| `OPTIONAL` | `lot` puede omitirse; si se envía debe ser no vacío y de hasta 50 caracteres. Debe existir `invoiceNumber` o `lot`. | `422` |
| `HIDDEN` | La propiedad `lot` debe omitirse, incluso en lugar de enviarse con `null`; `invoiceNumber` es obligatorio y no vacío. | `422` |

Para cualquier modo, `invoiceNumber`, cuando se envía, no puede contener solo espacios y admite
hasta 50 caracteres. Esta regla concreta [D-004](./Decisiones.md#d-004); el `CHECK` del DDL solo
garantiza que factura o lote no sean SQL `NULL`.

### Campos de cada image

| Campo | Tipo | Obligatorio | Persistencia |
|---|---|---:|---|
| `url` | texto | Sí cuando se incluye la imagen | `refund_order_detail_image.url` |

Aunque `url` es nullable en el DDL, `APLICACIÓN` rechaza una imagen incluida con URL vacía.

### Campos rechazados

`CONTRATO` El request no recibe `id`, `noteNumber`, `total`, `sourceQuantity`, `splitSequence`,
`documentType`, `status`, datos de workflow ni campos de auditoría. Tampoco recibe snapshots de
nombres o productos.

### Validaciones de aplicación

| Validación | Resultado si falla |
|---|---|
| Todos los IDs están en el rango positivo de `BIGINT` | `422` |
| Existen entre 1 y 50 items y entre 1 y 50 sources por item | `422` |
| Cantidades y precios respetan rango y escala de `DECIMAL(12,2)` | `422` |
| `quantity > 0` y `priceUnit >= 0` por item | `422` |
| El motivo existe, está activo y no está borrado | `422` |
| Cada source cumple el `lotRequirement` de su motivo | `422` |
| La suma de `sources[].quantity` equivale a `item.quantity` | `422` |
| Cada source tiene cantidad positiva y una identidad admitida | `422` |
| Factura, lote y URL respetan contenido y longitud | `422` |
| La configuración de aprobación cumple todas sus invariantes | `503` |

### Valores generados

`APLICACIÓN` El servicio:

- genera `refund_orders.id` y un `note_number` no vacío de hasta 50 caracteres;
- fija `source_quantity = quantity` en cada item;
- calcula `total = SUM(quantity * priceUnit)`;
- crea la cabecera con `document_type = 'ORIGINAL'`, `split_sequence = 0` y `status = 'OPEN'`;
- crea una instancia con `attempt = 1` y `status = 'IN_APPROVAL'`;
- materializa los niveles disponibles para ese intento;
- fija `current_level_order` con el primer nivel materializado;
- registra una acción `CREATED`;
- actualiza `current_workflow_instance_id` con la instancia creada.

El formato, algoritmo y unicidad de `note_number` permanecen `PENDIENTE`; el valor de la respuesta es
opaco para el cliente y el ejemplo no garantiza una secuencia concreta.

### Configuración determinista

`APLICACIÓN` La transacción usa una lectura consistente de `refund_approval_levels`, bajo
aislamiento `REPEATABLE READ`, y carga una sola vez todas las filas con `is_active = TRUE` y
`deleted_at IS NULL`. Antes del primer `INSERT` comprueba:

| Invariante | Regla |
|---|---|
| Versión | Existe exactamente un `workflow_version_id` distinto entre las filas seleccionadas. |
| Cardinalidad | La versión contiene al menos un nivel. |
| Orden | `level_order` no se repite y forma la secuencia consecutiva `1..N`. |
| Piso | Cada `min_amount` es mayor o igual que 0. |

No existe desempate: cero versiones, más de una versión o una escalera inválida producen `503` y
`ROLLBACK`. La semántica de `max_amount`, incluido el último nivel sin techo, permanece `PENDIENTE`;
el POST no infiere un valor alternativo.

La materialización copia `level_order`, `name` como `level_name`, `role_code`, `min_amount` y
`max_amount`. `refund_workflow_instance_levels` no conserva `workflow_version_id`,
`approval_policy`, `required_approvals` ni `on_reject`; `decision_mode` se fija como valor de runtime.
Esta pérdida de contexto está registrada en [D-009](./Decisiones.md#d-009).

### Transacción atómica

`CONTRATO` Una sola transacción inserta o actualiza:

1. `refund_orders`;
2. `refund_order_details`;
3. `refund_order_detail_sources`;
4. `refund_order_detail_image`, cuando corresponde;
5. `refund_workflow_instances`;
6. `refund_workflow_instance_levels`;
7. `refund_workflow_actions` con `CREATED`;
8. `refund_orders.current_workflow_instance_id`.

Antes de `COMMIT`, la aplicación comprueba la cardinalidad de cada escritura: una cabecera, una
línea por item, una fuente por source, una imagen por image, una instancia, un nivel por fila de la
configuración validada, una acción `CREATED` y exactamente una actualización de la cabecera. Una
cardinalidad inesperada o cualquier fallo ejecuta `ROLLBACK`.

`BEGIN`/`COMMIT` garantiza que las escrituras se confirmen o reviertan juntas; no garantiza por sí
solo que estén completas. El control de flujo anterior evita confirmar una nota incompleta, como
registra [D-007](./Decisiones.md#d-007).

### Respuesta 201

```json
{
  "id": 1001,
  "noteNumber": "NRO#1001",
  "splitSequence": 0,
  "documentType": "ORIGINAL",
  "status": "OPEN",
  "total": 37.0,
  "workflow": {
    "instanceId": 5001,
    "attempt": 1,
    "status": "IN_APPROVAL",
    "currentLevelOrder": 1
  }
}
```

`CONTRATO` `noteNumber` es un texto opaco, no vacío y de hasta 50 caracteres. No se promete que el
formato ilustrado sea secuencial ni único hasta resolver [D-008](./Decisiones.md#d-008).

### Errores

| HTTP | Condición |
|---:|---|
| `400 Bad Request` | JSON malformado, tipo incompatible o ausencia estructural de un campo obligatorio. |
| `422 Unprocessable Entity` | Límite, rango, escala o longitud inválidos; motivo inválido/inactivo; `lotRequirement` incumplido; suma inconsistente; source o imagen inválidos. |
| `500 Internal Server Error` | Fallo de persistencia o cardinalidad de escritura inesperada; la transacción se revierte. |
| `503 Service Unavailable` | No hay exactamente una configuración activa válida para materializar el intento. |

### Riesgo de reintento

`PENDIENTE` No se define idempotency key ni existe una unicidad de negocio que identifique el mismo
request. Si el cliente pierde una respuesta y reintenta, puede crear otra nota con sus líneas,
fuentes, imágenes y workflow. Los topes de 50 items y 50 sources por item limitan el tamaño de una
solicitud, pero no eliminan la duplicación. El cliente debe tratar un timeout como resultado
indeterminado, no como prueba de que no hubo `COMMIT`.

Diagrama: [05-post-create-refund.plantuml](../../../diagrams/devoluciones/db-script-2026-09-02/05-post-create-refund.plantuml).

## Exclusiones explícitas

`CONTRATO` No existe ni se crea `GET /refunds/returnable-products`, `/eligibility`, `/validate` ni
una operación equivalente. Sales remite los productos ya seleccionados. La API comprueba la
integridad del payload, pero no decide si un producto es comercialmente devolvible.

Sales es la fuente confiable de existencia y elegibilidad del producto, correspondencia entre
cliente y factura, precio y cantidad devolvible. Refunds no llama a Sales ni a otro catálogo para
revalidar esos datos y las referencias externas sin FK no prueban su existencia. Refunds sí valida
estructura, rangos y longitudes, motivo local activo, `lotRequirement`, suma de fuentes e imágenes.

Las demás operaciones de
[`DocumentacionDevoluciones.md`](../DocumentacionDevoluciones.md) y
[`DevolucionesV2.md`](../DevolucionesV2.md) son propuestas históricas fuera de este work unit.

## Navegación

- [README de la fotografía](./README.md)
- [Registro de decisiones](./Decisiones.md)
- [Documentación técnica](./DocumentacionTecnica.md)
- [Catálogo de diagramas](../../../diagrams/devoluciones/db-script-2026-09-02/README.md)
