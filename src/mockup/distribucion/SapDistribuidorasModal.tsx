// ALTA DE UN CENTRO DE DISTRIBUCIÓN: se elige del maestro de SAP, no se inventa acá.
//
// SAP es el dueño del centro (código, nombre, dirección, coordenada); nosotros somos dueños de su
// TERRITORIO (`distribution_zones`). Por eso el alta es una importación y el paso siguiente es
// dibujar el contorno, no llenar un formulario.
//
// ═══ SE MIGRÓ AL `DataTable` COMPARTIDO ═══
//
// La tabla estaba armada a mano con `<Table>` y las pestañas de filtro con `<button>` crudos de tres
// colores. Con el DataTable de `@/components/data-table` la lista gana lo que no tenía —columnas
// redimensionables y ocultables, orden por columna, densidad, export y buscador en su toolbar— y deja
// de ser una tabla que se parece a las demás solo de lejos.
//
// LA SELECCIÓN ES DE A UNA y por eso NO usa `selectable` (que es multi, con checkbox): se elige con
// un click en la fila y la elegida se marca con un tilde en la primera columna. Importar dos centros
// a la vez no es una operación que exista —cada uno necesita su propio contorno dibujado después—.
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Building2, Check, MapPin, Plus, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, defineColumns } from '@/components/data-table'
import { cn } from '@/lib/utils'
import { consultarDistribuidorasSap, type SapDistribuidora } from './sap-distribuidoras'
import type { Distribuidora } from './distribuidoras-store'
import { CIUDAD_META, type CiudadId, cityIdDe } from '../mock-data'

interface SapDistribuidorasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ciudad: CiudadId
  distribuidorasEnDb: Distribuidora[]
  onImportar: (sapItem: SapDistribuidora) => void
  onCrearManual: () => void
}

type TabFiltro = 'PENDIENTES' | 'ALL' | 'IMPORTADAS'

/** Una fila de SAP más lo único que agrega esta pantalla: si ya está en nuestra base. */
interface FilaSap extends SapDistribuidora {
  estaEnDb: boolean
}

const FILTROS: { value: TabFiltro; label: string }[] = [
  { value: 'PENDIENTES', label: 'Pendientes' },
  { value: 'ALL', label: 'Todos' },
  { value: 'IMPORTADAS', label: 'Ya registrados' },
]

