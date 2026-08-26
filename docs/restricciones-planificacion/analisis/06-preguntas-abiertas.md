# 6. Preguntas abiertas

Lo que sabemos que **no** está resuelto. Si el revisor encuentra huecos fuera de esta lista, son huecos
de verdad.

## 6.1 Operativas — las tiene que contestar el negocio

**¿Se reparte los sábados?** La fecha del plan es "mañana". Un viernes, "mañana" es sábado. Si no se
reparte sábado, la regla real es *"el próximo día hábil"* y hay que definir el calendario laboral. No
es cosmético: las restricciones de circulación son **por día de semana**, así que la fecha equivocada
evalúa el día equivocado. Lo mismo con los feriados.

**¿Existe hoy pico y placa en Santa Cruz, y con qué regla?** El modelo soporta cualquier esquema, pero
para sembrar datos de ejemplo creíbles hay que saber la regla vigente. Cambia por municipio y la
cambian seguido — por eso se configura y no se hardcodea.

**¿Quién administra las restricciones?** ¿El planificador, o un rol aparte? Cambia si la pantalla va
bajo Configuración o bajo Planificación, y si necesita permisos propios.

**¿Una restricción es por distribuidora o corporativa?** El modelo asume `distributor_id NOT NULL`. Si
una regla municipal aplica a todas las distribuidoras de esa ciudad, habría que permitir NULL y
resolver por ciudad — que es la alternativa a `distributor_id` que se descartó en `02.2`.

## 6.2 Técnicas — sin decidir

**El nombre exacto del campo de matrices precalculadas en Google RO.** `04.3` menciona
`ShipmentModel.durationDistanceMatrices` pero hay que verificarlo contra la doc vigente. De eso depende
si `NO_TRANSIT` puede llegar a ser real o se queda en advertencia para siempre.

**¿`NO_TRANSIT` justifica un OSRM propio?** Es la diferencia entre avisar y evitar. Es una decisión de
infraestructura, no de modelo, pero condiciona qué se le puede prometer al usuario.

**¿Cómo se dibuja una vía cerrada?** Una `LineString` a mano no tiene ancho, y una calle sí. Opciones:
un buffer de N metros alrededor de la línea, o dos puntos que OSRM ajusta al tramo de calle real. La
segunda es más precisa y depende del motor.

**¿Se versionan las restricciones?** Si alguien edita el horario del centro histórico, los planes
viejos quedan explicados por una regla que ya no existe. `dispatch_plan_restriction_hits` (`02.4`)
guarda el hecho pero no la regla que lo causó.

## 6.3 Cosas que están decididas y NO hay que volver a discutir

Anotadas acá para que el revisor no gaste tiempo en ellas:

| Decisión | Dónde está el porqué |
|---|---|
| Zonas restringidas en tabla aparte, no en `zones` | `02.1` |
| Geometría inline, no en tabla satélite | `02.2` |
| `schedules` y `vehicle_rules` sí en tablas aparte (son 1:N) | `02.2` |
| `distributor_id` y no `city_id` | `02.2` |
| Sin filas = permanente / toda la flota | `03.1` |
| Se evalúa contra la fecha del plan, no contra hoy | `03.2` |
| El compilador vive en el dominio, no en el adaptador | `04.4` |
| `severity` arranca en `WARNING` | `01`, `04.3` |
