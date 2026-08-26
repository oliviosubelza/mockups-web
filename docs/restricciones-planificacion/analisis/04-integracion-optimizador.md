# 4. Cómo llega esto al optimizador

## 4.1 El punto de partida

**El motor real será Google Route Optimization** (`optimizeTours`). OSRM es solo del mockup.

**Ninguno de los dos sabe esquivar un polígono arbitrario.** No existe un "avoid this area" en
`optimizeTours`, ni en la Routes API. Por eso las restricciones **no se le pasan al motor: se compilan
contra el payload antes de mandarlo**. No es una optimización, es la única vía.

## 4.2 Qué sabe expresar Google RO

| Restricción | Se compila como |
|---|---|
| Pico y placa (`NO_VEHICLE`) | El camión no entra en el array `Vehicle[]` ese día. El más limpio |
| Zona, `NO_DELIVERY` | `Shipment.allowedVehicleIndices` de las paradas de adentro |
| Zona con horario | Se recorta `deliveries[].timeWindows` al complemento de la franja |
| Por tonelaje o tipo | `allowedVehicleIndices`, evaluando el predicado contra cada camión |
| Preferir no entrar, sin prohibir | `Shipment.costsPerVehicle` — penalización blanda |
| **Vía cerrada (`NO_TRANSIT`)** | **No se puede expresar.** Ningún campo lo cubre |

## 4.3 El único que no entra

Para `NO_TRANSIT`, tres salidas en orden de esfuerzo:

1. **Aceptar que es advertencia.** Se cruza la polilínea que devuelve el motor contra la geometría
   restringida y se marca la ruta en ámbar. Es lo honesto para arrancar, y es por lo que `severity`
   arranca en `WARNING`.
2. **Convertirla en `NO_DELIVERY`** cuando la vía cerrada aísla un grupo de paradas. No es lo mismo,
   pero cubre el caso que duele.
3. **Matriz de distancias propia.** Google RO acepta matrices precalculadas en
   `ShipmentModel.durationDistanceMatrices`, con tags en visitas y vehículos. Si las distancias se
   calculan con un OSRM propio que sí esquiva la avenida, el avoid geográfico entra a la optimización
   por la puerta de atrás. Es la única forma real.
   > ⚠️ **Verificar el nombre exacto del campo contra la doc vigente de Google.** Ese producto se mueve.

## 4.4 Dónde vive el compilador

**En el dominio, antes del puerto del optimizador. No en el adaptador de Google.**

```
Restricciones + Plan (fecha, paradas, camiones)
        │
        ▼  compilarRestricciones()          ← dominio, no sabe de motores
   ┌─────────────────────┬──────────────────────────┐
   │  PlanParaOptimizar  │  InformeDeRestricciones  │
   └─────────────────────┴──────────────────────────┘
        │
        ▼  puerto OptimizadorDeRutas
   ├── adaptador osrm                        (mockup)
   └── adaptador google-route-optimization   (real)
```

Consecuencia práctica que conviene tener presente: **el mockup con OSRM no es descartable.** Lo que
sobrevive al cambio de motor es justamente el compilador — la evaluación de vigencia, el
punto-en-polígono, el predicado sobre el camión. El día que se enchufe Google no se reescribe nada de
eso, solo el traductor de payload.

## 4.5 El compilador devuelve DOS cosas

El payload limpio **y un informe** de qué se sacó y por qué.

Sin el informe, un plan sale con tres paradas menos y nadie sabe qué pasó. Ese informe es después la
pantalla que contesta *"¿por qué este plan quedó así?"*, y es lo que se persiste en
`dispatch_plan_restriction_hits` (ver `02.4`).

## 4.6 Dos costuras distintas en el código actual

Conviene no confundirlas:

| Archivo | Qué es | Qué pasa con Google |
|---|---|---|
| `src/mockup/map/route-optimizer.ts` | El **optimizador**: nearest-neighbor local, sin API | Lo reemplaza |
| `src/mockup/services/routing-osrm.ts` | El **trazador** de calles (OSRM público) | Puede quedarse, o irse |

`routes.engine VARCHAR(100)` ya existe en el esquema, con el comentario `-- Motor de optimización (ej.
GOOGLE, OR_TOOLS)`. La columna está esperando.
