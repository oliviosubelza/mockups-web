# Documentacion tecnica - Revision semaforo

> **v2.0.0 - 2026-08-14.** Actualizado contra el DDL completo compartido el 2026-08-14.

Esta documentacion acompana a `Secuencia.puml`. Si cambia el flujo o cambia el DDL, se deben actualizar ambas piezas.

## 1. Fuente de verdad

La fuente de verdad para este documento ya no es una propuesta parcial de tablas nuevas.  
La fuente de verdad es el **DDL completo** compartido el **2026-08-14**.

Eso cambia tres cosas importantes:

1. **Semaforo ya no tiene tablas propias** tipo `transport_order_semaphores`.
2. **No existe `truck_inventory_histories`** en el DDL vigente.
3. **Semaforo se modela como un tipo de sesion de conteo** dentro de:
   - `transport_order_count_sessions`
   - `transport_order_count_session_items`

En esta version:

- `ddl-semaforo-auditoria.sql` ya no es un DDL "propuesto";
- ahora es un **extracto del DDL real** necesario para explicar el flujo semaforo;
- y `Secuencia.puml` usa ese modelo como base.

## 2. Cambio clave respecto a la version anterior

La version anterior documentaba este modelo:

- `transport_order_semaphores` como cabecera de auditoria
- `transport_order_semaphore_items` como detalle
- `truck_inventory_histories` como historial tecnico opcional

Ese modelo **ya no coincide** con el DDL completo del 2026-08-14.

La version correcta es esta:

| Antes | Ahora |
|---|---|
| `transport_order_semaphores` | `transport_order_count_sessions` con `session_type = 'SUPERVISOR_SEMAPHORE'` |
| `transport_order_semaphore_items` | `transport_order_count_session_items` |
| `truck_inventory_histories` | No existe en el DDL vigente |
| Cabecera propia de semaforo | Cabecera generica de sesion de conteo |
| Detalle propio de semaforo | Detalle generico por item contado |

## 3. Entidades relevantes del flujo

| Tabla | Uso dentro de semaforo |
|---|---|
| `transport_orders` | Identidad de la OT auditada |
| `routes` | Contexto de chofer, ayudante y ruta |
| `transport_order_histories` | Trazabilidad gruesa de la OT; puede guardar un evento informativo de semaforo |
| `truck_inventories` | Inventario oficial vigente por producto sobre el camion |
| `transport_order_count_sessions` | Cabecera del conteo del chofer, de la revision de diferencias y del semaforo |
| `transport_order_count_session_items` | Foto congelada y resultado por producto para cada sesion |

Metadata adicional necesaria para la UI:

- `code`
- `description`
- `is_cold_chain`
- `equivalence_box_unit`

Eso puede venir de:

- un catalogo/snapshot de productos, o
- una proyeccion previa del backend.

## 4. Modelo funcional final

### 4.1 Cadena de conteo

El DDL vigente ya define tres tipos funcionales de sesion:

- `DRIVER_INITIAL`
- `SUPERVISOR_DISCREPANCY`
- `SUPERVISOR_SEMAPHORE`

Por tanto, semaforo **no es una entidad aparte**.  
Semaforo es la **tercera modalidad de conteo** sobre una misma OT.

### 4.2 Que queda oficial y que queda auditado

- `truck_inventories` guarda el inventario oficial vigente del camion.
- `transport_order_count_session_items` guarda lo contado en cada sesion.
- La sesion `SUPERVISOR_SEMAPHORE` **no reemplaza** el inventario oficial.

Reglas finales:

1. Semaforo **no bloquea la salida del camion**.
2. Semaforo **no cambia `transport_orders.status`**.
3. Semaforo **no actualiza `truck_inventories`**.
4. Semaforo deja una evidencia separada dentro de `transport_order_count_sessions` y `transport_order_count_session_items`.

### 4.3 Como se congela la foto de referencia

`transport_order_count_session_items.expected_qty` esta descrito en el DDL como:

> Foto congelada del valor oficial al iniciar la sesion.

**Inferencia de modelado:** como el DDL no trae una columna explicita tipo `baseline_source`, la recomendacion es sembrar `expected_qty` desde `truck_inventories.loaded_qty`, porque ese campo representa la cantidad fisica final validada en el camion.

Si el backend decide usar otra regla, debe documentarla explicitamente.  
Lo importante es que:

- `expected_qty` dentro de la sesion sea un snapshot,
- y no un valor recalculado cada vez que se consulta.

### 4.4 Rol del ejecutor

El DDL normaliza `executor_role` como:

- `DRIVER`
- `SUPERVISOR`

Por eso, aunque la UI hable de "auditor de semaforo", en persistencia la sesion debe guardarse con:

- `session_type = 'SUPERVISOR_SEMAPHORE'`
- `executor_role = 'SUPERVISOR'`

