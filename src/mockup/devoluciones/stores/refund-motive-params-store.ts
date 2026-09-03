// Store de los PARÁMETROS DE MOTIVO DE DEVOLUCIÓN.
//
// QUÉ ES, Y EN QUÉ SE DIFERENCIA DEL MOTIVO. El motivo (`refund_reasons`) dice QUÉ es una devolución
// —«RECALL», «Vencimiento por factor atípico»—. El parámetro dice DESDE CUÁNDO, HASTA CUÁNDO y SOBRE
// QUÉ ese motivo se puede usar. Son dos tablas y dos pantallas porque son dos preguntas distintas: un
// motivo se define una vez y vive para siempre; un parámetro es una ventana con fecha de vencimiento
// —el recall de un lote dura lo que dura el recall— y se dan de alta muchos sobre el mismo motivo.
//
// EL ALCANCE VACÍO ES «TODO». Los ocho filtros —clientes, productos, lotes, familias, marcas, canales
// y distribuidoras— son opcionales, y un parámetro sin ninguno aplica a todo el universo. Es la regla
// que confirmó el usuario, y es la que hace que la pantalla sirva para los dos casos que existen: la
// regla general de la empresa, y el recall de tres lotes de una marca en un canal.
//
// LA VIGENCIA ES EL ÚNICO CAMPO QUE NO TIENE VALOR NEUTRO. Sin fechas no hay parámetro: son lo que
// distingue esta fila de una columna más del motivo.
//
// EL MOTIVO PRECARGA EL CENTRO DE COSTO Y EL TIPO DE PROCESO. En el sistema que esta pantalla
// reemplaza, el select de centro de costo se recarga por AJAX cuando cambia el motivo — el dato
// depende del motivo. Acá esa dependencia es directa: el motivo YA guarda su centro de costo y su
// tipo de proceso, así que elegir el motivo los propone y el formulario los deja corregir. Se guardan
// COPIADOS en la fila y no se leen del motivo al vuelo: un parámetro con fecha de fin es un documento
// vigente, y editar el motivo el año que viene no puede reescribir lo que una ventana ya cerrada dijo.
//
// LO QUE NO ESTÁ Y POR QUÉ. El sistema viejo tiene además un multiselect de «Categorías». Nuestro
// catálogo de productos no tiene esa columna —tiene `family`, y la marca se deriva del nombre—, así
// que un tercer nivel de agrupación no tendría de dónde leer sus opciones. Es lo único de esa
// pantalla que no está acá.
import { create } from 'zustand'
import { CHANNELS } from '../data/channels'
import { RETURN_DISTRIBUTOR_NAMES } from '../data/distributors-data'
import { PRODUCTS } from '../data/products'
import { SEED_CLIENTS } from '../data/seed'
import { PROCESO_META, type TipoProceso, useRefundReasonsStore } from './refund-reasons-store'

const STORAGE_KEY = 'mockups-web:parametros-motivo-devolucion'
const USUARIO_MOCK = 'Juan Pérez'

/**
 * Los tipos de numeración de lote del sistema viejo, tal cual salen de su select.
 *
 * `IMP` es el único cuyo código no es su etiqueta: se muestra «IMPORTADO». Los otros cinco son letras
 * de planta y se dicen como se escriben.
 */
export type TipoLote = 'SC' | 'LP' | 'IMP' | 'S' | 'L' | 'F'

export const TIPOS_LOTE: TipoLote[] = ['SC', 'LP', 'IMP', 'S', 'L', 'F']

export const TIPO_LOTE_LABELS: Record<TipoLote, string> = {
  SC: 'SC',
  LP: 'LP',
  IMP: 'IMPORTADO',
  S: 'S',
  L: 'L',
  F: 'F',
}

/** Un lote alcanzado por el parámetro: el tipo de numeración y el número. */
export interface LoteParam {
  tipo: TipoLote
  numero: string
}

/**
 * El estado de la fila.
 *
 * Son los tres valores del sistema viejo. `ELIMINADO` es una baja lógica y no un borrado: un
 * parámetro vencido explica devoluciones que se aprobaron bajo su ventana, así que la fila se queda.
 */
export type EstadoParametro = 'ENABLE' | 'DISABLED' | 'DELETED'

export const ESTADO_PARAMETRO_LABELS: Record<EstadoParametro, string> = {
  ENABLE: 'Activo',
  DISABLED: 'Inactivo',
  DELETED: 'Eliminado',
}

