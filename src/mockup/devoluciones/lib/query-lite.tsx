// `useQuery` / `useMutation` en chico, para que el módulo de devoluciones no arrastre
// `@tanstack/react-query` a un repo que no lo usa en ninguna otra pantalla.
//
// POR QUÉ NO LA LIBRERÍA DE VERDAD. El módulo llegó de `mockups_sales`, donde los servicios pegan
// contra datos en memoria (`data/seed.ts`) y devuelven promesas resueltas al instante. De todo lo que
// react-query existe para resolver —caché entre pantallas, reintentos, deduplicación, refetch al
// enfocar la ventana, invalidación por red— acá no aplica nada: no hay red. Lo que sí se usa es su
// FORMA (`{ data, isLoading }`, `mutate`, `invalidateQueries`), y eso son cien líneas.
//
// El otro motivo es verificable: la dependencia no está instalada y `node_modules` es de Windows, así
// que agregarla al `package.json` dejaba el módulo sin compilar hasta que alguien corriera el install.
// Con esto el `tsc` cierra hoy.
//
// SI ALGÚN DÍA ENTRA react-query DE VERDAD: borrar este archivo y cambiar el import en los cuatro
// hooks y en `query-client.ts`. La superficie está copiada a propósito —mismos nombres, mismos campos—
// para que sea eso y nada más.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** Marcador de `placeholderData`: mantené lo anterior mientras carga lo nuevo. */
export const keepPreviousData = Symbol('keepPreviousData')

type ClaveQuery = readonly unknown[]

const serializar = (clave: ClaveQuery) => JSON.stringify(clave)

/**
 * El bus de invalidación. No es una caché: solo un contador por prefijo de clave que despierta a las
 * queries afectadas. Sin caché no hace falta guardar datos — el servicio los recalcula gratis.
 */
export class QueryClient {
  /**
   * Acepta la config de react-query y la IGNORA. `staleTime`, `retry` y `refetchOnWindowFocus` solo
   * tienen sentido contra una red que acá no existe; el parámetro está para no tener que tocar
   * `query-client.ts`, que es el archivo que se copió tal cual.
   */
  constructor(_config?: unknown) {}

  private version = 0
  private suscriptores = new Set<(prefijo: string, version: number) => void>()

  invalidateQueries(args?: { queryKey?: ClaveQuery }) {
    this.version += 1
    const prefijo = args?.queryKey ? serializar(args.queryKey).slice(0, -1) : ''
    for (const avisar of this.suscriptores) avisar(prefijo, this.version)
  }

  suscribir(fn: (prefijo: string, version: number) => void) {
    this.suscriptores.add(fn)
    return () => this.suscriptores.delete(fn)
  }
}

const ContextoQuery = createContext<QueryClient | null>(null)

export function QueryClientProvider({
  client,
  children,
}: {
  client: QueryClient
  children: ReactNode
}) {
  return <ContextoQuery.Provider value={client}>{children}</ContextoQuery.Provider>
}

export function useQueryClient(): QueryClient {
  const cliente = useContext(ContextoQuery)
  if (!cliente) throw new Error('Falta <QueryClientProvider> arriba de esta pantalla')
  return cliente
}

