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

/** Mismo encuadre, más chico: la evidencia se muestra en un panel de 380 px, no a sangre. */
const PARAMS_EVIDENCIA = 'w=600&h=338&fit=crop&crop=entropy&q=70&fm=jpg'

const urlUnsplash = (id: string, params = PARAMS) => `https://images.unsplash.com/${id}?${params}`

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
  return Array.from({ length: cantidad }, (_, i) => urlUnsplash(pool[(offset + i) % pool.length]))
}

// ── Evidencia de la entrega ───────────────────────────────────────────────────────────────────
// `proof_of_deliveries.photo_url` / `signature_url` y `delivery_incidents.photo_url`
// (UltimaVersion.sql:436-437 y :464) son TEXT: el esquema guarda la URL, no el archivo. Acá se
// produce una URL que resuelve de verdad, para que el panel muestre la evidencia y no un badge que
// diga "hay foto".
//
// NO se inventan ids nuevos de Unsplash: los ids de este archivo están verificados (200 image/jpeg) y
// su CONTENIDO fue mirado uno por uno. Un id inventado devuelve 200 con cualquier cosa, y una foto de
// contenido desconocido en una pantalla de evidencia es peor que ninguna.

/** Verificada a ojo: dos cajas de cartón sobre fondo claro. Sirve de mercadería/paquete. */
const FOTO_PAQUETE = 'photo-1595246140625-573b715d11dc'

/** Qué retrata la foto de una incidencia: la MERCADERÍA o el LUGAR donde pasó. */
export type EvidenciaFoto = 'mercaderia' | 'lugar'

/**
 * Foto de la incidencia. Las de producto se ilustran con la mercadería; las de acceso, demora o
 * rechazo, con el propio punto de entrega — que es lo que el chofer tiene delante cuando reporta.
 * Reusar la foto del punto no es un atajo: es la misma que ya está en su galería, así que la evidencia
 * y el lugar se leen como el mismo sitio.
 */
export function fotoDeIncidencia(retrata: EvidenciaFoto, puntoEntregaId: string, canal: CanalId): string {
  if (retrata === 'mercaderia') return fotoDeMercaderia()
  return fotosDePunto(puntoEntregaId, canal)[0]
}

/**
 * La foto de mercadería sola, para cualquier pantalla que necesite evidencia de un PRODUCTO y no
 * tenga un punto de entrega ni un canal a mano (ej. devoluciones). Mismo id verificado que usa
 * `fotoDeIncidencia`, sin los parámetros que solo tienen sentido para una entrega.
 */
export function fotoDeMercaderia(): string {
  return urlUnsplash(FOTO_PAQUETE, PARAMS_EVIDENCIA)
}

/**
 * Fotos del comprobante: la carga descargada y el punto donde se entregó. Son DOS y no cuatro a
 * propósito — el panel prueba que la evidencia existe y se puede abrir, no es una galería.
 */
export function fotosDeComprobante(puntoEntregaId: string, canal: CanalId): string[] {
  return [urlUnsplash(FOTO_PAQUETE, PARAMS_EVIDENCIA), fotosDePunto(puntoEntregaId, canal)[0]]
}

/**
 * `signature_url`: la firma del receptor, generada como SVG y no traída de un banco de imágenes.
 *
 * Una firma capturada en el celular es un trazo sobre un canvas, así que un SVG la retrata MEJOR que
 * una foto de stock — y además va inline como data URI, así que existe sin red y sobrevive a la
 * exportación a Figma. El trazo se deriva del nombre: el mismo receptor firma siempre igual, que es la
 * propiedad que haría sospechar si no se cumpliera.
 *
 * Fondo blanco explícito: es papel. Sin él, en tema oscuro la tinta quedaría invisible.
 */
export function firmaDeComprobante(receptor: string): string {
  const h = hash(receptor || 'sin receptor')
  /** Jitter determinista por punto de control: da una firma distinta por persona. */
  const j = (i: number, amplitud = 22) => ((h >> (i * 3)) % (amplitud * 2)) - amplitud
  const W = 320
  const H = 120

  // Un lazo de arranque (la "mayúscula") y después tramos cortos y alternados. Con tramos largos el
  // trazo salía como una onda suave, que se lee más como un gráfico que como una firma: lo que la hace
  // parecer escritura es que los picos sean angostos y desiguales.
  const trazo =
    `M 20 ${86 + j(0, 8)} C ${30 + j(1, 6)} ${34 + j(2, 12)}, ${58 + j(3, 8)} ${28 + j(4, 10)}, ${52 + j(5, 6)} ${74 + j(6, 10)}` +
    ` C ${70 + j(7, 6)} ${30 + j(8, 12)}, ${86 + j(1, 6)} ${88 + j(2, 8)}, ${104 + j(3, 6)} ${52 + j(4, 12)}` +
    ` S ${132 + j(5, 8)} ${22 + j(6, 10)}, ${146 + j(7, 6)} ${76 + j(8, 10)}` +
    ` S ${178 + j(2, 8)} ${30 + j(3, 12)}, ${196 + j(4, 6)} ${58 + j(5, 10)}` +
    ` S ${228 + j(6, 8)} ${94 + j(7, 8)}, ${244 + j(8, 6)} ${46 + j(1, 12)}` +
    ` S ${282 + j(3, 8)} ${20 + j(4, 10)}, ${302 + j(5, 6)} ${62 + j(6, 10)}`
  const rubrica = `M ${30 + j(4, 10)} 102 C 118 ${110 + j(5, 6)}, 202 ${92 + j(6, 8)}, 296 ${104 + j(7, 5)}`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    `<path d="${trazo}" fill="none" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="${rubrica}" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" opacity="0.65"/>` +
    `</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
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
