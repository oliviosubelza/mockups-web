# Documentación técnica: agregado de restricciones de planificación

[Volver al índice de restricciones de planificación](./README.md)

> **Estado: CONTRATO PROPUESTO, no implementación existente.** Versión documental 1.0, revisada el 2026-08-26 contra [`../../db_script.sql`](../../db_script.sql). Este repositorio no contiene backend ni API para estos flujos.

Este documento define un contrato de API propuesto para administrar restricciones de planificación mediante el recurso genérico `/planning/restrictions`. El foco de los ejemplos es `RESTRICTED_AREA`, pero las operaciones por ID son deliberadamente genéricas para los tres tipos. La única fuente contractual del modelo persistente es [`../../db_script.sql`](../../db_script.sql).

## Diagramas de secuencia

| Flujo | PlantUML |
|---|---|
| Creación atómica | [`Restricciones-46-Crear.Secuencia.puml`](./diagramas/Restricciones-46-Crear.Secuencia.puml) |
| Listado y detalle | [`Restricciones-46-Consultar.Secuencia.puml`](./diagramas/Restricciones-46-Consultar.Secuencia.puml) |
| Actualización atómica | [`Restricciones-46-Actualizar.Secuencia.puml`](./diagramas/Restricciones-46-Actualizar.Secuencia.puml) |
| Activación, desactivación y eliminación lógica | [`Restricciones-46-Estado-Eliminar.Secuencia.puml`](./diagramas/Restricciones-46-Estado-Eliminar.Secuencia.puml) |
| Evaluación futura para un plan | [`Restricciones-47-Evaluar-Plan.Secuencia.puml`](./diagramas/Restricciones-47-Evaluar-Plan.Secuencia.puml) |

## 1. Resumen ejecutivo

1. `zones` modela zonas logísticas de reparto y queda expresamente fuera de este agregado.
2. El agregado de restricciones comprende `planning_restrictions`, `planning_restriction_schedules` y `planning_restriction_vehicle_rules`.
3. La API propuesta usa el recurso genérico `/planning/restrictions`, porque la cabecera admite `RESTRICTED_AREA`, `CLOSED_ROAD` y `PLATE_ROTATION` según los comentarios del DDL.
4. El listado y la creación del caso 46 instancian `RESTRICTED_AREA`; `GET`, `PUT`, `PATCH` y `DELETE` por ID pueden gestionar cualquier fila de `planning_restrictions` sin un filtro de tipo implícito.
5. `restrictionType` se fija al crear y es inmutable: un `PUT` que difiera del valor persistido responde `409 RESTRICTION_TYPE_IMMUTABLE`.
6. `schedules: []` significa vigencia permanente. `vehicleRules: []` significa aplicación a toda la flota de la distribuidora.
7. Los campos de una fila de horario o de regla vehicular se combinan con **Y**; las filas de cada colección se combinan con **O**.
8. Los endpoints, DTO, validaciones y envelopes aquí descritos son **semántica propuesta de aplicación**. No prueban la existencia de controladores, servicios ni lógica de ruteo.
9. El caso 47 es **FUTURO / NO IMPLEMENTADO** y solo devuelve candidatas temporales/vehiculares con evaluación espacial pendiente. Detectar intersecciones o evitar polígonos requiere otro contrato futuro.

## 2. Fuentes y estado

### 2.1 Autoridad contractual

| Fuente | Uso en este documento | Estado |
|---|---|---|
| `db_script.sql:38-50` | Modelo de `zones` para delimitar lo que no pertenece al agregado | DDL vigente |
| `db_script.sql:67-88` | Cabecera `planning_restrictions` | DDL vigente |
| `db_script.sql:104-120` | Horarios `planning_restriction_schedules` | DDL vigente |
| `db_script.sql:137-152` | Reglas `planning_restriction_vehicle_rules` | DDL vigente |
| `db_script.sql:154-177` | Datos vehiculares usados por las reglas | DDL vigente |
| `db_script.sql:191-233` | Planes, camiones planificados y referencia opcional a una restricción | DDL vigente |
| Backend/API | No existe en este repositorio | No implementado |

La declaración SQL es la autoridad sobre nombres, tipos, nulabilidad, claves y valores por defecto. Los comentarios del DDL aportan intención, pero no crean restricciones ejecutables por sí solos.

### 2.2 Etiquetas usadas

| Etiqueta | Significado |
|---|---|
| **Garantía actual de DB** | Propiedad exigida por un tipo, `NOT NULL`, `PRIMARY KEY`, `FOREIGN KEY` o `DEFAULT` declarado en el DDL |
| **Semántica propuesta de aplicación** | Comportamiento que una API futura debería validar o ejecutar, pero que el DDL no garantiza por sí mismo |
| **FUTURO / NO IMPLEMENTADO** | Capacidad que requiere componentes que no existen en el repositorio |

`restriction_type`, `effect` y `severity` son columnas `VARCHAR`. Sus valores aparecen solamente en comentarios del DDL: no existe `CHECK`, tipo `ENUM` ni tabla catálogo que los limite. Por tanto:

- la DB garantiza longitud, nulabilidad y, para `severity`, el valor por defecto `WARNING`;
- la aceptación de `RESTRICTED_AREA`, `CLOSED_ROAD`, `PLATE_ROTATION`, `NO_TRANSIT`, `NO_DELIVERY`, `NO_VEHICLE`, `BLOCKING` y `WARNING` es semántica propuesta de aplicación;
- insertar otros textos compatibles con el tamaño de la columna sigue siendo posible directamente en la DB actual.

## 3. Separación entre `zones` y restricciones

| Aspecto | `zones` | Agregado de restricciones |
|---|---|---|
| Propósito | Particionar el territorio en zonas logísticas de reparto | Representar recortes o condiciones que limitan la planificación |
| Cabecera | `zones` | `planning_restrictions` |
| Geometría | `polygon GEOMETRY(Polygon, 4326) NOT NULL` | `geometry_geojson JSONB`, nullable |
| Scope persistido | `city_id` | `distributor_id` |
| Tipos funcionales | No tiene `restriction_type` | Área restringida, vía cerrada o rotación de placa según semántica propuesta |
| Horarios | No pertenecen al modelo mostrado | `planning_restriction_schedules` |
| Reglas vehiculares | No pertenecen al modelo mostrado | `planning_restriction_vehicle_rules` |
| Participación en este agregado | **Excluida** | **Incluida** |

Una zona restringida puede superponerse con zonas de reparto y con otras restricciones. No debe persistirse en `zones`, ni reutilizar `zones.id`, `zones.city_id` o `zones.polygon` como si fueran campos del agregado.

### 3.1 Alcance incluido

- Contrato propuesto para listar, consultar, crear, reemplazar, activar, desactivar y eliminar lógicamente restricciones, con ejemplos centrados en zonas restringidas.
- Representación completa de la cabecera, los horarios y las reglas vehiculares.
- Mapeo camelCase de API a snake_case de DB.
- Validaciones y límites transaccionales propuestos.
- Evaluación futura de restricciones candidatas para un plan.

### 3.2 Alcance excluido

- CRUD de zonas logísticas de reparto en `zones`.
- Implementación de backend, controladores, autenticación o autorización.
- Intersección entre rutas, puntos o polígonos.
- Construcción o recálculo de rutas que eviten una restricción.
- Escritura automática de `planning_trucks.excluded_by_restriction_id`.
- Compatibilidad contractual con proyecciones de interfaz no persistidas.
- Cambios al DDL.

## 4. Modelo lógico del agregado

```text
distributors (1)
    |
    +-- (N) planning_restrictions (cabecera del agregado)
              |
              +-- (N) planning_restriction_schedules (cuándo aplica)
              |
              +-- (N) planning_restriction_vehicle_rules (a quién aplica)

planning_trucks (N) -- (0..1) planning_restrictions
    Referencia externa al agregado mediante excluded_by_restriction_id.
```

