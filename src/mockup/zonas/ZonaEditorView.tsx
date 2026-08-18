// Editor de la ZONA sobre el mapa — mismo criterio de layout que `PlannerView`/`MonitoreoDetalleView`:
// mapa a sangre (`fullBleed`), todo lo demás flota encima. Sirve para crear (`/zonas/nueva`) y editar
// (`/zonas/:zonaId/editar`) con el MISMO componente: sin `zonaId` arranca vacío y en modo dibujo.
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Polygon, TileLayer, useMap } from 'react-leaflet'
import { toast } from 'sonner'
import { ChevronLeft, MousePointerClick, PenLine, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouteParams } from '@/core/routing/active-route'
import { openRoute } from '@/core/routing/open-route'
import { InvalidateOnResize } from '../map/InvalidateOnResize'
import { PolygonDrawLayer } from '../map/PolygonDrawLayer'
import type { LatLngTuple } from '../map/geo/polyline'
import { CIUDAD_IDS, CIUDAD_META, cityIdDe, ciudadDeCityId, type CiudadId } from '../mock-data'
import { CIUDAD_CENTRO, latLngAPoligono, poligonoALatLng, useZonesStore } from '../zones-store'

const COLOR_ZONA = '#2563eb'
const INITIAL_ZOOM = 13

/** Recentra el mapa sobre la ciudad elegida — solo mientras no hay nada dibujado, para no reubicar la
 *  cámara debajo de un polígono que el usuario ya está armando. */
function Recentrado({ ciudad, quieto }: { ciudad: CiudadId; quieto: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!quieto) return
    map.setView(CIUDAD_CENTRO[ciudad], INITIAL_ZOOM)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciudad, map])
  return null
}

export function ZonaEditorView() {
  const { zonaId } = useRouteParams()
  const zonas = useZonesStore((s) => s.zonas)
  const addZona = useZonesStore((s) => s.addZona)
  const updateZona = useZonesStore((s) => s.updateZona)

  const zonaExistente = useMemo(
    () => (zonaId ? zonas.find((z) => String(z.id) === zonaId) : undefined),
    [zonaId, zonas],
  )
  const editando = zonaId !== undefined

  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState<CiudadId>('santacruz')
  const [puntos, setPuntos] = useState<LatLngTuple[]>([])
  const [dibujando, setDibujando] = useState(true)

  // Precarga UNA sola vez, al montar: el store lee `sessionStorage`/`localStorage` de forma
  // SÍNCRONA al crearse (ver `zones-store.ts`), así que `zonaExistente` ya está resuelto en el
  // primer render — no hace falta esperar nada. Si el id de la URL no existe (link viejo, zona ya
  // borrada), avisa y vuelve al listado en vez de dejar el editor abierto sin nada que editar.
  useEffect(() => {
    if (!editando) return
    if (!zonaExistente) {
      toast.error('Esa zona ya no existe')
      openRoute('zonas')
      return
    }
    setNombre(zonaExistente.name)
    setCiudad(ciudadDeCityId(zonaExistente.cityId) ?? 'santacruz')
    setPuntos(poligonoALatLng(zonaExistente.polygonGeoJson))
    setDibujando(false)
    // Solo al montar: `zonaExistente` se recalcula cuando cambia el store (ej. al guardar), y
    // volver a correr esto pisaría lo que el usuario esté editando en pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando])

  const puedeGuardar = nombre.trim().length > 0 && puntos.length >= 3

  const redibujar = () => {
    setPuntos([])
    setDibujando(true)
  }

  const cerrarPoligono = (finales: LatLngTuple[]) => {
    setPuntos(finales)
    setDibujando(false)
    toast.success('Polígono cerrado — ajustá los vértices o guardá la zona')
  }

  const guardar = () => {
    const polygonGeoJson = latLngAPoligono(puntos)
    if (!polygonGeoJson || !puedeGuardar) return
    const input = { name: nombre.trim(), cityId: cityIdDe(ciudad), polygonGeoJson }
    if (editando && zonaExistente) {
      updateZona(zonaExistente.id, input)
      toast.success(`${input.name} actualizada`)
    } else {
      addZona(input)
      toast.success(`${input.name} creada`)
    }
    openRoute('zonas')
  }

  return (
    <Card className="relative h-full min-h-0 gap-0 overflow-hidden rounded-none border-0 p-0">
      <div className="absolute inset-0 isolate">
        <MapContainer
          center={CIUDAD_CENTRO[ciudad]}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom
          attributionControl={false}
          zoomControl={false}
          className="h-full w-full"
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
            subdomains="abcd"
          />
          <InvalidateOnResize />
          <Recentrado ciudad={ciudad} quieto={puntos.length === 0} />

          <PolygonDrawLayer
            puntos={puntos}
            activo={dibujando}
            onPuntosChange={setPuntos}
            onFinalizar={cerrarPoligono}
            color={COLOR_ZONA}
          />

          {/* Vista previa de la zona ya guardada, atenuada, mientras se dibuja OTRA vez encima (redibujar):
              referencia de dónde estaba antes de que se borrara. */}
          {dibujando && zonaExistente?.polygonGeoJson && puntos.length === 0 && (
            <Polygon
              positions={poligonoALatLng(zonaExistente.polygonGeoJson)}
              pathOptions={{ color: COLOR_ZONA, weight: 1.5, dashArray: '4 4', fillOpacity: 0.05 }}
              interactive={false}
            />
          )}
        </MapContainer>
      </div>

      {/* Barra superior: volver + datos de la zona. Mismo lenguaje visual que PlannerView. */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
        <div className="pointer-events-auto flex h-11 w-full max-w-3xl shrink-0 items-center gap-2 rounded-xl border border-border bg-card/95 px-2 shadow-xl backdrop-blur-sm">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => openRoute('zonas')}
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">Volver</span>
          </Button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

          <Select value={ciudad} onValueChange={(v) => setCiudad(v as CiudadId)}>
            <SelectTrigger className="h-7 w-40 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CIUDAD_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {CIUDAD_META[id].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la zona (ej. Zona Norte)"
            maxLength={50}
            className="h-7 min-w-0 flex-1 text-xs"
          />

          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />

          {puntos.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={redibujar}>
              <PenLine size={13} />
              Redibujar
            </Button>
          )}

          <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={!puedeGuardar} onClick={guardar}>
            <Save size={13} />
            Guardar
          </Button>
        </div>
      </div>

      {/* Guía de la herramienta: cambia de texto según la etapa (dibujando vs. ajustando). */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <div className="pointer-events-none flex items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs text-muted-foreground shadow-xl backdrop-blur-sm">
          <MousePointerClick size={13} className="shrink-0" />
          {dibujando ? (
            puntos.length === 0 ? (
              <span>Click en el mapa para empezar el polígono de la zona.</span>
            ) : (
              <span>
                <span className="font-medium tabular-nums text-foreground">{puntos.length}</span>{' '}
                vértice{puntos.length !== 1 ? 's' : ''} · doble click, Enter o click en el primero para
                cerrar · Backspace deshace, Escape reinicia.
              </span>
            )
          ) : (
            <span>Arrastrá los vértices para ajustar el contorno · click derecho borra uno.</span>
          )}
        </div>
      </div>
    </Card>
  )
}
