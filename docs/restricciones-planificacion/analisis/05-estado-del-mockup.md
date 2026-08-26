# 5. Estado del mockup

Verificado el **2026-08-26**. El frontend del agregado está implementado y el build de producción finaliza correctamente. El contrato de backend continúa siendo una propuesta documental.

## 5.1 Recorrido verificable

1. Abra `/restricciones` para consultar, filtrar, activar, desactivar o eliminar lógicamente.
2. Use `/restricciones/nueva` para crear un área, una vía cerrada o una regla por placa.
3. Publique y revise el agregado en `/restricciones/:restrictionId`.
4. Abra `/planificaciones/mapa/editor` y active la capa `Restricciones de planificación`.
5. Abra `/zonas` y confirme que solo administra polígonos logísticos.

## 5.2 Implementado

| Pieza | Decisión | Código |
|---|---|---|
| Dominio discriminado | `RESTRICTED_AREA`/Polygon, `CLOSED_ROAD`/LineString y `PLATE_ROTATION`/null | `src/mockup/restricciones/domain.ts` |
| Agregado local | IDs numéricos, auditoría, filas hijas, reemplazo completo y soft delete | `src/mockup/restricciones/store.ts` |
| Persistencia | Key versionada `mockups-web:planning-restrictions:v1`; JSON inválido se descarta | `src/mockup/restricciones/store.ts` |
| Catálogo | `DataTable`, filtros y acciones por fila | `src/mockup/restricciones/RestrictionsCatalogView.tsx` |
| Alta y edición | Validación integral, preview vehicular y una única publicación | `src/mockup/restricciones/RestrictionEditorView.tsx` |
| Detalle | Geometría, horarios, reglas vehiculares y auditoría | `src/mockup/restricciones/RestrictionDetailView.tsx` |
| Mapas | Captura Polygon/LineString y conversión `[lat,lng]` ↔ `[lng,lat]` | `src/mockup/restricciones/RestrictionMap.tsx` |
| Planner | Capa temporal independiente y contador de advertencias vigentes | `src/mockup/restricciones/PlanningRestrictionsLayer.tsx` |
| Zonas logísticas | Sin tipo, vigencia ni filas restringidas; key `mockups-web:logistic-zones:v1` | `src/mockup/zones-store.ts` |

## 5.3 Semántica aplicada

- El tipo se fija al crear y no puede cambiar durante una actualización.
- Los campos de un horario se combinan con AND; las filas se combinan con OR; sin filas significa vigencia permanente.
- Un intervalo que cruza medianoche se atribuye al día y fecha de inicio.
- Los campos de una regla vehicular se combinan con AND; las reglas se combinan con OR; sin reglas significa toda la flota.
- La rotación usa el último dígito del primer bloque numérico de la placa.
- El agregado se valida completo antes de reemplazar la versión publicada.

## 5.4 Límites explícitos

- No existe backend, API ni sincronización remota.
- El estado espacial es `NOT_EVALUATED`: no se calculan intersecciones con paradas o rutas.
- La capa del planner no modifica el optimizador, no evita vías o polígonos y no deshabilita camiones.
- El planner del mock usa la primera distribuidora del maestro hasta que exista un selector operativo.
- Los datos viven en `localStorage`/`sessionStorage` del navegador y pueden reiniciarse desde el catálogo.

## 5.5 Verificación

| Comando | Resultado |
|---|---|
| `pnpm build` | Correcto |
| `pnpm typecheck` | El módulo nuevo no agrega diagnósticos; el repositorio conserva errores previos en mapa, devoluciones e infraestructura |
| Pruebas puras de dominio y store | Correcto: tres tipos, overnight, placas, GeoJSON, JSON local, reemplazo y tombstones |
| `git diff --check` | Correcto |
