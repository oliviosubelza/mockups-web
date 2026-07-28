// Fotos del punto de entrega, para la galería del modal del mapa.
//
// Son fotos REALES de Unsplash, servidas desde su CDN. La Unsplash License permite el uso libre
// (comercial incluido) y el hot-link a images.unsplash.com; la atribución es agradecida, no exigida.
// Cada URL de acá fue verificada con un request: devuelven 200 image/jpeg.
//
// Elegidas POR CANAL a ojo, una por una: un depósito con racks no puede ilustrar un kiosco de barrio,
// y un pasillo de supermercado no ilustra una entrega en provincia. Se revisaron todas para asignarlas
// (y se descartaron cuatro que no tenían nada que ver: un dashboard, una concesionaria de autos, un
// lavadero y un perchero de ropa).
//
// FALLBACK: si no hay red —o si el CDN falla— el <img> cae a una ilustración SVG generada
// (`ilustracionDePunto`), que va inline como data URI. Sin esto la galería quedaría con huecos rotos
// offline y, peor, en la exportación a Figma: html.to.design captura el DOM y una imagen que no
// resolvió llega vacía al entregable.
import type { CanalId } from './mock-data'

/** Fotos por canal (ids de Unsplash). El tipo de local tiene que pegarle al canal. */
const FOTOS_POR_CANAL: Record<CanalId, readonly string[]> = {
  // Tiendas de barrio: cartel de "OPEN", mostrador con POS, góndolas chicas, verdulería.
  horizontal: [
    'photo-1472851294608-062f824d29cc',
    'photo-1556740738-b6a63e27c4df',
    'photo-1542838132-92c53300491e',
    'photo-1534723452862-4c874018d66d',
  ],
  // Distribuidores, restaurantes y hoteles: salón, galería comercial, mostrador, vidriera.
  tradicional: [
    'photo-1567521464027-f127ff144326',
    'photo-1481437156560-3205f6a55735',
    'photo-1556740738-b6a63e27c4df',
    'photo-1441986300917-64674bd600d8',
  ],
  // Grandes volúmenes: depósitos con racks y centros de distribución con pallets.
  mayorista: [
    'photo-1553413077-190dd305871c',
    'photo-1586528116311-ad8dd3c8310d',
    'photo-1578916171728-46686eac8d58',
  ],
  // Cadenas: pasillos de supermercado.
  supermercado: [
    'photo-1604719312566-8912e9227c6a',
    'photo-1580913428023-02c695666d61',
    'photo-1578916171728-46686eac8d58',
    'photo-1534723452862-4c874018d66d',
  ],
  // Fuera de la capital: camión en ruta, y comercio de pueblo.
  provincia: [
    'photo-1519003722824-194d4455a60c',
    'photo-1601584115197-04ecc0da31d7',
    'photo-1542838132-92c53300491e',
  ],
  // Ventas online: paquetes y el centro de fulfilment.
  ecommerce: [
    'photo-1595246140625-573b715d11dc',
    'photo-1553062407-98eeb64c6a62',
    'photo-1586528116311-ad8dd3c8310d',
  ],
}

// 16:9 recortado del lado del CDN: se transfiere solo lo que se muestra, y todas las fotos llegan con
// el mismo encuadre (si no, el carrousel salta de alto al pasar de una a otra).
const PARAMS = 'w=900&h=506&fit=crop&crop=entropy&q=75&fm=jpg'

/** Hash estable de un string → entero. Misma entrada, misma selección de fotos, siempre. */
function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Fotos de un punto de entrega. La cantidad varía (2 a 4) según el punto: una galería donde TODOS
 * tienen exactamente la misma cantidad se lee como plantilla, no como datos.
 *
 * Se arranca en un offset distinto por punto, así dos locales del mismo canal no muestran las fotos
 * en el mismo orden.
 */
