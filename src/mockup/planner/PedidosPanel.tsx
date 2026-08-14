// Panel "Pedidos": de qué universo sale la planificación y qué entra de lo que no entra solo.
//
// LA UNIFICACIÓN PASA ACÁ. En el flujo actual esto es el paso 1 (una tabla, sin mapa) y las paradas
// recién se ven en el paso 2. Al vivir sobre el mapa, cada tilde de un filtro se ve caer en la ciudad:
// filtrar y armar dejan de ser dos momentos.
//
// TRES BLOQUES, EN ORDEN DE DECISIÓN:
//   1. Filtros    → de dónde salen los pedidos.
//   2. Canales    → un select-search. Elegir uno abre su DIÁLOGO con la tabla completa para decidir
//                   pedido por pedido. Es el mismo gesto (y el mismo componente) del paso 1.
//   3. Paradas    → lo que el camión va a visitar, ya unificado por punto de entrega, paginado.
//
// POR QUÉ EL DESGLOSE POR CANAL Y NO UNA LISTA PLANA DE PEDIDOS. Antes las 59 paradas iban todas
// juntas, mezclando mayoristas con kioscos: no había forma de contestar "¿cuánto me está metiendo
// Tradicional?" ni de sacar un canal entero. El agregado por canal es la unidad en la que se DECIDE;
// la parada es la unidad en la que se NAVEGA el mapa. Son dos controles porque son dos preguntas.
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AlertTriangle,
  Building2,
  ChevronsUpDown,
  Globe,
  MapPin,
  Search,
  Store,
  User,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CanalGlyph } from '../canal-glyph'
import { CanalPedidosDialog } from '../CanalPedidosDialog'
import {
  entraPorCorte,
  estaIncluido,
  selectScopedOrders,
  useDispatchPlanStore,
} from '../dispatch-plan-store'
import {
  CANAL_IDS,
  CANAL_META,
  CIUDAD_IDS,
  CIUDAD_META,
  MERCADO_IDS,
  MERCADO_META,
  VENDEDORES,
  ZONA_IDS,
  ZONA_META,
  type CanalId,
  type CiudadId,
  type MercadoId,
  type Parada,
  type ZonaId,
} from '../mock-data'
import { FiltroPopover } from './FiltroPopover'
import { FueraDeCorteDialog } from './FueraDeCorteDialog'
import { Paginador, usePagina } from './Paginador'
import type { RutaPlan } from './planner-model'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

const POR_PAGINA = 10

