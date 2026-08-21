// Datos y geometría de ruta ejecutada para la Orden de Transporte
// Conecta el Centro de Distribución (CD), las paradas intermedias y el retorno a base.

import type { ParadaHistorial } from '../historial-orders-data'

export interface CentroDistribucion {
  id: string
  name: string
  shortName: string
  code: string
  address: string
  lat: number
  lng: number
  departureTime: string
  returnTime: string
  initialOdometerKm: number
  finalOdometerKm: number
  totalKm: number
  dispatchedWeightKg: number
  dispatchedVolumeM3: number
}

export const CD_CENTRAL: CentroDistribucion = {
  id: 'cd-central',
  name: 'Centro de Distribución Central (Parque Industrial)',
  shortName: 'CD Parque Industrial',
  code: 'CD-SCZ-01',
  address: 'Av. Parque Industrial esq. 4to Anillo, Manzana 12, Santa Cruz',
  lat: -17.7621,
  lng: -63.1534,
  departureTime: '06:30 AM',
  returnTime: '16:45 PM',
  initialOdometerKm: 124520.0,
  finalOdometerKm: 124568.5,
  totalKm: 48.5,
  dispatchedWeightKg: 3450.0,
  dispatchedVolumeM3: 14.8,
}

// Coordenadas geográficas realistas en la ciudad de Santa Cruz de la Sierra
export const PARADAS_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'parada-101': { lat: -17.77892, lng: -63.19012 }, // Fidalga Equipetrol (Av. San Martín)
  'parada-102': { lat: -17.7845, lng: -63.1852 },  // Abarrotes Don Carlos (Av. Busch)
  'parada-103': { lat: -17.7923, lng: -63.1784 },  // Micromercado El Triunfo (Casco Viejo / Libertad)
  'parada-104': { lat: -17.8015, lng: -63.1691 },  // Supermercado Hipermaxi Grigotá
  'parada-105': { lat: -17.8092, lng: -63.161 },   // Bodega La Cañita (Santos Dumont)
  'parada-106': { lat: -17.818, lng: -63.1555 },   // Licorería Don Pepe (3er Anillo Sur)
  'parada-107': { lat: -17.825, lng: -63.148 },    // Minimarket San Martín (3 Pasos al Frente)
  'parada-108': { lat: -17.831, lng: -63.142 },    // Abarrotes Santa Rosa (Villa 1ro de Mayo)
  'parada-109': { lat: -17.839, lng: -63.136 },    // Comercial Las Américas (Av. Cumavi)
  'parada-110': { lat: -17.846, lng: -63.13 },     // Snack & Licorería El Cruce (Pampa de la Isla)
  'parada-111': { lat: -17.82, lng: -63.135 },     // Supermercado Fidalga Mutualista
  'parada-112': { lat: -17.785, lng: -63.142 },    // Bodega El Progreso (2do Anillo Norte)
}

// Fallback secuencial de coordenadas para paradas que no estén en el mapeo explícito
export function getParadaCoords(parada: ParadaHistorial, index: number): [number, number] {
  if (parada.lat && parada.lng) {
    return [parada.lat, parada.lng]
  }
  const mapped = PARADAS_COORDINATES[parada.id]
  if (mapped) {
    return [mapped.lat, mapped.lng]
  }
  // Coordenadas calculadas alrededor de los anillos de Santa Cruz
  const baseLat = -17.785
  const baseLng = -63.175
  const radius = 0.035
  const angle = (index / 12) * 2 * Math.PI
  return [baseLat + Math.sin(angle) * radius, baseLng + Math.cos(angle) * radius]
}

