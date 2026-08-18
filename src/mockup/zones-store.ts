// Store de ZONAS de reparto (tabla `zones`). Dato maestro, no de un plan: se crea una vez por
// ciudad y después la usan muchos planes, así que vive fuera del `dispatch-plan-store`/`planner-store`
// (que son del PLAN activo) — mismo criterio que `planes-store` con los planes guardados.
//
// El polígono se guarda en el mismo formato que la columna `polygon_geojson` (GeoJSON, anillo en
// `[lng, lat]`) para que lo que sale de acá sea literalmente el payload que un día viaja al backend.
// Leaflet trabaja en `[lat, lng]`, así que la conversión vive en dos funciones chicas (`aLatLng` /
// `aGeoJson`) y el resto de la pantalla no vuelve a tocar el orden de las coordenadas.
import { create } from 'zustand'
import { CIUDAD_META, type CiudadId } from './mock-data'
import type { LatLngTuple } from './map/geo/polyline'

const STORAGE_KEY = 'mockups-web:zonas'
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

/** Cuadrado simple alrededor de un centro, en grados — alcanza para sembrar zonas de ejemplo. */
function cuadrado(centro: LatLngTuple, lado: number): ZonaPoligonoGeoJson {
  const [lat, lng] = centro
  const d = lado / 2
  return latLngAPoligono([
    [lat + d, lng - d],
    [lat + d, lng + d],
    [lat - d, lng + d],
    [lat - d, lng - d],
  ])!
}

/** Centro aproximado de cada ciudad — solo para sembrar zonas de ejemplo y centrar el editor. */
export const CIUDAD_CENTRO: Record<CiudadId, LatLngTuple> = {
  santacruz: [-17.783, -63.182],
  montero: [-17.339, -63.25],
  warnes: [-17.517, -63.167],
  laguardia: [-17.917, -63.233],
  cotoca: [-17.817, -63.033],
}

function defaultZonasSeed(): Zona[] {
  const creado = nowIso()
  const seeds: { name: string; ciudad: CiudadId; offset: LatLngTuple; lado: number }[] = [
    { name: 'Zona Norte', ciudad: 'santacruz', offset: [0.035, 0], lado: 0.05 },
    { name: 'Zona Sur', ciudad: 'santacruz', offset: [-0.035, 0], lado: 0.05 },
    { name: 'Zona Centro', ciudad: 'santacruz', offset: [0, 0], lado: 0.03 },
    { name: 'Zona Montero', ciudad: 'montero', offset: [0, 0], lado: 0.04 },
    { name: 'Zona Warnes', ciudad: 'warnes', offset: [0, 0], lado: 0.04 },
  ]
  return seeds.map(({ name, ciudad, offset, lado }, i) => {
    const centro: LatLngTuple = [
      CIUDAD_CENTRO[ciudad][0] + offset[0],
      CIUDAD_CENTRO[ciudad][1] + offset[1],
    ]
    return {
      id: i + 1,
      name,
      polygonGeoJson: cuadrado(centro, lado),
      cityId: CIUDAD_META[ciudad].cityId,
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: creado,
      updatedAt: creado,
      deletedAt: null,
      isActive: true,
    }
  })
}

function readStoredZonas(): Zona[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = defaultZonasSeed()
      writeStoredZonas(seed)
      return seed
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Zona[]) : defaultZonasSeed()
  } catch {
    return defaultZonasSeed()
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
