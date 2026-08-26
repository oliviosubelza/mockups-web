// ASPECTO del mapa en la pantalla de Restricciones: qué fondo tiene, qué rótulos se dibujan y qué se
// muestra de contexto.
//
// Es el gemelo de `zonas/zonas-mapa-store`, y lo es a propósito: dos pantallas del mismo sistema que
// ofrecen "elegir el fondo" no pueden pedirlo con dos gestos distintos ni guardarlo con dos criterios
// distintos. Mismo razonamiento en las tres decisiones que se copian tal cual:
//   · es estado de PANTALLA, no de dato: nada de acá viaja al backend ni cambia una restricción;
//   · NO usa `persist`: es cómo estás mirando el mapa en este rato, no una preferencia de la cuenta;
//   · vive en zustand y no en `useState` del workspace porque lo escribe un menú que está en un rincón
//     del mapa y lo lee una capa montada DENTRO del `MapContainer`.
//
// NO ES UN STORE COMPARTIDO CON ZONAS, y la separación es deliberada: la opción propia de acá
// (`verZonasLogisticas`) no tiene sentido en la otra pantalla, y allá el mapa abre contestando "cómo
// quedó repartida la ciudad" mientras acá contesta "dónde no se puede pasar". Compartir el store haría
// que apagar los nombres en una pantalla los apagara en la otra sin que nadie lo haya pedido.
import { create } from 'zustand'
import { CAPA_POR_DEFECTO, type CapaBase } from '../map/tiles'

interface RestriccionesMapaState {
  /**
   * Fondo del mapa. Importa más acá que en zonas: una restricción se dibuja siguiendo una avenida o el
   * perímetro de un mercado, y sobre el gris de Positron una avenida y un pasaje se ven casi igual.
   */
  capa: CapaBase
  setCapa: (capa: CapaBase) => void
  /**
   * Nombre de cada restricción sobre su geometría. Prendido: es cómo se identifica una sin pasarle el
   * mouse por encima. Se puede apagar porque con varias vías cerradas en el mismo corredor las etiquetas
   * se pisan y tapan justamente el trazo que se está mirando.
   */
  verNombres: boolean
  setVerNombres: (ver: boolean) => void
  /**
   * Las zonas logísticas dibujadas de fondo, en gris y sin responder al click.
   *
   * PRENDIDO, y es el único default que se aparta de la pantalla de zonas. La pregunta que trae a
   * alguien acá no es "¿dónde está esta restricción?" sino "¿a qué reparto le pega?", y sin las zonas
   * abajo un polígono rojo en medio de la ciudad no contesta ninguna de las dos. Son datos de otro
   * agregado —otra tabla, otra ruta, otro CRUD—, así que entran como CONTEXTO: no se seleccionan, no se
   * editan y no se cuentan en el listado de la izquierda.
   */
  verZonasLogisticas: boolean
  setVerZonasLogisticas: (ver: boolean) => void
  /**
   * La restricción elegida queda sólida y las demás se atenúan.
   *
   * APAGADO por la misma razón que en zonas: el mapa abre contestando "qué limitaciones hay hoy", y para
   * esa pregunta todas valen lo mismo. Bajarle la opacidad a las otras porque hay una seleccionada es una
   * jerarquía que el usuario no pidió.
   */
  resaltarSeleccionada: boolean
  setResaltarSeleccionada: (resaltar: boolean) => void
  /**
   * Sube el relleno de las áreas restringidas.
   *
   * APAGADO: el relleno normal es bajo a propósito —lo que hace legible un área es su borde, y el relleno
   * es lo único que compite con las calles de abajo—. Prenderlo es para leer la COBERTURA de un vistazo:
   * con las áreas opacas, el corredor que quedó sin restricción entre dos de ellas salta a la vista.
   */
  rellenoSolido: boolean
  setRellenoSolido: (solido: boolean) => void
}

export const useRestriccionesMapaStore = create<RestriccionesMapaState>((set) => ({
  capa: CAPA_POR_DEFECTO,
  setCapa: (capa) => set({ capa }),
  verNombres: true,
  setVerNombres: (verNombres) => set({ verNombres }),
  verZonasLogisticas: true,
  setVerZonasLogisticas: (verZonasLogisticas) => set({ verZonasLogisticas }),
  resaltarSeleccionada: false,
  setResaltarSeleccionada: (resaltarSeleccionada) => set({ resaltarSeleccionada }),
  rellenoSolido: false,
  setRellenoSolido: (rellenoSolido) => set({ rellenoSolido }),
}))
