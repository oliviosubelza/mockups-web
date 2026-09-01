# Obtener productos de un pedido candidato, con stock confirmado o no

Diagrama: `Productos.drawio` — dos páginas, secciones **26** (listado) y **27** (detalle).
Numeración según la convención del proyecto (`UltimaVersion.drawio` es la referencia). Las secciones
1-19, 21-23 las ocupa el documento técnico oficial y 24-25 las tomó Monitoreo; 20 se deja libre a
propósito. Los retornos no se numeran en el diagrama.

---

## 1. Por qué son dos flujos y no uno

Son dos preguntas distintas y tienen costos distintos:

| | Pregunta | Cuándo | Qué necesita |
|---|---|---|---|
| **26** | ¿Este pedido tiene ALGO sin confirmar? | Al abrir el listado, para **todos** los pedidos | Un booleano + un contador por pedido |
| **27** | ¿QUÉ productos y cuántos? | Al hacer click en **un** pedido | Las líneas completas + descripción del producto |

Meterlos en un solo endpoint significaría traer las líneas de los 216 pedidos del listado para
mostrar un color. La 26 devuelve un resumen; la 27 devuelve el detalle.

---

## 2. Las tablas, una por una

### 2.1 `candidate_orders` — NUESTRA (`UltimaVersion.sql:176-203`)

Es la tabla que alimenta el paso 1. Lo que se lee en **26.4** y **27.4**:

| Columna | Para qué |
|---|---|
| `id` | PK del pedido candidato |
| `sales_order_id` | **La clave del flujo**: es el puente a Ventas |
| `document_id` | Documento SAP, para mostrar |
| `distributor_id` | Scope obligatorio del listado |
| `total_weight_kg`, `total_volume_m3` | Los agregados que ya usa la barra de cobertura |
| `is_included` | Si el pedido entra al plan |

**Lo que NO tiene: ni una sola línea de producto.** No hay `product_id`, no hay cantidades, no hay
monto. Del pedido guarda dos números agregados y la referencia a Ventas. Por eso el flujo no puede
resolverse dentro de nuestra base: `candidate_orders` es un puente, y el paso 26.5 / 27.5 es
obligatorio.

**Escritura: ninguna.** Los dos flujos son de lectura pura.

### 2.2 `sales_order_item` — DE VENTAS / SAP (`DB.puml:24-31`)

Acá está el dato que buscamos. Se consulta en **26.5** y **27.5**:

| Campo | Para qué |
|---|---|
| `sales_order_split_id` | FK al pedido (o a su partición — ver §5) |
| `product_id` | Qué producto |
| `requested_qty` | Lo que el cliente pidió |
| `confirmed_qty` | **Lo que Ventas confirmó con stock** |

La regla completa de "stock a confirmar" es la comparación de esas dos columnas (paso **27.7**):

```
confirmed_qty >= requested_qty   → CONFIRMED
0 < confirmed_qty < requested_qty → PARTIAL
confirmed_qty == 0                → NO_STOCK
```

**Esta entidad NO es una tabla nuestra.** En el ERD está dentro del paquete
`(Snapshots, Cache, Datos externos)` marcada `<<MS Ventas - SAP>>`, y no aparece en
`UltimaVersion.sql`. No se hace `JOIN` contra ella: se le pide por servicio a Ventas. Por eso en el
diagrama es una lifeline de sistema externo y no de tabla.

### 2.3 `product_snapshot` — NUESTRA, cache local (`DB.puml:35-40`)

Se consulta en **27.6** para resolver `product_id` → producto legible:

| Campo | Estado |
|---|---|
| `product_id` | PK |
| `weight` | ✅ existe |
| `volume` | ✅ existe |
| `description` | ❌ **no existe** |
| `unit` | ❌ **no existe** |

**Este es el hueco más concreto.** Sin descripción ni unidad, el panel no puede escribir
"Aceite girasol 900 ml · 12 cajas": solo tendría el `product_id` numérico. Dos salidas, y hay que
elegir una:

- **A** — Ampliar `product_snapshot` con `description` y `unit`. Es cache local, así que el panel
  responde sin depender de SAP, pero hay que mantener la sincronización.
- **B** — Que Ventas devuelva la descripción en el mismo payload de 27.5. Cero tablas nuevas, pero
  el detalle queda atado a que SAP responda.

