# Monitoreo — de dónde sale cada dato

> **v0.0.3** — 2026-07-31. Las columnas de `trips` pasan a **`routes`**, no a `transport_order`: la
> salida física del camión es la ruta. Cambia el origen de cuatro columnas del listado, la clave del
> tracking (`ROUTE#{routeId}`) y —lo más importante para esta pantalla— el *Invariante 2*: con
> `transport_order.route_id` sin UNIQUE, dos órdenes del mismo camión pueden estar "En ruta" a la vez.

Contrato entre lo que la pantalla muestra y su origen. Regla que sostiene el documento: **si un dato
no tiene origen en esta tabla, no se muestra**. Los campos inventados son los que después obligan a
agregar columnas que nadie pidió.

Ver también: `README.md` (tablas y transporte) · `Monitoreo.drawio` (secuencia) ·
`../../UltimaVersion.sql` (esquema) · implementación en `src/mockup/monitoreo/`.

---

## Vocabulario (para no volver a discutirlo)

| Término | Es | NO es |
|---|---|---|
| **Ruta** (`routes`) | **La salida física**: un camión con su chofer saliendo del almacén. Lleva `truck_id`, chofer, `departure_date` y `completed_date` | El recorrido dibujado (eso es `encode_polyline`, una columna de esta tabla) · un documento |
| **Orden de transporte** (`transport_order`) | El **documento** de despacho: una carga asignada. Apunta a su salida con `route_id` | La salida física (varias órdenes pueden compartirla) · un documento de SAP |
| **Parada** (`dispatch_delivery_points`) | Un cliente en una ubicación | Un pedido |
| **Entrega** (`delivery_orders`) | El cruce de una orden con una parada. Lo que el chofer ejecuta | Lo mismo que la parada |
| **Pedido** (`candidate_orders`) | La orden de venta de SAP (`sales_order_id`, `document_id`) | Una parada |

```
orden de transporte ──< ENTREGA >── parada ──< pedido ──< producto
         1                 N          1          N           N
```

- Una **parada agrupa N pedidos**: el camión frena una vez y baja los 3 pedidos de ese cliente.
- Un **camión hace N salidas por día**, cada una con su propia ruta.
- **Una salida = una ruta.** Con el viaje en `routes`, la ruta es la que lleva camión, chofer y hora
  de salida. El chofer no intercala: sale, entrega todo, vuelve al almacén, recarga y recién ahí
  arranca la siguiente. Por eso el mismo camión y el mismo chofer se repiten en el listado con
  horarios de salida distintos: son rutas distintas.
- **Una salida puede llevar N órdenes.** `transport_order.route_id` es nullable y **sin UNIQUE**, así
  que dos documentos pueden viajar en el mismo camión. Comparten placa, chofer, salida y posición; lo
  que no comparten es el contador de entregas.

```
ruta ──< orden de transporte ──< ENTREGA >── parada ──< pedido ──< producto
  1              N                  N          1          N          N
```

---

## Pantalla 1 — Listado (`/monitoreo`)

`GET /monitoring/orders?distributorId=X` (snapshot) + `GET /monitoring/stream?distributorId=X` (SSE).

Una fila por **orden de transporte**.

| Columna | Origen |
|---|---|
| Orden | `transport_order` (código) |
| Camión | `trucks.plate` vía `routes.truck_id` (join en 18.6a) |
| Chofer | `routes.name_driver_employee` |
| Estado de la salida | `routes.transport_status` — el heredado de `trips` (PENDING / EN_RUTA / FINALIZADO). **No** es `transport_order.status`, que es el estado del documento (`orderStatus`: DISPATCHED…) y vive en otra tabla |
| Progreso | conteo de `delivery_orders.status` cerradas / total |
| Paradas | `count(delivery_orders)` de la orden |
| Incidencias | `count(delivery_incidents)` de sus entregas |
| Última señal | **Derivado**: `now() - trackedAt`, del ítem ACTUAL (`FLEET#{distributorId}` / `ROUTE#{routeId}`) |
| Salida | `routes.departure_date` |

