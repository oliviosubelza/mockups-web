# 31 EL3 · Obtener pedidos para logística — el intake desde MS Ventas

Diagrama: `EL3-Intake.drawio` — una página, sección **31**. Numeración: el doc oficial
`Documento Tecnico v1 (8).pdf` usa **1-19 y 21-25**, la **20** se deja libre, `Productos.drawio` tomó
**26-27**, `zonas/Zonas.drawio` **28-29**, `planificacion/PedidosPlanificados.drawio` **30**. **Próxima
libre: la 32.** Los retornos no se numeran en el diagrama.

Este documento especifica el contrato **`EL3.- Obtener pedidos para logística`** tal como lo publicó
Ventas, y lo cruza campo por campo contra nuestro esquema.

```http
POST /logistics/orders
```

---

## 1. Por qué esta sección importa más que las otras

Hasta ahora **nadie había documentado el intake.** Busqué `INSERT INTO candidate_orders` en todos los
`.md` y `.drawio` del proyecto: no existe. El §26 lee `candidate_orders`, el §27 lee, el §30 lee — pero
el paso que la **llena** no estaba escrito en ningún lado.

EL3 es ese paso. Y al documentarlo aparecieron cosas que ninguno de los flujos de lectura podía ver,
porque todos asumían que los datos ya estaban ahí: **un cambio de grano** (§2), **dos bloqueantes**
(§3) y **dos huecos** (§4).

> **Revisión del 2026-08-19.** Ventas publicó una segunda versión de EL3 que agrega `saleOrderId`,
> `saleOrderSplitId`, `sapSaleOrderId` e `isCooled`. Resuelve el bloqueante del identificador y abre el
> tema del split — que es más grande. Este documento describe **esa** versión.

---

## 2. El hallazgo principal: la unidad planificable es el SPLIT, no el pedido

La revisión del 2026-08-19 de EL3 agregó cuatro campos, y uno de ellos cambia el modelo de datos:

```json
{ "saleOrderId": 1, "saleOrderSplitId": 1, "sapSaleOrderId": 1, "isCooled": false, ... }
{ "saleOrderId": 1, "saleOrderSplitId": 2, "sapSaleOrderId": 2, "isCooled": true,  ... }
```

**Los dos elementos son el MISMO pedido.** `saleOrderId: 1` en ambos. Lo que cambia es
`saleOrderSplitId` (1 y 2), `sapSaleOrderId` (1 y 2), `sapReserveCode` (`SO000123` / `SO000125`),
`isCooled` (`false` / `true`) y los montos.

### 2.1 Qué queda refutado

El proyecto tenía escrita una hipótesis sobre `sales_order_split_id`: que **el split era por
empresa/sociedad**. Está en el §5.4 de `planificacion/DocumentacionTecnica.md` y en el propio DDL, en el
comentario de la FK de `delivery_payment_references` (`:440`):

```sql
FOREIGN KEY (delivery_order_sale_id) --- REFERENCIA A LA ORDEN DIVIDIDA POR EMPRESA
```

**Este payload la refuta:** los dos splits tienen **el mismo `companyId: 1`** y el mismo
`warehouseId: 2`. Si el split fuera por empresa, la empresa tendría que diferir. No difiere.

Lo único que sí diferencia a los dos splits, además de los ids y los montos, es **`isCooled`** — y el
campo se agregó **en la misma revisión** que los campos de split. La lectura más directa es que **el
pedido se parte por temperatura**: frío y seco no viajan en el mismo compartimento, así que cada uno es
una unidad despachable distinta.

**Sigue siendo hipótesis** —una sola muestra— pero es una hipótesis con evidencia, contra la anterior que
no tenía ninguna. Y lo que está **probado** es que no es por empresa.

### 2.2 La lectura que reconcilia todo: son DOS ejes distintos

Lo más probable es que existan **dos particiones ortogonales** del mismo pedido, y que el proyecto las
haya estado confundiendo en una sola palabra:

