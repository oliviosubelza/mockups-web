// Espejo de la tabla `distribution_zones`: el polígono dentro del cual una distribuidora despacha.
//
// ═══ QUÉ PREGUNTA CONTESTA, Y POR QUÉ NO ES `zones-store` ═══
//
// Son dos cortes INDEPENDIENTES del mismo territorio y no tienen por qué coincidir:
//   · `zones` (zona de reparto / logística) parte una ciudad para armar rutas → "¿con qué otras paradas
//     viaja este pedido?". Muchas zonas por ciudad, sin dueño.
//   · `distribution_zones` parte la ciudad entre DISTRIBUIDORAS → "¿quién despacha este pedido?". Una
//     zona por distribuidora, y la distribuidora es su dueña.
// Un pedido cae primero en una zona de distribución y después en una zona de reparto.
//
// ═══ LA FILA NO TIENE NOMBRE NI CIUDAD, IGUAL QUE EN LA BASE ═══
//
// El nombre de la zona es el nombre de su distribuidora y la ciudad es la de su distribuidora
// (`distributors.city_id`). Guardar copias acá sería tener dos nombres y dos ciudades para la misma cosa,
// esperando a divergir: una zona que dice "Montero" con una dueña en "Warnes" no tiene forma de
// resolverse. Se derivan al leer, con `zonasComoZonaLogistica`.
//
// ═══ VARIAS ZONAS POR DISTRIBUIDORA ═══
//
// Arrancó como una sola, con `guardarZona` reemplazando la fila viva y un `UNIQUE (distributor_id)` en
// la base. No alcanza: un territorio de reparto no siempre es una mancha conexa. Un centro atiende un
// cuadrante Y un par de barrios sueltos del otro lado del río, y con un polígono único hay que estirar
// el contorno por el medio de la zona del vecino para poder llegar — momento en el que el polígono
// deja de decir la verdad sobre quién despacha qué.
//
// Por eso `guardarZona` recibe un `zonaId` OPCIONAL: con id actualiza esa fila, sin id inserta una
// nueva. Es una sola operación y no un `add` más un `update` separados, por el mismo motivo de
// siempre: dos funciones son dos lugares donde arreglar la misma regla.
//
// LO QUE SIGUE PROHIBIDO ES EL SOLAPE entre distribuidoras DISTINTAS —un pedido del solape tendría dos
// despachantes—. Eso no lo puede sostener ninguna restricción declarativa: es geometría, y vive en la
// pantalla que dibuja. Entre zonas de la MISMA distribuidora el solape es inofensivo: las dos llevan
// al mismo despachante.
import { create } from 'zustand'
import { DISTRIBUIDORAS } from '../mock-data'
import {
  latLngAPoligono,
  poligonoALatLng,
  type Zona,
  type ZonaPoligonoGeoJson,
} from '../zones-store'
import type { LatLngTuple } from '../map/geo/polyline'
import { useDistribuidorasStore } from './distribuidoras-store'

const STORAGE_KEY = 'mockups-web:centros-distribucion-v5'
const LOCAL_USER = 'mockup'

/** Espejo de la fila `distribution_zones`. Sin `name` ni `city_id`: ver el encabezado. */
export interface ZonaDistribucion {
  id: number
  distributorId: number
  /**
   * En la base es `GEOMETRY(Polygon, 4326)`, el mismo tipo que `zones.polygon` en `db_script.sql`; acá
   * viaja como GeoJSON porque es lo que el editor produce y lo que Leaflet consume. La conversión la hace
   * el backend (`ST_GeomFromGeoJSON`), no el mockup: inventar acá un tipo "PostGIS" sería inventar un
   * formato que nadie va a mandar por la red.
   */
  polygonGeoJson: ZonaPoligonoGeoJson
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  isActive: boolean
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Semilla VACÍA: los contornos los dibuja el usuario.
 *
 * ═══ HUBO UNA SEMILLA, Y SE FUE ═══
 *
 * Por un momento esto devolvió un contorno por distribuidora, calculado como la envolvente convexa de
 * sus propios pedidos. Resolvía el arranque en frío —la pantalla se veía funcionando sin preparar
 * nada— pero traía un problema peor: envolventes CALCULADAS de nubes vecinas se pisan, y un territorio
 * que se superpone con el de al lado no significa nada (un pedido del solape tiene dos despachantes).
 * Dibujarlos a mano es además el flujo que la pantalla de zonas de distribución existe para ofrecer, y
 * un contorno ya puesto se lo saltea.
 *
 * QUÉ PASA MIENTRAS NO HAY NINGUNO, y por qué está bien: un centro sin contorno recibe los pedidos que
 * traen su sello (`Pedido.distribuidoraId`), así que las diez distribuidoras arrancan con ~66 cada una
 * y el planificador funciona desde el primer minuto. Al dibujarle el contorno a una, su plan pasa a
 * ser lo que cae adentro. Ver `matchesNarrowing` en `dispatch-plan-store`.
 */
function semillaZonas(): ZonaDistribucion[] {
  return []
}

function readStored(): ZonaDistribucion[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const inicial = semillaZonas()
      writeStored(inicial)
      return inicial
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ZonaDistribucion[]) : semillaZonas()
  } catch {
    return semillaZonas()
  }
}

