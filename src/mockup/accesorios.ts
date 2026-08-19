// BANDEO: lo que el camión se lleva y que NO es mercadería — pallets, carritos de carga ("burritos"),
// y mañana refrigeradores. Se agrega en la planificación y se controla al volver: la pregunta que hoy
// no tiene respuesta en el sistema es "salió con 12 pallets, ¿volvió con 12?".
//
// POR QUÉ NO ENTRA EN `truck_inventories`. Esa tabla ya hace exactamente esta mecánica
// (`expected_qty` vs `loaded_qty` vs `variance_qty`), pero su clave es `product_id`: un pallet no es
// un producto y meterlo ahí ensucia el catálogo de venta. Y además le falta la mitad del problema:
// `truck_inventories` registra la CARGA, no el retorno. El bandeo necesita las dos puntas.
//
// UN SOLO CATÁLOGO, NO DOS MODELOS. Los pallets y los burritos no están registrados en ningún lado
// (son fungibles: doce pallets son doce pallets); los refrigeradores viven en SAP y cada uno tiene su
// código. Eso NO son dos entidades distintas — es un tipo de accesorio con una bandera de
// trazabilidad. El día que Activos Fijos entregue los refrigeradores se agrega una fila al catálogo
// con `trazabilidad: 'serie'` y no se rehace nada.

/**
 * Cómo se cuenta lo que salió y lo que volvió.
 *
 *   · `cantidad` → un número. "Salió con 12, volvió con 10, faltan 2." No se sabe CUÁLES dos, y no
 *                  importa: son intercambiables.
 *   · `serie`    → una lista de códigos. Se sabe exactamente cuál no volvió, porque cada unidad es un
 *                  activo fijo con número propio.
 */
export type TrazabilidadAccesorio = 'cantidad' | 'serie'

/** De dónde sale el padrón de unidades. Los `sap` no los damos de alta nosotros: los consultamos. */
export type OrigenAccesorio = 'propio' | 'sap'

export interface TipoAccesorio {
  id: string
  /** Singular, para "1 pallet". */
  nombre: string
  /** Plural, para "12 pallets". El español no lo deriva bien solo con una `s` en todos los casos. */
  plural: string
  trazabilidad: TrazabilidadAccesorio
  origen: OrigenAccesorio
  /**
   * Peso y volumen de UNA unidad.
   *
   * DECLARADOS PERO NO USADOS por la ocupación de la ruta. Un pallet ocupa lugar de verdad, así que
   * en algún momento va a tener que descontar de la capacidad del camión — pero encenderlo cambia el
   * número que hoy decide si una ruta sale o no, y esa decisión todavía no está tomada. Están acá
   * para que el día que se tome sea prender el cálculo y no migrar datos.
   *
   * Ver `pesoAccesoriosKg` / `volumenAccesoriosM3` más abajo: el cálculo ya existe, nadie lo llama.
   */
  pesoUnitarioKg?: number
  volumenUnitarioM3?: number
  /** Aclaración para la UI cuando el tipo tiene una particularidad (que vuelve siempre, que es de SAP). */
  nota?: string
}

/**
 * Catálogo de tipos. Hoy es una constante: no hay tabla de accesorios en el esquema ni pantalla de
 * dato maestro, y los que existen son tres. Cuando haya backend, esto se reemplaza por un fetch y
 * nada más — el resto del módulo ya trabaja contra `TipoAccesorio`, no contra estas filas.
 */
export const TIPOS_ACCESORIO: TipoAccesorio[] = [
  {
    id: 'pallet',
    nombre: 'Pallet',
    plural: 'Pallets',
    trazabilidad: 'cantidad',
    origen: 'propio',
    pesoUnitarioKg: 25,
    volumenUnitarioM3: 0.12,
  },
  {
    id: 'burrito',
    nombre: 'Carrito de carga',
    plural: 'Carritos de carga',
    trazabilidad: 'cantidad',
    origen: 'propio',
    pesoUnitarioKg: 18,
    volumenUnitarioM3: 0.35,
    nota: 'También "burrito". No está registrado en ningún padrón: se cuenta, no se identifica.',
  },
  {
    id: 'jaba',
    nombre: 'Jaba',
    plural: 'Jabas',
    trazabilidad: 'cantidad',
    origen: 'propio',
    pesoUnitarioKg: 2,
    volumenUnitarioM3: 0.04,
  },
  {
    id: 'refrigerador',
    nombre: 'Refrigerador',
    plural: 'Refrigeradores',
    trazabilidad: 'serie',
    origen: 'sap',
    pesoUnitarioKg: 45,
    volumenUnitarioM3: 0.9,
    nota: 'Activo fijo de SAP: cada unidad va con su código, no por cantidad.',
  },
]