| Eje | Para qué | Dónde vive hoy |
|---|---|---|
| **Por temperatura** (frío/seco) | Unidad de **despacho**: define en qué camión va | `saleOrderSplitId` de EL3. **En nuestro esquema, en ningún lado** |
| **Por empresa/sociedad** | Unidad de **facturación**: define quién factura y quién cobra | `delivery_order_sales` (`:400`), con `company_code` y el comentario del `:440` |

Si es así, las dos son reales y las dos hacen falta. El problema es que
**`transport_order_sales.sales_order_split_id` (`:302`) no dice cuál de las dos guarda** — y es la única
columna `split` de todo el esquema.

**Es la pregunta más importante para Ventas.** Si son dos ejes, un pedido puede partirse en 2 (frío/seco)
× 2 (empresas) = 4 unidades, y el modelo actual no lo soporta en ningún nivel.

### 2.3 Lo que hay que cambiar en `candidate_orders`

`candidate_orders` guarda hoy `sales_order_id` y nada del split. Si la unidad planificable es el split,
la tabla está en el grano equivocado: **dos splits del mismo pedido son dos filas que hoy son
indistinguibles.**

```sql
ALTER TABLE candidate_orders
    ADD COLUMN sale_order_split_id BIGINT,
    ADD COLUMN sap_sale_order_id   BIGINT,
    ADD COLUMN is_cooled           BOOLEAN NOT NULL DEFAULT FALSE;

-- La clave real del intake. Sin esto, un reproceso duplica filas en vez de actualizarlas.
CREATE UNIQUE INDEX uq_candidate_orders_split
    ON candidate_orders (sale_order_id, sale_order_split_id)
 WHERE deleted_at IS NULL;
```

**`is_cooled` no es un adorno.** `trucks.is_refrigerated` (`:64`) existe, y el planificador tiene que
poder mandar un split frío a un camión con termo. Sin persistir el flag, **después del intake ese
emparejamiento es imposible**: el dato llegó, se mostró en la grilla y se perdió. Es el tercer campo con
la misma historia, junto al vendedor y las coordenadas.

Los tres ids porque los tres son distintos y los tres se usan:

| Campo EL3 | Qué es | Varía por |
|---|---|---|
| `saleOrderId` | El pedido comercial de Ventas | pedido |
| `saleOrderSplitId` | El split dentro del pedido | **split** |
| `sapSaleOrderId` | El id que SAP le da a ESE split | **split** |

Ojo con esto: `sapSaleOrderId` **varía por split** (1 y 2), así que para SAP los splits son pedidos
separados. Y `candidate_orders.sales_order_id` tiene el comentario *"ID del pedido comercial en
SAP/Ventas"* — **ambiguo entre los dos**. Hay que decidir cuál va ahí; en el ejemplo los dos valen `1` en
el primer elemento, que es justo el caso donde un test no detecta el error.

### 2.4 La §30 se rompe con esto

`planificacion/PedidosPlanificados.md` devuelve `plannedSalesOrderIds: number[]`. Con splits, **un pedido
puede estar parcialmente planificado**: el split seco entró al plan de hoy y el frío no, porque no había
camión con termo.

Un array de ids de pedido **no puede expresar eso**. Devolver `1` sugiere que el pedido está planificado
cuando la mitad no lo está; omitirlo sugiere que nada lo está. Las dos respuestas son falsas.

La §30 tiene que pasar a devolver la clave compuesta:

```json
{
  "plannedSalesOrderIds": [1],
  "partiallyPlannedSalesOrderIds": [1],
  "details": [
    { "saleOrderId": 1, "saleOrderSplitId": 1, "isCooled": false, "status": "PLANNED" },
    { "saleOrderId": 1, "saleOrderSplitId": 2, "isCooled": true,  "status": "RECEIVED_NOT_PLANNED" }
  ]
}
```

Y aparece un noveno estado a nivel pedido: **`PARTIALLY_PLANNED`**. Es el mismo patrón que ya salió tres
veces en estos endpoints: *"no hay"*, *"no lo sabemos"* y ahora *"a medias"* son respuestas distintas.

