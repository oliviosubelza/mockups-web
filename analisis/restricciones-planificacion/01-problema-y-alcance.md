# 1. Problema y alcance

## Qué se está resolviendo

La planificación arma rutas con dos insumos: los pedidos y la flota. Pero hay límites que no salen de
ninguno de los dos y que hoy el sistema ignora por completo.

| Tipo | Ejemplo real | Qué prohíbe |
|---|---|---|
| **Zona restringida** | Centro histórico cerrado de 7 a 19 | Circular o entregar ahí |
| **Vía cerrada** | Av. Cañoto en obra del 1 al 15 de marzo | Circular por ese tramo |
| **Placa de circulación** | Lunes no circulan los terminados en 1 y 2 | Que ese camión salga ese día |

## La idea central: son tres combinaciones, no tres entidades

Si se modelan por separado hay que escribir tres veces la vigencia temporal, tres CRUD y tres
evaluaciones. Puestas una al lado de la otra se ve que comparten estructura:

| | **DÓNDE** | **CUÁNDO** | **A QUIÉN** | **QUÉ PROHÍBE** |
|---|---|---|---|---|
| Zona restringida | polígono | permanente o franjas | todos, o solo pesados | `NO_TRANSIT` / `NO_DELIVERY` |
| Vía cerrada | línea | casi siempre rango con fin | todos, o solo pesados | `NO_TRANSIT` |
| Placa | ninguna geometría | recurrente semanal | **obligatorio**: dígito de placa | `NO_VEHICLE` |

El cuarto eje —**qué prohíbe**— no es decorativo: cada valor pega en un lugar distinto del pipeline.

- `NO_TRANSIT` → afecta la **geometría** de la ruta. Es el más difícil (ver `04`).
- `NO_DELIVERY` → afecta la **asignación**: esa parada no puede caer en ese camión a esa hora.
- `NO_VEHICLE` → afecta la **flota**: ese camión no se usa ese día. Es el más simple de los tres.

## Severidad: bloqueante o advertencia

Cada restricción tiene `severity`. **El default es `WARNING` y eso no es tibieza**: es lo único que el
sistema puede prometer honestamente para `NO_TRANSIT`, donde no hay forma de garantizar que la ruta
esquive nada (ver `04`). Un `BLOCKING` que no puede bloquear es peor que una advertencia clara.

## Qué queda afuera de este análisis

- **Restricciones de horario de recepción del cliente.** Ya existen como
  `dispatch_delivery_points.delivery_window_start/end`. Son del punto de entrega, no del territorio.
- **Corte de pedidos por canal.** Ya existe como `sale_channel_restrictions.cut_off_time`. Es una regla
  comercial sobre qué pedidos entran al plan, no sobre cómo se reparte.
- **Restricciones de capacidad** (peso, volumen, refrigeración). Ya las resuelve el optimizador.

Las tres son restricciones en sentido amplio y están bien donde están. Este módulo es específicamente
sobre **límites de circulación en el territorio y sobre la flota**.