Camión, chofer, estado y salida **vuelven a salir de otra tabla**: en v0.0.2 eran columnas de la
propia orden, ahora son de la ruta. La fila del listado se arma con dos consultas a Postgres más el
conteo de entregas, y la placa sigue necesitando `trucks`. Lo que la orden aporta a su propia
identidad es el código, el estado del documento y el progreso.

**Invariante 1 — solo aparecen órdenes DESPACHADAS.** Una orden sin `driver_employee_id` no pudo
salir, así que no existe la fila "sin chofer" — el lugar para asignarlo es despacho, no el monitor.

**Invariante 2 — un camión, una SALIDA en la calle.** Las salidas de un camión son SECUENCIALES:
sale, reparte, vuelve, recarga y recién ahí sale de nuevo. De ahí se siguen dos reglas que el listado
y el mapa tienen que respetar juntos:

1. **Nunca dos RUTAS de la misma placa "En ruta" a la vez.** Un camión no está en dos lugares. Si una
   placa se repite en el listado, a lo sumo una de sus **rutas** está en curso.
2. **Los estados son monótonos en el tiempo.** Ordenadas por salida: primero las finalizadas, después
   a lo sumo una en ruta, después las pendientes. Una salida de las 12:00 no puede figurar terminada
   mientras la de las 08:00 sigue afuera.

> ⚠️ **ESTE INVARIANTE SE REESCRIBIÓ EN v0.0.3, Y HAY QUE TOCAR EL MAPA.** Hasta v0.0.2 la regla se
> enunciaba **por fila** ("nunca dos cargas de la misma placa en ruta") y de ahí se deducía que el
> mapa podía dibujar un pin por carga. Con `transport_order.route_id` nullable y **sin UNIQUE**
> (`UltimaVersion.sql:286`, `:301`), **dos filas de la misma placa en ruta pasan a ser un estado
> legítimo**: son dos documentos del mismo camión. La regla sigue valiendo, pero **por ruta**, y el
> mapa tiene que dibujar **un pin por `routeId`** o muestra N camiones donde hay uno. Falta decidir
> además si el listado agrupa visualmente las órdenes de una misma salida o las repite.

El costo de romperlo no es cosmético: dos pines para un solo camión real, en posiciones idénticas o
—peor, si el cliente parchea mal— distintas. `monitoreo-data.ts` sortea **por camión** cuál de sus
salidas está en curso y deduce el resto, así que el mock no puede generar el estado prohibido; lo que
todavía no modela es el caso legítimo de dos órdenes en una ruta.

> ⚠️ **CONTRADICCIÓN SIN RESOLVER.** El invariante 1 dice que solo aparecen órdenes DESPACHADAS, pero
> el listado igual muestra filas "Sin salir" y `MonitoreoView.tsx` las ofrece como filtro de "Estado
> del viaje". Con el invariante 2 en su lugar esas filas ya no son un estado sorteado al azar: son las
> cargas POSTERIORES de un camión que hoy está repartiendo otra, o sea trabajo real del día que
> todavía no arrancó. Eso refuerza la postura de mostrarlas, pero no la decide. Las dos siguen siendo
> defendibles —el monitor es una pantalla de salidas EN CURSO vs. el planificador también quiere ver
> qué carga falta— y lo que no se puede es seguir teniendo el invariante escrito acá y el filtro en la
> pantalla. **Pendiente de decisión de producto.**

El stream de flota **agrupa los pings de GPS**. En la tabla un ping solo cambia "última señal":
reenviar 3,3 eventos por segundo haría parpadear la tabla para no decir nada nuevo. Los cambios de
estado (progreso, incidencias) sí van al instante. *(El contrato dice ~30 s; el mock usa 8 s
—`COALESCENCIA_MS`— para que la demo se vea moverse. Es el mismo mecanismo, otra constante.)*

**La tabla avisa lo que cambia, con dos canales.** Una pantalla de vigilancia que cambia sin avisar es
peor que una quieta: el dato se actualiza mientras mirás otra fila y nunca te enterás. Los dos duran lo
mismo (1,2 s) y dicen cosas distintas:

| Canal | Qué dice | Dónde |
|---|---|---|
| **Destello de la celda** | QUÉ cambió | Estado del viaje, progreso, incidencias y última señal |
| **Barra de acento en la fila** | DÓNDE mirar — se ve con visión periférica | Borde izquierdo de la fila |
| **Punto que late** | "esta señal está fresca" — el equivalente de tabla a las ondas del camión | Ícono de la columna *Última señal*; con señal vieja se queda quieto y cambia de forma |

