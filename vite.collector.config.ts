import { defineConfig } from 'vite'

/**
 * Empaqueta el recolector (src/collector.ts + las fuentes de src/sources + linkedom) en un único archivo de Node:
 * server/bundle/collector.mjs. Se versiona igual que dist/ porque el host ejecuta `npm start` sin compilar ni
 * instalar nada: el servidor carga este archivo y no necesita las dependencias de desarrollo.
 */
export default defineConfig({
  build: {
    ssr: 'src/collector.ts',
    outDir: 'server/bundle',
    emptyOutDir: true,
    copyPublicDir: false,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { format: 'es', entryFileNames: 'collector.mjs' } },
  },
  ssr: { noExternal: true },
})
