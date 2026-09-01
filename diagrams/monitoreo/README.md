# Monitoreo — índice de versiones

Cada carpeta es un **modelo de datos completo**, no un parche sobre el anterior. Se versiona entero
porque el cambio que las separa toca el esquema, los DTOs, las claves de DynamoDB y los diagramas a
la vez: leer la mitad de una y la mitad de la otra da un contrato que no existe.

| Versión | Fecha | Modelo | Estado |
|---|---|---|---|
| [`v0.0.1/`](v0.0.1/) | hasta 2026-07-30 | La tabla `trips` existe. `transport_order.trip_id` es **muchos-a-uno**: una carga puede llevar varias órdenes. Las claves de la traza y del ítem actual son `TRIP#{tripId}` | Congelada, para diff |
| [`v0.0.2/`](v0.0.2/) | 2026-07-30 | **Se anula `trips`** y sus columnas pasan a `transport_order`. El modelo queda **1:1** —una orden = un camión = una salida física— y las claves pasan a `ORDER#{transportOrderId}` | Congelada, para diff |
| [`v0.0.3/`](v0.0.3/) | 2026-07-31 | **Las columnas de `trips` van a `routes`, no a `transport_order`**: la salida física es la RUTA. El vínculo es `transport_order.route_id` (nullable, sin UNIQUE), así que vuelve el **muchos-a-uno** —una ruta lleva N órdenes— y las claves pasan a `ROUTE#{routeId}` | Vigente |

Contenido idéntico en las dos: `DocumentacionTecnica.md` (contrato de endpoints y DTOs),
`Monitoreo.drawio` (diagramas de secuencia), `Secuencia.puml` (los mismos flujos, redundante),
`Frontend.md` (origen del dato por pantalla), `README.md` y `formater.json` (fixtures).

## Por dónde empezar

- **Qué cambió y por qué**: página **`M0`** de `v0.0.3/Monitoreo.drawio`. Está el impacto página por
  página y las cinco decisiones abiertas. La `M0` de `v0.0.2` sigue ahí y describe el paso anterior.
- **El contrato al día**: `v0.0.3/DocumentacionTecnica.md`.
- **Comparar dos versiones**: `diff v0.0.2/DocumentacionTecnica.md v0.0.3/DocumentacionTecnica.md`.
  Cada `.drawio` se generó por script desde el de la versión anterior, así que conserva geometría y
  estilos y el diff del XML muestra solo las etiquetas que cambiaron.

## Dos advertencias

1. **`../UltimaVersion.sql` todavía declara `trips`** (`:206-225`), `transport_order.trip_id`
   (`:285`) y `routes.trip_id` (`:233`). La decisión de los líderes aún no bajó al esquema, así que
   `v0.0.3` describe el modelo **acordado**, no el vigente en la base. La implementación de referencia
   (`src/mockup/monitoreo/`) también sigue en `v0.0.1`.
2. **`diagrams/` está en `.gitignore`**: nada de esta carpeta está versionado en git. Estas carpetas
   `v0.0.x` SON el control de versiones. Lo que se borre acá no se recupera.
