// Pools de nombres y anclas geográficas del mock data. SOLO datos, cero lógica: la generación vive en
// mock-data.ts y el azar determinista en mock-random.ts.
//
// Están separados en su propio módulo porque son largos y se tocan por otra razón que la lógica
// (agregar nombres, corregir una coordenada), y mezclarlos hacía ilegible mock-data.ts.
//
// Regla: los nombres de clientes se COMPONEN (prefijo × nombre) y se exige unicidad global. Con
// listas escritas a mano y ~200 pedidos, los repetidos son inevitables — y un cliente repetido no es
// solo fealdad: rompe el conteo de "clientes distintos" del resumen por canal.

// ── Nombres para componer razones sociales ────────────────────────────────────────────────────
// Barrios, zonas y mercados reales de Santa Cruz de la Sierra: dan nombres verosímiles y de paso
// sirven como direcciones de punto de entrega.
export const LUGARES_SCZ = [
  'Equipetrol', 'Urbari', 'Sirari', 'Las Palmas', 'Los Cusis', 'El Bajío', 'Guaracachi',
  'Pampa de la Isla', 'Plan 3000', 'Villa 1ro de Mayo', 'La Cuchilla', 'El Trompillo',
  'Cañoto', 'Grigotá', 'Santos Dumont', 'Alto San Pedro', 'Barrio Lindo', 'La Morita',
  'Los Chacos', 'El Palmar', 'San Aurelio', 'Villa Warnes', 'El Dorado', 'Nuevo Palmar',
  'Los Tusequis', 'La Ramada', 'Mutualista', 'Radial 10', 'Los Lotes', 'El Remanso',
  'Cotoca Viejo', 'La Cañada', 'Satélite Norte', 'Villa Primero', 'Los Mangales',
] as const

// Advocaciones y apellidos: el otro lado del nombre comercial ("Comercial San Jorge").
export const NOMBRES_COMERCIALES = [
  'Doña Rosa', 'San Martín', 'Santa Rosa', 'El Carmen', 'San Jorge', 'La Pascana', 'El Trigal',
  'Vallejos', 'Guapay', 'Los Pozos', 'San Silvestre', 'El Bosque', 'La Colina', 'San Isidro',
  'Las Brisas', 'El Fuerte', 'San Miguel', 'La Merced', 'Santa Bárbara', 'El Progreso',
  'San Rafael', 'La Esperanza', 'El Porvenir', 'San Antonio', 'La Guardia', 'El Milagro',
  'Santa Ana', 'San Pedro', 'La Bendición', 'El Encuentro', 'San Lorenzo', 'La Victoria',
  'El Zafiro', 'San Julián', 'La Pradera', 'El Cristal', 'San Ramón', 'La Fortuna',
] as const

// Prefijos POR CANAL: el tipo de negocio tiene que pegarle al canal, si no el dataset se lee falso
// (un "Mayorista" en el canal de tiendas de barrio).
export const PREFIJOS_POR_CANAL = {
  horizontal: ['Tienda', 'Almacén', 'Minimarket', 'Abarrotes', 'Kiosco', 'Bodega', 'Pulpería', 'Despensa'],
  tradicional: ['Comercial', 'Distribuidora', 'Casa', 'Importadora', 'Representaciones', 'Agencia'],
  mayorista: ['Mayorista', 'Depósito', 'Central de Abasto', 'Almacenera', 'Proveedora'],
  // Supermercados: cadenas reales del mercado boliviano + sucursal (ver SUCURSALES_CADENA).
  supermercado: ['Hipermaxi', 'Fidalga', 'IC Norte', 'Ketal', 'Slan Center', 'Tía', 'Súper Ecológico'],
  // Provincia: el nombre lo cierra la LOCALIDAD (ver LOCALIDADES), no un barrio de la capital.
  provincia: ['Distribuidora', 'Comercial', 'Mercado', 'Abarrotes', 'Depósito'],
  // Ecommerce no tiene razón social: el "cliente" es el número de pedido web.
  ecommerce: [] as string[],
} as const

/** Sucursales con las que se nombran los supermercados ("Fidalga Equipetrol"). */
export const SUCURSALES_CADENA = [
  'Norte', 'Sur', 'Centro', 'Este', 'Equipetrol', 'Cristo Rey', 'Las Brisas', 'Banzer',
  'Santos Dumont', 'Beni', 'Alemana', 'Paragua', 'Urubó', 'Villa 1ro', 'El Cristo',
  'Mutualista', 'Roca y Coronado', '3er Anillo', 'Radial 26', 'La Rotonda',
] as const

