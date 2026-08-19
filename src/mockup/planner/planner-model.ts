// Modelo puro del planificador unificado (propuesta "quamain"): pedidos → paradas → rutas.
//
// POR QUÉ ESTE ARCHIVO EXISTE.
// La pantalla nueva une lo que hoy son dos pasos (elegir flota/pedidos y después planificar). Si esa
// unión se escribiera dentro del componente, el mapa terminaría siendo dueño de las reglas del plan y
// no habría forma de probarlas ni de moverlas. Acá NO hay React ni Leaflet: entran datos, salen datos.
//
// Todo lo de acá ya existía repartido entre `dispatch-plan-snapshot` (agrupar pedidos en paradas) y
// `PlanningView.optimizar` (repartir por capacidad). Se extrae en funciones puras para que las dos
// pantallas puedan converger después sin copiar y pegar la regla una tercera vez.
import { ordenarPorCercania } from '../map/geo/hilbert'
import { nearestOrder } from '../map/route-optimizer'
import {
  DEPOSITO,
  MAX_CLIENTES_POR_CAMION,
  type Camion,
  type Parada,
  type Pedido,
} from '../mock-data'

/** Una ruta del plan = un camión seleccionado. El color es el del camión (ya evita la franja azul). */
export interface RutaPlan {
  id: string
  nombre: string
  color: string
  camion: Camion
}

/** Id de ruta derivado del camión. Mismo formato que usa PlanningView (`r-<camionId>`). */
export const rutaIdDeCamion = (camionId: string) => `r-${camionId}`

/**
 * Dónde cayó cada parada. Se guarda por id de parada y NO dentro de la parada porque las paradas se
 * REDERIVAN de los pedidos en cada cambio de filtro: si la asignación viviera adentro, cambiar un
 * filtro la borraría.
 */
export interface Asignacion {
  rutaId: string | null
  secuencia: number
}

export type Asignaciones = Record<string, Asignacion>

/**
 * Agrupa los pedidos por punto de entrega: varios pedidos del mismo punto son UNA parada (el camión
 * va una vez y descarga todo). Es la misma regla de `construirParadasScope`, pero sin repartir
 * camiones — acá el reparto es una acción explícita del usuario ("Optimizar"), no un efecto.
 */
export function construirParadas(pedidos: Pedido[]): Parada[] {
  const porPunto = new Map<string, Pedido[]>()
  for (const pedido of pedidos) {
    porPunto.set(pedido.puntoEntregaId, [...(porPunto.get(pedido.puntoEntregaId) ?? []), pedido])
  }

  return [...porPunto.entries()].map(([puntoEntregaId, delPunto], i) => {
    const primero = delPunto[0]
    return {
      id: `plan-${puntoEntregaId}`,
      puntoEntregaId,
      puntoEntrega: primero.puntoEntrega,
      cliente: primero.cliente,
      canal: primero.canal,
      pedidos: delPunto,
      pesoTotal: Number(delPunto.reduce((acc, p) => acc + p.peso, 0).toFixed(2)),
      volumenTotal: Number(delPunto.reduce((acc, p) => acc + p.volumen, 0).toFixed(1)),
      ventana: primero.ventana,
      secuencia: i + 1,
      camionId: null,
      camionForzadoId: null,
      lat: primero.lat,
      lng: primero.lng,
    }
  })
}

/**
 * Una ruta por camión seleccionado, en el orden en que el usuario los fue eligiendo.
 *
 * `nombres` son los nombres puestos A MANO (al crear una ruta desde la barra superior). Se aplican
 * acá y no se guardan dentro de la ruta porque las rutas se REDERIVAN de los camiones elegidos en
 * cada cambio: si el nombre viviera adentro, deseleccionar un camión y volver a elegirlo lo borraría.
 * Es la misma razón por la que las asignaciones viven aparte (ver `Asignacion`).
 */