### 2.5 Bloqueante resuelto: ya viene el identificador

La revisión anterior de EL3 **no traía ningún id de pedido** y eso bloqueaba la integración entera —
26.5, 27.5 y §30 completa. **Resuelto:** `saleOrderId` viene, más el split y el id de SAP.

Queda un detalle de nomenclatura, ahora con **cuatro** variantes del mismo concepto:

| Dónde | Cómo se llama |
|---|---|
| EL3 | `saleOrderId` — **singular** |
| `candidate_orders:179` | `sales_order_id` — plural |
| `transport_order_sales:301` | `sales_order_id` — plural |
| `delivery_order_sales:403` | `sale_order_id` — **singular** |

Y `delivery_order_sales` **no tiene columna de split**, así que en última milla la identidad del split se
pierde. Conviene unificar la grafía en la nueva columna antes de que sean cinco.

## 3. Los otros dos bloqueantes

### 3.1 El volumen se pierde por precisión

`total_volume_m3` es **`DECIMAL(12, 2)`** en tres tablas nuestras. Y EL3 manda:

| Pedido | `totalVolume` que llega | Lo que se guarda |
|---|---|---|
| `SO000123` | `0.000586` | **`0.00`** |
| `SO000125` | `0.00826` | **`0.01`** |

No es un redondeo cosmético: **perdemos el volumen de prácticamente todos los pedidos**, y con él la
barra de ocupación del camión, que es el criterio con el que el planificador decide si un camión está
lleno. Queda en cero y nadie se da cuenta hasta que un camión sale medio vacío.

`format_sales.json` confirma la escala: `totalVolume: 0.011846` para un pedido de 202 Bs.

Y con splits es peor: los volúmenes se parten, así que cada split trae un número **más chico** todavía
que el del pedido completo.

Tablas afectadas:

```sql
ALTER TABLE candidate_orders          ALTER COLUMN total_volume_m3 TYPE DECIMAL(12, 6);  -- :183
ALTER TABLE dispatch_delivery_points  ALTER COLUMN total_volume_m3 TYPE DECIMAL(12, 6);  -- :144
ALTER TABLE transport_order_sales     ALTER COLUMN total_volume_m3 TYPE DECIMAL(12, 6);  -- :307
```

`DECIMAL(12,6)` como mínimo. El peso a 2 decimales sobrevive (`0.42` kg), pero conviene subirlo también
por consistencia — `format_sales.json` trae pesos de línea con 4 decimales.

### 3.2 Los códigos SAP son strings y nuestras columnas son BIGINT

| Campo EL3 | Valor de ejemplo | Nuestra columna | Problema |
|---|---|---|---|
| `sapReserveCode` | `"SO000123"` | — | **Tiene letras: no cabe en ningún BIGINT** |
| `sapDocRequirement` | `"4100123456"` | `candidate_orders.document_id BIGINT **NOT NULL**` | Numérico pero string: entra con cast |
| `sapDocOrder` | `"5000123456"` | — | Sin destino |
| `sapDocDelivery` | `"4800123456"` | — | Sin destino |
| `sapDocContable` | `"5100123456"` | — | Sin destino |
| `sapDocTransport` | `"4900123456"` | — | Sin destino |
| `sapDocInvoice` | `"5200123456"` | `transport_order_sales.invoice_id BIGINT` | Recién en la OT |

`document_id` es **`NOT NULL`**. Si mapea a `sapDocRequirement`, hay que confirmar que EL3 **siempre**
lo trae: con `sapStatus: "CREADO"` es razonable que los documentos posteriores (entrega, transporte,
factura) vengan vacíos, y si el de requerimiento también puede faltar, el `INSERT` explota.

**Decisión a tomar:** o los `sapDoc*` pasan a `VARCHAR(20)`, o se acuerda que Ventas los manda como
number. Mezclar string en el contrato y BIGINT en la tabla es un cast en cada fila y un fallo el día que
aparezca un código con prefijo.

