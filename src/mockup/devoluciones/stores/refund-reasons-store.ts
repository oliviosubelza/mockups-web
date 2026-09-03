// Store del CATÁLOGO DE MOTIVOS DE DEVOLUCIÓN (tabla `refund_reasons`).
//
// QUÉ ES. El motivo es lo que clasifica cada LÍNEA de una devolución: `refund_order_detail.reason`
// es una FK a `refund_reasons(code)`, así que dejó de ser texto libre. Sumar un motivo o cambiar lo
// que exige es dato maestro, no código: hasta ahora vivía en dos constantes del módulo
// (`RETURN_REASON_LABELS` y la tabla de `return-reason-rules.ts`, con el comentario de que las
// reglas son fijas) y esta pantalla lo vuelve editable. Mismo camino que ya hizo el bandeo:
// `accesorios.ts` era una constante y pasó a ser `logistic_assets` con su pantalla.
//
// EL CORAZÓN DEL MODELO SON LOS DOS REQUISITOS, no el nombre. `lot_requirement` y
// `due_date_requirement` tienen TRES estados y no dos, y la diferencia entre dos de ellos es la que
// hace que el formulario del vendedor no mienta:
//   · REQUIRED → sin ese dato el reclamo no se puede evaluar (un RECALL se persigue por lote).
//   · OPTIONAL → está impreso en el envase y se puede anotar, pero nada de lo que se decide
//     depende de él (un cierre de negocio, un error de pedido).
//   · HIDDEN   → el motivo ES la ausencia del dato. «PRODUCTO SIN LOTE O SIN FECHA DE VENCIMIENTO»
//     no puede traer un lote, y un campo obligatorio ahí solo consigue que alguien invente un
//     número para pasar el botón. Por eso no se pregunta y se limpia si venía cargado.
// El día que alguien ponga REQUIRED donde va HIDDEN, el formulario del vendedor queda imposible de
// completar con la verdad. Es la columna que manda de la pantalla.
//
// LA PK ES `code` Y NO UN SERIAL. Es lo que quedó escrito en las líneas ya registradas
// (`refund_order_detail.reason`), así que en una edición NO se toca: renombrar el código dejaría
// huérfano el histórico. Lo que se corrige es el `name`, que es la etiqueta visible.
//
// BAJA EN DOS NIVELES, como en `logistic_assets` y por lo mismo:
//   · `is_active = false` → deja de ofrecerse en el selector del vendedor; el histórico que ya lo
//     usó sigue mostrándolo. Reversible con un click.
//   · `deleted_at` → sale del catálogo. La fila se conserva porque las líneas viejas la apuntan.
import { create } from 'zustand'
import { ALL_RETURN_REASONS, RETURN_REASON_LABELS } from '../types'
import { rulesFor, type FieldRule } from '../features/returns/lib/return-reason-rules'

const STORAGE_KEY = 'mockups-web:motivos-devolucion'
const USUARIO_MOCK = 'Juan Pérez'

/** Los tres valores de `lot_requirement` / `due_date_requirement`, tal como los escribe el CHECK. */
export type RequisitoCampo = 'REQUIRED' | 'OPTIONAL' | 'HIDDEN'

export const REQUISITOS: RequisitoCampo[] = ['REQUIRED', 'OPTIONAL', 'HIDDEN']

/**
 * Cómo se dice cada requisito en la pantalla.
 *
 * `nota` no es decoración: es la única forma de que quien configura el motivo entienda que HIDDEN no
 * es «opcional pero más», sino una afirmación sobre el producto.
 */
export const REQUISITO_META: Record<RequisitoCampo, { label: string; corto: string; nota: string }> = {
  REQUIRED: {
    label: 'Obligatorio',
    corto: 'Obligatorio',
    nota: 'Sin ese dato el reclamo no se puede evaluar. El vendedor no puede enviar la línea.',
  },
  OPTIONAL: {
    label: 'Opcional',
    corto: 'Opcional',
    nota: 'Se pide, se puede dejar vacío. Está en el envase, pero la decisión no depende de él.',
  },
  HIDDEN: {
    label: 'No aplica',
    corto: 'No aplica',
    nota: 'El motivo mismo dice que el dato no existe. No se pregunta, y se limpia si venía cargado.',
  },
}

