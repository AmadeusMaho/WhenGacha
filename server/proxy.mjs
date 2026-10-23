// Proxy con caché hacia las fuentes de datos de WhenGacha.
// Lo usan tanto el servidor de producción (server/index.mjs) como el servidor de desarrollo de Vite.
import { promisify } from 'node:util'
import { gzip as gzipCb } from 'node:zlib'

const gzip = promisify(gzipCb)
export const MAX_BYTES = (Number(process.env.CACHE_MB) || 64) * 1024 * 1024
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 600
const UA = 'WhenGacha/1.0 (+https://github.com/AmadeusMaho/WhenGacha)'
const MAX_BODY = 8 * 1024 * 1024
const STALE_MAX = 7 * 24 * 3_600_000

const MIN = 60_000
const HOUR = 60 * MIN

/**
 * Solo estas fuentes (y estas rutas) se pueden consultar a través del proxy: no es un relé abierto.
 * No se piden rutas que el robots.txt de cada sitio prohíbe (p. ej. /api/ o /img/ de gachafocus).
 */
const SOURCES = [
  { name: 'ennead', ttl: 10 * MIN, test: u => u.hostname === 'api.ennead.cc' && u.pathname.startsWith('/mihoyo/') },
  { name: 'uma.moe', ttl: 30 * MIN, test: u => u.hostname === 'uma.moe' && u.pathname.startsWith('/resources/') },
  { name: 'gachafocus', ttl: 30 * MIN, test: u => u.hostname === 'gachafocus.com.br' && /^\/en\/[a-z0-9-]+\/(events|banners)$/.test(u.pathname) },
  { name: 'lootandwaifus', ttl: HOUR, test: u => u.hostname === 'lootandwaifus.com' && u.pathname === '/nikke-banner-history/' },
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
    headers: { 'user-agent': UA, accept: 'application/json, text/html;q=0.9, */*;q=0.5' },
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

/* ---------- respuesta ---------- */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/

function send(res, status, headers, body) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers })
  res.end(body)
}

const acceptsGzip = req => /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')

/** Atiende GET /proxy?u=<url>. `url` es la URL de la petición ya interpretada. */
export async function handleProxy(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { allow: 'GET, HEAD' }, 'Método no permitido')
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
