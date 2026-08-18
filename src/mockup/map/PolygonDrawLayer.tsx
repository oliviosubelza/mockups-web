// Herramienta de dibujo de polígono: click para ir agregando vértices, click sobre el primero (o
// Enter) para cerrarlo, doble click para cerrar en el mismo gesto. Una vez cerrado (o mientras se
// edita una zona ya existente) los vértices se pueden arrastrar o borrar (click derecho) sin volver
// a entrar en modo dibujo.
//
// TODO ES IMPERATIVO (L.Marker/L.Polyline a mano), no `<Marker>` de react-leaflet por vértice: un
// vértice se agrega en cada click mientras se dibuja, y remontar N componentes React por cada uno
// se ve como un parpadeo. Mismo criterio que `SelectionLayer` con el rectángulo y el lazo.
//
// A DIFERENCIA de `SelectionLayer`, acá NO se desactiva el arrastre del mapa: un click sin
// movimiento sigue agregando un vértice, y un click CON movimiento sigue siendo un pan — es la
// distinción nativa entre 'click' y drag que ya hace Leaflet, y es lo que permite panear el mapa
// mientras se dibuja sin salir de la herramienta.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { oscurecer } from './color'
import type { LatLngTuple } from './geo/polyline'

const AZUL = '#2563eb'
const ESTILO_TRAZO: L.PolylineOptions = { color: AZUL, weight: 2, dashArray: '6 4' }
const ESTILO_GUIA: L.PolylineOptions = { color: AZUL, weight: 1.5, dashArray: '2 6', opacity: 0.55 }
const estiloRelleno = (color: string): L.PolylineOptions => ({
  color: oscurecer(color, 0.7),
  weight: 2.5,
  fillColor: color,
  fillOpacity: 0.18,
})

