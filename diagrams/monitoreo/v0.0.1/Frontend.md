# Monitoreo — de dónde sale cada dato

Contrato entre lo que la pantalla muestra y su origen. Regla que sostiene el documento: **si un dato
no tiene origen en esta tabla, no se muestra**. Los campos inventados son los que después obligan a
agregar columnas que nadie pidió.

Ver también: `README.md` (tablas y transporte) · `Monitoreo.drawio` (secuencia) ·
`../../UltimaVersion.sql` (esquema) · implementación en `src/mockup/monitoreo/`.

---

## Vocabulario (para no volver a discutirlo)

| Término | Es | NO es |
|---|---|---|
| **Viaje** (`trips`) | Un camión con su chofer saliendo del almacén con UNA carga | El camión (un camión hace N viajes por día) |
| **Orden de transporte** (`transport_order`) | Documento de despacho. Nace en nuestro microservicio | Un documento de SAP |
| **Parada** (`dispatch_delivery_points`) | Un cliente en una ubicación | Un pedido |
| **Entrega** (`delivery_orders`) | El cruce de una orden con una parada. Lo que el chofer ejecuta | Lo mismo que la parada |
| **Pedido** (`candidate_orders`) | La orden de venta de SAP (`sales_order_id`, `document_id`) | Una parada |

```
viaje ──< orden de transporte ──< ENTREGA >── parada ──< pedido ──< producto
  1            N                    N          1          N          N
```

- Una **parada agrupa N pedidos**: el camión frena una vez y baja los 3 pedidos de ese cliente.
- Un **camión hace N viajes por día**, cada uno con su propia carga.
- **Un viaje = una carga = una orden.** El chofer no intercala: sale, entrega toda la orden, vuelve
  al almacén, recarga y recién ahí arranca la siguiente. Por eso el mismo camión y el mismo chofer se
  repiten en el listado con horarios de salida distintos.

---

## Pantalla 1 — Listado (`/monitoreo`)

`GET /monitoring/orders?distributorId=X` (snapshot) + `GET /monitoring/stream?distributorId=X` (SSE).

Una fila por **orden de transporte**.

| Columna | Origen |
|---|---|
| Orden | `transport_order` (código) |
| Camión | `trucks.plate` vía `trips.truck_id` |
| Chofer | `trips.name_driver_employee` |
| Estado del viaje | `trips.status` |
| Progreso | conteo de `delivery_orders.status` cerradas / total |
| Paradas | `count(delivery_orders)` de la orden |
| Incidencias | `count(delivery_incidents)` de sus entregas |
| Última señal | **Derivado**: `now() - trackedAt`, del ítem ACTUAL (`FLEET#{distributorId}`) |
| Salida | `trips.departure_date` |

**Invariante**: solo aparecen viajes DESPACHADOS. Un `trip` sin `driver_employee_id` no pudo salir,
así que no existe la fila "sin chofer" — el lugar para asignarlo es despacho, no el monitor.

> ⚠️ **CONTRADICCIÓN SIN RESOLVER.** El invariante de arriba dice que solo aparecen viajes DESPACHADOS,
> pero el mock hace lo contrario y a propósito: `monitoreo-data.ts` le asigna estado `'pendiente'` a
> ~20% de los viajes ("Sin salir") y `MonitoreoView.tsx` incluye "Sin salir" entre los filtros de
> "Estado del viaje". Las dos posturas son defendibles —el monitor es una pantalla de viajes EN CURSO
> vs. el planificador también quiere ver qué carga todavía no arrancó— y ninguna se eligió todavía. El
> código se deja como está; lo que no se puede es seguir teniendo el invariante escrito acá y el filtro
> en la pantalla. **Pendiente de decisión de producto.**

El stream de flota **agrupa los pings de GPS (~30 s)**. En la tabla un ping solo cambia "última
señal": reenviar 3,3 eventos por segundo haría parpadear la tabla para no decir nada nuevo. Los
cambios de estado (progreso, incidencias) sí van al instante.

**Vocabulario de eventos del stream de flota**: `tracking` (agrupado ~30 s) · `order_progress` ·
`trip_status`. NO lleva `delivery_started` / `delivery_closed`: la tabla no muestra paradas, muestra el
CONTADOR de la orden, y mantener las 20 entregas de cada una de las 40 órdenes solo para recalcular un
"7 de 12" sería trabajo de cliente para un dato que el servidor puede mandar resuelto. La tabla completa
de las dos granularidades vive en `src/mockup/monitoreo/use-flota-viva.ts`.

---

## Pantalla 2 — Detalle (`/monitoreo/seguimiento/:ordenId`)

