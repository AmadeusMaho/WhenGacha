import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * WhenGacha Premium en el navegador: sesión (token firmado por el servidor, server/supporter.mjs), enlace de acceso del correo y
 * configuración del apoyo (el pago se hace en Ko-fi, que avisa al servidor; el navegador no interviene).
 * Nada de esto es secreto en el navegador: la sesión solo vale porque el servidor la firmó y la revalida cada 12 h.
 */
const SESSION_KEY = 'whengacha:session'
/** Pago pendiente de correo del antiguo flujo con PayPal: ya no se usa, se borra si quedó guardado. */
const OLD_CLAIM_KEY = 'whengacha:claim'
const RECHECK_MS = 12 * 3_600_000

interface Session { t: string; exp: number; checked: number }

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* solo para esta visita */ } },
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
export const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Caducidad que el servidor puso en el token (la primera parte es JSON en base64url). */
function expOf(token: string): number {
  try { return Number(JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).exp) || 0 } catch { return 0 }
}

let session: Session | null = (() => {
  try { const s = JSON.parse(store.get(SESSION_KEY) ?? 'null') as Session | null; return s?.t ? s : null } catch { return null }
})()

export const isSupporter = () => !!session && session.exp > Date.now()
export const useSupporter = (): boolean => useSyncExternalStore(subscribe, isSupporter)

function saveSession(t: string) {
  session = { t, exp: expOf(t), checked: Date.now() }
  store.set(SESSION_KEY, JSON.stringify(session))
  emit()
}

export function logout() {
  session = null
  store.set(SESSION_KEY, null)
  emit()
}

async function post(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

/** Revalida la sesión con el servidor cada 12 h. Si lo anularon, se cierra; si no hay conexión, se mantiene. */
export async function revalidate(force = false) {
  if (!session || (!force && Date.now() - session.checked < RECHECK_MS)) return
  try {
    const { status, data } = await post('/api/session', { session: session.t })
    if (status === 200 && typeof data.session === 'string') saveSession(data.session)
    else if (status === 401 || status === 403) logout()
  } catch { /* sin conexión: se vuelve a intentar en la próxima visita */ }
}

export type ApiResult = 'ok' | 'invalid' | 'too-many' | 'unavailable'

const resultOf = (status: number): ApiResult =>
  status === 200 ? 'ok' : status === 429 ? 'too-many' : status === 400 || status === 403 ? 'invalid' : 'unavailable'

/** Pide un enlace de acceso para otro dispositivo. El servidor responde igual sea o no donante. */
export async function requestLink(email: string, lang: string): Promise<ApiResult> {
  try { const { status } = await post('/api/login', { email: email.trim(), lang }); return resultOf(status) } catch { return 'unavailable' }
}

/* ----- Apoyo ----- */
export interface SupportConfig { enabled: boolean; login: boolean; kofiUrl: string; currency: string; min: number }

let config: Promise<SupportConfig | null> | null = null
export function supportConfig(): Promise<SupportConfig | null> {
  config ??= fetch('/api/support/config').then(r => (r.ok ? r.json() as Promise<SupportConfig> : null)).catch(() => null)
  return config
}

/** Página de Ko-fi configurada en el servidor (KOFI_URL), o '' si no hay (sin servidor o sin configurar). La usa el botón de donar del pie. */
export function useKofiUrl(): string {
  const [url, setUrl] = useState('')
  useEffect(() => { void supportConfig().then(c => setUrl(c?.kofiUrl ?? '')) }, [])
  return url
}

/* ----- Enlace del correo (?acceso=…) ----- */
let notice: 'login-ok' | 'login-bad' | null = null
export const useNotice = () => useSyncExternalStore(subscribe, () => notice)
export const clearNotice = () => { notice = null; emit() }

async function init() {
  store.set(OLD_CLAIM_KEY, null)
  const params = new URLSearchParams(location.search)
  const token = params.get('acceso')
  if (!token) return revalidate()
  // Se quita de la dirección enseguida (no queda en el historial ni al compartir la página).
  params.delete('acceso')
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`)
  try {
    const { status, data } = await post('/api/login/verify', { token })
    if (status === 200 && typeof data.session === 'string') { saveSession(data.session); notice = 'login-ok' }
    else notice = 'login-bad'
  } catch { notice = 'login-bad' }
  emit()
}

void init()
