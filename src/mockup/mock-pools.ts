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
 * Catálogo de productos (`delivery_order_items.product_id`). Existe solo para el detalle de entrega
 * del monitoreo: sin nombre de producto, la pestaña "Pedido" no puede mostrar planificado vs
 * entregado vs devuelto. `unidad` es lo que se cuenta, no un dato del esquema.
 */
export const PRODUCTOS = [
  { nombre: 'Aceite girasol 900 ml', unidad: 'cajas' },
  { nombre: 'Arroz grano largo 5 kg', unidad: 'bolsas' },
  { nombre: 'Azúcar blanca 1 kg', unidad: 'bolsas' },
  { nombre: 'Fideo spaghetti 400 g', unidad: 'cajas' },
  { nombre: 'Gaseosa cola 2 L', unidad: 'packs' },
  { nombre: 'Agua sin gas 2 L', unidad: 'packs' },
  { nombre: 'Leche entera 1 L', unidad: 'cajas' },
  { nombre: 'Yogur bebible 1 L', unidad: 'cajas' },
  { nombre: 'Harina 000 1 kg', unidad: 'bolsas' },
  { nombre: 'Margarina 250 g', unidad: 'cajas' },
  { nombre: 'Atún lomito 170 g', unidad: 'cajas' },
  { nombre: 'Galleta surtida 300 g', unidad: 'cajas' },
  { nombre: 'Jabón en polvo 800 g', unidad: 'bolsas' },
  { nombre: 'Papel higiénico x4', unidad: 'packs' },
] as const
