// Códigos de apoyo: desbloquean las skins del sitio para quien dona (src/skins/). Sin base de datos ni datos personales.
//
// Un código es "WG-<id>-<firma>": <id> son 10 caracteres al azar y <firma> los 10 primeros (base32) del HMAC-SHA256 del id con
// SUPPORTER_SECRET. Solo quien tiene la clave puede generar códigos válidos (scripts/donor-code.mjs) y el servidor los comprueba
// sin guardar nada. Para anular uno: su <id> en SUPPORTER_REVOKED (lista separada por comas). Sin SUPPORTER_SECRET, el desbloqueo
// responde 503 ("no configurado").
//
// POST /api/unlock   cuerpo JSON { "code": "WG-…" }  →  200 { ok: true } | 400 { ok: false } | 429 | 503
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin I, O, 0, 1 (se confunden al copiar a mano)
const b32 = buf => { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5 } } return out }

const secret = () => process.env.SUPPORTER_SECRET ?? ''
const revoked = () => new Set((process.env.SUPPORTER_REVOKED ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean))
const sign = (id, key) => b32(createHmac('sha256', key).update(id).digest()).slice(0, 10)

/** Nuevo código (lo usa scripts/donor-code.mjs). */
export function makeCode(key = secret()) {
  if (!key) throw new Error('Falta SUPPORTER_SECRET')
  const id = b32(randomBytes(7)).slice(0, 10)
  return `WG-${id}-${sign(id, key)}`
}

/** ¿Código válido y no anulado? Acepta minúsculas y espacios. */
export function checkCode(raw, key = secret()) {
  const m = /^WG-([A-Z2-9]{10})-([A-Z2-9]{10})$/.exec(String(raw ?? '').toUpperCase().replace(/\s+/g, ''))
  if (!key || !m || revoked().has(m[1])) return false
  const want = Buffer.from(sign(m[1], key)), got = Buffer.from(m[2])
  return want.length === got.length && timingSafeEqual(want, got)
}

/* Límite de intentos: 10 cada 10 min por IP (con firmas de 50 bits, adivinar uno es inviable). */
const WINDOW = 10 * 60_000, MAX_TRIES = 10
const tries = new Map()
function tooMany(ip) {
  const now = Date.now()
  const t = tries.get(ip)
  if (!t || now - t.at > WINDOW) { tries.set(ip, { at: now, n: 1 }); return false }
  t.n++
  if (tries.size > 5000) for (const [k, v] of tries) if (now - v.at > WINDOW) tries.delete(k)
  return t.n > MAX_TRIES
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }

export async function handleUnlock(req, res) {
  if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); return res.end() }
  if (!secret()) return json(res, 503, { ok: false, error: 'not-configured' })
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?'
  if (tooMany(ip)) return json(res, 429, { ok: false, error: 'too-many' })
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > 1024) return json(res, 413, { ok: false }) }
  let code
  try { code = JSON.parse(body).code } catch { return json(res, 400, { ok: false }) }
  const ok = checkCode(code)
  return json(res, ok ? 200 : 400, { ok })
}
