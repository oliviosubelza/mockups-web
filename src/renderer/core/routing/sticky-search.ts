/**
 * Query params que sobreviven una navegación por id (`openRoute`).
 *
 * Por defecto la lista está VACÍA: en una web los query params son de la página (filtros, paginado)
 * y arrastrarlos entre rutas los filtraría cruzado. La excepción son los knobs GLOBALES de vista —
 * en este proyecto los del tablero de Figma (?theme, ?board, ?w, ?h) — que sí tienen que seguir
 * puestos al cambiar de pantalla.
 *
 * El core provee el mecanismo; la app declara la política en su entry (`setStickySearchParams`).
 */
let _sticky: readonly string[] = []

export function setStickySearchParams(keys: readonly string[]): void {
  _sticky = keys
}

/**
 * Querystring a arrastrar (incluye el `?`), o string vacío si no hay nada pegajoso puesto.
 * `search` default = el de la URL actual.
 */
export function buildStickySearch(search: string = window.location.search): string {
  if (_sticky.length === 0) return ''

  const current = new URLSearchParams(search)
  const next = new URLSearchParams()
  for (const key of _sticky) {
    const value = current.get(key)
    if (value !== null) next.set(key, value)
  }

  const qs = next.toString()
  return qs ? `?${qs}` : ''
}