export function construirRutas(
  camiones: Camion[],
  nombres: Record<string, string> = {},
): RutaPlan[] {
  return camiones.map((camion, i) => {
    const id = rutaIdDeCamion(camion.id)
    return {
      id,
      nombre: nombres[id] ?? `Ruta ${i + 1}`,
      color: camion.color,
      camion,
    }
  })
}

/**
 * Reparte las paradas entre las rutas a prorrata de la capacidad de cada camión, respetando PESO y
 * VOLUMEN.
 *
 * POR QUÉ LAS DOS CAPACIDADES Y NO SOLO EL PESO. Repartía solo por kilos, y la barra de ocupación mide
 * `max(pctPeso, pctVolumen)` (ver `cargaDeRuta`). O sea que la pantalla repartía con una regla y puntuaba
 * con otra, y cuando las dos no coincidían el resultado era un plan que su propia barra declaraba
 * imposible: cuatro rutas al 120-160 % con los camiones al 80 % de su peso útil. Un optimizador tiene
 * que optimizar contra la misma restricción que la pantalla verifica, o el usuario ve un error donde el
 * código cree que hizo bien su trabajo.
 *
 * Partir la lista en N trozos iguales de paradas no sirve: las paradas no pesan lo mismo ni los camiones
 * tienen la misma capacidad —el maestro va de una minivan de 1 t a un camión de 30—, así que el objetivo
 * de cada ruta es su capacidad × el ratio de lo que hay que repartir. Como `ratio ≤ 1`, ningún objetivo
 * supera la capacidad real.
 *
 * Recorrer la curva de Hilbert en orden mantiene la CONTIGÜIDAD geográfica de cada ruta; el orden fino
 * dentro del grupo lo decide después el vecino-más-cercano desde el depósito.
 *
 * ADEMÁS, respeta la refrigeración: una parada con algún pedido de frío solo puede caer en un camión
 * `Frío`. Si no hay ninguno con lugar, queda sin asignar — y el panel de avisos dice por qué.
 */
