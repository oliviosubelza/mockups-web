// Contexto de la UNIFICACIÓN en curso: qué camión y qué paradas (dispatch_delivery_point ids) se
// están unificando. Vive fuera de React (Zustand) para sobrevivir a la navegación entre la vista de
// órdenes y el planner/mapa. El planner lo lee para scopear el mapa a EXACTAMENTE esas paradas —
// así el mockup es consistente: lo que unificaste es lo que el optimizador recibe.
import { create } from 'zustand'

interface UnifyState {
  /** Placa del camión destino (null = no hay unificación en curso). */
  camion: string | null
  /** dispatch_delivery_point ids de la unión de las órdenes seleccionadas. */
  paradaIds: string[]
  /** Códigos de las órdenes que se unificaron (para mostrar contexto). */
  ordenes: string[]
  set: (ctx: { camion: string; paradaIds: string[]; ordenes: string[] }) => void
  clear: () => void
}

export const useUnifyStore = create<UnifyState>((set) => ({
  camion: null,
  paradaIds: [],
  ordenes: [],
  set: (ctx) => set(ctx),
  clear: () => set({ camion: null, paradaIds: [], ordenes: [] }),
}))
