// Vista de Mapa y Recorrido de Ruta para la Orden de Transporte (OT)
// Representa el circuito logístico completo: Salida CD -> Paradas 1..N -> Retorno al CD.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  MapPin,
  Warehouse,
  Truck,
  Navigation,
  Flag,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCw,
  Layers,
  Search,
  Compass,
  Eye,
  FileCheck,
  Fuel,
  Gauge,
  Maximize2,
  Route as RouteIcon,
  ChevronRight,
  CircleDot,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { divIcon } from '../map/div-icon'
import { TILES, SUBDOMINIOS, type CapaBase, CAPAS_BASE } from '../map/tiles'
import { useRutasPorCalles } from '../map/use-rutas-calles'
import type { LatLngTuple } from '../map/geo/polyline'
import type { OrdenTransporteHistorial, ParadaHistorial } from '../historial-orders-data'
import {
  CD_CENTRAL,
  getParadaCoords,
  buildRoutePath,
  buildTramosRuta,
  type TramoRuta,
} from './route-map-data'

interface RutaOrdenTransporteMapaViewProps {
  orden: OrdenTransporteHistorial
  initialSelectedStopId?: string | null
  onSelectStopAndSwitchTab?: (stop: ParadaHistorial) => void
}

/** Formateador de moneda en BOB */
function fmtMoney(amount: number) {
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  }).format(amount)
}

/** Controlador de cámara dentro del MapContainer */
function MapCameraController({
  targetCoords,
  zoom,
  fitAllBounds,
}: {
  targetCoords?: [number, number] | null
  zoom?: number
  fitAllBounds?: [number, number][] | null
}) {
  const map = useMap()

  useEffect(() => {
    if (fitAllBounds && fitAllBounds.length > 0) {
      const bounds = L.latLngBounds(fitAllBounds)
      map.fitBounds(bounds, {
        padding: [50, 50],
        animate: true,
        duration: 1.0,
      })
    }
  }, [fitAllBounds, map])

  useEffect(() => {
    if (targetCoords) {
      map.flyTo(targetCoords, zoom || 16, {
        animate: true,
        duration: 1.0,
      })
    }
  }, [targetCoords, zoom, map])

  return null
}

/** Fabricación de divIcon para el Centro de Distribución (Origen o Retorno) */
function createCDIcon(isReturn = false) {
  const html = renderToStaticMarkup(
    <div className="relative flex items-center justify-center">
      <div
        className={cn(
          'w-10 h-10 rounded-full border-2 border-white shadow-2xl flex items-center justify-center text-white transition-transform hover:scale-110',
          isReturn ? 'bg-slate-900 ring-4 ring-emerald-500/40' : 'bg-emerald-600 ring-4 ring-emerald-600/30'
        )}
      >
        {isReturn ? <Flag size={18} className="text-emerald-400" /> : <Warehouse size={20} />}
      </div>
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 border-r border-b border-border/80 shadow-xs" />
    </div>
  )
  return divIcon(html, [40, 44], [20, 44])
}

/** Fabricación de divIcon para las paradas numeradas */
function createStopIcon(sequence: number, resultCode: string, isSelected: boolean) {
  const bgColor =
    resultCode === 'EXITOSO'
      ? '#16a34a' // emerald-600
      : resultCode === 'RECHAZO_PARCIAL'
      ? '#d97706' // amber-600
      : '#dc2626' // destructive

  const html = renderToStaticMarkup(
    <div className="relative flex items-center justify-center cursor-pointer group">
      {/* Halo de pulso cuando está seleccionado */}
      {isSelected && (
        <div className="absolute -inset-2 rounded-full bg-primary/40 animate-ping pointer-events-none" />
      )}
      <div
        style={{ backgroundColor: bgColor }}
        className={cn(
          'w-8 h-8 rounded-full border-2 border-white text-white font-extrabold text-xs shadow-lg flex items-center justify-center transition-all group-hover:scale-110',
          isSelected ? 'ring-4 ring-primary shadow-2xl scale-125 z-50' : ''
        )}
      >
        {sequence}
      </div>
      <div
        style={{ backgroundColor: bgColor }}
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b border-white shadow-xs"
      />
    </div>
  )
  return divIcon(html, [32, 36], [16, 36])
}

