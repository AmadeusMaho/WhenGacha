// Proxy con caché hacia las fuentes de datos de WhenGacha.
// Lo usan tanto el servidor de producción (server/index.mjs) como el servidor de desarrollo de Vite.
import { promisify } from 'node:util'
import { gzip as gzipCb } from 'node:zlib'
import https from 'node:https'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const gzip = promisify(gzipCb)
export const MAX_BYTES = (Number(process.env.CACHE_MB) || 64) * 1024 * 1024
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 600
const UA = 'WhenGacha/1.0 (+https://github.com/AmadeusMaho/WhenGacha)'
/** gachafocus (Cloudflare) rechaza el UA identificado en algunos hosts: se prueba primero con un UA de navegador y, si falla, con el de siempre. */
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
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
  { name: 'gachafocus', ttl: HOUR, test: u => u.hostname === 'gachafocus.com.br' && /^\/en\/[a-z0-9-]+\/(events|banners)$/.test(u.pathname) },
  { name: 'prydwen', ttl: 2 * HOUR, test: u => u.hostname === 'www.prydwen.gg' && /^\/(wuthering-waves|neverness-to-everness|chaos-zero-nightmare|nikke)\/banners$/.test(u.pathname) },
  { name: 'limbus', ttl: 30 * MIN, test: u => u.hostname === 'limbus-assets.eldritchtools.com' && /^\/data\/(timers|identities_mini)\.json$/.test(u.pathname) },
  { name: 'atlasacademy', ttl: 30 * MIN, test: u => u.hostname === 'api.atlasacademy.io' && /^\/export\/NA\/(basic_event|nice_gacha|basic_servant)\.json$/.test(u.pathname) },
  { name: 'lootandwaifus', ttl: HOUR, test: u => u.hostname === 'lootandwaifus.com' && u.pathname === '/nikke-banner-history/' },
  { name: 'wiki', ttl: 12 * HOUR, test: u => ((u.hostname.endsWith('.fandom.com') || u.hostname.endsWith('.wiki.gg')) && u.pathname === '/api.php') || (u.hostname === 'bluearchive.wiki' && u.pathname === '/w/api.php') },
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

/**
 * Petición HTTPS simple (solo User-Agent y Accept), sin seguir redirecciones. Se usa en lugar de `fetch` porque algunas
 * fuentes (p. ej. Prydwen) rechazan las cabeceras extra que añade el `fetch` de Node pero aceptan este cliente
 * con el mismo User-Agent identificado. Devuelve una respuesta con la forma mínima de `Response`.
 */
function httpsRequest(url, ua) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: { 'user-agent': ua, accept: 'application/json, text/html;q=0.9, */*;q=0.5', 'accept-encoding': 'identity' },
      timeout: 20_000,
    }, res => {
      const chunks = []
      let size = 0
      res.on('data', c => {
        size += c.length
        if (size > MAX_BODY) { req.destroy(new Error('respuesta demasiado grande')); return }
        chunks.push(c)
      })
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        headers: { get: name => res.headers[name.toLowerCase()] ?? null },
        arrayBuffer: async () => Buffer.concat(chunks),
      }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('tiempo de espera agotado')))
    req.on('error', reject)
    req.end()
  })
}

/** Cliente HTTP usado para las fuentes; las pruebas lo sustituyen con `setTransport`. */
let request = httpsRequest
export function setTransport(fn) { request = fn ?? httpsRequest }

/**
 * Corta-circuito por sitio: si una fuente responde con error (p. ej. 403 de Cloudflare), no se le vuelve a pedir nada
 * durante la pausa (ver pauseFor); pasado ese tiempo se hace una sola prueba. Así un bloqueo no se agrava con cada visita.
 * gachafocus se prueba con el UA de navegador y, tras un fallo, la siguiente prueba usa el UA identificado (y así).
 */
/** Espera tras un 403/429: 10 min, y el doble en cada fallo seguido (20, 40, 80 min) hasta un máximo de 2 h. Un éxito la reinicia. */
const pauseFor = fails => Math.min(10 * MIN * 2 ** Math.max(0, fails - 1), 2 * HOUR)

/** Peticiones a gachafocus de una en una y con esta separación, para no hacer ráfagas (sus reglas de Cloudflare no son públicas). */
const GAP = { 'gachafocus.com.br': 2000, 'www.prydwen.gg': 10_000 /* Crawl-delay de su robots.txt */ }
const gates = new Map() // host -> promesa de la última petición en cola
function throttle(host) {
  const gap = GAP[host]
  if (!gap) return Promise.resolve()
  const prev = gates.get(host) ?? Promise.resolve()
  const mine = prev.then(() => new Promise(r => setTimeout(r, gap)))
  gates.set(host, mine)
  return prev
}
const hostState = new Map() // host -> { until, flip }

async function fetchUpstream(url, ttl) {
  const host = new URL(url).hostname
  await throttle(host)
  const st = hostState.get(host) ?? { until: 0, flip: false, fails: 0 }
  if (Date.now() < st.until) throw new Error(`upstream en pausa (bloqueo reciente)`)
  const twoUas = host === 'gachafocus.com.br'
  const res = await request(url, twoUas && !st.flip ? BROWSER_UA : UA)
  if (res.status !== 200) {
    if (res.status === 403 || res.status === 429) {
      const fails = st.fails + 1
      hostState.set(host, { until: Date.now() + pauseFor(fails), flip: twoUas ? !st.flip : false, fails })
      console.error(`[proxy] ${host} respondió ${res.status}: sin nuevas peticiones durante ${pauseFor(fails) / MIN} min`)
    }
    throw new Error(`upstream ${res.status}`)
  }
  hostState.set(host, { until: 0, flip: st.flip, fails: 0 }) // se recuerda qué UA funcionó
  if (Number(res.headers.get('content-length')) > MAX_BODY) throw new Error('respuesta demasiado grande')
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > MAX_BODY) throw new Error('respuesta demasiado grande')
  const entry = { body, gz: null, type: res.headers.get('content-type') ?? 'application/json', at: Date.now(), ttl }
  store(url, entry)
  return entry
}

