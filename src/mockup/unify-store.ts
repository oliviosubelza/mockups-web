// Contexto de la UNIFICACIÓN en curso: qué camión y qué paradas (dispatch_delivery_point ids) se
// están unificando. Vive fuera de React (Zustand) para sobrevivir a la navegación entre la vista de
// órdenes y el planner/mapa. El planner lo lee para scopear el mapa a EXACTAMENTE esas paradas —
// así el mockup es consistente: lo que unificaste es lo que el optimizador recibe.
//
// Además del scope viaja el RESUMEN del viaje (tripulación, pedidos, carga y capacidad). No es
// redundancia: el diálogo de finalización ya agregó esos números sobre el subconjunto de órdenes que
// el usuario dejó INCLUIDAS, y el panel del mapa es otra pantalla. Recalcularlos desde la placa
// implicaría duplicar esa agregación —y peor, hacerlo sobre TODAS las órdenes del camión, perdiendo
// las que el usuario excluyó. Se mandan resueltos desde donde se decidieron.
import { create } from 'zustand'

interface UnifyState {
  /** Placa del camión destino (null = no hay unificación en curso). */
  camion: string | null
  /** dispatch_delivery_point ids de la unión de las órdenes seleccionadas. */
  paradaIds: string[]
  /** Códigos de las órdenes que se unificaron (para mostrar contexto). */
  ordenes: string[]
  /** Chofer del viaje ('' = sin asignar). */
  chofer: string
  /** Auxiliar del viaje ('' = sin asignar). */
  auxiliar: string
  /** Cantidad de pedidos de las órdenes incluidas (se compara contra MAX_PEDIDOS_POR_CAMION). */
  pedidos: number
  /** Peso (kg) de las órdenes incluidas. */
  cargaKg: number
  /** Capacidad de peso (kg) del camión destino. */
  capacidadKg: number
  set: (ctx: {
    camion: string
    paradaIds: string[]
    ordenes: string[]
    chofer: string
    auxiliar: string
    pedidos: number
    cargaKg: number
    capacidadKg: number
  }) => void
  clear: () => void
}

const VACIO = {
  camion: null,
  paradaIds: [],
  ordenes: [],
  chofer: '',
  auxiliar: '',
  pedidos: 0,
  cargaKg: 0,
  capacidadKg: 0,
} satisfies Omit<UnifyState, 'set' | 'clear'>

export const useUnifyStore = create<UnifyState>((set) => ({
  ...VACIO,
  set: (ctx) => set(ctx),
  clear: () => set(VACIO),
}))
