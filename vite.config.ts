import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig } from 'vite'
import { handleProxy } from './server/proxy.mjs'

/**
 * Monta /proxy (el mismo proxy con caché del servidor de producción) en `npm run dev` y `npm run preview`,
 * para que la app consulte las fuentes igual en todos los entornos. Algunas fuentes (p. ej. gachafocus)
 * no permiten peticiones desde el navegador (CORS), y el proxy las hace desde el servidor.
 */
const proxyMiddleware: Connect.NextHandleFunction = (req, res) => {
  void handleProxy(req, res, new URL(req.url ?? '/', 'http://localhost'))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'whengacha-proxy',
      configureServer: server => { server.middlewares.use('/proxy', proxyMiddleware) },
      configurePreviewServer: server => { server.middlewares.use('/proxy', proxyMiddleware) },
    },
  ],
})