/* ---------- refresco en segundo plano ---------- */
// Cada URL pedida se recuerda; el servidor la vuelve a consultar solo cuando caduca (sin esperar a una visita) y
// mientras tanto sirve lo último guardado. Así la carga hacia cada fuente no depende de cuántos visitantes haya.
const seen = new Map() // url -> { last, ttl }   (`last`: última vez que alguien la pidió)
const retryAt = new Map() // url -> ms antes de los cuales no se reintenta un refresco fallido
const FORGET = 7 * 24 * HOUR

function refresh(url, ttl) {
  let p = inflight.get(url)
  if (!p) {
    p = fetchUpstream(url, ttl)
      .then(entry => { retryAt.delete(url); dirty = true; return entry })
      .catch(err => { retryAt.set(url, Date.now() + Math.min(ttl / 4, 15 * MIN)); throw err })
      .finally(() => inflight.delete(url))
    inflight.set(url, p)
  }
  return p
}

/** Devuelve { entry, state } con state = HIT | MISS | STALE. Junta peticiones idénticas simultáneas. */
async function getCached(url, ttl) {
  const now = Date.now()
  seen.set(url, { last: now, ttl })
  const hit = cache.get(url)
  if (hit && now - hit.at < hit.ttl) return { entry: hit, state: 'HIT' }
  if (hit && now - hit.at < STALE_MAX) { // caducado: se sirve lo guardado y se renueva en segundo plano
    if (now >= (retryAt.get(url) ?? 0)) refresh(url, ttl).catch(() => {})
    return { entry: hit, state: 'STALE' }
  }
  return { entry: await refresh(url, ttl), state: 'MISS' }
}

let refreshing = false
async function refreshDue() {
  if (refreshing) return
  refreshing = true
  try {
    const now = Date.now()
    for (const [url, info] of [...seen]) {
      if (now - info.last > FORGET) { seen.delete(url); continue }
      const hit = cache.get(url)
      if (hit && now - hit.at < info.ttl) continue
      if (now < (retryAt.get(url) ?? 0)) continue
      await refresh(url, info.ttl).catch(() => {})
    }
  } finally { refreshing = false }
}

/* ---------- caché en disco: sobrevive a los reinicios ---------- */
const DATA_DIR = process.env.DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.cache')
const SNAPSHOT = path.join(DATA_DIR, 'proxy-cache.json')
const TEXTUAL = /^(text\/|application\/(json|javascript))/
let dirty = false

async function saveSnapshot() {
  if (!dirty) return
  dirty = false
  try {
    const entries = {}
    for (const [url, e] of cache) {
      if (!TEXTUAL.test(e.type)) continue
      entries[url] = { type: e.type, at: e.at, ttl: e.ttl, body: e.body.toString('utf8'), seen: seen.get(url) }
    }
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(`${SNAPSHOT}.tmp`, JSON.stringify(entries))
    await rename(`${SNAPSHOT}.tmp`, SNAPSHOT)
  } catch (err) { console.error(`[proxy] no se pudo guardar la caché: ${err.message}`) }
}

async function loadSnapshot() {
  try {
    const entries = JSON.parse(await readFile(SNAPSHOT, 'utf8'))
    let n = 0
    for (const [url, e] of Object.entries(entries)) {
      if (Date.now() - e.at > STALE_MAX) continue
      store(url, { body: Buffer.from(e.body, 'utf8'), gz: null, type: e.type, at: e.at, ttl: e.ttl })
      if (e.seen) seen.set(url, e.seen)
      n++
    }
    if (n) console.log(`[proxy] caché restaurada: ${n} fuentes`)
  } catch { /* primera vez o archivo ilegible: se empieza vacía */ }
}

loadSnapshot()
setInterval(() => { refreshDue(); saveSnapshot() }, 5 * MIN).unref()
setTimeout(refreshDue, 30_000).unref() // tras un reinicio, renueva lo que ya caducó
/** Guarda la caché en disco (se llama al apagar el servidor). */
export const flushCache = saveSnapshot

/** Para el recolector del servidor: trae una fuente permitida con la misma caché, pausas y límites que el proxy HTTP. */
export async function sourceFetch(url) {
  let target
  try { target = new URL(url) } catch { return new Response('URL inválida', { status: 400 }) }
  const source = target.protocol === 'https:' && !target.username && SOURCES.find(s => s.test(target))
  if (!source) return new Response('Fuente no permitida', { status: 403 })
  try {
    const { entry } = await getCached(target.toString(), source.ttl)
    return new Response(entry.body, { status: 200, headers: { 'content-type': entry.type } })
  } catch (err) {
    return new Response(String(err.message ?? err), { status: 502 })
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
    if (!/en pausa/.test(err.message)) console.error(`[proxy] ${source.name} ${target.pathname}: ${err.message}`)
    send(res, 502, { 'cache-control': 'no-store' }, 'La fuente no responde')
  }
}
