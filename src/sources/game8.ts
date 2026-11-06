import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Eventos desde las páginas "List of Events and Schedule" de Game8 (game8.co). Solo traen el día (sin hora) y es una guía
 * editada a mano: puede equivocarse en fechas sueltas (se comprobó que los banners sí coinciden con Prydwen y gachafocus).
 * Por eso las horas se completan con las que usa cada juego y se marcan como aproximadas; si gachafocus responde, manda él.
 */
const SITE = 'https://game8.co/games'
const DAY = 86_400_000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

interface Config {
  path: string
  /** Hora local (UTC+8, servidor Asia: es en la que Game8 escribe las fechas) de inicio, y de fin, con su día respecto al listado. */
  utc: number
  start: [number, number]
  end: [number, number, number]
}

/** Horas habituales de cada juego, sacadas de sus banners: WuWa 10:00 → 11:59 (UTC+8); NTE 11:00 → 05:59 (UTC+8). */
export const GAME8: Record<string, Config> = {
  wuwa: { path: 'Wuthering-Waves/archives/453473', utc: 8, start: [10, 0], end: [11, 59, 0] },
  nte: { path: 'Neverness-to-Everness/archives/592073', utc: 8, start: [11, 0], end: [5, 59, 0] },
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const DATE = /([A-Z][a-z]+)\.? (\d{1,2})(?:[,.]? (\d{4}))?/g
const LABEL = /^(start date|end date|event duration|event|date|duration|name)$/i

/** "October 15, 2026 - November 1, 2026" o "October 8 - November 11, 2026" -> [inicio, fin] como {año, mes, día}; null si no hay fin (permanente, TBA). */
function range(s: string): [{ y: number; m: number; d: number }, { y: number; m: number; d: number }] | null {
  if (/permanent|indefinite|tba|until/i.test(s)) return null
  const found = [...s.matchAll(DATE)].map(m => ({ m: MONTHS.indexOf(m[1].toLowerCase()), d: +m[2], y: m[3] ? +m[3] : NaN })).filter(x => x.m >= 0)
  if (found.length < 2) return null
  const [a, b] = found
  if (isNaN(b.y)) return null
  const startY = isNaN(a.y) ? (a.m > b.m ? b.y - 1 : b.y) : a.y
  return [{ y: startY, m: a.m, d: a.d }, { y: b.y, m: b.m, d: b.d }]
}

export async function syncGame8(gameId: string, key: keyof typeof GAME8): Promise<GameSync> {
  const cfg = GAME8[key]
  const res = await fetch(viaProxy(`${SITE}/${cfg.path}`))
  if (!res.ok) throw new Error(`game8 ${cfg.path} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY
  const toMs = (d: { y: number; m: number; d: number }, h: number, mi: number) => Date.UTC(d.y, d.m, d.d, h - cfg.utc, mi)

  const out: GameEvent[] = []
  const seen = new Set<string>()
  doc.querySelectorAll('table tr').forEach(tr => {
    const cells = [...tr.children].filter(c => /^T[DH]$/i.test(c.tagName)).map(text)
    if (cells.length < 2 || LABEL.test(cells[0])) return
    const name = cells[0]
    const r = cells.slice(1).map(range).find(Boolean)
    if (!name || !r) return
    const start = toMs(r[0], cfg.start[0], cfg.start[1])
    const end = toMs({ ...r[1], d: r[1].d + cfg.end[2] }, cfg.end[0], cfg.end[1]) + (cfg.end[1] === 59 ? 59_000 : 0)
    if (!(end > start) || end < from || start > to || end - start > 150 * DAY) return
    const id = `${gameId}:event:g8:${name}:${new Date(start).toISOString().slice(0, 10)}`
    if (seen.has(id)) return
    seen.add(id)
    out.push({
      id, gameId, kind: 'event', title: name,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured: [], pulls: 0, source: 'api',
      precision: 'approx',
    })
  })
  if (!out.length) throw new Error(`game8 ${cfg.path}: no se encontraron eventos`)
  return { events: out, patches: [], codes: [] }
}