// ── Geografía ────────────────────────────────────────────────────────────────────────────────
// Centro de cada ZONA de la capital. Ya NO genera coordenadas: es el punto de referencia de la zona
// (encuadres, "qué tan al norte cae esto") y el criterio con el que se armó `PUNTOS_CALLE_SCZ`.
export const ANCLAS_ZONA = {
  norte: { lat: -17.7420, lng: -63.1780 },
  sur: { lat: -17.8320, lng: -63.1760 },
  centro: { lat: -17.7835, lng: -63.1810 },
  este: { lat: -17.7900, lng: -63.1180 },
} as const

/**
 * Puntos de entrega posibles: coordenadas SOBRE CALLES REALES de Santa Cruz, agrupadas por zona.
 *
 * POR QUÉ ES UN POOL Y NO UN CÁLCULO. Antes cada punto se sorteaba con jitter uniforme de ±0,022°
 * alrededor del ancla de su zona. Eso es un cuadrado de casi 5 km de lado, y un cuadrado no sabe dónde
 * hay ciudad: los pines caían en el lecho del Río Piraí, en las lagunas de oxidación y en campo abierto
 * al que no llega ninguna calle. Se veía exactamente como lo que era —un punto al azar— y encima
 * arruinaba el ruteo, porque el motor tenía que arrastrar la parada cientos de metros hasta la vía más
 * cercana antes de poder trazar nada.
 *
 * No hay fórmula que arregle eso. "Dónde hay calle" no se deduce de un centro y un radio; es un dato, y
 * el dato existe. Estas coordenadas SON el dato.
 *
 * DE DÓNDE SALEN. Una consulta a Overpass por las vías `residential|tertiary|secondary` con nombre del
 * área urbana, tomando el centro de cada tramo; los tramos se asignaron a la zona de su ancla más cercana
 * dentro de 2,6 km (el mismo alcance que tenía el jitter, ahora solo sobre calle) y se adelgazaron con
 * una grilla de ~250 m para que una avenida larga no aporte cuarenta puntos pegados. Verificado con
 * `/nearest` de OSRM: el enganche a la calle más cercana va de 0,2 a 22 m.
 *
 * SIGUE SIENDO UN DATASET GENERADO. El PRNG elige de esta lista igual que elige un nombre de
 * `NOMBRES_COMERCIALES`: cambiar la semilla sigue moviendo todos los puntos, solo que ahora los mueve
 * entre lugares donde un camión puede llegar. 110 por zona alcanzan de sobra — el dataset usa ~200
 * puntos distintos entre las cuatro.
 *
 * PARA REGENERARLO con otra ciudad o más densidad: la consulta y el criterio están arriba; es un trabajo
 * offline, no algo que la app tenga que hacer al arrancar.
 *
 * ⚠️ EL ORDEN ES `[lat, lng]` —el de Leaflet—, no el de GeoJSON. Son tuplas y no `{ lat, lng }` porque
 * son 440 filas y en objetos el archivo se triplicaba.
 */
