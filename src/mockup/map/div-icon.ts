// Construcción de íconos HTML para Leaflet. Vive suelto (no dentro de un mapa) porque lo usan varias
// pantallas con semánticas de pin distintas: el mapa de planificación pinta por camión, el de
// monitoreo pinta por estado de entrega. Lo único que comparten es CÓMO se fabrica el ícono.
import L from 'leaflet'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Ícono de Leaflet a partir de HTML crudo.
 *
 * `size` acepta un número (cuadrado) o `[ancho, alto]`. `anchor` es el punto del ícono que se apoya
 * en la coordenada; por defecto el centro, que es lo correcto para una chapa redonda. Un marcador con
 * forma de gota tiene que anclar en su PUNTA (`[ancho / 2, alto]`) o el pin queda flotando arriba del
 * lugar que señala y todo el mapa se ve corrido.
 *
 * `className: ''` saca el fondo y el borde blancos que Leaflet le pone por defecto al divIcon.
 */
export function divIcon(
  html: string,
  size: number | [number, number],
  anchor?: [number, number],
): L.DivIcon {
  const [ancho, alto] = typeof size === 'number' ? [size, size] : size
  return L.divIcon({
    html,
    className: '',
    iconSize: [ancho, alto],
    iconAnchor: anchor ?? [ancho / 2, alto / 2],
  })
}

/** Igual que `divIcon`, pero recibe JSX y lo serializa. Evita repetir `renderToStaticMarkup`. */
export function reactIcon(
  node: ReactElement,
  size: number | [number, number],
  anchor?: [number, number],
): L.DivIcon {
  return divIcon(renderToStaticMarkup(node), size, anchor)
}
