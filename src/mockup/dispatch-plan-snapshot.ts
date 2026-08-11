import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDispatchPlanStore, selectIncludedOrders, selectSelectedTrucks } from './dispatch-plan-store'
import { ordenarPorCercania } from './map/geo/hilbert'
import {
  ALMACENES,
  type Camion,
  type EstadoOrden,
  type OrdenDespacho,
  type Parada,
  type Pedido,
  type Ruta,
} from './mock-data'

export interface DispatchPlanSnapshot {
  active: boolean
  selectedTrucks: Camion[]
  pedidos: Pedido[]
  paradas: Parada[]
  rutas: Ruta[]
  ordenes: OrdenDespacho[]
}

function repartirParadasPorCapacidad(paradas: Parada[], camiones: Camion[]): Map<string, Parada[]> {
  const asignadas = new Map<string, Parada[]>()
  for (const camion of camiones) asignadas.set(camion.id, [])
  if (paradas.length === 0 || camiones.length === 0) return asignadas

  const ordenadas = ordenarPorCercania(paradas, (p) => [p.lat, p.lng])
  let desde = 0

  for (let i = 0; i < camiones.length && desde < ordenadas.length; i++) {
    const camion = camiones[i]
    const camionesRestantes = camiones.slice(i)
    const paradasRestantes = ordenadas.length - desde

    // Si quedan menos paradas que camiones, se garantiza una parada para cada una y se termina.
    if (paradasRestantes <= camionesRestantes.length) {
      asignadas.set(camion.id, [ordenadas[desde]])
      desde += 1
      continue
    }

    if (i === camiones.length - 1) {
      asignadas.set(camion.id, ordenadas.slice(desde))
      break
    }

    const pesoRestante = ordenadas.slice(desde).reduce((acc, parada) => acc + parada.pesoTotal, 0)
    const volumenRestante = ordenadas.slice(desde).reduce((acc, parada) => acc + parada.volumenTotal, 0)
    const capacidadPesoRestante = camionesRestantes.reduce((acc, item) => acc + item.capacidadPeso, 0)
    const capacidadVolumenRestante = camionesRestantes.reduce(
      (acc, item) => acc + item.capacidadVolumen,
      0,
    )

    const objetivoPeso =
      capacidadPesoRestante > 0 ? pesoRestante * (camion.capacidadPeso / capacidadPesoRestante) : 0
    const objetivoVolumen =
      capacidadVolumenRestante > 0
        ? volumenRestante * (camion.capacidadVolumen / capacidadVolumenRestante)
        : 0

    const lote: Parada[] = []
    let pesoLote = 0
    let volumenLote = 0
    const maxParadasParaEsteCamion = paradasRestantes - (camionesRestantes.length - 1)

    while (lote.length < maxParadasParaEsteCamion) {
      const parada = ordenadas[desde + lote.length]
      if (!parada) break
      lote.push(parada)
      pesoLote += parada.pesoTotal
      volumenLote += parada.volumenTotal

      const cubrioObjetivo =
        lote.length > 0 &&
        (pesoLote >= objetivoPeso || volumenLote >= objetivoVolumen)

      if (cubrioObjetivo) break
    }

    asignadas.set(camion.id, lote)
    desde += lote.length
  }

  return asignadas
}

function construirParadasScope(pedidos: Pedido[], camiones: Camion[]): Parada[] {
  const porPunto = new Map<string, Pedido[]>()
  for (const pedido of pedidos) {
    porPunto.set(pedido.puntoEntregaId, [...(porPunto.get(pedido.puntoEntregaId) ?? []), pedido])
  }

  const paradas: Parada[] = [...porPunto.entries()].map(([puntoEntregaId, delPunto], i) => {
    const primero = delPunto[0]
    return {
      id: `step-plan-${puntoEntregaId}`,
      puntoEntregaId,
      puntoEntrega: primero.puntoEntrega,
      cliente: primero.cliente,
      canal: primero.canal,
      pedidos: delPunto,
      pesoTotal: delPunto.reduce((acc, p) => acc + p.peso, 0),
      volumenTotal: Number(delPunto.reduce((acc, p) => acc + p.volumen, 0).toFixed(1)),
      ventana: primero.ventana,
      secuencia: i + 1,
      camionId: null,
      camionForzadoId: null,
      lat: primero.lat,
      lng: primero.lng,
    }
  })

  if (camiones.length === 0 || paradas.length === 0) return paradas

  // Simulación del planner: la ruta no se reparte por "cantidad pareja de puntos", sino por
  // capacidad de los camiones seleccionados. El orden geográfico mantiene juntas las paradas
  // cercanas y el corte por capacidad hace que un camión grande cargue más puntos que uno chico.
  const asignadas = repartirParadasPorCapacidad(paradas, camiones)
  paradas.forEach((parada) => {
    const camion = camiones.find((item) => asignadas.get(item.id)?.some((stop) => stop.id === parada.id))
    parada.camionId = camion?.id ?? null
  })

  return paradas
}

function construirRutasScope(paradas: Parada[], camiones: Camion[]): Ruta[] {
  return camiones
    .filter((camion) => paradas.some((parada) => parada.camionId === camion.id))
    .map((camion, i) => ({
      id: `step-r${i + 1}`,
      nombre: `Ruta ${i + 1}`,
      color: camion.color,
      camionId: camion.id,
    }))
}

function construirOrdenesScope(rutas: Ruta[], paradas: Parada[], camiones: Camion[]): OrdenDespacho[] {
  const estados: EstadoOrden[] = ['pendiente', 'cargando', 'despachada']

  return rutas.map((ruta, i) => {
    const camion = camiones.find((item) => item.id === ruta.camionId)
    const paradasRuta = paradas.filter((parada) => parada.camionId === ruta.camionId)
    return {
      id: `step-do${i + 1}`,
      codigo: String(3041 + i),
      camionId: camion?.placa ?? '—',
      rutaId: ruta.id,
      conductor: '',
      almacen: camion?.almacen ?? ALMACENES[0],
      estado: i < 3 ? estados[i] : estados[i % estados.length],
      salida: `${String(6 + Math.floor(i / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}`,
      cargaPct: Math.round(paradasRuta.reduce((acc, parada) => acc + parada.pesoTotal, 0)),
      duracionMin: 120 + paradasRuta.length * 12,
    }
  })
}

export function useDispatchPlanSnapshot(): DispatchPlanSnapshot {
  const selectedTruckIds = useDispatchPlanStore((state) => state.selectedTruckIds)
  const activeCanales = useDispatchPlanStore((state) => state.activeCanales)
  const selectedTrucks = useDispatchPlanStore(useShallow(selectSelectedTrucks))
  const pedidos = useDispatchPlanStore(useShallow(selectIncludedOrders))

  return useMemo(() => {
    const active = selectedTruckIds.length > 0 || activeCanales.length > 0
    if (!active) {
      return {
        active,
        selectedTrucks: [],
        pedidos: [],
        paradas: [],
        rutas: [],
        ordenes: [],
      }
    }

    const paradas = construirParadasScope(pedidos, selectedTrucks)
    const rutas = construirRutasScope(paradas, selectedTrucks)
    const ordenes = construirOrdenesScope(rutas, paradas, selectedTrucks)

    return {
      active,
      selectedTrucks,
      pedidos,
      paradas,
      rutas,
      ordenes,
    }
  }, [activeCanales.length, pedidos, selectedTruckIds.length, selectedTrucks])
}
