# Devoluciones desde `db_script.sql`: 2026-09-01

Esta versión es la ruta de lectura vigente para el dominio persistido `refund_*`. Es una
fotografía literal del DDL, no una especificación ideal, una migración corregida ni un contrato
HTTP.

## Ruta rápida

1. Empezar por la [conclusión y los niveles de certeza](./DocumentacionTecnica.md#conclusión).
2. Revisar el [inventario de las 10 tablas](./DocumentacionTecnica.md#inventario-del-modelo).
3. Ver las [restricciones y brechas](./DocumentacionTecnica.md#integridad-declarada).
4. Abrir el [catálogo de diagramas](../../../diagrams/devoluciones/db-script-2026-09-01/README.md).
5. Ante cualquier duda, volver a
   [`db_script.sql:L915-L1185`](../../../db_script.sql#L915-L1185).

## Alcance

**Incluye:** columnas, PK, FK, `CHECK`, defaults, nulabilidad, relaciones escalares, comentarios,
inconsistencias y vacíos observables en las 10 tablas `refund_*`.

**Excluye:** diseño deseado, correcciones al SQL, comportamiento no demostrable, integración con
retornos logísticos, endpoints vigentes y garantías del mockup.

## Fuente fijada

| Dato | Valor |
|---|---|
| Archivo | [`db_script.sql`](../../../db_script.sql) |
| Bloque | [`db_script.sql:L915-L1185`](../../../db_script.sql#L915-L1185) |
| Fecha | `2026-09-01` |
| Último commit del archivo | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| `HEAD` | `dd4b92db5509efd2b3800235a665fad90139cf27` |
| SHA-256 completo | `2f9936f8450a9a8fd8acfc6b308de6378a24b1253ef0a75aa50ab416538e7405` |

## Cómo leer esta versión

| Etiqueta | Significado |
|---|---|
| `DDL` | Declaración escrita en el SQL. No implica que el script completo se haya aplicado con éxito. |
| `COMENTARIO` | Intención escrita en comentarios; no es una restricción de base de datos. |
| `APLICACIÓN` | Regla delegada explícitamente o que tendría que resolverse fuera de este DDL. No prueba que exista implementación. |
| `PENDIENTE` | Ambigüedad o decisión que la fuente no resuelve. |

## Diagramas

- [01 - Modelo relacional completo](../../../diagrams/devoluciones/db-script-2026-09-01/01-modelo-relacional.plantuml)
- [02 - Trazabilidad de notas](../../../diagrams/devoluciones/db-script-2026-09-01/02-trazabilidad-notas.plantuml)
- [03 - Workflow persistido](../../../diagrams/devoluciones/db-script-2026-09-01/03-workflow-persistido.plantuml)

Los documentos y diagramas anteriores permanecen accesibles desde el
[índice de versiones](../README.md), pero no definen esta fotografía.