function iconoVertice(primero: boolean): L.DivIcon {
  const tam = primero ? 13 : 9
  return L.divIcon({
    className: '',
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:999px;background:${primero ? AZUL : '#fff'};border:2px solid ${AZUL};box-shadow:0 1px 3px rgba(0,0,0,.45);cursor:${primero ? 'pointer' : 'move'};"></div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  })
}

export function PolygonDrawLayer({
  puntos,
  /** true mientras se están agregando vértices con click. false = solo edición (arrastrar/borrar). */
  activo,
  onPuntosChange,
  /** Cierre del polígono: click en el primer vértice, doble click o Enter (con 3+ vértices). */
  onFinalizar,
  color = AZUL,
}: {
  puntos: LatLngTuple[]
  activo: boolean
  onPuntosChange: (puntos: LatLngTuple[]) => void
  onFinalizar: (puntosFinal: LatLngTuple[]) => void
  color?: string
}) {
  const map = useMap()

  // Refs "espejo" de las props: los handlers de Leaflet se registran una vez y viven fuera del ciclo
  // de render de React, así que necesitan la versión más nueva sin volver a suscribirse.
  const puntosRef = useRef(puntos)
  puntosRef.current = puntos
  const activoRef = useRef(activo)
  activoRef.current = activo
  const onPuntosChangeRef = useRef(onPuntosChange)
  onPuntosChangeRef.current = onPuntosChange
  const onFinalizarRef = useRef(onFinalizar)
  onFinalizarRef.current = onFinalizar

  const capaRef = useRef<L.LayerGroup | null>(null)
  const guiaRef = useRef<L.Polyline | null>(null)

  useEffect(() => {
    const capa = L.layerGroup().addTo(map)
    capaRef.current = capa
    return () => {
      capa.remove()
      capaRef.current = null
    }
  }, [map])

  // Redibuja la forma y los vértices en cada cambio. `activo` decide si se ve como TRAZO (todavía no
  // es una zona) o como POLÍGONO relleno (ya cerrado) — el mismo lenguaje visual que los mercados.
  useEffect(() => {
    const capa = capaRef.current
    if (!capa) return
    capa.clearLayers()
    guiaRef.current = null

    if (puntos.length >= 2) {
      if (activo) L.polyline(puntos, ESTILO_TRAZO).addTo(capa)
      else L.polygon(puntos, estiloRelleno(color)).addTo(capa)
    }
    if (activo && puntos.length >= 3) {
      L.polyline([puntos[puntos.length - 1], puntos[0]], ESTILO_GUIA).addTo(capa)
    }

    puntos.forEach((p, i) => {
      const marker = L.marker(p, { icon: iconoVertice(i === 0), draggable: true, autoPan: true }).addTo(capa)

      marker.on('drag', (e) => {
        const { lat, lng } = (e.target as L.Marker).getLatLng()
        const siguiente = [...puntosRef.current]
        siguiente[i] = [lat, lng] as LatLngTuple
        onPuntosChangeRef.current(siguiente)
      })

      // Parado en el mapa, así que su click burbujea al 'click' del mapa (agregaría un vértice
      // fantasma en el mismo lugar) si no se corta acá.
      marker.on('click', (e) => {
        L.DomEvent.stop(e)
        if (i === 0 && activoRef.current && puntosRef.current.length >= 3) {
          onFinalizarRef.current(puntosRef.current)
        }
      })

      marker.on('contextmenu', (e) => {
        L.DomEvent.stop(e)
        if (puntosRef.current.length <= 3) return
        onPuntosChangeRef.current(puntosRef.current.filter((_, idx) => idx !== i))
      })

      marker.bindTooltip(i === 0 ? 'Click para cerrar el polígono' : 'Arrastrar para mover · click derecho para borrar', {
        direction: 'top',
        offset: [0, -8],
      })
    })
  }, [puntos, activo, color, map])

  // Gestos de dibujo: solo se escuchan mientras `activo`. Dejar el arrastre del mapa prendido: un
  // click SIN movimiento sigue siendo un click (agrega vértice), uno CON movimiento sigue paneando.
  useEffect(() => {
    if (!activo) return
    const container = map.getContainer()
    const prevCursor = container.style.cursor
    container.style.cursor = 'crosshair'
    map.doubleClickZoom.disable()

    const onClick = (e: L.LeafletMouseEvent) => {
      onPuntosChangeRef.current([...puntosRef.current, [e.latlng.lat, e.latlng.lng]])
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const capa = capaRef.current
      if (!capa || puntosRef.current.length === 0) return
      const desde = puntosRef.current[puntosRef.current.length - 1]
      if (!guiaRef.current) guiaRef.current = L.polyline([desde, e.latlng], ESTILO_GUIA).addTo(capa)
      else guiaRef.current.setLatLngs([desde, e.latlng])
    }

    const onDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e)
      // El navegador dispara 'click' DOS veces antes del 'dblclick': los dos ya agregaron un vértice
      // fantasma pegado a este punto. Se descartan (por distancia en pantalla, no en grados —así
      // funciona igual a cualquier zoom) antes de cerrar.
      const aca = map.latLngToContainerPoint(e.latlng)
      let pts = puntosRef.current
      while (pts.length > 0 && map.latLngToContainerPoint(pts[pts.length - 1]).distanceTo(aca) < 8) {
        pts = pts.slice(0, -1)
      }
      if (pts.length >= 3) onFinalizarRef.current(pts)
      else if (pts.length !== puntosRef.current.length) onPuntosChangeRef.current(pts)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // No compite con escribir el nombre de la zona o abrir el select de ciudad.
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
      if (e.key === 'Enter' && puntosRef.current.length >= 3) onFinalizarRef.current(puntosRef.current)
      else if (e.key === 'Escape') onPuntosChangeRef.current([])
      else if ((e.key === 'Backspace' || e.key === 'Delete') && puntosRef.current.length > 0) {
        onPuntosChangeRef.current(puntosRef.current.slice(0, -1))
      }
    }

    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    map.on('mousemove', onMouseMove)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      map.off('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      container.style.cursor = prevCursor
      map.doubleClickZoom.enable()
      guiaRef.current?.remove()
      guiaRef.current = null
    }
  }, [activo, map])

  return null
}
