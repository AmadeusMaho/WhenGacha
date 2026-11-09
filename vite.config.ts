import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { handleProxy } from './server/proxy.mjs'
import { handleUnlock } from './server/supporter.mjs'

/**
 * Monta /proxy (el mismo proxy con caché del servidor de producción) en `npm run dev` y `npm run preview`,
 * para que la app consulte las fuentes igual en todos los entornos. Algunas fuentes (p. ej. gachafocus)
 * no permiten peticiones desde el navegador (CORS), y el proxy las hace desde el servidor.
 * También /api/unlock (códigos de apoyo de las skins), con SUPPORTER_SECRET de .env.local.
 */
const proxyMiddleware: Connect.NextHandleFunction = (req, res) => {
  void handleProxy(req, res, new URL(req.url ?? '/', 'http://localhost'))
}
const unlockMiddleware: Connect.NextHandleFunction = (req, res) => { void handleUnlock(req, res) }

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Solo esta variable (sin prefijo VITE_, así que nunca llega al navegador).
  process.env.SUPPORTER_SECRET ??= loadEnv(mode, process.cwd(), 'SUPPORTER_').SUPPORTER_SECRET
  return {
    plugins: [
      react(),
      {
        name: 'whengacha-proxy',
        configureServer: server => { server.middlewares.use('/proxy', proxyMiddleware); server.middlewares.use('/api/unlock', unlockMiddleware) },
        configurePreviewServer: server => { server.middlewares.use('/proxy', proxyMiddleware); server.middlewares.use('/api/unlock', unlockMiddleware) },
      },
    ],
  }
})
