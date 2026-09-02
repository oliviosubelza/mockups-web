# Devoluciones: documentación técnica del modelo persistido

## Conclusión

**Este documento es una fotografía fiel del DDL `refund_*` escrito en `db_script.sql`; no es una
especificación ideal, una migración corregida ni un contrato HTTP.** Registra tanto lo que el DDL
declara como lo que deja sin garantizar. El script se documenta literalmente por decisión del
usuario, incluidas sus inconsistencias y errores de sintaxis.

La fuente fijada contiene 10 tablas, 10 PK y 13 cláusulas FK. No contiene índices de consulta ni
restricciones `UNIQUE` adicionales. Declara 13 `CHECK`: 11 usan columnas existentes y 2 hacen
referencia a columnas inexistentes, por lo que `refund_approval_levels` no puede crearse con el
texto literal. El script completo, además, encuentra errores sintácticos antes de llegar al dominio.

## Ruta de revisión

1. Confirmar la [fuente fijada](#fuente-fijada) y los [niveles de certeza](#niveles-de-certeza).
2. Ubicar el límite del dominio en [alcance y fronteras](#alcance-y-fronteras).
3. Consultar el [inventario del modelo](#inventario-del-modelo) y el detalle de columnas.
4. Revisar [FK, relaciones escalares, `CHECK` e índices](#integridad-declarada).
5. Separar las [reglas comentadas](#reglas-escritas-en-comentarios) de las garantías.
6. Cerrar con [inconsistencias](#inconsistencias-observadas-sin-corregir),
   [preguntas](#preguntas-pendientes) y [checklist](#checklist-de-revisión-futura).

Diagramas de apoyo:

- [Modelo relacional completo](../../../diagrams/devoluciones/db-script-2026-09-01/01-modelo-relacional.plantuml)
- [Trazabilidad de notas](../../../diagrams/devoluciones/db-script-2026-09-01/02-trazabilidad-notas.plantuml)
- [Workflow persistido](../../../diagrams/devoluciones/db-script-2026-09-01/03-workflow-persistido.plantuml)

## Fuente fijada

| Dato | Valor comprobado |
|---|---|
| Archivo | [`db_script.sql`](../../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1185`](../../../db_script.sql#L915-L1185), prefijo `refund_*` |
| Fecha de la fotografía | `2026-09-01` |
| Último commit que modificó el archivo | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| `HEAD` de la fotografía | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| SHA-256 del archivo completo | `2f9936f8450a9a8fd8acfc6b308de6378a24b1253ef0a75aa50ab416538e7405` |

Las referencias `db_script.sql:Lx-Ly` de este documento apuntan al archivo completo fijado, no a
los SQL alternativos conservados en `docs/devoluciones/`.

## Niveles de certeza

| Etiqueta | Qué permite afirmar | Qué no permite afirmar |
|---|---|---|
| `DDL` | El texto declara una tabla, columna, default, PK, FK o `CHECK`. | Que el script completo compile, se haya aplicado o coincida con una base desplegada. |
| `COMENTARIO` | Un comentario expresa una intención, ejemplo o catálogo. | Que PostgreSQL lo haga cumplir. |
| `APLICACIÓN` | La fuente delega una regla a la transacción o la deja necesariamente fuera del bloque. | Que el mockup o un backend real ya la implementen. |
| `PENDIENTE` | La fuente no resuelve una ambigüedad o decisión. | Una respuesta asumida en nombre del usuario. |

Cuando una fila de inventario cita semántica escrita junto a una columna, esa semántica lleva
`COMENTARIO`; tipo, nulabilidad y default llevan `DDL`.

## Alcance y fronteras

### Dentro de esta fotografía

`DDL` El dominio documentado comienza en el encabezado `DEVOLUTIONS` y termina con
`refund_order_detail_decisions`: [`db_script.sql:L915-L1185`](../../../db_script.sql#L915-L1185).
Modela notas de devolución, líneas, evidencia, configuración de aprobación e historial de workflow.

### Fuera de esta fotografía

El mismo archivo usa vocabulario de retorno para procesos logísticos distintos:

| Área fuera de alcance | Evidencia en el script | Diferencia observable |
|---|---|---|
| Retorno de carga a bodega | [`truck_inventories.returned_warehouse_qty`, `db_script.sql:L502-L532`](../../../db_script.sql#L502-L532) | Cantidad de carga que vuelve a bodega durante el control de inventario del camión. |
| Activos retornados | [`logistic_assets` y `transport_order_assets`, `db_script.sql:L595-L649`](../../../db_script.sql#L595-L649) | Control salida/retorno de pallets, carros, canastillas u otros activos por orden de transporte. |
| Producto rechazado en entrega | [`delivery_order_items.returned_qty`, `db_script.sql:L726-L745`](../../../db_script.sql#L726-L745) | Cantidad no entregada o devuelta en el contexto de una entrega. |
| Incidente con retorno físico | [`delivery_incidents.requires_return`, `db_script.sql:L774-L794`](../../../db_script.sql#L774-L794) | Indicador de que un incidente exige retorno al almacén. |
| Cierre logístico y financiero | [`transport_order_warehouse_closings` y `transport_order_collection_closings`, `db_script.sql:L813-L912`](../../../db_script.sql#L813-L912) | Liquidación física de carga y conciliación de caja al cierre de ruta. |

`PENDIENTE` No hay FK, tabla puente ni comentario en el bloque `refund_*` que conecte una nota de
devolución con esos retornos logísticos. Por ello, esta documentación **no afirma integración** entre
ambos dominios.

## Inventario del modelo

| Capa de lectura | Tabla literal | Propósito observable |
|---|---|---|
| Configuración | `refund_reasons` | Motivos y requisitos de evidencia. |
| Configuración | `refund_approval_levels` | Escalera de aprobación versionada por un identificador escalar. |
| Nota | `refund_orders` | Cabecera original o disociada. |
| Nota | `refund_order_details` | Líneas y cantidades de la nota. |
| Evidencia | `refund_order_detail_sources` | Orígenes por factura, documento SAP o lote. |
| Evidencia | `refund_order_detail_image` | Imágenes vinculadas a una línea; el nombre de tabla es singular. |
| Workflow | `refund_workflow_instances` | Intentos de aprobación. |
| Workflow | `refund_workflow_instance_levels` | Niveles persistidos por intento. |
| Workflow | `refund_workflow_actions` | Acciones asociadas a una instancia y, opcionalmente, a un nivel o nota relacionada. |
| Workflow | `refund_order_detail_decisions` | Decisiones registradas sobre líneas. |

### `refund_reasons`

Fuente: [`db_script.sql:L916-L934`](../../../db_script.sql#L916-L934).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `code` | `VARCHAR(100)` | PK; no nula; sin default | `COMENTARIO` Código como `VENCIDO`, `CONTAMINACION_FISICA` o `RECALL`. |
| `name` | `VARCHAR(150)` | `NOT NULL`; sin default | `COMENTARIO` Etiqueta visible. |
| `lot_requirement` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'OPTIONAL'` | `COMENTARIO` Catálogo `REQUIRED`, `OPTIONAL`, `HIDDEN`; también tiene `CHECK`. |
| `due_date_requirement` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'OPTIONAL'` | `COMENTARIO` Mismo catálogo para fecha de vencimiento; también tiene `CHECK`. |
| `requires_photo` | `BOOLEAN` | `NOT NULL`; `DEFAULT TRUE` | `COMENTARIO` Sin foto no se acepta la línea; el DDL no vincula esta bandera con imágenes. |
| `requires_notes` | `BOOLEAN` | `NOT NULL`; `DEFAULT TRUE` | `COMENTARIO` Sin observación no se acepta la línea; el DDL no vincula esta bandera con `notes`. |
| `sort_order` | `SMALLINT` | `NOT NULL`; `DEFAULT 0` | `COMENTARIO` Orden en el selector; no hay `CHECK` de signo ni unicidad. |
| `is_active` | `BOOLEAN` | `NOT NULL`; `DEFAULT TRUE` | `COMENTARIO` Un motivo inactivo deja de ofrecerse sin romper el histórico. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK ni semántica adicional declarada. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK ni semántica adicional declarada. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla de inmutabilidad. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin actualización automática declarada. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo de borrado lógico por convención de nombre; el bloque no impone filtros. |

### `refund_approval_levels`

Fuente: [`db_script.sql:L937-L972`](../../../db_script.sql#L937-L972).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador de fila. |
| `workflow_version_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Agrupa filas de una misma versión publicada; no tiene FK ni tabla de versión. |
| `level_order` | `SMALLINT` | `NOT NULL`; sin default | `COMENTARIO` Orden del nivel, con ejemplos 1 a 4; `CHECK level_order >= 1`. |
| `name` | `VARCHAR(100)` | `NOT NULL`; sin default | `COMENTARIO` Nombre del escritorio. |
| `role_code` | `VARCHAR(50)` | `NOT NULL`; sin default | `COMENTARIO` Rol que decide; los aprobadores se resuelven por rol, sin FK. |
| `min_amount` | `DECIMAL(12,2)` | `NOT NULL`; `DEFAULT 0.00` | `COMENTARIO` Monto desde el que entra el nivel. El `CHECK` intenta validar otro nombre de columna. |
| `max_amount` | `DECIMAL(12,2)` | `NOT NULL`; `DEFAULT 0.00` | `COMENTARIO` Techo máximo; contradice el comentario general de último nivel sin techo. |
| `approval_policy` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'ANY'` | `COMENTARIO` `ANY`, `ALL`, `QUORUM`; catálogo sí limitado por `CHECK`. |
| `required_approvals` | `SMALLINT` | `NOT NULL`; `DEFAULT 1` | `COMENTARIO` Solo tiene sentido con `QUORUM`; coherencia parcial limitada por `CHECK`. |
| `on_reject` | `VARCHAR(30)` | `NOT NULL`; `DEFAULT 'TERMINATE'` | `COMENTARIO` `TERMINATE`, `RETURN_PREVIOUS`; catálogo sí limitado por `CHECK`. |
| `is_active` | `BOOLEAN` | `NOT NULL`; `DEFAULT TRUE` | `COMENTARIO` Una sola versión activa por vez; no hay `UNIQUE` que lo garantice. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla adicional. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin actualización automática. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo nullable sin filtro impuesto. |

`DDL` `sla_hours` aparece comentada y, por tanto, **no es una columna** de esta tabla
([`db_script.sql:L952`](../../../db_script.sql#L952)).

### `refund_orders`

Fuente: [`db_script.sql:L975-L1003`](../../../db_script.sql#L975-L1003).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador de la nota. |
| `note_number` | `VARCHAR(50)` | `NOT NULL`; sin default | `COMENTARIO` Número de nota; no tiene `UNIQUE`. |
| `split_sequence` | `SMALLINT` | `NOT NULL`; `DEFAULT 0` | `COMENTARIO` Distingue nota original y disociada; no tiene `CHECK`. |
| `source_refund_order_id` | `BIGINT` | NULL; sin default | `COMENTARIO` NULL en original y fuente de la nota que salió; FK autorreferente real. |
| `document_type` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'ORIGINAL'` | `COMENTARIO` `ORIGINAL`, `DISSOCIATED`; no hay `CHECK`. |
| `status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'OPEN'` | `COMENTARIO` `OPEN`, `APPROVED`, `REJECTED`, `ANNULLED`; no hay `CHECK`. |
| `current_workflow_instance_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Instancia que corre actualmente y cambia si hay más de una; no tiene FK. |
| `distributor_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Distribuidora de registro; su FK está comentada. |
| `employee_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Vendedor que registró la nota; referencia externa sin FK. |
| `owner_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` “Cliente”; no se distingue de `customer_id` ni tiene FK. |
| `customer_id` | `BIGINT` | `NOT NULL`; sin default | Sin comentario específico y sin FK. |
| `replacement_date` | `DATE` | NULL; sin default | `COMENTARIO` Fecha estimada de reposición acordada con el cliente. |
| `justification` | `TEXT` | NULL; sin default | `COMENTARIO` Justificación en palabras del vendedor. |
| `total` | `DECIMAL(12,2)` | `NOT NULL`; `DEFAULT 0.00` | `COMENTARIO` Suma `quantity * price_unit` de líneas `ACTIVE`; no es columna generada ni tiene `CHECK`. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla adicional. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin actualización automática. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo nullable sin filtro impuesto. |

`DDL` `item_selection_locked` está comentada y no forma parte de la tabla
([`db_script.sql:L986`](../../../db_script.sql#L986)).

### `refund_order_details`

Fuente: [`db_script.sql:L1005-L1029`](../../../db_script.sql#L1005-L1029).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador de línea. |
| `refund_order_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Nota a la que pertenece; FK real. |
| `source_detail_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Línea original para trazabilidad; FK autorreferente real. |
| `product_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Identificador de producto; referencia externa sin FK. |
| `source_quantity` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Cantidad original al crear, que “nunca cambia”; el DDL no impide actualizarla. |
| `quantity` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Cantidad vigente; `CHECK` exige `0 <= quantity <= source_quantity`. |
| `price_unit` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Precio unitario congelado; el DDL no impide actualizarlo ni exige valor no negativo. |
| `line_status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'ACTIVE'` | `COMENTARIO` `ACTIVE`, `DISSOCIATED`; no hay `CHECK`. |
| `reason` | `VARCHAR(100)` | NULL; sin default | `COMENTARIO` Motivo clasificado; no tiene FK a `refund_reasons(code)`. |
| `notes` | `TEXT` | NULL; sin default | `COMENTARIO` Observación libre del vendedor. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla adicional. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin actualización automática. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo nullable sin filtro impuesto. |

### `refund_order_detail_sources`

Fuente: [`db_script.sql:L1031-L1058`](../../../db_script.sql#L1031-L1058).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador del origen. |
| `refund_order_detail_id` | `BIGINT` | `NOT NULL`; sin default | Línea respaldada; FK real. |
| `invoice_number` | `VARCHAR(50)` | NULL; sin default | `COMENTARIO` Número de factura. |
| `invoice_sap_doc` | `VARCHAR(50)` | NULL; sin default | `COMENTARIO` Documento SAP y referencia lógica externa, sin FK. |
| `invoiced_at` | `DATE` | NULL; sin default | `COMENTARIO` Fecha de factura congelada; el DDL no impide actualizarla. |
| `lot` | `VARCHAR(50)` | NULL; sin default | `COMENTARIO` Lote. |
| `due_date` | `DATE` | NULL; sin default | `COMENTARIO` Vencimiento del lote. |
| `quantity` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Cantidad de la línea que sale del origen; `CHECK quantity > 0`. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla adicional. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin actualización automática. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo nullable sin filtro impuesto. |

### `refund_order_detail_image`

Fuente: [`db_script.sql:L1060-L1076`](../../../db_script.sql#L1060-L1076).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador de imagen. |
| `refund_order_detail_id` | `BIGINT` | `NOT NULL`; sin default | Línea documentada; FK real. |
| `storage_key` | `VARCHAR(500)` | `NOT NULL`; sin default | `COMENTARIO` Clave fuente en el bucket; no tiene `UNIQUE`. |
| `content_type` | `VARCHAR(100)` | NULL; sin default | `COMENTARIO` Tipo como `image/jpeg` o `image/png`; sin catálogo. |
| `size_bytes` | `BIGINT` | NULL; sin default | Tamaño; `CHECK` exige positivo cuando no es NULL. |
| `sort_order` | `SMALLINT` | `NOT NULL`; `DEFAULT 0` | `COMENTARIO` Orden en galería; sin `CHECK` ni unicidad. |
| `taken_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Momento de captura si el móvil lo informa. |
| `uploaded_by` | `VARCHAR(255)` | NULL; sin default | `COMENTARIO` Quién subió la imagen; sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla adicional. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo nullable sin filtro impuesto. |

### `refund_workflow_instances`

Fuente: [`db_script.sql:L1080-L1099`](../../../db_script.sql#L1080-L1099).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador del intento. |
| `refund_order_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Nota asociada; FK real. |
| `attempt` | `SMALLINT` | `NOT NULL`; `DEFAULT 1` | `COMENTARIO` Número de intento; sin `CHECK` ni unicidad por nota. |
| `status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'IN_APPROVAL'` | `COMENTARIO` `EDITING`, `IN_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`; sin `CHECK`. |
| `current_level_order` | `SMALLINT` | NULL; sin default | `COMENTARIO` Nivel de revisión; sin FK, rango ni coherencia con `status`. |
| `reactivated_from_instance_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Referencia guardada al revertir/reactivar; FK autorreferente real. |
| `started_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | `COMENTARIO` Momento de inicio. |
| `finished_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Momento de finalización; sin coherencia temporal impuesta. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla adicional. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin actualización automática. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo nullable sin filtro impuesto. |

### `refund_workflow_instance_levels`

Fuente: [`db_script.sql:L1101-L1131`](../../../db_script.sql#L1101-L1131).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador del nivel persistido. |
| `workflow_instance_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Instancia a la que pertenece; FK real. |
| `level_order` | `SMALLINT` | `NOT NULL`; sin default | `COMENTARIO` Orden del nivel; sin `CHECK` ni unicidad por instancia. |
| `level_name` | `VARCHAR(100)` | `NOT NULL`; sin default | `COMENTARIO` Nombre del nivel. |
| `role_code` | `VARCHAR(50)` | `NOT NULL`; sin default | `COMENTARIO` Rol que puede aprobar; sin FK. |
| `min_amount` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Monto mínimo de activación; sin `CHECK`. |
| `max_amount` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Rango máximo; no admite NULL para representar “sin techo”. |
| `decision_mode` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'DOCUMENT_DECISION'` | `COMENTARIO` `ITEM_SELECTION`, `DOCUMENT_DECISION`; solo nivel 1 selecciona, sin `CHECK`. |
| `status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'PENDING'` | `COMENTARIO` `PENDING`, `IN_PROGRESS`, `APPROVED`, `REJECTED`, `SKIPPED`; sin `CHECK`. |
| `first_viewed_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Primera apertura; el DDL no impide sobrescribirla. |
| `first_viewed_by` | `VARCHAR(255)` | NULL; sin default | `COMENTARIO` Persona que abrió el nivel; sin FK. |
| `started_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Fecha de inicio. |
| `finished_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Fecha de finalización; sin coherencia temporal impuesta. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla adicional. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin actualización automática. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Campo nullable sin filtro impuesto. |

`DDL` Este nivel conserva nombre, rol y banda de montos, pero no tiene columnas para
`approval_policy`, `required_approvals`, `on_reject` ni `sla_hours`. Tampoco conserva
`workflow_version_id`; por ello no hay vínculo persistido con la configuración que habría originado
el nivel.

### `refund_workflow_actions`

Fuente: [`db_script.sql:L1136-L1172`](../../../db_script.sql#L1136-L1172).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador de acción. |
| `workflow_instance_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Instancia de la acción; FK real. |
| `workflow_instance_level_id` | `BIGINT` | NULL; sin default | `COMENTARIO` NULL para acciones sin nivel puntual; FK real cuando tiene valor. |
| `related_refund_order_id` | `BIGINT` | NULL; sin default | `COMENTARIO` FK de la nota disociada; FK real, sin condición por tipo de acción. |
| `action` | `VARCHAR(30)` | `NOT NULL`; sin default | `COMENTARIO` Catálogo de acciones en líneas 1144-1145; no hay `CHECK`. |
| `actor_employee_code` | `BIGINT` | NULL; sin default | `COMENTARIO` Quién realizó la acción; referencia externa sin FK. |
| `actor_role_code` | `VARCHAR(50)` | NULL; sin default | `COMENTARIO` Rol que realizó la acción; sin FK. |
| `system_summary` | `TEXT` | NULL; sin default | `COMENTARIO` Frase autogenerada que acompaña al comentario. |
| `comment` | `TEXT` | NULL; sin default | `COMENTARIO` Comentario agregado por el revisor. |
| `reason` | `TEXT` | NULL; sin default | `COMENTARIO` Motivo obligatorio según la acción; el DDL no impone esa obligatoriedad. |
| `previous_status` | `VARCHAR(20)` | NULL; sin default | `COMENTARIO` Ejemplos `IN_APPROVAL`, `REJECTED`, `EDITING`; sin catálogo. |
| `new_status` | `VARCHAR(20)` | NULL; sin default | Estado nuevo sin comentario de catálogo ni `CHECK`. |
| `amount_before` | `DECIMAL(12,2)` | NULL; sin default | `COMENTARIO` Solo para acciones que mueven el monto; sin condición por acción. |
| `amount_after` | `DECIMAL(12,2)` | NULL; sin default | `COMENTARIO` Par de `amount_before`; sin condición conjunta. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Identificador de auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Única marca temporal activa con default para la acción. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Permite representar actualización; no hay protección append-only. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Permite representar borrado lógico; no hay protección append-only. |

`DDL` La columna `at` está comentada y no existe
([`db_script.sql:L1161`](../../../db_script.sql#L1161)).

### `refund_order_detail_decisions`

Fuente: [`db_script.sql:L1175-L1185`](../../../db_script.sql#L1175-L1185).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerada | Identificador de decisión. |
| `workflow_action_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Acción `LEVEL1_ITEM_SELECTION` que registró la decisión; FK real, sin validación del tipo de acción. |
| `refund_order_detail_id` | `BIGINT` | `NOT NULL`; sin default | Línea decidida; FK real. |
| `decision` | `VARCHAR(20)` | `NOT NULL`; sin default | `COMENTARIO` `SELECTED`, `DISSOCIATED`; no hay `CHECK`. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca temporal sin regla de inmutabilidad. |

## Integridad declarada

La lectura siguiente inventaría el texto estructural. Debido a los errores descritos más adelante,
`DDL` significa “declarado en el archivo”, no “aplicado en una base”.

### PK y FK reales

Cada una de las 10 tablas declara exactamente una PK. Nueve usan `id BIGSERIAL`; `refund_reasons`
usa `code VARCHAR(100)`. Las 13 FK reales son:

| Restricción | Columna hija | Destino | Nulabilidad | Garantía limitada |
|---|---|---|---|---|
| `fk_refund_order_source` | `refund_orders.source_refund_order_id` | `refund_orders.id` | NULL | Si hay valor, la nota fuente existe. No exige que sea original ni evita ciclos. |
| `fk_refund_order_detail_order` | `refund_order_details.refund_order_id` | `refund_orders.id` | `NOT NULL` | Toda línea referencia una nota existente. |
| `fk_refund_order_detail_source` | `refund_order_details.source_detail_id` | `refund_order_details.id` | NULL | Si hay valor, la línea fuente existe. No exige que pertenezca a la nota fuente. |
| `fk_refund_source_detail` | `refund_order_detail_sources.refund_order_detail_id` | `refund_order_details.id` | `NOT NULL` | Todo origen referencia una línea existente. |
| `fk_refund_photo_detail` | `refund_order_detail_image.refund_order_detail_id` | `refund_order_details.id` | `NOT NULL` | Toda imagen referencia una línea existente. |
| `fk_refund_wf_instance_order` | `refund_workflow_instances.refund_order_id` | `refund_orders.id` | `NOT NULL` | Toda instancia referencia una nota existente. |
| `fk_refund_wf_instance_reactivated` | `refund_workflow_instances.reactivated_from_instance_id` | `refund_workflow_instances.id` | NULL | Si hay valor, el intento anterior existe. No exige misma nota ni secuencia. |
| `fk_refund_wf_instance_level_instance` | `refund_workflow_instance_levels.workflow_instance_id` | `refund_workflow_instances.id` | `NOT NULL` | Todo nivel referencia una instancia existente. |
| `fk_refund_wf_action_instance` | `refund_workflow_actions.workflow_instance_id` | `refund_workflow_instances.id` | `NOT NULL` | Toda acción referencia una instancia existente. |
| `fk_refund_wf_action_level` | `refund_workflow_actions.workflow_instance_level_id` | `refund_workflow_instance_levels.id` | NULL | Si hay valor, el nivel existe; no exige que pertenezca a la misma instancia. |
| `fk_refund_wf_action_related_order` | `refund_workflow_actions.related_refund_order_id` | `refund_orders.id` | NULL | Si hay valor, la nota relacionada existe; no condiciona `action`. |
| `fk_refund_detail_decision_action` | `refund_order_detail_decisions.workflow_action_id` | `refund_workflow_actions.id` | `NOT NULL` | Toda decisión referencia una acción; no exige `LEVEL1_ITEM_SELECTION`. |
| `fk_refund_detail_decision_detail` | `refund_order_detail_decisions.refund_order_detail_id` | `refund_order_details.id` | `NOT NULL` | Toda decisión referencia una línea; no exige consistencia con la nota de la acción. |

Fuente: [`db_script.sql:L1001-L1184`](../../../db_script.sql#L1001-L1184). Ninguna FK del bloque
declara `ON DELETE` u `ON UPDATE`; se conserva el comportamiento por defecto del motor.

### Relaciones escalares sin FK

| Campo o grupo | Relación sugerida por nombre/comentario | Estado |
|---|---|---|
| `refund_order_details.reason` | `refund_reasons.code` | `DDL` Campo nullable sin FK. |
| `refund_orders.current_workflow_instance_id` | `refund_workflow_instances.id` | `COMENTARIO` Instancia vigente; `DDL` sin FK. |
| `refund_orders.distributor_id` | `distributors.id` | `DDL` `fk_refund_order_distributor` está comentada en [`db_script.sql:L1002`](../../../db_script.sql#L1002). |
| `refund_approval_levels.workflow_version_id` | Versión publicada no materializada en otra tabla | `PENDIENTE` No existe destino ni FK en el bloque. |
| `role_code`, `actor_role_code` | Directorio de roles | `COMENTARIO` Resolución por rol; sin FK. |
| `employee_id`, `actor_employee_code`, `first_viewed_by`, `uploaded_by`, campos `*_by` | Identidades internas o externas | `PENDIENTE` No se identifica tabla destino ni se declara FK. |
| `owner_id`, `customer_id` | Cliente o propietario | `PENDIENTE` No se define la diferencia ni el destino. |
| `product_id` | Catálogo de productos | `COMENTARIO` Identificador de producto; sin FK. |
| `invoice_sap_doc` | SAP | `COMENTARIO` Referencia lógica porque SAP no es esta base. |

### `CHECK` escritos

| Restricción | Expresión literal resumida | Estado |
|---|---|---|
| `ck_refund_reason_lot` | `lot_requirement IN ('REQUIRED','OPTIONAL','HIDDEN')` | `DDL` Columnas existentes. |
| `ck_refund_reason_due_date` | `due_date_requirement IN ('REQUIRED','OPTIONAL','HIDDEN')` | `DDL` Columnas existentes. |
| `ck_refund_level_policy` | `approval_policy IN ('ANY','ALL','QUORUM')` | `DDL` Expresión válida dentro de una tabla que no llega a crearse por otros `CHECK`. |
| `ck_refund_level_on_reject` | `on_reject IN ('TERMINATE','RETURN_PREVIOUS')` | `DDL` Expresión válida dentro de una tabla que no llega a crearse por otros `CHECK`. |
| `ck_refund_level_required_approvals` | `QUORUM` exige `>= 1`; otra política exige `= 1` | `DDL` Expresión válida dentro de una tabla que no llega a crearse por otros `CHECK`. |
| `ck_refund_level_return_previous` | Prohíbe `level_order = 1` con `RETURN_PREVIOUS` | `DDL` Expresión válida dentro de una tabla que no llega a crearse por otros `CHECK`. |
| `ck_refund_level_order` | `level_order >= 1` | `DDL` Expresión válida dentro de una tabla que no llega a crearse por otros `CHECK`. |
| `ck_refund_level_min_amount` | `activation_min_amount >= 0` | `DDL` **Inválida:** `activation_min_amount` no existe; la columna real es `min_amount`. |
| `ck_refund_level_sla` | `sla_hours IS NULL OR sla_hours > 0` | `DDL` **Inválida:** `sla_hours` está comentada. |
| `ck_refund_order_detail_qty` | `quantity >= 0 AND quantity <= source_quantity` | `DDL` Permite `quantity = 0` y, por consecuencia lógica, no admite `source_quantity < 0`. |
| `ck_refund_source_qty` | `quantity > 0` | `DDL` Exige cantidad positiva por origen. |
| `ck_refund_source_identified` | Factura, documento SAP o lote debe ser no NULL | `DDL` `due_date` sola no identifica un origen. |
| `ck_refund_photo_size` | `size_bytes IS NULL OR size_bytes > 0` | `DDL` Admite tamaño desconocido; si existe, debe ser positivo. |

Fuente: [`db_script.sql:L932-L1184`](../../../db_script.sql#L932-L1184).

### Índices y unicidad

`DDL` En `db_script.sql:L915-L1185` no aparece ningún `CREATE INDEX` ni ninguna cláusula `UNIQUE`.
Las PK generan la unicidad e índice correspondientes, pero no existen índices adicionales para FK,
bandejas, estados, roles, fechas o trazabilidad.

`DDL` Tampoco hay unicidades de negocio para, entre otros:

- `refund_orders(note_number, split_sequence)`;
- una versión y orden de nivel;
- un intento por nota y número;
- un nivel por instancia y orden;
- una decisión por acción y línea;
- una aprobación por actor y nivel;
- `refund_order_detail_image.storage_key`;
- una sola versión activa de la escalera;
- una sola instancia vigente o abierta por nota.

## Reglas escritas en comentarios

Esta sección conserva la intención de los comentarios sin promoverla a garantía.

| Regla o catálogo | Evidencia | Nivel real de certeza |
|---|---|---|
| Requisitos de lote y vencimiento usan `REQUIRED`, `OPTIONAL`, `HIDDEN`. | [`db_script.sql:L919-L920`, `L932-L933`](../../../db_script.sql#L919-L933) | `DDL` El catálogo sí tiene `CHECK`. Su efecto sobre formularios o evidencia queda fuera del DDL. |
| Una sola versión de niveles está activa por vez. | [`db_script.sql:L953`](../../../db_script.sql#L953) | `COMENTARIO`; no hay índice único parcial ni otra restricción. |
| Políticas de aprobación `ANY`, `ALL`, `QUORUM`. | [`db_script.sql:L949-L965`](../../../db_script.sql#L949-L965) | `DDL` Catálogo y coherencia parcial escritos, pero la tabla falla por otros dos `CHECK`. |
| Rechazo `TERMINATE` o `RETURN_PREVIOUS`. | [`db_script.sql:L951-L968`](../../../db_script.sql#L951-L968) | `DDL` Catálogo escrito y nivel 1 limitado, con la misma salvedad de creación de tabla. |
| Tipos de documento `ORIGINAL`, `DISSOCIATED`. | [`db_script.sql:L978-L982`](../../../db_script.sql#L978-L982) | `COMENTARIO`; sin `CHECK` de tipo, secuencia o fuente. |
| Estados de nota `OPEN`, `APPROVED`, `REJECTED`, `ANNULLED`. | [`db_script.sql:L982`](../../../db_script.sql#L982) | `COMENTARIO`; sin `CHECK`. |
| `total` suma `quantity * price_unit` para líneas `ACTIVE`. | [`db_script.sql:L993`](../../../db_script.sql#L993) | `COMENTARIO`; no es generado, no hay trigger ni `CHECK`. |
| Estados de línea `ACTIVE`, `DISSOCIATED`. | [`db_script.sql:L1015`](../../../db_script.sql#L1015) | `COMENTARIO`; sin `CHECK`. |
| La suma de cantidades de orígenes debe igualar la cantidad de la línea. | [`db_script.sql:L1031-L1034`](../../../db_script.sql#L1031-L1034) | `APLICACIÓN`; el comentario delega expresamente la validación a la transacción. |
| Estados de instancia `EDITING`, `IN_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`. | [`db_script.sql:L1084-L1087`](../../../db_script.sql#L1084-L1087) | `COMENTARIO`; sin `CHECK` ni coherencia con nivel vigente o fechas. |
| `current_workflow_instance_id` señala la instancia que corre ahora. | [`db_script.sql:L984`](../../../db_script.sql#L984) | `COMENTARIO`; sin FK ni consistencia bidireccional con `refund_order_id`. |
| Modos `ITEM_SELECTION`, `DOCUMENT_DECISION`; solo nivel 1 selecciona. | [`db_script.sql:L1111-L1112`](../../../db_script.sql#L1111-L1112) | `COMENTARIO`; sin `CHECK` ni regla que lo limite al primer nivel. |
| Estados de nivel `PENDING`, `IN_PROGRESS`, `APPROVED`, `REJECTED`, `SKIPPED`. | [`db_script.sql:L1114-L1115`](../../../db_script.sql#L1114-L1115) | `COMENTARIO`; sin `CHECK`. |
| Acciones enumeradas de `CREATED` a `CANCEL`. | [`db_script.sql:L1143-L1145`](../../../db_script.sql#L1143-L1145) | `COMENTARIO`; `action` no tiene `CHECK`. |
| `reason` de acción es obligatorio según la acción. | [`db_script.sql:L1155`](../../../db_script.sql#L1155) | `COMENTARIO`; la columna es nullable y no hay condición. |
| Decisión binaria de nivel 1: `SELECTED`, `DISSOCIATED`. | [`db_script.sql:L1175-L1180`](../../../db_script.sql#L1175-L1180) | `COMENTARIO`; sin `CHECK`, unicidad ni validación del tipo de acción. |

## Inconsistencias observadas sin corregir

1. `DDL` `ck_refund_level_min_amount` usa `activation_min_amount`, columna inexistente; la tabla
   declara `min_amount` ([`db_script.sql:L947`, `L970`](../../../db_script.sql#L947-L970)).
2. `DDL` `ck_refund_level_sla` usa `sla_hours`, pero la única declaración de esa columna está
   comentada ([`db_script.sql:L952`, `L971`](../../../db_script.sql#L952-L971)).
3. `COMENTARIO` La escalera dice que el último nivel no tiene techo, mientras
   `refund_approval_levels.max_amount` es `NOT NULL DEFAULT 0.00`; el snapshot también usa
   `max_amount NOT NULL` ([`db_script.sql:L937-L948`](../../../db_script.sql#L937-L948) y
   [`db_script.sql:L1108-L1110`](../../../db_script.sql#L1108-L1110)).
4. `DDL` Antes del dominio, `distributors.is_active` no tiene coma antes de `created_by` y la tabla
   deja una coma final antes de `)` ([`db_script.sql:L5-L20`](../../../db_script.sql#L5-L20)). Son
   errores sintácticos reales anteriores a `refund_*`, por lo que el script no finaliza limpiamente.
   El archivo no activa `ON_ERROR_STOP` ni envuelve todas las sentencias en una transacción. Con
   `psql -f`, que continúa tras un error por defecto, las sentencias posteriores pueden aplicarse
   parcialmente; un cliente configurado para detenerse sí puede terminar antes. El DDL no fija el
   comportamiento del cliente que lo ejecuta.

Estas inconsistencias se conservan por la decisión explícita de documentar `db_script.sql`
literalmente como última actualización. Corregirlas aquí habría creado un modelo distinto de la
fuente y roto la trazabilidad.

## Otras brechas verificadas

| Brecha | Evidencia y consecuencia documental |
|---|---|
| Motivo débilmente vinculado | `refund_order_details.reason` es nullable y no tiene FK a `refund_reasons`; se pueden guardar NULL o códigos inexistentes. |
| Instancia vigente no vinculada | `refund_orders.current_workflow_instance_id` no tiene FK ni regla que exija que la instancia pertenezca a la misma nota. |
| Distribuidora sin FK activa | La FK de `refund_orders.distributor_id` está comentada; el valor es una referencia escalar. |
| Catálogos no restringidos | `document_type`, estados de nota/instancia/nivel, `line_status`, `decision_mode`, `action`, `decision`, `previous_status` y `new_status` carecen de `CHECK`. |
| Snapshot incompleto | `refund_workflow_instance_levels` no conserva `approval_policy`, `required_approvals`, `on_reject`, `sla_hours` ni `workflow_version_id`. |
| Acciones mutables | El DDL no prohíbe `UPDATE` o `DELETE`; además incluye `updated_by`, `updated_at` y `deleted_at`. Por tanto, no es append-only por DDL. |
| Sin índices de consulta | No hay índices adicionales para FK, estados, roles, fechas, nota, instancia vigente ni trazabilidad. |
| Sin unicidades de negocio | Solo existen las PK; no se impiden duplicados funcionales de notas, niveles, intentos, decisiones o acciones. |
| Referencias externas sin FK | Distribuidora, empleado, propietario, cliente, producto, roles, SAP y actores no tienen integridad referencial activa desde el bloque. |
| Total no derivado | `refund_orders.total` es escribible y no se compara con sus líneas. |
| Suma de orígenes no persistida | La igualdad entre suma de orígenes y cantidad de línea se delega a una transacción no incluida. |
| Selección sin cierre relacional | No se exige que la acción sea `LEVEL1_ITEM_SELECTION`, que exista una decisión por cada línea o que acción y línea pertenezcan a la misma nota. |
| Reactivación sin invariantes | La FK no exige misma nota, incremento de `attempt`, intento previo cerrado, ausencia de ciclos ni una única cadena. |

## Matriz breve de invariantes

La columna `DDL` describe la estructura si la sentencia correspondiente pudiera crearse; no elimina
los errores de ejecutabilidad del archivo literal.

| Invariante | Garantizado por `DDL` | Delegado a `APLICACIÓN` | Solo `COMENTARIO` | No definido |
|---|---:|---:|---:|---:|
| Unicidad de cada PK | Sí |  |  |  |
| Existencia del padre para las 13 FK declaradas | Sí |  |  |  |
| `0 <= detail.quantity <= source_quantity` | Sí |  |  |  |
| Origen con cantidad positiva e identificador | Sí |  |  |  |
| Tamaño de imagen positivo cuando se informa | Sí |  |  |  |
| Suma de orígenes igual a cantidad de línea |  | Sí |  |  |
| `total` igual a líneas activas por precio |  |  | Sí |  |
| Catálogos de estados de documento y workflow |  |  | Sí |  |
| Selección binaria exclusiva del nivel 1 |  |  | Sí |  |
| Una sola versión activa de niveles |  |  | Sí |  |
| Instancia vigente pertenece a la nota |  |  |  | Sí |
| Una instancia abierta por nota |  |  |  | Sí |
| Un intento por número y nota |  |  |  | Sí |
| Acción append-only |  |  |  | Sí |
| Integridad con distribuidora, cliente, empleado y producto |  |  |  | Sí |
| Correspondencia entre configuración y snapshot de nivel |  |  |  | Sí |

## Trazabilidad de notas e intentos

`DDL` La trazabilidad posible se apoya en cuatro referencias reales y una escalar:

| Recorrido | Campo | Alcance real |
|---|---|---|
| Nota disociada a nota fuente | `refund_orders.source_refund_order_id` | FK nullable; no valida `document_type` ni `split_sequence`. |
| Línea copiada a línea fuente | `refund_order_details.source_detail_id` | FK nullable; no valida que las cabeceras también estén relacionadas. |
| Acción a nota relacionada | `refund_workflow_actions.related_refund_order_id` | FK nullable; el comentario la presenta como puente a la disociada, sin condicionar `action`. |
| Intento reactivado a intento anterior | `refund_workflow_instances.reactivated_from_instance_id` | FK nullable; no valida la cadena de reintentos. |
| Nota a intento vigente | `refund_orders.current_workflow_instance_id` | Relación escalar comentada, sin FK. |

El [diagrama de trazabilidad](../../../diagrams/devoluciones/db-script-2026-09-01/02-trazabilidad-notas.plantuml)
evita cardinalidades de negocio que estas referencias no imponen.

## Propuesta HTTP histórica, no derivable del DDL

`PENDIENTE` El bloque actual no declara rutas, métodos, payloads, autorización, errores ni
transacciones HTTP. Por tanto, **ninguno de los 16 elementos siguientes se documenta como vigente**.
Solo se inventarían o recuperarían desde artefactos anteriores, donde figuran como propuesta
histórica:

| # histórico | Operación propuesta anteriormente | Evidencia histórica |
|---|---|---|
| 1 | `POST /refunds` | [`DevolucionesV2.md`](../DevolucionesV2.md#registro-de-la-devolución) |
| 2 | `GET /refunds` | [`DevolucionesV2.md`](../DevolucionesV2.md#bandeja-de-devoluciones) |
| 3 | `GET /refunds/:id` | [`DevolucionesV2.md`](../DevolucionesV2.md#detalle-de-la-nota) |
| 4 | `POST /refunds/:id/levels/current/view` | [`DocumentacionDevoluciones.md`](../DocumentacionDevoluciones.md#485-sellar-la-primera-apertura-del-nivel) |
| 5 | `POST /refunds/:id/levels/1/item-selection` | [`DocumentacionDevoluciones.md`](../DocumentacionDevoluciones.md#486-selección-de-ítems-del-nivel-1-y-disociación) |
| 6 | `POST /refunds/:id/levels/current/approve` | [`DocumentacionDevoluciones.md`](../DocumentacionDevoluciones.md#487-aprobar-el-nivel-activo) |
| 7 | `POST /refunds/:id/levels/current/reject` | [`DocumentacionDevoluciones.md`](../DocumentacionDevoluciones.md#488-rechazar-el-nivel-activo) |
| 8 | `POST /refunds/:id/reactivate` | [`DevolucionesV2.md`](../DevolucionesV2.md#reactivar-una-nota-rechazada) |
| 9 | `PUT /refunds/:id/items` | [`DevolucionesV2.md`](../DevolucionesV2.md#editar-las-líneas-de-una-nota-disociada) |
| 10 | `POST /refunds/:id/resubmit` | [`DevolucionesV2.md`](../DevolucionesV2.md#reenviar-la-nota-disociada-a-aprobación) |
| 11 | `POST /refunds/:id/cancel` | [`DevolucionesV2.md`](../DevolucionesV2.md#anular-la-nota) |
| 12 | `GET /refunds/:id/history` | [`DevolucionesV2.md`](../DevolucionesV2.md#historial-de-la-nota) |
| 13 | `GET` y `POST /refund-approval-levels` | [`DocumentacionDevoluciones.md`](../DocumentacionDevoluciones.md#4816-configuración-de-la-escalera) |
| 14 | `GET /refunds/:id/approvers` | [`DevolucionesV2.md`](../DevolucionesV2.md#aprobadores-del-nivel-actual) |
| 15 | `GET /refunds/returnable-products` | [`DocumentacionDevoluciones.md`](../DocumentacionDevoluciones.md#481-consultar-productos-devolubles-de-un-cliente) |
| 16 | `POST /refunds/:id/comments` | [`DevolucionesV2.md`](../DevolucionesV2.md#comentar-la-nota) |

Los diagramas `diagrams/dev_*` asociados están inventariados como históricos en el
[índice de diagramas](../../../diagrams/devoluciones/README.md#diagramas-históricos-dev_). El mockup
[`src/mockup/devoluciones/`](../../../src/mockup/devoluciones/) también es una referencia separada:
su comportamiento no completa ni valida este DDL.

## Preguntas pendientes

1. `PENDIENTE` ¿`owner_id` y `customer_id` representan entidades distintas? Si es así, ¿cuáles son
   sus tablas o sistemas de origen?
2. `PENDIENTE` ¿Debe corregirse `ck_refund_level_min_amount` para usar `min_amount`, o debe volver la
   columna `activation_min_amount` en una migración futura?
3. `PENDIENTE` ¿Debe existir `sla_hours` y conservarse por nivel de instancia?
4. `PENDIENTE` ¿Cómo se representa el último nivel sin techo: `max_amount NULL`, otro valor o una
   regla externa?
5. `PENDIENTE` ¿Qué política, regla de rechazo y número de aprobaciones deben conservarse en el
   snapshot del intento?
6. `PENDIENTE` ¿Qué estados, acciones y decisiones deben convertirse en catálogos restringidos y
   cuáles deben permanecer extensibles?
7. `PENDIENTE` ¿Cuál es la clave de negocio de una nota y de sus disociadas?
8. `PENDIENTE` ¿Se requiere una sola instancia abierta/vigente por nota y cómo se garantiza bajo
   concurrencia?
9. `PENDIENTE` ¿Las acciones deben ser append-only en base de datos y qué estrategia de corrección
   histórica se admite?
10. `PENDIENTE` ¿Qué referencias externas deben recibir FK locales y cuáles deben mantenerse como
    identificadores de otros sistemas?
11. `PENDIENTE` ¿Existe o se implementará la transacción que valida total, suma de orígenes,
    selección completa y consistencia de la acción puente?
12. `PENDIENTE` ¿Habrá un contrato HTTP aprobado separado del DDL? Las 16 operaciones anteriores no
    responden esa pregunta.

## Checklist de revisión futura

- [ ] Recalcular SHA-256, `HEAD` y último commit de `db_script.sql` antes de declarar una nueva fotografía.
- [ ] Revisar el bloque por rango de líneas y registrar cualquier desplazamiento.
- [ ] Resolver cada inconsistencia mediante un cambio separado, sin reescribir esta fotografía.
- [ ] Validar el script corregido en una instancia PostgreSQL limpia y registrar versión y salida.
- [ ] Confirmar nulabilidad, defaults, PK, FK y `CHECK` contra una base desplegada si existe.
- [ ] Decidir catálogos, unicidades e índices a partir de requisitos aprobados y carga esperada.
- [ ] Confirmar la frontera con retornos logísticos antes de agregar cualquier integración.
- [ ] Verificar que el snapshot conserve toda política necesaria para reproducir decisiones históricas.
- [ ] Definir y probar invariantes transaccionales de totales, orígenes, disociación y reactivación.
- [ ] Revisar los tres PlantUML después de cada cambio estructural.
- [ ] Mantener los documentos, SQL, mockup y `dev_*` anteriores como artefactos históricos separados.
- [ ] Documentar un contrato HTTP solo cuando exista una decisión explícita y una fuente propia.

## Navegación

- [README de esta fotografía](./README.md)
- [Índice de versiones de devoluciones](../README.md)
- [Catálogo de diagramas vigentes](../../../diagrams/devoluciones/db-script-2026-09-01/README.md)
- [Fuente literal completa](../../../db_script.sql)