| Relación | FK actual | Cardinalidad funcional | Observación |
|---|---|---|---|
| Distribuidora a restricción | `planning_restrictions.distributor_id -> distributors.id` | 1:N | La distribuidora administra la restricción |
| Restricción a horarios | `planning_restriction_schedules.planning_restriction_id -> planning_restrictions.id` | 1:N | Cero filas significa permanente |
| Restricción a reglas vehiculares | `planning_restriction_vehicle_rules.planning_restriction_id -> planning_restrictions.id` | 1:N | Cero filas significa toda la flota |
| Camión planificado a restricción | `planning_trucks.excluded_by_restriction_id -> planning_restrictions.id` | N:0..1 | Es una referencia externa; no demuestra lógica backend |

Ninguna de estas FK declara `ON DELETE CASCADE`. La aplicación no debe asumir cascada física ni lógica de la DB.

## 5. Contrato canónico propuesto

### 5.1 Recurso y envelopes

Recurso genérico:

```text
/planning/restrictions
```

Envelope de éxito solicitado:

```json
{
  "success": true,
  "code": 200,
  "data": {}
}
```

Envelope de error propuesto:

```json
{
  "success": false,
  "code": 422,
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "La solicitud contiene valores no válidos.",
    "details": [
      {
        "field": "schedules[0].dayOfWeek",
        "code": "OUT_OF_RANGE",
        "message": "dayOfWeek debe estar entre 0 y 6."
      }
    ],
    "traceId": "req-7f24a9"
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `success` | `boolean` | `true` en éxito y `false` en error |
| `code` | `number` | Código HTTP repetido en el cuerpo |
| `data` | `object \| array` | Resultado de una respuesta exitosa |
| `error.type` | `string` | Código estable de categoría de error |
| `error.message` | `string` | Mensaje legible |
| `error.details` | `array` | Errores específicos; puede ser `[]` |
| `error.details[].field` | `string \| null` | Ruta camelCase del campo relacionado |
| `error.details[].code` | `string` | Código estable del detalle |
| `error.details[].message` | `string` | Explicación del detalle |
| `error.traceId` | `string` | Identificador de correlación generado por la API propuesta |

### 5.2 Diccionario de `restriction`

Los arreglos `schedules` y `vehicleRules` forman parte del agregado y siempre aparecen en una respuesta de detalle. En `POST` y `PUT` deben enviarse, incluso cuando estén vacíos.

| Campo API | Tipo | Request | Response | Regla propuesta |
|---|---|---|---|---|
| `id` | `number` | No | Sí | BIGINT de la cabecera |
| `distributorId` | `number` | Sí | Sí | Debe identificar una fila existente de `distributors` |
| `name` | `string` | Sí | Sí | 1 a 50 caracteres |
| `description` | `string \| null` | Sí | Sí | Máximo 100 caracteres |
| `restrictionType` | `string` | Sí | Sí | Se fija en `POST`; en `PUT` debe ser idéntico al valor persistido |
| `effect` | `string` | Sí | Sí | Semántica propuesta basada en los valores comentados en el DDL |
| `severity` | `string` | Sí | Sí | Semántica propuesta: `BLOCKING` o `WARNING` |
| `geometryGeoJson` | `object \| null` | Sí | Sí | Para `RESTRICTED_AREA`, debe ser un GeoJSON `Polygon` válido |
| `isActive` | `boolean` | Sí en `PUT`; opcional en `POST` | Sí | En `POST`, omitirlo aplica el valor propuesto `true`, coherente con el `DEFAULT` de DB |
| `schedules` | `schedule[]` | Sí | Sí | `[]` significa vigencia permanente |
| `vehicleRules` | `vehicleRule[]` | Sí | Sí | `[]` significa aplicación a toda la flota |
| `createdBy` | `string \| null` | No | Sí | Controlado por servidor; máximo DB 255 |
| `updatedBy` | `string \| null` | No | Sí | Controlado por servidor; máximo DB 255 |
| `createdAt` | `string \| null` | No | Sí | Fecha y hora ISO 8601 proyectada desde DB |
| `updatedAt` | `string \| null` | No | Sí | Fecha y hora ISO 8601 proyectada desde DB |
| `deletedAt` | `string \| null` | No | Sí | `null` mientras la cabecera no esté eliminada lógicamente |

Los timestamps de auditoría terminados en `Z` en los ejemplos son ilustrativos. Como el DDL usa `TIMESTAMP` sin zona horaria, la conversión exacta debe resolverse con la decisión pendiente de zona de negocio.

Para la instancia `RESTRICTED_AREA` usada en los ejemplos, `geometryGeoJson` tiene esta forma:

| Campo | Tipo | Regla propuesta |
|---|---|---|
| `type` | `string` | Valor fijo `Polygon` |
| `coordinates` | `number[][][]` | Coordenadas GeoJSON en orden `[longitud, latitud]`; cada anillo debe estar cerrado |

El recurso genérico admite `LineString` para `CLOSED_ROAD` y `null` para `PLATE_ROTATION` según la semántica propuesta; los payloads de ejemplo y las validaciones detalladas de esos tipos quedan fuera de este caso centrado en `RESTRICTED_AREA`.

### 5.3 Diccionario de `schedule`

Cada elemento del API representa **exactamente una fila** de `planning_restriction_schedules`. No existe `daysOfWeek` ni expansión implícita de arreglos.

| Campo API | Tipo | Request `POST` | Request `PUT` | Response | Regla propuesta |
|---|---|---|---|---|---|
| `id` | `number` | Omitido | Opcional | Sí | En `PUT`, presente para conservar/actualizar una fila existente; omitido para crear una nueva |
| `validFrom` | `string \| null` | Sí | Sí | Sí | Fecha `YYYY-MM-DD`, primer día inclusivo; `null` sin inicio |
| `validTo` | `string \| null` | Sí | Sí | Sí | Fecha `YYYY-MM-DD`, último día inclusivo; `null` sin fin |
| `dayOfWeek` | `number \| null` | Sí | Sí | Sí | `0=domingo` hasta `6=sábado`; `null` significa todos los días |
| `startTime` | `string \| null` | Sí | Sí | Sí | Hora `HH:mm:ss`; `null` significa desde `00:00:00` |
| `endTime` | `string \| null` | Sí | Sí | Sí | Hora `HH:mm:ss`; límite exclusivo; `null` significa hasta `24:00:00` conceptualmente |

Las columnas de auditoría de cada fila hija son controladas por el servidor y no se exponen en este DTO propuesto.

Una fila con sus cinco campos funcionales en `null` no es un horario válido para la API: responde `422 EMPTY_SCHEDULE`. La DB sí permite esa combinación; `schedules: []` es la única permanencia canónica del contrato.

### 5.4 Diccionario de `vehicleRule`

| Campo API | Tipo | Request `POST` | Request `PUT` | Response | Regla propuesta |
|---|---|---|---|---|---|
| `id` | `number` | Omitido | Opcional | Sí | En `PUT`, presente para conservar/actualizar una fila existente; omitido para crear una nueva |
| `plateLastDigit` | `number \| null` | Sí | Sí | Sí | Dígito `0..9`: último dígito del primer bloque numérico de `trucks.plate` |
| `minCapacityWeightKg` | `number \| null` | Sí | Sí | Sí | JSON `number` no negativo; coincide si `trucks.capacity_weight_kg >= minCapacityWeightKg` |
| `truckType` | `string \| null` | Sí | Sí | Sí | Máximo 50 caracteres; comparación con `trucks.truck_type` |
| `plate` | `string \| null` | Sí | Sí | Sí | Máximo 20 caracteres; comparación normalizada con `trucks.plate` |

`minCapacityWeightKg` se serializa contractualmente como JSON `number`, no como string. El backend debe conservar la precisión decimal al leer, comparar y persistir `DECIMAL(12,2)`, evitando conversiones intermedias que introduzcan pérdida de precisión.

Las dos reglas siguientes significan: **(placa terminada en 3 Y capacidad mínima de 3500 kg) O (tipo FURGON Y placa exacta 4822-XKD)**.

```json
[
  {
    "id": 1801,
    "plateLastDigit": 3,
    "minCapacityWeightKg": 3500.0,
    "truckType": null,
    "plate": null
  },
  {
    "id": 1802,
    "plateLastDigit": null,
    "minCapacityWeightKg": null,
    "truckType": "FURGON",
    "plate": "4822-XKD"
  }
]
```

### 5.5 Mapeo exacto API a DB

#### Cabecera `planning_restrictions`

| API camelCase | DB snake_case | Tipo DB | Garantía actual de DB |
|---|---|---|---|
| `id` | `planning_restrictions.id` | `BIGSERIAL` | PK |
| `distributorId` | `planning_restrictions.distributor_id` | `BIGINT` | `NOT NULL`, FK a `distributors(id)` |
| `name` | `planning_restrictions.name` | `VARCHAR(50)` | `NOT NULL` |
| `description` | `planning_restrictions.description` | `VARCHAR(100)` | Nullable |
| `restrictionType` | `planning_restrictions.restriction_type` | `VARCHAR(30)` | `NOT NULL`; sin `CHECK`/`ENUM` |
| `effect` | `planning_restrictions.effect` | `VARCHAR(30)` | `NOT NULL`; sin `CHECK`/`ENUM` |
| `severity` | `planning_restrictions.severity` | `VARCHAR(20)` | `NOT NULL`, `DEFAULT 'WARNING'`; sin `CHECK`/`ENUM` |
| `geometryGeoJson` | `planning_restrictions.geometry_geojson` | `JSONB` | Nullable; sin validación geométrica |
| `isActive` | `planning_restrictions.is_active` | `BOOLEAN` | `NOT NULL`, `DEFAULT TRUE` |
| `createdBy` | `planning_restrictions.created_by` | `VARCHAR(255)` | Nullable |
| `updatedBy` | `planning_restrictions.updated_by` | `VARCHAR(255)` | Nullable |
| `createdAt` | `planning_restrictions.created_at` | `TIMESTAMP` | Nullable en DDL, `DEFAULT CURRENT_TIMESTAMP` |
| `updatedAt` | `planning_restrictions.updated_at` | `TIMESTAMP` | Nullable en DDL, `DEFAULT CURRENT_TIMESTAMP` |
| `deletedAt` | `planning_restrictions.deleted_at` | `TIMESTAMP` | Nullable |

#### Horarios `planning_restriction_schedules`

| API camelCase | DB snake_case | Tipo DB | Garantía actual de DB |
|---|---|---|---|
| `id` | `planning_restriction_schedules.id` | `BIGSERIAL` | PK |
| `planningRestrictionId` (interno; padre implícito) | `planning_restriction_schedules.planning_restriction_id` | `BIGINT` | `NOT NULL`, FK a `planning_restrictions(id)` |
| `validFrom` | `planning_restriction_schedules.valid_from` | `DATE` | Nullable |
| `validTo` | `planning_restriction_schedules.valid_to` | `DATE` | Nullable |
| `dayOfWeek` | `planning_restriction_schedules.day_of_week` | `SMALLINT` | Nullable; sin `CHECK 0..6` |
| `startTime` | `planning_restriction_schedules.start_time` | `TIME` | Nullable |
| `endTime` | `planning_restriction_schedules.end_time` | `TIME` | Nullable |
| `createdBy` (interno; no expuesto) | `planning_restriction_schedules.created_by` | `VARCHAR(255)` | Nullable |
| `updatedBy` (interno; no expuesto) | `planning_restriction_schedules.updated_by` | `VARCHAR(255)` | Nullable |
| `createdAt` (interno; no expuesto) | `planning_restriction_schedules.created_at` | `TIMESTAMP` | Nullable en DDL, `DEFAULT CURRENT_TIMESTAMP` |
| `updatedAt` (interno; no expuesto) | `planning_restriction_schedules.updated_at` | `TIMESTAMP` | Nullable en DDL, `DEFAULT CURRENT_TIMESTAMP` |
| `deletedAt` (interno; no expuesto) | `planning_restriction_schedules.deleted_at` | `TIMESTAMP` | Nullable |

#### Reglas `planning_restriction_vehicle_rules`

| API camelCase | DB snake_case | Tipo DB | Garantía actual de DB |
|---|---|---|---|
| `id` | `planning_restriction_vehicle_rules.id` | `BIGSERIAL` | PK |
| `planningRestrictionId` (interno; padre implícito) | `planning_restriction_vehicle_rules.planning_restriction_id` | `BIGINT` | `NOT NULL`, FK a `planning_restrictions(id)` |
| `plateLastDigit` | `planning_restriction_vehicle_rules.plate_last_digit` | `SMALLINT` | Nullable; sin `CHECK 0..9` |
| `minCapacityWeightKg` | `planning_restriction_vehicle_rules.min_capacity_weight_kg` | `DECIMAL(12,2)` | Nullable; sin `CHECK >= 0` |
| `truckType` | `planning_restriction_vehicle_rules.truck_type` | `VARCHAR(50)` | Nullable |
| `plate` | `planning_restriction_vehicle_rules.plate` | `VARCHAR(20)` | Nullable |
| `createdBy` (interno; no expuesto) | `planning_restriction_vehicle_rules.created_by` | `VARCHAR(255)` | Nullable |
| `updatedBy` (interno; no expuesto) | `planning_restriction_vehicle_rules.updated_by` | `VARCHAR(255)` | Nullable |
| `createdAt` (interno; no expuesto) | `planning_restriction_vehicle_rules.created_at` | `TIMESTAMP` | Nullable en DDL, `DEFAULT CURRENT_TIMESTAMP` |
| `updatedAt` (interno; no expuesto) | `planning_restriction_vehicle_rules.updated_at` | `TIMESTAMP` | Nullable en DDL, `DEFAULT CURRENT_TIMESTAMP` |
| `deletedAt` (interno; no expuesto) | `planning_restriction_vehicle_rules.deleted_at` | `TIMESTAMP` | Nullable |

## 6. Reglas y validaciones propuestas de aplicación

### 6.1 Tipo, efecto y severidad

- El recurso es genérico para `RESTRICTED_AREA`, `CLOSED_ROAD` y `PLATE_ROTATION` según la semántica propuesta; la DB no limita esos valores.
- El listado y el `POST` ejemplificados en el caso 46 usan `RESTRICTED_AREA`. Otros tipos requieren sus validaciones geométricas específicas, pero conservan las mismas rutas genéricas.
- `restrictionType` se fija en la creación. En `PUT`, la aplicación compara el valor recibido con `planning_restrictions.restriction_type`; si cambia, revierte y responde `409 RESTRICTION_TYPE_IMMUTABLE`.
- La inmutabilidad es garantía propuesta de aplicación, no garantía actual de DB: un `UPDATE` SQL directo todavía puede cambiar `restriction_type`.
- Las operaciones por `restrictionId` consultan la cabecera por `id` y borrado lógico, sin agregar un filtro implícito por `restriction_type`.
- La aplicación debería limitar `restrictionType`, `effect` y `severity` a catálogos acordados. Esa limitación no existe en DB.
- `geometryGeoJson.type` debe ser `Polygon` cuando `restrictionType = RESTRICTED_AREA`.
- El anillo exterior debe tener al menos cuatro posiciones, repetir la primera posición al final y no auto-intersectarse.
- Cada longitud debe estar entre `-180` y `180`; cada latitud, entre `-90` y `90`.

### 6.2 Horarios

1. `schedules: []` es la única representación canónica de una restricción permanente.
2. Una fila con `validFrom`, `validTo`, `dayOfWeek`, `startTime` y `endTime` todos en `null` se rechaza con `422 EMPTY_SCHEDULE`. El DDL permite actualmente esa fila porque todas esas columnas son nullable.
3. Una fila combina con **Y** sus fechas, día y horas no nulos.
4. Varias filas se combinan con **O**: basta que una fila esté vigente.
5. `validFrom` y `validTo` son inclusivos; si ambos existen, `validFrom <= validTo`.
6. `dayOfWeek` usa `0=domingo` hasta `6=sábado`; `null` no restringe el día.
7. `startTime` es inclusivo y `endTime` es exclusivo.
8. `startTime = null` equivale a `00:00:00`; `endTime = null` equivale conceptualmente a `24:00:00`.
9. Si `startTime > endTime`, la franja cruza medianoche. `dayOfWeek` y las fechas corresponden al día en que empieza la franja.
10. La aplicación propuesta rechaza `startTime = endTime`; para un día completo deben usarse ambos valores `null` junto con al menos una fecha o un día, o bien `schedules: []` para permanencia total.
11. Las filas hijas con `deleted_at IS NOT NULL` no participan en la evaluación.

Ejemplo: una fila con lunes (`dayOfWeek = 1`), `22:00:00` a `06:00:00`, aplica desde el lunes a las 22:00:00 hasta el martes a las 05:59:59.999..., pero no a las 06:00:00.

### 6.3 Reglas vehiculares

1. `vehicleRules: []` significa que la restricción aplica a toda la flota de la distribuidora.
2. Los campos no nulos dentro de una fila se combinan con **Y**.
3. Las filas se combinan con **O**.
4. Para `plateLastDigit`, se extrae el **primer bloque numérico** de `trucks.plate` y se toma su último dígito. Si no existe un bloque numérico, la regla no coincide y la aplicación registra `INVALID_TRUCK_PLATE_FORMAT` como dato inválido, sin corregir ni modificar el camión desde esta evaluación.
5. `minCapacityWeightKg` coincide exactamente cuando `trucks.capacity_weight_kg >= minCapacityWeightKg`.
6. Para comparar `plate`, la aplicación normaliza ambos valores quitando espacios exteriores, convirtiendo a mayúsculas y conservando separadores internos. Por ejemplo, `" 4822-Xkd "` se normaliza a `"4822-XKD"`; no se elimina el guion.
7. `truckType` se compara con `trucks.truck_type`.
8. La aplicación propuesta rechaza una fila con sus cuatro criterios en `null`; la representación canónica de toda la flota es `vehicleRules: []`.
9. Las filas hijas con `deleted_at IS NOT NULL` no participan en la evaluación.

### 6.4 Estado y borrado lógico

- `isActive = false` conserva el agregado, pero impide que la restricción sea aplicable.
- `deletedAt != null` retira lógicamente la cabecera del catálogo normal.
- Las consultas propuestas excluyen por defecto cabeceras con `deleted_at IS NOT NULL`.
- No se propone un parámetro público `includeDeleted` en este contrato.

### 6.5 IDs hijos en `PUT`

- Un hijo con `id` numérico se actualiza si pertenece a la restricción de la ruta y no está eliminado.
- Un hijo sin `id` se inserta como una nueva fila.
- Un hijo activo existente que no aparece en el arreglo del `PUT` se retira lógicamente con `deleted_at`.
- Un `id` perteneciente a otra restricción o ya eliminado produce `409 CHILD_RESOURCE_CONFLICT` y revierte toda la operación.
- No hay restauración implícita de hijos eliminados.

## 7. Transacciones propuestas

| Operación | Límite atómico propuesto |
|---|---|
| Crear | Insertar cabecera, horarios y reglas, releer el agregado canónico y ejecutar `COMMIT` en una transacción; cualquier fallo ejecuta `ROLLBACK` |
| Reemplazar con `PUT` | Bloquear y validar cabecera/IDs hijos, comprobar tipo inmutable, reemplazar el agregado, releerlo canónicamente y ejecutar `COMMIT` en una transacción |
| Cambiar estado | Actualizar una cabecera y su auditoría como una única operación; puede ejecutarse en transacción explícita |
| Eliminar lógicamente | Actualizar lógicamente las dos colecciones hijas y la cabecera en una transacción |
| Consultar | Lectura sin escritura; debe filtrar borrado lógico en cabecera e hijos |

La eliminación propuesta no depende de cascadas. La aplicación debe emitir actualizaciones explícitas sobre las tres tablas y confirmar solamente si todas resultan exitosas.

# 46. Administrar restricciones (ejemplo: zona restringida)

Todos los endpoints de esta sección son **CONTRATO PROPUESTO**. El recurso `/planning/restrictions` es genérico para los tres tipos comentados en el DDL.

- El listado y la creación ejemplificados aquí usan `restrictionType = RESTRICTED_AREA` para mantener el foco en zonas restringidas.
- `GET /{restrictionId}`, `PUT /{restrictionId}`, `PATCH /{restrictionId}/status` y `DELETE /{restrictionId}` son deliberadamente genéricos: pueden gestionar cualquier `planning_restriction` y no aplican un filtro oculto por tipo.
- `restrictionType` no puede cambiar después de la creación. `PUT` debe repetir el valor persistido o responder `409 RESTRICTION_TYPE_IMMUTABLE`.

## 46.1 Listar restricciones (ejemplo: zonas restringidas)

**Objetivo:** obtener una página de cabeceras no eliminadas de una distribuidora, sin inventar campos de presentación no persistidos.

**Endpoint propuesto:**

```http
GET /planning/restrictions?distributorId=17&restrictionType=RESTRICTED_AREA&effect=NO_TRANSIT&severity=BLOCKING&isActive=true&search=Centro&page=1&pageSize=20
```

### Parámetros

| Parámetro | Ubicación | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|---|
| `distributorId` | Query | `number` | Sí | Filtro exacto por `distributor_id` |
| `restrictionType` | Query | `string` | Sí | El ejemplo usa `RESTRICTED_AREA`; el recurso genérico admite los otros tipos válidos |
| `effect` | Query | `string` | No | Filtro exacto por `effect` |
| `severity` | Query | `string` | No | Filtro exacto por `severity` |
| `isActive` | Query | `boolean` | No | Filtro exacto por `is_active`; omitido devuelve ambos estados |
| `search` | Query | `string` | No | Búsqueda propuesta sobre `name` y `description`, ambos persistidos |
| `page` | Query | `number` | No | Entero desde 1; valor propuesto por defecto: 1 |
| `pageSize` | Query | `number` | No | Entero de 1 a 100; valor propuesto por defecto: 20 |

Siempre se aplica `planning_restrictions.deleted_at IS NULL`. No se admiten `cityId` ni `scheduleSummary`.

### Response completa

```json
{
  "success": true,
  "code": 200,
  "data": {
    "items": [
      {
        "id": 901,
        "distributorId": 17,
        "name": "Centro histórico - obras nocturnas",
        "description": "Restricción municipal durante la renovación de calzada.",
        "restrictionType": "RESTRICTED_AREA",
        "effect": "NO_TRANSIT",
        "severity": "BLOCKING",
        "isActive": true,
        "createdAt": "2026-08-26T18:10:00Z",
        "updatedAt": "2026-08-26T18:10:00Z"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### Reglas y errores relevantes

- Orden estable propuesto: `name ASC, id ASC`.
- `400` si un query param no puede interpretarse según su tipo.
- `422` si `restrictionType` no pertenece al catálogo genérico propuesto, si la paginación queda fuera de rango o si otro filtro no es válido.
- Una página sin resultados responde `200` con `items: []`.

Diagrama: [listado y detalle](./diagramas/Restricciones-46-Consultar.Secuencia.puml).

## 46.2 Consultar una restricción (ejemplo: zona restringida)

**Objetivo:** recuperar la cabecera y las dos colecciones activas del agregado.

**Endpoint propuesto:**

```http
GET /planning/restrictions/901
```

### Parámetros

| Parámetro | Ubicación | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|---|
| `restrictionId` | Path | `number` | Sí | BIGINT positivo |

La búsqueda por ID no filtra `restriction_type`. El JSON completo siguiente instancia una cabecera `RESTRICTED_AREA`; una fila de otro tipo conserva el mismo envelope y aplica su representación geométrica correspondiente.

### Response completa

```json
{
  "success": true,
  "code": 200,
  "data": {
    "id": 901,
    "distributorId": 17,
    "name": "Centro histórico - obras nocturnas",
    "description": "Restricción municipal durante la renovación de calzada.",
    "restrictionType": "RESTRICTED_AREA",
    "effect": "NO_TRANSIT",
    "severity": "BLOCKING",
    "geometryGeoJson": {
      "type": "Polygon",
      "coordinates": [
        [
          [-63.1862, -17.7814],
          [-63.1808, -17.7814],
          [-63.1808, -17.7867],
          [-63.1862, -17.7867],
          [-63.1862, -17.7814]
        ]
      ]
    },
    "isActive": true,
    "schedules": [
      {
        "id": 1401,
        "validFrom": "2026-09-01",
        "validTo": "2026-10-31",
        "dayOfWeek": 1,
        "startTime": "22:00:00",
        "endTime": "06:00:00"
      },
      {
        "id": 1402,
        "validFrom": "2026-09-01",
        "validTo": "2026-10-31",
        "dayOfWeek": 3,
        "startTime": "22:00:00",
        "endTime": "06:00:00"
      }
    ],
    "vehicleRules": [
      {
        "id": 1801,
        "plateLastDigit": 3,
        "minCapacityWeightKg": 3500.0,
        "truckType": null,
        "plate": null
      },
      {
        "id": 1802,
        "plateLastDigit": null,
        "minCapacityWeightKg": null,
        "truckType": "FURGON",
        "plate": "4822-XKD"
      }
    ],
    "createdBy": "j.perez",
    "updatedBy": "j.perez",
    "createdAt": "2026-08-26T18:10:00Z",
    "updatedAt": "2026-08-26T18:10:00Z",
    "deletedAt": null
  }
}
```

### Reglas y errores relevantes

- Solo se proyectan hijos con `deleted_at IS NULL`.
- `400` si `restrictionId` no es un BIGINT positivo.
- `404` si la cabecera no existe o tiene `deleted_at IS NOT NULL`.

Diagrama: [listado y detalle](./diagramas/Restricciones-46-Consultar.Secuencia.puml).

## 46.3 Crear una restricción (ejemplo: zona restringida)

**Objetivo:** crear las tres partes del agregado de manera atómica.

**Endpoint propuesto:**

```http
POST /planning/restrictions
Content-Type: application/json
```

### Parámetros

| Parámetro | Ubicación | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|---|
| `Content-Type` | Header | `string` | Sí | `application/json` |

### Payload

| Campo | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|
| `distributorId` | `number` | Sí | Distribuidora existente |
| `name` | `string` | Sí | 1 a 50 caracteres |
| `description` | `string \| null` | Sí | Máximo 100 caracteres |
| `restrictionType` | `string` | Sí | Valor fijo `RESTRICTED_AREA` |
| `effect` | `string` | Sí | Valor permitido por el catálogo propuesto |
| `severity` | `string` | Sí | `BLOCKING` o `WARNING` según semántica propuesta |
| `geometryGeoJson` | `object` | Sí | GeoJSON `Polygon` válido |
| `isActive` | `boolean` | No | Por defecto `true` |
| `schedules` | `schedule[]` | Sí | Sin IDs; `[]` significa permanente |
| `vehicleRules` | `vehicleRule[]` | Sí | Sin IDs; `[]` significa toda la flota |

```json
{
  "distributorId": 17,
  "name": "Centro histórico - obras nocturnas",
  "description": "Restricción municipal durante la renovación de calzada.",
  "restrictionType": "RESTRICTED_AREA",
  "effect": "NO_TRANSIT",
  "severity": "BLOCKING",
  "geometryGeoJson": {
    "type": "Polygon",
    "coordinates": [
      [
        [-63.1862, -17.7814],
        [-63.1808, -17.7814],
        [-63.1808, -17.7867],
        [-63.1862, -17.7867],
        [-63.1862, -17.7814]
      ]
    ]
  },
  "isActive": true,
  "schedules": [
    {
      "validFrom": "2026-09-01",
      "validTo": "2026-10-31",
      "dayOfWeek": 1,
      "startTime": "22:00:00",
      "endTime": "06:00:00"
    },
    {
      "validFrom": "2026-09-01",
      "validTo": "2026-10-31",
      "dayOfWeek": 3,
      "startTime": "22:00:00",
      "endTime": "06:00:00"
    }
  ],
  "vehicleRules": [
    {
      "plateLastDigit": 3,
      "minCapacityWeightKg": 3500.0,
      "truckType": null,
      "plate": null
    },
    {
      "plateLastDigit": null,
      "minCapacityWeightKg": null,
      "truckType": "FURGON",
      "plate": "4822-XKD"
    }
  ]
}
```

### Response completa

```json
{
  "success": true,
  "code": 201,
  "data": {
    "id": 901,
    "distributorId": 17,
    "name": "Centro histórico - obras nocturnas",
    "description": "Restricción municipal durante la renovación de calzada.",
    "restrictionType": "RESTRICTED_AREA",
    "effect": "NO_TRANSIT",
    "severity": "BLOCKING",
    "geometryGeoJson": {
      "type": "Polygon",
      "coordinates": [
        [
          [-63.1862, -17.7814],
          [-63.1808, -17.7814],
          [-63.1808, -17.7867],
          [-63.1862, -17.7867],
          [-63.1862, -17.7814]
        ]
      ]
    },
    "isActive": true,
    "schedules": [
      {
        "id": 1401,
        "validFrom": "2026-09-01",
        "validTo": "2026-10-31",
        "dayOfWeek": 1,
        "startTime": "22:00:00",
        "endTime": "06:00:00"
      },
      {
        "id": 1402,
        "validFrom": "2026-09-01",
        "validTo": "2026-10-31",
        "dayOfWeek": 3,
        "startTime": "22:00:00",
        "endTime": "06:00:00"
      }
    ],
    "vehicleRules": [
      {
        "id": 1801,
        "plateLastDigit": 3,
        "minCapacityWeightKg": 3500.0,
        "truckType": null,
        "plate": null
      },
      {
        "id": 1802,
        "plateLastDigit": null,
        "minCapacityWeightKg": null,
        "truckType": "FURGON",
        "plate": "4822-XKD"
      }
    ],
    "createdBy": "j.perez",
    "updatedBy": "j.perez",
    "createdAt": "2026-08-26T18:10:00Z",
    "updatedAt": "2026-08-26T18:10:00Z",
    "deletedAt": null
  }
}
```

### Reglas y errores relevantes

- La validación de forma y semántica ocurre antes de abrir la transacción; la existencia de la distribuidora se comprueba dentro de ella.
- La cabecera se inserta primero para obtener su BIGINT; ese ID se usa en ambas tablas hijas.
- La relectura del agregado canónico ocurre dentro de la misma transacción y antes del `COMMIT`.
- Cualquier fallo inesperado de escritura o relectura ejecuta `ROLLBACK` y responde únicamente `500 INTERNAL_ERROR`; no se devuelve éxito parcial.
- `400` para JSON mal formado o `Content-Type` incompatible.
- `404` si la distribuidora referida no existe.
- `422` para valores, longitudes, geometría, fechas, horas o reglas no válidas, incluido `EMPTY_SCHEDULE`.

Diagrama: [creación atómica](./diagramas/Restricciones-46-Crear.Secuencia.puml).

## 46.4 Actualizar una restricción (ejemplo: zona restringida)

**Objetivo:** reemplazar por completo la cabecera y las colecciones del agregado, sin escrituras parciales.

**Endpoint propuesto:**

```http
PUT /planning/restrictions/901
Content-Type: application/json
```

### Parámetros

| Parámetro | Ubicación | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|---|
| `restrictionId` | Path | `number` | Sí | BIGINT positivo |
| `Content-Type` | Header | `string` | Sí | `application/json` |

### Payload de reemplazo completo

| Campo | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|
| Cabecera canónica sin auditoría | `object` | Sí | Todos los campos funcionales, incluido `isActive` |
| `schedules` | `schedule[]` | Sí | ID existente para conservar; sin ID para crear; fila omitida para retirar lógicamente |
| `vehicleRules` | `vehicleRule[]` | Sí | Misma política de IDs que `schedules` |

`restrictionType` debe enviarse porque `PUT` reemplaza el DTO completo, pero debe coincidir exactamente con `restriction_type` de la cabecera bloqueada. No se permite convertir una restricción existente a otro tipo.

Este ejemplo conserva y modifica los hijos `1401` y `1801`, crea dos hijos sin ID y retira lógicamente los hijos anteriores `1402` y `1802` porque ya no aparecen.

```json
{
  "distributorId": 17,
  "name": "Centro histórico - obras ampliadas",
  "description": "Restricción municipal ampliada hasta noviembre.",
  "restrictionType": "RESTRICTED_AREA",
  "effect": "NO_TRANSIT",
  "severity": "BLOCKING",
  "geometryGeoJson": {
    "type": "Polygon",
    "coordinates": [
      [
        [-63.1870, -17.7809],
        [-63.1802, -17.7809],
        [-63.1802, -17.7871],
        [-63.1870, -17.7871],
        [-63.1870, -17.7809]
      ]
    ]
  },
  "isActive": true,
  "schedules": [
    {
      "id": 1401,
      "validFrom": "2026-09-01",
      "validTo": "2026-11-30",
      "dayOfWeek": 1,
      "startTime": "22:00:00",
      "endTime": "06:00:00"
    },
    {
      "validFrom": "2026-09-01",
      "validTo": "2026-11-30",
      "dayOfWeek": 6,
      "startTime": "20:00:00",
      "endTime": "05:00:00"
    }
  ],
  "vehicleRules": [
    {
      "id": 1801,
      "plateLastDigit": 3,
      "minCapacityWeightKg": 4000.0,
      "truckType": null,
      "plate": null
    },
    {
      "plateLastDigit": null,
      "minCapacityWeightKg": null,
      "truckType": null,
      "plate": "5931-TRK"
    }
  ]
}
```

### Response canónica y ejemplo breve

La respuesta real usa el envelope de éxito y `data` es **exactamente** el DTO canónico `restriction` definido en las secciones 5.2, 5.3 y 5.4. Se obtiene mediante la relectura dentro de la transacción. El siguiente JSON abreviado muestra el envelope y los cambios relevantes; no define una proyección alternativa:

```json
{
  "success": true,
  "code": 200,
  "data": {
    "id": 901,
    "restrictionType": "RESTRICTED_AREA",
    "name": "Centro histórico - obras ampliadas",
    "schedules": [
      {
        "id": 1401,
        "validFrom": "2026-09-01",
        "validTo": "2026-11-30",
        "dayOfWeek": 1,
        "startTime": "22:00:00",
        "endTime": "06:00:00"
      },
      {
        "id": 1403,
        "validFrom": "2026-09-01",
        "validTo": "2026-11-30",
        "dayOfWeek": 6,
        "startTime": "20:00:00",
        "endTime": "05:00:00"
      }
    ],
    "vehicleRules": [
      {
        "id": 1801,
        "plateLastDigit": 3,
        "minCapacityWeightKg": 4000.0,
        "truckType": null,
        "plate": null
      },
      {
        "id": 1803,
        "plateLastDigit": null,
        "minCapacityWeightKg": null,
        "truckType": null,
        "plate": "5931-TRK"
      }
    ],
    "updatedBy": "m.rojas",
    "updatedAt": "2026-08-27T15:25:00Z"
  }
}
```

Los demás campos de cabecera y auditoría no se repiten en este extracto documental, pero siguen siendo obligatorios en `data` según el DTO canónico.

### Reglas y errores relevantes

- `PUT` no hace merge parcial: los arreglos recibidos son el estado completo deseado.
- `restrictionType` se compara con el valor persistido antes de modificar filas; un cambio responde `409 RESTRICTION_TYPE_IMMUTABLE`.
- Los hijos omitidos se marcan con `deleted_at`; no se eliminan físicamente.
- Todas las validaciones de pertenencia de IDs se ejecutan dentro de la misma transacción y antes de modificar filas; un ID ajeno o eliminado responde `409 CHILD_RESOURCE_CONFLICT`.
- La relectura del DTO canónico ocurre dentro de la misma transacción y antes del `COMMIT`.
- `400` para path o JSON mal formado.
- `404` si la cabecera no existe, está eliminada lógicamente o la distribuidora enviada no existe.
- `422` si el reemplazo no cumple las reglas de aplicación, incluido `EMPTY_SCHEDULE`.
- Cualquier fallo inesperado de persistencia o relectura ejecuta `ROLLBACK` y responde únicamente `500 INTERNAL_ERROR`.

Diagrama: [actualización atómica](./diagramas/Restricciones-46-Actualizar.Secuencia.puml).

## 46.5 Activar o desactivar una restricción (ejemplo: zona restringida)

**Objetivo:** cambiar únicamente el estado operativo de una cabecera no eliminada.

**Endpoint propuesto:**

```http
PATCH /planning/restrictions/901/status
Content-Type: application/json
```

### Parámetros

| Parámetro | Ubicación | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|---|
| `restrictionId` | Path | `number` | Sí | BIGINT positivo |

### Payload

| Campo | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|
| `isActive` | `boolean` | Sí | Único campo aceptado |

```json
{
  "isActive": false
}
```

### Response completa

```json
{
  "success": true,
  "code": 200,
  "data": {
    "id": 901,
    "isActive": false,
    "updatedBy": "m.rojas",
    "updatedAt": "2026-08-27T16:02:00Z"
  }
}
```

### Reglas y errores relevantes

- No modifica horarios, reglas vehiculares ni `deleted_at`.
- Busca la cabecera por ID y borrado lógico, sin filtrar `restriction_type`.
- `400` para path o JSON mal formado.
- `404` si la cabecera no existe o está eliminada lógicamente.
- `422` si falta `isActive`, no es booleano o aparecen campos no admitidos.
- `500 INTERNAL_ERROR` si falla inesperadamente la actualización.

Diagrama: [estado y eliminación](./diagramas/Restricciones-46-Estado-Eliminar.Secuencia.puml).

## 46.6 Eliminar lógicamente una restricción (ejemplo: zona restringida)

**Objetivo:** retirar el agregado del catálogo sin ejecutar borrado físico ni depender de cascadas.

**Endpoint propuesto:**

```http
DELETE /planning/restrictions/901
```

### Parámetros

| Parámetro | Ubicación | Tipo | Obligatorio | Regla propuesta |
|---|---|---|---|---|
| `restrictionId` | Path | `number` | Sí | BIGINT positivo |

No tiene payload.

### Response completa

```json
{
  "success": true,
  "code": 200,
  "data": {
    "id": 901,
    "isActive": false,
    "deletedAt": "2026-08-27T16:05:00Z",
    "updatedBy": "m.rojas",
    "updatedAt": "2026-08-27T16:05:00Z"
  }
}
```

### Política de aplicación propuesta

En una única transacción, la aplicación:

1. marca con el mismo instante `deleted_at` las filas hijas activas de ambas tablas;
2. establece en la cabecera `is_active = false`, `deleted_at = now()` y la auditoría de actualización;
3. confirma solamente si todas las actualizaciones fueron exitosas;
4. ejecuta `ROLLBACK` ante cualquier fallo.

Esta es una política de aplicación propuesta, no una cascada garantizada por DB. No se define restauración en este contrato.

### Errores relevantes

- `400` si `restrictionId` no es un BIGINT positivo.
- `404` si la cabecera no existe o ya está eliminada lógicamente.
- La búsqueda por ID no filtra `restriction_type`.
- Un fallo inesperado al actualizar cualquier tabla revierte la transacción y responde `500 INTERNAL_ERROR`.

Diagrama: [estado y eliminación](./diagramas/Restricciones-46-Estado-Eliminar.Secuencia.puml).

## 46.7 Ejemplos del envelope de error propuesto

### 400: solicitud mal formada

```json
{
  "success": false,
  "code": 400,
  "error": {
    "type": "BAD_REQUEST",
    "message": "No se pudo interpretar la solicitud.",
    "details": [
      {
        "field": "page",
        "code": "INVALID_NUMBER",
        "message": "page debe ser un entero."
      }
    ],
    "traceId": "req-400-a81c"
  }
}
```

### 404: restricción no encontrada

```json
{
  "success": false,
  "code": 404,
  "error": {
    "type": "RESTRICTION_NOT_FOUND",
    "message": "No existe una restricción disponible con id 901.",
    "details": [],
    "traceId": "req-404-f131"
  }
}
```

### 409: hijo en conflicto

```json
{
  "success": false,
  "code": 409,
  "error": {
    "type": "CHILD_RESOURCE_CONFLICT",
    "message": "El agregado no puede reemplazarse con los IDs hijos enviados.",
    "details": [
      {
        "field": "vehicleRules[0].id",
        "code": "CHILD_NOT_OWNED",
        "message": "La regla 1999 no pertenece a la restricción 901."
      }
    ],
    "traceId": "req-409-421e"
  }
}
```

Un intento de cambiar el tipo persistido usa otro error determinista:

```json
{
  "success": false,
  "code": 409,
  "error": {
    "type": "RESTRICTION_TYPE_IMMUTABLE",
    "message": "restrictionType no puede cambiar después de crear la restricción.",
    "details": [
      {
        "field": "restrictionType",
        "code": "IMMUTABLE_FIELD",
        "message": "El valor persistido es RESTRICTED_AREA y se recibió CLOSED_ROAD."
      }
    ],
    "traceId": "req-409-8d12"
  }
}
```

### 422: semántica no válida

```json
{
  "success": false,
  "code": 422,
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "La solicitud contiene valores no válidos.",
    "details": [
      {
        "field": "schedules[0].dayOfWeek",
        "code": "OUT_OF_RANGE",
        "message": "dayOfWeek debe estar entre 0 y 6."
      },
      {
        "field": "geometryGeoJson",
        "code": "INVALID_POLYGON",
        "message": "El anillo exterior debe estar cerrado y no auto-intersectarse."
      },
      {
        "field": "schedules[1]",
        "code": "EMPTY_SCHEDULE",
        "message": "Una fila de horario no puede tener todos sus campos en null; use schedules: [] para permanencia."
      }
    ],
    "traceId": "req-422-c0aa"
  }
}
```

### 500: fallo inesperado

```json
{
  "success": false,
  "code": 500,
  "error": {
    "type": "INTERNAL_ERROR",
    "message": "No fue posible completar la operación.",
    "details": [],
    "traceId": "req-500-92bd"
  }
}
```

Este error cubre fallos inesperados de escritura o relectura canónica. Nunca se usa `409` como sustituto genérico de un fallo de persistencia.

# 47. Consultar zonas restringidas candidatas para un plan

> **FUTURO / NO IMPLEMENTADO.** Este contrato no existe en el repositorio. Solo devuelve candidatas temporales/vehiculares y no invoca ningún motor geoespacial o de ruteo.

**Objetivo:** identificar zonas restringidas temporal y vehicularmente candidatas para los camiones de un plan, antes de una eventual evaluación geoespacial o de ruteo.

**Endpoint futuro propuesto:**

```http
GET /planning/restrictions/applicable?dispatchPlanId=7301&evaluatedAt=2026-09-07T23:30:00-04:00&restrictionType=RESTRICTED_AREA
```

### Parámetros

| Parámetro | Ubicación | Tipo | Obligatorio | Regla futura propuesta |
|---|---|---|---|---|
| `dispatchPlanId` | Query | `number` | Sí | BIGINT positivo de `dispatch_plans.id` |
| `evaluatedAt` | Query | `string` | Sí | ISO 8601 con offset o zona horaria explícita |
| `restrictionType` | Query | `string` | Sí | Valor fijo `RESTRICTED_AREA` para este caso |

No tiene payload.

### Evaluación futura propuesta

1. Cargar el plan no eliminado y su `distributor_id`.
2. Cargar sus filas no eliminadas de `planning_trucks` y los `trucks` relacionados.
3. Seleccionar restricciones de la misma distribuidora con `restriction_type = 'RESTRICTED_AREA'`, `is_active = true` y `deleted_at IS NULL`.
4. Evaluar horarios no eliminados en el instante zonificado; cero horarios significa permanente.
5. Evaluar reglas vehiculares no eliminadas; cero reglas significa todos los camiones del plan. La comparación aplica `capacity_weight_kg >= minCapacityWeightKg`, extrae el último dígito del primer bloque numérico para `plateLastDigit` y normaliza placas quitando espacios exteriores, convirtiendo a mayúsculas y conservando separadores internos.
6. Combinar campos con Y y filas con O según las reglas canónicas.
7. Para cada `RESTRICTED_AREA` candidata, devolver `spatialEvaluation.status = NOT_EVALUATED` sin intentar una evaluación espacial.
8. No escribir `planning_trucks.is_included_in_routing`, `exclusion_reason` ni `excluded_by_restriction_id` desde esta consulta.

### Response futura completa

```json
{
  "success": true,
  "code": 200,
  "data": {
    "dispatchPlanId": 7301,
    "distributorId": 17,
    "evaluatedAt": "2026-09-07T23:30:00-04:00",
    "candidates": [
      {
        "restrictionId": 901,
        "restrictionType": "RESTRICTED_AREA",
        "effect": "NO_TRANSIT",
        "severity": "BLOCKING",
        "matchedPlanningTrucks": [
          {
            "planningTruckId": 8101,
            "truckId": 501,
            "matchedVehicleRuleIds": [1801]
          }
        ],
        "spatialEvaluation": {
          "required": true,
          "status": "NOT_EVALUATED",
          "reason": "No existe un motor geoespacial o de ruteo integrado."
        }
      }
    ]
  }
}
```

### Límites y errores relevantes

- `400` si los query params no pueden interpretarse.
- `404` si el plan no existe o está eliminado lógicamente.
- `422` si `evaluatedAt` no incluye offset/zona horaria, no es un instante válido o `restrictionType` no es `RESTRICTED_AREA`.
- Una placa de camión sin bloque numérico no coincide con `plateLastDigit` y registra `INVALID_TRUCK_PLATE_FORMAT` como dato inválido en el mecanismo de observabilidad definido por la aplicación.
- Detectar intersecciones con `geometry_geojson` requiere convertir/validar la geometría y disponer de la ruta o de sus puntos.
- Evitar el polígono o recalcular una ruta requiere un motor de optimización/ruteo, no solo una consulta SQL.
- La evaluación espacial pertenece a otro contrato futuro; este endpoint no la invoca ni recibe sus resultados.
- La columna `planning_trucks.excluded_by_restriction_id` demuestra capacidad de persistencia para una referencia, pero no demuestra que la evaluación ni la exclusión estén implementadas.

Diagrama: [evaluación futura para un plan](./diagramas/Restricciones-47-Evaluar-Plan.Secuencia.puml).

## 8. Matriz de estado: DB, API propuesta y futuro

| Capacidad | DB actual | API propuesta en este documento | Futuro / no implementado |
|---|---|---|---|
| Persistir cabecera | Tabla y FK disponibles | CRUD 46 | Backend real |
| Persistir horarios | Tabla y FK disponibles | Parte atómica del agregado | Backend real |
| Persistir reglas vehiculares | Tabla y FK disponibles | Parte atómica del agregado | Backend real |
| Listar y consultar detalle | Consultable por SQL | `GET /planning/restrictions` | Controladores y autorización |
| Crear/reemplazar/cambiar estado/eliminar | Tablas permiten escrituras | Contratos 46.3 a 46.6 | Servicios y transacciones reales |
| Validar catálogos de tipo/efecto/severidad | No hay `CHECK`/`ENUM` | Validación propuesta | Catálogo definitivo y constraint |
| Evaluar horarios | Datos disponibles | Semántica definida | Implementación y zona horaria acordada |
| Evaluar reglas contra camiones | Datos disponibles en reglas y `trucks` | Semántica definida | Implementación y normalización de placa |
| Detectar intersección con una ruta | `geometry_geojson` almacena JSONB | No cubierto por CRUD | Motor geoespacial y ruta disponibles |
| Evitar áreas o vías al rutear | No modelado como motor | No cubierto | Integración con optimizador/ruteador |
| Registrar una restricción en `planning_trucks` | FK opcional disponible | La consulta 47 no escribe | Política de exclusión e implementación |
| Usar `cityId` o `scheduleSummary` | No existen en el agregado | Excluidos | Solo si un contrato y persistencia futuros los justifican |

## 9. Deuda de integridad y rendimiento

Sin modificar `db_script.sql`, quedan documentadas estas ausencias:

| Deuda | Riesgo actual | Tratamiento propuesto |
|---|---|---|
| Sin `CHECK`/`ENUM` para tipo, efecto y severidad | La DB acepta textos fuera del catálogo | Validación de aplicación y posterior decisión de constraint/catálogo |
| Sin `CHECK` para `day_of_week` | La DB acepta valores fuera de `0..6` | Validar en API; evaluar constraint |
| Sin `CHECK` para `plate_last_digit` | La DB acepta valores fuera de `0..9` | Validar en API; evaluar constraint |
| Sin `CHECK` para peso mínimo no negativo | La DB acepta umbrales negativos | Validar en API; evaluar constraint |
| Sin validación de `valid_from <= valid_to` | Se pueden guardar rangos imposibles | Validar en API; evaluar constraint |
| `geometry_geojson` es `JSONB` | No garantiza tipo GeoJSON, SRID, cierre ni validez | Validar en aplicación o migrar a PostGIS tras una decisión explícita |
| Sin índice espacial sobre `geometry_geojson` | Evaluaciones espaciales futuras no son indexables directamente | Definir estrategia PostGIS o materialización |
| Sin índices declarados para filtros del catálogo | Listados y joins pueden degradarse | Evaluar índices por `distributor_id`, `restriction_type`, `is_active`, `deleted_at` y FK hijas |
| Sin `ON DELETE CASCADE` | Un borrado físico de cabecera puede fallar o dejar una política indefinida | Mantener soft delete explícito y transaccional |
| Sin constraint que impida filas hijas totalmente vacías | La DB permite un horario totalmente `NULL` y una regla vehicular sin criterios | Rechazar con `EMPTY_SCHEDULE` o la validación equivalente de regla; usar arreglos vacíos como representación canónica |
| `TIMESTAMP` sin zona horaria | Interpretación ambigua entre sedes | Acordar zona de negocio y serialización |
| Sin versión para concurrencia optimista | Un `PUT` puede sobrescribir cambios concurrentes | Definir ETag, versión o precondición basada en `updated_at` |
| Una sola FK de exclusión por camión planificado | No representa varias restricciones simultáneas | Resolver política o introducir relación N:M futura |
| BIGINT frente a JavaScript | Un BIGINT puede superar `Number.MAX_SAFE_INTEGER` aunque el contrato use JSON `number` | Definir límites operativos y validación de entero seguro antes de integrar clientes JavaScript |

Además, el comentario de `db_script.sql:77` menciona `zones.polygon_geojson`, pero la declaración vigente de `zones` contiene `polygon GEOMETRY(Polygon, 4326)`. El mapeo de este documento sigue las columnas declaradas, no esa referencia textual.

## 10. Mockup y alcance futuro no contractual

El mockup mezcla zonas de reparto y restringidas, y no cubre todos los campos del agregado. Puede servir para explorar una experiencia futura de edición y visualización, pero no debe usarse para:

- definir rutas de API;
- introducir `cityId`, `scheduleSummary`, IDs string o `daysOfWeek`;
- omitir reglas vehiculares;
- concluir que existe backend, evaluación espacial o integración con el planificador.

Una futura adaptación del frontend deberá separar visualmente ambos conceptos o proyectarlos de forma explícita, manteniendo contratos independientes para `zones` y `/planning/restrictions`.

## 11. Preguntas abiertas

1. **Zona horaria:** ¿qué zona de negocio debe usarse para `dayOfWeek` y franjas nocturnas cuando `evaluatedAt` llega con otro offset?
2. **Autorización y auditoría:** ¿qué identidad puede administrar una distribuidora y cómo se derivan `createdBy`/`updatedBy` sin aceptar esos campos del cliente?
3. **Restauración:** ¿una restricción eliminada lógicamente puede restaurarse y, en ese caso, se restauran todos sus hijos o una selección?
4. **Geometría:** ¿se conservará GeoJSON en `JSONB` o se migrará a geometría PostGIS con SRID y validación espacial?
5. **Múltiples restricciones por camión:** ¿cómo se registran varios motivos simultáneos si `planning_trucks` solo admite un `excluded_by_restriction_id`?
6. **BIGINT y JavaScript:** ¿qué límite operativo o validación evitará que IDs BIGINT superen `Number.MAX_SAFE_INTEGER` mientras el contrato exige JSON `number`?

## 12. Criterios de revisión

- La única fuente contractual citada para el modelo es `db_script.sql`.
- `zones` está fuera del agregado.
- Los tres componentes del agregado aparecen en contratos, mapeos y transacciones.
- Todos los endpoints están rotulados como propuestos.
- Las operaciones por ID son genéricas y `restrictionType` es inmutable después de crear.
- El caso 47 está rotulado como futuro/no implementado.
- Los ejemplos usan IDs numéricos, camelCase, una fila DB por `schedule` y dos reglas vehiculares con semántica Y/O.
- `minCapacityWeightKg` se serializa como JSON `number` y su comparación está definida con `>=`.
- No se afirma que la FK de `planning_trucks` implemente evaluación, exclusión o ruteo.