Tampoco existe hoy tabla ni columna para el snapshot en el SQL: `product_snapshot` está en el ERD
pero no en `UltimaVersion.sql`. Sea A o B, es trabajo nuevo.

### 2.4 Tablas que este flujo NO toca (pero se confunden)

| Tabla | Cuándo se usa | Por qué NO sirve acá |
|---|---|---|
| `transport_order_sales_items` (`:338`) | Chequeo de carga | Solo tiene `product_id` y `quantity_min`. Existe recién cuando ya hay orden de transporte, o sea después de planificar |
| `truck_inventories` (`:354`) | Inventario a bordo | `loaded_qty` / `expected_qty` / `variance_qty`: es lo que SUBIÓ al camión, no lo que Ventas confirmó |
| `delivery_order_items` (`:409`) | Última milla | `planned_qty` / `delivered_qty` / `returned_qty`: es la entrega al cliente |

Las tres son posteriores al paso 1. **La primera estructura nuestra con detalle por producto aparece
recién en el chequeo de carga** — en planificación no tenemos ninguna.

---

## 3. Resumen: qué se toca por paso

| Paso | Contra qué | Operación |
|---|---|---|
| 26.4 | `candidate_orders` | `SELECT` (lectura) |
| 26.5 | MS Ventas / SAP | `POST /sales/orders/items:batch` — **una** llamada, no N |
| 26.6 | — | Cálculo en memoria |
| 27.4 | `candidate_orders` | `SELECT` de una fila |
| 27.5 | MS Ventas / SAP | `GET /sales/orders/{id}/items` |
| 27.6 | `product_snapshot` | `SELECT ... WHERE product_id IN (...)` |
| 27.7-27.8 | — | Cálculo en memoria |

**Ninguna escritura en ninguna tabla.** Los dos flujos son de lectura. El estado de stock no se
persiste de nuestro lado a propósito: la fuente de verdad es Ventas y guardarlo sería una copia que
se desincroniza en la primera confirmación.

---

## 4. Qué pasa si Ventas no responde (26.6a)

Está en el `alt` de la página 1, y es una decisión, no un detalle: si el batch a SAP falla o da
timeout, los pedidos salen con `stockStatus = UNKNOWN` — la fila no se pinta y el aviso de
"Continuar a Traslados" no los cuenta.

La alternativa sería fallar el listado entero. Sería peor: **el stock a confirmar es información
adicional, no un requisito para planificar.** Un pedido se sigue pudiendo despachar sin saber si
Ventas ya lo confirmó; lo que no se puede es dejar al planificador sin listado porque un servicio
externo se cayó.

---

## 5. Lo que hay que pedirle a Ventas

1. **Endpoint batch** `POST /sales/orders/items:batch` con `salesOrderIds[]`, que devuelva por pedido
   `[{ product_id, requested_qty, confirmed_qty }]`. Sin batch, el listado hace una llamada por
   pedido antes de pintar la primera fila.
2. **Endpoint de detalle** `GET /sales/orders/{salesOrderId}/items` para el panel.
3. **Descripción y unidad del producto**, en el payload o para poblar `product_snapshot` (§2.3).
4. **Qué es `sales_order_split_id`.** Aparece **una sola vez en todo el repo** (`DB.puml:27`), sin
   entidad `sales_order_split` definida y sin comentario. La hipótesis en la mesa es que el split es
   por empresa/sociedad, pero está indocumentada y **cambia el diagrama**: si Ventas parte el pedido
   cuando falta stock, lo que nos llegaría no son líneas cortas dentro de un pedido sino dos pedidos
   distintos, y el flujo 27 dejaría de tener sentido tal como está dibujado.

---

## 6. Referencias

- `diagrams/UltimaVersion.sql` — esquema relacional nuestro
- `diagrams/DB.puml` — ERD oficial, incluye las entidades externas de SAP
- `src/mockup/mock-data.ts` — `ItemPedido`, `itemsPorConfirmar()`, `tieneStockPorConfirmar()`
- `src/mockup/CanalPedidosDialog.tsx` — el panel de detalle (paso 27 del lado del front)
- `src/mockup/CoverageSummaryBar.tsx` — el aviso al continuar (consume el resumen del paso 26)
