import type { ApiKey, Patch } from '../types'
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