export function optimizar(paradas: Parada[], rutas: RutaPlan[]): Asignaciones {
  const asignaciones: Asignaciones = {}
  if (paradas.length === 0 || rutas.length === 0) return asignaciones

  const depot: [number, number] = [DEPOSITO.lat, DEPOSITO.lng]
  const porCercania = ordenarPorCercania(paradas, (p) => [p.lat, p.lng])

  const libreKg = rutas.map((r) => (r.camion.capacidadPeso ?? 0) * 1000)
  const libreM3 = rutas.map((r) => r.camion.capacidadVolumen ?? 0)

  /**
   * El objetivo de cada ruta se calcula con UN ratio por dimensión, y el que manda es el más exigente.
   *
   * Con ratios independientes —peso al 60 %, volumen al 95 %— los objetivos de una misma ruta describen
   * dos planes distintos, y el reparto termina cortando por el que se agota primero de todos modos. Un
   * solo ratio (el mayor de los dos) reparte contra la restricción que de verdad limita el día y deja las
   * rutas parejas EN ESA dimensión, que es la que la barra va a mostrar.
   */
  const totalKg = libreKg.reduce((acc, kg) => acc + kg, 0)
  const totalM3 = libreM3.reduce((acc, m3) => acc + m3, 0)
  const demandaKg = porCercania.reduce((acc, p) => acc + p.pesoTotal, 0)
  const demandaM3 = porCercania.reduce((acc, p) => acc + p.volumenTotal, 0)
  const ratio = Math.min(
    1,
    Math.max(totalKg > 0 ? demandaKg / totalKg : 0, totalM3 > 0 ? demandaM3 / totalM3 : 0),
  )
  const objetivoKg = libreKg.map((kg) => kg * ratio)
  const objetivoM3 = libreM3.map((m3) => m3 * ratio)

  const grupos = new Map<string, Parada[]>()
  const sinAsignar: Parada[] = []
  let actual = 0

  // LA REFRIGERACIÓN ES UNA RESTRICCIÓN DURA, no una preferencia. Repartir sin mirarla mandaba pedidos
  // de frío a camiones secos: el plan cerraba perfecto en kilos y la mercadería no llegaba. Un camión de
  // frío SÍ puede llevar carga seca, así que la restricción es en un solo sentido.
  const sirve = (parada: Parada, i: number) =>
    !parada.pedidos.some((p) => p.productType === 'Frío') || rutas[i].camion.tipo === 'Frío'

  const entra = (parada: Parada, i: number, kg: number[], m3: number[]) =>
    sirve(parada, i) && kg[i] >= parada.pesoTotal && m3[i] >= parada.volumenTotal

  /**
   * Cuánto lugar le queda a una ruta, como fracción de su capacidad y en su dimensión más ajustada.
   *
   * Es lo que permite comparar una minivan con un camión de 30 t: en kilos absolutos el camión gana
   * siempre, y elegirlo por eso es exactamente cómo el reparto terminaba con una ruta al 158 % y otra al
   * 4 %. Lo que se reparte es OCUPACIÓN, no kilos.
   */
  const lugarRelativo = (i: number) =>
    Math.min(
      libreKg[i] > 0 ? libreKg[i] / ((rutas[i].camion.capacidadPeso ?? 0) * 1000 || 1) : 0,
      libreM3[i] > 0 ? libreM3[i] / (rutas[i].camion.capacidadVolumen ?? 1) : 0,
    )

  for (const parada of porCercania) {
    // 1. LA RUTA ACTUAL PRIMERO, mientras la parada entre en su objetivo. Es lo que conserva la
    //    contigüidad: las paradas vienen en orden geográfico, así que quedarse en la misma ruta agrupa
    //    vecinos. Saltar de ruta en cada parada daría cuatro recorridos entreverados por toda la ciudad.
    let idx = entra(parada, actual, objetivoKg, objetivoM3) ? actual : -1

    // 2. Se llenó el objetivo de la actual: sigue la siguiente que tenga lugar, en orden. El recorrido
    //    circular arranca en `actual` para que la ruta nueva empiece donde terminó la anterior.
    if (idx === -1) {
      for (let k = 1; k <= rutas.length; k++) {
        const i = (actual + k) % rutas.length
        if (entra(parada, i, objetivoKg, objetivoM3)) {
          idx = i
          break
        }
      }
    }

    // 3. Ninguna tiene objetivo libre —es el resto de empaquetado— y hay que ubicarla igual. Va a la que
    //    tenga MÁS LUGAR RELATIVO, no a la primera que la acepte: el sobrante es justo lo que desnivela
    //    el plan, y colocarlo por orden de aparición es lo que dejaba la primera ruta sobrecargada y la
    //    última casi vacía. Acá se usa la capacidad REAL, no el objetivo.
    if (idx === -1) {
      let mejor = -1
      for (let i = 0; i < rutas.length; i++) {
        if (!entra(parada, i, libreKg, libreM3)) continue
        if (mejor === -1 || lugarRelativo(i) > lugarRelativo(mejor)) mejor = i
      }
      idx = mejor
    }

    // No entra en ninguna: queda SIN ASIGNAR en vez de sobrecargar un camión —o de romper la cadena de
    // frío—. El panel de avisos explica cuál de las dos cosas pasó; esconder la parada sería tapar el
    // problema.
    if (idx === -1) {
      sinAsignar.push(parada)
      continue
    }

    libreKg[idx] -= parada.pesoTotal
    libreM3[idx] -= parada.volumenTotal
    objetivoKg[idx] -= parada.pesoTotal
    objetivoM3[idx] -= parada.volumenTotal
    actual = idx
    const rutaId = rutas[idx].id
    grupos.set(rutaId, [...(grupos.get(rutaId) ?? []), parada])
  }

  for (const [rutaId, stops] of grupos) {
    nearestOrder(depot, stops).forEach((parada, i) => {
      asignaciones[parada.id] = { rutaId, secuencia: i + 1 }
    })
  }
  for (const parada of sinAsignar) {
    asignaciones[parada.id] = { rutaId: null, secuencia: 0 }
  }

  return asignaciones
}

