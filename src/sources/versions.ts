import type { ApiKey, GameEvent, Patch } from '../types'
import { viaProxy } from '../net'

const DAY = 86_400_000

interface Cfg { host: string; template: string; majors: (number | string)[] }

/** Wikis con una plantilla que lista las versiones y su fecha de lanzamiento. */
const CFG: Partial<Record<ApiKey, Cfg>> = {
  genshin: { host: 'genshin-impact.fandom.com', template: 'Versions', majors: [1, 2, 3, 4, 5, 'Luna', 7, 8] },
  starrail: { host: 'honkai-star-rail.fandom.com', template: 'Version Table', majors: [1, 2, 3, 4, 5, 6, 7, 8] },
  zenless: { host: 'zenless-zone-zero.fandom.com', template: 'Versions', majors: [1, 2, 3, 4, 5] },
  wuwa: { host: 'wutheringwaves.fandom.com', template: 'Versions', majors: [1, 2, 3, 4, 5] },
}

export interface VersionRow { version: string; name?: string; date: string }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function parseDate(s: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])).toISOString()
  const long = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)
  if (long && MONTHS.includes(long[1].slice(0, 3).toLowerCase()))
    return new Date(Date.UTC(+long[3], MONTHS.indexOf(long[1].slice(0, 3).toLowerCase()), +long[2])).toISOString()
  return null
}

const TTL = 24 * 3_600_000

/** Genshin numera la versión 6 como "Luna I".."Luna VIII" (6.0 a 6.7). */
const roman = (s: string) => [...s].reduce((n, c, i, a) => { const x = { I: 1, V: 5, X: 10 }[c as 'I'] ?? 0; const y = { I: 1, V: 5, X: 10 }[a[i + 1] as 'I'] ?? 0; return x < y ? n - x : n + x }, 0)

/** Historial de versiones (inicio de cada una) desde la wiki; se guarda 24 h en caché. */
export async function fetchHistory(api: ApiKey): Promise<VersionRow[]> {
  const cfg = CFG[api]
  if (!cfg) return []
  const key = `whengacha:versions:v2:${api}`
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; rows: VersionRow[] } | null
    if (hit && Date.now() - hit.at < TTL) return hit.rows
  } catch { /* sin caché */ }

  const text = cfg.majors.map(m => `{{${cfg.template}|${m}}}`).join('')
  const qs = new URLSearchParams({ action: 'parse', contentmodel: 'wikitext', prop: 'text', format: 'json', origin: '*', text })
  const res = await fetch(viaProxy(`https://${cfg.host}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${cfg.host} → HTTP ${res.status}`)
  const html = (await res.json())?.parse?.text?.['*'] as string | undefined
  if (!html) return []

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const byVersion = new Map<string, VersionRow>()
  doc.querySelectorAll('tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td, th')].map(c => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
    if (cells.length < 2) return
    const luna = /^Luna ([IVX]+)\b/.exec(cells[0])
    const v = luna ? ['', `6.${roman(luna[1]) - 1}`] : /(?:^|\s)(\d+\.\d+)(?:\s|$)/.exec(cells[0])
    const date = cells.map(parseDate).find(Boolean)
    if (!v || !date) return
    const name = cells.slice(1).find(c => c && !parseDate(c) && c.length > 2)
    byVersion.set(v[1], { version: v[1], name, date })
  })
  const rows = [...byVersion.values()].sort((a, b) => +new Date(a.date) - +new Date(b.date))
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), rows })) } catch { /* ignorar */ }
  return rows
}

/** Une historial (wiki) y datos oficiales de banners, y calcula el fin de cada versión. */
export function buildPatches(gameId: string, derived: Patch[], history: VersionRow[], cycleDays: number): Patch[] {
  const map = new Map<string, Patch>()
  for (const h of history)
    map.set(h.version, { id: `${gameId}:patch:${h.version}`, gameId, version: h.version, name: h.name, date: h.date, notes: '', source: 'api' })
  // Los banners oficiales solo muestran la fase vigente: de ellos se toma el fin, no el inicio, si la wiki ya lista la versión.
  for (const d of derived) {
    const h = map.get(d.version)
    map.set(d.version, h ? { ...h, end: d.estimated ? h.end : d.end ?? h.end } : d)
  }
  return withNextEstimate(gameId, finalize([...map.values()], cycleDays), cycleDays)
}