const columns = defineColumns<FilaSap & { seleccionado: boolean }>([
  {
    // La marca de selección como columna y no como radio suelto: el tilde ocupa el mismo lugar que
    // ocuparía el check de una tabla seleccionable, así que la fila se lee igual que en el resto.
    id: 'marca',
    header: '',
    size: 36,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    pin: 'left',
    meta: { align: 'center' },
    cell: (fila) =>
      fila.estaEnDb || fila.seleccionado ? (
        <Check
          size={13}
          className={fila.estaEnDb ? 'text-muted-foreground' : 'text-primary'}
          aria-label={fila.estaEnDb ? 'Ya registrado' : 'Seleccionado'}
        />
      ) : null,
  },
  {
    id: 'sapCode',
    header: 'Código SAP',
    accessorKey: 'sapCode',
    size: 130,
    cell: (fila) => <span className="font-mono text-xs">{fila.sapCode}</span>,
  },
  {
    id: 'name',
    header: 'Centro de distribución',
    accessorKey: 'name',
    size: 300,
    cell: (fila) => (
      <div className="min-w-0 py-0.5">
        <div className="truncate font-medium leading-tight">{fila.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">{fila.address}</div>
      </div>
    ),
  },
  {
    id: 'plantType',
    header: 'Tipo',
    accessorKey: 'plantType',
    size: 170,
    cell: (fila) => <span className="truncate text-muted-foreground">{fila.plantType}</span>,
  },
  {
    id: 'capacityPlts',
    header: 'Capacidad',
    accessorKey: 'capacityPlts',
    size: 110,
    meta: { align: 'right' },
    cell: (fila) => (
      <span className="whitespace-nowrap tabular-nums">
        {fila.capacityPlts.toLocaleString('es-BO')} <span className="text-muted-foreground">plts</span>
      </span>
    ),
  },
  {
    id: 'estado',
    header: 'Estado',
    size: 120,
    enableSorting: false,
    cell: (fila) => (
      <Badge variant="outline" className="h-4 px-1 text-[10px]">
        {fila.estaEnDb ? 'Registrado' : 'Disponible'}
      </Badge>
    ),
  },
])

export function SapDistribuidorasModal({
  open,
  onOpenChange,
  ciudad,
  distribuidorasEnDb,
  onImportar,
  onCrearManual,
}: SapDistribuidorasModalProps) {
  const cityId = cityIdDe(ciudad)
  const [cargando, setCargando] = useState(false)
  const [tab, setTab] = useState<TabFiltro>('PENDIENTES')
  const [seleccionada, setSeleccionada] = useState<SapDistribuidora | null>(null)
  const [sapItems, setSapItems] = useState<SapDistribuidora[]>([])

  /** Cruce por nombre exacto dentro de la ciudad: es la única llave que compartimos con SAP hoy. */
  const yaEnDb = useCallback(
    (item: SapDistribuidora) =>
      distribuidorasEnDb.some(
        (db) =>
          db.cityId === item.cityId &&
          db.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      ),
    [distribuidorasEnDb],
  )

  /**
   * Consulta SAP y preselecciona la primera pendiente.
   *
   * Una sola función para el efecto de apertura y para el botón de sincronizar: eran dos copias del
   * mismo cuerpo, y cualquier arreglo en una se olvidaba en la otra.
   */
  const consultar = useCallback(() => {
    setCargando(true)
    consultarDistribuidorasSap(cityId)
      .then((items) => {
        setSapItems(items)
        setSeleccionada(items.find((it) => !yaEnDb(it)) ?? null)
      })
      .finally(() => setCargando(false))
  }, [cityId, yaEnDb])

  useEffect(() => {
    if (open) consultar()
  }, [open, consultar])

  const filas = useMemo(
    () =>
      sapItems.map((item) => ({
        ...item,
        estaEnDb: yaEnDb(item),
        seleccionado: seleccionada?.sapCode === item.sapCode,
      })),
    [sapItems, yaEnDb, seleccionada],
  )

  const conteos: Record<TabFiltro, number> = {
    PENDIENTES: filas.filter((f) => !f.estaEnDb).length,
    ALL: filas.length,
    IMPORTADAS: filas.filter((f) => f.estaEnDb).length,
  }

  const filtradas = useMemo(
    () =>
      filas.filter((f) => {
        if (tab === 'PENDIENTES' && f.estaEnDb) return false
        if (tab === 'IMPORTADAS' && !f.estaEnDb) return false
        return true
      }),
    [filas, tab],
  )

  const puedeImportar = seleccionada !== null && !yaEnDb(seleccionada)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[min(940px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        aria-describedby="sap-modal-description"
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b border-border p-3 sm:px-4">
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold">Nuevo centro de distribución</DialogTitle>
            <DialogDescription id="sap-modal-description" className="text-xs">
              Se elige del maestro de SAP. Después se le dibuja el contorno en el mapa.
            </DialogDescription>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="h-6 gap-1 px-1.5 text-[11px] font-normal">
              <MapPin size={11} className="text-muted-foreground" />
              {CIUDAD_META[ciudad].label}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={consultar}
              disabled={cargando}
              className="h-7 gap-1.5 px-2 text-xs"
              title="Volver a consultar el maestro de SAP"
            >
              <RefreshCw size={13} className={cn(cargando && 'animate-spin')} />
              Sincronizar
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <DataTable
            tableId="mockup-sap-distribuidoras"
            columns={columns}
            data={filtradas}
            getRowId={(fila) => fila.sapCode}
            isLoading={cargando}
            searchable
            searchPlaceholder="Buscar por código, nombre o dirección…"
            searchKeys={['sapCode', 'name', 'address', 'plantType']}
            clientPagination
            defaultPageSize={10}
            defaultDensity="compact"
            bodyMinHeight={320}
            // Un click elige; los ya registrados no se pueden elegir porque no hay nada que importar.
            onRowClick={(fila) => {
              if (!fila.estaEnDb) setSeleccionada(fila)
            }}
            rowClassName={(fila) =>
              fila.estaEnDb
                ? 'opacity-55'
                : fila.seleccionado
                  ? 'bg-primary/10 cursor-pointer'
                  : 'cursor-pointer'
            }
            emptyTitle="Sin centros"
            emptyMessage={
              tab === 'PENDIENTES'
                ? 'Todos los centros de SAP de esta ciudad ya están registrados.'
                : 'SAP no devolvió centros para esta ciudad.'
            }
            filterBar={
              <div className="flex flex-wrap items-center gap-1">
                {FILTROS.map(({ value, label }) => (
                  <Button
                    key={value}
                    variant={tab === value ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => setTab(value)}
                  >
                    {label}
                    <span className="tabular-nums text-muted-foreground">{conteos[value]}</span>
                  </Button>
                ))}
              </div>
            }
          />
        </div>

        <div className="flex shrink-0 flex-col items-center justify-between gap-2 border-t border-border p-3 sm:flex-row sm:px-4">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {puedeImportar && seleccionada ? (
              <>
                Se va a registrar{' '}
                <span className="font-medium text-foreground">{seleccionada.name}</span> (
                {seleccionada.sapCode}).
              </>
            ) : (
              'Elegí un centro de la tabla.'
            )}
          </p>

          <div className="flex shrink-0 items-center gap-2">
            {/* ── «CREAR A MANO», DESACTIVADO ─────────────────────────────────────────────────
                El alta manual queda FUERA de circulación: SAP es el dueño del maestro de centros, y
                crear uno acá deja una fila que después llega otra vez desde SAP con otro nombre y sin
                forma de cruzarlas. Se comenta en vez de borrarse porque puede volver a hacer falta el
                día que haya un centro que SAP no tenga.
                El camino sigue existiendo entero: `onCrearManual` → `abrirAlta` → `DistribuidoraFormPanel`.
                Para reactivarlo alcanza con descomentar esto.

            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                onOpenChange(false)
                onCrearManual()
              }}
            >
              <Plus size={13} />
              Crear a mano
            </Button>
            ── */}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={!puedeImportar}
              onClick={() => {
                if (!seleccionada || !puedeImportar) return
                onImportar(seleccionada)
                onOpenChange(false)
              }}
            >
              <Building2 size={13} />
              Registrar y dibujar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