const distancia = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

const punto = (p: Parada): [number, number] => [p.lat, p.lng]

/**
 * Mete una parada en el recorrido existente, en la posición MÁS BARATA: la que menos kilómetros le
 * agrega al trazo. Es la heurística de inserción más económica, y su gracia acá es que NO toca el orden
 * de las que ya estaban — solo elige dónde meter la nueva.
 */
function insertarMasBarato(orden: Parada[], nueva: Parada): Parada[] {
  const depot: [number, number] = [DEPOSITO.lat, DEPOSITO.lng]
  if (orden.length === 0) return [nueva]

  let mejor = 0
  let mejorCosto = Infinity
  for (let i = 0; i <= orden.length; i++) {
    const antes = i === 0 ? depot : punto(orden[i - 1])
    const despues = i === orden.length ? depot : punto(orden[i])
    // Lo que CUESTA meterla acá: los dos tramos nuevos menos el tramo que se parte al medio.
    const costo = distancia(antes, punto(nueva)) + distancia(punto(nueva), despues) - distancia(antes, despues)
    if (costo < mejorCosto) {
      mejorCosto = costo
      mejor = i
    }
  }
  return [...orden.slice(0, mejor), nueva, ...orden.slice(mejor)]
}

/**
 * Recompone la secuencia de las rutas tocadas después de mover paradas.
 *
 * NO RECALCULA TODO. Antes rehacía cada ruta entera con vecino-más-cercano, y eso tenía un problema que
 * apareció recién con el reordenamiento manual: mover UNA parada a una ruta borraba el orden que
 * alguien había armado a mano en esa ruta. Trabajo del usuario destruido por un efecto colateral.
 *
 * Ahora respeta lo que ya estaba: las paradas con secuencia conservan su orden relativo, y las que
 * llegan (secuencia 0, recién movidas) se insertan en su posición más barata. El resultado es el mismo
 * de antes cuando nadie tocó nada a mano, y preserva la decisión del usuario cuando sí la tocó.
 *
 * `Reoptimizar` sigue rehaciendo todo desde cero — ahí SÍ se pidió explícitamente.
 */
export function resecuenciar(
  paradas: Parada[],
  asignaciones: Asignaciones,
  rutaIds: string[],
): Asignaciones {
  const next = { ...asignaciones }

  for (const rutaId of rutaIds) {
    const stops = paradas.filter((p) => next[p.id]?.rutaId === rutaId)
    const yaOrdenadas = stops
      .filter((p) => (next[p.id]?.secuencia ?? 0) > 0)
      .sort((a, b) => (next[a.id]?.secuencia ?? 0) - (next[b.id]?.secuencia ?? 0))
    const recienLlegadas = stops.filter((p) => (next[p.id]?.secuencia ?? 0) === 0)

    let orden = yaOrdenadas
    for (const parada of recienLlegadas) orden = insertarMasBarato(orden, parada)

    orden.forEach((parada, i) => {
      next[parada.id] = { rutaId, secuencia: i + 1 }
    })
  }

  return next
}

/**
 * Fija el orden de visita de una ruta a mano (arrastrando filas en el panel de Rutas).
 *
 * Existe porque el optimizador no sabe todo: que a un cliente hay que llegarle antes de las 10, que
 * otro no recibe hasta que abre, que conviene dejar el más pesado para el final. Eso lo sabe quien
 * planifica, y hasta ahora no tenía dónde decirlo.
 */
export function reordenarRuta(
  asignaciones: Asignaciones,
  rutaId: string,
  ordenIds: string[],
): Asignaciones {
  const next = { ...asignaciones }
  ordenIds.forEach((id, i) => {
    next[id] = { rutaId, secuencia: i + 1 }
  })
  return next
}

