// ASPECTO del mapa en la pantalla de Zonas: qué fondo tiene, qué rótulos se dibujan y con cuánto peso.
//
// Es estado de PANTALLA, no de dato: nada de acá viaja al backend ni cambia una zona. Por eso vive
// separado de `zones-store` —que es el espejo de la tabla `zones`— y por eso NO usa `persist`, mismo
// criterio que `planner-store`: es cómo estás mirando el mapa en este rato, no una preferencia de la
// cuenta. Recargar devuelve la pantalla a su forma conocida, que es justo lo que se quiere cuando alguien
// dejó prendido algo tres días atrás y ya no se acuerda.
//
// Vive en zustand y no en `useState` del workspace por la misma razón que en el planner: lo escribe un
// menú que está en un rincón del mapa y lo lee una capa que se monta DENTRO del `MapContainer`. Pasarlo
// por props obligaría a atravesar el árbol entero con seis pares valor/setter.
//
// TODOS LOS DEFAULTS SON EL ASPECTO QUE LA PANTALLA YA TENÍA. No es prolijidad: el menú es nuevo y nadie
// sabe todavía qué hace cada opción, así que abrirlo, mirarlo y cerrarlo sin tocar nada tiene que dejar
// el mapa exactamente como estaba. Un default que "mejora" la vista convierte al menú en algo que hay
// que deshacer antes de poder trabajar.
import { create } from 'zustand'
import { CAPA_POR_DEFECTO, type CapaBase } from '../map/tiles'

interface ZonasMapaState {
  /**
   * Fondo del mapa. Antes estaba clavado en `CAPA_POR_DEFECTO` dentro del `<TileLayer>` del editor,
   * mientras que planificación y monitoreo ya dejaban elegirlo. La diferencia dolía más acá que allá: se
   * dibujan perímetros siguiendo calles y manzanas, y sobre el gris de Positron una avenida y un pasaje
   * se ven casi igual. El satélite es lo que contesta "¿esta manzana está construida o es un descampado?".
   */
  capa: CapaBase
  setCapa: (capa: CapaBase) => void
  /**
   * Nombre de cada zona, escrito en el centro de su polígono. Prendido: es cómo se identifica una zona
   * sin pasarle el mouse por encima. Se puede apagar porque con zonas chicas y pegadas los nombres se
   * pisan entre sí y tapan justamente el borde que se está mirando.
   */
  verNombres: boolean
  setVerNombres: (ver: boolean) => void
  /**
   * Superficie debajo del nombre, en la misma etiqueta.
   *
   * APAGADO: es el dato de una comparación puntual ("¿por qué esta ruta tarda el doble?"), no algo que
   * haga falta leer en las diez zonas a la vez. Prendido en permanente duplica el alto de cada etiqueta y
   * el mapa pasa a estar escrito antes que dibujado.
   *
   * Cuelga de `verNombres` —no hay dónde poner la medida si no hay etiqueta—, y esa dependencia la hace
   * cumplir el menú deshabilitando el ítem, no este store: acá el valor queda como estaba para que
   * volver a prender los nombres devuelva la vista que tenías y no una a medias.
   */
  verMedidas: boolean
  setVerMedidas: (ver: boolean) => void
  /**
   * Los vértices del polígono sobre el que está el mouse, dibujados como puntos.
   *
   * APAGADO, y es el default más fácil de discutir: mostrarlos siempre convertiría cada zona en un
   * erizo. Sirve para una pregunta concreta —"¿este borde es una línea recta o tiene diez vértices
   * apretados?"— que es la que se hace justo antes de decidir si conviene editar el contorno o rehacerlo.
   * Solo en hover, así que nunca hay más de un polígono con puntos.
   */
  verVertices: boolean
  setVerVertices: (ver: boolean) => void
  /**
   * La zona elegida queda sólida y las demás se atenúan.
   *
   * APAGADO por la misma razón que `resaltarRuta` en el planner: el mapa abre contestando "cómo quedó
   * repartida la ciudad", y para esa pregunta todas las zonas valen lo mismo. Bajarle la opacidad a nueve
   * porque hay una seleccionada es una jerarquía que el usuario no pidió; el que sí está siguiendo UNA lo
   * prende y el mapa cambia de modo.
   */
  resaltarSeleccionada: boolean
  setResaltarSeleccionada: (resaltar: boolean) => void
  /**
   * Sube el relleno de todas las zonas.
   *
   * APAGADO: el relleno normal es bajo a propósito —lo que hace legible una zona es su borde, y el
   * relleno es lo único que compite con las calles de abajo—. Prenderlo es para leer la COBERTURA de un
   * vistazo: con las zonas opacas, el hueco sin cubrir entre dos de ellas salta a la vista, que con
   * relleno tenue hay que ir a buscarlo bordeando los contornos.
   */
  rellenoSolido: boolean
  setRellenoSolido: (solido: boolean) => void
}

export const useZonasMapaStore = create<ZonasMapaState>((set) => ({
  capa: CAPA_POR_DEFECTO,
  setCapa: (capa) => set({ capa }),
  verNombres: true,
  setVerNombres: (verNombres) => set({ verNombres }),
  verMedidas: false,
  setVerMedidas: (verMedidas) => set({ verMedidas }),
  verVertices: false,
  setVerVertices: (verVertices) => set({ verVertices }),
  resaltarSeleccionada: false,
  setResaltarSeleccionada: (resaltarSeleccionada) => set({ resaltarSeleccionada }),
  rellenoSolido: false,
  setRellenoSolido: (rellenoSolido) => set({ rellenoSolido }),
}))
