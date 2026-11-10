// Firmas del sistema de apoyo (WhenGacha Premium). Todo con SUPPORTER_SECRET; nada de esto llega al navegador salvo los tokens firmados.
//
//  - emailHash(): huella del correo (HMAC). La lista de donantes guarda solo esto, nunca el correo en claro.
//  - sign()/verify(): tokens "<datos>.<firma>" con tipo y caducidad: claim (pago verificado, falta el correo), login (enlace del correo,
//    un solo uso) y session (lo que guarda el navegador; se renueva al revalidar).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const secret = () => process.env.SUPPORTER_SECRET ?? ''
export const secretConfigured = () => secret().length >= 16

export const normEmail = e => String(e ?? '').trim().toLowerCase()
export const validEmail = e => e.length >= 6 && e.length <= 254 && /^[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}$/i.test(e)
export const emailHash = email => createHmac('sha256', secret()).update(`email:${normEmail(email)}`).digest('hex')

const mac = body => createHmac('sha256', secret()).update(`tok:${body}`).digest('base64url')

/** Token firmado de tipo `typ` con caducidad `ttlMs`. */
export function sign(typ, payload, ttlMs) {
  const body = Buffer.from(JSON.stringify({ ...payload, typ, exp: Date.now() + ttlMs, n: randomBytes(6).toString('base64url') })).toString('base64url')
  return `${body}.${mac(body)}`
}

/** Datos del token si la firma es buena, es del tipo pedido y no ha caducado; si no, null. */
export function verify(typ, token) {
  const [body, sig] = String(token ?? '').split('.')
  if (!body || !sig || !secretConfigured()) return null
  const want = Buffer.from(mac(body)), got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return data.typ === typ && Number(data.exp) > Date.now() ? data : null
  } catch { return null }
}

/* Código de 6 cifras del correo de acceso, para cuando el enlace se abre en el navegador interno de Gmail u otra app (la sesión se
   guarda en el navegador que abre el enlace): se escribe en el pincel del navegador de verdad junto con el correo.
   Sin estado: sale de la huella del correo y de una ventana de 30 min, así que vale desde el servidor y desde `npm run premium`, y
   sobrevive a reinicios. Se acepta la ventana actual y la anterior: vale entre 30 y 60 min. No es de un solo uso (pedir otro correo en
   la misma ventana da el mismo código); lo protegen la caducidad y el límite de intentos por correo (supporter.mjs). */
export const CODE_WINDOW_MS = 30 * 60_000
const codeFor = (h, w) => String(createHmac('sha256', secret()).update(`code:${h}:${w}`).digest().readUInt32BE(0) % 1_000_000).padStart(6, '0')

/** Código vigente para la huella `h`. */
export const loginCode = (h, at = Date.now()) => codeFor(h, Math.floor(at / CODE_WINDOW_MS))

/** ¿Es `code` (se ignoran espacios y guiones) un código vigente de `h`? */
export function checkLoginCode(h, code) {
  const c = String(code ?? '').replace(/\D/g, '')
  if (c.length !== 6 || !secretConfigured()) return false
  const w = Math.floor(Date.now() / CODE_WINDOW_MS)
  return [w, w - 1].some(x => timingSafeEqual(Buffer.from(codeFor(h, x)), Buffer.from(c)))
}