/**
 * Proyecta las asignaciones sobre las paradas. El mapa y los paneles consumen SIEMPRE esta salida, no
 * las paradas crudas: así el pin, el trazo y la lista no pueden discrepar sobre a quién le tocó qué.
 */
export function aplicarAsignaciones(
  paradas: Parada[],
  asignaciones: Asignaciones,
  rutas: RutaPlan[],
): Parada[] {
  const camionDeRuta = new Map(rutas.map((r) => [r.id, r.camion.id]))

  return paradas.map((parada) => {
    const asignada = asignaciones[parada.id]
    const rutaId = asignada?.rutaId ?? null
    // Una asignación a una ruta que ya no existe (el usuario deseleccionó el camión) vuelve a "sin
    // asignar" en vez de dejar la parada apuntando a una ruta fantasma.
    const camionId = rutaId ? (camionDeRuta.get(rutaId) ?? null) : null
    const vigente = camionId !== null
    return {
      ...parada,
      rutaId: vigente ? rutaId : null,
      camionId,
      secuencia: vigente ? asignada.secuencia : 0,
      pedidos: parada.pedidos.map((pedido) => ({
        ...pedido,
        rutaId: vigente ? rutaId : null,
        camionId,
        secuencia: vigente ? asignada.secuencia : undefined,
      })),
    }
  })
}

/**
 * Umbrales de ocupación de un camión, en porcentaje de su capacidad.
 *
 * Hasta ahora había UN umbral (90%) repetido a mano en nueve archivos, y arriba de eso nada: una ruta
 * al 1200% se pintaba igual que una al 91%. O sea que el color decía "atención" tanto para el camión
 * que va lleno como para el que lleva doce veces su capacidad — dos situaciones que no se parecen en
 * nada. Un aviso que no distingue el problema grande del chico no se mira más.
 *
 * Tres niveles y no dos, porque hay tres situaciones REALES distintas:
 *   · < 90       → normal. Entra sin discusión.
 *   · 90 – 150   → apretado. Pasa de la capacidad nominal, pero es el rango en el que se sale igual:
 *                  se acomoda la carga, se apila distinto, se lleva un poco de más. ÁMBAR.
 *   · > 150      → imposible. Ningún acomodo mete media carga extra en el mismo camión. ROJO.
 *
 * El 150 no sale de una tabla: es hasta dónde el negocio dijo que se estira. Vive acá, en un solo
 * lugar, para que cambiarlo no obligue a buscar nueve archivos.
 */
export const OCUPACION_ALERTA = 90
export const OCUPACION_CRITICA = 150

export type NivelOcupacion = 'ok' | 'alta' | 'critica'

export function nivelOcupacion(pct: number): NivelOcupacion {
  if (pct > OCUPACION_CRITICA) return 'critica'
  if (pct >= OCUPACION_ALERTA) return 'alta'
  return 'ok'
}

/** Clases de texto por nivel. Una sola definición, o los nueve lugares se despintan de a uno. */
export const TEXTO_OCUPACION: Record<NivelOcupacion, string> = {
  ok: 'text-muted-foreground',
  alta: 'text-amber-600 dark:text-amber-400',
  critica: 'text-rose-600 dark:text-rose-400',
}

export interface CargaRuta {
  paradas: Parada[]
  pedidos: number
  pesoKg: number
  volumenM3: number
  /** Ocupación = la restricción que se agote primero (peso o volumen), como en `CapacityBar`. */
  ocupacionPct: number
  /** `ocupacionPct` traducido a los tres estados que la pantalla pinta. Ver `nivelOcupacion`. */
  nivel: NivelOcupacion
  /**
   * Pasa el techo de clientes por camión.
   *
   * Es una SEGUNDA restricción, independiente de `ocupacionPct`: lo que se agota acá es la jornada,
   * no la caja. Una ruta puede ir al 38% de ocupación y ser imposible de cumplir igual porque son 52
   * puntos de entrega. Por eso viaja como bandera propia y no metida dentro del porcentaje — meterla
   * ahí haría que un solo número mezclara dos causas distintas y no se sabría cuál corregir.
   */
  excedeClientes: boolean
}

