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
// Anclas por ZONA de la capital: las coordenadas de los pedidos se generan con jitter alrededor de
// su ancla, así los pines caen donde corresponde y el mapa no queda con puntos en el medio del campo.
export const ANCLAS_ZONA = {
  norte: { lat: -17.7420, lng: -63.1780 },
  sur: { lat: -17.8320, lng: -63.1760 },
  centro: { lat: -17.7835, lng: -63.1810 },
  este: { lat: -17.7900, lng: -63.1180 },
} as const

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