## 5. Elegibilidad para entrar a semaforo

El DDL no trae una columna explicita tipo `ready_for_semaphore`.

**Inferencia de negocio:** la elegibilidad debe resolverse combinando:

- la OT en `transport_orders`,
- el inventario oficial vigente en `truck_inventories`,
- y las ultimas sesiones en `transport_order_count_sessions`.

Una OT puede entrar a semaforo cuando:

1. existe al menos una sesion `DRIVER_INITIAL` en estado `COMPLETED`,
2. no existe una sesion activa `SUPERVISOR_SEMAPHORE` para la misma OT,
3. existe inventario oficial en `truck_inventories`,
4. y no queda una revision operativa abierta que impida considerar estable el inventario.

Sobre el punto 4:

- si hubo diferencias operativas, se espera una sesion `SUPERVISOR_DISCREPANCY` cerrada;
- si no hubo diferencias, esa sesion puede no existir.

Por eso la UI puede mostrar:

- `driverInitial.status = COMPLETED`
- `discrepancyReview.status = COMPLETED`
- o `discrepancyReview.status = NOT_REQUIRED`

`NOT_REQUIRED` **no es un valor persistido** en base de datos.  
Es solo una **proyeccion de API** cuando no hubo necesidad de una sesion `SUPERVISOR_DISCREPANCY`.

## 6. Flujos API y proyeccion al frontend

## 41. Obtener listado de OTs para auditoria semaforo

### Endpoint

```http
GET /supervisor/transport-orders?distributorId=1&search=&onlyColdChain=false
```

### Fuentes de datos

El backend arma este listado combinando:

- `transport_orders`
- `routes`
- `truck_inventories`
- `transport_order_count_sessions`
- metadata de producto

`transport_order_histories` puede usarse como apoyo para trazabilidad, pero **ya no es la fuente principal** para reconstruir la cadena de conteo.

### Regla de armado

Para cada OT, el backend debe proyectar:

- la ultima sesion `DRIVER_INITIAL`
- la ultima sesion `SUPERVISOR_DISCREPANCY`
- la ultima sesion `SUPERVISOR_SEMAPHORE`
- un resumen por estado de `truck_inventories`

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": [
    {
      "transportOrderId": 4892,
      "orderCode": "OT-4892",
      "driverName": "Cristhian Macchiavelli",
      "routeName": "Ruta Norte - Santa Cruz",
      "totalProducts": 5,
      "coldChainProductCount": 2,
      "inventorySummary": {
        "total": 5,
        "match": 3,
        "mismatch": 0,
        "approved": 2,
        "pending": 0
      },
      "countSessions": {
        "driverInitial": {
          "status": "COMPLETED",
          "executorRole": "DRIVER",
          "completedAt": "2026-08-14T13:10:00.000Z"
        },
        "discrepancyReview": {
          "status": "COMPLETED",
          "executorRole": "SUPERVISOR",
          "completedAt": "2026-08-14T14:20:00.000Z"
        },
        "semaphoreReview": {
          "status": "NOT_STARTED",
          "transportOrderCountSessionId": null
        }
      }
    }
  ]
}
```

### Diccionario de la response principal

#### Nivel raiz

| Campo | Tipo | Oblig. | Descripcion |
|---|---|---|---|
| `success` | boolean | Si | Resultado general de la operacion |
| `code` | number | Si | Codigo de respuesta de negocio/API |
| `data` | array | Si | Coleccion de OTs visibles en la cola de semaforo |

#### `data[]`

| Campo | Tipo | Oblig. | Descripcion |
|---|---|---|---|
| `transportOrderId` | number | Si | ID interno de la OT |
| `orderCode` | string | Si | Codigo visible de la OT |
| `driverName` | string | Si | Nombre del chofer asociado a la ruta |
| `routeName` | string | Si | Nombre de la ruta o zona operativa |
| `totalProducts` | number | Si | Cantidad total de productos incluidos en el inventario oficial de la OT |
| `coldChainProductCount` | number | Si | Cantidad de productos de cadena de frio dentro de la OT |
| `inventorySummary` | object | Si | Resumen agregado por estado del inventario oficial |
| `countSessions` | object | Si | Resumen proyectado de las sesiones de conteo relacionadas con la OT |

#### `data[].inventorySummary`

| Campo | Tipo | Oblig. | Descripcion |
|---|---|---|---|
| `total` | number | Si | Total de filas de `truck_inventories` consideradas para la OT |
| `match` | number | Si | Cantidad de items con estado `MATCH` |
| `mismatch` | number | Si | Cantidad de items con estado `MISMATCH` |
| `approved` | number | Si | Cantidad de items con estado `APPROVED` |
| `pending` | number | Si | Cantidad de items con estado `PENDING` |

#### `data[].countSessions`

| Campo | Tipo | Oblig. | Descripcion |
|---|---|---|---|
| `driverInitial` | object | Si | Estado proyectado de la ultima sesion `DRIVER_INITIAL` |
| `discrepancyReview` | object | Si | Estado proyectado de la ultima sesion `SUPERVISOR_DISCREPANCY` o un estado derivado `NOT_REQUIRED` |
| `semaphoreReview` | object | Si | Estado proyectado de la ultima sesion `SUPERVISOR_SEMAPHORE` o `NOT_STARTED` si aun no existe |

#### `data[].countSessions.driverInitial`

| Campo | Tipo | Oblig. | Descripcion |
|---|---|---|---|
| `status` | string | Si | Estado proyectado de la sesion del chofer; para esta cola se espera `COMPLETED` |
| `executorRole` | string | Si | Rol persistido del ejecutor; en este caso `DRIVER` |
| `completedAt` | string(datetime) | Si | Fecha y hora de cierre de la sesion del chofer en formato ISO-8601 |

#### `data[].countSessions.discrepancyReview`

| Campo | Tipo | Oblig. | Descripcion |
|---|---|---|---|
| `status` | string | Si | Estado proyectado de la revision de diferencias: `COMPLETED` o `NOT_REQUIRED` |
| `executorRole` | string | No | Rol del ejecutor cuando la sesion existe; normalmente `SUPERVISOR` |
| `completedAt` | string(datetime) | No | Fecha/hora de cierre cuando la sesion existe |

#### `data[].countSessions.semaphoreReview`

| Campo | Tipo | Oblig. | Descripcion |
|---|---|---|---|
| `status` | string | Si | Estado proyectado de semaforo: `NOT_STARTED`, `PENDING`, `IN_PROGRESS` o `COMPLETED` |
| `transportOrderCountSessionId` | number \| null | No | ID de la sesion `SUPERVISOR_SEMAPHORE`; `null` si aun no fue creada |
| `executorRole` | string | No | Rol del ejecutor cuando la sesion ya existe |
| `completedAt` | string(datetime) | No | Fecha/hora de cierre cuando la sesion ya termino |

Notas:

- `NOT_STARTED` es una proyeccion de API cuando no existe sesion `SUPERVISOR_SEMAPHORE`.
- `NOT_REQUIRED` es una proyeccion de API cuando no existe sesion `SUPERVISOR_DISCREPANCY`.

## 42. Iniciar una sesion de semaforo

### Endpoint

```http
POST /supervisor/transport-orders/{transportOrderId}/count-sessions/semaphore
```

### Request principal

```json
{
  "notes": "Auditoria sorpresa en patio de carga."
}
```

### Flujo interno

1. validar elegibilidad de la OT,
2. validar que no exista otra sesion activa `SUPERVISOR_SEMAPHORE`,
3. leer los `truck_inventories` vigentes de la OT,
4. crear una fila en `transport_order_count_sessions` con:
   - `session_type = 'SUPERVISOR_SEMAPHORE'`
   - `executor_role = 'SUPERVISOR'`
   - `status = 'PENDING'`
   - `started_at = NULL`
5. crear N filas en `transport_order_count_session_items`,
6. congelar en cada item:
   - `product_id`
   - `expected_qty`
   - `equivalence_box_unit`
7. opcionalmente insertar una traza informativa en `transport_order_histories`.

Sobre la traza opcional al iniciar:

- no debe cambiar el estado operativo de la OT,
- sirve solo como evidencia narrativa,
- y puede reutilizar la convencion `REV SEMAFORO` con una descripcion del tipo:
  - `Sesion de auditoria semaforo iniciada.`

### Response principal

```json
{
  "success": true,
  "code": 201,
  "data": {
    "transportOrderCountSessionId": 701,
    "transportOrderId": 4892,
    "sessionType": "SUPERVISOR_SEMAPHORE",
    "status": "PENDING"
  }
}
```

## 43. Obtener manifiesto ciego de la sesion

### Endpoint

```http
GET /supervisor/transport-order-count-sessions/{transportOrderCountSessionId}
```

### Regla principal

Mientras el item siga `PENDING`, el API **no debe** devolver `expectedQty` al frontend.  
La pantalla sigue siendo ciega hasta que el producto es registrado.

### Flujo interno

1. cargar cabecera de sesion,
2. cargar items de sesion,
3. cargar metadata de producto,
4. si la sesion estaba `PENDING`, pasarla a `IN_PROGRESS` y guardar `started_at`,
5. devolver la proyeccion ciega a la app.

Nota de consistencia:

- idealmente la sesion pasa a `IN_PROGRESS` al abrir esta vista;
- si por cualquier motivo la app registra primero un producto, el endpoint de conteo debe poder hacer la misma transicion como resguardo.

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "transportOrderCountSessionId": 701,
    "transportOrderId": 4892,
    "orderCode": "OT-4892",
    "sessionType": "SUPERVISOR_SEMAPHORE",
    "status": "IN_PROGRESS",
    "items": [
      {
        "transportOrderCountSessionItemId": 9801,
        "productId": 5,
        "code": "PROD-005",
        "description": "Salsa de Tomate Ketchup 5kg",
        "equivalenceBoxUnit": 12,
        "isColdChain": false,
        "itemStatus": "PENDING"
      },
      {
        "transportOrderCountSessionItemId": 9802,
        "productId": 2,
        "code": "PROD-002",
        "description": "Salsa Mayonesa Industrial 10kg",
        "equivalenceBoxUnit": 12,
        "isColdChain": true,
        "itemStatus": "MISMATCH",
        "countedBoxes": 12,
        "countedUnits": 2,
        "countedQty": 146,
        "expectedQty": 144,
        "varianceQty": 2,
        "observation": "Se conto nuevamente sobre pallet frio."
      }
    ]
  }
}
```

