// Herramientas del mapa de monitoreo: zoom, encuadre y capa base.
//
// POR QUÉ NO USAMOS LOS CONTROLES DE LEAFLET.
// `ZoomControl` y `LayersControl` se anclan a las ESQUINAS del mapa con CSS propio, y esas esquinas
// son exactamente donde viven nuestros paneles flotantes: el de paradas ocupa todo el borde izquierdo
// y el de detalle el derecho. El control quedaba tapado, y como vive dentro del contexto de apilado
// aislado del mapa, no hay z-index que lo saque de ahí.
//
// Una herramienta propia resuelve las dos cosas: se posiciona donde queremos y REACCIONA al estado de
// los paneles — se corre sola cuando el detalle entra. Además queda con el mismo lenguaje visual que
// el resto (tarjeta redondeada, sombra, fondo translúcido) en vez del gris de Leaflet.
//
// Vive DENTRO del MapContainer para poder usar `useMap()`. No compite con los paneles porque nunca se
// superpone con ellos: su posición se calcula desde el mismo margen que usa `fitBounds`.
import { Layers, Maximize2, Minus, Plus, Truck } from 'lucide-react'
import { useMap } from 'react-leaflet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { encuadrar } from '../map/encuadrar'
import type { LatLngTuple } from '../map/geo/polyline'

export type CapaBase = 'calles' | 'satelite'

/** Botón de la barra. Chico y cuadrado: es una herramienta, no una acción de la pantalla. */
function Herramienta({
  etiqueta,
  onClick,
  disabled,
  children,
}: {
  etiqueta: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 rounded-lg"
      onClick={onClick}
      disabled={disabled}
      title={etiqueta}
      aria-label={etiqueta}
    >
      {children}
    </Button>
  )
}

export function HerramientasMapa({
  recorrido,
  /** Dónde está el camión ahora. `null` = no salió o ya volvió: el botón de centrar se deshabilita. */
  posicionCamion,
  capa,
  onCapa,
  /**
   * Dónde apoyar la barra. Lo decide la VISTA y no este componente: es la que sabe dónde están sus
   * paneles y cuánto miden. El mapa no tiene por qué enterarse del layout que lo rodea.
   */
  ancla,
  /** Mismos márgenes que usa `fitBounds`, para que "Encuadrar" no meta paradas debajo de un panel. */
  margenDer,
  margenIzq,
}: {
  recorrido: LatLngTuple[]
  posicionCamion: LatLngTuple | null
  capa: CapaBase
  onCapa: (capa: CapaBase) => void
  ancla: { top: number; left: number }
  margenDer: number
  margenIzq: number
}) {
  const map = useMap()
  const margenes = { margenIzq, margenDer }

  return (
    <div
      // `z-[1000]` supera los panes internos de Leaflet (400-700). Queda contenido por el `isolate`
      // del contenedor del mapa, así que no compite con los overlays de la app.
      className={cn(
        'absolute z-[1000] flex flex-col overflow-hidden rounded-xl border border-border',
        // La transición dura lo mismo que la del panel: la barra viaja PEGADA a su borde en vez de
        // saltar cuando el panel termina de moverse.
        'bg-card/95 shadow-lg backdrop-blur-sm transition-[top,left] duration-300 ease-out',
      )}
      style={{ top: ancla.top, left: ancla.left }}
    >
      <Herramienta etiqueta="Acercar" onClick={() => map.zoomIn()}>
        <Plus size={15} />
      </Herramienta>
      <Herramienta etiqueta="Alejar" onClick={() => map.zoomOut()}>
        <Minus size={15} />
      </Herramienta>

      <span className="mx-1.5 h-px bg-border" aria-hidden />

      {/* Volver AL CAMIÓN. Es la herramienta más usada de una pantalla de vigilancia y la que el
          encuadre automático no puede cubrir: ese corre una sola vez al abrir el viaje, y el camión
          se va del cuadro a los pocos minutos. */}
      <Herramienta
        etiqueta={posicionCamion ? 'Centrar en el camión' : 'El camión no está en ruta'}
        onClick={() => posicionCamion && encuadrar(map, [posicionCamion], { ...margenes, zoomMax: 15 })}
        disabled={!posicionCamion}
      >
        <Truck size={15} />
      </Herramienta>

      {/* Volver al recorrido completo: la vista de conjunto, para saber cuánto le falta. */}
      <Herramienta etiqueta="Encuadrar el recorrido" onClick={() => encuadrar(map, recorrido, margenes)}>
        <Maximize2 size={14} />
      </Herramienta>

      <span className="mx-1.5 h-px bg-border" aria-hidden />

      {/* Con dos capas, un toggle dice más que una lista: el botón anuncia A DÓNDE va, no dónde está. */}
      <Herramienta
        etiqueta={capa === 'calles' ? 'Ver satélite' : 'Ver calles'}
        onClick={() => onCapa(capa === 'calles' ? 'satelite' : 'calles')}
      >
        <Layers size={15} className={cn(capa === 'satelite' && 'text-primary')} />
      </Herramienta>
    </div>
  )
}