export interface ResultadoQuery<T> {
  data: T | undefined
  isLoading: boolean
  /** Igual que `isLoading` acá: sin red no existe el "refetch en segundo plano" que las distingue. */
  isFetching: boolean
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

/**
 * `S` es lo que ve el consumidor y `T` lo que devuelve el servicio: `select` los separa, igual que en
 * la librería. Se usa, por ejemplo, para entregar un `Map` indexado en vez del array crudo.
 */
export function useQuery<T, S = T>(opciones: {
  queryKey: ClaveQuery
  queryFn: () => Promise<T> | T
  enabled?: boolean
  placeholderData?: typeof keepPreviousData | T
  staleTime?: number
  select?: (data: T) => S
}): ResultadoQuery<S> {
  const { queryKey, queryFn, enabled = true, placeholderData, select } = opciones
  const clave = serializar(queryKey)
  const [estado, setEstado] = useState<{ data: S | undefined; cargando: boolean; error: unknown }>({
    data: undefined,
    cargando: enabled,
    error: null,
  })
  // Lo último que se resolvió bien, para `keepPreviousData`: sin esto la tabla parpadea a vacío en
  // cada cambio de página o de filtro, que es justo lo que esa opción existe para evitar.
  const previo = useRef<S | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const cliente = useContext(ContextoQuery)
  const fnRef = useRef(queryFn)
  fnRef.current = queryFn
  const selectRef = useRef(select)
  selectRef.current = select

  useEffect(() => {
    if (!cliente) return
    const desuscribir = cliente.suscribir((prefijo) => {
      if (clave.startsWith(prefijo)) setNonce((n) => n + 1)
    })
    // El cleanup NO puede devolver el boolean de `Set.delete`: React lo trataría como un valor de
    // efecto inválido.
    return () => {
      desuscribir()
    }
  }, [cliente, clave])

  useEffect(() => {
    if (!enabled) {
      setEstado({ data: undefined, cargando: false, error: null })
      return
    }
    let vigente = true
    setEstado((anterior) => ({ ...anterior, cargando: true, error: null }))
    Promise.resolve()
      .then(() => fnRef.current())
      .then((crudo) => {
        if (!vigente) return
        const data = (selectRef.current ? selectRef.current(crudo) : crudo) as S
        previo.current = data
        setEstado({ data, cargando: false, error: null })
      })
      .catch((error) => {
        if (!vigente) return
        setEstado({ data: undefined, cargando: false, error })
      })
    return () => {
      vigente = false
    }
  }, [clave, enabled, nonce])

  const data =
    estado.data !== undefined
      ? estado.data
      : placeholderData === keepPreviousData
        ? previo.current
        : (placeholderData as S | undefined)

  return useMemo(
    () => ({
      data,
      isLoading: estado.cargando,
      isFetching: estado.cargando,
      isPending: estado.cargando,
      isError: estado.error !== null,
      error: estado.error,
      refetch: () => setNonce((n) => n + 1),
    }),
    [data, estado.cargando, estado.error],
  )
}

/** Los callbacks que se pasan en la llamada, no en el hook. Corren DESPUÉS de los del hook. */
export interface CallbacksDeLlamada<TData, TError, TVars> {
  onSuccess?: (data: TData, vars: TVars) => unknown
  onError?: (error: TError, vars: TVars) => unknown
  onSettled?: () => unknown
}

export interface ResultadoMutacion<TVars, TData, TError> {
  mutate: (vars: TVars, callbacks?: CallbacksDeLlamada<TData, TError, TVars>) => void
  mutateAsync: (vars: TVars) => Promise<TData>
  isPending: boolean
  isLoading: boolean
  isError: boolean
  error: TError | null
  reset: () => void
}

/**
 * El orden de los genéricos es el de react-query —`<TData, TError, TVars>`— y no el que saldría
 * natural. Es a propósito: los hooks copiados los escriben así y cambiarlos obligaría a tocar catorce
 * llamadas para no ganar nada. Los callbacks devuelven `unknown` porque muchos hacen `return toast(…)`.
 */
export function useMutation<TData, TError = Error, TVars = void>(opciones: {
  mutationFn: (vars: TVars) => Promise<TData> | TData
  onSuccess?: (data: TData, vars: TVars) => unknown
  onError?: (error: TError, vars: TVars) => unknown
  onSettled?: () => unknown
}): ResultadoMutacion<TVars, TData, TError> {
  const [estado, setEstado] = useState<{ pendiente: boolean; error: TError | null }>({
    pendiente: false,
    error: null,
  })
  const opcionesRef = useRef(opciones)
  opcionesRef.current = opciones

  const mutateAsync = useCallback(
    async (vars: TVars, callbacks?: CallbacksDeLlamada<TData, TError, TVars>) => {
      setEstado({ pendiente: true, error: null })
      try {
        const data = await opcionesRef.current.mutationFn(vars)
        setEstado({ pendiente: false, error: null })
        opcionesRef.current.onSuccess?.(data, vars)
        callbacks?.onSuccess?.(data, vars)
        return data
      } catch (crudo) {
        const error = crudo as TError
        setEstado({ pendiente: false, error })
        opcionesRef.current.onError?.(error, vars)
        callbacks?.onError?.(error, vars)
        throw crudo
      } finally {
        opcionesRef.current.onSettled?.()
        callbacks?.onSettled?.()
      }
    },
    [],
  )

  return useMemo(
    () => ({
      mutate: (vars: TVars, callbacks?: CallbacksDeLlamada<TData, TError, TVars>) => {
        // `mutate` no propaga el rechazo — es la diferencia con `mutateAsync`, igual que en la
        // librería. El error queda en `isError` y en el toast que dispare `onError`.
        void mutateAsync(vars, callbacks).catch(() => {})
      },
      mutateAsync,
      isPending: estado.pendiente,
      isLoading: estado.pendiente,
      isError: estado.error !== null,
      error: estado.error,
      reset: () => setEstado({ pendiente: false, error: null }),
    }),
    [mutateAsync, estado.pendiente, estado.error],
  )
}