---

## 4. Los dos huecos

### 4.1 Recibimos las coordenadas y las tiramos

EL3 trae **cuatro** coordenadas por pedido:

```json
"customerLatitude": -21, "customerLongitude": -50.5,
"deliveryPointLatitude": -21, "deliveryPointLongitude": -50.5
```

Y `dispatch_delivery_points` **no tiene ninguna columna de coordenadas** (verificado sobre `:129-158`).
Pero el ruteo las necesita — `routes.encode_polyline` (`:224`) existe y se calcula con ellas. O sea:
**hoy viven en memoria durante la planificación y se pierden al guardar.**

Tres consecuencias concretas:

1. Un plan guardado **no se puede re-rutear** sin volver a llamar a EL3 — y EL3 filtra por fecha, así
   que un plan viejo puede no ser reproducible.
2. El mapa de un plan histórico **no se puede redibujar**.
3. El punto-en-polígono de la **§29** sobre paradas ya planificadas es **imposible**.

```sql
ALTER TABLE dispatch_delivery_points
    ADD COLUMN latitude  NUMERIC(9,6),
    ADD COLUMN longitude NUMERIC(9,6);
```

Mismo tipo que `distributors.latitude/longitude` (`:11-12`), que es el precedente del esquema.

### 4.2 El vendedor: EL3 confirma los tres campos

```json
"employeeId": 8, "employeeCode": "V001", "employeeName": "Carlos Rojas"
```

Son **exactamente** los tres campos propuestos en el §1.1 de
`planificacion/PedidosPlanificados.md`, y `employeeIds: [1]` ya es un filtro del request. La migración
queda confirmada por el contrato:

```sql
ALTER TABLE candidate_orders
    ADD COLUMN employee_id   BIGINT,
    ADD COLUMN employee_code VARCHAR(20),
    ADD COLUMN employee_name VARCHAR(100);
```

Va en `candidate_orders` y no en `dispatch_delivery_points` — el razonamiento completo está en el §1.1
de la §30 (una parada unifica pedidos de vendedores distintos).

---

## 5. La zona: quién es el dueño del dato

EL3 devuelve `"zoneId": 1, "zone": "Norte"`. Y las zonas son **nuestro** dato maestro (§28), con
`dispatch_delivery_points.zone_id` **con FK a `zones(id)`** (`:156`).

Dos lecturas posibles, y son incompatibles:

- **(a) Ventas llama nuestra `POST /zones/resolve` (§29) al crear el pedido y guarda el resultado.**
  Entonces EL3 nos devuelve nuestro propio id, todo cierra, y el `zone_id` se puede insertar directo sin
  recalcular. El ciclo §29 → EL3 es consistente.
- **(b) Ventas mantiene su propio catálogo de zonas.** Entonces hay **dos fuentes de verdad**, el
  `zoneId` que nos mandan **no es una FK válida** contra `zones(id)`, el `INSERT` de 31.6 falla, y la
  **§29 no tiene sentido** — nadie la consumiría.

**Hay que confirmar cuál antes de implementar la §29.** El aviso equivalente está al principio de
`diagrams/zonas/DocumentacionTecnica.md`, para que nadie arranque ese endpoint sin ver esta pregunta. El paso `31.6a` del diagrama existe justo para
esto: validar el `zoneId` contra `zones` antes de insertar. Si es el caso (b), el paso pasa a ser un
mapeo entre catálogos, no una validación.

Ojo con el nombre además: EL3 manda `"zone": "Norte"` y nuestra `zones.name` de ejemplo es
`"Zona Norte"`. Si se comparan por nombre en algún lado, no matchean.

---

## 6. Mapeo campo por campo

### 6.1 Request (`FilterOrdersDto` → body de EL3)

