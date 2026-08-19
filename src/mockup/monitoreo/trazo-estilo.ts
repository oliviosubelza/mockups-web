// Estilo y nombre de cada TRAZO del mapa de monitoreo.
//
// Vive aparte del mapa porque lo leen TRES piezas: el mapa que dibuja las líneas, la leyenda que las
// explica y el menú de capas que las prende y apaga. Con las constantes dentro de `SeguimientoMapa`, la
// barra de herramientas tenía que importar del componente que a su vez la importa —un ciclo— o recibir el
// color como prop suelto, que es la forma de que la muestra del menú y la línea del mapa terminen de
// colores distintos.
//
// Es el mismo movimiento que `map/tiles` para las capas base: lo compartido es el vocabulario, no el
// componente.

/**
 * Estilo de cada TRAZO. Codifican TIEMPO —qué ya pasó, qué falta, qué está pasando— y no la identidad
 * del camión, que es lo que codificaban antes.
 *
 * POR QUÉ NO EL COLOR DEL VIAJE. Era `viaje.color`, heredado del planificador, y estaba mal por dos
 * razones que se suman:
 *
 *   1. NO DISTINGUE NADA. En el plan el color ES la identidad de la ruta y tiene que serlo: hay seis
 *      conviviendo en el mismo mapa y el color es lo único que dice cuál es cuál. Acá hay UN viaje, así
 *      que el canal más fuerte del mapa estaba gastado en información que ya está en el encabezado.
 *   2. PISABA LA PALETA DE ESTADOS. `#16a34a` está en la paleta de camiones Y es exactamente el color de
 *      `entregado`. Cuando a este camión le tocaba el verde, el recorrido completo quedaba del mismo
 *      verde que significa "entregado". Un color que significa dos cosas no significa ninguna.
 *
 * SOBRE EL GRIS DE `hecho`, que empezó en slate-400 (`#94a3b8`) y no se veía. El error fue elegirlo
 * contra el fondo equivocado: se probó sobre el OSM de calles, que es blanco y beige, y el fondo por
 * defecto pasó a ser CARTO Positron, que es gris. Gris claro sobre gris claro no es una jerarquía
 * discreta, es un trazo que desaparece — y encima Positron dibuja sus propias calles en ese mismo tono,
 * así que el recorrido se leía como una avenida más del mapa. slate-500 mantiene el papel de "esto ya
 * pasó" y se distingue del fondo.
 *
 * NINGUNO VA PUNTEADO, y eso también es una corrección. El punteado de `falta` quería decir "todavía no
 * pasó por acá", pero a la escala en que se mira el mapa se leía como una línea rota o de menor calidad,
 * y contra un fondo con muchas calles cortas competía con ellas. La diferencia entre pasado y futuro la
 * llevan bien el TONO y el GROSOR, que son dos canales y no necesitan que la línea se rompa.
 */
export const TRAZO = {
  /** Ya recorrido: gris medio, delgado. Es historia — presente pero abajo de todo. */
  hecho: { color: '#64748b', weight: 3, opacity: 0.75 },
  /** Lo que falta: gris casi negro. Sólido y un punto más gruesa: es lo que se viene. */
  falta: { color: '#1e293b', weight: 3.5, opacity: 0.9 },
  /** El tramo en curso: el azul de `en_camino`, el más grueso. Es lo único que pasa AHORA. */
  ahora: { color: '#2563eb', weight: 5, opacity: 1 },
} as const

/** Etiquetas de los trazos. Las comparten la leyenda del mapa y el menú de capas: un solo vocabulario. */
export const TRAZO_LABEL = {
  hecho: 'Ya recorrido',
  falta: 'Por recorrer',
  ahora: 'Tramo en curso',
} as const

export type ClaveTrazo = keyof typeof TRAZO

/** Orden en que se listan, del pasado al presente. Un solo lugar decide el orden de leyenda y menú. */
export const CLAVES_TRAZO: ClaveTrazo[] = ['hecho', 'falta', 'ahora']