`GET /monitoring/orders/{id}` (snapshot) + `GET /monitoring/orders/{id}/stream` (SSE).

La orden va **en la URL**, no en un store: recargar reconstruye el contexto y el link se puede pasar.

Layout de tres zonas: **mapa a sangre**, con panel de paradas y panel de detalle **flotando encima**.
Los paneles no empujan al mapa — así Leaflet no re-renderiza tiles al abrir o cerrar uno, y no se
pierde la referencia visual.

### Mapa

| Elemento | Origen |
|---|---|
| Recorrido planificado | `routes.encode_polyline` (la de `is_selected`) — **el mock lo APROXIMA**, ver abajo |
| Número del pin | `route_delivery_points.sequence` |
| Color del pin | `delivery_orders.status` |
| Insignia ✓/✕/↩ | Solo cuando la entrega cerró |
| Posición del camión | **DynamoDB** `truck_tracking`: ítem ACTUAL, o la última TRAZA (`Query PK=TRIP#{tripId}`, `ScanIndexForward=false`, `Limit=1`) |
| Trazo hecho vs pendiente | corte en la última entrega cerrada |
| Color de la polilínea y del pin del camión | **UI del planificador** (`rutaPorCamionId`), no una tabla — ver *Huecos* |

**El "recorrido planificado" del mock NO decodifica una polilínea.** El origen documentado
(`routes.encode_polyline`) es el contrato y se mantiene: es lo que el backend va a devolver, calculado
por el optimizador. Lo que el mock dibuja son **segmentos rectos** DEPÓSITO → paradas en orden de visita
→ DEPÓSITO (`viaje.recorrido` en `monitoreo-data.ts`); `decodePolyline` existe en el proyecto
(`src/mockup/map/geo/polyline.ts`) pero esta pantalla no lo usa porque no hay ninguna polilínea real que
decodificar.

Es aceptable para un mock porque lo que la pantalla tiene que probar es **la secuencia y el corte**: en
qué orden se visitan las paradas y dónde termina lo recorrido. Las dos cosas se leen igual con rectas.
Lo que la aproximación NO puede validar y hay que revisar con datos reales: cuánto ocupa una ruta de
verdad en pantalla, si el camión aparece "fuera" del trazo al interpolar, y el costo de re-renderizar
una polilínea de cientos de puntos en cada ping.

**Encoding de los pines**: chapa blanca con punta + círculo de color con el número. El estado se lee
por dos canales, uno independiente del color: el **color** (matiz del estado) y la **insignia**
(presente = cerrada, y cuál de los tres cierres). El relleno del círculo ya no codifica nada — dentro
de una chapa blanca, un círculo hueco se confundía con el fondo.

El pin se **interpola en el cliente** entre pings. La fluidez del mapa y la frecuencia del ping son
problemas distintos: subir el ping a 2 s para que "se vea lindo" quema la batería del chofer.

**Encuadre**: al abrir centra en el CAMIÓN (o en el recorrido si el viaje no salió); al elegir una
parada centra en esa parada. Todo con `flyToBounds` —animado, para que el trayecto se vea— y padding
asimétrico que descuenta el ancho de los paneles flotantes.

**Herramientas propias** (no las de Leaflet, que se anclan a las esquinas donde viven los paneles):
zoom ± · centrar en el camión · encuadrar recorrido · capa Calles/Satélite.

### Panel de paradas (izquierda)

Una tarjeta por entrega, en orden de visita, unidas por un **riel vertical** que espeja el trazo del
mapa: sólido en el tramo recorrido, punteado en el que falta.

| Dato | Origen |
|---|---|
| Número | `route_delivery_points.sequence` |
| Cliente | `dispatch_delivery_points.customer_name` |
| Punto de entrega | `dispatch_delivery_points.delivery_point_id` |
| Estado | `delivery_orders.status` |
| Llegada → cierre | `arrived_at` → `delivered_at` |

Deliberadamente corta: el receptor, el motivo, las cantidades y las incidencias van al panel de
detalle. Una lista de 20 paradas con seis datos cada una no se escanea.

La fila **no lleva la insignia ✓/✕/↩** que sí lleva el pin del mapa, y no es una inconsistencia: acá
el estado está escrito con palabras, así que la insignia sería redundante.

**Buscador + tres filtros** (Todas / Abiertas / Con problema). Son tres y no uno por estado porque el
planificador no busca "las devueltas", busca *"lo que me falta"* o *"lo que salió mal"*. El filtro
afecta **solo a la lista**: ocultar pines rompería la lectura de la secuencia en el mapa.

### Cabecera del panel