// Generador de polilínea continua de la ruta recorrida CD -> Paradas 1..N -> Retorno CD
// Incluye waypoints por avenidas reales de Santa Cruz (4to Anillo, Av. Banzer, San Martín, Busch, Grigotá, Santos Dumont, Cumavi, Mutualista, etc.)
export function buildRoutePath(paradas: ParadaHistorial[]): [number, number][] {
  const path: [number, number][] = []

  // 1. Salida CD Parque Industrial -> Parada 1 (Equipetrol)
  path.push([CD_CENTRAL.lat, CD_CENTRAL.lng])
  path.push([-17.7635, -63.1592]) // 4to Anillo y Mutualista
  path.push([-17.7658, -63.1712]) // 4to Anillo y Banzer / Cristo Redentor
  path.push([-17.7712, -63.184]) // 4to Anillo y Canal Isuto
  path.push([-17.7758, -63.1905]) // Av. San Martín
  path.push([-17.77892, -63.19012]) // Parada 1: Fidalga Equipetrol

  // Tramo 1 -> 2: Fidalga Equipetrol -> Abarrotes Don Carlos (Av. Busch)
  path.push([-17.7815, -63.1898]) // Av. San Martín y 3er Anillo
  path.push([-17.7832, -63.1875]) // Diagonal hacia Av. Busch
  path.push([-17.7845, -63.1852]) // Parada 2: Abarrotes Don Carlos

  // Tramo 2 -> 3: Av. Busch -> Micromercado El Triunfo (Casco Viejo)
  path.push([-17.7872, -63.182]) // Av. Busch y 1er Anillo
  path.push([-17.7905, -63.1795]) // Calle Libertad
  path.push([-17.7923, -63.1784]) // Parada 3: Micromercado El Triunfo

  // Tramo 3 -> 4: Casco Viejo -> Hipermaxi Grigotá
  path.push([-17.7952, -63.1755]) // Calle 21 de Mayo
  path.push([-17.7985, -63.1722]) // 1er Anillo Sur
  path.push([-17.8015, -63.1691]) // Parada 4: Hipermaxi Grigotá

  // Tramo 4 -> 5: Hipermaxi Grigotá -> Bodega La Cañita (Santos Dumont)
  path.push([-17.8045, -63.166]) // 2do Anillo Sur
  path.push([-17.807, -63.1632]) // Av. Santos Dumont
  path.push([-17.8092, -63.161]) // Parada 5: Bodega La Cañita

  // Tramo 5 -> 6: Bodega La Cañita -> Licorería Don Pepe (3er Anillo Sur)
  path.push([-17.813, -63.1585]) // Av. Santos Dumont
  path.push([-17.818, -63.1555]) // Parada 6: Licorería Don Pepe

  // Tramo 6 -> 7: 3er Anillo Sur -> Minimarket San Martín (3 Pasos al Frente)
  path.push([-17.821, -63.1518]) // 3er Anillo Sur
  path.push([-17.825, -63.148]) // Parada 7: Minimarket San Martín

  // Tramo 7 -> 8: 3 Pasos al Frente -> Abarrotes Santa Rosa (Villa 1ro de Mayo)
  path.push([-17.828, -63.145]) // Av. 3 Pasos al Frente
  path.push([-17.831, -63.142]) // Parada 8: Abarrotes Santa Rosa

  // Tramo 8 -> 9: Villa 1ro de Mayo -> Comercial Las Américas (Av. Cumavi)
  path.push([-17.835, -63.139]) // Av. Principal Villa
  path.push([-17.839, -63.136]) // Parada 9: Comercial Las Américas

  // Tramo 9 -> 10: Av. Cumavi -> Snack El Cruce (Pampa de la Isla)
  path.push([-17.8425, -63.133]) // Av. Cumavi hacia Pampa
  path.push([-17.846, -63.13]) // Parada 10: Snack El Cruce

  // Tramo 10 -> 11: Pampa de la Isla -> Fidalga Mutualista
  path.push([-17.837, -63.132]) // Av. Virgen de Cotoca
  path.push([-17.828, -63.1335]) // 3er Anillo Externo Este
  path.push([-17.82, -63.135]) // Parada 11: Fidalga Mutualista

  // Tramo 11 -> 12: Mutualista -> Bodega El Progreso (2do Anillo Norte)
  path.push([-17.808, -63.138]) // Av. Mutualista
  path.push([-17.796, -63.1405]) // 2do Anillo y Mutualista
  path.push([-17.785, -63.142]) // Parada 12: Bodega El Progreso

  // Tramo 12 -> Retorno CD Parque Industrial
  path.push([-17.776, -63.1465]) // 3er Anillo Norte
  path.push([-17.768, -63.15]) // Entrada Parque Industrial
  path.push([CD_CENTRAL.lat, CD_CENTRAL.lng]) // Retorno al CD

  return path
}

