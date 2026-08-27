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

/**
 * El gris SIN CLAVE: «World Light Gray Canvas» de Esri, el mismo proveedor del satélite que ya se usa.
 *
 * Viene partido en dos capas —el fondo por un lado y los rótulos por otro— y hay que apilarlas. Es una
 * molestia mínima al lado de lo que resuelve: hasta ahora la capa gris SOLO existía con una clave de
 * CARTO en el `.env`, así que en la práctica nadie la veía y todos los mapas caían al OSM de calles,
 * que pinta las avenidas de naranja y amarillo y compite con lo único que en estas pantallas es dato
 * —el color de la ruta, el del canal, el del estado de la entrega—.
 */
const ESRI_GRIS_BASE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const ESRI_GRIS_ROTULOS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'

export const TILES: Record<CapaBase, string> = {
  calles: CALLES_TILES,
  // CARTO si hay clave —tiene mejor detalle de calles— y Esri si no. Las dos son grises, así que la
  // opción del menú significa lo mismo en los dos casos y no hay que explicarle al usuario cuál le
  // tocó.
  suave: CARTO_API_KEY
    ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_API_KEY)}`
    : ESRI_GRIS_BASE,
  satelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

/**
 * Capa de RÓTULOS que va encima de la base, cuando la base no los trae.
 *
 * Solo la necesita el gris de Esri: el `light_all` de CARTO ya viene con los nombres puestos. Sin esto
 * el fondo gris queda mudo —sin nombres de avenida ni de barrio— y un planificador que no puede leer
 * la calle no puede decidir nada.
 */
export const TILES_ROTULOS: Partial<Record<CapaBase, string>> = {
  suave: CARTO_API_KEY ? undefined : ESRI_GRIS_ROTULOS,
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
  // El gris va PRIMERO: es el que estas pantallas quieren casi siempre, y el orden de un menú es una
  // recomendación. Ya no está condicionado a la clave de CARTO — ver `TILES`.
  { valor: 'suave', label: 'Calles en gris' },
  { valor: 'calles', label: 'Calles' },
  { valor: 'satelite', label: 'Satélite' },
]

/**
 * La capa con la que arranca CUALQUIER mapa del sistema: la GRIS, siempre.
 *
 * En estas pantallas EL COLOR ES DATO —el de la ruta asignada, el del canal del cliente, el
 * verde/ámbar/rojo del estado de una entrega—. El OSM de calles pinta avenidas de amarillo y naranja,
 * así que compite con todo lo que se dibuja encima.
 *
 * Antes esto decía `CARTO_API_KEY ? 'suave' : 'calles'`, y como la clave no está puesta en ningún lado
 * el default REAL era el mapa a todo color. Con el gris de Esri como resguardo (ver `TILES`) la capa
 * gris existe siempre y ya no hay dos comportamientos según el `.env`.
 *
 * ATRIBUCIÓN: todos los proveedores exigen crédito. Las pantallas del mockup montan con
 * `attributionControl={false}`; hay que reponerlo antes de producción.
 */
export const CAPA_POR_DEFECTO: CapaBase = 'suave'