/** Si la wiki aún no lista la versión siguiente, se estima con el ciclo típico del juego. */
function withNextEstimate(gameId: string, list: Patch[], cycleDays: number): Patch[] {
  const now = Date.now()
  if (!cycleDays || !list.length || list.some(p => +new Date(p.date) > now)) return list
  const last = list[list.length - 1]
  const m = /^(\d+)\.(\d+)$/.exec(last.version)
  if (!m) return list
  const next = `${m[1]}.${+m[2] + 1}`
  const date = last.end ?? new Date(+new Date(last.date) + cycleDays * DAY).toISOString()
  return [...list, {
    id: `${gameId}:patch:${next}`, gameId, version: next, date, end: new Date(+new Date(date) + cycleDays * DAY).toISOString(),
    notes: 'Estimado: según la duración típica de las versiones.', source: 'api', estimated: true,
  }]
}

/** Cada versión termina cuando empieza la siguiente; la última usa su fin conocido o el ciclo típico. */
export function finalize(patches: Patch[], cycleDays: number): Patch[] {
  const sorted = [...patches].sort((a, b) => +new Date(a.date) - +new Date(b.date))
  return sorted.map((p, i) => {
    const next = sorted[i + 1]
    if (next) return { ...p, end: next.date }
    if (!p.end && cycleDays) return { ...p, end: new Date(+new Date(p.date) + cycleDays * DAY).toISOString() }
    return p
  })
}

/**
 * Hora exacta de cada versión. El historial de la wiki solo trae el día (00:00 UTC), que en América cae la víspera: la marca de la v3.8 de WuWa salía
 * el 10 nov por la noche (GMT-3), antes de que acabaran los banners de la 3.7. Los banners de una versión empiezan justo cuando se lanza, así que si
 * uno empieza entre 1 día antes y 2 días después de la fecha de la wiki, la versión toma su hora (la más temprana) y deja de ser estimada.
 * Sin banner cercano, un día sin hora (00:00 UTC) se lleva a la hora habitual de lanzamiento del juego (`launchUtcHour`: fin del mantenimiento, 11:00 UTC+8 = 03:00 UTC).
 * Después, cada versión termina cuando empieza la siguiente; la última conserva su duración.
 */
export function alignPatches(patches: Patch[], events: GameEvent[], launchUtcHour?: number, cycleDays?: number): Patch[] {
  if (!patches.length) return patches
  const starts = events.filter(e => e.kind === 'banner' && !e.precision).map(e => +new Date(e.start)).filter(n => !isNaN(n))
  const aligned = patches.map(p => {
    const d = +new Date(p.date)
    const near = starts.filter(s => s >= d - DAY && s <= d + 2 * DAY)
    // Sin banner con el que alinear: un día sin hora (00:00 UTC) pasa a la hora habitual de lanzamiento del juego.
    if (!near.length) {
      if (launchUtcHour === undefined || d % DAY !== 0) return p
      const h = launchUtcHour * 3_600_000
      return { ...p, date: new Date(d + h).toISOString(), end: p.end && +new Date(p.end) % DAY === 0 ? new Date(+new Date(p.end) + h).toISOString() : p.end }
    }
    const s = Math.min(...near)
    const shift = s - d
    return { ...p, date: new Date(s).toISOString(), end: p.end ? new Date(+new Date(p.end) + shift).toISOString() : p.end, estimated: undefined }
  })
  // Una versión estimada no empieza antes de que acaben los banners ya empezados de la anterior (Endfield: v1.7 estimada el 24 nov, banners hasta el 26).
  const banners = events.filter(e => e.kind === 'banner')
  const fixed = aligned.map(p => {
    if (!p.estimated) return p
    const d = +new Date(p.date)
    const lastEnd = Math.max(0, ...banners.filter(e => +new Date(e.start) < d && +new Date(e.end) - +new Date(e.start) < 60 * DAY).map(e => +new Date(e.end)))
    if (lastEnd <= d) return p
    const s = Math.ceil(lastEnd / 1000) * 1000
    return { ...p, date: new Date(s).toISOString(), end: p.end ? new Date(+new Date(p.end) + (s - d)).toISOString() : p.end }
  })
  const sorted = fixed.sort((a, b) => +new Date(a.date) - +new Date(b.date))
  // Una versión estimada tampoco empieza antes del 80 % del ciclo típico tras la anterior: el fin de la primera fase de banners no es el de la versión
  // (Genshin: la 7.3 salía estimada el 24 nov, 3 semanas después de la 7.2).
  if (cycleDays) for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i], prev = sorted[i - 1]
    if (!p.estimated) continue
    const min = +new Date(prev.date) + 0.8 * cycleDays * DAY
    if (+new Date(p.date) >= min) continue
    const s = +new Date(prev.date) + cycleDays * DAY
    sorted[i] = { ...p, date: new Date(s).toISOString(), end: new Date(s + cycleDays * DAY).toISOString() }
  }
  return sorted.map((p, i) => (sorted[i + 1] ? { ...p, end: sorted[i + 1].date } : p))
}