Camión · Chofer · **Batería** en grilla con etiqueta, separando la IDENTIDAD del viaje de su SALUD.
La batería es el único de los tres que puede exigir una acción, y va en tres tramos con ícono propio
(≤20% rojo · ≤40% ámbar · resto neutro).

Debajo, **frescura de la pantalla** ("En vivo" / "Actualizado hace X"). Es distinta de "última señal":
esa dice *"a este camión se le cayó el GPS"*, esta dice *"la conexión se murió y estás mirando datos
congelados"*. La expone también el listado, con el mismo componente.

### Telemetría — los tres datos que salen de `truck_tracking`

Faltaban de este documento, y la regla que lo sostiene es que un dato sin origen acá no se muestra. Los
tres se renderizan y los tres vienen del mismo ítem de DynamoDB, no de Postgres:

| Dato | Dónde se ve | Origen |
|---|---|---|
| **Batería** | Cabecera del panel de detalle · tooltip del camión | `truck_tracking.battery` — está en **los dos** tipos de ítem (TRAZA y ACTUAL), porque cada ping escribe los dos |
| **Posición del camión** | Pin del mapa · encuadre inicial | `truck_tracking`: ítem **ACTUAL** (`FLEET#{distributorId}` / `TRIP#{tripId}`) para el listado, o la **última TRAZA** (`PK=TRIP#{tripId}`, `ScanIndexForward=false`, `Limit=1`) para el detalle. Son el mismo ping escrito dos veces |
| **Última señal** | Columna del listado · tooltip del camión | **DERIVADO**: `now() - trackedAt`. No se guarda |

**Qué se guarda y qué se calcula.** Se guarda el ÍTEM CRUDO (`latitude`, `longitude`, `battery`,
`trackedAt`, `receivedAt`) y se deriva todo lo que la pantalla muestra. La implementación tenía esto al
revés: guardaba `posicion: [lat, lng]` y `ultimaSenalMin: 37` y perdía el `trackedAt`. Con el derivado
guardado no se puede reconstruir el instante, no se puede comparar contra `receivedAt` para distinguir
*"el GPS no fija"* de *"el celular buferea sin cobertura"*, y el número queda clavado mientras el reloj
sigue. La costura está en `src/mockup/monitoreo/tracking-dynamo.ts`: tipos de los dos ítems,
composición/parseo de claves, los dos simuladores de Query y los derivados.

**Umbral de "sin señal": 15 min.** Con el ping documentado (10-15 s), son 60-90 pings consecutivos
perdidos — dos órdenes de magnitud arriba de un túnel o un reintento. Y por abajo: el ping se corta
cuando el camión está detenido, así que un silencio corto es compatible con una descarga y no puede
alarmar. Vive en una sola constante (`UMBRAL_SENAL_VIEJA_MIN`) porque la tabla y el mapa tienen que
pintar caído al mismo camión.

### Panel de detalle (derecha, abre al click)

| Pestaña | Origen |
|---|---|
| **Historial** | `delivery_order_histories` (`status`, `reason`, `created_at`, `created_by`) |
| **Incidencias** | `delivery_incidents` (tipo, severidad, foto, `requires_return`) |
| **Comprobante** | `proof_of_deliveries` (firma, foto, receptor, `captured_at`) |
| **Pedido** | Primero los **pedidos** que la parada agrupa (`candidate_orders`), después los **productos consolidados** (`delivery_order_items`) |

Cabecera: ventana, llegada, cierre, `N pedidos · peso · volumen`, y el motivo
(`delivery_result_code`) cuando la entrega no se concretó.

El orden de la pestaña Pedido es deliberado: si mostrara solo productos, se perdería de vista que una
parada puede estar juntando tres pedidos distintos.

---

## Derivados: se calculan, no se guardan

La tabla está partida en dos a propósito. Antes era una sola y se leía como si todo estuviera hecho; la
mitad de abajo está **definida pero no implementada**, y decirlo es la única forma de que la lista siga
sirviendo como especificación.

**Calculados por el mock hoy:**

| Dato | Cómo sale | Dónde |
|---|---|---|
| "Sin señal hace X" | `now() - trackedAt` | `minutosSinSenal` en `tracking-dynamo.ts` |
| Posición del camión | `[latitude, longitude]` del ítem | `posicionDe` en `tracking-dynamo.ts` |
| "Fuera de ventana" | `delivered_at` fuera de `delivery_window_start/end` | `fueraDeVentana` en `monitoreo-data.ts` |
| Progreso de la orden | `delivery_orders` cerradas / total | `resumenEntregas` en `monitoreo-data.ts` |
| Trazo hecho vs pendiente | corte en la última entrega cerrada | `SeguimientoMapa.tsx` |

