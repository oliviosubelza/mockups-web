// El renderer real corre dentro de Electron y habla por IPC (window.electron). En un navegador eso
// no existe, así que lo stubbeamos: storage sobre localStorage y el resto como no-ops que resuelven null.
//
// Vive en su PROPIO módulo (y no en main.tsx) porque los stores persistidos del workbench —tema,
// ancho del sidebar— leen window.electron.storage al ser IMPORTADOS, no al usarse. Los imports ESM
// se evalúan en orden, así que este módulo tiene que ir antes que cualquier import del workbench;
// si el stub se asignara en el cuerpo de main.tsx ya sería tarde y la rehidratación explotaría.
//
// El backing es localStorage y NO un Map en memoria: siendo una web, lo que el usuario configura
// (tema, ancho del sidebar) tiene que sobrevivir un F5. Con el Map, cada recarga lo reseteaba.
const PREFIX = 'mockups-web:'

// Se serializa con JSON en las DOS puntas: el valor que llega es opaco (zustand/persist manda un
// string, otros callers podrían mandar objetos), así el round-trip devuelve el mismo tipo que entró.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    // Storage bloqueado (modo privado, cookies off) o JSON corrupto: se comporta como "no hay dato"
    // en vez de tumbar la rehidratación del store.
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Cuota llena o storage bloqueado: se pierde la persistencia, no la sesión.
  }
}

const electronStub = {
  storage: {
    get: async <T,>(key: string) => read<T>(key),
    set: async (key: string, value: unknown) => write(key, value),
    delete: async (key: string) => {
      try {
        localStorage.removeItem(PREFIX + key)
      } catch {
        // idem write: la falla de storage no debe propagarse al store.
      }
    },
  },
}

;(window as unknown as { electron: unknown }).electron = new Proxy(electronStub, {
  get: (target, prop) =>
    prop in target
      ? target[prop as keyof typeof target]
      : new Proxy(() => Promise.resolve(null), { get: () => () => Promise.resolve(null) }),
})
