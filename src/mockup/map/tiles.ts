// Capas base de TODOS los mapas del mockup: sus URLs, sus subdominios y cuál viene puesta por defecto.
//
// POR QUÉ UN ARCHIVO. Estas tres URLs estaban copiadas en cuatro mapas (planificación, monitoreo, el de
// órdenes y el editor de zonas), cada uno con su propio objeto y su propio default. Eso ya se había
// notado: el editor de planificación tenía la capa gris y el monitoreo no, y agregarla fue copiar la URL
// una quinta vez. Una capa nueva —o un proveedor que cambia de dominio— tiene que ser UN cambio.
//
// Lo que NO vive acá es el control de capas: cada pantalla tiene su propia forma de elegir (un menú
// desplegable en planificación y monitoreo, el `LayersControl` de Leaflet en el de órdenes) porque
// depende de dónde están sus paneles. Lo compartido es de dónde salen las teselas, no cómo se eligen.

/** Las capas base disponibles. El orden es el que se muestra en los menús: de más a menos detalle. */
export type CapaBase = 'calles' | 'suave' | 'satelite'

const CALLES_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY?.trim()

export const TILES: Record<CapaBase, string> = {
  calles: CALLES_TILES,
  suave: CARTO_API_KEY
    ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_API_KEY)}`
    : CALLES_TILES,
  satelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

/**
 * Subdominios de cada proveedor. CARTO sirve desde a–d y OSM desde a–c; sin esto, Leaflet pide teselas
 * a un host que no existe y la capa aparece con huecos. Cuando no hay clave de CARTO, `suave` también
 * apunta a OSM como resguardo para estados antiguos que todavía tengan esa capa seleccionada.
 *
 * Esri no usa `{s}` en su URL, así que su valor no se lee nunca — está para que el registro sea total y
 * nadie tenga que preguntarse si falta una entrada.
 */
export const SUBDOMINIOS: Record<CapaBase, string> = {
  calles: 'abc',
  suave: 'abcd',
  satelite: 'abc',
}

/**
 * Nombre de cada capa en los menús. Al lado de las URLs para que sumar una capa sea un solo lugar.
 *
 * "Calles en gris" y no "Positron" ni "Claro": el nombre tiene que decir qué se ve, no qué producto es.
 */
export const CAPAS_BASE: { valor: CapaBase; label: string }[] = [
  { valor: 'calles', label: 'Calles' },
  ...(CARTO_API_KEY ? [{ valor: 'suave' as const, label: 'Calles en gris' }] : []),
  { valor: 'satelite', label: 'Satélite' },
]

/**
 * La capa con la que arranca CUALQUIER mapa del sistema.
 *
 * Es `suave` (CARTO Positron) cuando `VITE_CARTO_API_KEY` está configurada. CARTO exige una clave para
 * sus teselas raster; sin ella devuelve un mapa con la marca "API KEY REQUIRED". En ese caso se usa
 * `calles` y la opción gris no se muestra en los menús.
 *
 * La capa gris sigue siendo la preferida porque en estos mapas EL COLOR ES DATO: el color de la ruta
 * asignada, el del canal del cliente, el verde/ámbar/rojo del estado de una entrega. El OSM de calles
 * pinta avenidas de amarillo y naranja, así que compite con la información superpuesta.
 *
 * ATRIBUCIÓN: todos los proveedores exigen crédito. Las pantallas del mockup montan con
 * `attributionControl={false}`; hay que reponerlo antes de producción.
 */
export const CAPA_POR_DEFECTO: CapaBase = CARTO_API_KEY ? 'suave' : 'calles'
