// Worker de Cloudflare delante del dominio de WhenGacha: manda cada visita al servidor principal (Botkeep) y, si no contesta,
// tarda demasiado o da un error 5xx, repite la misma petición en el de respaldo (Render). Guía: docs/cloudflare-worker.md
//
// Variables (wrangler.toml o panel del Worker → Settings → Variables):
//   PRIMARY         https://<dirección propia de Botkeep>   (NUNCA el dominio propio: el Worker se llamaría a sí mismo)
//   BACKUP          https://whengacha.onrender.com
//   TIMEOUT_MS      espera máxima al principal antes de pasar al respaldo (por defecto 8000)
//   REQUIRE_MARKER  "1" = una respuesta del principal sin la cabecera x-served-by (la pone server/index.mjs) cuenta como caída.
//                   Sirve para cuando el host enseña su propia página de "desplegando" con 200. Actívalo solo cuando el principal
//                   ya tenga la versión del servidor que pone esa cabecera, o todo iría al respaldo.

const HOP = ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker', 'x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto']

function upstreamRequest(request, origin, body) {
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, origin)
  const headers = new Headers(request.headers)
  for (const h of HOP) headers.delete(h)
  // IP real del visitante: el servidor limita intentos por IP (server/supporter.mjs, server/proxy.mjs) leyendo x-forwarded-for.
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '')
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', 'https')
  return new Request(target, { method: request.method, headers, body, redirect: 'manual' })
}

const isDown = (res, env) => res.status >= 500 || (env.REQUIRE_MARKER === '1' && !res.headers.get('x-served-by'))

function withVia(res, via) {
  const out = new Response(res.body, res)
  out.headers.set('x-whengacha-via', via)
  return out
}

export default {
  async fetch(request, env) {
    if (!env.PRIMARY || !env.BACKUP) return new Response('Worker sin configurar: faltan PRIMARY o BACKUP', { status: 500 })
    // El cuerpo se lee una vez y se guarda: si el principal falla, el respaldo tiene que recibir el mismo (p. ej. el aviso de Ko-fi).
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
    const timeout = Number(env.TIMEOUT_MS) || 8000

    let why
    try {
      const res = await fetch(upstreamRequest(request, env.PRIMARY, body), { signal: AbortSignal.timeout(timeout) })
      if (!isDown(res, env)) return withVia(res, 'primary')
      why = `HTTP ${res.status}${res.headers.get('x-served-by') ? '' : ' sin x-served-by'}`
    } catch (err) {
      why = err?.name === 'TimeoutError' ? `sin respuesta en ${timeout} ms` : String(err?.message ?? err)
    }
    console.log(`[failover] ${request.method} ${new URL(request.url).pathname} → respaldo (${why})`)
    try {
      return withVia(await fetch(upstreamRequest(request, env.BACKUP, body)), 'backup')
    } catch (err) {
      return new Response('WhenGacha no está disponible ahora mismo. Vuelve a intentarlo en unos minutos.', {
        status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' } })
    }
  },
}
