# Diagramas `refund_*`: fotografía 2026-09-01

Este catálogo representa únicamente la estructura persistida en
[`db_script.sql:L915-L1185`](../../../db_script.sql#L915-L1185). Los diagramas no completan el
modelo con reglas del mockup ni convierten comentarios en garantías.

## Catálogo

| Diagrama | Pregunta que responde |
|---|---|
| [`01-modelo-relacional.plantuml`](./01-modelo-relacional.plantuml) | ¿Cuáles son las 10 tablas, sus columnas, PK, FK reales y referencias escalares sin FK? |
| [`02-trazabilidad-notas.plantuml`](./02-trazabilidad-notas.plantuml) | ¿Qué referencias permiten seguir una nota disociada, sus líneas, la acción puente y una reactivación? |
| [`03-workflow-persistido.plantuml`](./03-workflow-persistido.plantuml) | ¿Qué estructura persiste instancia, niveles, acciones y decisiones, y qué catálogos solo aparecen comentados? |

## Convenciones

| Convención | Lectura |
|---|---|
| Línea verde continua | `DDL`: FK realmente declarada. |
| Línea gris discontinua | Relación escalar o conceptual sin FK. |
| Fondo verde | Restricción válida escrita en el DDL. |
| Fondo amarillo | Exclusivamente `COMENTARIO`: intención sin garantía equivalente en el DDL. |
| Fondo azul claro | `APLICACIÓN`: regla delegada fuera de este DDL. |
| Fondo gris claro | Entidad externa o referencia sin FK. |
| Fondo rojo | Inconsistencia literal o restricción inválida. |
| Fondo blanco | Estructura u observación neutral, sin categoría cromática adicional. |
| Sin cardinalidad | El DDL no impone una cardinalidad de negocio suficiente para afirmarla. |

Las etiquetas `DDL`, `COMENTARIO`, `APLICACIÓN` y `PENDIENTE` tienen el mismo sentido que en la
[documentación técnica](../../../docs/devoluciones/db-script-2026-09-01/DocumentacionTecnica.md#niveles-de-certeza).

## Fuente fijada

- Fecha: `2026-09-01`.
- Commit del archivo y `HEAD`: `dd4b92db5509efd2b3800235a665fad90139cf27`.
- SHA-256 de `db_script.sql`: `2f9936f8450a9a8fd8acfc6b308de6378a24b1253ef0a75aa50ab416538e7405`.
- Diagramas históricos: [índice superior](../README.md#diagramas-históricos-dev_).

Los PlantUML no usan `include` ni temas remotos y no fijan una fuente concreta: emplean la fuente
por defecto del renderer. Estas condiciones se comprueban estáticamente; no implican que el render
haya sido validado.