export function RutaOrdenTransporteMapaView({
  orden,
  initialSelectedStopId,
  onSelectStopAndSwitchTab,
}: RutaOrdenTransporteMapaViewProps) {
  // Estado de capa base del mapa
  const [capaBase, setCapaBase] = useState<CapaBase>('suave')

  // Filtros del timeline lateral
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'EXITOSO' | 'RECHAZO_PARCIAL'>('TODOS')

  // Parada o elemento seleccionado para enfocar en mapa
  const [selectedStopId, setSelectedStopId] = useState<string | 'CD' | 'RETORNO' | null>(initialSelectedStopId || null)
  const [cameraTarget, setCameraTarget] = useState<[number, number] | null>(null)
  const [fitAllTrigger, setFitAllTrigger] = useState<[number, number][] | null>(null)

  useEffect(() => {
    if (initialSelectedStopId) {
      setSelectedStopId(initialSelectedStopId)
      const paradaIdx = orden.paradas.findIndex((p) => p.id === initialSelectedStopId)
      if (paradaIdx >= 0) {
        const coords = getParadaCoords(orden.paradas[paradaIdx], paradaIdx)
        setCameraTarget(coords)
      }
    }
  }, [initialSelectedStopId, orden.paradas])

  // Hitos secuenciales del circuito de transporte: Salida CD -> Paradas 1..N -> Retorno CD
  const hitos = useMemo<LatLngTuple[]>(() => {
    const pts: LatLngTuple[] = [[CD_CENTRAL.lat, CD_CENTRAL.lng]]
    orden.paradas.forEach((p, idx) => {
      pts.push(getParadaCoords(p, idx))
    })
    pts.push([CD_CENTRAL.lat, CD_CENTRAL.lng])
    return pts
  }, [orden.paradas])

  // Ruteo dinámico por calles de Santa Cruz usando el motor OSRM
  const tramosARutear = useMemo(() => [{ id: String(orden.id || 'ot-route'), puntos: hitos }], [orden.id, hitos])
  const { porRuta, cargando: ruteando } = useRutasPorCalles(tramosARutear, true)
  const streetPath = porRuta.get(String(orden.id || 'ot-route'))

  // Fallback estructurado con avenidas y anillos reales de Santa Cruz
  const fallbackPath = useMemo(() => buildRoutePath(orden.paradas), [orden.paradas])
  const effectiveRoutePath = useMemo(() => {
    if (streetPath && streetPath.length > 2) return streetPath
    return fallbackPath
  }, [streetPath, fallbackPath])

  const tramos = useMemo(() => buildTramosRuta(orden.paradas), [orden.paradas])

  // Paradas filtradas para el timeline
  const filteredParadas = useMemo(() => {
    return orden.paradas.filter((p) => {
      const matchesSearch =
        p.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.customerCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.deliveryNoteNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'TODOS' || p.resultCode === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [orden.paradas, searchQuery, statusFilter])

  // Parada activa seleccionada
  const activeStop = useMemo(() => {
    if (!selectedStopId || selectedStopId === 'CD' || selectedStopId === 'RETORNO') return null
    return orden.paradas.find((p) => p.id === selectedStopId) || null
  }, [selectedStopId, orden.paradas])

  // Manejador para enfocar una parada
  const handleSelectStop = useCallback((stop: ParadaHistorial) => {
    setSelectedStopId(stop.id)
    const idx = orden.paradas.findIndex((p) => p.id === stop.id)
    const coords = getParadaCoords(stop, idx >= 0 ? idx : 0)
    setCameraTarget(coords)
  }, [orden.paradas])

  // Manejador para enfocar el CD de salida
  const handleSelectCD = useCallback(() => {
    setSelectedStopId('CD')
    setCameraTarget([CD_CENTRAL.lat, CD_CENTRAL.lng])
  }, [])

  // Manejador para enfocar el Retorno al CD
  const handleSelectRetorno = useCallback(() => {
    setSelectedStopId('RETORNO')
    setCameraTarget([CD_CENTRAL.lat, CD_CENTRAL.lng])
  }, [])

  // Manejador para encuadrar toda la ruta
  const handleFitAllRoute = useCallback(() => {
    setSelectedStopId(null)
    setFitAllTrigger([...effectiveRoutePath])
  }, [effectiveRoutePath])

  // Encuadrar al montar la vista o cuando se resuelva el ruteo
  useEffect(() => {
    if (effectiveRoutePath.length > 0) {
      setFitAllTrigger([...effectiveRoutePath])
    }
  }, [effectiveRoutePath])

  return (
    <div className="space-y-4 flex flex-col h-[820px] min-h-[680px]">
      {/* ── KPI RIBBON SUPERIOR: TELEMETRÍA Y RESUMEN DE LA RUTA ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <Card className="p-3 border shadow-xs bg-card">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20">
              <RouteIcon size={16} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block font-medium">Distancia Total</span>
              <span className="text-sm font-bold text-foreground">{orden.totalKm || CD_CENTRAL.totalKm} km</span>
            </div>
          </div>
        </Card>

        <Card className="p-3 border shadow-xs bg-card">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/20">
              <Clock size={16} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block font-medium">Tiempo de Ruta</span>
              <span className="text-sm font-bold text-foreground">10h 15m</span>
            </div>
          </div>
        </Card>

        <Card className="p-3 border shadow-xs bg-card">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <Truck size={16} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block font-medium">En Tránsito (Manejo)</span>
              <span className="text-sm font-bold text-foreground">3h 25m (33%)</span>
            </div>
          </div>
        </Card>

        <Card className="p-3 border shadow-xs bg-card">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Warehouse size={16} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block font-medium">En Cliente (Servicio)</span>
              <span className="text-sm font-bold text-foreground">6h 50m (67%)</span>
            </div>
          </div>
        </Card>

        <Card className="p-3 border shadow-xs bg-card">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-teal-500/10 text-teal-600 border border-teal-500/20">
              <CheckCircle2 size={16} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block font-medium">Paradas Atendidas</span>
              <span className="text-sm font-bold text-foreground">
                {orden.kpis.completedStops} / {orden.kpis.totalStops} (100%)
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-3 border shadow-xs bg-card">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-orange-500/10 text-orange-600 border border-orange-500/20">
              <Fuel size={16} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block font-medium">Combustible Est.</span>
              <span className="text-sm font-bold text-foreground">14.2 L (~3.4 km/L)</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── ARQUITECTURA SPLIT-VIEW: TIMELINE DE RUTA (IZQUIERDA) + MAPA LEAFLET (DERECHA) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* ═══════════════════════════════════════════════════════════════════
            PANEL IZQUIERDO (4/12 = 33%): TIMELINE SECUENCIAL Y TRAMOS DE RUTA
           ═══════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-4 xl:col-span-4 flex flex-col h-full overflow-hidden border shadow-xs bg-card">
          {/* Cabecera del Timeline */}
          <div className="p-3 border-b border-border space-y-2.5 bg-muted/30 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Navigation size={14} className="text-primary" />
                <span className="text-xs font-bold text-foreground">
                  Circuito de Ruta ({orden.paradas.length} Paradas)
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 bg-background flex items-center gap-1">
                {CD_CENTRAL.departureTime} <ArrowRight size={10} /> {CD_CENTRAL.returnTime}
              </Badge>
            </div>

            {/* Buscador de paradas */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, código o calle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>

            {/* Filtros de estado */}
            <div className="flex items-center gap-1">
              <Button
                variant={statusFilter === 'TODOS' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('TODOS')}
                className="h-6 px-2 text-[10px] cursor-pointer"
              >
                Todos ({orden.paradas.length})
              </Button>
              <Button
                variant={statusFilter === 'EXITOSO' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('EXITOSO')}
                className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
              >
                <CheckCircle2 size={10} className="text-emerald-500" />
                Exitosos ({orden.paradas.filter((p) => p.resultCode === 'EXITOSO').length})
              </Button>
              <Button
                variant={statusFilter === 'RECHAZO_PARCIAL' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('RECHAZO_PARCIAL')}
                className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
              >
                <AlertTriangle size={10} className="text-amber-500" />
                Parcial ({orden.paradas.filter((p) => p.resultCode === 'RECHAZO_PARCIAL').length})
              </Button>
            </div>
          </div>

          {/* Lista scrolleable del Timeline */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {/* 🟢 HITO 1: SALIDA DEL CENTRO DE DISTRIBUCIÓN (CD) */}
            <div
              onClick={handleSelectCD}
              className={cn(
                'p-2.5 rounded-lg border transition-all cursor-pointer select-none space-y-1.5',
                selectedStopId === 'CD'
                  ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'bg-muted/20 border-border hover:bg-muted/50'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    <Warehouse size={13} />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-foreground block">{CD_CENTRAL.shortName}</span>
                    <span className="text-[10px] text-muted-foreground">Origen · Salida de Rampa</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300">
                  {CD_CENTRAL.departureTime}
                </Badge>
              </div>

              <div className="pl-8 text-[11px] text-muted-foreground flex items-center justify-between">
                {/* <span>Odómetro: <b className="font-mono text-foreground">{CD_CENTRAL.initialOdometerKm.toLocaleString()} km</b></span> */}
                <span>Despacho: <b className="text-foreground">{CD_CENTRAL.dispatchedWeightKg} kg</b></span>
              </div>
            </div>

            {/* TRAMOS Y PARADAS SECUENCIALES */}
            {filteredParadas.map((parada, idx) => {
              const isSelected = selectedStopId === parada.id
              const tramo = tramos.find((t) => t.paradaDestino?.id === parada.id)

              return (
                <React.Fragment key={parada.id}>
                  {/* Conector de Tramo Intermedio */}
                  {tramo && (
                    <div className="pl-6 flex items-center gap-2 text-[10px] font-mono text-muted-foreground py-0.5">
                      <div className="w-0.5 h-3.5 bg-border ml-2.5" />
                      <span className="bg-muted/60 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                        <Truck size={10} className="text-primary" />
                        {tramo.distanceKm} km · {tramo.durationMinutes} min
                      </span>
                    </div>
                  )}

                  {/* Tarjeta de Parada */}
                  <div
                    onClick={() => handleSelectStop(parada)}
                    className={cn(
                      'p-2.5 rounded-lg border transition-all cursor-pointer select-none space-y-1.5',
                      isSelected
                        ? 'bg-primary/10 border-primary ring-2 ring-primary/20 shadow-xs'
                        : 'bg-card border-border hover:border-primary/40 hover:bg-muted/20'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-extrabold shrink-0',
                            parada.resultCode === 'EXITOSO'
                              ? 'bg-emerald-600'
                              : parada.resultCode === 'RECHAZO_PARCIAL'
                              ? 'bg-amber-600'
                              : 'bg-destructive'
                          )}
                        >
                          {parada.sequence}
                        </div>
                        <div className="truncate max-w-[170px]">
                          <span className="font-bold text-xs text-foreground block truncate">
                            {parada.customerName}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate block">
                            {parada.zoneName} · {parada.customerCode}
                          </span>
                        </div>
                      </div>

                      <Badge
                        variant={parada.resultCode === 'EXITOSO' ? 'default' : 'secondary'}
                        className={cn(
                          'text-[9px] px-1.5 h-4 font-semibold',
                          parada.resultCode === 'EXITOSO'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        )}
                      >
                        {parada.resultCode}
                      </Badge>
                    </div>

                    <div className="pl-8 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{parada.arrivedAt} - {parada.deliveredAt} ({parada.serviceDuration})</span>
                      <span className="font-bold text-foreground">
                        {fmtMoney(parada.payments?.reduce((acc, p) => acc + p.amount, 0) || 0)}
                      </span>
                    </div>

                    {/* Acciones directas cuando está seleccionada */}
                    {isSelected && onSelectStopAndSwitchTab && (
                      <div className="pt-1.5 pl-8 border-t border-border/70 flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {parada.deliveryNoteNumber}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectStopAndSwitchTab(parada)
                          }}
                          className="h-5 px-2 text-[10px] gap-1 text-primary hover:text-primary cursor-pointer"
                        >
                          Ver detalle en Paradas <ChevronRight size={10} />
                        </Button>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              )
            })}

            {/* 🏁 HITO FINAL: RETORNO AL CENTRO DE DISTRIBUCIÓN (CD) */}
            <div className="pl-6 flex items-center gap-2 text-[10px] font-mono text-muted-foreground py-0.5">
              <div className="w-0.5 h-3.5 bg-border ml-2.5" />
              <span className="bg-muted/60 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                <Truck size={10} className="text-primary" />
                6.8 km · 20 min retorno
              </span>
            </div>

            <div
              onClick={handleSelectRetorno}
              className={cn(
                'p-2.5 rounded-lg border transition-all cursor-pointer select-none space-y-1.5',
                selectedStopId === 'RETORNO'
                  ? 'bg-slate-900/10 border-slate-900 ring-2 ring-slate-900/20'
                  : 'bg-muted/20 border-border hover:bg-muted/50'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    <Flag size={13} className="text-emerald-400" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-foreground block">Retorno a Base ({CD_CENTRAL.shortName})</span>
                    <span className="text-[10px] text-muted-foreground">Fin de Jornada · Liquidación de Ruta</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono text-foreground bg-background border-border">
                  {CD_CENTRAL.returnTime}
                </Badge>
              </div>

              <div className="pl-8 text-[11px] text-muted-foreground flex items-center justify-between">
                {/* <span>Odómetro final: <b className="font-mono text-foreground">{CD_CENTRAL.finalOdometerKm.toLocaleString()} km</b></span> */}
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={11} /> Arqueo Validado
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            PANEL DERECHO (8/12 = 67%): MAPA LEAFLET INTERACTIVO CON TRAZADO
           ═══════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-8 xl:col-span-8 flex flex-col h-full overflow-hidden border shadow-xs bg-card relative">
          {/* Toolbar flotante de control de mapa (Arriba a la derecha) */}
          <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 bg-background/90 backdrop-blur-md p-1 rounded-lg border border-border shadow-md">
            {/* Indicador de precisión de ruteo por calles */}
            <div className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground border-r border-border pr-2 font-medium">
              {ruteando ? (
                <>
                  <RotateCw size={10} className="animate-spin text-primary" />
                  <span>Calculando calles...</span>
                </>
              ) : streetPath ? (
                <>
                  <CheckCircle2 size={11} className="text-emerald-600" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Trazo por Calles (OSRM)</span>
                </>
              ) : (
                <>
                  <RouteIcon size={11} className="text-primary" />
                  <span>Avenidas Principales</span>
                </>
              )}
            </div>

            {/* Selector de capa base */}
            <div className="flex items-center gap-1 border-r border-border pr-1 mr-0.5">
              {CAPAS_BASE.map((capa) => (
                <Button
                  key={capa.valor}
                  variant={capaBase === capa.valor ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCapaBase(capa.valor)}
                  className="h-6 px-2 text-[10px] cursor-pointer"
                >
                  {capa.label}
                </Button>
              ))}
            </div>

            {/* Botón de encuadrar toda la ruta */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitAllRoute}
              className="h-6 px-2 text-[11px] gap-1 cursor-pointer bg-background"
              title="Encuadrar toda la ruta"
            >
              <Maximize2 size={12} />
              Encuadrar Ruta
            </Button>
          </div>

          {/* Leyenda flotante en la esquina inferior izquierda */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-background/90 backdrop-blur-md p-2 rounded-lg border border-border shadow-md text-[10px] space-y-1 select-none pointer-events-none">
            <span className="font-bold text-foreground block text-[10px] mb-1">Convenciones de Ruta:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-600 border border-white" />
              <span>Centro de Distribución (Origen / Retorno)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-600 border border-white" />
              <span>Parada 100% Exitosa</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-600 border border-white" />
              <span>Parada con Rechazo Parcial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-1 bg-blue-600 rounded" />
              <span>Trazado GPS Recorrido ({orden.totalKm || CD_CENTRAL.totalKm} km)</span>
            </div>
          </div>

          {/* Tarjeta flotante interactiva de parada seleccionada (Abajo a la derecha) */}
          {activeStop && (
            <div className="absolute bottom-3 right-3 z-[1000] max-w-sm bg-card/95 backdrop-blur-md p-3 rounded-xl border border-border shadow-2xl space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0',
                      activeStop.resultCode === 'EXITOSO' ? 'bg-emerald-600' : 'bg-amber-600'
                    )}
                  >
                    {activeStop.sequence}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-foreground leading-tight">
                      {activeStop.customerName}
                    </h4>
                    <span className="text-[10px] text-muted-foreground block">
                      {activeStop.address}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStopId(null)}
                  className="text-muted-foreground hover:text-foreground text-xs p-1 rounded hover:bg-muted cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] p-2 rounded bg-muted/40 border border-border/60">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Horario de entrega:</span>
                  <span className="font-medium">{activeStop.arrivedAt} - {activeStop.deliveredAt}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Monto Cobrado:</span>
                  <span className="font-bold text-foreground">
                    {fmtMoney(activeStop.payments?.reduce((acc, p) => acc + p.amount, 0) || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Remisión:</span>
                  <span className="font-mono text-xs">{activeStop.deliveryNoteNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Receptor:</span>
                  <span className="font-medium truncate block">{activeStop.proofOfDelivery?.receiverName}</span>
                </div>
              </div>

              {onSelectStopAndSwitchTab && (
                <Button
                  size="sm"
                  onClick={() => onSelectStopAndSwitchTab(activeStop)}
                  className="w-full h-7 text-xs gap-1.5 cursor-pointer font-medium"
                >
                  <Eye size={12} />
                  Ver Productos y Evidencias POD
                </Button>
              )}
            </div>
          )}

          {/* Tarjeta flotante interactiva de CD seleccionado */}
          {(selectedStopId === 'CD' || selectedStopId === 'RETORNO') && (
            <div className="absolute bottom-3 right-3 z-[1000] max-w-sm bg-card/95 backdrop-blur-md p-3 rounded-xl border border-border shadow-2xl space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    <Warehouse size={15} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-foreground leading-tight">
                      {CD_CENTRAL.name}
                    </h4>
                    <span className="text-[10px] text-muted-foreground block">
                      {CD_CENTRAL.address}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStopId(null)}
                  className="text-muted-foreground hover:text-foreground text-xs p-1 rounded hover:bg-muted cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] p-2 rounded bg-muted/40 border border-border/60">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Salida de Rampa:</span>
                  <span className="font-bold text-emerald-600">{CD_CENTRAL.departureTime}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Retorno a Base:</span>
                  <span className="font-bold text-foreground">{CD_CENTRAL.returnTime}</span>
                </div>
                {/* <div>
                  <span className="text-[10px] text-muted-foreground block">Odómetro Inicial:</span>
                  <span className="font-mono text-xs">{CD_CENTRAL.initialOdometerKm.toLocaleString()} km</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Odómetro Final:</span>
                  <span className="font-mono text-xs">{CD_CENTRAL.finalOdometerKm.toLocaleString()} km</span>
                </div> */}
              </div>
            </div>
          )}

          {/* Lienzo del Mapa Leaflet */}
          <div className="flex-1 w-full h-full min-h-[480px]">
            <MapContainer
              center={[-17.786, -63.17]}
              zoom={12}
              className="w-full h-full z-0"
              zoomControl={false}
            >
              {/* Recalcula dimensiones cuando cambia el layout o la pestaña */}
              <InvalidateOnResize />

              {/* Capa de mosaicos base */}
              <TileLayer
                url={TILES[capaBase]}
                subdomains={SUBDOMINIOS[capaBase]}
                maxZoom={19}
              />

              {/* Animación y control de cámara */}
              <MapCameraController
                targetCoords={cameraTarget}
                fitAllBounds={fitAllTrigger}
              />

              {/* Trazado continuo de la ruta (Outer Glow + Línea Principal) */}
              <Polyline
                positions={effectiveRoutePath}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 8,
                  opacity: 0.35,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Polyline
                positions={effectiveRoutePath}
                pathOptions={{
                  color: '#2563eb',
                  weight: 4,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />

              {/* Marcador 1: Centro de Distribución (Origen) */}
              <Marker
                position={[CD_CENTRAL.lat, CD_CENTRAL.lng]}
                icon={createCDIcon(false)}
                eventHandlers={{
                  click: () => handleSelectCD(),
                }}
              >
                <Tooltip direction="top" offset={[0, -40]} opacity={0.95}>
                  <div className="text-xs p-0.5">
                    <b className="text-emerald-700 block">{CD_CENTRAL.shortName}</b>
                    <span className="text-[10px] text-muted-foreground">Salida: {CD_CENTRAL.departureTime} · 12 Pallets</span>
                  </div>
                </Tooltip>
              </Marker>

              {/* Marcadores 2..N: Paradas Intermedias */}
              {orden.paradas.map((parada, idx) => {
                const coords = getParadaCoords(parada, idx)
                const isSelected = selectedStopId === parada.id

                return (
                  <Marker
                    key={parada.id}
                    position={coords}
                    icon={createStopIcon(parada.sequence, parada.resultCode, isSelected)}
                    eventHandlers={{
                      click: () => handleSelectStop(parada),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -32]} opacity={0.95}>
                      <div className="text-xs p-0.5 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className="font-bold">#{parada.sequence}</span>
                          <span className="font-semibold">{parada.customerName}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {parada.arrivedAt} - {parada.deliveredAt} · {parada.deliveryNoteNumber}
                        </p>
                      </div>
                    </Tooltip>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