El destello se dispara por una **firma** (estado + progreso + incidencias + `trackedAt`) y no por la
identidad del objeto: las filas se reconstruyen en cada tick del stream aunque no haya cambiado nada, y
destellar siempre es lo mismo que no destellar nunca. El primer render tampoco destella — al abrir, la
tabla entera se prendería fuego sin que haya pasado nada.

**Vocabulario de eventos del stream de flota**: `tracking` (agrupado ~30 s) · `order_progress` ·
`transport_status`. NO lleva `delivery_started` / `delivery_closed`: la tabla no muestra paradas,
muestra el CONTADOR de la orden, y mantener las 20 entregas de cada una de las 40 órdenes solo para
recalcular un "7 de 12" sería trabajo de cliente para un dato que el servidor puede mandar resuelto.

**Y desde v0.0.3 los eventos llegan con DOS claves distintas**, según de quién sea el hecho:
`tracking` y `transport_status` viajan con **`routeId`** —son del camión, y pueden tocar varias filas
a la vez—, mientras que `order_progress` viaja con **`transportOrderId`**. El cliente necesita dos
índices; con uno solo, un ping mueve una fila y deja la otra congelada. La tabla completa de las dos
granularidades vive en `src/mockup/monitoreo/use-flota-viva.ts`.

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
| Posición del camión | **DynamoDB** `truck_tracking`: ítem ACTUAL, o la última TRAZA (`Query PK=ROUTE#{routeId}`, `ScanIndexForward=false`, `Limit=1`). El `routeId` sale de `transport_order.route_id`, que viene en la misma fila del snapshot |
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

**Encuadre**: al abrir centra en el CAMIÓN (o en el recorrido si la orden no salió); al elegir una
parada centra en esa parada. Todo con `flyToBounds` —animado, para que el trayecto se vea— y padding
asimétrico que descuenta el ancho de los paneles flotantes.

**Herramientas propias** (no las de Leaflet, que se anclan a las esquinas donde viven los paneles):

| Herramienta | Tipo | Qué hace |
|---|---|---|
| Zoom ± | acción | — |
| **Centrar en el camión** | acción | Vuela al camión **y vuelve a encender el seguimiento**: pedir el camión es decir "quiero mirarlo a él" |
| **Seguir al camión** | interruptor | Ver abajo. Arranca **encendido** |
| Encuadrar recorrido | acción | La vista de conjunto: cuánto le falta |
| **Tramo siguiente** | interruptor | Dibuja solo el trecho del camión a su próxima parada; el resto del recorrido se **atenúa**, no se oculta |
| Capa Calles / Satélite | interruptor | — |

Los interruptores se marcan con fondo y color (`aria-pressed`), no solo con el ícono: a 15 px la
diferencia entre dos íconos parecidos no se lee.

