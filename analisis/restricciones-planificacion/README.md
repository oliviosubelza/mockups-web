# Análisis — Restricciones de planificación

**Fecha: 2026-08-24.** Documento de análisis previo a implementación. Todavía no hay endpoints ni
diagramas de secuencia.

**Para quien lo revisa:** el objetivo de esta carpeta es que el plan se entienda de una lectura. Si algo
no se entiende, es un hueco del plan, no del lector. El archivo `06-preguntas-abiertas.md` lista lo que
ya sabemos que falta — todo lo demás debería estar cerrado.

## El plan en dos minutos

La planificación tiene que respetar límites que no salen ni de los pedidos ni de la flota: zonas donde
no se puede circular, avenidas cerradas por obra, y camiones que no pueden salir según su placa.

**La idea central es que no son tres entidades, son tres combinaciones de los mismos ejes.** Cada
restricción tiene un DÓNDE (una geometría, o ninguna), un CUÁNDO (permanente o por franjas) y un A
QUIÉN (toda la flota, o un subconjunto). Modelarlas por separado obligaría a escribir tres veces la
vigencia y tres veces la evaluación.

**Se agregan 3 tablas y se modifica 1.** `zones` y `trucks` no se tocan.

**Las restricciones no se le pasan al optimizador: se compilan contra el payload antes de mandarlo.**
Ni OSRM ni Google Route Optimization saben esquivar un polígono arbitrario, así que no hay alternativa.

## Índice

| Archivo | Qué contesta |
|---|---|
| [`01-problema-y-alcance.md`](01-problema-y-alcance.md) | Qué se está resolviendo y qué queda afuera |
| [`02-modelo-de-datos.md`](02-modelo-de-datos.md) | **Qué tablas se agregan y cuáles se modifican**, con el DDL |
| [`03-semantica.md`](03-semantica.md) | Cómo se evalúa una restricción, y las trampas que fallan en silencio |
| [`04-integracion-optimizador.md`](04-integracion-optimizador.md) | Cómo llega esto a Google Route Optimization |
| [`05-estado-del-mockup.md`](05-estado-del-mockup.md) | Qué ya está construido y qué falta |
| [`06-preguntas-abiertas.md`](06-preguntas-abiertas.md) | Lo que sabemos que no está resuelto |

## Secciones de documentación reservadas

**46** (CRUD de restricciones) y **47** (qué restricciones rigen para un plan). El máximo ocupado hoy
en el proyecto es 45. El hueco 32-40 se deja libre a propósito, siguiendo la convención existente.