/** Lo que lleva encima una ruta con la asignación actual. */
export function cargaDeRuta(paradasAsignadas: Parada[], ruta: RutaPlan): CargaRuta {
  const propias = paradasAsignadas
    .filter((p) => p.rutaId === ruta.id)
    .sort((a, b) => a.secuencia - b.secuencia)
  const pesoKg = Number(propias.reduce((acc, p) => acc + p.pesoTotal, 0).toFixed(1))
  const volumenM3 = Number(propias.reduce((acc, p) => acc + p.volumenTotal, 0).toFixed(1))
  const capacidadKg = (ruta.camion.capacidadPeso ?? 0) * 1000
  const capacidadM3 = ruta.camion.capacidadVolumen ?? 0
  const pctPeso = capacidadKg > 0 ? (pesoKg / capacidadKg) * 100 : 0
  const pctVolumen = capacidadM3 > 0 ? (volumenM3 / capacidadM3) * 100 : 0
  const ocupacionPct = Math.round(Math.max(pctPeso, pctVolumen))

  return {
    paradas: propias,
    pedidos: propias.reduce((acc, p) => acc + p.pedidos.length, 0),
    pesoKg,
    volumenM3,
    ocupacionPct,
    nivel: nivelOcupacion(ocupacionPct),
    // Una parada = un punto de entrega = un cliente al que hay que llegar. Es la unidad que consume
    // jornada, y por eso el tope se cuenta sobre paradas y no sobre pedidos: tres pedidos del mismo
    // cliente son una sola bajada del camión.
    excedeClientes: propias.length > MAX_CLIENTES_POR_CAMION,
  }
}

/**
 * Ancho mínimo y máximo del marcador (gota), en px.
 *
 * Chicos a propósito: con 59 paradas sobre una ciudad, marcadores de 40 px se tocan entre sí y el mapa
 * se convierte en una mancha. 13 px es el piso donde una gota todavía se distingue de otra a zoom de
 * barrio, y 22 px alcanza para que la diferencia de tamaño se lea sin que el más grande tape a sus
 * vecinos. El número de secuencia solo entra a partir de 20 px (ver `pinParada`).
 *
 * La referencia de escala es la capa de aeropuertos de Flightradar24: pines de ~14 px, planos, con la
 * silueta hecha por una sombra y no por un contorno. Un marcador chico y limpio deja ver el mapa que
 * está abajo, que es la mitad de la información — un marcador grande y con borde compite con él.
 */
const PIN_MIN_PX = 13
const PIN_MAX_PX = 22

/**
 * Proporción alto/ancho de la CAJA del ícono. Sale del viewBox del marcador (30 × 37).
 *
 * La caja es más grande que la gota (24 × 32) porque el aro azul de la parada marcada se dibuja por
 * FUERA de la silueta, y en una caja justa quedaba recortado contra el borde del viewBox. Son 3
 * unidades de aire arriba y a los costados y 2 abajo: lo que necesita ese aro y nada más.
 */
export const PIN_RATIO = 37 / 30

/**
 * Cuánto más ancha es la caja del ícono que la gota que dibuja adentro.
 *
 * Existe para que `PIN_MIN_PX`, `PIN_MAX_PX` y `PIN_ANCHO_NUMERO` sigan significando "ancho de la
 * GOTA" y no "ancho de la caja". Sin este factor, reservar el margen del aro de selección habría
 * achicado la gota un 20% — el marcador se vería MENOS, que es lo contrario de lo que se buscaba.
 */
export const CAJA_SOBRE_GOTA = 30 / 24

