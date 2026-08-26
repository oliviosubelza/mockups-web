# 2. Modelo de datos

## Resumen: 3 tablas nuevas, 1 modificada

| | Tabla | Qué pasa |
|---|---|---|
| ➕ | `planning_restrictions` | **Nueva.** Cabecera: qué es, dónde, qué prohíbe, con qué severidad |
| ➕ | `planning_restriction_schedules` | **Nueva.** El *cuándo*. Sin filas = permanente |
| ➕ | `planning_restriction_vehicle_rules` | **Nueva.** El *a quién*. Sin filas = toda la flota |
| ✏️ | `planning_trucks` | **Modificada.** Dos columnas para registrar por qué un camión quedó fuera |
| ✅ | `zones` | **No se toca** |
| ✅ | `trucks` | **No se toca** |
| ✅ | `dispatch_plans` | **No se toca** (`plan_date` ya existe) |

Que `zones` y `trucks` no se toquen no es casualidad: es la señal de que el modelo está en el lugar
correcto. `zones` la consume Ventas por id (§28/§29) y `trucks` ya tiene todo lo que las reglas
vehiculares necesitan leer (`plate`, `capacity_weight_kg`, `truck_type`).

---

## 2.1 Por qué las zonas restringidas NO van en `zones`

**Decisión cerrada: tablas aparte.**

Son dos cosas de naturaleza opuesta aunque las dos sean polígonos:

| | `zones` | Zona restringida |
|---|---|---|
| Qué es | Un **particionamiento** del territorio | Un **recorte** sobre el territorio |
| Se solapan | Nunca. Ni se rozan: mínimo 1 m de holgura | Libremente, y a propósito |
| Quién la referencia | Ventas, por id, en cada pedido | Nadie desde afuera |
| Vigencia | Permanente | Puede tener horarios y fechas |
| Ciclo de vida | Se define una vez y dura años | Nace y muere con una obra |

Compartir tabla rompería dos cosas concretas:

1. **La regla de holgura deja de valer para la mitad de las filas.** Hoy es una invariante de la tabla;
   pasaría a ser una invariante condicional al tipo, que es la clase de regla que nadie recuerda.
2. **La consulta §29** ("resolver la zona de un punto", que usa Ventas) empezaría a devolver zonas
   restringidas como si fueran de reparto. Un cliente dentro del centro histórico tendría dos zonas y
   ninguna consulta podría decidir cuál es la suya.

> **Mockup alineado con el modelo.** `zones-store` conserva solo zonas logísticas. Las restricciones
> tienen dominio, persistencia, rutas y editor independientes bajo `src/mockup/restricciones/`.

---

## 2.2 Tablas nuevas

Convenciones tomadas del esquema vigente: `BIGSERIAL`, auditoría completa, `VARCHAR` para los enums.

### Por qué `distributor_id` y no `city_id`

Sigue el precedente de `sale_channel_restrictions`, que es la otra tabla de restricciones del esquema.
La ciudad sale por `distributors.city_id` si hace falta, y el plan ya sabe su distribuidora por
`dispatch_plans.distributor_id` — así "qué restricciones aplican a este plan" es un JOIN directo, sin
derivar ciudades de las paradas.

### Por qué la geometría va inline y no en satélite

Una restricción tiene **exactamente una geometría o ninguna**: es 1:1, no hay nada que satelizar.
`zones.polygon_geojson` ya sentó ese precedente. La regla aplicada en todo el modelo es simple:
**1:1 va inline, 1:N va en tabla aparte.**

