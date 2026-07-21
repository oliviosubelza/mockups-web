import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = {
  ES: 'es',
  EN: 'en',
} as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[keyof typeof SUPPORTED_LANGUAGES]

const LANGUAGE_VALUES = Object.values(SUPPORTED_LANGUAGES) as string[]

export async function initI18n(savedLang?: string | null) {
  const detected = navigator.language.startsWith('es') ? 'es' : 'en'
  const lng = savedLang && LANGUAGE_VALUES.includes(savedLang) ? savedLang : detected

  await i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng,
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
  })
}

/**
 * Registra los bundles i18n de un plugin bajo su namespace (= id del plugin). Se llama AL
 * REGISTRAR el plugin (dormido), antes de cualquier render, para que sidebar/paleta/tabs resuelvan
 * sus títulos y `api.i18n.t` funcione en la vista. Idempotente (deep-merge por i18next).
 */
export function registerPluginLocales(
  pluginId: string,
  locales: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined
): void {
  if (!locales) return
  for (const [lng, resources] of Object.entries(locales)) {
    i18n.addResourceBundle(lng, pluginId, resources, true, true)
  }
}

/**
 * Resuelve el título de una contribución (ruta/comando/grupo) declarado en un manifest de plugin.
 * La `key` resuelve en el namespace del plugin; si falta, devuelve la key TAL CUAL (fallback al
 * texto crudo → migración incremental: un plugin sin locales sigue mostrando su título literal).
 * `nsSeparator:false` evita que un título con ':' (ej. "Compras: Nueva compra") se parsee como ns.
 */
export function resolveContribLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  pluginId: string,
  key: string
): string {
  return t(key, { ns: pluginId, nsSeparator: false, defaultValue: key })
}

export { i18n }
