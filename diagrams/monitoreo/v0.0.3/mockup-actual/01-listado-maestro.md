# Listado maestro

Pantalla: `/monitoreo`

Fuente principal:

- `src/mockup/monitoreo/MonitoreoView.tsx`
- `src/mockup/monitoreo/use-flota-viva.ts`
- `src/mockup/monitoreo/tracking-dynamo.ts`

## Que problema resuelve

Es la pantalla de barrido de la operacion del dia. Ya no tiene una sola lectura del universo: ofrece
dos granularidades sobre el mismo stream vivo.

- **Ordenes**: una fila por orden de transporte despachada.
- **Pedidos**: una fila por pedido comercial dentro de esas ordenes.

La pantalla no abre dos contratos distintos. Cambia el nivel de proyeccion del mismo estado vivo.

## Estructura general

La cabecera tiene tres piezas fijas:

- Titulo "Monitoreo de entregas".
- Indicador de frescura de la pantalla.
- Descripcion corta que cambia segun la vista activa.

Debajo aparece el selector de vista:

- `Ordenes`
- `Pedidos`

No son tabs de navegacion de ruta. Son un pivote local del mismo listado.

## Vista Ordenes

Una fila representa una orden con su viaje y sus conteos ya resueltos.

Columnas activas:

| Columna | Que muestra |
|---|---|
| Orden | Codigo de la orden |
| Camion | Placa o identificador del camion |
| Chofer | Nombre del chofer |
| Viaje | Estado agregado del viaje |
| Progreso | Barra con cerradas, pendientes y porcentaje |
| Paradas | Cantidad total de paradas |
| Incid. | Conteo de incidencias |
| Ultima senal | Minutos desde el ultimo ping |
| Salida | Hora de salida |
| Atencion prom. | Promedio de permanencia en punto |
| En ruta | Tiempo acumulado en calle |
| Acciones | Abrir dialogo del viaje o navegar al mapa |

Acciones por fila:

- Boton de `ChartGantt`: abre `ViajeDialog` encima del listado.
- Boton `Seguir`: navega al detalle con mapa por `ordenId`.
- Doble click sobre la fila: navega al detalle con mapa.

## Vista Pedidos

Una fila representa un pedido comercial, ya resuelto contra la parada que lo transporta.

Columnas activas:

| Columna | Que muestra |
|---|---|
| Pedido | `salesOrder` |
| Orden | Codigo de la orden de transporte madre |
| Cliente | Cliente y punto de entrega |
| Canal | Canal comercial del punto |
| Parada | Secuencia de parada y cuantos pedidos comparte |
| Estado de parada | Estado de la parada |
| Viaje | Estado del viaje al que pertenece |
| Camion | Camion que transporta el pedido |
| Pago | Forma de pago del pedido |
| Peso kg | Peso del pedido |
| Monto Bs | Monto comercial |
| Incid. | Incidencias heredadas de la parada |
| Ultima senal | Ultimo ping del camion |
| Acciones | Abrir dialogo del viaje o navegar al mapa |

Acciones por fila:

- Boton de `ChartGantt`: busca la orden madre y abre `ViajeDialog`.
- Boton `Seguir`: navega al detalle con mapa por `pedidoId`.
- Doble click sobre la fila: navega al detalle con mapa.

## Filtros

La pantalla mezcla dos tipos de filtros:

- **Declarativos en `FilterBar`**: texto y estados.
- **Popovers de seleccion multiple**: canal y cliente.

Reglas por vista:

| Vista | Filtros |
|---|---|
| Ordenes | Texto (`orden o camion`) + estado del viaje |
| Pedidos | Texto (`pedido, cliente o camion`) + estado del viaje + estado de parada + canal + cliente |

Reglas de comportamiento:

- Canal y cliente existen solo en la vista Pedidos.
- Un array vacio en canal o cliente **no filtra**.
- Las opciones de canal y cliente se calculan sobre el universo completo del dia, no sobre el resultado ya filtrado.
- Cada opcion del popover muestra su peso: cantidad y monto.
- El boton `Quitar` limpia solo canal y cliente.

## Metricas de cabecera

El bloque derecho cambia con la vista.

En Ordenes:

- `Atencion prom.` sobre los viajes visibles.
- `En ruta prom.` sobre los viajes visibles.

En Pedidos:

- `Entregados`.
- `Con problema`.
- `Monto visible`.

No son metricas globales del sistema. Son metricas del subconjunto visible tras los filtros.

## Comportamiento en vivo

La pantalla usa `useFlotaViva`, que simula el contrato `snapshot + deltas`.

Lo que la UI espera de ese transporte:

- Un snapshot inicial del listado completo.
- Un solo canal SSE de flota, con scope de distribuidora.
- `tracking` agrupado para el listado.
- Eventos de estado sin agrupacion.

Canales visuales del cambio:

- `fila-viva`: barra de acento de la fila para vision periferica.
- `Destello`: resalta la celda que cambio.
- Punto o icono de ultima senal: expresa si la telemetria sigue fresca.

Hay una asimetria deliberada entre granularidades:

- En Ordenes, el ping puede encender la fila.
- En Pedidos, el ping NO enciende todas las filas hermanas del mismo camion; solo cambia el texto de "ultima senal".

## Navegacion que este listado habilita

Hay dos profundizaciones distintas:

- **Seguir**: entrar al detalle espacial del viaje en el mapa.
- **Linea de tiempo y detalle**: abrir un dialogo comparativo sin salir del barrido.

Ese segundo camino es nuevo y reduce una navegacion completa cuando la pregunta es financiera o de
puntualidad, no de ubicacion exacta.

## Implicancias para el documento tecnico

El documento formal de la pantalla deberia dejar fijas estas cuatro ideas:

1. El listado ya no tiene una sola granularidad.
2. La vista Pedidos no abre un contrato de stream nuevo; proyecta el mismo estado vivo a otro grano.
3. El dialogo del viaje es parte del flujo principal del listado, no una pantalla aparte.
4. Los filtros por canal y cliente son multiseleccion con buscador, no selects simples.
