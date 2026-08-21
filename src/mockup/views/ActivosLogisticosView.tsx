// Dato maestro: ACTIVOS LOGÍSTICOS (`logistic_assets`) — el catálogo del bandeo.
//
// QUÉ ES ESTA PANTALLA. El bandeo es todo lo que el camión se lleva y no es mercadería: pallets,
// carritos de carga, jabas, refrigeradores. Hasta ahora ese catálogo era una constante en el código
// (`accesorios.ts`, con el comentario "no hay tabla ni pantalla de dato maestro"); el esquema nuevo trae
// `logistic_assets` y esta es su pantalla.
//
// POR QUÉ UNA TABLA Y NO UN MAPA COMO ZONAS. Un activo no tiene geometría: son seis campos y la pregunta
// que se hace sobre ellos es de COMPARACIÓN ("¿cuáles van por serie?", "¿cuál pesa más?", "¿qué hay dado
// de baja?"), que es exactamente para lo que sirve una tabla con filtros y orden por columna. El mapa a
// sangre de zonas existe porque una zona SIN el mapa no se puede ni ver.
//
// LA COLUMNA QUE MANDA ES «Control», no el nombre: define cómo se cuenta la unidad al salir y al volver
// (por cantidad o por número de serie) y no se puede cambiar sin reinterpretar los viajes ya registrados.
// Va con badge propio, no como un "Sí/No" en una columna de bandera.
//
// BAJA LÓGICA EN DOS NIVELES, porque el esquema tiene las dos columnas y significan cosas distintas:
//   · `is_active = false` → retirado de circulación. Sigue en el catálogo y en los listados; lo que no
//     hace es ofrecerse al cargar bandeo nuevo. Es reversible con un click.
//   · `deleted_at` → borrado. Sale de la pantalla, pero la fila se conserva porque
//     `transport_order_assets.logistic_asset_id` de un viaje viejo sigue apuntando acá.
import { useMemo, useState } from 'react'
import { Boxes, ListOrdered, Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react'
import { DataTable, defineColumns, defineFilters, FilterBar, type RowAction } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { DISTRIBUIDORAS } from '../mock-data'
import {
  TIPO_ACTIVO_META,
  TIPOS_ACTIVO,
  useLogisticAssetsStore,
  type ActivoLogistico,
  type ActivoLogisticoInput,
} from '../logistic-assets-store'
import { ActivoLogisticoDialog } from './ActivoLogisticoDialog'

const nombreDistribuidora = (id: number | null): string =>
  id === null ? 'Flota global' : (DISTRIBUIDORAS.find((d) => d.id === id)?.nombre ?? `Distribuidora ${id}`)

/** Dos decimales con coma, como se escribe un número en es-BO. `DECIMAL(12,2)` en la tabla. */
const fmtDecimal = (n: number) => n.toFixed(2).replace('.', ',')

interface FiltrosActivos extends Record<string, unknown> {
  tipo?: string
  control?: string
  distribuidora?: string
  estado?: string
}

const columns = defineColumns<ActivoLogistico>([
  {
    id: 'code',
    header: 'Código',
    accessorKey: 'code',
    size: 150,
    pin: 'left',
    cell: (row) => <span className="font-mono text-xs font-medium">{row.code}</span>,
  },
  {
    id: 'name',
    header: 'Nombre',
    accessorKey: 'name',
    size: 280,
    cell: (row) => (
      <span className={cn('truncate', !row.isActive && 'text-muted-foreground')}>{row.name}</span>
    ),
  },
  {
    id: 'assetType',
    header: 'Tipo',
    accessorKey: 'assetType',
    size: 190,
    cell: (row) => TIPO_ACTIVO_META[row.assetType].label,
  },
  {
    id: 'control',
    header: 'Control',
    accessorKey: 'isSerialized',
    size: 150,
    cell: (row) =>
      row.isSerialized ? (
        <Badge
          variant="outline"
          className="gap-1 rounded-full border-primary/30 bg-primary/10 font-medium text-primary"
        >
          <ListOrdered size={11} />
          Por serie
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 rounded-full border-border bg-muted font-medium text-muted-foreground">
          <Boxes size={11} />
          Por cantidad
        </Badge>
      ),
  },
  {
    id: 'tareWeightKg',
    header: 'Peso (kg)',
    accessorKey: 'tareWeightKg',
    size: 110,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtDecimal(row.tareWeightKg)}</span>,
  },
  {
    id: 'tareVolumeM3',
    header: 'Volumen (m³)',
    accessorKey: 'tareVolumeM3',
    size: 130,
    meta: { align: 'right' },
    cell: (row) => <span className="tabular-nums">{fmtDecimal(row.tareVolumeM3)}</span>,
  },
  {
    id: 'distributorId',
    header: 'Distribuidora',
    accessorKey: 'distributorId',
    size: 200,
    cell: (row) => (
      <span className={row.distributorId === null ? 'text-muted-foreground' : undefined}>
        {nombreDistribuidora(row.distributorId)}
      </span>
    ),
  },
  {
    id: 'isActive',
    header: 'Estado',
    accessorKey: 'isActive',
    size: 120,
    cell: (row) =>
      row.isActive ? (
        <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 font-medium text-primary">
          En uso
        </Badge>
      ) : (
        <Badge variant="outline" className="rounded-full border-border bg-muted font-medium text-muted-foreground">
          Retirado
        </Badge>
      ),
  },
])

