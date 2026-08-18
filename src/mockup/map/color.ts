// Utilidades de color para el dibujo del mapa. Vive suelto —no dentro de un componente— porque lo
// necesitan dos piezas con la misma necesidad y ninguna relación entre sí: los pines del planificador
// y los polígonos de mercados. Las dos parten del MISMO color base (el del camión, el del canal, el de
// la paleta de mercados) y necesitan una variante más oscura para el contorno.
//
// POR QUÉ UNA VARIANTE CALCULADA Y NO UNA SEGUNDA PALETA A MANO. Los colores base no son una lista
// cerrada: salen de los camiones, de `CANAL_META` y de `COLORES_MERCADO`, y cada vez que alguien suma
// un canal o un camión habría que acordarse de sumarle su tono oscuro en otro archivo. Un tono que se
// deriva no se puede olvidar de actualizar.

/** `#rrggbb` → [r, g, b]. Devuelve `null` si el formato no es el esperado (no adivina). */
function aRgb(hex: string): [number, number, number] | null {
  const limpio = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return null
  return [
    parseInt(limpio.slice(0, 2), 16),
    parseInt(limpio.slice(2, 4), 16),
    parseInt(limpio.slice(4, 6), 16),
  ]
}

/**
 * Versión más OSCURA del mismo color, para usarla como contorno del relleno.
 *
 * `factor` es cuánto del color se conserva: 0.6 devuelve un tono claramente más oscuro pero del mismo
 * matiz, que es exactamente lo que hace legible un borde sin introducir un color nuevo al mapa. Un
 * borde negro o gris haría el mismo trabajo de contraste y rompería la regla que sostiene toda esta
 * pantalla: el color significa a quién pertenece el punto.
 *
 * Se multiplica en RGB y no en HSL a propósito: es una operación de una línea, sin conversión de ida y
 * vuelta, y a estos factores no hay diferencia perceptible. Si algún día hiciera falta oscurecer sin
 * perder saturación, ese es el momento de traer HSL, no antes.
 *
 * Un color que no se puede parsear se devuelve tal cual: un borde del mismo color que el relleno es
 * invisible, no es un error visual — y es mejor que devolver negro y ensuciar el mapa.
 */
export function oscurecer(hex: string, factor = 0.6): string {
  const rgb = aRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map((c) => Math.round(c * factor))
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
