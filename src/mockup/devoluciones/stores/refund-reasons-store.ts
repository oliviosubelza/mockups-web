// Store del CATÁLOGO DE MOTIVOS DE DEVOLUCIÓN (tabla `refund_reasons`).
//
// QUÉ ES. El motivo es lo que clasifica cada LÍNEA de una devolución: `refund_order_details.reason_id`
// es un BIGINT con FK a `refund_reasons(id)`, así que dejó de ser texto libre. Sumar un motivo o
// cambiar lo que exige es dato maestro, no código: hasta ahora vivía en dos constantes del módulo
// (`RETURN_REASON_LABELS` y la tabla de `return-reason-rules.ts`, con el comentario de que las
// reglas son fijas) y esta pantalla lo vuelve editable. Mismo camino que ya hizo el bandeo:
// `accesorios.ts` era una constante y pasó a ser `logistic_assets` con su pantalla.
//
// LA PK ES UN BIGSERIAL. Antes esta fila se apuntaba por `code` y el código era la PK; el DDL vigente
// tiene `id BIGSERIAL PRIMARY KEY` y la línea lo referencia por id, así que el código —que era una
// etiqueta técnica más— dejó de existir como columna. Acá se emula con un contador monótono: los
// sembrados quedan con ids estables (1..N) y cada alta toma el siguiente.
//
// LO QUE QUEDÓ DE LA FILA son cuatro datos: `name`, `description`, `lot_requirement` y `is_active`.
// `due_date_requirement`, `requires_photo`, `requires_notes` y `sort_order` ya no tienen columna.
//
// EL REQUISITO DE LOTE ES EL ÚNICO QUE SOBREVIVIÓ, y sigue teniendo TRES estados y no dos. La
// diferencia entre dos de ellos es la que hace que el formulario del vendedor no mienta:
//   · REQUIRED → sin ese dato el reclamo no se puede evaluar (un RECALL se persigue por lote).
//   · OPTIONAL → está impreso en el envase y se puede anotar, pero nada de lo que se decide
//     depende de él (un cierre de negocio, un error de pedido).
//   · HIDDEN   → el motivo ES la ausencia del dato. «PRODUCTO SIN LOTE O SIN FECHA DE VENCIMIENTO»
//     no puede traer un lote, y un campo obligatorio ahí solo consigue que alguien invente un
//     número para pasar el botón. Por eso no se pregunta y se limpia si venía cargado.
// El día que alguien ponga REQUIRED donde va HIDDEN, el formulario del vendedor queda imposible de
// completar con la verdad.
//
// BAJA EN DOS NIVELES, como en `logistic_assets` y por lo mismo:
//   · `is_active = false` → deja de ofrecerse en el selector del vendedor; el histórico que ya lo
//     usó sigue mostrándolo. Reversible con un click. El comentario del DDL lo dice explícito.
//   · `deleted_at` → sale del catálogo. La fila se conserva porque las líneas viejas la apuntan.
import { create } from 'zustand'
import { ALL_RETURN_REASONS, RETURN_REASON_LABELS, type ReturnReason } from '../types'
import { rulesFor, type FieldRule } from '../features/returns/lib/return-reason-rules'

const STORAGE_KEY = 'mockups-web:motivos-devolucion'
const USUARIO_MOCK = 'Juan Pérez'

/** Los tres valores de `lot_requirement`, tal como los escribe el CHECK. */
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
  /** PK. `BIGSERIAL`: es el número que queda escrito en `refund_order_details.reason_id`. */
  id: number
  /** Etiqueta visible. `VARCHAR(150) NOT NULL`. */
  name: string
  /** Para qué es el motivo, en una frase. `VARCHAR(300) NOT NULL`: la columna no admite vacío. */
  description: string
  lotRequirement: RequisitoCampo
  isActive: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Lo que el formulario decide. El id, la auditoría y las bajas las pone el store. */
