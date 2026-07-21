import { create } from 'zustand'
import type { LatLngTuple } from './geo/polyline'

// Store de overlays del mapa: trazos (polilíneas) y marcadores dibujados "por encima" de las
// paradas. Es genérico — cualquier parte del mockup puede empujar un overlay (ej. la ruta demo).
// El render lo hace `OverlayLayer` dentro del mapa; el `fitToken` le avisa que encuadre el trazo
// recién agregado (reemplaza el evento `map.overlay.fit` del proyecto de referencia).

export interface OverlayPolyline {
  id: string
  path: LatLngTuple[]
  color: string
}

export interface OverlayMarker {
  id: string
  position: LatLngTuple
  color: string
  label?: string
}

interface OverlayState {
  polylines: OverlayPolyline[]
  markers: OverlayMarker[]
  /** Se incrementa en cada `setOverlay` para que `OverlayLayer` encuadre el trazo nuevo. */
  fitToken: number
  setOverlay: (input: { polylines?: OverlayPolyline[]; markers?: OverlayMarker[] }) => void
  clearOverlay: () => void
}

export const useOverlayStore = create<OverlayState>((set) => ({
  polylines: [],
  markers: [],
  fitToken: 0,

  setOverlay: ({ polylines = [], markers = [] }) =>
    set((state) => ({ polylines, markers, fitToken: state.fitToken + 1 })),

  clearOverlay: () => set({ polylines: [], markers: [] }),
}))
