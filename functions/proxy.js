// Proxy con caché hacia las fuentes de datos de WhenGacha, para Cloudflare Pages Functions.
// Equivale a server/proxy.mjs (Node), pero usa la Cache API de Cloudflare en vez de memoria propia.
// Ruta: GET /proxy?u=<url>
const UA = 'WhenGacha/1.0 (+https://github.com/AmadeusMaho/WhenGacha)'
const MAX_BODY = 8 * 1024 * 1024
const STALE_MAX = 7 * 24 * 3_600_000
const MIN = 60_000
const HOUR = 60 * MIN

/** Solo estas fuentes (y rutas) se pueden consultar: no es un relé abierto. */
const SOURCES = [
  { name: 'ennead', ttl: 10 * MIN, test: u => u.hostname === 'api.ennead.cc' && u.pathname.startsWith('/mihoyo/') },
  { name: 'uma.moe', ttl: 30 * MIN, test: u => u.hostname === 'uma.moe' && u.pathname.startsWith('/resources/') },
  { name: 'gachafocus', ttl: 30 * MIN, test: u => u.hostname === 'gachafocus.com.br' && /^\/en\/[a-z0-9-]+\/(events|banners)$/.test(u.pathname) },
  { name: 'lootandwaifus', ttl: HOUR, test: u => u.hostname === 'lootandwaifus.com' && u.pathname === '/nikke-banner-history/' },
  { name: 'wiki', ttl: 12 * HOUR, test: u => (u.hostname.endsWith('.fandom.com') || u.hostname.endsWith('.wiki.gg')) && u.pathname === '/api.php' },
]

const text = (status, msg, extra = {}) =>
  new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', ...extra } })

function reply(request, body, type, state) {
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: { 'content-type': type, 'cache-control': 'public, max-age=60', 'x-cache': state, 'x-content-type-options': 'nosniff', vary: 'accept-encoding' },
  })
}

export async function onRequest(context) {
  const { request } = context
  if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Método no permitido', { allow: 'GET, HEAD' })

  let target
  try { target = new URL(new URL(request.url).searchParams.get('u') ?? '') } catch { return text(400, 'URL inválida') }
  const source = target.protocol === 'https:' && !target.username && SOURCES.find(s => s.test(target))
  if (!source) return text(403, 'Fuente no permitida')

  const cache = caches.default
  const key = new Request(target.toString())
  const hit = await cache.match(key)
  const age = hit ? Date.now() - Number(hit.headers.get('x-fetched-at') || 0) : Infinity
  if (hit && age < source.ttl) return reply(request, hit.body, hit.headers.get('content-type') ?? 'application/json', 'HIT')

  try {
    const res = await fetch(target.toString(), {
      headers: { 'user-agent': UA, accept: 'application/json, text/html;q=0.9, */*;q=0.5' },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status !== 200) throw new Error(`upstream ${res.status}`)
    if (Number(res.headers.get('content-length')) > MAX_BODY) throw new Error('respuesta demasiado grande')
    const body = await res.arrayBuffer()
    if (body.byteLength > MAX_BODY) throw new Error('respuesta demasiado grande')
    const type = res.headers.get('content-type') ?? 'application/json'
    // Se guarda hasta 7 días para poder servir la última copia si la fuente falla; la frescura se decide con x-fetched-at.
    const stored = new Response(body, { headers: { 'content-type': type, 'cache-control': `public, max-age=${STALE_MAX / 1000}`, 'x-fetched-at': String(Date.now()) } })
    context.waitUntil(cache.put(key, stored))
    return reply(request, body, type, 'MISS')
  } catch (err) {
    if (hit && age < STALE_MAX) return reply(request, hit.body, hit.headers.get('content-type') ?? 'application/json', 'STALE')
    console.error(`[proxy] ${source.name} ${target.pathname}: ${err.message}`)
    return text(502, 'La fuente no responde', { 'cache-control': 'no-store' })
  }
}