/**
 * Dónde está la PUNTA de la gota dentro de la caja, como fracción de su alto. Es el `iconAnchor`: un
 * pin ancla en su punta o queda flotando arriba del lugar que señala. No es el borde de abajo de la
 * caja, porque ahí abajo quedan las 2 unidades de aire del aro de selección.
 */
export const PIN_ANCLA_Y = 35 / 37

/** Ancho mínimo para que un número de dos cifras se lea dentro del hueco blanco. */
export const PIN_ANCHO_NUMERO = 20

/**
 * Desde qué zoom el mapa muestra el orden de visita en TODOS los pines asignados.
 *
 * Es un umbral y no "el que tenga lugar" a propósito. Con la regla vieja el número aparecía en los
 * marcadores grandes y faltaba en los chicos, o sea que el orden de visita se leía en las paradas
 * pesadas y no en las livianas — una mezcla que no responde a ninguna pregunta. Atado al zoom, la
 * regla es una sola y se entiende sin explicarla: lejos se ve el reparto, cerca se ve el recorrido.
 */
export const ZOOM_NUMERO = 14

/**
 * Desde qué zoom el marcador es una GOTA. Más lejos que esto es un PUNTO.
 *
 * POR QUÉ CAMBIA DE FORMA Y NO SOLO DE TAMAÑO. Las 53 paradas del plan caben en el radio urbano de
 * Santa Cruz, así que a zoom de departamento entran todas en un cuadrado de 150 px y se pisan. Achicar
 * la gota no alcanza: una gota es ALTA y tiene la cabeza ancha, así que al superponerse la cabeza de
 * una tapa la punta de otra y el conjunto se lee como una mancha con relieve, no como puntos. Un disco
 * del mismo diámetro se empaqueta mucho mejor —es lo más compacto que existe para un área dada— y
 * apilado sigue dejando ver los colores de abajo, que a ese zoom es la única pregunta que queda en pie:
 * dónde se concentra cada ruta.
 *
 * La otra mitad del argumento es que a ese zoom la gota no está haciendo su trabajo: lo que la
 * justifica es anclar en la punta para señalar una coordenada exacta, y una coordenada exacta no
 * significa nada cuando un píxel son 200 metros. Ahí el marcador ya no señala un lugar, señala una
 * zona, y la forma correcta de dibujar una zona es un punto en su centro.
 *
 * 13 y no 12 porque 12 es el zoom inicial de la pantalla: entrar viendo puntos y que se conviertan en
 * gotas con un solo click de acercamiento es la transición que se quiere. Entrar ya en gotas dejaría el
 * primer cuadro —el más importante— siendo justamente el que se veía apelmazado.
 */
export const ZOOM_GOTA = 13

/**
 * Diámetro del punto respecto del ancho de la gota que reemplaza.
 *
 * Se deriva del mismo ancho y no es un tamaño fijo para que el punto SIGA CODIFICANDO EL PESO: la
 * escala de tamaño es una de las tres variables del marcador, y perderla al alejarse dejaría el mapa
 * de conjunto —el que contesta "dónde está la carga"— justo sin la variable de la carga.
 *
 * 0,55 sale de igualar áreas percibidas: un disco de 55% del ancho de la gota ocupa aproximadamente la
 * misma superficie visual que ella sin su cabeza, así que el paso de una forma a la otra no se lee como
 * un salto de tamaño.
 */
export const PUNTO_SOBRE_GOTA = 0.55

/**
 * Cuánto se agranda o achica el marcador según el zoom.
 *
 * A zoom de ciudad hay 54 gotas sobre veinte cuadras y lo que importa es la MANCHA —dónde se
 * concentra cada ruta—, así que conviene que sean chicas y no se pisen. Acercándose, el espacio entre
 * puntos crece y el marcador puede crecer con él: ahí la pregunta ya es cuál es cada uno.
 *
 * Un mapa de marcadores de tamaño fijo se ve apretado lejos y perdido cerca; este es el ajuste que
 * hace cualquier mapa que se sienta bien al navegarlo.
 */
