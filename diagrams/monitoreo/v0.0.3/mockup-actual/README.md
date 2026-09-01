# Mockup actual de monitoreo

> Corte: **2026-08-25**. Este paquete describe la UI y el comportamiento observable del mockup que
> hoy vive en `src/mockup/monitoreo/`. No reemplaza el contrato formal de `DocumentacionTecnica.md`,
> `Streaming.md`, `Eventos.md` ni `Frontend.md`: sirve como base de redaccion para llevar las pantallas
> nuevas al documento tecnico sin volver a releer todo el codigo.

## Alcance

Lo que este paquete SI documenta:

- La granularidad real de cada pantalla y cada tabla.
- La navegacion entre listado, dialogo del viaje y detalle con mapa.
- Los filtros, pivotes y estados de seleccion que hoy existen en la UI.
- El comportamiento en vivo que la interfaz espera del backend.
- Los huecos que el mock deja marcados a nivel UX.

Lo que este paquete NO redefine:

- El modelo relacional ni el transporte SSE del documento formal.
- Los DTOs ni los nombres canonicos de eventos del backend.
- Los cambios historicos entre `v0.0.1`, `v0.0.2` y `v0.0.3`.

## Como leerlo

| Archivo | Para que sirve |
|---|---|
| `01-listado-maestro.md` | La pantalla `/monitoreo`: vistas Ordenes y Pedidos, filtros, acciones y senales en vivo |
| `02-viaje-dialogo.md` | El dialogo que abre desde el listado: tabla de paradas, pivote a pedido y filtro por canal |
| `03-detalle-mapa.md` | La vista `/monitoreo/seguimiento/:ordenId` o `:pedidoId`: mapa, paneles flotantes y detalle de parada |
| `04-plan-vs-ejecutado.md` | El eje temporal "Plan vs ejecutado": modelo, semaforo, zoom y resecuenciamiento |

## Fuentes de codigo

Este paquete sale de estos componentes y hooks, leidos contra el repo actual:

- `src/mockup/monitoreo/MonitoreoView.tsx`
- `src/mockup/monitoreo/ViajeDialog.tsx`
- `src/mockup/monitoreo/TablaViajeMonitoreo.tsx`
- `src/mockup/monitoreo/TablaPedidosViaje.tsx`
- `src/mockup/monitoreo/MonitoreoDetalleView.tsx`
- `src/mockup/monitoreo/SeguimientoMapa.tsx`
- `src/mockup/monitoreo/ParadasPanel.tsx`
- `src/mockup/monitoreo/DetalleParadaPanel.tsx`
- `src/mockup/monitoreo/RutaParalela.tsx`
- `src/mockup/monitoreo/linea-tiempo.ts`
- `src/mockup/monitoreo/use-flota-viva.ts`
- `src/mockup/monitoreo/use-seguimiento-vivo.ts`

## Regla de uso

Si este paquete y el documento formal difieren, tomar los dos asi:

- **Contrato backend / esquema**: manda el paquete formal de `v0.0.3/`.
- **Comportamiento UX actual**: manda este paquete, porque sale del codigo que hoy renderiza la demo.

La diferencia importa porque el mock de monitoreo todavia conserva terminologia de `tripId` en algunos
hooks de simulacion, mientras la carpeta `v0.0.3/` ya fija el modelo formal sobre `routeId`.
