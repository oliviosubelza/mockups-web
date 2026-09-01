# Viaje en dialogo

Componente: `src/mockup/monitoreo/ViajeDialog.tsx`

Fuentes asociadas:

- `src/mockup/monitoreo/TablaViajeMonitoreo.tsx`
- `src/mockup/monitoreo/TablaPedidosViaje.tsx`
- `src/mockup/monitoreo/linea-tiempo.ts`
- `src/mockup/monitoreo/use-seguimiento-vivo.ts`

## Que problema resuelve

El listado necesitaba una lectura rapida del viaje sin forzar navegacion al mapa. Este dialogo vive
sobre la tabla y contesta dos preguntas:

- **Cuanto hay en juego**: paradas, pedidos, peso, cobro, saldo.
- **Cuando se estiro el viaje**: plan contra ejecucion real.

No reemplaza al detalle con mapa. Lo complementa.

## Estructura del dialogo

El `DialogContent` abre con alto fijo y reparte el espacio entre cabecera, barra de controles y
superficie principal.

Cabecera:

- Codigo de la orden.
- Camion y chofer.
- Badge de estado del viaje.
- Tres metricas compactas: `Salida`, `Puntualidad`, `Progreso`.

Barra de controles:

- Selector de vista: `Detalle` o `Plan vs ejecutado`.
- Selector `Ver por`: `Cliente` o `Pedido`. Solo existe sobre `Detalle`.
- Filtro de `Canal`. Solo existe cuando la vista es `Detalle` y el grano es `Pedido`.
- Indicador de frescura.

## Dos vistas, una sola seleccion

La parada elegida se comparte entre todas las lecturas del dialogo.

- Si se selecciona una fila de tabla, queda seleccionada al pasar al eje.
- Si se selecciona un hito en el eje, la tabla abre esa misma parada.

La seleccion inicial arranca en:

- La peor parada si el viaje trae una demora material.
- La primera parada si no hay atrasos fuertes.

El objetivo es abrir el dialogo donde probablemente este el problema.

## Vista Detalle, grano Cliente

Renderiza `TablaViajeMonitoreo`.

Grano:

- Una fila por parada del viaje.

Columnas:

| Columna | Contenido |
|---|---|
| # | Secuencia |
| Cliente | Cliente y punto de entrega |
| Estado | Estado de la parada |
| Ventana | Ventana comprometida |
| Plan | Hora planificada de llegada |
| Real | Hora real de llegada |
| Desvio | Diferencia contra el plan |
| Atencion | Permanencia en punto |
| Peso kg | Peso total de la parada |
| Ped. | Cantidad de pedidos |
| A cobrar | Monto esperado a cobrar |
| Cobrado | Monto ya cobrado |
| En proceso | Cobros pendientes de confirmacion |
| Saldo | Monto aun adeudado |
| Cobro | Estado agregado e iconos de metodos |
| Inc. | Incidencias o comprobante |

Comportamientos propios:

- Encabezado sticky.
- Pie sticky con totales del viaje entero.
- `fila-viva` para las paradas que acaban de cambiar.
- Click sobre fila para actualizar la seleccion compartida.

El pie responde "cuanta plata hay en la calle en este camion", no solo lo ya cerrado.

## Vista Detalle, grano Pedido

Renderiza `TablaPedidosViaje`.

Grano:

- Una fila por pedido comercial ya resuelto contra la parada que lo bajo.

Columnas:

| Columna | Contenido |
|---|---|
| Pedido | `salesOrder` |
| Documento | Documento comercial |
| # | Secuencia de parada |
| Cliente | Cliente |
| Canal | Canal del punto |
| Estado | Estado de la parada |
| Entrega | Hora real de cierre o guion |
| Pago | Forma de pago |
| Peso kg | Peso del pedido |
| Monto Bs | Monto del pedido |

Comportamientos propios:

- Usa `DataTable`.
- Tiene buscador.
- Permite exportar.
- Lleva una barra de totales en el toolbar.
- El filtro de canal vive afuera, en la barra del dialogo.
- El pie numerico del grano pedido es `pedidos + paradas + peso + monto`.

Reglas de modelo que la UI asume:

- El estado mostrado en cada pedido es el de la parada, no uno independiente del pedido.
- El canal tambien cuelga de la parada.
- El vendedor esta previsto como segundo filtro, pero todavia no existe respaldo del dato.

## Vista Plan vs ejecutado

Renderiza `RutaParalela`.

Su comportamiento detallado esta documentado en `04-plan-vs-ejecutado.md`, pero desde el dialogo hay
que fijar tres cosas:

- Es la segunda lectura del mismo viaje, no otro flujo.
- Conserva la misma seleccion de parada.
- Comparte el mismo estado vivo que la tabla.

## Comportamiento en vivo

El dialogo usa el mismo `useSeguimientoVivo` que mueve el detalle con mapa.

Eso implica:

- Las paradas cambian mientras el dialogo esta abierto.
- El progreso, la puntualidad y los montos se recalculan sobre el estado vivo.
- La frescura se informa en la misma barra que define la vista activa.
- El destello de fila se reaprovecha en tabla de clientes y tabla de pedidos.

No es una foto del viaje. Es otra vista de su estado vivo.

## Filtro de canal

El canal no es otro grano; es una dimension de filtrado del grano Pedido.

La UI actual deja fijadas estas reglas:

- Vive en la barra superior del dialogo, junto a los otros controles de lectura.
- Es multiseleccion.
- Tiene buscador.
- Muestra solo canales presentes en ese viaje.
- Ordena las opciones por monto descendente.
- Cada opcion muestra `cantidad de pedidos + monto`.

## Huecos y decisiones que conviene arrastrar al documento formal

1. El plan del eje se deriva todavia por formula; no baja una ETA persistida por parada.
2. El estado agregado del cobro sigue siendo un calculo frontend.
3. El filtro por vendedor esta explicitamente previsto pero no respaldado.
4. El dialogo no abre ruta nueva ni stream nuevo: se monta sobre el listado y reusa el mismo viaje vivo.