// El tipo se declara y no se infiere con `as const`: inferido, cada par sería su propio tipo literal
// (`readonly [-17.741, -63.1783]`) y `rand.pick` no puede elegir de una lista de 110 tipos distintos.
// Las claves se atan a `ANCLAS_ZONA` para que agregar una zona sin sus calles no compile.
export const PUNTOS_CALLE_SCZ: Record<keyof typeof ANCLAS_ZONA, readonly (readonly [number, number])[]> = {
  norte: [
    [-17.741, -63.1783], [-17.7411, -63.1788], [-17.7439, -63.179], [-17.743, -63.1753], [-17.7449, -63.1786], [-17.7445, -63.1752],
    [-17.7407, -63.1823], [-17.7465, -63.1789], [-17.7441, -63.1823], [-17.7468, -63.1785], [-17.7402, -63.1727], [-17.7449, -63.173],
    [-17.7421, -63.1843], [-17.7409, -63.1843], [-17.7465, -63.1824], [-17.7449, -63.1843], [-17.7469, -63.184], [-17.744, -63.1699],
    [-17.7503, -63.1798], [-17.7507, -63.1787], [-17.7449, -63.1867], [-17.7489, -63.1839], [-17.7487, -63.1716], [-17.7413, -63.1685],
    [-17.7384, -63.1868], [-17.7493, -63.1721], [-17.7516, -63.1772], [-17.7457, -63.1685], [-17.7411, -63.1674], [-17.7516, -63.1731],
    [-17.7518, -63.183], [-17.7422, -63.1896], [-17.7429, -63.1662], [-17.7444, -63.1661], [-17.741, -63.1656], [-17.7493, -63.188],
    [-17.7519, -63.1708], [-17.754, -63.1793], [-17.7529, -63.184], [-17.7542, -63.1757], [-17.7499, -63.1678], [-17.7427, -63.1913],
    [-17.7412, -63.1915], [-17.747, -63.1654], [-17.7453, -63.1913], [-17.7553, -63.1766], [-17.7518, -63.1876], [-17.7541, -63.1845],
    [-17.7525, -63.1687], [-17.7437, -63.1635], [-17.7538, -63.17], [-17.7466, -63.1926], [-17.7544, -63.1863], [-17.7567, -63.1765],
    [-17.7566, -63.1809], [-17.7568, -63.1759], [-17.7467, -63.1631], [-17.7523, -63.1894], [-17.7499, -63.1914], [-17.7398, -63.1617],
    [-17.7569, -63.1722], [-17.7565, -63.1849], [-17.7443, -63.1612], [-17.7538, -63.1897], [-17.7474, -63.1941], [-17.7539, -63.1661],
    [-17.7409, -63.1607], [-17.7423, -63.1606], [-17.758, -63.1831], [-17.7573, -63.1708], [-17.7595, -63.178], [-17.7464, -63.1602],
    [-17.7565, -63.1674], [-17.7503, -63.1616], [-17.759, -63.1726], [-17.7595, -63.1745], [-17.75, -63.1947], [-17.7581, -63.1865],
    [-17.7423, -63.1585], [-17.7542, -63.1632], [-17.7594, -63.1702], [-17.7466, -63.1587], [-17.7523, -63.1609], [-17.7457, -63.158],
    [-17.7615, -63.1764], [-17.7409, -63.1575], [-17.7564, -63.192], [-17.7566, -63.1642], [-17.7613, -63.1738], [-17.7598, -63.1687],
    [-17.7595, -63.188], [-17.7616, -63.1822], [-17.762, -63.1791], [-17.7613, -63.1851], [-17.7622, -63.1731], [-17.7419, -63.1562],
    [-17.7588, -63.165], [-17.7615, -63.1865], [-17.7619, -63.1702], [-17.7569, -63.1621], [-17.7538, -63.1968], [-17.7589, -63.1921],
    [-17.7472, -63.156], [-17.7456, -63.1556], [-17.7529, -63.1581], [-17.7406, -63.1551], [-17.7614, -63.1892], [-17.7588, -63.1624],
    [-17.7626, -63.1683], [-17.7619, -63.1653],
  ],
  sur: [
    [-17.8326, -63.1749], [-17.8287, -63.1798], [-17.8277, -63.1725], [-17.8342, -63.1702], [-17.8262, -63.1733], [-17.8369, -63.1805],
    [-17.8256, -63.1774], [-17.8256, -63.1793], [-17.8306, -63.1681], [-17.8298, -63.1841], [-17.8337, -63.1843], [-17.8365, -63.1833],
    [-17.8401, -63.1737], [-17.8237, -63.1787], [-17.8284, -63.1676], [-17.8237, -63.1795], [-17.8233, -63.1728], [-17.8413, -63.1766],
    [-17.8364, -63.1846], [-17.8414, -63.1736], [-17.8396, -63.169], [-17.8341, -63.1867], [-17.8383, -63.1672], [-17.8357, -63.1657],
    [-17.8225, -63.1705], [-17.8429, -63.1745], [-17.8228, -63.1685], [-17.8394, -63.1855], [-17.8208, -63.1719], [-17.827, -63.1647],
    [-17.8331, -63.1886], [-17.8441, -63.1749], [-17.8258, -63.1649], [-17.8202, -63.1804], [-17.8381, -63.1875], [-17.8446, -63.1772],
    [-17.8207, -63.1696], [-17.8233, -63.1661], [-17.8371, -63.1633], [-17.8409, -63.1656], [-17.8348, -63.1621], [-17.8212, -63.1672],
    [-17.8253, -63.1635], [-17.8418, -63.1657], [-17.8457, -63.1791], [-17.818, -63.1772], [-17.8181, -63.1734], [-17.8188, -63.1823],
    [-17.8465, -63.1739], [-17.8299, -63.1606], [-17.8423, -63.1876], [-17.8348, -63.1604], [-17.8438, -63.1652], [-17.8162, -63.1771],
    [-17.8254, -63.1609], [-17.8392, -63.1612], [-17.8364, -63.16], [-17.8193, -63.1865], [-17.8162, -63.1719], [-17.8181, -63.185],
    [-17.8156, -63.1759], [-17.8423, -63.1896], [-17.8342, -63.1586], [-17.8475, -63.1837], [-17.8445, -63.1886], [-17.8401, -63.1922],
    [-17.8493, -63.1713], [-17.8155, -63.184], [-17.846, -63.1634], [-17.8135, -63.176], [-17.8474, -63.1644], [-17.8441, -63.1604],
    [-17.8128, -63.1766], [-17.8477, -63.1876], [-17.8513, -63.1762], [-17.8197, -63.1917], [-17.8145, -63.1661], [-17.8344, -63.1969],
    [-17.8383, -63.156], [-17.8504, -63.1674], [-17.8127, -63.1825], [-17.839, -63.156], [-17.8487, -63.1635], [-17.8186, -63.1924],
    [-17.8135, -63.186], [-17.8528, -63.178], [-17.8526, -63.1797], [-17.8526, -63.1718], [-17.812, -63.1689], [-17.8476, -63.1609],
    [-17.811, -63.1808], [-17.8251, -63.1976], [-17.8101, -63.1782], [-17.8491, -63.1906], [-17.833, -63.1992], [-17.8466, -63.1585],
    [-17.8542, -63.1772], [-17.8357, -63.1529], [-17.8197, -63.1957], [-17.849, -63.1915], [-17.8372, -63.199], [-17.8176, -63.1944],
    [-17.8304, -63.1999], [-17.8106, -63.1845], [-17.8356, -63.1997], [-17.8513, -63.163], [-17.8235, -63.1986], [-17.8129, -63.1898],
    [-17.819, -63.1964], [-17.85, -63.1603],
  ],
  centro: [
    [-17.7811, -63.1807], [-17.7819, -63.1839], [-17.787, -63.1822], [-17.7861, -63.1842], [-17.7839, -63.176], [-17.7787, -63.1825],
    [-17.7864, -63.1855], [-17.7874, -63.1875], [-17.7832, -63.1888], [-17.789, -63.1864], [-17.7847, -63.1721], [-17.7751, -63.178],
    [-17.7867, -63.1897], [-17.7834, -63.1711], [-17.7893, -63.1891], [-17.7934, -63.1794], [-17.79, -63.173], [-17.7931, -63.185],
    [-17.7846, -63.1918], [-17.7736, -63.1755], [-17.7787, -63.1703], [-17.7942, -63.1762], [-17.7894, -63.1701], [-17.7826, -63.1685],
    [-17.7844, -63.1684], [-17.7955, -63.179], [-17.771, -63.1819], [-17.7919, -63.1914], [-17.7709, -63.1847], [-17.7781, -63.1684],
    [-17.7957, -63.1871], [-17.7967, -63.1852], [-17.7955, -63.1733], [-17.7884, -63.1951], [-17.7851, -63.166], [-17.771, -63.1727],
    [-17.7687, -63.183], [-17.7735, -63.1927], [-17.7685, -63.1801], [-17.7826, -63.1969], [-17.7988, -63.1827], [-17.7885, -63.1963],
    [-17.7974, -63.1739], [-17.7989, -63.1838], [-17.7929, -63.1675], [-17.7973, -63.1894], [-17.7687, -63.1746], [-17.7736, -63.1674],
    [-17.7909, -63.1964], [-17.7995, -63.1762], [-17.7846, -63.1635], [-17.7732, -63.1949], [-17.7826, -63.1988], [-17.7988, -63.1889],
    [-17.7793, -63.1635], [-17.77, -63.1696], [-17.787, -63.1988], [-17.7892, -63.1636], [-17.769, -63.1915], [-17.7658, -63.1804],
    [-17.7965, -63.1682], [-17.7778, -63.1988], [-17.7655, -63.1839], [-17.7694, -63.1686], [-17.7683, -63.192], [-17.7785, -63.1623],
    [-17.7963, -63.1951], [-17.7757, -63.1633], [-17.7656, -63.1755], [-17.7655, -63.1865], [-17.8013, -63.1873], [-17.7939, -63.1977],
    [-17.7961, -63.1659], [-17.7661, -63.1894], [-17.8015, -63.1741], [-17.8004, -63.1712], [-17.7744, -63.199], [-17.7728, -63.1981],
    [-17.7835, -63.1604], [-17.7786, -63.1609], [-17.7673, -63.1687], [-17.7634, -63.178], [-17.8038, -63.1834], [-17.7995, -63.1676],
    [-17.7692, -63.1965], [-17.7807, -63.2025], [-17.7633, -63.1863], [-17.784, -63.2028], [-17.7978, -63.197], [-17.7659, -63.1929],
    [-17.799, -63.166], [-17.7646, -63.1711], [-17.7904, -63.2022], [-17.7966, -63.1989], [-17.8038, -63.1886], [-17.7749, -63.2017],
    [-17.7789, -63.1586], [-17.7848, -63.1579], [-17.8038, -63.1902], [-17.794, -63.1606], [-17.7737, -63.1601], [-17.7944, -63.2014],
    [-17.7988, -63.1982], [-17.7636, -63.1926], [-17.7815, -63.2049], [-17.7658, -63.1654], [-17.7778, -63.1575], [-17.8032, -63.1938],
    [-17.8067, -63.1801], [-17.8048, -63.1708],
  ],
  este: [
    [-17.7897, -63.1192], [-17.7897, -63.1154], [-17.7877, -63.1202], [-17.7861, -63.1191], [-17.7913, -63.1226], [-17.7895, -63.1228],
    [-17.7872, -63.1224], [-17.7855, -63.114], [-17.7856, -63.1133], [-17.7833, -63.1166], [-17.7833, -63.1159], [-17.7947, -63.1239],
    [-17.7972, -63.1205], [-17.7857, -63.1246], [-17.7858, -63.1107], [-17.7969, -63.1128], [-17.7909, -63.1269], [-17.7811, -63.1226],
    [-17.7867, -63.1081], [-17.7836, -63.1261], [-17.781, -63.1133], [-17.7862, -63.1079], [-17.786, -63.1289], [-17.7809, -63.1111],
    [-17.7799, -63.124], [-17.7985, -63.1263], [-17.7997, -63.1248], [-17.7967, -63.1078], [-17.798, -63.1088], [-17.8013, -63.1223],
    [-17.8003, -63.1112], [-17.7784, -63.1222], [-17.7829, -63.1072], [-17.7915, -63.1048], [-17.7779, -63.1136], [-17.7975, -63.129],
    [-17.8019, -63.1123], [-17.7762, -63.1191], [-17.7931, -63.1032], [-17.7785, -63.1087], [-17.7759, -63.1222], [-17.7864, -63.1031],
    [-17.8046, -63.1161], [-17.7898, -63.1025], [-17.7965, -63.132], [-17.8041, -63.1126], [-17.8028, -63.1092], [-17.777, -63.1269],
    [-17.7997, -63.1052], [-17.7846, -63.1338], [-17.7998, -63.1313], [-17.7902, -63.135], [-17.7737, -63.1176], [-17.7748, -63.1244],
    [-17.7932, -63.1011], [-17.7737, -63.1204], [-17.7876, -63.1008], [-17.7741, -63.112], [-17.7809, -63.103], [-17.8066, -63.1217],
    [-17.8043, -63.1083], [-17.7779, -63.1054], [-17.807, -63.114], [-17.803, -63.1056], [-17.7778, -63.1316], [-17.7915, -63.1366],
    [-17.8024, -63.1315], [-17.7865, -63.1364], [-17.807, -63.126], [-17.7773, -63.1036], [-17.7869, -63.0984], [-17.7941, -63.1374],
    [-17.8073, -63.1095], [-17.7796, -63.1348], [-17.7711, -63.1144], [-17.7725, -63.1096], [-17.8062, -63.1289], [-17.7807, -63.1003],
    [-17.8091, -63.1143], [-17.7748, -63.1051], [-17.7817, -63.1366], [-17.8088, -63.112], [-17.776, -63.103], [-17.8098, -63.1213],
    [-17.8018, -63.101], [-17.807, -63.1292], [-17.8077, -63.1281], [-17.7927, -63.139], [-17.8091, -63.1263], [-17.7997, -63.0986],
    [-17.7701, -63.111], [-17.7701, -63.1251], [-17.7932, -63.0962], [-17.8066, -63.1323], [-17.8116, -63.1169], [-17.8114, -63.1213],
    [-17.771, -63.1069], [-17.81, -63.109], [-17.8119, -63.1188], [-17.7952, -63.0955], [-17.802, -63.0983], [-17.7728, -63.1031],
    [-17.8041, -63.0995], [-17.7686, -63.11], [-17.8089, -63.1314], [-17.8114, -63.1265], [-17.7955, -63.1413], [-17.7742, -63.1002],
    [-17.7692, -63.1289], [-17.7968, -63.1415],
  ],
}

