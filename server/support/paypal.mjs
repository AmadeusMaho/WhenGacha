// Pagos de apoyo con la API de pedidos de PayPal (v2 Checkout Orders). El navegador muestra el botón de PayPal (su SDK, con el id público
// de la aplicación) y el servidor crea el pedido y lo cobra: así el importe y el estado "COMPLETED" los confirma PayPal, no el navegador.
//
// Variables: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV ("live" para cobros reales; cualquier otro valor = sandbox de pruebas),
// SUPPORT_CURRENCY (USD) y SUPPORT_MIN (importe mínimo para Premium, 2).

const base = () => (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')
export const paypalConfigured = () => !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET)
export const currency = () => (process.env.SUPPORT_CURRENCY || 'USD').toUpperCase()
export const minAmount = () => Math.max(1, Number(process.env.SUPPORT_MIN) || 2)
export const MAX_AMOUNT = 500

let auth = { token: '', exp: 0 }

async function accessToken() {
  if (auth.token && auth.exp > Date.now() + 60_000) return auth.token
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64')
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`paypal oauth → HTTP ${res.status}`)
  const j = await res.json()
  auth = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 }
  return auth.token
}

async function call(path, body) {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(20_000),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(`paypal ${path} → HTTP ${res.status} ${j.name ?? ''}`), { status: res.status, paypal: j.name })
  return j
}

/** Importe válido ("5" → "5.00"), o null. */
export function cleanAmount(v) {
  const n = Math.round(Number(v) * 100) / 100
  return Number.isFinite(n) && n >= minAmount() && n <= MAX_AMOUNT ? n.toFixed(2) : null
}

/** Crea el pedido y devuelve su id (lo usa el botón de PayPal del navegador). */
export async function createOrder(amount) {
  const j = await call('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: currency(), value: amount }, description: 'WhenGacha Premium' }],
  })
  return j.id
}

/** Cobra el pedido ya aprobado por el comprador. Devuelve si quedó completado, el importe cobrado y el correo de su cuenta de PayPal. */
export async function captureOrder(id) {
  const j = await call(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`)
  const cap = j.purchase_units?.[0]?.payments?.captures?.[0]
  return {
    completed: j.status === 'COMPLETED' && cap?.status === 'COMPLETED',
    amount: Number(cap?.amount?.value ?? 0), currency: String(cap?.amount?.currency_code ?? ''),
    email: String(j.payer?.email_address ?? ''), id: String(j.id ?? id),
  }
}
