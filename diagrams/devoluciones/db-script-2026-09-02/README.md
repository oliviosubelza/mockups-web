# Diagramas `refund_*`: fotografía 2026-09-02

Estos cinco diagramas representan el bloque persistido corregido y los dos contratos HTTP vigentes.
La fuente es el worktree basado en `HEAD`, no un commit nuevo.

## Catálogo

| Diagrama | Alcance |
|---|---|
| [`01-modelo-relacional.plantuml`](./01-modelo-relacional.plantuml) | Las 10 tablas, columnas, PK, FK, `CHECK` y referencias sin FK. |
| [`02-trazabilidad-notas.plantuml`](./02-trazabilidad-notas.plantuml) | Nota fuente/disociada, líneas, acción puente e intentos reactivados. |
| [`03-workflow-persistido.plantuml`](./03-workflow-persistido.plantuml) | Instancias, niveles, acciones, decisiones y límites de configuración. |
| [`04-get-refund-reasons.plantuml`](./04-get-refund-reasons.plantuml) | Consulta vigente del catálogo para Sales. |
| [`05-post-create-refund.plantuml`](./05-post-create-refund.plantuml) | Creación transaccional vigente desde Sales. |

## Convenciones

| Color | Significado |
|---|---|
| Verde | Estructura o persistencia respaldada por `DDL`, FK declarada o interacción exitosa con PostgreSQL. |
| Amarillo | `COMENTARIO` sin garantía de base. |
| Azul claro | `APLICACIÓN` o `CONTRATO`. |
| Gris claro | Actor, entidad externa o referencia sin FK. |
| Rojo | Inconsistencia conservada. |
| Blanco | Estructura u observación neutral. |

Las líneas verdes continuas son FK reales; las grises discontinuas son relaciones escalares o
externas sin FK. La ausencia de cardinalidad significa que el DDL no impone una cardinalidad de
negocio suficiente.

## Fuente fijada

| Dato | Valor |
|---|---|
| Archivo | [`db_script.sql`](../../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1172`](../../../db_script.sql#L915-L1172) |
| Fecha | `2026-09-02` |
| Base `HEAD` | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| Estado | Fotografía del worktree; no es un commit nuevo |
| SHA-256 completo | `2c62523505a864bc84c44db70d5f195f74a9b1b99f626399efcce1f41437f185` |

Los archivos no usan includes ni temas remotos y no fijan una fuente concreta. Esta condición se
comprueba estáticamente y no equivale a un render validado.

Documentación: [`docs/devoluciones/db-script-2026-09-02/`](../../../docs/devoluciones/db-script-2026-09-02/README.md).
