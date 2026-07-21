import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

// Leaflet cachea el tamaño en píxeles del mapa al inicializar. Cuando el mapa vive dentro de un
// contenedor flex/redimensionable que cambia de ancho (ej. arrastrar el divisor del sidebar), los
// tiles y los pines se desalinean si no llamamos a invalidateSize().
export function InvalidateOnResize() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
    })
    observer.observe(container)
    // Asegura una primera medición correcta una vez que el layout del panel se asentó.
    map.invalidateSize({ animate: false })
    return () => observer.disconnect()
  }, [map])

  return null
}