export function escalaPorZoom(zoom: number): number {
  // Recorte a [11, 16] en los dos extremos: fuera de ese tramo el ajuste dejaría de ayudar. Más lejos
  // los pines serían puntos indistinguibles; más cerca, gotas de medio bloque.
  const z = Math.min(16, Math.max(11, zoom))
  return 0.85 + ((z - 11) / 5) * 0.35
}

/**
 * Ancho del marcador según el peso de la parada.
 *
 * La raíz cuadrada NO es un detalle: hace que el ÁREA del marcador —no su ancho— sea proporcional al
 * peso. Escalando el ancho en forma lineal, una parada del doble de peso se dibuja con el CUÁDRUPLE de
 * superficie y el mapa exagera groseramente las diferencias. Es la misma regla de cualquier mapa de
 * burbujas serio.
 *
 * La escala se calcula contra el rango del conjunto VISIBLE y no contra un máximo absoluto: lo que
 * importa es distinguir las paradas entre sí en el plan que se está mirando.
 */
export function anchoPin(peso: number, minPeso: number, maxPeso: number): number {
  if (maxPeso <= minPeso) return Math.round((PIN_MIN_PX + PIN_MAX_PX) / 2)
  const t = Math.sqrt(Math.min(1, Math.max(0, (peso - minPeso) / (maxPeso - minPeso))))
  return Math.round(PIN_MIN_PX + t * (PIN_MAX_PX - PIN_MIN_PX))
}

/**
 * Percentil que cierra la escala de tamaño por arriba. Todo lo que pese más que él dibuja el marcador
 * más grande, sin estirar la escala para el resto.
 */
const PERCENTIL_TOPE = 0.9

/**
 * Rango de peso del conjunto para alimentar `anchoPin`. El techo NO es el máximo: es el percentil 90.
 *
 * POR QUÉ NO EL MÁXIMO. El marcador nunca puede crecer sin control —`anchoPin` recorta en 28 px— así
 * que un pedido gigante no rompe el mapa por su tamaño. Rompe otra cosa, más silenciosa: se lleva
 * puesta la escala de TODOS los demás. Con paradas de 177 a 2.533 kg la escala usa los 16-28 px
 * enteros; si aparece una de 50.000, esa misma población pasa a repartirse entre 16 y 19 px y el mapa
 * deja de distinguir una parada liviana de una pesada. Un solo dato atípico apaga la variable para
 * las otras cincuenta y tres.
 *
 * Cerrando en el p90, la escala se calcula con el 90% "normal" y los atípicos SATURAN arriba. Se
 * pierde poder distinguir entre dos gigantes —ambos dibujan 28 px— y eso es exactamente el intercambio
 * correcto: que dos paradas enormes se vean igual de enormes no le cuesta nada a quien planifica; que
 * cincuenta paradas se vean todas iguales, sí.
 */
export function rangoPeso(paradas: Parada[]): { min: number; max: number } {
  if (paradas.length === 0) return { min: 0, max: 0 }

  const pesos = paradas.map((p) => p.pesoTotal).sort((a, b) => a - b)
  const min = pesos[0]
  const tope = pesos[Math.min(pesos.length - 1, Math.floor(pesos.length * PERCENTIL_TOPE))]

  // Si el p90 empata con el mínimo (muchas paradas del mismo peso), cerrar ahí dejaría la escala
  // plana. Se cae al máximo real, que es el comportamiento de antes y el único que queda con rango.
  return { min, max: tope > min ? tope : pesos[pesos.length - 1] }
}

/** Trazo de una ruta: depósito → paradas en secuencia → depósito. Sin marcadores extra. */
export function trazoDeRuta(paradasDeRuta: Parada[]): [number, number][] {
  if (paradasDeRuta.length === 0) return []
  const depot: [number, number] = [DEPOSITO.lat, DEPOSITO.lng]
  return [depot, ...paradasDeRuta.map((p) => [p.lat, p.lng] as [number, number]), depot]
}
