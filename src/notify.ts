import { CATALOG } from './catalog'
import { t } from './i18n'
import type { AppState } from './types'

const SEEN_KEY = 'whengacha:notified'
const HOUR = 3_600_000

export interface Alert { key: string; title: string; body: string; at: number; end: number }

/** Avisos pendientes: elementos de tus gachas sin completar que terminan pronto. */
export function buildAlerts(state: AppState, now = Date.now()): Alert[] {
  const games = [...CATALOG, ...state.customGames]
  const out: Alert[] = []
  for (const e of state.events) {
    if (!state.tracked.includes(e.gameId) || state.done[e.id]) continue
    const end = +new Date(e.end)
    if (end < now) continue
    const g = games.find(x => x.id === e.gameId)
    const kind = t(e.kind === 'banner' ? 'notif.banner' : e.kind === 'challenge' ? 'notif.challenge' : 'notif.event')
    out.push({
      key: `${e.id}:${e.end}`,
      title: `${g?.short ?? ''} · ${e.title}`,
      body: `${kind}${e.pulls ? t('notif.pulls', { n: e.pulls }) : ''}.`,
      at: end - state.leadHours * HOUR,
      end,
    })
  }
  return out
}

const seen = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') } catch { return {} }
}

export async function show(title: string, body: string) {
  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) await reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: title })
  else new Notification(title, { body })
}

/** Dispara los avisos vencidos (una sola vez por elemento). */
export async function fireDue(state: AppState, now = Date.now()) {
  if (!state.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const done = seen()
  const due = buildAlerts(state, now).filter(a => a.at <= now && !done[a.key])
  for (const a of due.slice(0, 5)) {
    await show(a.title, a.body)
    done[a.key] = now
  }
  if (due.length) {
    // purga entradas antiguas para no crecer indefinidamente
    for (const k of Object.keys(done)) if (done[k] < now - 60 * 24 * HOUR) delete done[k]
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(done)) } catch { /* ignorar */ }
  }
}

/** Copia los avisos a la caché para que el service worker pueda mostrarlos con la app cerrada. */
export async function mirrorAlerts(state: AppState) {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open('whengacha-prefs')
    const payload = { enabled: state.notify, alerts: buildAlerts(state), seen: seen() }
    await cache.put('alerts.json', new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }))
    const reg = await navigator.serviceWorker?.ready
    const periodic = (reg as unknown as { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> } } | undefined)?.periodicSync
    if (state.notify && periodic) await periodic.register('whengacha-alerts', { minInterval: 6 * HOUR }).catch(() => {})
  } catch { /* ignorar */ }
}

export async function enableNotifications(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  return perm === 'granted'
}
