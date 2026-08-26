# Restricciones de planificación

Este módulo reúne el contrato, el análisis, el estado del mockup y los diagramas de secuencia del agregado de restricciones de planificación. El frontend navegable está implementado con persistencia local; no existe una implementación de backend o API.

> **Autoridad del modelo persistente:** [`../../db_script.sql`](../../db_script.sql). Ante cualquier diferencia, prevalecen sus nombres, tipos, claves, nulabilidad y valores por defecto.

Las restricciones se modelan mediante `planning_restrictions`, `planning_restriction_schedules` y `planning_restriction_vehicle_rules`. La tabla `zones` representa zonas logísticas de reparto y no forma parte de este agregado.

## Recorrido rápido

| Acción | Ruta |
|---|---|
| Consultar y filtrar | `/restricciones` |
| Crear el agregado completo | `/restricciones/nueva` |
| Ver detalle | `/restricciones/:restrictionId` |
| Reemplazar el agregado | `/restricciones/:restrictionId/editar` |

El planner muestra las restricciones vigentes como una capa informativa. No evalúa intersecciones, no evita geometrías y no excluye camiones automáticamente.

## 1. Contrato técnico

Comience por el [contrato técnico de restricciones](./DocumentacionZonasRestringidas.md). Define el recurso propuesto, los DTO, las reglas de validación, los límites transaccionales y el estado futuro del caso 47.

## 2. Análisis

Continúe con el [índice de análisis](./analisis/README.md) para revisar el problema, el modelo de datos, la semántica, la integración con el optimizador, el estado del mockup y las preguntas abiertas.

El estado verificable de la implementación está en [Estado del mockup](./analisis/05-estado-del-mockup.md).

## 3. Diagramas de secuencia

| Flujo | Diagrama |
|---|---|
| Creación atómica | [`Restricciones-46-Crear.Secuencia.puml`](./diagramas/Restricciones-46-Crear.Secuencia.puml) |
| Listado y detalle | [`Restricciones-46-Consultar.Secuencia.puml`](./diagramas/Restricciones-46-Consultar.Secuencia.puml) |
| Actualización atómica | [`Restricciones-46-Actualizar.Secuencia.puml`](./diagramas/Restricciones-46-Actualizar.Secuencia.puml) |
| Activación, desactivación y eliminación lógica | [`Restricciones-46-Estado-Eliminar.Secuencia.puml`](./diagramas/Restricciones-46-Estado-Eliminar.Secuencia.puml) |
| Evaluación futura para un plan | [`Restricciones-47-Evaluar-Plan.Secuencia.puml`](./diagramas/Restricciones-47-Evaluar-Plan.Secuencia.puml) |
