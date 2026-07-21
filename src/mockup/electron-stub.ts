// El renderer real corre dentro de Electron y habla por IPC (window.electron). En un navegador eso
// no existe, así que lo stubbeamos: storage en memoria y el resto como no-ops que resuelven null.
//
// Vive en su PROPIO módulo (y no en main.tsx) porque los stores persistidos del workbench —tabs,
// ancho del sidebar— leen window.electron.storage al ser IMPORTADOS, no al usarse. Los imports ESM
// se evalúan en orden, así que este módulo tiene que ir antes que cualquier import del workbench;
// si el stub se asignara en el cuerpo de main.tsx ya sería tarde y la rehidratación explotaría.
const memory = new Map<string, unknown>()

const electronStub = {
  storage: {
    get: async (key: string) => (memory.has(key) ? memory.get(key) : null),
    set: async (key: string, value: unknown) => void memory.set(key, value),
    delete: async (key: string) => void memory.delete(key),
  },
}

;(window as unknown as { electron: unknown }).electron = new Proxy(electronStub, {
  get: (target, prop) =>
    prop in target
      ? target[prop as keyof typeof target]
      : new Proxy(() => Promise.resolve(null), { get: () => () => Promise.resolve(null) }),
})
