# Devoluciones desde el worktree: 2026-09-02

Esta es la fotografía documental vigente del bloque `refund_*` después de sus correcciones
mecánicas autorizadas. Fija contenido del worktree basado en `HEAD`; no representa un commit nuevo
ni corrige decisiones de negocio que el DDL mantiene abiertas.

## Ruta rápida

1. Leer la [documentación técnica literal](./DocumentacionTecnica.md).
2. Revisar los [dos contratos HTTP vigentes](./ContratosHttp.md).
3. Consultar el [registro de decisiones](./Decisiones.md).
4. Abrir el [catálogo de cinco diagramas](../../../diagrams/devoluciones/db-script-2026-09-02/README.md).
5. Contrastar con [`db_script.sql:L915-L1172`](../../../db_script.sql#L915-L1172).

## Alcance

| Etiqueta | Uso en esta fotografía |
|---|---|
| `DDL` | Estructura y restricciones escritas en `db_script.sql`. |
| `COMENTARIO` | Intención escrita que PostgreSQL no garantiza. |
| `APLICACIÓN` | Regla que debe ejecutar el servicio o una transacción. |
| `CONTRATO` | Comportamiento HTTP respaldado por [Decisiones.md](./Decisiones.md). |
| `PENDIENTE` | Decisión que esta versión no resuelve. |

## Fuente fijada

| Dato | Valor |
|---|---|
| Archivo | [`db_script.sql`](../../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1172`](../../../db_script.sql#L915-L1172) |
| Fecha | `2026-09-02` |
| Base `HEAD` | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| Estado | Fotografía del worktree; no es un commit nuevo |
| SHA-256 completo | `2c62523505a864bc84c44db70d5f195f74a9b1b99f626399efcce1f41437f185` |

## Resultado mecánico

- La PK del catálogo usa sintaxis PostgreSQL válida.
- Los comentarios distinguen `name` como etiqueta visible y `description` como explicación breve.
- Los `CHECK` apuntan únicamente a columnas existentes.
- El monto mínimo se valida sobre `min_amount`.
- `reason_id` usa `BIGINT NOT NULL` y referencia el catálogo por FK.
- Un origen se identifica por factura o lote.
- La imagen persistida contiene `url` y no conserva una validación de tamaño retirada.
- `required_approvals` permanece sin atribuirle una semántica nueva bajo `ANY` y `ALL`.

## Contratos vigentes

- [`GET /api/v1/refund-reasons`](./ContratosHttp.md#get-apiv1refund-reasons)
- [`POST /api/v1/refunds`](./ContratosHttp.md#post-apiv1refunds)
- [Decisiones de contrato y aplicación](./Decisiones.md)

La [fotografía 2026-09-01](../db-script-2026-09-01/README.md) permanece intacta como versión
anterior.
