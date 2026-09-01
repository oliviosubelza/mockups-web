# Plan vs ejecutado

Componente: `src/mockup/monitoreo/RutaParalela.tsx`

Modelo asociado:

- `src/mockup/monitoreo/linea-tiempo.ts`

## Que problema resuelve

Es la lectura temporal del viaje. No responde "donde esta" sino:

- Cuando salio realmente contra cuando debia salir.
- En que parada se rompio la puntualidad.
- Si el chofer altero el orden de visita.

No es un gantt de varias filas ni una timeline lineal simple. Son dos lineas paralelas sobre el mismo
eje:

- Arriba: planificado.
- Abajo: ejecutado.

## Modelo que alimenta el eje

`construirLineaTiempo` arma una estructura `LineaTiempo` con:

- Salida planificada.
- Salida real.
- Demora de salida.
- Cierre planificado.
- Cierre real.
- Hitos por parada.
- Medidas agregadas: puntualidad, peor parada, desvio promedio y fuera de orden.
- `ahoraMin` para el playhead del viaje en curso.

Cada `HitoLineaTiempo` guarda:

- Secuencia planificada.
- Secuencia ejecutada.
- Cliente y punto.
- Llegada y cierre planificados.
- Llegada y cierre reales.
- Desvio.
- Tier de puntualidad.
- Ventana y fuera de ventana.
- Incidencias.

## Reglas de negocio que el eje ya fija

1. El plan todavia se deriva por formula, no por una ETA persistida por parada.
2. El semaforo de puntualidad usa tolerancias del dominio, no decisiones de pintura:
   - `UMBRAL_EN_HORA = 8`
   - `UMBRAL_DEMORA = 25`
3. La salida tardia se mide aparte porque arrastra al resto del viaje.
4. El resecuenciamiento vive aparte del atraso horario: una parada puede quedar fuera de orden y aun asi cerrar en hora.

## Lectura visual

La pantalla muestra:

- Regla temporal arriba.
- Linea planificada con deposito, paradas y retorno.
- Linea ejecutada con deposito, paradas en orden real y retorno si el viaje cerro.
- Conector vertical-horizontal-vertical de la parada seleccionada.
- Playhead `ahora` mientras el viaje sigue abierto.

No se dibuja un conector por cada parada. Solo se conecta la seleccion activa.

## Orden real

La fila inferior dibuja las paradas en orden de llegada real.

Consecuencia visual:

- Si el chofer se salteo la parada 2 y fue a la 3, la linea de abajo se ve `1-3-2`.
- Las paradas fuera de orden ademas se remarcan con aro ambar.

Ese es el mecanismo principal para exponer resecuenciamiento sin llenar la pantalla de diagonales.

## Color y semaforo

La pista ejecutada usa el `tier` de desvio:

| Tier | Significado |
|---|---|
| `adelantado` | Llego antes del margen tolerado |
| `en_hora` | Dentro de tolerancia |
| `demora` | Atraso leve |
| `tarde` | Atraso material |

Excepcion:

- Una parada `fallido` o `devuelto` usa el color de su estado, no el de su puntualidad.

La razon es semantica: en una entrega no concretada, "llego a tiempo" no es la lectura que manda.

## Pending y fantasmas

Las paradas todavia no ocurridas no desaparecen de la linea ejecutada.

Se muestran como hitos fantasma en la posicion esperada. Con eso la UI evita una lectura falsa de "el
viaje tiene menos paradas de las que realmente tiene".

## Zoom y legibilidad

El eje no usa un zoom libre sin reglas. Tiene tres mecanismos concretos:

- Piso de zoom: el viaje entero ya entra en la caja.
- Piso de legibilidad: no aplastar los hitos hasta que se toquen.
- Techo de ajuste automatico: el auto-fit no elige un zoom absurdo solo para separar un par de marcas.

Escalones de densidad:

| Densidad | Que se dibuja |
|---|---|
| `numero` | Circulo con numero |
| `circulo` | Circulo sin numero |
| `punto` | Punto de color |

Al alejar:

- Primero se pierde el numero.
- Luego la etiqueta.
- Lo ultimo que sobrevive es el color.

## Interacciones

La UI hoy soporta:

- Click sobre un hito para seleccionarlo.
- Flechas izquierda/derecha para moverse entre paradas.
- Arrastre horizontal con mouse.
- Boton del medio para desplazar.
- `Ctrl + rueda` o `Cmd + rueda` para zoom anclado.
- Botones `Acercar`, `Alejar` y `Comprimir viaje`.

El scroll se reubica para mantener visible la parada seleccionada cuando se navega con teclado.

## Etiquetas y resumen inferior

Las horas no se dibujan de forma ingenua.

- Se reparten en dos filas para evitar solape.
- En densidad de punto se apagan todas salvo la activa.
- La informacion larga de cliente y punto se baja al pie inferior.

El pie de seleccion muestra:

- Numero y cliente.
- Estado de entrega.
- Ventana.
- Hora planificada y real.
- Desvio.
- Incidencias si existen.

## Lo que conviene trasladar al documento formal

1. "Plan vs ejecutado" ya no es solo un nombre de boton; es una superficie funcional propia.
2. El orden real de la linea inferior es parte del significado del componente.
3. El resecuenciamiento y la puntualidad son dos lecturas distintas y deben documentarse separadas.
4. El zoom tiene reglas de legibilidad, no solo controles cosmeticos.