export interface TramoRuta {
  id: string
  sequence: number
  origenName: string
  destinoName: string
  origenCoords: [number, number]
  destinoCoords: [number, number]
  distanceKm: number
  durationMinutes: number
  speedKmH: number
  startTime: string
  endTime: string
  paradaDestino?: ParadaHistorial
  isDepartureFromCD?: boolean
  isReturnToCD?: boolean
}

// Desglosa la ruta completa en tramos individuales secuenciales
export function buildTramosRuta(paradas: ParadaHistorial[]): TramoRuta[] {
  const tramos: TramoRuta[] = []

  if (paradas.length === 0) return tramos

  // Tramo 1: CD -> Parada 1
  const firstStop = paradas[0]
  const firstCoords = getParadaCoords(firstStop, 0)
  tramos.push({
    id: 'tramo-0',
    sequence: 1,
    origenName: CD_CENTRAL.shortName,
    destinoName: `Parada #1: ${firstStop.customerName}`,
    origenCoords: [CD_CENTRAL.lat, CD_CENTRAL.lng],
    destinoCoords: firstCoords,
    distanceKm: 4.2,
    durationMinutes: 15,
    speedKmH: 26.5,
    startTime: CD_CENTRAL.departureTime,
    endTime: firstStop.arrivedAt,
    paradaDestino: firstStop,
    isDepartureFromCD: true,
  })

  // Tramos intermedios: Parada i -> Parada i+1
  for (let i = 0; i < paradas.length - 1; i++) {
    const fromStop = paradas[i]
    const toStop = paradas[i + 1]
    const fromCoords = getParadaCoords(fromStop, i)
    const toCoords = getParadaCoords(toStop, i + 1)
    const distKm = parseFloat((2.0 + (i % 4) * 0.7).toFixed(1))
    const durMin = toStop.travelMinutes || 12

    tramos.push({
      id: `tramo-${i + 1}`,
      sequence: i + 2,
      origenName: `Parada #${fromStop.sequence}: ${fromStop.customerName}`,
      destinoName: `Parada #${toStop.sequence}: ${toStop.customerName}`,
      origenCoords: fromCoords,
      destinoCoords: toCoords,
      distanceKm: distKm,
      durationMinutes: durMin,
      speedKmH: parseFloat(((distKm / (durMin / 60)) || 22).toFixed(1)),
      startTime: fromStop.deliveredAt,
      endTime: toStop.arrivedAt,
      paradaDestino: toStop,
    })
  }

  // Último tramo: Última Parada -> Retorno a CD
  const lastStop = paradas[paradas.length - 1]
  const lastCoords = getParadaCoords(lastStop, paradas.length - 1)
  tramos.push({
    id: `tramo-retorno`,
    sequence: paradas.length + 1,
    origenName: `Parada #${lastStop.sequence}: ${lastStop.customerName}`,
    destinoName: `Retorno a Base: ${CD_CENTRAL.shortName}`,
    origenCoords: lastCoords,
    destinoCoords: [CD_CENTRAL.lat, CD_CENTRAL.lng],
    distanceKm: 6.8,
    durationMinutes: 20,
    speedKmH: 28.0,
    startTime: lastStop.deliveredAt,
    endTime: CD_CENTRAL.returnTime,
    isReturnToCD: true,
  })

  return tramos
}
