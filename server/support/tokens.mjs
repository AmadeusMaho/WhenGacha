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