| Campo EL3 | Tipo | Nuestro filtro equivalente |
|---|---|---|
| `channelIds` | `number[]` | `channels` del `FilterOrdersDto` oficial |
| `cityIds` | `number[]` | `cities` |
| `employeeIds` | `number[]` | `employees` — **vendedores** |
| `marketIds` | `number[]` | `markets` |
| `zoneIds` | `number[]` | `zones` |
| `distributorIds` | `number[]` | `distributorId` — **ver §6.1: nuestro es singular** |
| `paymentMethodIds` | `number[]` | `paymentType` |
| `companyIds` | `number[]` | `company` |
| `status` | `string[]` | — **ver §6.2** |
| `isCooled` | `boolean` | `productType` (frío/seco) |
| `initDate` / `finishDate` | `date` | `deliveryDateFrom` / `deliveryDateTo` |

### 6.2 Response — lo que SÍ tiene destino

| Campo EL3 | Nuestra columna |
|---|---|
| `deliveryPointId` | `dispatch_delivery_points.delivery_point_id` (`:133`) |
| `customerId` | `.customer_id` (`:137`) |
| `customerName` | `.customer_name` (`:138`) — **`VARCHAR(50)`, "Supermercado América" entra justo** |
| `ownerId` | `.owner_id` (`:135`) |
| `ownerName` | `.owner_name` (`:136`) — `VARCHAR(50)` |
| `warehouseId` | `.warehouse_destination_id` (`:139`) |
| `deliveryPointStartHourReception` | `.delivery_window_start` (`:141`) |
| `deliveryPointEndHourReception` | `.delivery_window_end` (`:142`) |
| `zoneId` | `.zone_id` (`:134`) — **sujeto al §4** |
| `totalNet` | `.total_neto` (`:145`) |
| `totalWeight` | `candidate_orders.total_weight_kg` (`:182`) |
| `totalVolume` | `.total_volume_m3` (`:183`) — **roto por precisión, §3.1** |
| `sapDocRequirement` | `.document_id` (`:180`) — **con cast, §3.2** |
| `sapDocInvoice` | `transport_order_sales.invoice_id` — recién en la OT |
| `companyId` | `delivery_order_sales.company_code` (`:403`) — recién en última milla |

### 6.3 Response — lo que llega y NO tenemos dónde poner

**Se pierden 30 campos.** Los agrupo por si vale la pena rescatar alguno:

| Grupo | Campos | ¿Vale guardarlo? |
|---|---|---|
| **Identidad** | `saleOrderId`, `saleOrderSplitId`, `sapSaleOrderId` | **Sí — §2.3, cambia el grano** |
| **Temperatura** | `isCooled` | **Sí — §2.3, sin esto no hay match con `trucks.is_refrigerated`** |
| **Geo** | `customerLatitude/Longitude`, `deliveryPointLatitude/Longitude` | **Sí — §4.1** |
| **Vendedor** | `employeeId`, `employeeCode`, `employeeName` | **Sí — §4.2** |
| **Cliente** | `customerCode`, `customerDocumentNumber/Type`, `customerComplement`, `customerPhone` | El teléfono sirve al chofer en última milla |
| **Comercial** | `customerAvgTicket`, `customerDropSize` | Útiles para priorizar la parada (`priority` existe y hoy nadie la calcula) |
| **Owner** | `ownerSubChannelId/Name`, `ownerDocumentNumber/Type`, `ownerComplement` | El subcanal es criterio de agrupación |
| **Contacto** | `deliveryPointContact` | Sí: `proof_of_deliveries.receiver_name` se compara contra esto |
| **Pago** | `paymentModeId`, `paymentModeType` | **Sí**: define si el chofer cobra. Conecta con `delivery_payment_references` |
| **Estado** | `statusId`, `statusDescription`, `sapStatus`, `orderTypeName`, `origin` | `type_movement` existe y podría recibir `orderTypeName` |
| **Fechas** | `dateReception`, `startHourReception`, `endHourReception` | Las de cabecera duplican las del punto |
| **SAP** | `sapReserveCode`, `sapDocOrder`, `sapDocDelivery`, `sapDocContable`, `sapDocTransport` | Trazabilidad; hoy no hay dónde. `sapReserveCode` varía **por split** |
| **Montos** | `totalGross`, `totalBonusDiscount`, `totalDiscount`, `totalIce` | Solo guardamos `total_neto` |
| **Empresa** | `companyName`, `warehouseName` | Los nombres se pueden resolver por id |

