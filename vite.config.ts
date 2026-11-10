import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { handleProxy } from './server/proxy.mjs'
import { handleApi } from './server/supporter.mjs'

/**
 * Monta /proxy (el mismo proxy con caché del servidor de producción) en `npm run dev` y `npm run preview`,
 * para que la app consulte las fuentes igual en todos los entornos. Algunas fuentes (p. ej. gachafocus)
 * no permiten peticiones desde el navegador (CORS), y el proxy las hace desde el servidor.
 * También /api/* (WhenGacha Premium: apoyo con Ko-fi, acceso por correo y sesión), con sus variables de .env.local.
 */
const proxyMiddleware: Connect.NextHandleFunction = (req, res) => {
  void handleProxy(req, res, new URL(req.url ?? '/', 'http://localhost'))
}
// Montado en '/api', así que req.url llega sin ese prefijo: se vuelve a poner.
const apiMiddleware: Connect.NextHandleFunction = (req, res) => {
  void handleApi(req, res, new URL(`/api${req.url ?? '/'}`, 'http://localhost'))
}

/** Variables del servidor para Premium. Sin prefijo VITE_: nunca entran en el código del navegador. */
const SERVER_ENV = ['SUPPORTER_', 'KOFI_', 'DONORS_', 'RESEND_', 'MAIL_', 'PUBLIC_URL', 'SUPPORT_']

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), SERVER_ENV))) process.env[k] ??= v
  return {
    plugins: [
      react(),
      {
        name: 'whengacha-proxy',
        configureServer: server => { server.middlewares.use('/proxy', proxyMiddleware); server.middlewares.use('/api', apiMiddleware) },
        configurePreviewServer: server => { server.middlewares.use('/proxy', proxyMiddleware); server.middlewares.use('/api', apiMiddleware) },
      },
    ],
  }
})