**Definidos y NO implementados en el mock** (el cálculo está especificado; no hay código que lo haga, y
ninguna pantalla lo muestra):

| Dato | Cómo saldría | Por qué todavía no |
|---|---|---|
| Velocidad | Dos puntos consecutivos de la traza | La traza ya existe y alcanza para calcularla, pero ninguna pantalla tiene dónde ponerla. Es la razón por la que `speed` se sacó del payload |
| Orientación del camión | Dirección del segmento de la polilínea | El pin es un círculo con un ícono, no una flecha. Con el recorrido aproximado por rectas, la orientación sería la de la recta y no la de la calle |
| "En camino a X" | Primera entrega no cerrada por `sequence` | El estado `en_camino` existe por entrega, pero no se compone en ningún lado el texto "en camino a *tal cliente*" |
| "Fuera de ruta" | `arrived_at` en orden distinto al `sequence` planificado | Nada compara el orden real de llegada contra el planificado |

---

## Huecos abiertos del esquema

1. **`delivery_result_code` sin dominio** — está comentado `-- POR DEFINIR`. Igual `incident_code`,
   `severity`, `pod_status`. Sin catálogo el panel no puede pintar etiquetas ni colores estables.
2. **No hay incidencias de VIAJE** — `delivery_incidents.delivery_order_id` es NOT NULL, así que un
   camión averiado o un corte de calle no tienen dónde registrarse. Es justo lo que un monitor en
   tiempo real necesita mostrar.
3. **`receiver_name` duplicado** en `delivery_orders` y `proof_of_deliveries`. Falta definir dueño.
4. **`proof_of_deliveries.device_id`** es un BIGINT que no apunta a ninguna tabla.
5. **`trips.truck_id` y `driver_employee_id` sin FK declarada** (`UltimaVersion.sql:206-225`).
6. **`delivery_order_items` no separa por documento SAP** — tiene `product_id` pero no
   `sales_order_id`. Decidido: la pestaña Pedido va **por producto**. Si algún día se necesita "el
   pedido 4471 se entregó y el 4472 lo rechazaron", hay que agregarlo.
7. **Teléfono del chofer** — no existe en `trips`, que solo guarda `name_driver_employee`. Hace falta
   para el botón de llamar desde el monitor.

### Encontrados al ensayar el contrato de tracking

8. **Las coordenadas de la parada son una DEPENDENCIA EXTERNA, no una columna faltante.**
   *Bajado de severidad: estaba listado como el más grave de la lista, y no lo es.*
   Evidencia: `UltimaVersion.sql:131-156` — la parada guarda `delivery_point_id`, `customer_name`, la
   ventana horaria, peso y volumen, y **ni `latitude` ni `longitude`**.
   Impacto: el mapa dibuja un pin por parada (`SeguimientoMapa.tsx`,
   `<Marker position={[entrega.lat, entrega.lng]}>`) y hoy el `lat`/`lng` de cada entrega sale del
   dataset generado.

   **Resolución, y está definida:** el maestro de puntos de entrega es **externo**, y lo resuelve el
   snapshot **`01 DeliveryPoint`** —input `deliveryPointId, ownerId, customerId`, output con
   `latitud`/`longitud`—, documentado en `DocumentacionTecnica.md` § *Servicios Externos de los
   Snapshots*. Por eso `delivery_point_id` es un `BIGINT` **sin FK**: apunta fuera de este
   microservicio, y eso es correcto, no un olvido. Lo que hay que declarar es la **dependencia**, no
   agregar una columna.

   La pregunta natural es *"¿no se recuperan hacia arriba, en `routes` o en los delivery points?"*. Sí,
   pero hacia arriba significa **fuera del servicio** — y conviene tener claro por qué ninguna tabla
   local alcanza:
   - **`routes` no las tiene por parada.** `encode_polyline` es la **geometría del trayecto**: dibuja la
     línea, y es lo que el mock aproxima con segmentos rectos. Pero una polilínea es una lista de puntos
     **sin identidad** — no puede decir *"este vértice es la parada del cliente X"*. Resuelve el trazo,
     no los pines. `route_delivery_points` tampoco: aporta `sequence`, `estimated_distance_m` y
     `estimated_travel_s`, ningún par lat/lon.
   - **No existe una tabla maestra local de puntos de entrega.** `grep CREATE TABLE` sobre
     `UltimaVersion.sql` devuelve solo `dispatch_delivery_points`, `image_delivery_points` y
     `route_delivery_points`. Y `dispatch_delivery_points.delivery_point_id` (`:135`) es un `BIGINT`
     **sin FK**, comentado como *"Referencia del cliente/punto de entrega"*: apunta **fuera** de este
     microservicio.

   En todo el esquema hay lat/lon en exactamente tres lugares, y ninguno es la parada planificada:
   `distributors.latitude/longitude` (`:8-9`, el **depósito**), `delivery_orders.arrival_latitude/longitude`
   (`:393-394`, dónde el camión **ya llegó**) y DynamoDB `truck_tracking` (el camión).

   Lo que queda por decidir es **cuándo** se resuelve, no de dónde: (a) **al vuelo** contra
   `01 DeliveryPoint` en cada snapshot —el dato vive donde pertenece, porque una ubicación de cliente no
   cambia por despacho, pero suma una llamada externa al camino crítico de la pantalla—; (b) **desnormalizadas** en `dispatch_delivery_points` al
   armar el plan, si se quiere congelar la ubicación tal como estaba ese día y no pagar la llamada en
   cada apertura de pantalla. Ojo: `delivery_orders.arrival_latitude/longitude` y
   `proof_of_deliveries.gps_lat/lon` **no sirven** para esto — son dónde el chofer marcó la llegada, o
   sea un dato que existe DESPUÉS de la entrega y solo si se hizo.
