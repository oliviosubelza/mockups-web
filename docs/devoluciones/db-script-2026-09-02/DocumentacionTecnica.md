# Devoluciones: documentación técnica del worktree 2026-09-02

## Conclusión

Esta fotografía documenta literalmente las 10 tablas `refund_*` después de corregir sus
inconsistencias mecánicas autorizadas. El bloque ya no usa tipos ajenos a PostgreSQL ni restricciones
que nombren columnas inexistentes. No es un rediseño: conserva `max_amount`, `required_approvals`,
estados sin `CHECK`, referencias externas sin FK, ausencia de índices y las demás decisiones no
autorizadas.

El archivo completo todavía contiene errores fuera del dominio, entre ellos la sintaxis de
`distributors` en [`db_script.sql:L5-L20`](../../../db_script.sql#L5-L20). Por ello no se afirma que
el script completo finalice limpiamente. Como no activa detención ante errores ni envuelve todas las
sentencias en una única transacción, un cliente puede aplicar sentencias parcialmente.

## Ruta de revisión

1. Confirmar la [fuente del worktree](#fuente-fijada).
2. Leer las [etiquetas de certeza](#etiquetas-de-certeza).
3. Revisar las [correcciones mecánicas](#correcciones-mecánicas-aplicadas).
4. Consultar las [132 columnas](#inventario-del-modelo).
5. Verificar [PK, FK, `CHECK` y ausencias](#integridad-declarada).
6. Cerrar con [limitaciones](#limitaciones-conservadas), [preguntas](#preguntas-pendientes) y
   [checklist](#checklist-de-revisión-futura).

Contratos vigentes: [ContratosHttp.md](./ContratosHttp.md), respaldados por el
[registro de decisiones](./Decisiones.md).

## Fuente fijada

| Dato | Valor |
|---|---|
| Archivo | [`db_script.sql`](../../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1172`](../../../db_script.sql#L915-L1172) |
| Fecha | `2026-09-02` |
| Base `HEAD` | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| Estado | Fotografía del worktree; no es un commit nuevo |
| SHA-256 completo | `2c62523505a864bc84c44db70d5f195f74a9b1b99f626399efcce1f41437f185` |

## Etiquetas de certeza

| Etiqueta | Significado |
|---|---|
| `DDL` | Declaración activa del SQL: tabla, columna, default, PK, FK o `CHECK`. |
| `COMENTARIO` | Intención o catálogo escrito en comentarios, sin garantía equivalente. |
| `APLICACIÓN` | Regla que debe ejecutar el servicio o una transacción. |
| `CONTRATO` | Comportamiento HTTP respaldado por [Decisiones.md](./Decisiones.md) y descrito en [ContratosHttp.md](./ContratosHttp.md). |
| `PENDIENTE` | Ambigüedad que esta fotografía no decide. |

## Alcance y frontera

`DDL` El dominio comienza en `DEVOLUTIONS` y termina con las decisiones por línea:
[`db_script.sql:L915-L1172`](../../../db_script.sql#L915-L1172). Modela catálogo de motivos, notas,
líneas, fuentes, imágenes y workflow de aprobación.

`PENDIENTE` No hay una FK o tabla puente hacia los retornos de carga, activos logísticos, entregas o
cierres de ruta presentes antes de este bloque. Esta fotografía no afirma integración con esos
dominios.

## Correcciones mecánicas aplicadas

| Área | Resultado literal |
|---|---|
| PK del motivo | `id BIGSERIAL PRIMARY KEY`. |
| Catálogo de motivo | Conserva un único `CHECK` para `lot_requirement`. |
| Políticas | El catálogo aplicado es `ANY` y `ALL`; `required_approvals` permanece. |
| Monto mínimo | `ck_refund_level_min_amount` valida `min_amount >= 0`. |
| SLA | Se retiró la restricción que dependía de una columna no activa. |
| Motivo de línea | `reason_id BIGINT NOT NULL` con FK a `refund_reasons.id`. |
| Identidad del origen | Factura o lote debe ser no NULL. |
| Imagen | La tabla persiste `url` y no conserva un `CHECK` sobre un campo retirado. |

`DDL` El bloque activo resultante contiene 10 tablas, 132 columnas, 10 PK, 14 FK y 9 `CHECK`.

## Inventario del modelo

| Capa | Tabla | Función observable |
|---|---|---|
| Configuración | `refund_reasons` | Motivos seleccionables. |
| Configuración | `refund_approval_levels` | Escalera publicada de aprobación. |
| Documento | `refund_orders` | Cabecera original o disociada. |
| Documento | `refund_order_details` | Líneas, cantidades, precio y motivo. |
| Evidencia | `refund_order_detail_sources` | Factura, lote y cantidad de origen. |
| Evidencia | `refund_order_detail_image` | URL de imagen por línea. |
| Workflow | `refund_workflow_instances` | Intentos de aprobación. |
| Workflow | `refund_workflow_instance_levels` | Niveles materializados por intento. |
| Workflow | `refund_workflow_actions` | Acciones del intento. |
| Workflow | `refund_order_detail_decisions` | Decisiones de selección por línea. |

### `refund_reasons`

Fuente: [`db_script.sql:L916-L930`](../../../db_script.sql#L916-L930).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador numérico del motivo. |
| `name` | `VARCHAR(150)` | `NOT NULL`; sin default explícito | `COMENTARIO` Etiqueta visible del motivo. |
| `description` | `VARCHAR(300)` | `NOT NULL`; sin default explícito | `COMENTARIO` Explicación breve del motivo. |
| `lot_requirement` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'OPTIONAL'` | `DDL` Limitado a `REQUIRED`, `OPTIONAL`, `HIDDEN`. |
| `is_active` | `BOOLEAN` | `NOT NULL`; `DEFAULT TRUE` | `COMENTARIO` Controla si aparece en el selector. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | No se actualiza automáticamente por este DDL. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

### `refund_approval_levels`

Fuente: [`db_script.sql:L933-L963`](../../../db_script.sql#L933-L963).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de nivel configurado. |
| `workflow_version_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Agrupa una versión publicada; sin FK ni tabla de versión. |
| `level_order` | `SMALLINT` | `NOT NULL`; sin default | `DDL` Debe ser mayor o igual que 1. |
| `name` | `VARCHAR(100)` | `NOT NULL`; sin default | `COMENTARIO` Nombre del escritorio. |
| `role_code` | `VARCHAR(50)` | `NOT NULL`; sin default | `COMENTARIO` Rol que decide; sin FK. |
| `min_amount` | `DECIMAL(12,2)` | `NOT NULL`; `DEFAULT 0.00` | `DDL` Debe ser mayor o igual que 0. |
| `max_amount` | `DECIMAL(12,2)` | `NOT NULL`; `DEFAULT 0.00` | `COMENTARIO` Techo máximo; contradice la intención de último nivel sin techo. |
| `approval_policy` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'ANY'` | `DDL` Solo `ANY` o `ALL`. |
| `required_approvals` | `SMALLINT` | `NOT NULL`; `DEFAULT 1` | `PENDIENTE` Campo conservado sin semántica nueva definida para las políticas vigentes. |
| `on_reject` | `VARCHAR(30)` | `NOT NULL`; `DEFAULT 'TERMINATE'` | `DDL` `TERMINATE` o `RETURN_PREVIOUS`; este último se prohíbe en nivel 1. |
| `is_active` | `BOOLEAN` | `NOT NULL`; `DEFAULT TRUE` | `COMENTARIO` Una sola versión activa; no hay unicidad que lo garantice. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | No se actualiza automáticamente por este DDL. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

La declaración comentada de plazo no forma una columna activa ni se materializa en los niveles del
intento.

### `refund_orders`

Fuente: [`db_script.sql:L966-L994`](../../../db_script.sql#L966-L994).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de nota. |
| `note_number` | `VARCHAR(50)` | `NOT NULL`; sin default | `COMENTARIO` Número visible; sin unicidad. |
| `split_sequence` | `SMALLINT` | `NOT NULL`; `DEFAULT 0` | `COMENTARIO` Distingue original y disociada; sin `CHECK`. |
| `source_refund_order_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Fuente de la nota; FK autorreferente. |
| `document_type` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'ORIGINAL'` | `COMENTARIO` `ORIGINAL` o `DISSOCIATED`; sin `CHECK`. |
| `status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'OPEN'` | `COMENTARIO` `OPEN`, `APPROVED`, `REJECTED`, `ANNULLED`; sin `CHECK`. |
| `current_workflow_instance_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Instancia vigente; sin FK. |
| `distributor_id` | `BIGINT` | `NOT NULL`; sin default | Distribuidora; su FK está comentada. |
| `employee_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Vendedor; referencia externa sin FK. |
| `owner_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Cliente; diferencia frente a `customer_id` pendiente. |
| `customer_id` | `BIGINT` | `NOT NULL`; sin default | Referencia externa sin comentario específico ni FK. |
| `replacement_date` | `DATE` | NULL; sin default | `COMENTARIO` Reposición estimada. |
| `justification` | `TEXT` | NULL; sin default | `COMENTARIO` Justificación del vendedor. |
| `total` | `DECIMAL(12,2)` | `NOT NULL`; `DEFAULT 0.00` | `COMENTARIO` Suma de cantidad por precio de líneas activas; no se deriva por DDL. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | No se actualiza automáticamente por este DDL. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

### `refund_order_details`

Fuente: [`db_script.sql:L996-L1020`](../../../db_script.sql#L996-L1020).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de línea. |
| `refund_order_id` | `BIGINT` | `NOT NULL`; sin default | Nota propietaria; FK real. |
| `source_detail_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Línea fuente para trazabilidad; FK autorreferente. |
| `product_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Producto; referencia externa sin FK. |
| `source_quantity` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Cantidad original; el DDL no impide actualizarla. |
| `quantity` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `DDL` Debe cumplir `0 <= quantity <= source_quantity`. |
| `price_unit` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Precio congelado; no tiene `CHECK` de signo. |
| `line_status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'ACTIVE'` | `COMENTARIO` `ACTIVE` o `DISSOCIATED`; sin `CHECK`. |
| `reason_id` | `BIGINT` | `NOT NULL`; sin default | `DDL` FK obligatoria a `refund_reasons.id`. |
| `notes` | `TEXT` | NULL; sin default | `COMENTARIO` Observación libre. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | No se actualiza automáticamente por este DDL. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

### `refund_order_detail_sources`

Fuente: [`db_script.sql:L1022-L1051`](../../../db_script.sql#L1022-L1051).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de origen. |
| `refund_order_detail_id` | `BIGINT` | `NOT NULL`; sin default | Línea respaldada; FK real. |
| `invoice_number` | `VARCHAR(50)` | NULL; sin default | `COMENTARIO` Número de factura. |
| `invoiced_at` | `DATE` | NULL; sin default | `COMENTARIO` Fecha de factura congelada; el DDL no impide actualizarla. |
| `quantity` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `DDL` Debe ser mayor que 0. |
| `lot` | `VARCHAR(50)` | NULL; sin default | `COMENTARIO` Lote. |
| `due_date` | `DATE` | NULL; sin default | `COMENTARIO` Vencimiento del lote. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | No se actualiza automáticamente por este DDL. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

`DDL` Cada origen exige factura o lote. `APLICACIÓN` La suma de `quantity` de los orígenes debe
coincidir con la cantidad de la línea; el comentario delega esa regla a la transacción.

### `refund_order_detail_image`

Fuente: [`db_script.sql:L1053-L1063`](../../../db_script.sql#L1053-L1063).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de imagen. |
| `refund_order_detail_id` | `BIGINT` | `NOT NULL`; sin default | Línea documentada; FK real. |
| `url` | `VARCHAR(255)` | NULL; sin default | `COMENTARIO` Ruta de imagen; sin validación DDL de formato o contenido. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

### `refund_workflow_instances`

Fuente: [`db_script.sql:L1068-L1086`](../../../db_script.sql#L1068-L1086).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de intento. |
| `refund_order_id` | `BIGINT` | `NOT NULL`; sin default | Nota asociada; FK real. |
| `attempt` | `SMALLINT` | `NOT NULL`; `DEFAULT 1` | `COMENTARIO` Número de intento; sin `CHECK` o unicidad. |
| `status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'IN_APPROVAL'` | `COMENTARIO` Catálogo de estado; sin `CHECK`. |
| `current_level_order` | `SMALLINT` | NULL; sin default | `COMENTARIO` Nivel vigente; sin rango ni coherencia con estado. |
| `reactivated_from_instance_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Intento anterior; FK autorreferente. |
| `started_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | `COMENTARIO` Inicio del intento. |
| `finished_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Fin del intento; sin coherencia temporal. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | No se actualiza automáticamente por este DDL. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

### `refund_workflow_instance_levels`

Fuente: [`db_script.sql:L1088-L1118`](../../../db_script.sql#L1088-L1118).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador del nivel materializado. |
| `workflow_instance_id` | `BIGINT` | `NOT NULL`; sin default | Instancia propietaria; FK real. |
| `level_order` | `SMALLINT` | `NOT NULL`; sin default | `COMENTARIO` Orden; sin `CHECK` o unicidad por instancia. |
| `level_name` | `VARCHAR(100)` | `NOT NULL`; sin default | `COMENTARIO` Nombre del nivel. |
| `role_code` | `VARCHAR(50)` | `NOT NULL`; sin default | `COMENTARIO` Rol aprobador; sin FK. |
| `min_amount` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Piso materializado; sin `CHECK`. |
| `max_amount` | `DECIMAL(12,2)` | `NOT NULL`; sin default | `COMENTARIO` Techo materializado; no representa ausencia de techo con NULL. |
| `decision_mode` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'DOCUMENT_DECISION'` | `COMENTARIO` Selección de items o decisión documental; sin `CHECK`. |
| `status` | `VARCHAR(20)` | `NOT NULL`; `DEFAULT 'PENDING'` | `COMENTARIO` Estado del nivel; sin `CHECK`. |
| `first_viewed_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Primera apertura; el DDL permite sobrescribirla. |
| `first_viewed_by` | `VARCHAR(255)` | NULL; sin default | `COMENTARIO` Persona que abrió; sin FK. |
| `started_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Inicio del nivel. |
| `finished_at` | `TIMESTAMP` | NULL; sin default | `COMENTARIO` Fin del nivel; sin coherencia temporal. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | No se actualiza automáticamente por este DDL. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Marca nullable de borrado lógico. |

El nivel materializado conserva nombre, rol y banda, pero no política, cantidad requerida de
aprobaciones, regla de rechazo, versión de configuración ni plazo.

### `refund_workflow_actions`

Fuente: [`db_script.sql:L1123-L1159`](../../../db_script.sql#L1123-L1159).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de acción. |
| `workflow_instance_id` | `BIGINT` | `NOT NULL`; sin default | Instancia propietaria; FK real. |
| `workflow_instance_level_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Nivel opcional; FK real cuando tiene valor. |
| `related_refund_order_id` | `BIGINT` | NULL; sin default | `COMENTARIO` Nota disociada relacionada; FK real sin condición por acción. |
| `action` | `VARCHAR(30)` | `NOT NULL`; sin default | `COMENTARIO` Catálogo de acciones; sin `CHECK`. |
| `actor_employee_code` | `BIGINT` | NULL; sin default | `COMENTARIO` Actor; referencia externa sin FK. |
| `actor_role_code` | `VARCHAR(50)` | NULL; sin default | `COMENTARIO` Rol del actor; sin FK. |
| `system_summary` | `TEXT` | NULL; sin default | `COMENTARIO` Resumen autogenerado. |
| `comment` | `TEXT` | NULL; sin default | `COMENTARIO` Comentario del revisor. |
| `reason` | `TEXT` | NULL; sin default | `COMENTARIO` Obligatorio según acción; el DDL no lo impone. |
| `previous_status` | `VARCHAR(20)` | NULL; sin default | `COMENTARIO` Estado anterior; sin catálogo. |
| `new_status` | `VARCHAR(20)` | NULL; sin default | Estado nuevo; sin catálogo. |
| `amount_before` | `DECIMAL(12,2)` | NULL; sin default | `COMENTARIO` Monto anterior para ciertas acciones. |
| `amount_after` | `DECIMAL(12,2)` | NULL; sin default | `COMENTARIO` Monto posterior para ciertas acciones. |
| `created_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `updated_by` | `VARCHAR(255)` | NULL; sin default | Auditoría sin FK. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación. |
| `updated_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Permite actualización. |
| `deleted_at` | `TIMESTAMP` | NULL; sin default | Permite borrado lógico. |

`DDL` La tabla no es append-only: no prohíbe actualización o eliminación y contiene campos para
ambas operaciones.

### `refund_order_detail_decisions`

Fuente: [`db_script.sql:L1162-L1172`](../../../db_script.sql#L1162-L1172).

| Columna | Tipo | Nulabilidad / default (`DDL`) | Semántica literal |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK; autogenerado | Identificador de decisión. |
| `workflow_action_id` | `BIGINT` | `NOT NULL`; sin default | `COMENTARIO` Acción de selección; FK real sin validar su tipo. |
| `refund_order_detail_id` | `BIGINT` | `NOT NULL`; sin default | Línea decidida; FK real. |
| `decision` | `VARCHAR(20)` | `NOT NULL`; sin default | `COMENTARIO` `SELECTED` o `DISSOCIATED`; sin `CHECK`. |
| `created_at` | `TIMESTAMP` | NULL; `DEFAULT CURRENT_TIMESTAMP` | Marca de creación sin inmutabilidad. |

## Integridad declarada

### PK y FK reales

Las 10 tablas tienen una PK. Las 14 FK activas son:

| Restricción | Campo hijo | Destino | Límite |
|---|---|---|---|
| `fk_refund_order_source` | `refund_orders.source_refund_order_id` | `refund_orders.id` | Nullable; no evita ciclos. |
| `fk_refund_order_detail_order` | `refund_order_details.refund_order_id` | `refund_orders.id` | Obligatoria. |
| `fk_refund_order_detail_source` | `refund_order_details.source_detail_id` | `refund_order_details.id` | Nullable; no valida cabeceras relacionadas. |
| `fk_refund_order_detail_reason` | `refund_order_details.reason_id` | `refund_reasons.id` | Obligatoria; no valida actividad o borrado lógico. |
| `fk_refund_source_detail` | `refund_order_detail_sources.refund_order_detail_id` | `refund_order_details.id` | Obligatoria. |
| `fk_refund_photo_detail` | `refund_order_detail_image.refund_order_detail_id` | `refund_order_details.id` | Obligatoria. |
| `fk_refund_wf_instance_order` | `refund_workflow_instances.refund_order_id` | `refund_orders.id` | Obligatoria. |
| `fk_refund_wf_instance_reactivated` | `refund_workflow_instances.reactivated_from_instance_id` | `refund_workflow_instances.id` | Nullable; no valida secuencia o misma nota. |
| `fk_refund_wf_instance_level_instance` | `refund_workflow_instance_levels.workflow_instance_id` | `refund_workflow_instances.id` | Obligatoria. |
| `fk_refund_wf_action_instance` | `refund_workflow_actions.workflow_instance_id` | `refund_workflow_instances.id` | Obligatoria. |
| `fk_refund_wf_action_level` | `refund_workflow_actions.workflow_instance_level_id` | `refund_workflow_instance_levels.id` | Nullable; no exige misma instancia. |
| `fk_refund_wf_action_related_order` | `refund_workflow_actions.related_refund_order_id` | `refund_orders.id` | Nullable; no depende del tipo de acción. |
| `fk_refund_detail_decision_action` | `refund_order_detail_decisions.workflow_action_id` | `refund_workflow_actions.id` | Obligatoria; no valida el tipo de acción. |
| `fk_refund_detail_decision_detail` | `refund_order_detail_decisions.refund_order_detail_id` | `refund_order_details.id` | Obligatoria; no exige misma nota que la acción. |

Ninguna FK declara acciones `ON DELETE` u `ON UPDATE` explícitas.

### `CHECK` reales

| Restricción | Expresión resumida |
|---|---|
| `ck_refund_reason_lot` | `lot_requirement` pertenece a `REQUIRED`, `OPTIONAL`, `HIDDEN`. |
| `ck_refund_level_policy` | `approval_policy` pertenece a `ANY`, `ALL`. |
| `ck_refund_level_on_reject` | `on_reject` pertenece a `TERMINATE`, `RETURN_PREVIOUS`. |
| `ck_refund_level_return_previous` | Nivel 1 no puede volver al nivel anterior. |
| `ck_refund_level_order` | `level_order >= 1`. |
| `ck_refund_level_min_amount` | `min_amount >= 0`. |
| `ck_refund_order_detail_qty` | `0 <= quantity <= source_quantity`. |
| `ck_refund_source_qty` | `quantity > 0`. |
| `ck_refund_source_identified` | `invoice_number` o `lot` debe ser no NULL. |

Todos los identificadores de columna usados por estos `CHECK` existen en su tabla.

### Relaciones escalares sin FK

| Campo | Destino sugerido | Estado |
|---|---|---|
| `refund_orders.current_workflow_instance_id` | `refund_workflow_instances.id` | `COMENTARIO`; sin FK. |
| `refund_orders.distributor_id` | `distributors.id` | FK comentada. |
| `employee_id`, `owner_id`, `customer_id` | Identidades externas | Sin FK. |
| `refund_order_details.product_id` | Catálogo de productos | Sin FK. |
| Campos `role_code` | Directorio de roles | Sin FK. |
| Campos de actor y auditoría | Directorio de personas o servicios | Sin FK. |
| `workflow_version_id` | Versión publicada | No existe tabla destino. |
| `refund_order_detail_image.url` | Recurso externo | Sin FK ni validación de formato. |

### Índices y unicidad

`DDL` El bloque no declara `CREATE INDEX` ni `UNIQUE` adicionales. Solo las PK generan sus índices.
No hay unicidad de negocio para número y split, versión y orden, intento por nota, nivel por intento,
decisión por línea, aprobación por actor, URL, versión activa o instancia vigente.

## Reglas fuera del DDL

| Regla | Certeza |
|---|---|
| Motivos activos y no borrados para nuevas líneas | `CONTRATO` y `APLICACIÓN`; la FK solo garantiza existencia. |
| GET con `id`, `name`, `description`, `lotRequirement` | `CONTRATO`; `name` y `description` son no vacíos y respetan 150/300 caracteres. |
| `lotRequirement` aplicado a cada source | `CONTRATO` y `APLICACIÓN`; `REQUIRED` exige lote, `OPTIONAL` lo permite y `HIDDEN` lo prohíbe y exige factura. |
| IDs positivos dentro de `BIGINT` | `CONTRATO` y `APLICACIÓN`; incumplir el rango produce `422`. |
| Decimales dentro de `DECIMAL(12,2)` | `CONTRATO` y `APLICACIÓN`; se valida escala, rango y total calculado antes de persistir. |
| Máximo 50 items y 50 sources por item | `CONTRATO` y `APLICACIÓN`; el DDL no limita cardinalidades. |
| Total como suma de cantidad por precio | `COMENTARIO`; creación lo calcula por contrato. |
| Suma de orígenes igual a cantidad de línea | `APLICACIÓN`; declarada en comentario transaccional. |
| Una sola versión activa y válida por creación | `CONTRATO` y `APLICACIÓN`; el DDL no lo garantiza y una violación produce `503`. |
| Sales como frontera de confianza comercial | `CONTRATO`; Refunds no revalida elegibilidad, producto, cliente/factura, precio o cantidad devolvible. |
| Creación completa antes de `COMMIT` | `CONTRATO` y `APLICACIÓN`; se verifican cardinalidades de escritura y se revierte cualquier diferencia. |
| Estados de documento, instancia, nivel, acción y decisión | `COMENTARIO`; sin `CHECK`. |
| Instancia vigente pertenece a la nota | `COMENTARIO`; sin FK. |
| Primera apertura inmutable | `COMENTARIO`; el DDL permite actualización. |
| Acción inmutable | No garantizada; la tabla permite actualización y borrado lógico. |

### Configuración seleccionada por la creación

`APLICACIÓN` `POST /api/v1/refunds` abre una transacción `REPEATABLE READ` y lee una sola vez todas
las filas de `refund_approval_levels` activas y no borradas. Antes de escribir exige exactamente un
`workflow_version_id`, al menos un nivel, `level_order` único y consecutivo desde 1 y
`min_amount >= 0`. No desempata configuraciones: cualquier incumplimiento responde `503` y revierte
la transacción. La semántica de `max_amount` permanece `PENDIENTE`.

### Snapshot de nivel en runtime

| Configuración de origen | Runtime | Estado |
|---|---|---|
| `level_order` | `level_order` | Copiado. |
| `name` | `level_name` | Copiado. |
| `role_code` | `role_code` | Copiado. |
| `min_amount` | `min_amount` | Copiado. |
| `max_amount` | `max_amount` | Copiado sin interpretar un techo abierto. |
| `workflow_version_id` | Sin columna | No se conserva. |
| `approval_policy` | Sin columna | No se conserva. |
| `required_approvals` | Sin columna | No se conserva. |
| `on_reject` | Sin columna | No se conserva. |

`decision_mode` pertenece al nivel de runtime y no prueba qué versión o política originó el
snapshot. Esta pérdida de contexto está fijada en [D-009](./Decisiones.md#d-009).

### Atomicidad e idempotencia

`BEGIN`/`COMMIT` solo aporta atomicidad. Antes de confirmar, la aplicación verifica una cabecera,
todas las líneas, fuentes e imágenes solicitadas, una instancia, todos los niveles validados, una
acción `CREATED` y una actualización del puntero de instancia. Un error o una cardinalidad distinta
ejecuta `ROLLBACK`; esta comprobación de aplicación es la que evita confirmar un agregado incompleto.

`PENDIENTE` No hay idempotency key, unicidad de negocio ni algoritmo definido para `note_number`.
Un reintento después de una respuesta perdida puede confirmar una devolución adicional. Los límites
de 50 items y 50 sources por item acotan el volumen de cada intento, no su duplicación.

## Limitaciones conservadas

1. `COMENTARIO` La escalera afirma que el último nivel no tiene techo
   ([`db_script.sql:L933-L935`](../../../db_script.sql#L933-L935)), pero
   `refund_approval_levels.max_amount` sigue siendo `NOT NULL DEFAULT 0.00`
   ([`db_script.sql:L943-L944`](../../../db_script.sql#L943-L944)) y el nivel materializado también
   exige `max_amount NOT NULL` ([`db_script.sql:L1095-L1096`](../../../db_script.sql#L1095-L1096)).
2. `PENDIENTE` `required_approvals` permanece con `DEFAULT 1`, aunque las políticas vigentes son
   `ANY` y `ALL`; no tiene `CHECK` ni semántica adicional definida en
   [Decisiones.md](./Decisiones.md).
3. `DDL` `url` sigue siendo nullable. `CONTRATO` La creación exige URL no vacía cuando se incluye
   una imagen.
4. `DDL` Estados y catálogos de runtime siguen sin restricciones.
5. `DDL` Las referencias externas y el puntero de instancia vigente siguen sin FK.
6. `DDL` No existen índices de consulta ni unicidades de negocio adicionales.
7. `DDL` El snapshot del nivel no conserva la política completa de configuración.
8. `DDL` La bitácora de acciones no es append-only.
9. `DDL` El archivo completo conserva errores sintácticos fuera del dominio, incluido
   `distributors` ([`db_script.sql:L5-L20`](../../../db_script.sql#L5-L20)).
10. `PENDIENTE` No existen idempotency key, unicidad de negocio ni algoritmo definido para
    `note_number`; un reintento puede duplicar la devolución.

## Matriz de invariantes

| Invariante | `DDL` | `APLICACIÓN` / `CONTRATO` | Solo comentario | No definido |
|---|---:|---:|---:|---:|
| PK de cada tabla | Sí |  |  |  |
| Línea con motivo existente | Sí |  |  |  |
| Motivo activo y no borrado al crear |  | Sí |  |  |
| Cantidad de línea dentro de cantidad fuente | Sí |  |  |  |
| Origen positivo e identificado | Sí |  |  |  |
| Suma de orígenes igual a cantidad |  | Sí |  |  |
| Total calculado al crear |  | Sí |  |  |
| Una versión activa y válida al crear |  | Sí |  |  |
| Una instancia vigente por nota |  |  |  | Sí |
| Estados limitados a catálogos comentados |  |  | Sí |  |
| Acción append-only |  |  |  | Sí |
| Último nivel sin techo |  |  | Sí |  |

## Preguntas pendientes

1. ¿Qué diferencia de negocio existe entre `owner_id` y `customer_id`?
2. ¿Qué semántica, si alguna, conserva `required_approvals` bajo `ANY` y `ALL`?
3. ¿Cómo debe representarse un último nivel sin techo?
4. ¿Debe `url` pasar a `NOT NULL` en una evolución futura?
5. ¿Qué algoritmo, unicidad e idempotencia deben regir `note_number` y la creación?
6. ¿Qué referencias externas deben recibir FK locales?
7. ¿Qué estados y catálogos deben ser cerrados por base de datos?
8. ¿Qué índices requiere la carga real de consulta?

## Checklist de revisión futura

- [ ] Fijar una nueva fecha, hash y rangos después de cualquier cambio del SQL.
- [ ] Validar el script completo con un cliente PostgreSQL y detención ante errores.
- [ ] Resolver las preguntas pendientes mediante requisitos separados.
- [ ] Mantener las reglas de aplicación junto con pruebas transaccionales.
- [ ] Verificar que cada contrato vigente esté respaldado por [Decisiones.md](./Decisiones.md).
- [ ] Renderizar los diagramas cuando exista una herramienta PlantUML disponible.
- [ ] Preservar las fotografías anteriores sin reescribirlas.

## Navegación

- [README de la fotografía](./README.md)
- [Contratos HTTP](./ContratosHttp.md)
- [Registro de decisiones](./Decisiones.md)
- [Diagramas](../../../diagrams/devoluciones/db-script-2026-09-02/README.md)
- [Índice de versiones](../README.md)