/**
 * Localidades de provincia con su coordenada. La ciudad del pedido y su coordenada SALEN DE ACÁ
 * juntas: antes la ciudad se derivaba del número de pedido y podía contradecir el pin del mapa
 * (un pedido con coordenadas de Montero etiquetado "Cotoca").
 */
export const LOCALIDADES = [
  { nombre: 'Montero', ciudad: 'montero', lat: -17.3390, lng: -63.2530 },
  { nombre: 'Warnes', ciudad: 'warnes', lat: -17.5100, lng: -63.1680 },
  { nombre: 'La Guardia', ciudad: 'laguardia', lat: -17.8930, lng: -63.3200 },
  { nombre: 'Cotoca', ciudad: 'cotoca', lat: -17.7460, lng: -63.0570 },
  { nombre: 'Portachuelo', ciudad: 'montero', lat: -17.3520, lng: -63.3960 },
  { nombre: 'Mineros', ciudad: 'montero', lat: -17.1170, lng: -63.2330 },
  { nombre: 'Buena Vista', ciudad: 'montero', lat: -17.4600, lng: -63.6600 },
  { nombre: 'Okinawa', ciudad: 'warnes', lat: -17.2000, lng: -62.8830 },
  { nombre: 'Pailón', ciudad: 'cotoca', lat: -17.6500, lng: -62.7500 },
  { nombre: 'Cuatro Cañadas', ciudad: 'cotoca', lat: -17.4500, lng: -62.6000 },
  { nombre: 'San Carlos', ciudad: 'montero', lat: -17.4080, lng: -63.7150 },
  { nombre: 'El Torno', ciudad: 'laguardia', lat: -17.9770, lng: -63.3800 },
] as const

