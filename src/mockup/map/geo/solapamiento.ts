// Detección de SOLAPAMIENTO entre anillos de polígono.
//
// QUÉ RESPONDE Y QUÉ NO. Responde "¿estas dos zonas se pisan?" (sí/no). NO calcula el área de la
// intersección. Calcular la intersección exacta de dos polígonos CÓNCAVOS necesita un algoritmo de
// recorte de verdad —Greiner-Hormann o Martínez— o una dependencia nueva, y para lo que hace falta acá
// (avisarle al que dibuja que se montó sobre la vecina, y listar los pares en conflicto) alcanza con
// saber que se pisan y resaltar las dos zonas.
//
// EL PROBLEMA CENTRAL: COMPARTIR UN BORDE NO ES SOLAPARSE.
// Con el imantado prendido, dos zonas vecinas comparten vértices y aristas EXACTOS — es justamente el
// objetivo. Un test de intersección ingenuo diría que cada vecina se solapa con cada vecina, o sea que
// avisaría siempre y no serviría para nada. De ahí las dos precauciones de todo el módulo:
//   · solo cuenta el cruce PROPIO de dos aristas (se cortan en un punto interior de ambas), no el
//     contacto en un extremo compartido ni el solape colineal de dos bordes pegados;
//   · un vértice sobre el borde de la otra zona NO es prueba de nada: tiene que estar ESTRICTAMENTE
//     adentro.
import type { LatLngTuple } from './polyline'

/**
 * Tolerancia en grados para decidir "este punto está sobre este borde".
 *
 * ~1e-9 grados es del orden de 0,1 mm: enorme al lado del error de coma flotante que deja la proyección
 * del imantado (que trabaja en píxeles y vuelve a grados), y ridículamente chico al lado de cualquier
 * solapamiento real, que se mide en metros. Ese hueco de varios órdenes de magnitud es lo que hace que
 * el umbral no necesite calibrarse.
 */
const EPS = 1e-9

type Punto = { x: number; y: number }

/** Se trabaja en `x = lng`, `y = lat`. Los tests son todos de signo y de orden, así que la distorsión
 *  de no proyectar no cambia ningún resultado: un cruce es un cruce en cualquier sistema afín. */
const aPunto = ([lat, lng]: LatLngTuple): Punto => ({ x: lng, y: lat })

const cruz = (o: Punto, a: Punto, b: Punto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Distancia de `p` al segmento `a-b`, con `t` recortado para no medir contra la recta infinita. */
function distanciaASegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const largo2 = dx * dx + dy * dy
  if (largo2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Cruce PROPIO de dos segmentos: se cortan en un punto que es interior a los dos.
 *
 * Los cuatro signos tienen que ser estrictos. Con `<= 0` entrarían los casos de contacto —un extremo de
 * un segmento apoyado en el otro, o dos bordes colineales pegados— que es exactamente lo que produce el
 * imantado entre zonas vecinas. Eso NO es solaparse: es compartir el límite.
 */
function seCruzan(p1: Punto, p2: Punto, q1: Punto, q2: Punto): boolean {
  const d1 = cruz(q1, q2, p1)
  const d2 = cruz(q1, q2, p2)
  const d3 = cruz(p1, p2, q1)
  const d4 = cruz(p1, p2, q2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** `true` si `p` cae sobre el contorno de `anillo` (dentro de `EPS`). */
function enElBorde(p: Punto, anillo: Punto[]): boolean {
  for (let i = 0; i < anillo.length; i++) {
    if (distanciaASegmento(p, anillo[i], anillo[(i + 1) % anillo.length]) <= EPS) return true
  }
  return false
}

/** Ray casting par-impar. El resultado sobre el borde es inestable por definición, así que quien llama
 *  descarta antes esos puntos con `enElBorde`. */
function adentro(p: Punto, anillo: Punto[]): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const a = anillo[i]
    const b = anillo[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      dentro = !dentro
    }
  }
  return dentro
}

/** Estrictamente adentro: ni afuera, ni apoyado en el borde. */
const adentroEstricto = (p: Punto, anillo: Punto[]) => !enElBorde(p, anillo) && adentro(p, anillo)

const bbox = (a: Punto[]) => ({
  x0: Math.min(...a.map((p) => p.x)),
  x1: Math.max(...a.map((p) => p.x)),
  y0: Math.min(...a.map((p) => p.y)),
  y1: Math.max(...a.map((p) => p.y)),
})

/**
 * `true` si los dos anillos comparten ÁREA. Compartir solo un borde o un vértice devuelve `false`.
 *
 * Costo O(n·m). Con las decenas de vértices por zona que se dibujan a mano es nada; si algún día son
 * cientos de zonas, el paso siguiente es un índice espacial sobre los bbox, no cambiar este test.
 */
export function seSolapan(anilloA: LatLngTuple[], anilloB: LatLngTuple[]): boolean {
  if (anilloA.length < 3 || anilloB.length < 3) return false
  const A = anilloA.map(aPunto)
  const B = anilloB.map(aPunto)

  // Descarte por caja: dos zonas de puntas opuestas de la ciudad no pueden pisarse, y salen con cuatro
  // comparaciones en vez de n·m.
  const ca = bbox(A)
  const cb = bbox(B)
  if (ca.x1 < cb.x0 || cb.x1 < ca.x0 || ca.y1 < cb.y0 || cb.y1 < ca.y0) return false

  // Un vértice de una ESTRICTAMENTE dentro de la otra ya es área compartida. Va primero porque cubre el
  // caso de una zona contenida entera en otra, donde ninguna arista se cruza.
  if (A.some((p) => adentroEstricto(p, B))) return true
  if (B.some((p) => adentroEstricto(p, A))) return true

  // Aristas que se cortan de verdad: dos contornos que se atraviesan sin que ningún vértice quede
  // adentro (dos rectángulos en cruz, por ejemplo).
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i]
    const a2 = A[(i + 1) % A.length]
    for (let j = 0; j < B.length; j++) {
      if (seCruzan(a1, a2, B[j], B[(j + 1) % B.length])) return true
    }
  }
  return false
}

/** Par de ids en conflicto. Siempre `[menor, mayor]` para que el par sea único. */
export type ParSolapado = [number, number]

/** Todos los pares que se pisan, comparando cada zona con las siguientes (nunca dos veces el mismo par). */
export function buscarSolapamientos(zonas: { id: number; anillo: LatLngTuple[] }[]): ParSolapado[] {
  const pares: ParSolapado[] = []
  for (let i = 0; i < zonas.length; i++) {
    for (let j = i + 1; j < zonas.length; j++) {
      if (seSolapan(zonas[i].anillo, zonas[j].anillo)) {
        const [a, b] = [zonas[i].id, zonas[j].id]
        pares.push(a < b ? [a, b] : [b, a])
      }
    }
  }
  return pares
}
