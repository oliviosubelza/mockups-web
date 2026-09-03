# Devoluciones: índice de versiones

La fotografía documental vigente del dominio persistido es
[`db-script-2026-09-02/`](./db-script-2026-09-02/README.md). Describe literalmente el bloque
`refund_*` del worktree fijado el 2026-09-02; no reemplaza ni modifica los artefactos
anteriores y tampoco los presenta como vigentes o canónicos.

## Ruta rápida

1. Leer la [documentación técnica vigente](./db-script-2026-09-02/DocumentacionTecnica.md).
2. Revisar los [dos contratos HTTP vigentes](./db-script-2026-09-02/ContratosHttp.md).
3. Consultar el [registro de decisiones](./db-script-2026-09-02/Decisiones.md).
4. Contrastar cualquier afirmación con
   [`db_script.sql:L915-L1172`](../../db_script.sql#L915-L1172).
5. Consultar los [diagramas de la misma fotografía](../../diagrams/devoluciones/db-script-2026-09-02/README.md).

## Trazabilidad

| Artefacto | Condición documental | Uso correcto |
|---|---|---|
| [`db-script-2026-09-02/`](./db-script-2026-09-02/README.md) | Fotografía vigente del worktree | Modelo persistido literal de `db_script.sql:L915-L1172` y dos contratos HTTP respaldados por su [registro de decisiones](./db-script-2026-09-02/Decisiones.md). |
| [`db-script-2026-09-01/`](./db-script-2026-09-01/README.md) | Fotografía anterior | Estado documental previo, conservado íntegramente para trazabilidad. |
| [`DocumentacionDevoluciones.md`](./DocumentacionDevoluciones.md) | Documento anterior | Propuesta histórica de modelo, reglas y 16 operaciones HTTP; contiene afirmaciones que no se derivan del DDL fijado. |
| [`DevolucionesV2.md`](./DevolucionesV2.md) | Documento anterior alternativo | Diseño histórico ampliado, con contratos y secuencias propuestos. |
| [`DevolucionesV2.html`](./DevolucionesV2.html) | Render histórico | Representación HTML del documento anterior; no es una fuente independiente del DDL vigente. |
| `docs/devoluciones/refund_orders_schema.sql` | Ruta SQL local ignorada | Variante anterior disponible solo en algunos worktrees; no describe literalmente el bloque actual. |
| `docs/devoluciones/refund_v2_schema.sql` | Ruta SQL local ignorada | Variante anterior disponible solo en algunos worktrees; no sustituye `db_script.sql`. |
| [`diagramas/motor-aprobacion-flujo.excalidraw`](./diagramas/motor-aprobacion-flujo.excalidraw) | Diagrama histórico | Flujo de diseño anterior, no prueba restricciones persistidas actuales. |
| [`src/mockup/devoluciones/`](../../src/mockup/devoluciones/) | Mockup separado | Prototipo de interfaz y comportamiento en memoria; no prueba un contrato backend ni la aplicación del DDL. |
| [`diagrams/dev_*.plantuml`](../../diagrams/devoluciones/README.md#diagramas-históricos-dev_) | Secuencias históricas | Ilustran la propuesta anterior de operaciones HTTP; se mantienen fuera de la fotografía vigente. |

## Fuente fijada

| Dato | Valor |
|---|---|
| Archivo | [`db_script.sql`](../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1172`](../../db_script.sql#L915-L1172), tablas `refund_*` |
| Fecha de la fotografía | `2026-09-02` |
| Base `HEAD` del worktree | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| SHA-256 del archivo completo en el worktree | `2c62523505a864bc84c44db70d5f195f74a9b1b99f626399efcce1f41437f185` |

La fotografía vigente no corresponde a un commit nuevo: fija contenido del worktree basado en el
`HEAD` indicado. Los errores mecánicos de `refund_*` fueron corregidos, pero la documentación
técnica conserva las limitaciones del dominio y los errores que permanecen fuera de él.