9. **`transport_order` no tiene columna visible de código/número.** Evidencia:
   `UltimaVersion.sql:281-302`. La primera columna del listado es "Orden (código)"
   (`Frontend.md`, Pantalla 1) y el mock la sirve como `orden.codigo`, un campo que el generador inventa.
   Impacto: el planificador identifica la orden por ese número —es lo que busca, lo que dicta por
   teléfono y lo que copia en un mail—; si no está en la tabla, cada consumidor lo va a derivar del `id`
   a su manera y dos pantallas van a mostrar dos códigos distintos para la misma orden.
10. **`delivery_order_histories.created_by` se declara como origen pero no hay autor.** Evidencia: la
    pestaña **Historial** lo lista entre sus orígenes (arriba, Panel de detalle); en el esquema es
    `created_by VARCHAR(255)` sin FK (`UltimaVersion.sql:485`); y el mock no lo modela ni lo renderiza
    (`EventoEntrega` en `monitoreo-data.ts` tiene `estado`, `hora` y `nota`, nada más).
    Impacto: una bitácora sin autor no sirve para lo único que se le pide, que es "quién cerró esta
    entrega así". Un VARCHAR libre además no garantiza que dos escritores pongan lo mismo. Falta decidir
    si el autor es el empleado, el dispositivo o el proceso automático, y si se guarda el id o el nombre.
11. **`viaje.color` no tiene tabla.** Se usa para la polilínea del recorrido y para el pin del camión
    (`SeguimientoMapa.tsx`), y sale de `rutaPorCamionId(...)?.color` — **estado de UI del planificador**,
    no una columna. Impacto: el color es la única cosa que ata visualmente al mismo camión entre la
    pantalla de planificación y la de monitoreo, así que si se pierde al pasar por el backend, el mismo
    camión se ve de dos colores. Hay que decidir si el color se persiste (en `trucks`, y entonces es
    identidad del camión) o si se recalcula en el cliente con una función estable del `truck_id` (y
    entonces las dos pantallas tienen que usar la MISMA función).
12. **`distributorId` acota los cuatro endpoints web y el mock no tenía scope de distribuidora.** Es un
    hueco del MOCK, no del esquema: Postgres sí lo modela —`transport_order.distributor_id BIGINT NOT
    NULL` con FK (`UltimaVersion.sql:284` y `:298`) y `trips.distributor_id` (`:209`)—, y la PK del ítem
    ACTUAL es `FLEET#{distributorId}`. Lo que faltaba es que el dato existiera en `src/mockup/monitoreo/`:
    ni `OrdenMonitoreo` ni `ViajeMonitoreo` lo llevaban.
    Impacto: sin scope, la PK de Dynamo no se puede componer y el stream no se puede suscribir —las dos
    cosas son POR DISTRIBUIDOR, no globales—, así que el mock no podía ensayar ninguna de las dos.
    **Resuelto parcialmente**: hay scope y viaja hasta la clave y hasta el hook del listado
    (`DISTRIBUIDOR_ACTIVO` en `tracking-dynamo.ts`, la primera distribuidora del maestro, no un número
    escrito a mano). Lo que sigue abierto: es UNA distribuidora fija porque no existe el selector, y las
    filas del listado todavía no llevan la suya, así que el mock **simula** el scope en vez de filtrar
    por él. Cuando exista el selector, la orden ya tiene la columna: sale de `transport_order`, sin joins.