export function PedidosPanel({
  paradas,
  rutas,
  paradaFoco,
  onFoco,
}: {
  /** Paradas ya proyectadas con su asignación: la lista muestra el color de la ruta que les tocó. */
  paradas: Parada[]
  rutas: RutaPlan[]
  paradaFoco: string | null
  onFoco: (paradaId: string) => void
}) {
  const colorPorRuta = useMemo(() => new Map(rutas.map((r) => [r.id, r.color])), [rutas])
  const activeCanales = useDispatchPlanStore((s) => s.activeCanales)
  const activeCiudades = useDispatchPlanStore((s) => s.activeCiudades)
  const activeMercados = useDispatchPlanStore((s) => s.activeMercados)
  const activeZonas = useDispatchPlanStore((s) => s.activeZonas)
  const activeVendedores = useDispatchPlanStore((s) => s.activeVendedores)
  const orderOverrides = useDispatchPlanStore((s) => s.orderOverrides)
  const applySelection = useDispatchPlanStore((s) => s.applySelection)
  // `useShallow`: el selector deriva un array NUEVO en cada llamada y sin igualdad shallow Zustand v5
  // lo ve como snapshot cambiante en cada render (bucle infinito).
  const enScope = useDispatchPlanStore(useShallow(selectScopedOrders))

  const [busqueda, setBusqueda] = useState('')
  const [canalPickerAbierto, setCanalPickerAbierto] = useState(false)
  const [canalDetalle, setCanalDetalle] = useState<CanalId | null>(null)
  const [fueraAbierto, setFueraAbierto] = useState(false)

  // El estado del filtro vive SOLO en el store: acá no hay draft local. En el paso 1 el draft existía
  // para juntar varios toggles en un fetch; sobre el mapa el efecto tiene que verse en el toggle, que
  // es justamente lo que esta pantalla viene a proponer.
  const toggle = (
    dimension: 'canales' | 'ciudades' | 'mercados' | 'zonas' | 'vendedores',
    value: string,
  ) => {
    const actual = {
      canales: activeCanales as string[],
      ciudades: activeCiudades as string[],
      mercados: activeMercados as string[],
      zonas: activeZonas as string[],
      vendedores: activeVendedores,
    }
    const siguiente = actual[dimension].includes(value)
      ? actual[dimension].filter((v) => v !== value)
      : [...actual[dimension], value]

    applySelection({
      canales: (dimension === 'canales' ? siguiente : actual.canales) as CanalId[],
      ciudades: (dimension === 'ciudades' ? siguiente : actual.ciudades) as CiudadId[],
      mercados: (dimension === 'mercados' ? siguiente : actual.mercados) as MercadoId[],
      zonas: (dimension === 'zonas' ? siguiente : actual.zonas) as ZonaId[],
      vendedores: dimension === 'vendedores' ? siguiente : actual.vendedores,
    })
  }

  const fuera = useMemo(() => enScope.filter((p) => !entraPorCorte(p)), [enScope])
  const fueraIncluidos = useMemo(
    () => fuera.filter((p) => estaIncluido(p, orderOverrides)),
    [fuera, orderOverrides],
  )

  /**
   * Agregado por canal de lo que EFECTIVAMENTE entra al plan (`estaIncluido` = regla de corte + las
   * decisiones manuales). Se cuenta sobre el mismo predicado que usan el mapa y el HUD, así el resumen
   * no puede contar distinto de lo que se ve dibujado.
   */
  const porCanal = useMemo(() => {
    return CANAL_IDS.filter((c) => activeCanales.includes(c))
      .map((canal) => {
        const delCanal = enScope.filter((p) => p.canal === canal)
        const incluidos = delCanal.filter((p) => estaIncluido(p, orderOverrides))
        return {
          canal,
          pedidos: incluidos.length,
          total: delCanal.length,
          clientes: new Set(incluidos.map((p) => p.cliente)).size,
          pesoKg: incluidos.reduce((acc, p) => acc + p.peso, 0),
          fuera: delCanal.filter((p) => !entraPorCorte(p)).length,
        }
      })
      .filter((fila) => fila.total > 0)
  }, [activeCanales, enScope, orderOverrides])

  const totales = useMemo(
    () => ({
      pedidos: porCanal.reduce((acc, f) => acc + f.pedidos, 0),
      pesoKg: porCanal.reduce((acc, f) => acc + f.pesoKg, 0),
    }),
    [porCanal],
  )

  const paradasVisibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return paradas
    return paradas.filter(
      (p) =>
        p.cliente.toLowerCase().includes(texto) || p.puntoEntrega.toLowerCase().includes(texto),
    )
  }, [busqueda, paradas])

  const pagina = usePagina(paradasVisibles, POR_PAGINA, busqueda)

  const sinCanal = activeCanales.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── 1. Filtros ──
          ORDEN: Ciudad (el más amplio) primero, después Canal, Mercado, Zona, Vendedor — mismo orden
          que el paso 1, para que quien ya conoce la pantalla no tenga que reaprenderlo. */}
      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <FiltroPopover
            label="Ciudad"
            icon={Building2}
            active={activeCiudades}
            onToggle={(v) => toggle('ciudades', v)}
            searchPlaceholder="Buscar ciudad…"
            emptyText="Sin ciudades"
            options={CIUDAD_IDS.map((c) => ({ value: c, label: CIUDAD_META[c].label }))}
          />
          <FiltroPopover
            label="Canal"
            icon={Store}
            active={activeCanales}
            onToggle={(v) => toggle('canales', v)}
            searchPlaceholder="Buscar canal…"
            emptyText="Sin canales"
            options={CANAL_IDS.map((c) => ({
              value: c,
              label: CANAL_META[c].label,
              glyph: (
                <span className="shrink-0" style={{ color: CANAL_META[c].color }}>
                  <CanalGlyph canal={c} size={14} />
                </span>
              ),
            }))}
          />
          <FiltroPopover
            label="Mercado"
            icon={Globe}
            active={activeMercados}
            onToggle={(v) => toggle('mercados', v)}
            searchPlaceholder="Buscar mercado…"
            emptyText="Sin mercados"
            options={MERCADO_IDS.map((m) => ({ value: m, label: MERCADO_META[m].label }))}
          />
          <FiltroPopover
            label="Zona"
            icon={MapPin}
            active={activeZonas}
            onToggle={(v) => toggle('zonas', v)}
            searchPlaceholder="Buscar zona…"
            emptyText="Sin zonas"
            options={ZONA_IDS.map((z) => ({ value: z, label: ZONA_META[z].label }))}
          />
          <FiltroPopover
            label="Vendedor"
            icon={User}
            active={activeVendedores}
            onToggle={(v) => toggle('vendedores', v)}
            searchPlaceholder="Buscar vendedor…"
            emptyText="Sin vendedores"
            options={VENDEDORES.map((v) => ({ value: v, label: v }))}
          />
        </div>
      </div>

      {sinCanal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
          <p className="text-sm font-medium">Elegí un canal</p>
          <p className="text-xs text-muted-foreground">
            Sin canal no hay pedidos que traer, y el mapa queda vacío.
          </p>
        </div>
      ) : (
        <>
          {/* ── 2. Pedidos por canal (select-search) ──
              ANTES ERA UNA LISTA DE FILAS, una por canal. Funcionaba con seis, pero crece: cada canal
              nuevo le come 28 px al panel para siempre, aunque nadie lo esté mirando, y con diez la
              lista de paradas —que es lo que se usa a cada rato— quedaba empujada abajo del pliegue.

              El select-search ocupa 28 px FIJOS sea cual sea la cantidad de canales, y adentro tiene
              lo que la lista mostraba (glifo, pedidos, peso) más un buscador que la lista no tenía.
              Elegir uno abre su diálogo con la tabla completa: el select no filtra el mapa, ABRE. */}
          <div className="shrink-0 space-y-1.5 border-b border-border px-2 py-2">
            <Popover open={canalPickerAbierto} onOpenChange={setCanalPickerAbierto}>
              <PopoverTrigger
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'h-7 w-full justify-start gap-1.5 px-2 text-xs',
                )}
              >
                <Store size={13} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">Ver pedidos por canal</span>
                {/* La advertencia viaja al trigger: si los pedidos fuera de corte quedaran solo dentro
                    del popover, nadie se enteraría de que hay algo pendiente sin abrirlo. */}
                {fuera.length > fueraIncluidos.length && (
                  <AlertTriangle size={12} className="shrink-0 text-amber-500" />
                )}
                <ChevronsUpDown size={12} className="shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <Command>
                  <CommandInput placeholder="Buscar canal…" className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                      Sin canales
                    </CommandEmpty>
                    <CommandGroup heading="Entra al plan">
                      {porCanal.map((fila) => {
                        const meta = CANAL_META[fila.canal]
                        return (
                          <CommandItem
                            key={fila.canal}
                            value={meta.label}
                            onSelect={() => {
                              setCanalPickerAbierto(false)
                              setCanalDetalle(fila.canal)
                            }}
                            className="gap-2 text-xs"
                            title={`${fila.pedidos} de ${fila.total} pedidos · ${fila.clientes} clientes · corte ${meta.timeOff}`}
                          >
                            <span className="shrink-0" style={{ color: meta.color }}>
                              <CanalGlyph canal={fila.canal} size={14} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                            <span className="shrink-0 tabular-nums">{fila.pedidos}</span>
                            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                              {fmtPeso.format(fila.pesoKg)} kg
                            </span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>

                    {/* Fuera de corte va en su propio grupo y en ámbar: no es un canal, es una
                        ADVERTENCIA —"hay pedidos que se van a quedar afuera"—. */}
                    {fuera.length > 0 && (
                      <CommandGroup heading="Requiere decisión">
                        <CommandItem
                          value="Fuera de corte"
                          onSelect={() => {
                            setCanalPickerAbierto(false)
                            setFueraAbierto(true)
                          }}
                          className="gap-2 text-xs"
                        >
                          <AlertTriangle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
                          <span className="min-w-0 flex-1 truncate">Fuera de corte</span>
                          {/* Fracción y no total: las dos mitades importan. Con solo el total no se
                              distingue "no lo miré" de "lo miré y no elegí ninguno". */}
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                              fueraIncluidos.length > 0
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-amber-500 text-white',
                            )}
                          >
                            {fueraIncluidos.length}/{fuera.length}
                          </span>
                        </CommandItem>
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Totales del plan. Es lo único de la lista de canales que SÍ tiene que estar siempre a la
                vista: el desglose se consulta, el total se vigila. */}
            <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                <span className="font-semibold tabular-nums text-foreground">{totales.pedidos}</span>{' '}
                pedidos en <span className="tabular-nums">{porCanal.length}</span> canal
                {porCanal.length === 1 ? '' : 'es'}
              </span>
              <span className="tabular-nums">{fmtPeso.format(totales.pesoKg)} kg</span>
            </div>
          </div>

          {/* ── 3. Paradas ──
              Cabecera con buscador y contador. Es la lista de navegación del mapa: click en una fila
              vuela hasta el punto. */}
          <div className="shrink-0 border-b border-border px-2 py-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar en ${paradas.length} paradas`}
                className="h-7 pl-7 text-xs"
                aria-label="Buscar parada"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {pagina.items.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {paradas.length === 0
                  ? 'Los filtros actuales no dejan pasar ningún pedido.'
                  : 'Ninguna parada coincide con la búsqueda.'}
              </p>
            ) : (
              pagina.items.map((parada) => {
                const meta = CANAL_META[parada.canal]
                const enFoco = paradaFoco === parada.id
                const color = parada.rutaId ? colorPorRuta.get(parada.rutaId) : undefined
                return (
                  <button
                    key={parada.id}
                    type="button"
                    onClick={() => onFoco(parada.id)}
                    title={`${parada.cliente} · ${parada.puntoEntrega} · ${parada.ventana}`}
                    className={cn(
                      'flex h-7 w-full items-center gap-2 px-2 text-left text-xs transition-colors',
                      enFoco ? 'bg-primary/10' : 'hover:bg-muted/70',
                    )}
                  >
                    {/* Punto del color de la ruta: dice de un vistazo qué quedó sin asignar. Sin ruta =
                        círculo punteado, el mismo lenguaje que el borde del disco en el mapa. */}
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        !color && 'border border-dashed border-muted-foreground',
                      )}
                      style={color ? { background: color } : undefined}
                      aria-hidden
                    />
                    <span className="shrink-0" style={{ color: meta.color }}>
                      <CanalGlyph canal={parada.canal} size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{parada.cliente}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {parada.pedidos.length}p · {fmtPeso.format(parada.pesoTotal)}kg
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <Paginador pagina={pagina} />
        </>
      )}

      {/* Diálogos. `CanalPedidosDialog` es el MISMO del paso 1: mismo componente, mismo store, misma
          convención de guardado instantáneo — la propuesta no reimplementa lo que ya funciona. */}
      <CanalPedidosDialog
        canal={canalDetalle}
        pedidos={canalDetalle ? enScope.filter((p) => p.canal === canalDetalle) : []}
        onClose={() => setCanalDetalle(null)}
      />
      <FueraDeCorteDialog
        abierto={fueraAbierto}
        pedidos={fuera}
        onClose={() => setFueraAbierto(false)}
      />
    </div>
  )
}
