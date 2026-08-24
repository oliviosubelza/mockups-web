# 5. Estado del mockup

Verificado el **2026-08-24**. Todo lo listado como "hecho" compila (`npx tsc --noEmit` sin errores
nuevos) pero **no se verificó en navegador**: `node_modules` es de Windows y vite no arranca desde WSL.

## 5.1 Hecho

| Pieza | Dónde |
|---|---|
| Tipo de zona `reparto` \| `restringida` | `src/mockup/zones-store.ts` |
| Un solo editor para los dos tipos | `src/mockup/zonas/ZonasWorkspaceView.tsx` |
| Modelo de vigencia (evaluación + descripción legible) | `src/mockup/restricciones/vigencia.ts` |
| Momento de evaluación | `src/mockup/restricciones/momento.ts` |
| Editor de franjas horarias | `src/mockup/restricciones/VigenciaEditor.tsx` |
| Restringidas visibles en el planner, filtradas por vigencia | `src/mockup/planner/PlannerMapa.tsx` |
| Fecha operativa del plan, visible | `src/mockup/planner/PlannerHud.tsx` |
| Medidas de zona (área, perímetro, vértices) | `src/mockup/map/geo/medidas.ts` |

## 5.2 Reglas ya implementadas que el backend tiene que preservar

- **La holgura de 1 m y el no-solapamiento aplican SOLO a las zonas de reparto.** Las restringidas se
  apilan libremente entre sí y sobre las de reparto: una avenida en obra que cruza tres zonas de
  reparto es el caso normal, y exigirle holgura sería pedirle que no toque justo lo que viene a
  limitar.
- **El tipo se elige al crear y no se muda.** Pasar una restringida a reparto crearía conflictos de
  holgura instantáneos sobre una geometría que nació sin esa regla.
- **La fecha operativa del plan es siempre el día siguiente**, sin selector
  (`fechaDelPlanNuevo` en `src/mockup/planes-store.ts`). Se fija al crear y no se re-estampa al
  guardar.
- **Una restringida no vigente no se dibuja en el planner** (no se atenúa: no se dibuja). El mapa del
  planificador contesta "qué recorta ESTE plan"; una restricción que no aplica es ruido sobre un mapa
  que ya tiene rutas, pines y zonas.
- **Una restringida dada de baja (`isActive = false`) no restringe nada** y vuelve a gris.

## 5.3 Falta

En orden de dependencia:

1. **Store y pantalla de restricciones vehiculares** (placas). Es una tabla, no un mapa. Con el
   **preview de camiones afectados** (ver `03.5`).
2. **Evaluación**: `camionesRestringidos(camiones, momento)` → qué camiones quedan fuera y por qué.
   Lógica pura, sin UI. Es el primer pedazo del compilador.
3. **Efecto en el planner**: camiones afectados deshabilitados en el panel de Flota, con el motivo.
4. **Vías cerradas**: el editor hoy solo dibuja polígonos, falta `LineString`.
5. **Aviso de paradas dentro de una zona restringida**: hoy las zonas se dibujan pero no se cruza nada
   contra ellas.
6. **El compilador completo** y su informe (ver `04`).

## 5.4 Geometría disponible

No hay turf ni ninguna librería geoespacial. Está escrito a mano en `src/mockup/map/geo/`:

| Función | Archivo | Sirve para |
|---|---|---|
| `puntoEnAnillo` | `solapamiento.ts` | Saber si una parada cae en una zona restringida |
| `seSolapan` | `solapamiento.ts` | Cruzar geometrías |
| `autoSeCruza` | `solapamiento.ts` | Validar que un polígono sea un polígono |
| `relacionConAnillo`, `evaluarContorno`, `auditarZonas` | `holgura.ts` | La regla del metro |
| `areaKm2`, `perimetroM` | `medidas.ts` | Medidas de zona |

Alcanza para el punto 5 de la lista de arriba sin agregar dependencias.
