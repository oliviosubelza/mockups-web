# Devoluciones: índice de diagramas

Los diagramas vigentes derivados del worktree fijado el 2026-09-02 están en
[`db-script-2026-09-02/`](./db-script-2026-09-02/README.md). Los demás artefactos se conservan
separados para no mezclar evidencia del esquema actual con propuestas o ejemplos anteriores.

## Artefactos

| Artefacto | Condición | Alcance |
|---|---|---|
| [`db-script-2026-09-02/`](./db-script-2026-09-02/README.md) | Diagramas vigentes | Tres vistas persistidas y dos secuencias HTTP trazables al worktree. |
| [`db-script-2026-09-01/`](./db-script-2026-09-01/README.md) | Diagramas anteriores | Tres vistas del estado previo, conservadas íntegramente. |
| [`motor-devoluciones-ejemplo.xlsx`](./motor-devoluciones-ejemplo.xlsx) | Ejemplo previo conservado | Hoja de cálculo separada; no se toma como evidencia del DDL. |
| [`docs/devoluciones/diagramas/motor-aprobacion-flujo.excalidraw`](../../docs/devoluciones/diagramas/motor-aprobacion-flujo.excalidraw) | Flujo histórico | Diseño previo conservado; no demuestra restricciones actuales. |

## Diagramas históricos `dev_*`

Los 16 PlantUML `diagrams/dev_*.plantuml` representan secuencias de la propuesta HTTP anterior.
No son diagramas del DDL vigente y permanecen intactos:

- [`dev_01_post_create_refund_order.plantuml`](../dev_01_post_create_refund_order.plantuml)
- [`dev_02_get_refunds_list.plantuml`](../dev_02_get_refunds_list.plantuml)
- [`dev_03_get_refund_order_detail.plantuml`](../dev_03_get_refund_order_detail.plantuml)
- [`dev_04_post_register_level_view.plantuml`](../dev_04_post_register_level_view.plantuml)
- [`dev_05_post_level1_item_selection.plantuml`](../dev_05_post_level1_item_selection.plantuml)
- [`dev_06_post_approve_level.plantuml`](../dev_06_post_approve_level.plantuml)
- [`dev_07_post_reject_level.plantuml`](../dev_07_post_reject_level.plantuml)
- [`dev_08_post_reactivate_refund_order.plantuml`](../dev_08_post_reactivate_refund_order.plantuml)
- [`dev_09_put_seller_edit_items.plantuml`](../dev_09_put_seller_edit_items.plantuml)
- [`dev_10_post_seller_resubmit.plantuml`](../dev_10_post_seller_resubmit.plantuml)
- [`dev_11_post_cancel_refund_order.plantuml`](../dev_11_post_cancel_refund_order.plantuml)
- [`dev_12_get_refund_history.plantuml`](../dev_12_get_refund_history.plantuml)
- [`dev_13_refund_approval_levels_config.plantuml`](../dev_13_refund_approval_levels_config.plantuml)
- [`dev_14_get_role_directory_approvers.plantuml`](../dev_14_get_role_directory_approvers.plantuml)
- [`dev_15_get_returnable_products.plantuml`](../dev_15_get_returnable_products.plantuml)
- [`dev_16_post_refund_comment.plantuml`](../dev_16_post_refund_comment.plantuml)

La documentación asociada a la fotografía vigente está en
[`docs/devoluciones/db-script-2026-09-02/`](../../docs/devoluciones/db-script-2026-09-02/README.md).

## Fuente fijada

| Dato | Valor |
|---|---|
| Archivo | [`db_script.sql`](../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1172`](../../db_script.sql#L915-L1172) |
| Fecha | `2026-09-02` |
| Base `HEAD` del worktree | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| SHA-256 completo en el worktree | `2c62523505a864bc84c44db70d5f195f74a9b1b99f626399efcce1f41437f185` |