export type MotivoDevolucionInput = Pick<MotivoDevolucion, 'name' | 'description' | 'lotRequirement'>

const nowIso = () => new Date().toISOString()

/** `FieldRule` del módulo (minúsculas) → valor de la columna. Es el MISMO enumerado, dicho distinto. */
const aRequisito = (regla: FieldRule): RequisitoCampo =>
  regla === 'required' ? 'REQUIRED' : regla === 'hidden' ? 'HIDDEN' : 'OPTIONAL'

/**
 * La descripción de cada motivo sembrado.
 *
 * Va acá y no en `types/`: `description` es una columna de ESTE catálogo y no algo que el formulario
 * del vendedor use, así que no hay una constante previa de la que leerla. El nombre y el requisito de
 * lote sí se siguen leyendo de las constantes del módulo, que son la fuente única mientras el
 * formulario del vendedor las use.
 */
const DESCRIPCIONES: Record<ReturnReason, string> = {
  bajo_rendimiento: 'El producto no rinde lo esperado en el punto de venta y el cliente pide retirarlo.',
  cambio_bebidas_vencidas: 'Canje de bebidas vencidas en el punto de venta por producto vigente.',
  cierre_negocio: 'El cliente cierra o suspende su actividad y devuelve el stock que le quedó.',
  contaminacion_fisica: 'Se encontró un cuerpo extraño dentro del envase. Requiere seguimiento por lote.',
  danos_manejo_cliente: 'El envase se dañó por manipulación o almacenamiento en el punto de venta.',
  error_pedido: 'El pedido se cargó con un producto o una cantidad que el cliente no pidió.',
  error_entrega: 'La entrega no coincide con lo pedido: producto cambiado, faltante o de más.',
  excepcional: 'Devolución autorizada por excepción comercial, fuera de los motivos habituales.',
  envases_sin_contenido: 'El envase llegó vacío o con un llenado muy por debajo del declarado.',
  fallas_envase: 'Defecto de envase o empaque: tapa, etiqueta, film o caja en mal estado.',
  faltante_caja_cerrada: 'La caja llegó cerrada pero con menos unidades de las que declara.',
  fuga_mal_sellado: 'El envase pierde producto por un sellado defectuoso.',
  menor_contenido_neto: 'El contenido neto medido está por debajo del declarado en la etiqueta.',
  muestras_laboratorio: 'Producto retirado del mercado para análisis de calidad en laboratorio.',
  producto_hinchado: 'Envase deformado o inflado por fermentación o alteración del contenido.',
  sin_lote_ni_vencimiento: 'El envase llegó sin lote o sin fecha de vencimiento legibles.',
  vigente_buen_estado: 'Producto vigente y en buen estado que el cliente devuelve sin defecto.',
  recall: 'Retiro de mercado dispuesto por la empresa. Se persigue lote por lote.',
  variacion_sensorial: 'Cambio de sabor, olor, color o aspecto respecto del producto esperado.',
  vencimiento_baja_rotacion: 'El producto venció en el punto de venta por rotación insuficiente.',
  vencimiento_corta_vida_util: 'Se entregó producto con muy poca vida útil y venció antes de venderse.',
  vencimiento_sobre_stock: 'El producto venció por un exceso de stock cargado al cliente.',
}

/**
 * El catálogo sembrado son los 22 motivos que el módulo ya tenía hardcodeados, con el requisito de
 * lote que ya tenían.
 *
 * El nombre y el requisito se leen de `RETURN_REASON_LABELS` y de `rulesFor` en vez de copiarse acá:
 * mientras el formulario del vendedor siga leyendo esas constantes, un segundo listado escrito a mano
 * se desincroniza el día que alguien agregue un motivo del lado del código. El store importa de
 * `features/` —al revés de lo habitual— justamente por eso: una sola fuente de la verdad vale más
 * que la capa prolija.
 *
 * Los ids son 1..22 en el orden de `ALL_RETURN_REASONS`, que es alfabético por etiqueta. Son estables
 * entre reinicios del demo porque el histórico simulado los apunta por número.
 */
