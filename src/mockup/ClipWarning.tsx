import { useEffect, useState } from 'react'

/**
 * html.to.design recorta lo que exceda el ancho del viewport de captura, y lo hace en silencio:
 * el tablero llega a Figma cortado y no te enterás hasta que lo abrís. Este aviso hace visible
 * ese desfase ANTES de capturar. Se pinta fuera del tablero, así que no entra en el frame.
 */
export function ClipWarning({ frameWidth }: { frameWidth: number }) {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (viewportWidth >= frameWidth) return null

  return (
    <div className="sticky top-0 z-50 bg-red-600 px-4 py-2 text-center font-mono text-sm text-white">
      Viewport {viewportWidth}px &lt; frame {frameWidth}px — la captura se va a recortar.
      Elegí el preset {frameWidth} en html.to.design (o ensanchá la ventana).
    </div>
  )
}
