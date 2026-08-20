// HOLGURA: la separación mínima, en METROS, entre el borde de una zona y el de sus vecinas.
//
// QUÉ CAMBIA RESPECTO DE `solapamiento.ts`. Ese módulo contesta "¿comparten área?" (sí/no) y trata el
// borde compartido como el caso BUENO: dos zonas soldadas vértice a vértice no se solapan, así que
// pasaban la validación. Acá la regla es más estricta y es la que pidió el negocio: los contornos NO
// se tocan NUNCA. Entre dos zonas siempre queda una franja de `METROS_HOLGURA`.
//
// POR QUÉ ES MEJOR REGLA QUE "QUE NO SE SOLAPEN". Un borde exactamente compartido es correcto en
// geometría exacta y frágil en todo lo demás: el punto viaja a la base como `DECIMAL`, vuelve
// redondeado, se reproyecta, y el "mismo" vértice de las dos zonas deja de ser el mismo por unos
// micrones. De qué lado de la frontera cae un cliente pasa a depender del redondeo. Con un metro de
// separación el resultado es estable frente a cualquier redondeo razonable, y el costo es una franja
// de un metro que en la calle no existe: un metro es menos que el ancho de un cordón.
//
// TODO EL CÁLCULO VA EN METROS, no en grados ni en píxeles, y eso es a propósito:
//   · en grados, un umbral fijo sería una elipse (un grado de longitud mide menos que uno de latitud),
//     así que la holgura exigida cambiaría según la orientación del borde;
//   · en píxeles, la holgura cambiaría con el zoom — un metro es ~0,07 px a zoom 12. La holgura es una
//     propiedad del TERRITORIO, no de la pantalla, y tiene que valer lo mismo mirando de cerca o de
//     lejos. (El imantado sí va en píxeles, porque ahí lo que se mide es la puntería del mouse.)
import { autoSeCruza, puntoEnAnillo, seSolapan } from './solapamiento'
import type { LatLngTuple } from './polyline'

/** Separación mínima exigida entre los bordes de dos zonas. */
export const METROS_HOLGURA = 1

/**
 * Tolerancia al comparar contra `METROS_HOLGURA`, en metros.
 *
 * 1 cm. Existe porque el imantado deja el vértice a la holgura EXACTA y el viaje de ida y vuelta
 * (píxeles → grados → proyección local a metros) devuelve 0,999… en vez de 1. Sin la tolerancia, el
 * propio imantado produciría contornos que la validación rechaza. 1 cm es tres órdenes de magnitud más
 * que ese error y tres menos que cualquier holgura que a alguien le importe.
 */
export const TOLERANCIA_M = 0.01

/**
 * Radio medio de la Tierra (WGS84), en metros. Con la proyección equirrectangular local de acá el error
 * a escala de ciudad es de ~0,3 % — 3 mm sobre una holgura de 1 m. Irrelevante para lo que se decide.
 */
const R_TIERRA = 6371008.8
const M_POR_GRADO = (Math.PI / 180) * R_TIERRA

/** Metros por grado de longitud a esa latitud. Es lo único que hace falta corregir. */
export function metrosPorGradoLng(lat: number): number {
  return M_POR_GRADO * Math.cos((lat * Math.PI) / 180)
}

/** Metros por grado de latitud. Constante para lo que necesitamos. */
export const M_POR_GRADO_LAT = M_POR_GRADO

interface Plano {
  x: number
  y: number
}

/** Proyector equirrectangular local: `[lat, lng]` → metros, anclado a una latitud de referencia. */
function proyector(latRef: number): (p: LatLngTuple) => Plano {
  const kLng = metrosPorGradoLng(latRef)
  return ([lat, lng]) => ({ x: lng * kLng, y: lat * M_POR_GRADO_LAT })
}