const filterDefs = defineFilters<FiltrosActivos>([
  {
    type: 'select',
    id: 'tipo',
    label: 'Tipo',
    options: TIPOS_ACTIVO.map((t) => ({ label: TIPO_ACTIVO_META[t].label, value: t })),
  },
  {
    type: 'select',
    id: 'control',
    label: 'Control',
    options: [
      { label: 'Por cantidad', value: 'cantidad' },
      { label: 'Por número de serie', value: 'serie' },
    ],
  },
  {
    type: 'select',
    id: 'distribuidora',
    label: 'Distribuidora',
    options: [
      { label: 'Flota global', value: 'global' },
      ...DISTRIBUIDORAS.map((d) => ({ label: d.nombre, value: String(d.id) })),
    ],
  },
  {
    type: 'select',
    id: 'estado',
    label: 'Estado',
    options: [
      { label: 'En uso', value: 'activo' },
      { label: 'Retirado', value: 'retirado' },
    ],
  },
])

export function ActivosLogisticosView() {
  const activos = useLogisticAssetsStore((s) => s.activos)
  const addActivo = useLogisticAssetsStore((s) => s.addActivo)
  const updateActivo = useLogisticAssetsStore((s) => s.updateActivo)
  const setActivoEnUso = useLogisticAssetsStore((s) => s.setActivoEnUso)
  const removeActivo = useLogisticAssetsStore((s) => s.removeActivo)
  const restaurarSeed = useLogisticAssetsStore((s) => s.restaurarSeed)

  const [filtros, setFiltros] = useState<Partial<FiltrosActivos>>({})
  /** `null` con el diálogo abierto = alta. Con activo = edición. Cerrado = `abierto` en false. */
  const [enEdicion, setEnEdicion] = useState<ActivoLogistico | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [aBorrar, setABorrar] = useState<ActivoLogistico | null>(null)

  /** Los borrados no se listan: `deleted_at` es la baja, no un filtro más de la pantalla. */
  const vivos = useMemo(() => activos.filter((a) => !a.deletedAt), [activos])

  const filtrados = useMemo(
    () =>
      vivos.filter((a) => {
        if (filtros.tipo && a.assetType !== filtros.tipo) return false
        if (filtros.control && a.isSerialized !== (filtros.control === 'serie')) return false
        if (filtros.distribuidora) {
          const esperado = filtros.distribuidora === 'global' ? null : Number(filtros.distribuidora)
          if (a.distributorId !== esperado) return false
        }
        if (filtros.estado && a.isActive !== (filtros.estado === 'activo')) return false
        return true
      }),
    [vivos, filtros],
  )

  const abrirAlta = () => {
    setEnEdicion(null)
    setDialogoAbierto(true)
  }

  const abrirEdicion = (activo: ActivoLogistico) => {
    setEnEdicion(activo)
    setDialogoAbierto(true)
  }

  const guardar = (input: ActivoLogisticoInput) => {
    if (enEdicion) {
      updateActivo(enEdicion.id, input)
      toast.success(`${input.code.toUpperCase()} actualizado`)
    } else {
      const creado = addActivo(input)
      toast.success(`${creado.code} agregado al catálogo`)
    }
    setDialogoAbierto(false)
  }

  const rowActions = (row: ActivoLogistico): RowAction<ActivoLogistico>[] => [
    { label: 'Editar', icon: Pencil, onClick: abrirEdicion },
    {
      label: row.isActive ? 'Retirar de circulación' : 'Volver a poner en uso',
      icon: Power,
      onClick: (a) => {
        setActivoEnUso(a.id, !a.isActive)
        toast.success(a.isActive ? `${a.code} retirado de circulación` : `${a.code} vuelve a estar en uso`)
      },
    },
    { label: 'Eliminar', icon: Trash2, variant: 'destructive', onClick: setABorrar, separator: true },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Catálogo del bandeo: lo que el camión se lleva y no es mercadería. Lo que se define acá es cómo
          se cuenta al salir y al volver.
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={restaurarSeed}
            title="Volver al catálogo de ejemplo, para demostración"
          >
            <RotateCcw size={13} className="mr-1.5" />
            Reiniciar demo
          </Button>
          <Button onClick={abrirAlta}>
            <Plus size={14} className="mr-1.5" />
            Nuevo activo
          </Button>
        </div>
      </div>

      <DataTable
        tableId="mockup-activos-logisticos"
        columns={columns}
        data={filtrados}
        getRowId={(row) => String(row.id)}
        emptyTitle="Sin activos"
        emptyMessage="Ningún activo logístico coincide con estos filtros."
        emptyAction={{ label: 'Nuevo activo', onClick: abrirAlta }}
        bodyMinHeight={560}
        searchable
        searchPlaceholder="Buscar por código o nombre…"
        clientPagination
        defaultPageSize={10}
        rowActions={rowActions}
        // Doble click abre la edición: es el mismo gesto que el listado de zonas, y evita gastar una
        // columna de botones en la acción que se hace el 90% de las veces.
        onRowDoubleClick={abrirEdicion}
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filtros}
            onChange={(u) => setFiltros((prev) => ({ ...prev, ...u }))}
          />
        }
      />

      <ActivoLogisticoDialog
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        activo={enEdicion}
        catalogo={vivos}
        onGuardar={guardar}
      />

      <AlertDialog open={aBorrar !== null} onOpenChange={(abierto) => !abierto && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{aBorrar?.code}»</AlertDialogTitle>
            <AlertDialogDescription>
              Sale del catálogo pero el registro se conserva: un viaje viejo puede seguir apuntando a este
              activo por id. Si lo que querés es que deje de ofrecerse al cargar bandeo, usá «Retirar de
              circulación» — eso se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aBorrar) return
                removeActivo(aBorrar.id)
                toast.success(`${aBorrar.code} eliminado`)
                setABorrar(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