```sql
-- ── CABECERA ──────────────────────────────────────────────────────────────────
CREATE TABLE planning_restrictions (
    id BIGSERIAL PRIMARY KEY,
    distributor_id BIGINT NOT NULL,          -- Centro que administra la restricción
    name VARCHAR(50) NOT NULL,
    description VARCHAR(100),
    restriction_type VARCHAR(30) NOT NULL,   -- 'RESTRICTED_AREA', 'CLOSED_ROAD', 'PLATE_ROTATION'
    effect VARCHAR(30) NOT NULL,             -- 'NO_TRANSIT', 'NO_DELIVERY', 'NO_VEHICLE'
    severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',  -- 'BLOCKING', 'WARNING'
    geometry_geojson JSONB,                  -- Polygon o LineString. NULL en PLATE_ROTATION
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_planning_restriction_distributor
        FOREIGN KEY (distributor_id) REFERENCES distributors(id)
);

-- ── CUÁNDO. Sin filas = permanente. ───────────────────────────────────────────
-- 1:N porque "lunes y martes de 7 a 9, y sábados de 8 a 12" son TRES filas. Con columnas
-- (`horario_1`, `horario_2`…) no entra, y no hay número de columnas que alcance.
CREATE TABLE planning_restriction_schedules (
    id BIGSERIAL PRIMARY KEY,
    planning_restriction_id BIGINT NOT NULL,
    valid_from DATE,          -- NULL = sin inicio. Inclusive
    valid_to DATE,            -- NULL = sin fin. Inclusive
    day_of_week SMALLINT,     -- 0=domingo … 6=sábado (convención Date.getDay()). NULL = todos
    start_time TIME,          -- NULL = desde 00:00
    end_time TIME,            -- NULL = hasta 24:00. EXCLUSIVO

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_restriction_schedule_restriction
        FOREIGN KEY (planning_restriction_id) REFERENCES planning_restrictions(id)
);

-- ── A QUIÉN. Sin filas = toda la flota. ───────────────────────────────────────
-- 1:N por lo mismo: "los lunes no circulan el 1 y el 2" son dos filas.
CREATE TABLE planning_restriction_vehicle_rules (
    id BIGSERIAL PRIMARY KEY,
    planning_restriction_id BIGINT NOT NULL,
    plate_last_digit SMALLINT,               -- Pico y placa. Se computa desde trucks.plate
    min_capacity_weight_kg DECIMAL(12, 2),   -- "Solo pesados". Se lee de trucks.capacity_weight_kg
    truck_type VARCHAR(50),                  -- Espeja trucks.truck_type
    plate VARCHAR(20),                       -- Lista negra: una placa puntual

    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,

    CONSTRAINT fk_restriction_vehicle_restriction
        FOREIGN KEY (planning_restriction_id) REFERENCES planning_restrictions(id)
);
```

---

## 2.3 Tabla modificada: `planning_trucks`

Hoy tiene `is_included_in_routing BOOLEAN DEFAULT TRUE`, y ese booleano **no distingue dos cosas muy
distintas**:

- el planificador destildó el camión porque no lo quiere usar;
- el camión **no puede** circular ese día por pico y placa.

El primero se revierte con un click. El segundo no, y si la pantalla no lo dice, el planificador va a
intentar prenderlo de nuevo y va a pensar que la app está rota.

```sql
ALTER TABLE planning_trucks
    ADD COLUMN exclusion_reason VARCHAR(50),          -- NULL | 'MANUAL' | 'RESTRICTION'
    ADD COLUMN excluded_by_restriction_id BIGINT NULL;

ALTER TABLE planning_trucks
    ADD CONSTRAINT fk_planning_truck_restriction
        FOREIGN KEY (excluded_by_restriction_id) REFERENCES planning_restrictions(id);
```

Con eso el panel de Flota muestra el camión deshabilitado **con el motivo escrito**, y el plan guardado
deja rastro de por qué salió con cuatro camiones y no con seis.

---

## 2.4 Opcional, fase 2: `dispatch_plan_restriction_hits`

No hace falta para arrancar. Sirve para contestar meses después *"¿por qué esta ruta dio esa vuelta?"*
o *"¿por qué esta parada quedó afuera?"*.

```sql
CREATE TABLE dispatch_plan_restriction_hits (
    id BIGSERIAL PRIMARY KEY,
    dispatch_plan_id BIGINT NOT NULL,
    planning_restriction_id BIGINT NOT NULL,
    hit_type VARCHAR(30) NOT NULL,           -- 'TRUCK_EXCLUDED', 'POINT_EXCLUDED', 'ROUTE_CROSSES'
    truck_id BIGINT NULL,
    dispatch_delivery_point_id BIGINT NULL,
    route_id BIGINT NULL,
    detail VARCHAR(200),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_hit_plan FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id),
    CONSTRAINT fk_hit_restriction FOREIGN KEY (planning_restriction_id) REFERENCES planning_restrictions(id)
);
```

Es el reverso del **informe** que produce el compilador (ver `04`): lo mismo que se le muestra al
planificador en pantalla, persistido.

---

## 2.5 Dónde está aplicado

**El DDL de esta sección ya está escrito en
[`../../../db_script.sql`](../../../db_script.sql)**, que es el esquema al día —28 tablas, con las
sesiones de conteo y los activos logísticos—.

Ubicación dentro del script: las tres tablas nuevas van **antes de `trucks`**, porque son dato de
configuración y `planning_trucks` les hace FK. Las dos columnas de `planning_trucks` están inline en su
`CREATE TABLE`, no como `ALTER`: el script es un `DROP SCHEMA` + recreación completa, así que un ALTER
al final sería ruido.

> **Autoridad del esquema:** use únicamente [`../../../db_script.sql`](../../../db_script.sql). Las
> copias SQL auxiliares bajo carpetas de diagramas no forman parte de este contrato.