function distPuntoSegmento(p: Plano, a: Plano, b: Plano): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const largo2 = dx * dx + dy * dy
  if (largo2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Distancia entre dos segmentos que NO se cruzan: el mínimo de las cuatro distancias punta-a-segmento.
 *
 * Vale solo con esa precondición, y la precondición la garantiza quien llama: si dos aristas de dos
 * contornos cerrados se cruzan de verdad, los contornos comparten área y el caso ya salió por
 * `seSolapan` antes de llegar acá.
 */
function distSegmentos(a1: Plano, a2: Plano, b1: Plano, b2: Plano): number {
  return Math.min(
    distPuntoSegmento(a1, b1, b2),
    distPuntoSegmento(a2, b1, b2),
    distPuntoSegmento(b1, a1, a2),
    distPuntoSegmento(b2, a1, a2),
  )
}

/** Aristas de un contorno. Cerrado incluye el lado que une el último punto con el primero. */
function aristas(pts: Plano[], cerrado: boolean): [Plano, Plano][] {
  const salida: [Plano, Plano][] = []
  const hasta = cerrado ? pts.length : pts.length - 1
  for (let i = 0; i < hasta; i++) salida.push([pts[i], pts[(i + 1) % pts.length]])
  return salida
}

export type TipoConflicto = 'solapa' | 'holgura'

/** Qué relación hay entre dos contornos. `metros` es la separación real entre los bordes más cercanos. */
export type Relacion =
  | { tipo: 'solapa' }
  | { tipo: 'separado'; metros: number }

/**
 * Separación entre `contorno` (abierto o cerrado) y un anillo cerrado, en metros.
 * `null` cuando alguno de los dos todavía no es geometría medible.
 *
 * Costo O(n·m). Un contorno dibujado a mano tiene decenas de vértices, así que son unos pocos miles de
 * operaciones por vecina — se puede llamar en cada cuadro de un arrastre sin que se note. Si algún día
 * hay cientos de zonas, lo que hay que agregar es un índice espacial sobre los bbox, no aproximar esto.
 */
export function relacionConAnillo(
  contorno: LatLngTuple[],
  cerrado: boolean,
  anillo: LatLngTuple[],
): Relacion | null {
  if (contorno.length === 0 || anillo.length < 3) return null

  // Cerrado y con área: comparten territorio o no, y eso se decide con el test de siempre.
  if (cerrado && contorno.length >= 3 && seSolapan(contorno, anillo)) return { tipo: 'solapa' }

  // Todavía sin cerrar: no hay área que comparar, pero un vértice DENTRO de la vecina ya anticipa el
  // solapamiento. Avisar desde el primer punto es la diferencia entre corregir un vértice y redibujar
  // la zona entera al final.
  if (!cerrado || contorno.length < 3) {
    if (contorno.some((p) => puntoEnAnillo(p, anillo) === 'dentro')) return { tipo: 'solapa' }
  }

  const latRef = (contorno[0][0] + anillo[0][0]) / 2
  const aMetros = proyector(latRef)
  const A = contorno.map(aMetros)
  const B = anillo.map(aMetros)

  // Un solo punto: la distancia es del punto al borde, sin aristas propias que recorrer.
  if (A.length === 1) {
    let min = Infinity
    for (const [b1, b2] of aristas(B, true)) min = Math.min(min, distPuntoSegmento(A[0], b1, b2))
    return { tipo: 'separado', metros: min }
  }

  let min = Infinity
  const aristasA = aristas(A, cerrado && A.length >= 3)
  const aristasB = aristas(B, true)
  for (const [a1, a2] of aristasA) {
    for (const [b1, b2] of aristasB) {
      const d = distSegmentos(a1, a2, b1, b2)
      if (d < min) min = d
      if (min === 0) return { tipo: 'separado', metros: 0 }
    }
  }
  return { tipo: 'separado', metros: min }
}

/** Un vecino que rompe la regla, con el dato que hace falta para decirlo en pantalla. */
export interface Conflicto {
  id: number
  tipo: TipoConflicto
  /** Separación medida. `null` cuando se solapan (no hay separación que informar). */
  metros: number | null
}

export interface Vecino {
  id: number
  anillo: LatLngTuple[]
}

export interface Evaluacion {
  conflictos: Conflicto[]
  /** Separación con la vecina más cercana. `null` si no hay ninguna con la que medir. */
  holguraMinima: number | null
  /** El contorno se cruza consigo mismo: sus propios bordes se tocan, así que no cumple la regla. */
  autoCruce: boolean
}

/** `true` si esa separación incumple la holgura exigida. */
export const incumple = (metros: number) => metros < METROS_HOLGURA - TOLERANCIA_M

/**
 * Evalúa un contorno contra todas sus vecinas: qué zonas rompe y cuál es la separación más chica.
 *
 * Es la función que mira la pantalla mientras se dibuja, así que devuelve las dos cosas en una sola
 * pasada: la lista para señalar en rojo y el número para mostrar en el panel.
 */
export function evaluarContorno(
  contorno: LatLngTuple[],
  cerrado: boolean,
  vecinos: Vecino[],
): Evaluacion {
  const conflictos: Conflicto[] = []
  let holguraMinima: number | null = null
  let haySolape = false

  for (const vecino of vecinos) {
    const rel = relacionConAnillo(contorno, cerrado, vecino.anillo)
    if (!rel) continue
    if (rel.tipo === 'solapa') {
      conflictos.push({ id: vecino.id, tipo: 'solapa', metros: null })
      haySolape = true
      continue
    }
    if (holguraMinima === null || rel.metros < holguraMinima) holguraMinima = rel.metros
    if (incumple(rel.metros)) conflictos.push({ id: vecino.id, tipo: 'holgura', metros: rel.metros })
  }

  return {
    conflictos,
    // Un solapamiento ES holgura cero: los bordes se cruzan, así que la separación entre ellos es 0. No
    // es un ajuste cosmético — sin esto, un contorno que pisa a una vecina y está a 45 m de otra
    // mostraría "45 m" en verde mientras el panel entero está en rojo, y el número grande (el que se
    // mira mientras se arrastra el vértice) diría exactamente lo contrario de lo que pasa.
    holguraMinima: haySolape ? 0 : holguraMinima,
    autoCruce: cerrado && contorno.length >= 3 && autoSeCruza(contorno),
  }
}

/** Par de zonas que rompe la regla. `a < b` siempre, para que el par sea único. */
export interface ParConflicto {
  a: number
  b: number
  tipo: TipoConflicto
  metros: number | null
}

/**
 * Auditoría de zonas ya guardadas: todos los pares que se pisan o que no respetan la holgura.
 *
 * Reemplaza al viejo `buscarSolapamientos`: ese solo veía las que compartían área, así que dos zonas
 * soldadas borde a borde —el resultado normal del imantado viejo— daban "todo en orden" cuando hoy son
 * exactamente el caso a corregir.
 */
export function auditarZonas(zonas: Vecino[]): ParConflicto[] {
  const pares: ParConflicto[] = []
  for (let i = 0; i < zonas.length; i++) {
    for (let j = i + 1; j < zonas.length; j++) {
      const rel = relacionConAnillo(zonas[i].anillo, true, zonas[j].anillo)
      if (!rel) continue
      const [a, b] =
        zonas[i].id < zonas[j].id ? [zonas[i].id, zonas[j].id] : [zonas[j].id, zonas[i].id]
      if (rel.tipo === 'solapa') pares.push({ a, b, tipo: 'solapa', metros: null })
      else if (incumple(rel.metros)) pares.push({ a, b, tipo: 'holgura', metros: rel.metros })
    }
  }
  return pares
}

/**
 * Distancia para leer de un vistazo. Coma decimal (es-BO) y la unidad que corresponda.
 *
 * Por debajo de 10 m van decimales porque ahí se decide algo (0,4 m incumple, 1,2 m no); por arriba
 * sobran, y a partir del kilómetro el número en metros deja de ser legible.
 */
export function formatearMetros(metros: number): string {
  if (metros >= 1000) return `${(metros / 1000).toFixed(1).replace('.', ',')} km`
  if (metros >= 10) return `${Math.round(metros)} m`
  return `${metros.toFixed(2).replace('.', ',')} m`
}
