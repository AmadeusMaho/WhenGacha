import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Eventos de WuWa desde la API de Reverie (reveriegacha.gg), que los cura a mano con hora al minuto.
 *  - `*_time_type: "server"`: la hora es la local de cada servidor; se toma la del servidor de América (UTC-5), la misma que
 *    muestra gachafocus para América (se comprobó con Echo Erase, Chord Cleansing y Beyond the Waves).
 *  - `*_time_type: "fixed"`: el mismo instante para todos los servidores; el valor viene en UTC (p. ej. 03:00 = el lanzamiento de la
 *    versión 3.7, 11:00 UTC+8).
 * Los cierres vienen redondeados al minuto de reinicio (04:00 en vez de 03:59:59).
 */
const API = 'https://gachalife-production.up.railway.app/events'
const DAY = 86_400_000
const HOUR = 3_600_000
/** Offset del servidor de América de WuWa. */
const AMERICA = -5

export const REVERIE: Record<string, { path: string; server: number }> = {
  wuwa: { path: 'wuwa', server: AMERICA },
}

interface Raw {
  id: string
  title: string
  type: string
  start: string
  end: string
  url?: string | null
  image_url?: string | null
  description?: string | null
  start_time_type?: string
  end_time_type?: string
}

function at(naive: string, kind: string | undefined, serverOffset: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(naive)
  if (!m) return NaN
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0)
  return kind === 'server' ? utc - serverOffset * HOUR : utc
}

export async function syncReverie(gameId: string, key: keyof typeof REVERIE): Promise<GameSync> {
  const cfg = REVERIE[key]
  const res = await fetch(viaProxy(`${API}/${cfg.path}`))
  if (!res.ok) throw new Error(`reverie ${cfg.path} → HTTP ${res.status}`)
  const json = (await res.json()) as { events?: Raw[] }
  const rows = json.events
  if (!Array.isArray(rows)) throw new Error('reverie: respuesta inesperada')
  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY

  const out: GameEvent[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (r.type !== 'event' || !r.title) continue // los banners ya vienen de Prydwen
    const start = at(r.start, r.start_time_type, cfg.server), end = at(r.end, r.end_time_type, cfg.server)
    if (isNaN(start) || isNaN(end) || end <= start || end < from || start > to || end - start > 150 * DAY) continue
    const id = `${gameId}:event:rv:${r.id}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id, gameId, kind: 'event', title: r.title.trim(),
      description: r.description || undefined,
      image: r.image_url || undefined,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured: [], pulls: 0, source: 'api',
    })
  }
  if (!out.length) throw new Error('reverie: sin eventos vigentes')
  return { events: out, patches: [], codes: [] }
}
