// Servidor de WhenGacha: sirve la app compilada (dist/) y un proxy con caché para las fuentes de datos.
// Sin dependencias: solo módulos de Node. Variables opcionales: PORT (3000), HOST (0.0.0.0), CACHE_MB (64), RATE_PER_MIN (600). El proxy vive en proxy.mjs.
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gzip as gzipCb } from 'node:zlib'
import { MAX_BYTES, handleProxy } from './proxy.mjs'

const gzip = promisify(gzipCb)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
// El puerto lo asigna el host (PORT); algunos paneles usan SERVER_PORT. En local, 3000.
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || process.env.APP_PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
/* ---------- respuestas ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
}
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/

function send(res, status, headers, body) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers })
  res.end(body)
}

const acceptsGzip = req => /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')

/* ---------- archivos estáticos ---------- */
const staticCache = new Map() // ruta -> { mtime, gz }

function cacheControl(rel) {
  if (rel.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  if (rel === '/sw.js' || rel === '/manifest.webmanifest' || rel === '/index.html') return 'no-cache'
  if (/\.(png|webp|ico)$/.test(rel)) return 'public, max-age=86400'
  return 'no-cache'
}

async function handleStatic(req, res, pathname) {
  let rel
  try { rel = path.posix.normalize(decodeURIComponent(pathname)) } catch { return send(res, 400, {}, 'Ruta inválida') }
  if (rel.includes('\0') || rel.split('/').includes('..')) return send(res, 400, {}, 'Ruta inválida')
  if (rel.endsWith('/')) rel += 'index.html'

  let file = path.join(ROOT, rel)
  let info = await stat(file).catch(() => null)
  if (!info?.isFile()) {
    if (path.extname(rel) && rel !== '/index.html') return send(res, 404, {}, 'No encontrado') // un archivo que no existe no cae al index
    rel = '/index.html'
    file = path.join(ROOT, rel)
    info = await stat(file).catch(() => null)
    if (!info) return send(res, 503, {}, 'La app no está compilada (falta dist/)')
  }

  const type = MIME[path.extname(file)] ?? 'application/octet-stream'
  const headers = { 'content-type': type, 'cache-control': cacheControl(rel), vary: 'accept-encoding' }

  if (acceptsGzip(req) && COMPRESSIBLE.test(type) && info.size > 512) {
    let c = staticCache.get(file)
    if (!c || c.mtime !== info.mtimeMs) {
      c = { mtime: info.mtimeMs, gz: await gzip(await readFile(file)) }
      staticCache.set(file, c)
    }
    headers['content-encoding'] = 'gzip'
    return send(res, 200, headers, req.method === 'HEAD' ? undefined : c.gz)
  }
  res.writeHead(200, { 'x-content-type-options': 'nosniff', ...headers, 'content-length': info.size })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

/* ---------- servidor ---------- */
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { allow: 'GET, HEAD' }, 'Método no permitido')
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/healthz') return send(res, 200, { 'content-type': 'text/plain' }, 'ok')
    if (url.pathname === '/proxy') return await handleProxy(req, res, url)
    return await handleStatic(req, res, url.pathname)
  } catch (err) {
    console.error('[server]', err)
    if (!res.headersSent) send(res, 500, {}, 'Error interno')
    else res.end()
  }
})

server.on('error', err => { console.error(`[server] no se pudo abrir ${HOST}:${PORT}: ${err.message}`); process.exit(1) })
process.on('unhandledRejection', err => console.error('[server] promesa sin capturar:', err))
server.listen(PORT, HOST, async () => {
  const built = await stat(path.join(ROOT, 'index.html')).then(() => true, () => false)
  console.log(`WhenGacha escuchando en ${HOST}:${PORT} (Node ${process.version}, caché máx. ${MAX_BYTES / 1024 / 1024} MB)`)
  if (!built) console.error(`[server] AVISO: no existe ${ROOT}/index.html. La app no está compilada: ejecuta "npm run build:prod" y sube dist/.`)
})
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)))