/** Una fila de `refund_reasons`. */
export interface MotivoDevolucion {
  /** PK. Mayúsculas y guiones bajos: es lo que queda escrito en las líneas ya registradas. */
  code: string
  /** Etiqueta visible. Es lo único renombrable de la fila. */
  name: string
  lotRequirement: RequisitoCampo
  dueDateRequirement: RequisitoCampo
  requiresPhoto: boolean
  requiresNotes: boolean
  /** Orden en el selector del vendedor. */
  sortOrder: number
  isActive: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Lo que el formulario decide. La auditoría y las bajas las pone el store. */
export type MotivoDevolucionInput = Pick<
  MotivoDevolucion,
  'code' | 'name' | 'lotRequirement' | 'dueDateRequirement' | 'requiresPhoto' | 'requiresNotes' | 'sortOrder'
>

const nowIso = () => new Date().toISOString()

/** `FieldRule` del módulo (minúsculas) → valor de la columna. Es el MISMO enumerado, dicho distinto. */
const aRequisito = (regla: FieldRule): RequisitoCampo =>
  regla === 'required' ? 'REQUIRED' : regla === 'hidden' ? 'HIDDEN' : 'OPTIONAL'

/** `bajo_rendimiento` → `BAJO_RENDIMIENTO`. La clave del union ES el código de la tabla. */
export const codigoDeMotivo = (reason: string) => reason.trim().toUpperCase().replace(/[\s-]+/g, '_')

/**
 * El catálogo sembrado son los 22 motivos que el módulo ya tenía hardcodeados, con las reglas que
 * ya tenían.
 *
 * Se lee de `RETURN_REASON_LABELS` y de `rulesFor` en vez de copiarse acá: mientras el formulario
 * del vendedor siga leyendo esas constantes, un segundo listado escrito a mano se desincroniza el
 * día que alguien agregue un motivo del lado del código. El store importa de `features/` —al revés
 * de lo habitual— justamente por eso: una sola fuente de la verdad vale más que la capa prolija.
 *
 * `requiresPhoto` y `requiresNotes` arrancan en `true` para todos, que es el DEFAULT de la tabla y
 * lo que el módulo hace hoy (foto y observación se piden siempre, para todos los motivos). Ahora son
 * columnas, así que se pueden aflojar por motivo — pero el catálogo no lo hace por su cuenta.
 */
function seedMotivos(): MotivoDevolucion[] {
  const creado = nowIso()
  return ALL_RETURN_REASONS.map((reason, i) => {
    const reglas = rulesFor(reason)
    return {
      code: codigoDeMotivo(reason),
      name: RETURN_REASON_LABELS[reason],
      lotRequirement: aRequisito(reglas.lot),
      dueDateRequirement: aRequisito(reglas.dueDate),
      requiresPhoto: true,
      requiresNotes: true,
      // De diez en diez: intercalar un motivo nuevo entre dos existentes no obliga a renumerar los
      // 22. `sort_order` es SMALLINT, así que hay lugar de sobra.
      sortOrder: (i + 1) * 10,
      isActive: true,
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: creado,
      updatedAt: creado,
      deletedAt: null,
    }
  })
}

function readStored(): MotivoDevolucion[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = seedMotivos()
      writeStored(seed)
      return seed
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as MotivoDevolucion[]) : seedMotivos()
  } catch {
    return seedMotivos()
  }
}

function writeStored(motivos: MotivoDevolucion[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(motivos))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(motivos))
  } catch {
    // Storage deshabilitado: la sesión sigue en memoria vía Zustand.
  }
}

interface RefundReasonsState {
  motivos: MotivoDevolucion[]
  addMotivo: (input: MotivoDevolucionInput) => MotivoDevolucion
  updateMotivo: (code: string, input: MotivoDevolucionInput) => void
  setMotivoActivo: (code: string, isActive: boolean) => void
  removeMotivo: (code: string) => void
  restaurarSeed: () => void
}

export const useRefundReasonsStore = create<RefundReasonsState>((set, get) => ({
  motivos: readStored(),

  addMotivo: (input) => {
    const ahora = nowIso()
    const nuevo: MotivoDevolucion = {
      ...input,
      code: codigoDeMotivo(input.code),
      name: input.name.trim(),
      isActive: true,
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
    }
    const updated = [...get().motivos, nuevo]
    writeStored(updated)
    set({ motivos: updated })
    return nuevo
  },

  // El `code` que llega en el input se ignora a propósito: es la PK y las líneas ya registradas la
  // apuntan. El formulario lo muestra deshabilitado en edición; esto es el cierre por si acaso.
  updateMotivo: (code, input) => {
    const updated = get().motivos.map((m) =>
      m.code === code
        ? { ...m, ...input, code: m.code, name: input.name.trim(), updatedBy: USUARIO_MOCK, updatedAt: nowIso() }
        : m,
    )
    writeStored(updated)
    set({ motivos: updated })
  },

  // `is_active` es «se sigue ofreciendo», NO «existe». Un motivo apagado desaparece del selector del
  // vendedor y sigue nombrado en las devoluciones que ya lo usaron.
  setMotivoActivo: (code, isActive) => {
    const updated = get().motivos.map((m) =>
      m.code === code ? { ...m, isActive, updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : m,
    )
    writeStored(updated)
    set({ motivos: updated })
  },

  // Baja lógica, como la columna: sale de la pantalla y la fila queda, porque
  // `refund_order_detail.reason` de una devolución vieja sigue apuntando a este código.
  removeMotivo: (code) => {
    const ahora = nowIso()
    const updated = get().motivos.map((m) =>
      m.code === code ? { ...m, isActive: false, deletedAt: ahora, updatedBy: USUARIO_MOCK, updatedAt: ahora } : m,
    )
    writeStored(updated)
    set({ motivos: updated })
  },

  /** Vuelve a los 22 motivos sembrados. Botón de demo, igual que en activos logísticos. */
  restaurarSeed: () => {
    const seed = seedMotivos()
    writeStored(seed)
    set({ motivos: seed })
  },
}))

/** `true` si otro motivo VIVO ya usa ese código. La PK es el código, así que el choque es duro. */
export function codigoDeMotivoEnUso(motivos: MotivoDevolucion[], code: string, exceptCode?: string): boolean {
  const buscado = codigoDeMotivo(code)
  return motivos.some((m) => !m.deletedAt && m.code !== exceptCode && m.code === buscado)
}

/** El siguiente hueco de `sort_order`, para que un motivo nuevo caiga al final del selector. */
export function siguienteOrden(motivos: MotivoDevolucion[]): number {
  return motivos.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 10
}
