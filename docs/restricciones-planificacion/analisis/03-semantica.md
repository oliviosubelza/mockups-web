# 3. Semántica

Las dos tablas satélite comparten exactamente la misma regla de combinación. Aprenderla una vez alcanza
para las dos.

## 3.1 Las tres reglas

1. **Sin filas = sin restringir.** Sin `schedules` la restricción es permanente; sin `vehicle_rules`
   aplica a toda la flota. Es el default y es el correcto: quien crea un centro histórico cerrado y no
   toca la vigencia quiere que esté cerrado, no que no rija nunca.
2. **Dentro de una fila, los campos se combinan con Y.** `day_of_week = 1` + `start_time = '07:00'` es
   "los lunes de 7 en adelante". Una fila con `plate_last_digit = 3` y `min_capacity_weight_kg = 3500`
   es "los pesados terminados en 3".
3. **Entre filas, O.** Alcanza con que una fila coincida.

Cada campo NULL **no estrecha**: sin día es todos los días, sin horas son las 24 h, sin fechas es para
siempre. Una fila toda en NULL sería semánticamente equivalente a no tener filas, por lo que el mock y
el contrato la rechazan y conservan el arreglo vacío como representación canónica.

## 3.2 Contra qué momento se evalúa

Contra la **fecha operativa del plan** (`dispatch_plans.plan_date`), nunca contra "hoy".

Planificar es una actividad de víspera: se arma hoy el reparto de mañana. Evaluar contra hoy da la
respuesta correcta un día de cada siete, y el error es invisible — el mapa se ve igual, la flota se ve
igual, y el camión aparece en el retén.

En el mockup la fecha es siempre el día siguiente y **no hay selector**, a propósito: es una regla de
negocio, no una preferencia. Se fija al crear el plan y no se re-estampa al guardar (si se re-estampara,
volver a guardar un plan lo mudaría de día).

**Momento sin hora.** La planificación trabaja con el día entero y no tiene una hora que ofrecer — el
camión sale a la mañana y vuelve a la tarde. Cuando no hay hora, una fila con franja horaria **sí
cuenta** con que coincida el día. Es la respuesta conservadora: contestar que no rige escondería la
restricción justo cuando todavía se puede evitar.

---

## 3.3 Dos trampas que fallan en silencio

Las dos están resueltas en el mockup (`src/mockup/restricciones/domain.ts`) y las dos hay que
resolverlas también en el backend.

### Zona horaria

`new Date('2026-08-25')` parsea como **UTC medianoche**. En UTC-4 devuelve el día *anterior* en hora
local. Una restricción de martes se aplicaría los lunes, y no se nota hasta que falta un camión.

- **Front:** construir el `Date` con los componentes separados (`new Date(y, m-1, d)`), nunca desde el
  string. Vale también para formatear: en el mockup, el texto de la fecha del plan se arma a mano y no
  con `toLocaleDateString`.
- **Backend:** comparar como `DATE` de Postgres o como texto ISO. **No castear a `timestamptz`.**

Fechas y horas se guardan como texto ISO / `HH:MM` en el front a propósito: en ese formato la
comparación lexicográfica y la cronológica son la misma, así que alcanza con `<=`.

### Franja nocturna

`22:00 → 06:00` con `start_time <= h AND h < end_time` **no rige nunca**: no hay hora que sea a la vez
mayor que 22 y menor que 6.

Se detecta con `start_time > end_time` y ahí la condición se invierte: rige del inicio a la medianoche
**o** de la medianoche al fin. Cuando envuelve, `day_of_week` se refiere al día en que la franja
**empieza** — "sábados de 22 a 6" rige el sábado a las 23 y el domingo a la 1, que es como lo describe
cualquiera.

---

## 3.4 Reglas vehiculares: los tres casos

"Restricción por placa" son tres cosas distintas, y la diferencia es **quién determina el dato**:

| | Cómo se determina | Fuente |
|---|---|---|
| Pico y placa (dígito) | Se **computa** | `trucks.plate` |
| Pesados | Se **computa** | `trucks.capacity_weight_kg`, `truck_type` |
| Lista negra | Se **marca a mano**, camión por camión | El usuario |

Los dos primeros **no se tildan a mano**. El usuario configura "los lunes no circulan los terminados en
1 y 2" y el sistema deriva a quién le pega. Si hubiera que tildar camiones, el día que entra uno nuevo
a la flota nadie se acuerda y el plan sale con un vehículo que no puede circular.

### El último dígito NO es el último carácter

El formato de placa es **`4821-XKD`**: números primero, letras después. `plate[-1]` devuelve `D`.

Hay que extraer el bloque numérico con una regex y tomar su último dígito. Es un bug garantizado si no
se escribe explícito, y es silencioso: la regla simplemente no matchea nunca.

### El tonelaje no sale de la placa

Se lee de `trucks.capacity_weight_kg`. Ninguna serie de placa codifica peso. En algunos países la serie
distingue servicio público de particular, pero eso no es tonelaje y no sirve como fuente.

---

## 3.5 Lo que hace que una regla sea usable

**El preview.** Al lado de cada regla, en la pantalla de configuración: *"afecta a estos 4 camiones:
4821-XKD, 1093-BRT…"*.

Sin eso nadie sabe si escribió bien la regla, y una regla de circulación mal escrita no se descubre
hasta que hay un camión parado en un retén. Es la única forma de verificar una regla antes de que
tenga consecuencias.