function seedMotivos(): MotivoDevolucion[] {
  const creado = nowIso()
  return ALL_RETURN_REASONS.map((reason, i) => ({
    id: i + 1,
    name: RETURN_REASON_LABELS[reason],
    description: DESCRIPCIONES[reason],
    lotRequirement: aRequisito(rulesFor(reason).lot),
    isActive: true,
    createdBy: USUARIO_MOCK,
    updatedBy: USUARIO_MOCK,
    createdAt: creado,
    updatedAt: creado,
    deletedAt: null,
  }))
}

/**
 * El contador que emula el `BIGSERIAL`.
 *
 * Vive en el módulo y no en el estado porque un serial no se reinicia al filtrar ni al re-renderizar:
 * arranca en el mayor id que haya en el catálogo cargado y solo sube. Reusar un id de una fila
 * eliminada dejaría al histórico apuntando a otro motivo, que es exactamente lo que la baja lógica
 * evita.
 */
let ultimoId = 0

const sellarContador = (motivos: MotivoDevolucion[]): MotivoDevolucion[] => {
  ultimoId = motivos.reduce((max, m) => Math.max(max, m.id), 0)
  return motivos
}

const siguienteId = () => ++ultimoId

function readStored(): MotivoDevolucion[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = seedMotivos()
      writeStored(seed)
      return sellarContador(seed)
    }
    const parsed = JSON.parse(raw)
    return sellarContador(
      Array.isArray(parsed) && parsed.length > 0 ? (parsed as MotivoDevolucion[]) : seedMotivos(),
    )
  } catch {
    return sellarContador(seedMotivos())
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
  updateMotivo: (id: number, input: MotivoDevolucionInput) => void
  setMotivoActivo: (id: number, isActive: boolean) => void
  removeMotivo: (id: number) => void
  restaurarSeed: () => void
}

export const useRefundReasonsStore = create<RefundReasonsState>((set, get) => ({
  motivos: readStored(),

  addMotivo: (input) => {
    const ahora = nowIso()
    const nuevo: MotivoDevolucion = {
      ...input,
      id: siguienteId(),
      name: input.name.trim(),
      description: input.description.trim(),
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

  // El id no se toca: es la PK y las líneas ya registradas la apuntan.
  updateMotivo: (id, input) => {
    const updated = get().motivos.map((m) =>
      m.id === id
        ? {
            ...m,
            ...input,
            id: m.id,
            name: input.name.trim(),
            description: input.description.trim(),
            updatedBy: USUARIO_MOCK,
            updatedAt: nowIso(),
          }
        : m,
    )
    writeStored(updated)
    set({ motivos: updated })
  },

  // `is_active` es «se sigue ofreciendo», NO «existe». Un motivo apagado desaparece del selector del
  // vendedor y sigue nombrado en las devoluciones que ya lo usaron.
  setMotivoActivo: (id, isActive) => {
    const updated = get().motivos.map((m) =>
      m.id === id ? { ...m, isActive, updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : m,
    )
    writeStored(updated)
    set({ motivos: updated })
  },

  // Baja lógica, como la columna: sale de la pantalla y la fila queda, porque
  // `refund_order_details.reason_id` de una devolución vieja sigue apuntando a este id.
  removeMotivo: (id) => {
    const ahora = nowIso()
    const updated = get().motivos.map((m) =>
      m.id === id ? { ...m, isActive: false, deletedAt: ahora, updatedBy: USUARIO_MOCK, updatedAt: ahora } : m,
    )
    writeStored(updated)
    set({ motivos: updated })
  },

  /** Vuelve a los 22 motivos sembrados. Botón de demo, igual que en activos logísticos. */
  restaurarSeed: () => {
    const seed = sellarContador(seedMotivos())
    writeStored(seed)
    set({ motivos: seed })
  },
}))
