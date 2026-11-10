// WhenGacha Premium: apoyo con PayPal y acceso por correo (sustituye a los códigos de apoyo "WG-…", que se podían publicar).
//
//  1. Pago: el navegador muestra el botón de PayPal; el servidor crea y cobra el pedido (support/paypal.mjs) y comprueba que se completó.
//  2. Correo: con el pago verificado, la persona da su correo; se guarda solo su huella en la lista de donantes (support/donors.mjs,
//     repo privado de GitHub) y se le envía un enlace de acceso (support/mail.mjs). Ese navegador queda desbloqueado al momento.
//  3. Otro dispositivo: escribe su correo y le llega otro enlace (un solo uso, 30 min). Solo entra quien lee ese buzón.
//  4. Sesión: token firmado de 60 días que el navegador revalida cada 12 h (cada revalidación da otro de 60); si se anula al donante, pierde el acceso.
//
// Rutas (todas POST con JSON salvo la primera):
//   GET  /api/support/config   → { enabled, paypalClientId, currency, min, max }
//   POST /api/support/order    { amount }                → { id }                 (pedido de PayPal)
//   POST /api/support/capture  { orderID }               → { claim, email }       (pago cobrado y verificado)
//   POST /api/support/claim    { claim, email, lang }    → { session, mailed }    (alta y primer correo)
//   POST /api/login            { email, lang }           → { ok: true }           (siempre igual: no revela si el correo es donante)
//   POST /api/login/verify     { token }                 → { session } | 403
//   POST /api/session          { session }               → { session } | 401
import { OrderUsed, addDonor, donorsConfigured, isDonor } from './support/donors.mjs'
import { mailConfigured, publicUrl, sendAccessLink } from './support/mail.mjs'
import { MAX_AMOUNT, captureOrder, cleanAmount, createOrder, currency, minAmount, paypalConfigured } from './support/paypal.mjs'
import { emailHash, normEmail, secretConfigured, sign, validEmail, verify } from './support/tokens.mjs'

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR
const TTL = { claim: 7 * DAY, login: 30 * MIN, session: 60 * DAY }
const LANGS = new Set(['es', 'en', 'zh'])

export const supportEnabled = () => secretConfigured() && paypalConfigured() && donorsConfigured() && mailConfigured()
const loginEnabled = () => secretConfigured() && donorsConfigured() && mailConfigured()

/* Límites por IP (y por correo para los enlaces), en memoria. */
const buckets = new Map()
function limited(key, max, windowMs) {
  const now = Date.now(), b = buckets.get(key)
  if (!b || now - b.at > windowMs) { buckets.set(key, { at: now, n: 1 }); return false }
  if (buckets.size > 20_000) for (const [k, v] of buckets) if (now - v.at > DAY) buckets.delete(k)
  return ++b.n > max
}

/** Enlaces de acceso ya usados (un solo uso). Caducan en 30 min, así que basta con recordarlos en memoria. */
const usedLinks = new Map()
function firstUse(n) {
  const now = Date.now()
  for (const [k, exp] of usedLinks) if (exp < now) usedLinks.delete(k)
  if (usedLinks.has(n)) return false
  usedLinks.set(n, now + TTL.login)
  return true
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }

async function readJson(req) {
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > 4096) throw Object.assign(new Error('too-large'), { status: 413 }) }
  try { return JSON.parse(body || '{}') } catch { throw Object.assign(new Error('bad-json'), { status: 400 }) }
}

const ipOf = req => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?'
const langOf = l => (LANGS.has(l) ? l : 'es')
const newSession = h => sign('session', { h }, TTL.session)
const accessLink = token => `${publicUrl()}/?acceso=${encodeURIComponent(token)}`