El más urgente después de los bloqueantes es **`paymentModeId`/`paymentModeType`**: sin eso el chofer no
sabe si tiene que cobrar en la parada, y `delivery_payment_references` existe para registrar ese cobro.

---

## 7. Incoherencias del contrato

### 7.1 `distributorIds` es array, nuestro modelo es singular

`candidate_orders.distributor_id` (`:182`) es `NOT NULL` **singular**, y
`dispatch_plans.distributor_id` (`:97`) también: **un plan es de UNA distribuidora.**

Y peor: **EL3 no devuelve `distributorId` en la respuesta.** Mandás `distributorIds: [1, 2]` y no te dice
a qué distribuidora pertenece cada pedido. Con un solo id se infiere; con varios, es imposible partir el
resultado.

**Dos salidas:** o EL3 agrega `distributorId` a cada elemento de `data[]`, o se acuerda que el campo
acepta **exactamente un** id. La primera es mejor: el filtro multi-distribuidora sirve para ver, aunque
el plan después se arme por una sola.

### 7.2 El filtro `status` no se puede construir desde la respuesta

| Dónde | Forma |
|---|---|
| Request | `"status": ["invoiced"]` — string, inglés, minúscula |
| Response | `"statusId": 2, "statusDescription": "Pendiente"` — id + español |

No hay forma de armar el request a partir de lo que devuelve la respuesta. **Falta el catálogo**: qué
valores acepta `status`, y su correspondencia con `statusId`. Y hay que elegir uno de los dos —
`statusIds: number[]` sería consistente con los otros diez filtros, que todos son ids.

`sapStatus: "CREADO"` es un **tercer** vocabulario de estado en el mismo objeto.

### 7.3 No hay paginación

`data[]` es un array plano. El §26 de `planificacion/DocumentacionTecnica.md` habla de **216 pedidos**, y
cada elemento de EL3 tiene 57 campos. Sin `page` / `limit` / `total`, eso es un payload que crece sin
techo y que el Frontend tiene que aguantar entero antes de pintar la primera fila.

### 7.4 No hay líneas de producto

EL3 no trae items, así que la **26.5** y la **27.5** siguen siendo obligatorias. Ahora sí se pueden
llamar, porque `saleOrderId` viene — pero **hay que definir con qué clave**: si la unidad es el split, el
batch de la 26.5 tiene que pedir items **por split** (`saleOrderSplitId`), no por pedido. Si pide por
pedido, devuelve los items de frío y seco mezclados y el resumen de stock del §26 no se puede repartir
entre los dos splits.

### 7.5 `isCooled` en el request ya no puede ser un booleano

Ahora que `isCooled` viaja **por split**, el filtro del request tiene un problema:

```json
"isCooled": false
```

`false` significa "solo seco". **No hay forma de pedir los dos.** Y en la mayoría de los serializadores
un `false` explícito es indistinguible de un default, así que un cliente que no le importa la temperatura
va a recibir solo la mitad de los pedidos sin saberlo.

Hace falta que sea opcional con semántica de "ausente = ambos", o mejor, consistente con los otros diez
filtros que son arrays: `isCooledValues: [true, false]`.

### 7.6 Unidades del peso

EL3 manda `totalWeight: 0.42` para un pedido de 32 Bs. En `format_sales.json` el mismo pedido tiene
cabecera `totalWeight: 5.19` y línea `totalWeight: 420.0000`. **La cabecera parece estar en kg y la línea
en gramos.** Nuestra columna se llama `total_weight_kg`: hay que confirmar que EL3 manda kg y no otra
unidad, porque un factor 1000 en la capacidad del camión no se nota hasta que el camión no arranca.