/** Tipos de vía para armar la dirección del punto de entrega. */
export const VIAS = ['calle', 'av.', 'pasaje', 'radial', 'anillo'] as const

// ── Personas ─────────────────────────────────────────────────────────────────────────────────
// Nombres de pila y apellidos (frecuentes en Bolivia) para componer vendedores, choferes,
// auxiliares y planificadores. Todos los nombres generados se exigen únicos entre sí.
export const NOMBRES_PILA = [
  'Mario', 'Julio', 'Ana', 'Carlos', 'Lucía', 'Rodrigo', 'Patricia', 'Diego', 'Elena', 'Sergio',
  'Verónica', 'Gustavo', 'Natalia', 'Hugo', 'Fernanda', 'Óscar', 'Marcela', 'Pablo', 'Silvia',
  'Ramiro', 'Daniela', 'Javier', 'Rosario', 'Iván', 'Gabriela', 'Nelson', 'Claudia', 'Alberto',
  'Mónica', 'Freddy',
] as const

export const APELLIDOS = [
  'Suárez', 'Rojas', 'Áñez', 'Mamani', 'Céspedes', 'Vaca', 'Justiniano', 'Quispe', 'Choque',
  'Terceros', 'Cuéllar', 'Flores', 'Ledezma', 'Sandoval', 'Chávez', 'Peña', 'Salinas', 'Ortiz',
  'Ríos', 'Torres', 'Méndez', 'Gutiérrez', 'Villarroel', 'Camacho', 'Paz', 'Arce', 'Salvatierra',
  'Ibáñez', 'Molina', 'Cabrera', 'Zambrana', 'Guzmán', 'Balcázar', 'Egüez', 'Roca', 'Barba',
  'Nogales', 'Antelo', 'Pedraza', 'Sosa',
] as const

