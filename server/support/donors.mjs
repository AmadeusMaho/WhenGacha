// Lista de donantes (WhenGacha Premium) en un archivo JSON de un repositorio PRIVADO de GitHub, vía su API de contenidos.
// Botkeep borra los archivos del servidor en cada deploy; GitHub no. Solo se escribe cuando entra o se anula un donante.
//
// Variables: DONORS_REPO ("usuario/repo-privado"), DONORS_TOKEN (token fine-grained con permiso "Contents: Read and write" SOLO en ese
// repositorio), DONORS_PATH (donors.json) y DONORS_BRANCH (opcional; por defecto, la rama principal del repo).
//
// Formato: { "donors": [ { "h": "<huella HMAC del correo>", "since": "<ISO>", "revoked": false,
//                          "orders": [ { "id": "<pedido PayPal o 'manual'>", "amount": "5.00", "currency": "USD", "at": "<ISO>" } ] } ] }
// Nunca se guarda el correo en claro (ver tokens.mjs, emailHash).

import { nativeFetch } from '../native-fetch.mjs'

const repo = () => process.env.DONORS_REPO ?? ''
const path = () => process.env.DONORS_PATH || 'donors.json'
export const donorsConfigured = () => /^[\w.-]+\/[\w.-]+$/.test(repo()) && !!process.env.DONORS_TOKEN

const CACHE_MS = 10 * 60_000
let cache = { at: 0, data: { donors: [] }, sha: null }

const api = (suffix = '') => `https://api.github.com/repos/${repo()}/contents/${path()}${suffix}`
const headers = () => ({ authorization: `Bearer ${process.env.DONORS_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'WhenGacha', 'x-github-api-version': '2022-11-28' })

const parseDonors = text => {
  const data = JSON.parse(text || '{"donors":[]}')
  return { donors: Array.isArray(data.donors) ? data.donors : [] }
}

async function load(force = false) {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache
  cache = await loadApi()
  return cache
}

async function loadApi() {
  const ref = process.env.DONORS_BRANCH ? `?ref=${encodeURIComponent(process.env.DONORS_BRANCH)}` : ''
  const res = await nativeFetch(api(ref), { headers: headers(), signal: AbortSignal.timeout(15_000) })
  if (res.status === 404) return { at: Date.now(), data: { donors: [] }, sha: null } // todavía no hay archivo: se crea al primer donante
  if (!res.ok) {
    // El mensaje de GitHub distingue "Resource not accessible by personal access token" (permisos), "Bad credentials",
    // límites de uso, etc. Del token solo se registra la longitud, para ver si está cortado o con espacios (nunca el valor).
    // Si la respuesta no es JSON de GitHub (sin "message"), la dio otra cosa (p. ej. el fetch del recolector): se registra quién.
    const body = await res.text().catch(() => '')
    let msg = ''
    try { msg = JSON.parse(body)?.message ?? '' } catch { /* no es JSON */ }
    if (!msg) msg = `[no es GitHub: server=${res.headers.get('server') ?? '?'} tipo=${res.headers.get('content-type') ?? '?'} cuerpo="${body.replace(/\s+/g, ' ').slice(0, 160)}"]`
    const tok = process.env.DONORS_TOKEN ?? ''
    throw new Error(`github donors → HTTP ${res.status} ${msg} (token de ${tok.length} caracteres${/\s|["']/.test(tok) ? ', con espacios o comillas' : ''})`)
  }
  const j = await res.json()
  return { at: Date.now(), data: parseDonors(Buffer.from(j.content ?? '', 'base64').toString('utf8')), sha: j.sha }
}

export async function isDonor(h) {
  const { data } = await load()
  return data.donors.some(d => d.h === h && !d.revoked)
}

/* Escrituras en serie (una cola), releyendo antes de escribir; si GitHub dice que cambió entretanto (409/422), se reintenta una vez. */
let queue = Promise.resolve()
function write(mutate, message) {
  const run = async (retry) => {
    const { data, sha } = await load(true)
    const next = structuredClone(data)
    if (!mutate(next)) return false
    const body = { message, content: Buffer.from(`${JSON.stringify(next, null, 1)}\n`).toString('base64'), ...(sha ? { sha } : {}),
      ...(process.env.DONORS_BRANCH ? { branch: process.env.DONORS_BRANCH } : {}) }
    const res = await nativeFetch(api(), { method: 'PUT', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
    if ((res.status === 409 || res.status === 422) && retry) return run(false)
    if (!res.ok) throw new Error(`github donors (escritura) → HTTP ${res.status}`)
    const j = await res.json()
    cache = { at: Date.now(), data: next, sha: j.content?.sha ?? null }
    return true
  }
  const p = queue.then(() => run(true))
  queue = p.catch(() => {})
  return p
}

export class OrderUsed extends Error {}

/** Alta (o pago adicional) de un donante. Un pedido de PayPal solo puede dar acceso una vez: si ya se usó, lanza OrderUsed. */
export function addDonor(h, order) {
  return write(data => {
    if (order.id !== 'manual' && data.donors.some(d => d.orders?.some(o => o.id === order.id))) throw new OrderUsed(order.id)
    const at = new Date().toISOString()
    const d = data.donors.find(x => x.h === h)
    if (d) { d.revoked = false; (d.orders ??= []).push({ ...order, at }) }
    else data.donors.push({ h, since: at, revoked: false, orders: [{ ...order, at }] })
    return true
  }, order.id === 'manual' ? 'Alta manual de donante' : `Nuevo apoyo (${order.amount} ${order.currency})`)
}

/** Anula el acceso de un donante (sigue en la lista, marcado). */
export function revokeDonor(h) {
  return write(data => {
    const d = data.donors.find(x => x.h === h)
    if (!d || d.revoked) return false
    d.revoked = true
    return true
  }, 'Acceso anulado')
}