function writeStored(zonas: ZonaDistribucion[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(zonas))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zonas))
  } catch {
    // Storage deshabilitado: la sesión sigue en memoria vía Zustand.
  }
}

interface DistribucionState {
  zonas: ZonaDistribucion[]
  /**
   * Alta y edición en UNA operación. Con `zonaId` actualiza esa fila; sin él, inserta una zona más
   * para esa distribuidora. Ver el encabezado.
   */
  guardarZona: (
    distributorId: number,
    puntos: LatLngTuple[],
    zonaId?: number | null,
  ) => ZonaDistribucion | null
  setZonaActiva: (id: number, isActive: boolean) => void
  /** Borrado LÓGICO: la distribuidora queda sin zona y se le puede dibujar otra. */
  removeZona: (id: number) => void
  resetZonas: () => void
}

export const useDistribucionStore = create<DistribucionState>((set, get) => ({
  zonas: readStored(),

  guardarZona: (distributorId, puntos, zonaId) => {
    const polygonGeoJson = latLngAPoligono(puntos)
    if (!polygonGeoJson) return null

    const actuales = get().zonas
    const ahora = nowIso()
    // Se busca POR ID y ya no por distribuidora: con varias zonas vivas, "la de esta distribuidora"
    // dejó de identificar una fila.
    const existente =
      zonaId != null ? actuales.find((z) => z.id === zonaId && z.deletedAt === null) : undefined

    if (existente) {
      const actualizada: ZonaDistribucion = {
        ...existente,
        polygonGeoJson,
        updatedBy: LOCAL_USER,
        updatedAt: ahora,
      }
      const siguientes = actuales.map((z) => (z.id === existente.id ? actualizada : z))
      writeStored(siguientes)
      set({ zonas: siguientes })
      return actualizada
    }

    const nueva: ZonaDistribucion = {
      // El id sale del máximo de TODAS las filas, incluidas las borradas lógicamente: reusar el id de
      // una eliminada haría que dos registros distintos compartan clave en el historial.
      id: actuales.reduce((max, z) => Math.max(max, z.id), 0) + 1,
      distributorId,
      polygonGeoJson,
      createdBy: LOCAL_USER,
      updatedBy: LOCAL_USER,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
      isActive: true,
    }
    const siguientes = [...actuales, nueva]
    writeStored(siguientes)
    set({ zonas: siguientes })
    return nueva
  },

  setZonaActiva: (id, isActive) => {
    const siguientes = get().zonas.map((z) =>
      z.id === id ? { ...z, isActive, updatedBy: LOCAL_USER, updatedAt: nowIso() } : z,
    )
    writeStored(siguientes)
    set({ zonas: siguientes })
  },

  removeZona: (id) => {
    const ahora = nowIso()
    const siguientes = get().zonas.map((z) =>
      z.id === id ? { ...z, deletedAt: ahora, updatedBy: LOCAL_USER, updatedAt: ahora } : z,
    )
    writeStored(siguientes)
    set({ zonas: siguientes })
  },

  resetZonas: () => {
    const inicial = semillaZonas()
    writeStored(inicial)
    set({ zonas: inicial })
  },
}))

