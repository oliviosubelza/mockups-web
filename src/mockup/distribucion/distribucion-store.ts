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
// ═══ UNA SOLA ZONA VIVA POR DISTRIBUIDORA ═══
//
// En la base lo hace cumplir un `UNIQUE (distributor_id) WHERE deleted_at IS NULL`, y no la FK: una FK
// sola admite veinte polígonos para la misma distribuidora, que es justo el estado que esta tabla existe
// para impedir. Acá se sostiene igual: `guardarZona` busca la fila viva de esa distribuidora y la
// REEMPLAZA en vez de insertar otra. No hay un `addZona` separado del `updateZona` a propósito — tener
// los dos era la forma de que alguien llamara al primero dos veces.
import { create } from 'zustand'
import type { LatLngTuple } from '../map/geo/polyline'
import { DISTRIBUIDORAS } from '../mock-data'
import { latLngAPoligono, poligonoALatLng, type Zona, type ZonaPoligonoGeoJson } from '../zones-store'

const STORAGE_KEY = 'mockup-zonas-distribucion-v1'
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
 * Lo que haya guardado, o la lista VACÍA. Sin seed, mismo criterio que `zones-store`: la pantalla abre en
 * blanco y la primera acción ya es dibujar.
 *
 * OJO CON EL ARRAY VACÍO, y es la misma trampa que allá: `raw === null` es "nunca escribió nada" y un
 * `[]` parseado es "escribió que no hay ninguna". Hoy las dos devuelven lo mismo; si algún día vuelve un
 * seed tiene que colgar SOLO de `raw === null` y nunca del largo del array, porque si no recargar te
 * devuelve las zonas que acabás de borrar.
 */
function readStored(): ZonaDistribucion[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as ZonaDistribucion[]
  } catch {
    return []
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
  /** Alta y edición en UNA operación: hay a lo sumo una zona viva por distribuidora. Ver el encabezado. */
  guardarZona: (distributorId: number, puntos: LatLngTuple[]) => ZonaDistribucion | null
  setZonaActiva: (id: number, isActive: boolean) => void
  /** Borrado LÓGICO: la distribuidora queda sin zona y se le puede dibujar otra. */
  removeZona: (id: number) => void
}

export const useDistribucionStore = create<DistribucionState>((set, get) => ({
  zonas: readStored(),

  guardarZona: (distributorId, puntos) => {
    const polygonGeoJson = latLngAPoligono(puntos)
    if (!polygonGeoJson) return null

    const actuales = get().zonas
    const ahora = nowIso()
    const existente = actuales.find((z) => z.distributorId === distributorId && z.deletedAt === null)

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
      // El id sale del máximo de TODAS las filas, incluidas las borradas lógicamente: reusar el id de una
      // eliminada haría que dos registros distintos compartan clave en el historial.
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
}))

/** La zona viva de una distribuidora, o `undefined`. Es la consulta que hace toda la pantalla. */
export const zonaDeDistribuidora = (
  zonas: ZonaDistribucion[],
  distributorId: number,
): ZonaDistribucion | undefined =>
  zonas.find((z) => z.distributorId === distributorId && z.deletedAt === null)

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
  return zonas
    .filter((z) => z.deletedAt === null)
    .map((z) => {
      const dueña = DISTRIBUIDORAS.find((d) => d.id === z.distributorId)
      return {
        id: z.id,
        name: dueña?.nombre ?? `Distribuidora ${z.distributorId}`,
        polygonGeoJson: z.polygonGeoJson,
        cityId: dueña?.cityId ?? 0,
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
