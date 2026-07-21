/**
 * Vista plana de un comando para las superficies del workbench (paleta, keybindings).
 * El label ya viene resuelto: `ICommandAction.title` acepta una función (i18n lazy) y
 * el registry la evalúa al leer, para que un cambio de idioma se refleje sin re-registrar.
 */
export interface CommandEntry {
  id: string
  label: string
}