export function fotosDePunto(puntoEntregaId: string, canal: CanalId): string[] {
  const pool = FOTOS_POR_CANAL[canal]
  const semilla = hash(puntoEntregaId)
  const cantidad = Math.min(pool.length, 2 + (semilla % 3))
  const offset = semilla % pool.length
  return Array.from(
    { length: cantidad },
    (_, i) => `https://images.unsplash.com/${pool[(offset + i) % pool.length]}?${PARAMS}`,
  )
}

// ── Fallback offline ──────────────────────────────────────────────────────────────────────────
// Ilustración plana y geométrica (cielo, siluetas de fondo, vereda y una fachada con su toldo). Plana
// a propósito: simular una foto en SVG queda peor que un placeholder que se lee como tal.
//
// Sin texto DENTRO del SVG: el nombre del cliente lleva acentos y meterlo obligaría a codificar UTF-8
// en el data URI. El epígrafe se dibuja en HTML sobre la imagen (ver PuntoEntregaDialog).

/** Paletas: [cielo claro, cielo oscuro, edificios de fondo, fachada, acento del toldo]. */
const PALETAS = [
  ['#dbeafe', '#93c5fd', '#94a3b8', '#e2e8f0', '#e11d48'],
  ['#fef3c7', '#fcd34d', '#a8a29e', '#f5f5f4', '#0d9488'],
  ['#e0f2fe', '#7dd3fc', '#8da2b8', '#eef2f6', '#ea580c'],
  ['#fae8ff', '#e9a5f7', '#a1a1aa', '#f4f4f5', '#7c3aed'],
  ['#dcfce7', '#86efac', '#9ca3af', '#f3f4f6', '#a16207'],
  ['#ffe4e6', '#fda4af', '#a3a3a3', '#f5f5f5', '#0891b2'],
] as const

export function ilustracionDePunto(puntoEntregaId: string): string {
  const semilla = hash(puntoEntregaId)
  const [cieloA, cieloB, fondo, fachada, acento] = PALETAS[semilla % PALETAS.length]
  const W = 900
  const H = 506
  const horizonte = 340

  const bloques = Array.from({ length: 7 }, (_, i) => {
    const alto = 60 + ((semilla >> (i * 2)) % 90) + (i % 2) * 20
    return `<rect x="${i * 132}" y="${horizonte - alto}" width="116" height="${alto}" fill="${fondo}" opacity="0.55" rx="3"/>`
  }).join('')

  const fx = 250
  const fw = 400
  const fy = horizonte - 176
  const ventanas = Array.from({ length: 4 }, (_, i) => {
    return `<rect x="${fx + 30 + i * 62}" y="${fy + 36}" width="42" height="42" fill="${cieloB}" opacity="0.8" rx="3"/>`
  }).join('')
  const rayas = Array.from({ length: 8 }, (_, i) =>
    i % 2 === 0
      ? `<rect x="${fx + (i * fw) / 8}" y="${fy + 102}" width="${fw / 8}" height="28" fill="${acento}"/>`
      : '',
  ).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${cieloA}"/><stop offset="1" stop-color="${cieloB}"/></linearGradient></defs>`
    + `<rect width="${W}" height="${H}" fill="url(#c)"/>${bloques}`
    + `<rect x="0" y="${horizonte}" width="${W}" height="${H - horizonte}" fill="#cbd5e1"/>`
    + `<rect x="0" y="${horizonte + 52}" width="${W}" height="6" fill="#94a3b8" opacity="0.6"/>`
    + `<rect x="${fx}" y="${fy}" width="${fw}" height="176" fill="${fachada}" rx="4"/>${ventanas}`
    + `<rect x="${fx}" y="${fy + 102}" width="${fw}" height="28" fill="${acento}" opacity="0.35"/>${rayas}`
    + `<rect x="${fx + fw / 2 - 36}" y="${fy + 134}" width="72" height="42" fill="${acento}" opacity="0.75" rx="2"/>`
    + `<rect x="${fx + 16}" y="${fy + 12}" width="${fw - 32}" height="18" fill="${acento}" opacity="0.5" rx="9"/>`
    + `</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