/** Una fila de parámetros. */
export interface ParametroMotivo {
  id: number
  /** FK al motivo. */
  refundReasonId: number
  /** Nombre del motivo CONGELADO: renombrar el motivo no reescribe la lista de parámetros viejos. */
  refundReasonName: string
  /** Copiado del motivo al elegirlo, y corregible. Ver la cabecera. */
  processType: TipoProceso
  /** Copiado del motivo al elegirlo. Opcional, igual que en el sistema viejo. */
  costCenter: string
  /** `YYYY-MM-DD`. Obligatorias las dos: son la razón de ser de la fila. */
  startDate: string
  endDate: string
  // ---- El alcance. Todo vacío = aplica a todo. ----
  clientIds: string[]
  productIds: string[]
  lotes: LoteParam[]
  families: string[]
  brands: string[]
  channelIds: string[]
  distributorNames: string[]
  status: EstadoParametro
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** Lo que el formulario decide. El id, el estado y la auditoría los pone el store. */
export type ParametroMotivoInput = Omit<
  ParametroMotivo,
  'id' | 'status' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

const nowIso = () => new Date().toISOString()

/** `YYYY-MM-DD` a `days` de hoy. Las fechas del parámetro son días, no instantes. */
export function dayKey(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// ---- Las opciones de los multiselect ------------------------------------------------------------
//
// Salen del catálogo que el mockup ya tiene y no de una lista escrita a mano: un segundo listado se
// desincroniza el día que alguien agregue un producto.

/** Las familias comerciales, deducidas del catálogo. */
export const FAMILIAS: string[] = [...new Set(PRODUCTS.map((p) => p.family))].sort((a, b) =>
  a.localeCompare(b, 'es'),
)

/**
 * Las marcas, deducidas del nombre del producto.
 *
 * El catálogo no tiene columna de marca —el nombre la lleva adelante («Salsa Golf Kris» no, «Kris»
 * sí)—, así que se busca cada marca conocida dentro del nombre. Una marca que no aparezca en ningún
 * producto no se ofrece: un filtro que no puede matchear nada es una opción que miente.
 */
const MARCAS_CONOCIDAS = ['Kris', 'Bristar', 'Frussion', 'Speranza', 'Fleischmann'] as const

export const MARCAS: string[] = MARCAS_CONOCIDAS.filter((marca) =>
  PRODUCTS.some((p) => p.name.includes(marca)),
)

/** A qué marca pertenece un producto, o `null` si su nombre no nombra ninguna conocida. */
export const marcaDe = (nombre: string): string | null =>
  MARCAS_CONOCIDAS.find((m) => nombre.includes(m)) ?? null

export const OPCIONES_CANAL = CHANNELS.map((c) => ({ value: c.id, label: c.name }))
export const OPCIONES_DISTRIBUIDORA = RETURN_DISTRIBUTOR_NAMES.map((n) => ({ value: n, label: n }))
export const OPCIONES_FAMILIA = FAMILIAS.map((f) => ({ value: f, label: f }))
export const OPCIONES_MARCA = MARCAS.map((m) => ({ value: m, label: m }))
export const OPCIONES_CLIENTE = SEED_CLIENTS.map((c) => ({ value: c.id, label: c.name }))
export const OPCIONES_PRODUCTO = PRODUCTS.map((p) => ({ value: p.id, label: p.name }))

/**
 * Cómo se resume el alcance en una línea.
 *
 * La lista necesita decir en una celda qué abarca la fila, y ocho columnas de conteos serían ocho
 * columnas que nadie lee. «Aplica a todo» no es un valor por defecto perezoso: es literalmente lo que
 * significa un parámetro sin filtros.
 */
export function resumenAlcance(p: ParametroMotivo): string {
  const partes: string[] = []
  const suma = (n: number, singular: string, plural: string) => {
    if (n > 0) partes.push(`${n} ${n === 1 ? singular : plural}`)
  }
  suma(p.clientIds.length, 'cliente', 'clientes')
  suma(p.productIds.length, 'producto', 'productos')
  suma(p.lotes.length, 'lote', 'lotes')
  suma(p.families.length, 'familia', 'familias')
  suma(p.brands.length, 'marca', 'marcas')
  suma(p.channelIds.length, 'canal', 'canales')
  suma(p.distributorNames.length, 'distribuidora', 'distribuidoras')
  return partes.length === 0 ? 'Aplica a todo' : partes.join(' · ')
}

/** Si la ventana del parámetro incluye el día de hoy. Un parámetro activo pero vencido no rige. */
export const estaVigente = (p: ParametroMotivo, hoy = dayKey()): boolean =>
  p.status === 'ENABLE' && p.startDate <= hoy && hoy <= p.endDate

let ultimoId = 0

const sellarContador = (filas: ParametroMotivo[]): ParametroMotivo[] => {
  ultimoId = filas.reduce((max, p) => Math.max(max, p.id), 0)
  return filas
}

const siguienteId = () => ++ultimoId

/**
 * Tres parámetros sembrados, uno por forma de usar la pantalla.
 *
 * No son decorativos: son los tres casos que la pantalla tiene que soportar y que se ven distinto en
 * la lista —el que aplica a todo, el acotado por producto y lote, y el vencido—. El motivo sale del
 * catálogo real, así que si alguien reinicia los motivos estos siguen apuntando a ids que existen.
 */
function seedParametros(): ParametroMotivo[] {
  const creado = nowIso()
  const motivos = useRefundReasonsStore.getState().motivos.filter((m) => !m.deletedAt)
  const porNombre = (fragmento: string) =>
    motivos.find((m) => m.name.toUpperCase().includes(fragmento)) ?? motivos[0]

  const base = (id: number, motivo: (typeof motivos)[number]) => ({
    id,
    refundReasonId: motivo.id,
    refundReasonName: motivo.name,
    processType: motivo.processType,
    costCenter: motivo.costCenter,
    clientIds: [],
    productIds: [],
    lotes: [],
    families: [],
    brands: [],
    channelIds: [],
    distributorNames: [],
    status: 'ENABLE' as EstadoParametro,
    createdBy: USUARIO_MOCK,
    updatedBy: USUARIO_MOCK,
    createdAt: creado,
    updatedAt: creado,
  })

  if (motivos.length === 0) return []

  const recall = porNombre('RECALL')
  const excepcional = porNombre('EXCEPCIONAL')
  const vencimiento = porNombre('VENCIMIENTO')

  return [
    // 1. El recall: acotado a un par de lotes de una marca. Es el caso que justifica que el alcance
    //    llegue hasta el número de lote.
    {
      ...base(1, recall),
      startDate: dayKey(-10),
      endDate: dayKey(50),
      lotes: [
        { tipo: 'SC', numero: 'L-24810' },
        { tipo: 'SC', numero: 'L-24811' },
      ],
      brands: MARCAS.slice(0, 1),
    },
    // 2. La regla general: sin un solo filtro. Aplica a todo, que es el caso más común.
    {
      ...base(2, excepcional),
      startDate: dayKey(-40),
      endDate: dayKey(320),
    },
    // 3. Una ventana ya cerrada, para que la lista muestre cómo se ve algo que no rige aunque esté
    //    en estado ACTIVO. Vigencia y estado son cosas distintas.
    {
      ...base(3, vencimiento),
      startDate: dayKey(-120),
      endDate: dayKey(-30),
      channelIds: OPCIONES_CANAL.slice(0, 2).map((c) => c.value),
      families: FAMILIAS.slice(0, 2),
    },
  ]
}

function readStored(): ParametroMotivo[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = seedParametros()
      writeStored(seed)
      return sellarContador(seed)
    }
    const parsed = JSON.parse(raw)
    return sellarContador(Array.isArray(parsed) ? (parsed as ParametroMotivo[]) : seedParametros())
  } catch {
    return sellarContador(seedParametros())
  }
}