// ── Catálogos y maestros ─────────────────────────────────────────────────────────────────────

/**
 * Sociedades (company). Antes eran códigos SAP genéricos (GV05, GV02…); el negocio pidió las
 * sociedades reales del grupo, así que acá van por nombre y no por código.
 */
export const CODIGOS_EMPRESA = ['VENADO', 'VEMASSA', 'FACRULESA'] as const

export const NOMBRES_ALMACEN = [
  'Planta Santa Cruz', 'CD Warnes', 'CD Montero', 'CD Norte', 'CD Sur', 'CD Cotoca',
] as const

export const NOMBRES_SUCURSAL = [
  'Sucursal Norte', 'Sucursal Sur', 'Sucursal Centro', 'Sucursal Este', 'Sucursal Equipetrol',
  'Sucursal Plan 3000', 'Sucursal Villa', 'Sucursal Montero', 'Sucursal Warnes', 'Sucursal Cotoca',
  'Sucursal La Guardia', 'Sucursal Urubó',
] as const

export const MOTIVOS_DEVOLUCION_POOL = [
  'Vencido', 'Dañado', 'Error de pedido', 'No recibido', 'Cambio', 'Faltante',
  'Empaque roto', 'Rechazo del cliente',
] as const

/** Localidades que nombran a las distribuidoras (distributorId). */
export const NOMBRES_DISTRIBUIDORA = [
  'Santa Cruz', 'Warnes', 'Montero', 'Cotoca', 'La Guardia', 'El Torno', 'Portachuelo',
  'Okinawa', 'Pailón', 'Mineros',
] as const

