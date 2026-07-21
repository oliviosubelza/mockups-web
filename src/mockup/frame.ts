/**
 * Medida del tablero = medida del artboard que llega a Figma.
 *
 * html.to.design captura con el viewport del preset elegido en la extensión, y lo que excede
 * ese ancho SE RECORTA. Así que el frame no se adivina ni se toma de la pantalla (eso haría el
 * export dependiente de la máquina que lo corre): se pide explícito por query param, y el preset
 * de la extensión tiene que ser el MISMO número.
 *
 *   ?w=1920&h=1080  + preset 1920
 *   ?w=1440&h=900   + preset 1440   ← default
 *   ?w=1024&h=768   + preset 1024
 */
export const DEFAULT_FRAME_WIDTH = 1440
export const DEFAULT_FRAME_HEIGHT = 900

/** Anchos de los presets de html.to.design (el preset "browser" queda fuera: no es reproducible). */
export const FRAME_PRESETS = [1920, 1440, 1024] as const

export interface Frame {
  width: number
  height: number
}

function readDimension(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key)
  if (raw === null) return fallback

  const value = Number(raw)
  // Un valor basura (?w=abc, ?w=-5) tiene que caer al default y no colapsar el tablero a 0px.
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[mockup] ?${key}=${raw} inválido — uso ${fallback}`)
    return fallback
  }
  return Math.round(value)
}

export function resolveFrame(search: string = location.search): Frame {
  const params = new URLSearchParams(search)
  return {
    width: readDimension(params, 'w', DEFAULT_FRAME_WIDTH),
    height: readDimension(params, 'h', DEFAULT_FRAME_HEIGHT),
  }
}
