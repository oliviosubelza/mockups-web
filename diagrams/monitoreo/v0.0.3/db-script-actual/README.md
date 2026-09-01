# Monitoreo sustentado en `db_script.sql`

> Corte: **2026-08-25**. Este paquete no documenta el modelo acordado de `v0.0.3`; documenta la
> variante que hoy sí se puede defender contra `../../../db_script.sql`.

## Para qué existe

En `v0.0.3/` hay una tensión real:

- El documento formal describe el modelo objetivo de monitoreo.
- `db_script.sql` todavía conserva otra distribución de columnas y otras claves reales.

Este anexo baja solo dos frentes del módulo al nivel de **backend + DB**:

1. **§ 25** `GET /monitoring/orders/{transportOrderId}`
2. **§ 26** actualización en tiempo real por SSE

## Archivos

| Archivo | Qué contiene |
|---|---|
| `DocumentacionTecnica-25-26.md` | Contrato técnico de snapshot y streaming, con tablas, joins, payloads y huecos sustentados en `db_script.sql` |
| `Flujo-25-26.puml` | Diagrama de secuencia de snapshot + stream + publicación de eventos, usando las fuentes reales del esquema actual |

## Regla de lectura

Si este anexo contradice al documento principal de `v0.0.3`, leerlo así:

- **Modelo objetivo acordado**: manda `../DocumentacionTecnica.md`, `../Streaming.md` y `../Eventos.md`.
- **Qué existe hoy en esquema**: manda este anexo y `../../../db_script.sql`.

La diferencia importa porque hoy `routes` no guarda todavía varios campos que el modelo objetivo del
monitor asume como propios de la salida.