/** Letras de placa: la placa se arma como NNNN-LLL (formato boliviano). */
export const LETRAS_PLACA = [
  'ABC', 'XKD', 'QWE', 'MNB', 'TYU', 'VBN', 'GHJ', 'ZXC', 'JKL', 'LRT', 'PLM', 'RFV',
  'CDE', 'FGH', 'HJK', 'KLP', 'NBV', 'POI', 'RTY', 'SDF', 'UIO', 'WER', 'YHN', 'BGT',
  'CFT', 'DRE', 'EDC', 'FVG', 'GBH', 'HNJ', 'IKL', 'JMK', 'KOL', 'LPO', 'MJU', 'NHY',
  'OKM', 'PLK', 'QAZ', 'RSX',
] as const

/** Color de los camiones fuera de ruteo (mantenimiento, sin chofer): gris, no compiten en el mapa. */
export const COLOR_CAMION_INACTIVO = '#64748b'

/**
 * Catalogo de productos (`delivery_order_items.product_id`) CURADO para el mockup de Venado.
 *
 * Base: `../venado-productos.md` (fuentes oficiales de Grupo Venado / IVSA / VEMASSA / FACRULESA).
 * Se guarda una muestra utilizable para UI, no el documento entero: nombres visibles en tablas y
 * dialogos, mas metadata minima para no mezclar "Frio" y "Seco" de forma arbitraria.
 */
