// WhenGacha Premium: apoyo con Ko-fi y acceso por correo (sustituye a los códigos de apoyo "WG-…", que se podían publicar).
//
//  1. Pago: la ventana de apoyo enlaza a la página de Ko-fi. Ko-fi cobra y avisa al servidor con un webhook (support/kofi.mjs) que
//     trae el correo de quien pagó, el importe y nuestro token secreto.
//  2. Alta: con el aviso verificado se guarda solo la huella del correo en la lista de donantes (support/donors.mjs, repo privado de
//     GitHub) y se le envía un enlace de acceso (support/mail.mjs). Un mismo pago de Ko-fi no da acceso dos veces.
//  3. Otro dispositivo (o si el correo se perdió): escribe su correo en el pincel y le llega otro enlace (un solo uso, 30 min).
//  4. Sesión: token firmado de 60 días que el navegador revalida cada 12 h (cada revalidación da otro de 60); si se anula al donante, pierde el acceso.
//
// Rutas (todas POST con JSON salvo config y el webhook):
//   GET  /api/support/config   → { enabled, login, kofiUrl, currency, min }
//   POST /api/support/kofi     data=<JSON de Ko-fi>      → 200 (webhook de Ko-fi; lo llama Ko-fi, no el navegador)
//   POST /api/login            { email, lang }           → { ok: true }           (siempre igual: no revela si el correo es donante)
//   POST /api/login/verify     { token }                 → { session } | 403
//   POST /api/session          { session }               → { session } | 401
import { OrderUsed, addDonor, donorsConfigured, isDonor } from './support/donors.mjs'
import { currency, kofiConfigured, kofiUrl, minAmount, parseWebhook } from './support/kofi.mjs'
import { mailConfigured, publicUrl, sendAccessLink } from './support/mail.mjs'
import { emailHash, normEmail, secretConfigured, sign, validEmail, verify } from './support/tokens.mjs'

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR
const TTL = { login: 30 * MIN, session: 60 * DAY }
const LANGS = new Set(['es', 'en', 'zh'])

export const supportEnabled = () => secretConfigured() && kofiConfigured() && donorsConfigured() && mailConfigured()
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

async function readBody(req, max) {
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > max) throw Object.assign(new Error('too-large'), { status: 413 }) }
  return body
}

async function readJson(req) {
  const body = await readBody(req, 4096)
  try { return JSON.parse(body || '{}') } catch { throw Object.assign(new Error('bad-json'), { status: 400 }) }
}

/** Webhook de Ko-fi. Responde 200 a todo aviso auténtico (aunque no dé Premium) para que Ko-fi no lo reintente; 5xx si falló guardarlo. */
async function kofiWebhook(req, res) {
  if (!supportEnabled()) return json(res, 503, { error: 'not-configured' })
  const r = parseWebhook(await readBody(req, 64 * 1024))
  if (!r.ok) { console.warn('[kofi] aviso rechazado:', r.why); return json(res, r.why === 'token' ? 401 : 400, { error: r.why }) }
  if (!r.grant) { console.log(`[kofi] aviso ${r.tx || '?'} sin Premium: ${r.why}`); return json(res, 200, { ok: true }) }
  const email = normEmail(r.email)
  if (!validEmail(email)) { console.warn(`[kofi] aviso ${r.tx}: correo no válido, dalo de alta a mano`); return json(res, 200, { ok: true }) }
  const h = emailHash(email)
  try { await addDonor(h, { id: `kofi:${r.tx}`, amount: r.amount.toFixed(2), currency: r.currency }) }
  catch (e) { if (e instanceof OrderUsed) return json(res, 200, { ok: true, repeated: true }); throw e }
  console.log(`[kofi] Premium dado (${r.amount.toFixed(2)} ${r.currency})`)
  sendAccessLink(email, accessLink(sign('login', { h }, TTL.login)), 'es', true)
    .catch(e => console.error('[kofi] correo de bienvenida:', e.message))
  return json(res, 200, { ok: true })
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
      return json(res, 200, { enabled: supportEnabled(), login: loginEnabled(), kofiUrl: kofiUrl(),
        currency: currency(), min: minAmount() })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method' })
    // Antes del límite general por IP: lo llama Ko-fi (siempre desde sus servidores) y solo vale con el token secreto.
    if (route === '/api/support/kofi') return await kofiWebhook(req, res)
    if (limited(`all:${ip}`, 60, 10 * MIN)) return json(res, 429, { error: 'too-many' })
    const body = await readJson(req)

    switch (route) {
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
