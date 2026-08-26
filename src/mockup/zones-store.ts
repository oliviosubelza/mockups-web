// Store de ZONAS de reparto (tabla `zones`). Dato maestro, no de un plan: se crea una vez por
// ciudad y después la usan muchos planes, así que vive fuera del `dispatch-plan-store`/`planner-store`
// (que son del PLAN activo) — mismo criterio que `planes-store` con los planes guardados.
//
// El polígono se guarda en el mismo formato que la columna `polygon_geojson` (GeoJSON, anillo en
// `[lng, lat]`) para que lo que sale de acá sea literalmente el payload que un día viaja al backend.
// Leaflet trabaja en `[lat, lng]`, así que la conversión vive en dos funciones chicas (`aLatLng` /
// `aGeoJson`) y el resto de la pantalla no vuelve a tocar el orden de las coordenadas.
import { create } from 'zustand'
import type { CiudadId } from './mock-data'
import type { LatLngTuple } from './map/geo/polyline'

// Key nueva y semántica: no se migra `mockups-web:zonas:v5` porque ese esquema admitía filas
// `tipo='restringida'`. Copiarlo o filtrarlo silenciosamente haría pasar datos ambiguos al maestro
// logístico. El agregado independiente de restricciones usa su propia key.
const STORAGE_KEY = 'mockups-web:logistic-zones:v1'
const USUARIO_MOCK = 'Juan Pérez'

export interface ZonaPoligonoGeoJson {
  type: 'Polygon'
  /** Anillos en `[lng, lat]` (GeoJSON), el primero cerrado (repite el primer vértice al final). */
  coordinates: [number, number][][]
}

/** Espejo de la fila `zones` de la base. */
export interface Zona {
  id: number
  name: string
  polygonGeoJson: ZonaPoligonoGeoJson | null
  cityId: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  isActive: boolean
}

/** GeoJSON `[lng, lat]` (anillo cerrado) → Leaflet `[lat, lng]` (abierto, sin repetir el primero). */
export function poligonoALatLng(polygon: ZonaPoligonoGeoJson | null): LatLngTuple[] {
  const anillo = polygon?.coordinates?.[0] ?? []
  const abierto =
    anillo.length > 1 &&
    anillo[0][0] === anillo[anillo.length - 1][0] &&
    anillo[0][1] === anillo[anillo.length - 1][1]
      ? anillo.slice(0, -1)
      : anillo
  return abierto.map(([lng, lat]) => [lat, lng])
}

/** Leaflet `[lat, lng]` (abierto) → GeoJSON `[lng, lat]` (anillo cerrado). `null` si no alcanza a ser polígono. */
export function latLngAPoligono(puntos: LatLngTuple[]): ZonaPoligonoGeoJson | null {
  if (puntos.length < 3) return null
  const anillo = puntos.map(([lat, lng]) => [lng, lat] as [number, number])
  anillo.push(anillo[0])
  return { type: 'Polygon', coordinates: [anillo] }
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Centro aproximado de cada ciudad. Es a DÓNDE MIRA el editor al abrirse, y con la lista vacía pasó a ser
 * lo único que hay: sin zonas guardadas no hay nada que encuadrar, así que este punto es la diferencia
 * entre abrir sobre Santa Cruz y abrir sobre el Atlántico en zoom de continente.
 */
export const CIUDAD_CENTRO: Record<CiudadId, LatLngTuple> = {
  santacruz: [-17.783, -63.182],
  montero: [-17.339, -63.25],
  warnes: [-17.517, -63.167],
  laguardia: [-17.917, -63.233],
  cotoca: [-17.817, -63.033],
}

/**
 * Lo que haya guardado, o la lista VACÍA. Ya no hay zonas de ejemplo: la pantalla abre en blanco y las
 * dibuja el usuario. El seed existía para que `/zonas` tuviera algo que mostrar cuando era una tabla; con
 * el editor de mapa la primera acción ya es dibujar, y siete cuadrados ajenos ocupando el centro de Santa
 * Cruz son siete cosas que hay que borrar antes de empezar.
 *
 * OJO CON EL ARRAY VACÍO — es lo único delicado que quedó acá. Con seed, `[]` significaba "no hay nada
 * guardado" y disparaba la resiembra; sin seed, `[]` es un estado LEGÍTIMO y frecuente: el que borró su
 * última zona. Tratarlo como antes sería el peor bug posible de esta pantalla —recargar te devuelve las
 * zonas que acabás de eliminar, y la única salida es volver a eliminarlas—, así que las dos situaciones
 * están explícitamente separadas: `raw === null` es "nunca escribió nada" y un `[]` parseado es "escribió
 * que no hay ninguna". Hoy las dos devuelven lo mismo y por eso el código es una sola línea; si algún día
 * vuelve un seed, tiene que colgar SOLO de `raw === null` y nunca del largo del array.
 */
function readStoredZonas(): Zona[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as Zona[]
  } catch {
    return []
  }
}

function writeStoredZonas(zonas: Zona[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(zonas))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zonas))
  } catch {
    // Storage deshabilitado: la sesión sigue en memoria vía Zustand.
  }
}

export interface ZonaInput {
  name: string
  cityId: number
  polygonGeoJson: ZonaPoligonoGeoJson
}

interface ZonesState {
  zonas: Zona[]
  addZona: (input: ZonaInput) => Zona
  updateZona: (id: number, input: ZonaInput) => void
  setZonaActiva: (id: number, isActive: boolean) => void
  removeZona: (id: number) => void
}

export const useZonesStore = create<ZonesState>((set, get) => ({
  zonas: readStoredZonas(),

  addZona: (input) => {
    const actuales = get().zonas
    const nextId = actuales.reduce((max, z) => Math.max(max, z.id), 0) + 1
    const ahora = nowIso()
    const nueva: Zona = {
      id: nextId,
      name: input.name,
      polygonGeoJson: input.polygonGeoJson,
      cityId: input.cityId,
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
      isActive: true,
    }
    const updated = [nueva, ...actuales]
    writeStoredZonas(updated)
    set({ zonas: updated })
    return nueva
  },

  updateZona: (id, input) => {
    const updated = get().zonas.map((z) =>
      z.id === id
        ? {
            ...z,
            name: input.name,
            cityId: input.cityId,
            polygonGeoJson: input.polygonGeoJson,
            updatedBy: USUARIO_MOCK,
            updatedAt: nowIso(),
          }
        : z,
    )
    writeStoredZonas(updated)
    set({ zonas: updated })
  },

  setZonaActiva: (id, isActive) => {
    const updated = get().zonas.map((z) =>
      z.id === id ? { ...z, isActive, updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : z,
    )
    writeStoredZonas(updated)
    set({ zonas: updated })
  },

  // Soft delete, como la columna `deleted_at` de la tabla: la zona sale de los listados activos
  // pero el registro se conserva (un plan viejo puede seguir señalando a esta zona por id).
  removeZona: (id) => {
    const updated = get().zonas.map((z) =>
      z.id === id ? { ...z, isActive: false, deletedAt: nowIso(), updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : z,
    )
    writeStoredZonas(updated)
    set({ zonas: updated })
  },
}))