const CATALOGO = [
  { nombre: 'Mayonesa Real doypack', unidad: 'doypacks', empresa: 'IVSA', marca: 'Real', temperatura: 'Seco' },
  { nombre: 'Ketchup Real doypack', unidad: 'doypacks', empresa: 'IVSA', marca: 'Real', temperatura: 'Seco' },
  { nombre: 'Mostaza doypack', unidad: 'doypacks', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Salsa golf doypack', unidad: 'doypacks', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Extracto de tomate doypack', unidad: 'doypacks', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Llajua picante doypack', unidad: 'doypacks', empresa: 'IVSA', marca: 'Real', temperatura: 'Seco' },
  { nombre: 'Picante sabor gallina doypack', unidad: 'doypacks', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Atun en aceite vegetal', unidad: 'cajas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Caldo de gallina cubitos', unidad: 'cajas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Sopa de pollo con fideo sobre', unidad: 'sobres', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Crema de champinones sobre', unidad: 'sobres', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Maicena en caja', unidad: 'cajas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Kriskao clasico', unidad: 'cajas', empresa: 'IVSA', marca: 'Kriskao', temperatura: 'Seco' },
  { nombre: 'Corn Flakes caja', unidad: 'cajas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Avena instantanea', unidad: 'bolsas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Gelatina frutilla bolsa', unidad: 'bolsas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Flan vainilla', unidad: 'cajas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Pudin chocolate', unidad: 'cajas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Refresco Real naranja', unidad: 'sobres', empresa: 'IVSA', marca: 'Real', temperatura: 'Seco' },
  { nombre: 'Refresco Real mocochinchi', unidad: 'sobres', empresa: 'IVSA', marca: 'Real', temperatura: 'Seco' },
  { nombre: 'Nectar en polvo mango sobres', unidad: 'sobres', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Bebida isotonica naranja sobre', unidad: 'sobres', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Polvo para hornear Fleischmann', unidad: 'cajas', empresa: 'IVSA', marca: 'Fleischmann', temperatura: 'Seco' },
  { nombre: 'Mejorador de masa', unidad: 'bolsas', empresa: 'IVSA', marca: 'Kris', temperatura: 'Seco' },
  { nombre: 'Detergente polvo limon', unidad: 'bolsas', empresa: 'IVSA', marca: 'Bristar', temperatura: 'Seco' },
  { nombre: 'Lavavajillas limon', unidad: 'botellas', empresa: 'IVSA', marca: 'Bristar', temperatura: 'Seco' },
  { nombre: 'Limpia pisos lavanda', unidad: 'botellas', empresa: 'IVSA', marca: 'Bristar', temperatura: 'Seco' },
  { nombre: 'Limpia vidrios original', unidad: 'botellas', empresa: 'IVSA', marca: 'Bristar', temperatura: 'Seco' },
  { nombre: 'Lavandina Bristar sachet', unidad: 'sachets', empresa: 'IVSA', marca: 'Bristar', temperatura: 'Seco' },
  { nombre: 'Jabon liquido antibacterial', unidad: 'botellas', empresa: 'IVSA', marca: 'Bristar', temperatura: 'Seco' },
  { nombre: 'Alcohol en gel Shabay', unidad: 'botellas', empresa: 'IVSA', marca: 'Shabay', temperatura: 'Seco' },
  { nombre: 'Frussion Durazno', unidad: 'packs', empresa: 'VEMASSA', marca: 'Frussion', temperatura: 'Ambos' },
  { nombre: 'Frussion Manzana', unidad: 'packs', empresa: 'VEMASSA', marca: 'Frussion', temperatura: 'Ambos' },
  { nombre: 'Frussion Naranja nectar/pulpa', unidad: 'packs', empresa: 'VEMASSA', marca: 'Frussion', temperatura: 'Ambos' },
  { nombre: 'Frussion Mango', unidad: 'packs', empresa: 'VEMASSA', marca: 'Frussion', temperatura: 'Ambos' },
  { nombre: 'Mocochinchi', unidad: 'packs', empresa: 'VEMASSA', marca: 'Mocochinchi', temperatura: 'Ambos' },
  { nombre: 'Chicha Camba', unidad: 'packs', empresa: 'VEMASSA', marca: 'Chicha Camba', temperatura: 'Ambos' },
  { nombre: 'Agua Speranza', unidad: 'packs', empresa: 'VEMASSA', marca: 'Speranza', temperatura: 'Ambos' },
  { nombre: 'Agua Esperanza', unidad: 'packs', empresa: 'VEMASSA', marca: 'Esperanza', temperatura: 'Ambos' },
  { nombre: 'Energizante Raptor', unidad: 'packs', empresa: 'VEMASSA', marca: 'Raptor', temperatura: 'Ambos' },
  { nombre: 'De La Granja Pomelo con pulpa natural', unidad: 'packs', empresa: 'VEMASSA', marca: 'De La Granja', temperatura: 'Ambos' },
  { nombre: 'Crema Whip Topping Base', unidad: 'cajas', empresa: 'IVSA', marca: "Rich's", temperatura: 'Frío' },
  { nombre: 'Crema Ultra Rich UHT', unidad: 'cajas', empresa: 'IVSA', marca: 'Ultra Rich', temperatura: 'Frío' },
  { nombre: 'Crema Bettercreme Chocolate', unidad: 'cajas', empresa: 'IVSA', marca: 'Bettercreme', temperatura: 'Frío' },
  { nombre: 'Crema Bettercreme Vainilla', unidad: 'cajas', empresa: 'IVSA', marca: 'Bettercreme', temperatura: 'Frío' },
  { nombre: 'Crema Bettercreme Dulce de Leche', unidad: 'cajas', empresa: 'IVSA', marca: 'Bettercreme', temperatura: 'Frío' },
  { nombre: 'Levadura fresca', unidad: 'cajas', empresa: 'FACRULESA', marca: 'Fleischmann', temperatura: 'Frío' },
  { nombre: 'Levadura seca', unidad: 'cajas', empresa: 'FACRULESA', marca: 'Fleischmann', temperatura: 'Seco' },
  { nombre: 'Levadura seca instantanea masa dulce', unidad: 'cajas', empresa: 'FACRULESA', marca: 'Royal', temperatura: 'Seco' },
] as const

/**
 * Catálogo con su CÓDIGO SAP (`material` / `product_id` del snapshot de Ventas).
 *
 * El código se deriva de la posición en el catálogo y no se escribe a mano en cada entrada: son
 * sesenta productos, y una lista de sesenta números tipeados es una lista con un duplicado esperando.
 * Al derivarlo, agregar un producto no puede colisionar con otro.
 *
 * OJO CON ESTO CUANDO SE CONECTE DE VERDAD: el código real viene de SAP y NO es correlativo. Acá es
 * un stand-in con el formato correcto (8 dígitos), no un dato que se pueda cruzar con nada.
 */
export const PRODUCTOS = CATALOGO.map((producto, i) => ({
  ...producto,
  codigo: `4001${String((i + 1) * 13).padStart(4, '0')}`,
}))