**El pulso del camión.** Del pin salen **dos ondas** al ritmo del reporte (`PULSO_MS`, hoy 5 s en el
mock; la cadencia real es 10-15 s y puede subir a 30 s o 1 min). No es adorno: **sin señal las ondas se
apagan** y el pin se pinta gris. Es la misma información que el tooltip da en texto ("Sin señal hace
37 min") pero visible de un vistazo, que es lo que una pantalla de vigilancia necesita para que el
camión caído salte sin hover. Las ondas van en CSS (`.truck-pulse` en `index.css`) porque el marcador
se serializa a HTML; el color y el período llegan por custom properties desde el componente.

**Seguir al camión — el encuadre que corre solo.** Antes el encuadre automático ocurría UNA vez al
abrir el viaje, y a los pocos minutos el camión se había ido del cuadro; peor, podía quedar **detrás de
un panel**, que es peor que estar afuera porque el mapa parece estar bien y el camión no está. Ahora,
tres reglas:

1. **Solo si el usuario no tomó el control.** Cualquier arrastre o zoom manual lo apaga al instante: si
   alguien se fue a mirar otra zona, moverle la vista es lo más molesto que puede hacer una pantalla.
2. **Solo si el camión NO está visible.** Mientras esté dentro de la zona útil el mapa no se mueve.
   Reencuadrar en cada ping sería un temblor constante.
3. **La zona útil descuenta los paneles** (340 px el izquierdo, 380 px el derecho). Eso es lo que hace
   que "detrás del panel de paradas" cuente como fuera de cuadro.

Elegir una parada también lo apaga: el usuario pidió mirar ESE punto, y sin esto el siguiente ping le
arrancaría la vista de vuelta al camión.

**Herramientas que quedan propuestas, y necesitan backend:**

| Propuesta | Qué haría falta |
|---|---|
| **Recorrido REAL** (por dónde anduvo, no por dónde debía) | La traza ya existe: `Query PK=ROUTE#{routeId}` sin `Limit`. Es leer y dibujar |
| **Reproducir el día** (timeline con play) | Lo mismo con `SK BETWEEN`, más un control de tiempo en la UI |
| **Desvío del plan** | Comparar la traza contra `encode_polyline`. No hay nada que lo calcule |
| **ETA recalculada** a la próxima parada | Hoy solo existe la ETA planificada (`route_delivery_points.estimated_travel_s`). Recalcular con tráfico es una llamada al optimizador |
| **Geocerca del punto** (avisar si marcó llegada lejos) | Los datos están —`arrival_latitude/longitude` contra la coordenada del punto—; falta el umbral y quién lo evalúa |

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

Camión · Chofer · **Batería** en grilla con etiqueta, separando la IDENTIDAD de la salida de su SALUD.
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
| **Posición del camión** | Pin del mapa · encuadre inicial | `truck_tracking`: ítem **ACTUAL** (`FLEET#{distributorId}` / `ROUTE#{routeId}`) para el listado, o la **última TRAZA** (`PK=ROUTE#{routeId}`, `ScanIndexForward=false`, `Limit=1`) para el detalle. Son el mismo ping escrito dos veces |
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
| **Incidencias** | `delivery_incidents` (tipo, severidad, `requires_return`) + **la foto** (`photo_url`, `:464`) |
| **Comprobante** | `proof_of_deliveries`: **firma** (`signature_url`), **fotos** (`photo_url`), receptor, `receiver_document`, `captured_at` y **el GPS de la captura** (`gps_lat`/`gps_lon`, `:438-439`), más el cargo (`delivery_orders.receiver_relationship`, `:390`) |
| **Pedido** | Primero los **pedidos** que la parada agrupa (`candidate_orders`), después los **productos consolidados** (`delivery_order_items`) |
| **Cobro** | Facturado · a cobrar · cobrado · saldo, y **la lista de pagos** (pueden ser varios y parciales). El QR sale de `delivery_payment_references`; el monto, de `delivery_order_items.unit_price_snapshot`. Efectivo, transferencia y cheque **todavía sin tabla** — ver *Huecos* (16) |

Cabecera: ventana, llegada, cierre, `N pedidos · peso · volumen`, y el motivo
(`delivery_result_code`) cuando la entrega no se concretó.

El orden de la pestaña Pedido es deliberado: si mostrara solo productos, se perdería de vista que una
parada puede estar juntando tres pedidos distintos.

**La evidencia se MUESTRA, no se anuncia.** Hasta acá el panel tenía dos badges —"Firma capturada",
"Foto capturada"— y ningún archivo: el esquema guarda URLs (`signature_url`, `photo_url` son TEXT) y el
mock guardaba booleanos. Un comprobante que no se puede abrir no sirve para lo único que se le pide, que
es contestarle al cliente que dice que no recibió la mercadería. Ahora:

| Evidencia | De dónde sale en el mock |
|---|---|
| Firma del receptor | **SVG generado** (`firmaDeComprobante`, data URI). Una firma capturada en el celular es un trazo sobre un canvas, así que un SVG la retrata mejor que una foto de stock — y existe sin red |
| Fotos de la entrega | Dos: la mercadería y **la foto del propio punto de entrega**, la misma de la galería del planificador (`fotosDePunto`). Unsplash, ids ya verificados |
| Foto de la incidencia | La mercadería si la incidencia es de producto; el punto si es de acceso, demora o rechazo |
| Sin foto | 3 de cada 10 entregas cierran **sin** foto y el panel lo dice con todas las letras. Es un caso real, no un hueco de datos |

No se inventan ids nuevos de Unsplash: un id inventado devuelve `200` con cualquier cosa, y una foto de
contenido desconocido en una pantalla de evidencia es peor que ninguna. Todas caen a la ilustración SVG
del punto si el CDN falla.

**Toda foto se puede AMPLIAR** (`VisorFoto` / `FotoAmpliable`, en `src/mockup/`). Una miniatura de
100 px no sirve para mirar nada: no se distingue una caja mojada de una caja sana, ni se lee una firma.
El visor es un diálogo compacto —no un lightbox a pantalla completa— porque la foto casi nunca se mira
sola, se mira **contra el resto del caso**, y tapar el contexto obliga a cerrarlo para volver a leer.
Lleva epígrafe y datos (hora de captura, GPS, documento): sin eso, una foto de una caja es una caja de
cualquier parte.

### Quién firma NO es el cliente

Son dos datos distintos, en dos tablas distintas, y el mock los estaba confundiendo:

| Dato | Columna | Dónde se ve |
|---|---|---|
| **El CLIENTE** | `dispatch_delivery_points.customer_name` | Título del panel y de la tarjeta |
| **Quien RECIBIÓ y firmó** | `proof_of_deliveries.receiver_name` + `receiver_document`, y el cargo en `delivery_orders.receiver_relationship` (`:390`) | Pestaña *Comprobante* |

El generador derivaba el receptor del nombre del cliente (`parada.cliente.split(' ').slice(-2)`), así
que en "Casa La Ramada" el comprobante decía que había firmado **"La Ramada"** — un local, no alguien.
Ahora es una persona con nombre, cargo y documento (`receptorDe`, derivado por hash del id de la entrega
para que la simulación en vivo produzca el mismo).

**La diferencia importa justo cuando el comprobante se usa:** si el cliente reclama que no recibió,
"firmó Casa La Ramada" no prueba nada; "firmó Patricia Torres, cajera, CI 4039740, a las 08:34, a 12 m
del local" sí.

### La ficha del punto de entrega

La cabecera del panel derecho lleva una **miniatura de la fachada** que abre la ficha completa del
punto: la MISMA de la pantalla de planificación (`PuntoEntregaDialog`), no una copia. Foto, canal,
dirección, ventana, camión, totales y los pedidos que la parada agrupa.

Reusar el componente no es ahorro de código: es lo que hace que el planificador **reconozca el punto**
al pasar de una pantalla a la otra. Si cada pantalla dibujara el mismo lugar a su manera, habría que
volver a leerlo cada vez.

**No se abre con el click en el pin del mapa**, y es deliberado: ahí el click ya SELECCIONA la parada
—es lo que abre este panel—. Si además abriera un modal, la acción principal de la pantalla quedaría
tapada por una ficha que se consulta de vez en cuando. Desde la cabecera está a un click de donde ya
estás mirando.

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
2. **No hay incidencias de la SALIDA** — `delivery_incidents.delivery_order_id` es NOT NULL, así que
   un camión averiado o un corte de calle no tienen dónde registrarse: son hechos de la orden entera,
   no de una entrega. Es justo lo que un monitor en tiempo real necesita mostrar.
3. **`receiver_name` duplicado** en `delivery_orders` y `proof_of_deliveries`. Falta definir dueño.
4. **`proof_of_deliveries.device_id`** es un BIGINT que no apunta a ninguna tabla.
5. **`routes.truck_id` y `driver_employee_id` sin FK declarada.** Venían así del bloque `trips`
   (`UltimaVersion.sql:206-225`, el que se elimina) y el hueco se muda con las columnas a `routes`
   (`:228-255`): anular la tabla no lo cierra. Peor: `routes` queda con **dos** referencias a camión
   —`planning_truck_id` (`:231`, con FK) y el `truck_id` heredado (sin FK)— y **dos** a persona
   —`employee_id` (`:234`) y `driver_employee_id`—. Hay que declarar quién manda en cada par.
6. **`delivery_order_items` no separa por documento SAP** — tiene `product_id` pero no
   `sales_order_id`. Decidido: la pestaña Pedido va **por producto**. Si algún día se necesita "el
   pedido 4471 se entregó y el 4472 lo rechazaron", hay que agregarlo.
7. **Teléfono del chofer** — no existe. Del chofer, la ruta solo lleva `driver_employee_id` y
   `name_driver_employee`. Hace falta para el botón de llamar desde el monitor.

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
    NULL` con FK (`UltimaVersion.sql:284` y `:298`)—, y la PK del ítem ACTUAL es
    `FLEET#{distributorId}`. **En v0.0.3 esa PK deja de estar cubierta**: la compone el ping, que
    ahora habla de la ruta, y `routes` no tiene `distributor_id` — hay que heredarla de
    `trips.distributor_id` (`:209`). Lo que faltaba, además, es que el dato existiera en
    `src/mockup/monitoreo/`:
    ni `OrdenMonitoreo` ni `ViajeMonitoreo` lo llevaban.
    Impacto: sin scope, la PK de Dynamo no se puede componer y el stream no se puede suscribir —las dos
    cosas son POR DISTRIBUIDOR, no globales—, así que el mock no podía ensayar ninguna de las dos.
    **Resuelto parcialmente**: hay scope y viaja hasta la clave y hasta el hook del listado
    (`DISTRIBUIDOR_ACTIVO` en `tracking-dynamo.ts`, la primera distribuidora del maestro, no un número
    escrito a mano). Lo que sigue abierto: es UNA distribuidora fija porque no existe el selector, y las
    filas del listado todavía no llevan la suya, así que el mock **simula** el scope en vez de filtrar
    por él. Cuando exista el selector, el filtro del listado sale de `transport_order.distributor_id`
    sin joins; el del ping, en cambio, necesita la columna nueva en `routes`.

### Abiertos por mover el viaje a `routes` (v0.0.3)

13. **`routes` no tiene `distributor_id`** (`UltimaVersion.sql:228-255`) y la PK del ítem ACTUAL es
    `FLEET#{distributorId}`. Con el ping hablando de rutas, esa clave no se puede componer sin heredar
    la columna de `trips` (`:209`). Bloquea el tracking, no solo el mock.
14. **`routes` guarda CANDIDATAS** (`engine`, `score`, `total_cost`, `is_selected`, `:235-243`), así
    que camión, chofer y hora de salida caerían también en las filas que el optimizador descartó.
    Falta un índice único parcial sobre la seleccionada y una regla para el recálculo posterior a la
    salida.
15. **El mapa dibuja un pin por fila y tiene que dibujar uno por `routeId`.** Con N órdenes por ruta,
    `SeguimientoMapa.tsx` mostraría N camiones donde hay uno. Es la contracara del *Invariante 2*
    reescrito, y es trabajo de frontend, no de esquema.
16. **EL COBRO NO TIENE NINGUNA TABLA.** La pestaña *Cobro* del panel de detalle está en el mockup a
    propósito —para poder discutirla sobre algo concreto— y lo primero que muestra en pantalla es que es
    una propuesta. Qué tiene origen hoy y qué no:
    - **Sí:** el monto del pedido y la forma de pago (`Contado` / `Crédito` / `Transferencia`), que
      vienen del **pedido de SAP**. En nuestro esquema `candidate_orders` (`:176-203`) guarda peso y
      volumen y **ningún monto**, así que ni eso es una columna local: es una dependencia externa, como
      las coordenadas del punto.
    - **No:** estado del cobro, monto cobrado, número de recibo, quién cobró y cuándo. No existen.
    Lo que haría falta: una tabla de cobros por entrega —`delivery_payments` (`delivery_order_id`,
    `method`, `amount`, `currency`, `receipt_number`, `collected_by`, `collected_at`)— y decidir si el
    monto se desnormaliza en `candidate_orders` al armar el plan o se resuelve por servicio contra SAP.
    **Impacto si se implementa como está:** el mock deriva el cobro de la forma de pago del pedido
    (contado y transferencia se cobran en el punto, el crédito no), y esa regla es del negocio, no del
    esquema. Si el negocio dice otra cosa —cobro parcial, cheque diferido, retención—, el modelo no
    tiene dónde ponerlo.
