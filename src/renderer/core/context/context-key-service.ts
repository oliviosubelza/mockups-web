import { ContextKeyService } from '@keel/platform'

// Instancia del shell (platform no exporta singletons — misma regla que EventBus/registries).
// Las superficies evalúan los `when` de los menús contra este contexto; los plugins ganan
// claves vía entitlements (`entitled.<id>`, Fase 2) y claves propias namespaced.
export const contextKeyService = new ContextKeyService()
