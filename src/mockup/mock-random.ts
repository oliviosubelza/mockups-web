// Azar DETERMINISTA para el mock data.
//
// Por qué no `Math.random()`: el dataset se genera al importar el módulo, así que con azar real cada
// recarga daría otros números. Eso rompe dos cosas: las capturas a Figma dejan de ser reproducibles
// (el entregable cambia entre exports), y cualquier decisión guardada por id de pedido apuntaría a
// un pedido distinto. Con semilla fija el dataset es siempre EL MISMO, pero igual parece aleatorio.
//
// mulberry32: PRNG de 32 bits, ~10 líneas, distribución uniforme suficiente para datos de ejemplo.
// No es criptográfico y no pretende serlo.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rand {
  /** Float en [0,1). */
  next(): number
  /** Entero en [min, max], ambos incluidos. */
  int(min: number, max: number): number
  /** Float en [min, max] redondeado a `decimals`. */
  float(min: number, max: number, decimals?: number): number
  /** Un elemento del array. */
  pick<T>(items: readonly T[]): T
  /** `true` con la probabilidad dada (0..1). */
  chance(probability: number): boolean
  /** Copia mezclada (Fisher-Yates). No muta la entrada. */
  shuffle<T>(items: readonly T[]): T[]
  /**
   * Recorre `items` en orden mezclado y sin repetir hasta agotarlos; ahí vuelve a mezclar y sigue.
   * Sirve para repartir un pool parejo: con `pick` puro un nombre podría salir 5 veces y otro nunca.
   */
  cycler<T>(items: readonly T[]): () => T
}

export function createRand(seed: number): Rand {
  const next = mulberry32(seed)

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  return {
    next,
    int,
    float: (min, max, decimals = 2) => Number((min + next() * (max - min)).toFixed(decimals)),
    pick: (items) => items[int(0, items.length - 1)],
    chance: (probability) => next() < probability,
    shuffle,
    cycler: <T,>(items: readonly T[]) => {
      let bag: T[] = []
      return () => {
        if (bag.length === 0) bag = shuffle(items)
        return bag.pop() as T
      }
    },
  }
}

/**
 * Combina dos pools en nombres ÚNICOS ("Tienda" + "El Trigal" → "Tienda El Trigal"), devolviendo
 * `count` resultados sin repetir. `taken` acumula lo ya usado por otros llamados, así dos canales no
 * pueden generar el mismo nombre de cliente.
 *
 * Falla fuerte si el producto de los pools no alcanza: un mockup con clientes repetidos se ve mal y
 * además rompe los conteos de "clientes distintos" del resumen, así que es mejor enterarse acá.
 */
export function uniqueNames(
  rand: Rand,
  prefixes: readonly string[],
  names: readonly string[],
  count: number,
  taken: Set<string>
): string[] {
  const combos = rand.shuffle(prefixes.flatMap((prefix) => names.map((name) => `${prefix} ${name}`)))
  const out: string[] = []
  for (const combo of combos) {
    if (out.length === count) break
    if (taken.has(combo)) continue
    taken.add(combo)
    out.push(combo)
  }
  if (out.length < count) {
    throw new Error(
      `[mock-data] no alcanzan los nombres únicos: pedidos ${count}, disponibles ${out.length}. ` +
        `Agregá entradas a los pools (${prefixes.length} prefijos × ${names.length} nombres).`
    )
  }
  return out
}