## 44. Registrar conteo de un producto

### Endpoint

```http
POST /supervisor/transport-order-count-sessions/{transportOrderCountSessionId}/items/{transportOrderCountSessionItemId}/count
```

### Request principal

```json
{
  "countedBoxes": 7,
  "countedUnits": 9,
  "observation": "Se abrio el pallet para validar unidades sueltas."
}
```

### Flujo interno

1. validar que la sesion sea `SUPERVISOR_SEMAPHORE`,
2. validar que la sesion este `PENDING` o `IN_PROGRESS`,
3. validar que el item pertenezca a la sesion,
4. calcular:

```text
countedQty  = countedBoxes * equivalence_box_unit + countedUnits
varianceQty = countedQty - expected_qty
itemStatus  = MATCH | MISMATCH
```

5. actualizar el item,
6. si la sesion aun estaba `PENDING`, pasarla a `IN_PROGRESS`.

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "transportOrderCountSessionItemId": 9801,
    "itemStatus": "MISMATCH",
    "countedBoxes": 7,
    "countedUnits": 9,
    "countedQty": 93,
    "expectedQty": 96,
    "varianceQty": -3
  }
}
```

## 45. Cerrar la sesion de semaforo

### Endpoint

```http
POST /supervisor/transport-order-count-sessions/{transportOrderCountSessionId}/close
```

### Reglas de negocio

1. cerrar es irreversible,
2. se puede cerrar dejando productos sin registrar,
3. los productos no registrados deben quedar `SKIPPED`,
4. cerrar semaforo **no actualiza** `truck_inventories`,
5. cerrar semaforo **no actualiza** `transport_orders.status`.

### Flujo interno

1. cargar todos los items de la sesion,
2. pasar `PENDING -> SKIPPED`,
3. marcar cabecera en `COMPLETED`,
4. guardar `completed_at`,
5. opcionalmente insertar una traza informativa en `transport_order_histories`.

Sobre la traza opcional:

- el DDL comenta estados de historia como `REV SEMAFORO`,
- pero no los cierra con un `CHECK`,
- por tanto ese catalogo debe considerarse una convencion de negocio externa al DDL,
- y si se usa en cierre, la descripcion debe diferenciarlo del evento de inicio, por ejemplo:
  - `Sesion de auditoria semaforo completada.`

### Response principal

```json
{
  "success": true,
  "code": 200,
  "data": {
    "transportOrderCountSessionId": 701,
    "status": "COMPLETED",
    "countedItems": 4,
    "skippedItems": 1,
    "matchItems": 2,
    "mismatchItems": 2,
    "completedAt": "2026-08-14T14:42:00.000Z"
  }
}
```

## 7. Impacto en la app mobile

Con el modelo actual ya se puede alimentar:

- el listado de OTs candidatas o ya auditadas,
- la vista de manifiesto ciego,
- el registro por producto,
- y el cierre de la auditoria.

La app del chofer no necesita un flujo distinto por semaforo.  
El conteo del chofer sigue siendo:

1. `DRIVER_INITIAL`,
2. `SUPERVISOR_DISCREPANCY` solo si hace falta,
3. `SUPERVISOR_SEMAPHORE` como auditoria posterior y separada.

## 8. Resumen final

La documentacion correcta para el DDL completo del **2026-08-14** queda asi:

- `truck_inventories` mantiene el valor oficial vigente por producto,
- `transport_order_count_sessions` modela la cabecera de cada conteo,
- `transport_order_count_session_items` modela el detalle congelado y el resultado por producto,
- semaforo es una sesion con `session_type = 'SUPERVISOR_SEMAPHORE'`,
- no existe `truck_inventory_histories`,
- y ya no corresponde documentar tablas propias de semaforo.

Esa es la base que debe usar cualquier mock, backend o diagrama posterior.