export const tipoAccesorio = (tipoId: string): TipoAccesorio | undefined =>
  TIPOS_ACCESORIO.find((t) => t.id === tipoId)

/**
 * Un tipo de accesorio cargado en una ruta.
 *
 * `retorno` nace en `null` y se queda así toda la planificación: acá se declara con QUÉ sale el
 * camión, no con qué vuelve. Lo llena el cierre del viaje. Vive igual en esta estructura y no en otra
 * porque la comparación "salió N / volvió M" pierde sentido si las dos mitades viven separadas — que
 * es justo el problema de `truck_inventories`, que solo tiene la mitad de la carga.
 */
export interface AccesorioRuta {
  tipoId: string
  /** Unidades que se cargan. En los tipos `serie` es, por definición, `series.length`. */
  salida: number
  /** Unidades devueltas al volver. `null` = el camión todavía no cerró. */
  retorno: number | null
  /** Códigos de las unidades, solo en tipos `serie`. Vacío en los que se cuentan por cantidad. */
  series: string[]
}

/** Accesorios por id de ruta. Fuera de la ruta, por lo mismo que `asignaciones`: las rutas se rederivan. */
export type AccesoriosPorRuta = Record<string, AccesorioRuta[]>

/** Crea la entrada de un tipo con la cantidad pedida. Centralizado para que `salida` y `series` no se separen. */
export function nuevoAccesorio(tipo: TipoAccesorio, salida: number, series: string[] = []): AccesorioRuta {
  return {
    tipoId: tipo.id,
    salida: tipo.trazabilidad === 'serie' ? series.length : salida,
    retorno: null,
    series: tipo.trazabilidad === 'serie' ? series : [],
  }
}

/**
 * Suma de unidades de la ruta. Es el número del badge: "17 accesorios".
 *
 * Sumar pallets con refrigeradores es válido acá y SOLO acá: la pregunta que responde es "¿esta ruta
 * lleva algo además de mercadería?", no "cuánto". El desglose por tipo está a un click.
 */
export const totalAccesorios = (items: AccesorioRuta[]): number =>
  items.reduce((suma, item) => suma + item.salida, 0)

/** "12 pallets · 3 carritos de carga". Lo que se lee sin abrir nada. */
export function resumenAccesorios(items: AccesorioRuta[]): string {
  return items
    .filter((item) => item.salida > 0)
    .map((item) => {
      const tipo = tipoAccesorio(item.tipoId)
      if (!tipo) return `${item.salida} ?`
      return `${item.salida} ${item.salida === 1 ? tipo.nombre.toLowerCase() : tipo.plural.toLowerCase()}`
    })
    .join(' · ')
}

/**
 * Peso y volumen que el bandeo le come al camión.
 *
 * NADIE LLAMA A ESTAS DOS FUNCIONES todavía, a propósito: ver el comentario de `pesoUnitarioKg`. Se
 * escriben ahora porque el criterio (un tipo sin peso declarado suma cero, no rompe) es parte del
 * modelo, y decidirlo el día que se encienda el cálculo es decidirlo apurado.
 */
export const pesoAccesoriosKg = (items: AccesorioRuta[]): number =>
  items.reduce((suma, item) => suma + item.salida * (tipoAccesorio(item.tipoId)?.pesoUnitarioKg ?? 0), 0)

export const volumenAccesoriosM3 = (items: AccesorioRuta[]): number =>
  items.reduce(
    (suma, item) => suma + item.salida * (tipoAccesorio(item.tipoId)?.volumenUnitarioM3 ?? 0),
    0,
  )

/**
 * Faltante al cerrar el viaje: `salida - retorno` por tipo. Devuelve solo los que no cuadran.
 *
 * Vive acá y no en el módulo de cierre porque es la definición del bandeo, no un detalle de esa
 * pantalla: si mañana el faltante también se mira desde monitoreo, la resta tiene que ser la misma.
 * Un `retorno` en `null` NO es faltante — es "todavía no volvió", y confundir las dos cosas haría que
 * todo camión en la calle apareciera como pérdida.
 */
export function faltantesAccesorios(items: AccesorioRuta[]): { tipoId: string; faltan: number }[] {
  return items
    .filter((item) => item.retorno !== null && item.retorno < item.salida)
    .map((item) => ({ tipoId: item.tipoId, faltan: item.salida - (item.retorno ?? 0) }))
}
