import { EventBus, type CoreEvents } from '@keel/platform'

// ── App event catalog ─────────────────────────────────────────────────────────
// SOLO eventos de shell — agnóstico al negocio. Los plugins NO agregan entradas
// acá: usan el canal por topic del EventBus (onTopic/emitTopic) vía la PluginAPI.
// Formato: '{subsistema}.{sustantivo}.{verbo-pasado}'

export type AppEvents = CoreEvents & {
  // Titlebar (para sincronizar estado del menú entre superficies)
  'titlebar.menubar.toggled': { visible: boolean }
  'titlebar.tabbar.toggled': { visible: boolean }
}

export const eventBus = new EventBus<AppEvents>()