/**
 * Un color por distribuidora, en el orden en que aparecen en su ciudad.
 *
 * ACÁ Y NO EN `DistribucionWorkspaceView` porque `PlannerMapa` necesita la MISMA paleta: dibuja los
 * mismos contornos —un plan puede tener dos centros a la vez desde que existe `activeDistribuidoraIds`
 * (ver `dispatch-plan-store`)— y si cada pantalla inventara la suya, la Discruz verde de una sería la
 * Discruz fucsia de la otra. Peor: con dos o más centros en el MISMO plan, sin colores distintos sus
 * contornos se pisan en un solo verde y no hay forma de saber cuál es cuál — que es exactamente lo que
 * pasaba antes de que esto existiera.
 *
 * Verde primero porque es el color con el que la pantalla de distribución ya se identificaba cuando
 * había una sola paleta. Ninguno es azul: ese es el de las zonas LOGÍSTICAS, que el planificador dibuja
 * de fondo sobre el mismo mapa, y dos particiones distintas del territorio no pueden compartir color.
 */
export const PALETA_DISTRIBUIDORAS = [
  '#059669', // esmeralda
  '#c026d3', // fucsia
  '#ea580c', // naranja
  '#0891b2', // cian
  '#65a30d', // lima
  '#9333ea', // violeta
]

/**
 * Arma el mapa id → color de `PALETA_DISTRIBUIDORAS`, en el orden en que vienen las distribuidoras.
 *
 * POR POSICIÓN Y NO POR ID: así la primera distribuidora de la lista que se le pase es siempre del
 * mismo color y la paleta no cambia de orden si un id es más alto que otro por casualidad de alta.
 */
export const colorPorDistribuidora = (ids: number[]): Map<number, string> => {
  const porId = new Map<number, string>()
  ids.forEach((id, i) => porId.set(id, PALETA_DISTRIBUIDORAS[i % PALETA_DISTRIBUIDORAS.length]))
  return porId
}

/** TODAS las zonas vivas de una distribuidora. Es la consulta que hace toda la pantalla. */
export const zonasDeDistribuidora = (
  zonas: ZonaDistribucion[],
  distributorId: number,
): ZonaDistribucion[] =>
  zonas.filter((z) => z.distributorId === distributorId && z.deletedAt === null)

/** Los vértices de TODAS las zonas de una distribuidora, una lista de anillos. */
export const anillosDeDistribuidora = (
  zonas: ZonaDistribucion[],
  distributorId: number,
): LatLngTuple[][] =>
  zonasDeDistribuidora(zonas, distributorId)
    .map(puntosDeZona)
    .filter((anillo) => anillo.length >= 3)

/**
 * Adapta las filas al shape de `Zona` para poder reusar `ZonasLayer` sin tocarlo.
 *
 * LA ADAPTACIÓN VA ACÁ Y NO EN LA FILA. `ZonasLayer` pide `name` y `cityId`, que esta tabla
 * deliberadamente no tiene; derivarlos en el borde —una función pura, en el momento de dibujar— es lo que
 * permite reusar la capa, el menú de aspecto y los paneles de conflicto tal como están, sin meter en el
 * modelo dos campos que en la base no existen. El `id` que se expone es el de la ZONA y no el de la
 * distribuidora: es lo que la capa usa como clave de React y de selección.
 */
export function zonasComoZonaLogistica(zonas: ZonaDistribucion[]): Zona[] {
  const maestras = useDistribuidorasStore.getState().distribuidoras
  return zonas
    .filter((z) => z.deletedAt === null)
    .map((z) => {
      const dueñaMaestra = maestras.find((d) => d.id === z.distributorId)
      const dueñaConstante = DISTRIBUIDORAS.find((d) => d.id === z.distributorId)
      return {
        id: z.id,
        name: dueñaMaestra?.name ?? dueñaConstante?.nombre ?? `Distribuidora ${z.distributorId}`,
        polygonGeoJson: z.polygonGeoJson,
        cityId: dueñaMaestra?.cityId ?? dueñaConstante?.cityId ?? 0,
        createdBy: z.createdBy,
        updatedBy: z.updatedBy,
        createdAt: z.createdAt,
        updatedAt: z.updatedAt,
        deletedAt: z.deletedAt,
        isActive: z.isActive,
      }
    })
}

/** Los vértices de una zona, listos para el editor. Reusa el conversor de `zones-store`. */
export const puntosDeZona = (zona: ZonaDistribucion | undefined): LatLngTuple[] =>
  zona ? poligonoALatLng(zona.polygonGeoJson) : []
