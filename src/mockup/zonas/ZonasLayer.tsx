// Todas las zonas sobre el mapa. Es la capa que reemplaza al listado como forma principal de llegar a
// una zona: en modo `explorar` los polígonos son clickeables y el click SELECCIONA, así que editar una
// zona dejó de exigir volver a una tabla y entrar de a una.
//
// TRES PAPELES según el modo del workspace, y el cambio de papel es lo que hace que la misma capa sirva
// para explorar y para dibujar:
//   · `explorar`  → las zonas SON el contenido: azules, clickeables, la seleccionada resaltada.
//   · `dibujar` / `editar` → pasan a ser CONTEXTO: grises, apagadas y **no interactivas**.
//
// LO NO INTERACTIVO NO ES UN DETALLE ESTÉTICO: un polígono de Leaflet con `interactive: true` se come el
// click antes de que llegue al `map.on('click')` de la herramienta de dibujo. Con las zonas clickeables
// mientras dibujás, poner un vértice dentro de una zona existente sería imposible — y es lo que más se
// hace, porque las zonas nuevas nacen pegadas a las viejas.
import { useState } from 'react'
import { Pane, Polygon, Tooltip } from 'react-leaflet'
import { poligonoALatLng, type Zona } from '../zones-store'

/** Nombre del pane. Exportado para que nadie lo reescriba como string suelto. */
export const PANE_ZONAS = 'zonas'

/** Debajo de `overlayPane` (400), donde `PolygonDrawLayer` monta su `L.layerGroup`: el trazo en curso y
 *  sus vértices quedan SIEMPRE encima, sin depender del orden de montaje. */
const Z_PANE = 340

const AZUL = '#2563eb'
const GRIS = '#94a3b8'
const GRIS_OSCURO = '#64748b'
/** Zona en conflicto: pisa a otra. Rojo porque es lo único de esta pantalla que hay que ir a arreglar. */
const ROJO = '#dc2626'

export type PapelZonas = 'contenido' | 'contexto'

export function ZonasLayer({
  zonas,
  papel,
  seleccionadaId,
  onSeleccionar,
  enConflicto,
}: {
  zonas: Zona[]
  papel: PapelZonas
  seleccionadaId: number | null
  /** Solo se llama en `contenido`. En `contexto` los polígonos no reciben el mouse. */
  onSeleccionar: (id: number | null) => void
  /** Ids que se pisan con alguna otra. Se resaltan en rojo INCLUSO como contexto: mientras dibujás, la
   *  zona que estás invadiendo es lo más importante del fondo. */
  enConflicto?: Set<number>
}) {
  // El hover se guarda acá y no en el padre a propósito: es estado puramente visual de esta capa y
  // subirlo haría re-renderizar la pantalla entera —listado incluido— cada vez que el mouse cruza un
  // polígono.
  const [hoverId, setHoverId] = useState<number | null>(null)

  if (zonas.length === 0) return null
  const contexto = papel === 'contexto'

  return (
    <Pane name={PANE_ZONAS} style={{ zIndex: Z_PANE }}>
      {/* Dos pasadas —rellenos y después bordes— porque las zonas se TOCAN: con una sola, el relleno de
          la que se monta última pisa el borde de su vecina y borra la frontera justo donde hay que
          verla. Mismo criterio que `MercadosLayer`. */}
      {zonas.map((zona) => {
        const sel = !contexto && zona.id === seleccionadaId
        const choca = enConflicto?.has(zona.id) ?? false
        const hover = !contexto && zona.id === hoverId
        return (
          <Polygon
            key={`fill-${zona.id}`}
            positions={poligonoALatLng(zona.polygonGeoJson)}
            interactive={!contexto}
            pathOptions={{
              stroke: false,
              fillColor: choca ? ROJO : contexto ? GRIS : zona.isActive ? AZUL : GRIS,
              // El relleno queda bajo a propósito: es lo que compite con lo que haya debajo. Lo que
              // hace legible la zona es el borde de la pasada siguiente, que no le cuesta contraste
              // a nada. Solo el seleccionado sube, porque ahí hay una pregunta puntual que contestar.
              // El hover sube el relleno a mitad de camino entre reposo y seleccionado: es la única
              // señal de que el polígono responde al click. Sin esto no hay ninguna — un polígono
              // pintado se ve igual sea clickeable o no.
              fillOpacity: choca ? 0.22 : contexto ? 0.1 : sel ? 0.28 : hover ? 0.2 : 0.12,
            }}
            eventHandlers={{
              // Volver a clickear la misma zona la deselecciona: sin esto no habría forma de quitar el
              // resaltado desde el mapa.
              click: () => !contexto && onSeleccionar(sel ? null : zona.id),
              mouseover: (e) => {
                if (contexto) return
                setHoverId(zona.id)
                // El cursor va sobre el elemento SVG del path y no sobre el contenedor del mapa: si se
                // tocara el contenedor pisaría el `crosshair`/`grab` que maneja la herramienta de dibujo.
                e.target.getElement()?.style.setProperty('cursor', 'pointer')
              },
              mouseout: () => !contexto && setHoverId((v) => (v === zona.id ? null : v)),
            }}
          />
        )
      })}

      {zonas.map((zona) => {
        const sel = !contexto && zona.id === seleccionadaId
        const choca = enConflicto?.has(zona.id) ?? false
        const hover = !contexto && zona.id === hoverId
        return (
          <Polygon
            key={`stroke-${zona.id}`}
            positions={poligonoALatLng(zona.polygonGeoJson)}
            interactive={false}
            pathOptions={{
              color: choca ? ROJO : contexto ? GRIS_OSCURO : zona.isActive ? AZUL : GRIS_OSCURO,
              weight: choca ? 3 : sel ? 3.5 : hover ? 3 : contexto ? 1.5 : 2,
              opacity: choca ? 1 : contexto ? 0.75 : 1,
              // Punteado = la zona no está operativa (inactiva), o es contexto. Un contorno lleno
              // significa "esta zona está en uso".
              dashArray: choca ? undefined : contexto || !zona.isActive ? '5 4' : undefined,
              fill: false,
            }}
          >
            {/* `pane` EXPLÍCITO: react-leaflet le pasa a cada capa el pane del contexto, así que acá la
                etiqueta terminaría en z 340 — el nombre dibujado DEBAJO del polígono que estás
                trazando. El nombre va al pane de etiquetas, como cualquier rótulo de mapa. */}
            <Tooltip
              // Remontar al cambiar la selección: Leaflet fija `className` al CREAR el tooltip y no lo
              // re-aplica si solo cambian las props, así que sin esto el resaltado no se vería.
              key={sel ? 'sel' : 'normal'}
              permanent
              direction="center"
              pane="tooltipPane"
              className={sel ? 'zona-etiqueta zona-etiqueta-sel' : 'zona-etiqueta'}
            >
              {zona.name}
            </Tooltip>
          </Polygon>
        )
      })}
    </Pane>
  )
}