---

## 8. Qué se toca por paso

| Paso | Contra qué | Operación |
|---|---|---|
| 31.4 | **MS Ventas — EL3** | `POST /logistics/orders` |
| 31.5 | — | Mapeo en memoria — **acá se descartan 30 campos** |
| 31.6 | `dispatch_delivery_points` | **`INSERT`** |
| 31.6a | `zones` | `SELECT` de validación de FK (§4) |
| 31.7 | `candidate_orders` | **`INSERT`** |

**Cuándo ocurren 31.6 y 31.7 es la pregunta abierta.** En el diagrama van dentro de un `opt` rotulado
*"al confirmar la selección — paso NO documentado"*, porque el orden del doc oficial es §02 *Crear Plan
(DRAFT)* y después §03 *Seleccionar Filtro*: el plan existe antes que los pedidos. No inventé el
disparador — hay que definirlo.

---

## 9. Lo que hay que pedirle a Ventas, en orden

1. **¿Qué eje es `saleOrderSplitId`?** (§2.2) Frío/seco, empresa, o los dos ejes a la vez. Es la pregunta
   que define el grano de `candidate_orders`, de `transport_order_sales.sales_order_split_id` y de la
   §30 entera. Todo lo demás es menor al lado de esto.
2. **¿Cuál id va en `sales_order_id`: `saleOrderId` o `sapSaleOrderId`?** (§2.3) En el primer elemento del
   ejemplo los dos valen `1`, que es justo el caso donde un test no detecta el error.
3. **¿Los items de la 26.5 se piden por pedido o por split?** (§7.4) Si es por pedido, el resumen de stock
   no se puede repartir entre los splits.
4. **`isCooled` opcional o array** (§7.5) — hoy no hay forma de pedir frío y seco juntos.
5. **`distributorId` en cada elemento**, o `distributorIds` limitado a un id (§7.1).
6. **El catálogo de `status`** y elegir entre string o `statusIds` (§7.2).
7. **Paginación** — `page`, `limit`, `total` (§7.3). Con splits hay más filas que pedidos.
8. **Confirmar la unidad de `totalWeight` y `totalVolume`** (§7.6).
9. **Confirmar de dónde sale `zoneId`** (§5) — define si la §29 se implementa o se descarta.
10. **Confirmar que `sapDocRequirement` viene siempre**, porque `document_id` es `NOT NULL` (§3.2).
11. **Tipo de los `sapDoc*`**: string o number (§3.2).

Y de nuestro lado, sin depender de Ventas:

- `sale_order_split_id`, `sap_sale_order_id` e `is_cooled` en `candidate_orders`, con el índice único
  sobre `(sale_order_id, sale_order_split_id)` (§2.3)
- `DECIMAL(12,6)` en los tres `total_volume_m3` (§3.1)
- `latitude`/`longitude` en `dispatch_delivery_points` (§4.1)
- `employee_id`/`code`/`name` en `candidate_orders` (§4.2)
- Reescribir la respuesta de la §30 con la clave compuesta y el estado `PARTIALLY_PLANNED` (§2.4)
- Corregir el comentario del `:440` del DDL si el split no es por empresa (§2.1)
- Documentar el disparador de 31.6/31.7 (§8)

## 10. Referencias

- `diagrams/ventas/EL3-Intake.drawio` — el diagrama de secuencia (sección 31)
- `diagrams/ventas/EL3.json` — request y response completos, anotados
- `diagrams/planificacion/PedidosPlanificados.md` — §30, el consumidor del `sales_order_id` que falta
- `diagrams/planificacion/DocumentacionTecnica.md` — §26 y §27, que llaman por `salesOrderId`
- `diagrams/zonas/DocumentacionTecnica.md` — §28 y §29, afectadas por el §4
- `diagrams/UltimaVersionUltima.sql` — `candidate_orders:176-201`, `dispatch_delivery_points:129-158`
- `format_sales.json` — el detalle de un pedido, que **sí** trae `"id"`
