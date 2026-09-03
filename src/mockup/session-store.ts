// QUIÉN SOS mientras usás el mockup. Vive acá, al lado de los otros stores del mockup
// (`zones-store`, `planes-store`, `logistic-assets-store`) y ya no dentro de `devoluciones/`,
// porque el selector de rol pasó al perfil de la top bar y esa barra la ve toda la app.
//
// EL ROSTER SALE DEL SEED Y NO DE LITERALES. Los dos vendedores tienen que ser filas REALES de
// `SEED_SELLERS`: sus pantallas se filtran por su propio código, así que un nombre escrito a mano
// firmaría documentos que nadie en los datos registró nunca. El costo es que importar este store
// evalúa el seed de Ventas —clientes, rutas, visitas, pedidos— en el arranque de la app y no solo
// al entrar a devoluciones. Se paga a propósito: es un dataset chico y generado con semilla fija, y
// la alternativa (hardcodear los nombres) reintroduce justamente la desincronización que el módulo
// se cuidó de evitar.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role, User } from './devoluciones/types'
import { OPERATING_DISTRIBUTOR } from './devoluciones/data/distributors-data'
import { SEED_SELLERS } from './devoluciones/data/seed'

export type { Role, User }

/** El vendedor de ruta con el que actúa la sesión «vendedor», tomado del seed. */
const SESSION_SELLER_CODE = 5003
const SESSION_SELLER = SEED_SELLERS.find((s) => s.code === SESSION_SELLER_CODE)

/** Misma regla para el vendedor de mostrador: una fila `salesMode: "agencia"` real del seed. */
const AGENCY_SESSION_SELLER_CODE = 5101
const AGENCY_SESSION_SELLER = SEED_SELLERS.find((s) => s.code === AGENCY_SESSION_SELLER_CODE)

/**
 * La agencia en la que atiende el vendedor de mostrador — un `StockLocation` de tipo `agencia`.
 *
 * Escrito como literal en vez de importado de `data/stock-locations` porque ese módulo arrastra el
 * catálogo entero de productos detrás. El id lo asegura el seed de cajas, que sí lee las ubicaciones:
 * una agencia que dejara de existir le dejaría a este vendedor cero cajas en vez de cajas fantasma.
 */
const AGENCY_SESSION_AGENCY_ID = 'ag_banzer'

/**
 * Autenticación simulada: un usuario por rol. En la app real el rol viene del login/JWT; acá se
 * cambia desde el perfil de la top bar para poder ver cómo lee la app cada uno.
 */
export const USERS: User[] = [
  {
    id: 'u_analista_cx',
    name: 'Sergio Peña Montero',
    email: 'sergiopena@grupovenado.com',
    role: 'analista_cx',
    channelName: 'TRADICIONAL',
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: 5002,
    employeeCode: 57,
  },
  {
    id: 'u_gerente_cx',
    name: 'Daniel Durán Melgar',
    email: 'danielduran@grupovenado.com',
    role: 'gerente_cx',
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: 5001,
    employeeCode: 72,
  },
  {
    id: 'u_gerente_comercial',
    name: 'Rocío Justiniano Áñez',
    email: 'rociojustiniano@grupovenado.com',
    role: 'gerente_comercial',
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: 5004,
    employeeCode: 94,
  },
  {
    id: 'u_gerente_general',
    name: 'Mario Peredo Salvatierra',
    email: 'mariperedo@grupovenado.com',
    role: 'gerente_general',
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: 5005,
    employeeCode: 99,
  },
  // Sin identidad de aprobador a propósito: un vendedor REGISTRA devoluciones y no las firma nunca,
  // así que su bandeja de aprobación queda vacía en vez de prestada de otro rol.
  {
    id: 'u_vendedor',
    name: SESSION_SELLER?.name ?? 'Verónica López',
    email: SESSION_SELLER?.email ?? 'veronicalopez@grupovenado.com',
    role: 'vendedor',
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: SESSION_SELLER?.code ?? SESSION_SELLER_CODE,
  },
  // Vende sobre el mostrador de la agencia: sin ruta, sin visitas, sin GPS. Los mismos pedidos y
  // devoluciones que cualquier vendedor, y solo los suyos.
  {
    id: 'u_vendedor_agencia',
    name: AGENCY_SESSION_SELLER?.name ?? 'GABRIELA CUELLAR',
    email: AGENCY_SESSION_SELLER?.email ?? 'gabriela.cuellar@grupovenado.com',
    role: 'vendedor_agencia',
    distributor: OPERATING_DISTRIBUTOR,
    sellerCode: AGENCY_SESSION_SELLER?.code ?? AGENCY_SESSION_SELLER_CODE,
    agencyId: AGENCY_SESSION_AGENCY_ID,
  },
  {
    id: 'u_facturador',
    name: 'Carlos Mendoza Aguilera',
    email: 'carlosmendoza@grupovenado.com',
    role: 'facturador',
    distributor: OPERATING_DISTRIBUTOR,
  },
  {
    id: 'u_almacen',
    name: 'Jorge Rivera Siles',
    email: 'jorgerivera@grupovenado.com',
    role: 'almacen',
    distributor: OPERATING_DISTRIBUTOR,
  },
]

interface SessionState {
  userId: string
  setUserId: (id: string) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: USERS[0].id,
      setUserId: (userId) => set({ userId }),
    }),
    { name: 'route-mgmt-session' },
  ),
)

/** El usuario con el que se está mirando la app (cae al primero si el id persistido ya no existe). */
export function useCurrentUser(): User {
  const userId = useSessionStore((s) => s.userId)
  return USERS.find((u) => u.id === userId) ?? USERS[0]
}

/** El rol actual, cuando la pantalla solo pregunta eso. */
export function useRole(): Role {
  return useCurrentUser().role
}

/** Iniciales de dos letras para el avatar. */
export function initialsOf(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

/** Cómo se escribe cada rol en pantalla. */
export const ROLE_LABELS: Record<Role, string> = {
  analista_cx: 'Analista de experiencia al cliente',
  gerente_cx: 'Gerencia de Experiencia de atención al cliente',
  gerente_comercial: 'Gerente comercial',
  gerente_general: 'Gerente general',
  vendedor: 'Vendedor',
  vendedor_agencia: 'Vendedor de agencia',
  facturador: 'Facturador',
  almacen: 'Almacén',
}