export async function handleApi(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '')
  const ip = ipOf(req)
  try {
    if (route === '/api/support/config' && req.method === 'GET') {
      return json(res, 200, { enabled: supportEnabled(), login: loginEnabled(), paypalClientId: process.env.PAYPAL_CLIENT_ID ?? '',
        currency: currency(), min: minAmount(), max: MAX_AMOUNT, sandbox: process.env.PAYPAL_ENV !== 'live' })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method' })
    if (limited(`all:${ip}`, 60, 10 * MIN)) return json(res, 429, { error: 'too-many' })
    const body = await readJson(req)

    switch (route) {
      case '/api/support/order': {
        if (!supportEnabled()) return json(res, 503, { error: 'not-configured' })
        const amount = cleanAmount(body.amount)
        if (!amount) return json(res, 400, { error: 'amount' })
        if (limited(`order:${ip}`, 15, HOUR)) return json(res, 429, { error: 'too-many' })
        return json(res, 200, { id: await createOrder(amount) })
      }
      case '/api/support/capture': {
        if (!supportEnabled()) return json(res, 503, { error: 'not-configured' })
        if (!/^[A-Z0-9-]{6,40}$/i.test(String(body.orderID ?? ''))) return json(res, 400, { error: 'order' })
        const r = await captureOrder(body.orderID)
        if (!r.completed || r.currency !== currency() || r.amount < minAmount()) return json(res, 402, { error: 'payment' })
        return json(res, 200, { claim: sign('claim', { o: r.id, a: r.amount.toFixed(2), c: r.currency }, TTL.claim), email: r.email })
      }
      case '/api/support/claim': {
        if (!supportEnabled()) return json(res, 503, { error: 'not-configured' })
        const claim = verify('claim', body.claim)
        const email = normEmail(body.email)
        if (!claim) return json(res, 400, { error: 'claim' })
        if (!validEmail(email)) return json(res, 400, { error: 'email' })
        const h = emailHash(email)
        try { await addDonor(h, { id: claim.o, amount: claim.a, currency: claim.c }) }
        catch (e) { if (e instanceof OrderUsed) return json(res, 409, { error: 'used' }); throw e }
        let mailed = true
        try { await sendAccessLink(email, accessLink(sign('login', { h }, TTL.login)), langOf(body.lang), true) }
        catch (e) { mailed = false; console.error('[support] correo de bienvenida:', e.message) }
        return json(res, 200, { session: newSession(h), mailed })
      }
      case '/api/login': {
        if (!loginEnabled()) return json(res, 503, { error: 'not-configured' })
        const email = normEmail(body.email)
        if (!validEmail(email)) return json(res, 400, { error: 'email' })
        const h = emailHash(email)
        if (limited(`login:${ip}`, 5, 10 * MIN) || limited(`mail:${h}`, 3, HOUR)) return json(res, 429, { error: 'too-many' })
        // Misma respuesta sea o no donante (no se puede averiguar quién apoyó). El correo solo sale si lo es.
        if (await isDonor(h)) {
          sendAccessLink(email, accessLink(sign('login', { h }, TTL.login)), langOf(body.lang), false)
            .catch(e => console.error('[support] correo de acceso:', e.message))
        }
        return json(res, 200, { ok: true })
      }
      case '/api/login/verify': {
        if (!loginEnabled()) return json(res, 503, { error: 'not-configured' })
        const t = verify('login', body.token)
        if (!t || !firstUse(t.n) || !(await isDonor(t.h))) return json(res, 403, { error: 'link' })
        return json(res, 200, { session: newSession(t.h) })
      }
      case '/api/session': {
        if (!loginEnabled()) return json(res, 503, { error: 'not-configured' })
        const s = verify('session', body.session)
        if (!s || !(await isDonor(s.h))) return json(res, 401, { error: 'session' })
        return json(res, 200, { session: newSession(s.h) })
      }
      default: return json(res, 404, { error: 'not-found' })
    }
  } catch (e) {
    console.error('[support]', route, e.message)
    return json(res, e.status && e.status < 500 ? e.status : 502, { error: 'upstream' })
  }
}
