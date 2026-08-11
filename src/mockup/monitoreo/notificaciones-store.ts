// ¿El monitoreo avisa por toast cuando pasa algo?
//
// Arranca APAGADO y es opt-in explícito. Una pantalla de vigilancia que empieza a tirar avisos sin que
// nadie los haya pedido es la definición de ruido: el operador que la dejó abierta en un segundo monitor
// no quiere que le salte nada, y el que está siguiendo un viaje problemático sí. Que lo decida él.
//
// Vive en localStorage y no en la URL, por la misma razón que el modo de vista (ver `view-mode-store`):
// es una preferencia de QUIEN MIRA, no parte de la identidad de la pantalla. Y se persiste porque es una
// decisión que se toma una vez, no en cada visita — obligar a re-activarla en cada entrada sería
// convertir una preferencia en un trámite.
//
// Apagarlas NO detiene nada: la simulación (y mañana el SSE) sigue corriendo igual, el mapa se sigue
// moviendo y las paradas se siguen cerrando. Lo único que se apaga es el aviso.
import { create } from 'zustand'

const STORAGE_KEY = 'mockups-web:monitoreo-notificaciones'

function readStored(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'true' ? true : raw === 'false' ? false : null
  } catch {
    // Storage bloqueado (modo privado): se cae al default en vez de explotar.
    return null
  }
}

function writeStored(activas: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(activas))
  } catch {
    // Sin persistencia el interruptor igual funciona, solo no sobrevive el reload.
  }
}

interface NotificacionesState {
  activas: boolean
  setActivas: (activas: boolean) => void
  toggle: () => void
}

export const useNotificacionesStore = create<NotificacionesState>()((set, get) => ({
  activas: readStored() ?? false,
  setActivas: (activas) => {
    writeStored(activas)
    set({ activas })
  },
  toggle: () => get().setActivas(!get().activas),
}))
