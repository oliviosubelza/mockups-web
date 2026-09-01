# Detalle con mapa

Pantalla: `/monitoreo/seguimiento/:ordenId` y variante por `:pedidoId`

Fuentes principales:

- `src/mockup/monitoreo/MonitoreoDetalleView.tsx`
- `src/mockup/monitoreo/SeguimientoMapa.tsx`
- `src/mockup/monitoreo/ParadasPanel.tsx`
- `src/mockup/monitoreo/DetalleParadaPanel.tsx`
- `src/mockup/monitoreo/use-seguimiento-vivo.ts`

## Que problema resuelve

Es la vista espacial y operativa del viaje. La pantalla asume que un usuario esta vigilando una sola
salida y necesita sostener tres preguntas a la vez:

- Donde esta el camion.
- Que parada esta atendiendo o le sigue.
- Que evidencia dejo cada entrega.

Por eso el mapa manda y los paneles flotan encima.

## Regla de navegacion

La vista reconstruye contexto solo desde la URL.

- Si entra por `ordenId`, abre el viaje de esa orden.
- Si entra por `pedidoId`, resuelve la orden madre y ademas enfoca la parada que contiene ese pedido.

Si la URL no resuelve contexto, la pantalla vuelve al listado con mensaje de estado vacio.

## Layout

La composicion real es:

- **Mapa a sangre** como fondo unico.
- **Panel de paradas** flotante a la izquierda.
- **Panel de detalle** flotante a la derecha.

Los paneles no empujan el mapa. Esto fija dos comportamientos UX importantes:

- Abrir o cerrar herramientas no achica el mapa.
- El encuadre del mapa se calcula con padding asimetrico para no esconder paradas bajo los paneles.

## Estado y foco

La vista mantiene tres ideas distintas:

- `paradaActual`: la parada que el viaje esta atendiendo o la siguiente viva.
- `paradaFoco`: la parada seleccionada para detalle.
- `focoAuto`: si el ultimo cambio de foco vino de la simulacion o del usuario.

La distincion importa porque el mapa reacciona distinto:

- Si el foco cambio solo porque el viaje avanzo, puede hacer un recorrido corto por la parada nueva y volver al camion.
- Si el usuario eligio una parada, el mapa no le roba la vista para volver al camion.

## Panel de paradas

Renderiza `ParadasPanel`.

La cabecera interna del panel contiene:

- Boton volver al listado.
- Identidad del contexto: orden y, si aplica, pedido seguido.
- Estado del viaje como punto + texto.
- Camion, chofer y bateria.
- Barra de progreso.
- Tres tiempos: atencion promedio, transito promedio y total en ruta.
- Frescura de la pantalla.

Debajo aparecen las herramientas de exploracion de lista:

- Buscador por cliente o punto de entrega.
- Filtros rapidos: `Todas`, `Abiertas`, `Con problema`.
- Contador contextual.

Reglas del listado:

- La lista sigue el orden de visita.
- Cada fila espeja el color y el numero del pin del mapa.
- El riel vertical es solido en lo recorrido y punteado en lo pendiente.
- La fila activa hace auto-scroll suave.
- El filtro solo afecta la lista; el mapa sigue mostrando el recorrido completo.

El panel se puede colapsar. Cuando esta cerrado queda una pastilla `Paradas` con el progreso `cerradas/total`.

## Mapa

Renderiza `SeguimientoMapa`.

Elementos visibles:

- Deposito.
- Recorrido del viaje.
- Paradas con pin numerado por secuencia.
- Camion en posicion viva.
- Capas base y overlays auxiliares.

Herramientas propias del mapa:

- Zoom.
- Centrar en camion.
- Seguir camion.
- Encuadrar recorrido.
- Tramo siguiente.
- Cambio de capa base.

Reglas visuales importantes:

- El pin del camion deja ondas cuando la senal es fresca.
- Sin senal, el pin se queda quieto y se agrisa.
- El pin de una parada siempre prioriza el numero de secuencia.
- El estado de la parada vive en color y tooltip.

## Seguimiento automatico del camion

La UI actual fija tres reglas de seguimiento:

1. Arranca encendido.
2. Se apaga si el usuario arrastra o zoomea manualmente.
3. Solo reencuadra si el camion se sale de la zona util, no en cada ping.

La zona util descuenta el ancho de los paneles abiertos. Para la UX, "el camion quedo detras del panel"
equivale a "el camion se fue del cuadro".

## Seleccion de paradas

Se puede seleccionar una parada desde:

- El pin del mapa.
- La fila de la lista.
- La llegada por `pedidoId`.
- El avance automatico del viaje.

Al seleccionar:

- Se abre el panel derecho si estaba cerrado.
- Se actualiza el detalle.
- Se recalcula el encuadre del mapa segun el origen del foco.

## Panel de detalle de parada

Renderiza `DetalleParadaPanel`.

Cabecera:

- Numero de secuencia.
- Cliente y punto de entrega.
- Miniatura del punto, que abre `PuntoEntregaDialog`.
- Badge de estado.
- Marca de `datos en vivo`.
- Tarjeta de actividad reciente, si hubo un cambio relevante.
- Ventana, llegada-cierre y duracion.
- Pedidos, peso y volumen.
- Motivo textual si la entrega no se concreto.

Pestanas:

| Pestana | Contenido |
|---|---|
| Historial | Timeline de eventos de la entrega |
| Incidencias | Incidentes con severidad y foto |
| Comprobante | Receptor, firma, GPS y fotos |
| Pedido | Pedidos agrupados y productos consolidados |
| Cobro | Estado agregado, montos y pagos registrados |

Detalles importantes de la variante por pedido:

- Si se entro por `pedidoId`, la pestana `Pedido` resalta el pedido objetivo con la chapa `Seguido`.
- El pedido seguido no cambia el contrato del panel; solo marca cual de los varios pedidos de la parada fue el que disparo la navegacion.

## Actividad reciente

La pantalla resume cambios vivos para la parada enfocada:

- Nueva incidencia.
- Comprobante capturado.
- Cambio de estado.
- Cambio de estado de cobro.

La tarjeta dura unos segundos y se limpia sola. No es historial persistente; es un aviso de "acaba de
pasar esto".

## Comportamiento en vivo esperado

La vista usa `useSeguimientoVivo` y espera del backend una forma `snapshot + SSE`.

La UI consume:

- `tracking` vivo para posicion y bateria.
- Entregas ya mutadas por deltas.
- `actualizadoAt` para frescura de pantalla.
- `cursor` de paradas cerradas para cortar el trazo.

El mock deja fijado un criterio importante: la posicion se interpola del lado cliente. La UX del mapa
no exige pings mas frecuentes; exige animacion local entre pings.

## Implicancias para el documento tecnico

Conviene dejar asentado en la version formal:

1. La navegacion por pedido y por orden converge en la misma pantalla.
2. El panel derecho es lateral, no modal.
3. El mapa no cambia de tamano al abrir paneles.
4. La seleccion manual y el avance automatico no son lo mismo y deben diferenciarse en el comportamiento de camara.
