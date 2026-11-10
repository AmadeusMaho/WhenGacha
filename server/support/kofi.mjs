// Apoyos con Ko-fi (ko-fi.com). Ko-fi cobra (con PayPal o Stripe, cuenta personal valida) y avisa de cada pago con un webhook:
// un POST application/x-www-form-urlencoded con un campo `data` que es JSON. Solo vale si trae nuestro `verification_token`
// (Ko-fi → More → API → Webhooks → Advanced). No hay API de Ko-fi a la que preguntar: el token es la única prueba de que el aviso es suyo.
//
// Variables: KOFI_TOKEN (el Verification Token), KOFI_URL (https://ko-fi.com/tuusuario), SUPPORT_MIN (2) y SUPPORT_CURRENCY (USD,
// la misma moneda que tengas en Ko-fi).
import { timingSafeEqual } from 'node:crypto'

const urlOk = () => /^https:\/\/ko-fi\.com\/[\w-]+\/?$/i.test(process.env.KOFI_URL ?? '')
export const kofiConfigured = () => !!process.env.KOFI_TOKEN && urlOk()
/** Tu página de Ko-fi, o '' si KOFI_URL no es válida. También la usa el botón de donar del pie, aunque Premium no esté activo. */
export const kofiUrl = () => (urlOk() ? (process.env.KOFI_URL ?? '').replace(/\/+$/, '') : '')
export const currency = () => (process.env.SUPPORT_CURRENCY || 'USD').toUpperCase()
export const minAmount = () => Math.max(1, Number(process.env.SUPPORT_MIN) || 2)

/** El botón "Send Test" de Ko-fi manda siempre este id de transacción (y un correo de ejemplo): se reconoce y no se da de alta. */
export const TEST_TX = '00000000-1111-2222-3333-444444444444'
const TYPES = new Set(['Donation', 'Subscription', 'Shop Order', 'Commission'])

function sameToken(got) {
  const a = Buffer.from(String(got ?? '')), b = Buffer.from(process.env.KOFI_TOKEN ?? '')
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b)
}

/**
 * Lee y comprueba el aviso de Ko-fi. Devuelve:
 *  - { ok: false, why }  si no es de Ko-fi (token incorrecto o cuerpo roto): se responde 401/400.
 *  - { ok: true, grant: false, why, tx } si es de Ko-fi pero no da Premium (prueba, importe bajo, otra moneda, sin correo).
 *  - { ok: true, grant: true, tx, email, amount, currency } si hay que dar Premium.
 */
export function parseWebhook(rawBody) {
  let d
  try { d = JSON.parse(new URLSearchParams(rawBody).get('data') ?? '') } catch { return { ok: false, why: 'cuerpo' } }
  if (!d || typeof d !== 'object') return { ok: false, why: 'cuerpo' }
  if (!sameToken(d.verification_token)) return { ok: false, why: 'token' }
  const tx = String(d.kofi_transaction_id ?? '')
  const amount = Number(d.amount)
  const cur = String(d.currency ?? '').toUpperCase()
  const email = String(d.email ?? '')
  if (tx === TEST_TX) return { ok: true, grant: false, why: 'prueba', tx }
  if (!/^[\w-]{6,64}$/.test(tx)) return { ok: true, grant: false, why: 'sin id de transacción', tx }
  if (!TYPES.has(d.type)) return { ok: true, grant: false, why: `tipo ${d.type}`, tx }
  if (cur !== currency()) return { ok: true, grant: false, why: `moneda ${cur} (se espera ${currency()})`, tx }
  if (!(amount >= minAmount())) return { ok: true, grant: false, why: `importe ${d.amount} < ${minAmount()}`, tx }
  if (!email) return { ok: true, grant: false, why: 'sin correo', tx }
  return { ok: true, grant: true, tx, email, amount, currency: cur }
}
