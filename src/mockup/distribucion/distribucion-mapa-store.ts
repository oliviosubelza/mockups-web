// ASPECTO del mapa en la pantalla de zonas de distribución.
//
// ═══ POR QUÉ SE PARTIÓ DE `zonas-mapa-store` ═══
//
// Al principio esta pantalla usaba el store de zonas tal cual, y el comentario de entonces decía por qué
// se podía: las cinco opciones preguntaban lo mismo en las dos pantallas. Y decía también cuándo habría
// que partirlo — «el día que aparezca una opción propia». Apareció: acá hay DOS cosas rotulables (la zona
// y el depósito) y allá solo una, así que un único interruptor de «nombres» ya no alcanza.
//
// Se paga con dos menús parecidos, y se gana que apagar los nombres de los depósitos no apague los de las
// zonas logísticas en la otra pantalla, que es una sorpresa que nadie pidió.
//
// Sigue siendo estado de PANTALLA: nada de acá viaja al backend, y NO usa `persist` —es cómo estás mirando
// el mapa en este rato, no una preferencia de la cuenta—. Mismo criterio que `zonas-mapa-store` y
// `restricciones-mapa-store`.
import { create } from 'zustand'
import { CAPA_POR_DEFECTO, type CapaBase } from '../map/tiles'

/**
 * Cómo se rotulan los depósitos.
 *
 * Son tres valores y no un booleano porque hay tres respuestas útiles, no dos:
 *   · `nombre`  → el nombre completo. Es el default: con dos distribuidoras por ciudad y nombres que no se
 *                 parecen entre sí, es lo que contesta «¿cuál estoy dibujando?» sin pasar el mouse.
 *   · `inicial` → la primera letra dentro del disco. Para cuando los dos depósitos quedaron cerca y las
 *                 etiquetas se pisan, pero todavía hace falta distinguirlos.
 *   · `ninguno` → solo el ícono. Para mirar la FORMA de los polígonos sin texto encima.
 * Un booleano dejaría fuera el caso del medio, que es justamente el que aparece cuando el mapa se llena.
 */
export type RotuloDeposito = 'nombre' | 'inicial' | 'ninguno'

export const ROTULO_DEPOSITO_META: Record<RotuloDeposito, { label: string }> = {
  nombre: { label: 'Nombre completo' },
  inicial: { label: 'Solo la inicial' },
  ninguno: { label: 'Solo el ícono' },
}

interface DistribucionMapaState {
  capa: CapaBase
  setCapa: (capa: CapaBase) => void
  /** Rótulo de los depósitos. Ver `RotuloDeposito`. */
  rotulo: RotuloDeposito
  setRotulo: (rotulo: RotuloDeposito) => void
  /**
   * Nombre de la distribuidora sobre su polígono.
   *
   * APAGADO por defecto, y es la única opción cuyo default se aparta de la pantalla de zonas. Acá el
   * nombre ya está en el depósito, que cae DENTRO de su propia zona: prenderlo también en el polígono
   * escribe el mismo nombre dos veces a pocos píxeles de distancia.
   */
  verNombresZona: boolean
  setVerNombresZona: (ver: boolean) => void
}

export const useDistribucionMapaStore = create<DistribucionMapaState>((set) => ({
  capa: CAPA_POR_DEFECTO,
  setCapa: (capa) => set({ capa }),
  rotulo: 'nombre',
  setRotulo: (rotulo) => set({ rotulo }),
  verNombresZona: false,
  setVerNombresZona: (verNombresZona) => set({ verNombresZona }),
}))
