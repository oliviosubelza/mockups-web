// Capa de mercados: dibuja UN polígono por mercado con su nombre en el centro. Es el único componente
// del feature que toca Leaflet, y es puro presentacional — recibe mercados ya adaptados y avisa qué se
// clickeó. No pide datos, no sabe de qué endpoint salieron y no decide si la capa está encendida.
//
// POR QUÉ UN PANE PROPIO (y no confiar en el orden de montaje):
// Leaflet apila por pane, no por orden en el JSX. Los polígonos, los trazos de ruta y el rectángulo de
// selección viven todos en `overlayPane` (z 400), así que ahí el que se monta último tapa al anterior —
// y "los pedidos y las rutas por encima de los mercados" quedaría dependiendo de en qué orden están las
// líneas de OrdersMap. Con un pane propio en z 350 la regla es estructural: los mercados quedan arriba
// de los tiles (200) y debajo de TODO lo demás (rutas 400, marcadores 600, etiquetas 650), sin importar
// quién se monte primero.
import { Pane, Polygon, Tooltip } from 'react-leaflet'
import type { MercadoMapa } from './mercado-mapa'

/** Nombre del pane. Exportado para que nadie lo escriba de nuevo como string suelto. */
export const PANE_MERCADOS = 'mercados'

/** Debajo de `overlayPane` (400): rutas y selección siempre por encima de los polígonos. */
const Z_PANE_MERCADOS = 350

export function MercadosLayer({
  mercados,
  /** Mercado con el borde resaltado (`null` = ninguno). */
  seleccionadoId,
  onSeleccionar,
  /**
   * `false` mientras el usuario está usando una herramienta de dibujo del mapa (rectángulo/lazo): ahí
   * el click es parte del gesto de seleccionar paradas, y resaltar un mercado en medio del trazo sería
   * un efecto que nadie pidió. Los polígonos siguen visibles, solo no responden al click.
   */
  interactivo = true,
  /**
   * Etiqueta con el nombre en el centro de cada polígono. Es apagable porque con muchos mercados chicos
   * y el mapa alejado los nombres se pisan entre sí y con los pines: ahí el color del polígono ya
   * alcanza para leer "son zonas distintas", y el nombre se consulta clickeando.
   *
   * El mercado SELECCIONADO conserva su etiqueta siempre — apagar los nombres no puede dejar sin
   * respuesta la pregunta que acabás de hacerle al mapa con el click.
   */
  mostrarNombres = true,
}: {
  mercados: MercadoMapa[]
  seleccionadoId: number | null
  onSeleccionar: (id: number | null) => void
  interactivo?: boolean
  mostrarNombres?: boolean
}) {
  return (
    <Pane name={PANE_MERCADOS} style={{ zIndex: Z_PANE_MERCADOS }}>
      {mercados.map((mercado) => {
        const seleccionado = mercado.id === seleccionadoId
        return (
          <Polygon
            key={mercado.id}
            positions={mercado.anillos}
            pathOptions={{
              color: mercado.color,
              // El mercado seleccionado se marca con el BORDE (más grueso y opaco), no con el relleno:
              // subir el relleno le come contraste a los pines que caen adentro, que es justo lo que no
              // se puede perder de vista.
              weight: seleccionado ? 3.5 : 1.25,
              opacity: seleccionado ? 1 : 0.65,
              fillColor: mercado.color,
              fillOpacity: seleccionado ? 0.2 : 0.12,
            }}
            eventHandlers={{
              // Volver a clickear el mismo mercado lo deselecciona: sin esto no habría forma de quitar
              // el resaltado desde el mapa.
              click: () => interactivo && onSeleccionar(seleccionado ? null : mercado.id),
            }}
          >
            {/* Nombre en el centro aproximado del polígono. `permanent` + `direction="center"` es lo
                que hace que Leaflet lo apoye en el centro del anillo y no al costado como un hover.
                Los tooltips no interactivos no reciben el mouse (pointer-events: none), así que la
                etiqueta no se roba los clicks del polígono ni de los pines que estén debajo.

                ESTA es la única vez que aparece el nombre. Antes el click abría además un globo con el
                mismo texto: el nombre quedaba escrito dos veces, a centímetros de distancia, y el globo
                no agregaba ni un dato que la etiqueta no tuviera. Lo que el click aporta es el FOCO, y
                eso se muestra resaltando la etiqueta que ya estaba, no duplicándola.

                El `key` cambia con la selección a propósito: Leaflet fija las opciones del tooltip
                (`className` entre ellas) al CREARLO y no las re-aplica si solo cambian las props, así
                que sin remontarlo el resaltado no se vería. Mismo truco que las etiquetas de detalle
                de los pines en OrdersMap.

                Con los nombres apagados el tooltip no se monta (no se oculta por CSS): un tooltip
                permanente invisible sigue existiendo en el DOM y en los cálculos de Leaflet, y son
                tantos como mercados haya. */}
            {(mostrarNombres || seleccionado) && (
            <Tooltip
              key={seleccionado ? 'sel' : 'normal'}
              permanent
              direction="center"
              // `pane` EXPLÍCITO y no heredado. react-leaflet le pasa a cada capa el pane del contexto
              // (`withPane`), así que dentro de <Pane name="mercados"> el tooltip también terminaría en
              // z 350 — o sea el nombre del mercado dibujado DEBAJO de los pines y de las rutas, que es
              // exactamente lo contrario de una etiqueta. El polígono sí va al pane de mercados (lo
              // hereda del contexto); su etiqueta va al pane de etiquetas, como cualquier nombre de mapa.
              pane="tooltipPane"
              className={seleccionado ? 'mercado-etiqueta mercado-etiqueta-sel' : 'mercado-etiqueta'}
            >
              {mercado.nombre}
            </Tooltip>
            )}
          </Polygon>
        )
      })}
    </Pane>
  )
}
