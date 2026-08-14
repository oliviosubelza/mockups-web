import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// El repo en /mnt/<letra> = disco de Windows montado en WSL. Ese montaje no propaga eventos de
// filesystem a Linux, así que el watcher nunca se entera de un guardado: no hay HMR. Polling =
// preguntar en vez de esperar el aviso. Cuesta CPU, por eso solo se activa acá.
const isWindowsMount = /^\/mnt\/[a-z]\//i.test(__dirname);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // main.tsx usa top-level await (await initI18n) antes de montar React; el target por defecto de
  // Vite (es2020) no lo soporta al transpilar el bundle de producción.
  build: { target: 'esnext' },
  resolve: {
    alias: {
      '@': `${__dirname}src/renderer`,
      '@keel/platform': `${__dirname}packages/platform/src`,
      '@keel/plugin-sdk': `${__dirname}packages/plugin-sdk/src`,
    },
  },
  server: {
    // Por defecto Vite escucha solo en localhost, así que nadie más en la red puede entrar.
    // true = bind en 0.0.0.0 (todas las interfaces), que es lo que habilita el acceso por IP de LAN.
    host: true,
    // Si el puerto está ocupado, Vite se corre al siguiente y la IP que compartiste deja de servir.
    // Preferimos que falle fuerte antes que servir en un puerto distinto al esperado.
    strictPort: true,
    // Cuando exponemos el mockup por un túnel (cloudflared), el request llega con el dominio del
    // túnel en el Host header y Vite lo bloquea. MOCKUP_TUNNEL=1 abre el chequeo SOLO para esa corrida.
    allowedHosts: process.env.MOCKUP_TUNNEL ? true : undefined,
    watch: isWindowsMount ? { usePolling: true, interval: 300 } : undefined,
  },
});