function writeStored(filas: ParametroMotivo[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filas))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filas))
  } catch {
    // Storage deshabilitado: la sesión sigue en memoria vía Zustand.
  }
}

interface ParametrosState {
  parametros: ParametroMotivo[]
  addParametro: (input: ParametroMotivoInput) => ParametroMotivo
  updateParametro: (id: number, input: ParametroMotivoInput) => void
  setEstado: (id: number, status: EstadoParametro) => void
  removeParametro: (id: number) => void
  restaurarSeed: () => void
}

export const useRefundMotiveParamsStore = create<ParametrosState>((set, get) => ({
  parametros: readStored(),

  addParametro: (input) => {
    const ahora = nowIso()
    const nuevo: ParametroMotivo = {
      ...input,
      id: siguienteId(),
      costCenter: input.costCenter.trim(),
      // El alta nace ACTIVA y el select de estado va deshabilitado, igual que en el sistema viejo:
      // dar de alta algo inactivo es escribir una fila que no hace nada.
      status: 'ENABLE',
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: ahora,
      updatedAt: ahora,
    }
    const updated = [...get().parametros, nuevo]
    writeStored(updated)
    set({ parametros: updated })
    return nuevo
  },

  updateParametro: (id, input) => {
    const updated = get().parametros.map((p) =>
      p.id === id
        ? {
            ...p,
            ...input,
            id: p.id,
            costCenter: input.costCenter.trim(),
            updatedBy: USUARIO_MOCK,
            updatedAt: nowIso(),
          }
        : p,
    )
    writeStored(updated)
    set({ parametros: updated })
  },

  setEstado: (id, status) => {
    const updated = get().parametros.map((p) =>
      p.id === id ? { ...p, status, updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : p,
    )
    writeStored(updated)
    set({ parametros: updated })
  },

  /** Baja lógica: `DELETED` y la fila se queda, porque explica devoluciones ya aprobadas. */
  removeParametro: (id) => {
    const updated = get().parametros.map((p) =>
      p.id === id
        ? { ...p, status: 'DELETED' as EstadoParametro, updatedBy: USUARIO_MOCK, updatedAt: nowIso() }
        : p,
    )
    writeStored(updated)
    set({ parametros: updated })
  },

  restaurarSeed: () => {
    const seed = sellarContador(seedParametros())
    writeStored(seed)
    set({ parametros: seed })
  },
}))

/** La etiqueta del tipo de proceso, para las pantallas que no quieren importar dos módulos. */
export const etiquetaProceso = (t: TipoProceso): string => PROCESO_META[t].label
