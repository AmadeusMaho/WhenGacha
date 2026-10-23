// Servidor de WhenGacha: sirve la app compilada (dist/) y un proxy con caché para las fuentes de datos.
// Sin dependencias: solo módulos de Node. Variables opcionales: PORT (3000), HOST (0.0.0.0), CACHE_MB (64), RATE_PER_MIN (600).
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gzip as gzipCb } from 'node:zlib'

const gzip = promisify(gzipCb)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
// El puerto lo asigna el host (PORT); algunos paneles usan SERVER_PORT. En local, 3000.
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || process.env.APP_PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const MAX_BYTES = (Number(process.env.CACHE_MB) || 64) * 1024 * 1024
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 600
const UA = 'WhenGacha/1.0 (+https://github.com/AmadeusMaho/WhenGacha)'
const MAX_BODY = 8 * 1024 * 1024
const STALE_MAX = 7 * 24 * 3_600_000

const MIN = 60_000
const HOUR = 60 * MIN

/** Solo estas fuentes se pueden consultar a través del proxy (evita que sirva de relé abierto). */
const SOURCES = [
  { name: 'ennead', ttl: 10 * MIN, test: u => u.hostname === 'api.ennead.cc' && u.pathname.startsWith('/mihoyo/') },
  { name: 'uma.moe', ttl: 30 * MIN, test: u => u.hostname === 'uma.moe' && u.pathname.startsWith('/resources/') },
  { name: 'czn.gg', ttl: 15 * MIN, test: u => u.hostname === 'czn.gg' && u.pathname.startsWith('/wp-json/') },
  { name: 'wiki', ttl: 12 * HOUR, test: u => (u.hostname.endsWith('.fandom.com') || u.hostname.endsWith('.wiki.gg')) && u.pathname === '/api.php' },
]

/* ---------- caché en memoria ---------- */
const cache = new Map() // url -> { body, gz, type, at, ttl }
let cacheBytes = 0
const inflight = new Map()

function store(key, entry) {
  const old = cache.get(key)
  if (old) cacheBytes -= old.body.length + (old.gz?.length ?? 0)
  cache.delete(key)
  cache.set(key, entry)
  cacheBytes += entry.body.length
  for (const [k, v] of cache) { // expulsa lo más antiguo si se pasa del límite
    if (cacheBytes <= MAX_BYTES) break
    cache.delete(k)
    cacheBytes -= v.body.length + (v.gz?.length ?? 0)
  }
}

async function fetchUpstream(url, ttl) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json, */*;q=0.5' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status !== 200) throw new Error(`upstream ${res.status}`)
  if (Number(res.headers.get('content-length')) > MAX_BODY) throw new Error('respuesta demasiado grande')
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > MAX_BODY) throw new Error('respuesta demasiado grande')
  const entry = { body, gz: null, type: res.headers.get('content-type') ?? 'application/json', at: Date.now(), ttl }
  store(url, entry)
  return entry
}

/** Devuelve { entry, state } con state = HIT | MISS | STALE. Junta peticiones idénticas simultáneas. */
async function getCached(url, ttl) {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < hit.ttl) return { entry: hit, state: 'HIT' }
  let p = inflight.get(url)
  if (!p) {
    p = fetchUpstream(url, ttl).finally(() => inflight.delete(url))
    inflight.set(url, p)
  }
  try {
    return { entry: await p, state: 'MISS' }
  } catch (err) {
    if (hit && Date.now() - hit.at < STALE_MAX) return { entry: hit, state: 'STALE' } // la fuente falla: se sirve lo último guardado
    throw err
  }
}

/* ---------- límite de peticiones por IP ---------- */
const buckets = new Map()
function limited(ip) {
  const now = Date.now()
  let b = buckets.get(ip)
  if (!b || now > b.reset) { b = { n: 0, reset: now + MIN }; buckets.set(ip, b) }
  b.n++
  return b.n > RATE_PER_MIN
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k) }, MIN).unref()

const clientIp = req => (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || req.socket.remoteAddress || 'unknown'

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

async function handleProxy(req, res, url) {
  if (limited(clientIp(req))) return send(res, 429, { 'retry-after': '60' }, 'Demasiadas peticiones')
  let target
  try { target = new URL(url.searchParams.get('u') ?? '') } catch { return send(res, 400, {}, 'URL inválida') }
  const source = target.protocol === 'https:' && !target.username && SOURCES.find(s => s.test(target))
  if (!source) return send(res, 403, {}, 'Fuente no permitida')

  try {
    const { entry, state } = await getCached(target.toString(), source.ttl)
    const headers = {
      'content-type': entry.type,
      'cache-control': 'public, max-age=60',
      'x-cache': state,
      vary: 'accept-encoding',
    }
    let body = entry.body
    if (acceptsGzip(req) && COMPRESSIBLE.test(entry.type)) {
      entry.gz ??= await gzip(entry.body)
      body = entry.gz
      headers['content-encoding'] = 'gzip'
    }
    send(res, 200, headers, req.method === 'HEAD' ? undefined : body)
  } catch (err) {
    console.error(`[proxy] ${source.name} ${target.pathname}: ${err.message}`)
    send(res, 502, { 'cache-control': 'no-store' }, 'La fuente no responde')
  }
}

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
