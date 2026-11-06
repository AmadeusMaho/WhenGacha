import type { GameEvent } from '../types'
import type { GameSync } from './ennead'
import { articles, bodyLines, thumb, type Article } from './stove'

/**
 * Chaos Zero Nightmare (servidor Global): eventos desde los avisos oficiales de su comunidad en STOVE (los banners vienen de Prydwen).
 *  - Avisos "Update Notice" (tablón Updates): una sección "■" por evento con su periodo ("10/21/2026 after the maintenance – 12/02/2026 before the maintenance")
 *    y su imagen. Un evento puede traer sub-eventos con periodo propio (p. ej. "Additional Aether Distribution") o heredado (Visit Present, Attendance Check).
 *  - Tablón Current Events: concursos de comentarios y regalos (periodo en el resumen).
 *  Horas: "después del mantenimiento" = la hora real de su aviso "[Maintenance] ... (Completed)" (≈ 07:00 UTC si aún no existe); "antes del
 *  mantenimiento" = 00:00 UTC (el mantenimiento semanal empieza a las 00:00 UTC desde el 29/07, según su aviso oficial).
 *  Lo que no se puede fechar con seguridad se descarta en vez de inventarlo.
 */
const DAY = 86_400_000
const BOARDS = { announcements: 139238, events: 139240, updates: 142421 }
const FALLBACK_START = '07:00'
const RECENT_UPDATES = 3

const pad = (n: number | string) => String(n).padStart(2, '0')
const utc = (y: number, m: number, d: number, hhmm: string) => new Date(`${y}-${pad(m)}-${pad(d)}T${hhmm.padStart(5, '0')}:00Z`)

/** "m/d" -> hora UTC (HH:MM) en que terminó el mantenimiento de actualización de ese día. */
function maintenanceEnds(list: Article[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const a of list) {
    const m = /maintenance was completed on (\d{1,2})\/(\d{1,2})\s*\([A-Za-z]{3}\)\s*at\s*(\d{1,2}:\d{2})\s*UTC/i.exec(a.summary ?? '')
    if (m) out.set(`${+m[1]}/${+m[2]}`, m[3])
  }
  return out
}

const RANGE = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(after (?:the )?maintenance|\d{1,2}:\d{2}\s*\(UTC\))\s*[–—-]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(before (?:the )?maintenance|\d{1,2}:\d{2}\s*\(UTC\))/i

interface Period { start: Date; end: Date; approx: boolean }

function parseRange(text: string, ends: Map<string, string>): Period | null {
  const m = RANGE.exec(text)
  if (!m) return null
  const [, sm, sd, sy, sTime, em, ed, ey, eTime] = m
  let approx = false
  let start: Date
  if (/^after/i.test(sTime)) {
    const done = ends.get(`${+sm}/${+sd}`)
    start = utc(+sy, +sm, +sd, done ?? FALLBACK_START)
    approx = !done
  } else start = utc(+sy, +sm, +sd, sTime.replace(/\s*\(UTC\)/i, ''))
  const end = /^before/i.test(eTime) ? utc(+ey, +em, +ed, '00:00') : utc(+ey, +em, +ed, eTime.replace(/\s*\(UTC\)/i, ''))
  if (isNaN(+start) || isNaN(+end) || +end <= +start) return null
  return { start, end, approx }
}

/** Periodo escrito en la línea `i` o, si esa línea es solo la etiqueta ("◆ Period"), en la siguiente. */
function rangeAt(lines: string[], i: number, ends: Map<string, string>): Period | null {
  return parseRange(lines[i], ends) ?? (/^[◆→▸ㄴ*\s-]*(Period|Schedule)\s*:?\s*$/i.test(lines[i]) ? parseRange(lines[i + 1] ?? '', ends) : null)
}

/** Secciones que no son eventos (banners, sistema, cambios...). */
const NOT_EVENT = /Galactic Disaster|Changes|Rate-?Up|Memory|System|Content\b|Combat Training|Improvements|Bug|Package|Card Skin|Crystal|Fragment|Rescue/i
/** Sub-apartados de un evento que no son eventos por sí mismos. */
const NOT_SUB = /^(Period|Schedule|Rate-?Up|Open Schedule|Unlock|Reward|How to|Information|Precaution|Exchange|Achievement|Limited-Time|Overview|Details|Event Period)/i
/** Sub-apartados que sí se muestran aparte y duran lo mismo que el evento. */
const INHERIT = /^(Visit Present|Attendance Check)/i

function cleanTitle(head: string): string {
  let t = head.replace(/^■\s*/, '').trim()
  t = t.replace(/(Event)\s*\[[^\]]*\]\s*$/i, '$1') // "... Trauma Code Event [Subtítulo]"
  const prefixed = /^Event\s*[-–—]\s*/i.test(t)
  t = t.replace(/^Event\s*[-–—]\s*/i, '')
  const whole = /^\[([^\]]+)\]$/.exec(t)
  if (whole) return whole[1].trim()
  if (prefixed) t = t.replace(/\s*\[.*$/, '') // "Virtual Tactical Simulation [A], [B]" -> el nombre común
  return t.trim()
}

function fromUpdate(gameId: string, lines: string[], ends: Map<string, string>, fallbackImage?: string): GameEvent[] {
  const out: GameEvent[] = []
  const mk = (title: string, p: Period, image: string | undefined, minor = false): GameEvent => ({
    id: `${gameId}:event:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${p.start.toISOString().slice(0, 10)}`, gameId, kind: 'event', title,
    image: image ?? fallbackImage, start: p.start.toISOString(), end: p.end.toISOString(), items: [], featured: [], pulls: 0,
    minor: minor || undefined, precision: p.approx ? 'approx' : undefined, source: 'api',
  })
  // Secciones: cada línea "■" abre una.
  const heads = lines.map((l, i) => (l.startsWith('■') ? i : -1)).filter(i => i >= 0)
  heads.forEach((h, n) => {
    const head = lines[h]
    if (NOT_EVENT.test(head)) return
    const sec = lines.slice(h + 1, heads[n + 1] ?? lines.length)
    const image = sec.find(l => l.startsWith('@@IMG '))?.slice(6)
    const title = cleanTitle(head)
    // Periodo propio del evento: línea "Period"/"Schedule" (no un sub-apartado con nombre).
    let main: Period | null = null
    for (let i = 0; i < sec.length && !main; i++) {
      if (/^[◆→▸ㄴ*\s-]*(Event Period|Period|Schedule|Open Schedule)\b/i.test(sec[i])) main = rangeAt(sec, i, ends)
    }
    if (main) out.push(mk(title, main, image))
    // Sub-eventos: "◆ Nombre" con periodo propio (misma línea o la siguiente), o los que heredan el del evento.
    sec.forEach((l, i) => {
      if (!l.startsWith('◆')) return
      const label = l.slice(1).trim()
      if (NOT_SUB.test(label)) return
      if (INHERIT.test(label)) { if (main) out.push(mk(`${title}: ${label.replace(/:.*$/, '').trim()}`, main, image)); return }
      const p = rangeAt(sec, i, ends) ?? parseRange(sec[i + 1] ?? '', ends) ?? parseRange(sec[i + 2] ?? '', ends)
      if (p) out.push(mk(`${title}: ${label.split(':')[0].trim()}`, p, image))
    })
  })
  return out
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Avisos del tablón Current Events: concursos de comentarios ("Event Period - October 28th (Wed) – November 13th (Fri) 14:59 (UTC)") y regalos ("Claim Period - 10/23 (Fri) – ... 12/01(Wed) 23:59"). */
function fromEventPost(gameId: string, a: Article): GameEvent | null {
  const s = (a.summary ?? '').replace(/\s+/g, ' ')
  const posted = a.create_datetime
  const yearOf = (month: number, day: number) => {
    const y = new Date(posted).getUTCFullYear()
    return [y - 1, y, y + 1].reduce((b, c) => Math.abs(Date.UTC(c, month - 1, day) - posted) < Math.abs(Date.UTC(b, month - 1, day) - posted) ? c : b)
  }
  let start: Date | undefined, end: Date | undefined, approx = false, minor = false
  const w = /Event Period\s*[-:]\s*([A-Za-z]+)\.? (\d{1,2})\w* \([A-Za-z]{3}\)\s*[–—-]\s*([A-Za-z]+)\.? (\d{1,2})\w* \([A-Za-z]{3}\)\s*(\d{1,2}:\d{2})\s*\(UTC\)/i.exec(s)
  const c = /Claim Period\s*[-:]\s*(\d{1,2})\/(\d{1,2})[^■※]*?(\d{1,2})\/(\d{1,2})\s*\([A-Za-z]{3}\)\s*(\d{1,2}:\d{2})/i.exec(s)
  if (w) {
    const sm = MONTHS.indexOf(w[1].slice(0, 3).toLowerCase()) + 1, em = MONTHS.indexOf(w[3].slice(0, 3).toLowerCase()) + 1
    if (!sm || !em) return null
    start = utc(yearOf(sm, +w[2]), sm, +w[2], '00:00')
    if (+start < posted && posted - +start < DAY) start = new Date(posted) // empieza al publicarse el aviso
    end = utc(yearOf(em, +w[4]) + (em < sm ? 1 : 0), em, +w[4], w[5])
    approx = true
    minor = true // concurso de comentarios
  } else if (c) {
    start = utc(yearOf(+c[1], +c[2]), +c[1], +c[2], '00:00')
    end = utc(yearOf(+c[3], +c[4]), +c[3], +c[4], c[5])
  } else return null
  if (isNaN(+start) || isNaN(+end) || +end <= +start) return null
  const title = a.title.replace(/^\[Event\]\s*/i, '').replace(/\s*\((?:Edited|Added on|0)[^)]*\)?\s*$/i, '').trim()
  return {
    id: `${gameId}:event:${a.article_id}`, gameId, kind: 'event', title, image: thumb(a),
    start: start.toISOString(), end: end.toISOString(), items: [], featured: [], pulls: 0,
    minor: minor || undefined, precision: approx ? 'approx' : undefined, source: 'api',
  }
}

export async function syncCznEvents(gameId: string): Promise<GameSync> {
  const [upd, evs, ann] = await Promise.allSettled([articles(BOARDS.updates, 8), articles(BOARDS.events, 30), articles(BOARDS.announcements, 80)])
  if (upd.status === 'rejected' && evs.status === 'rejected') throw upd.reason
  const ends = ann.status === 'fulfilled' ? maintenanceEnds(ann.value) : new Map<string, string>()
  const from = Date.now() - 3 * DAY
  const out: GameEvent[] = []
  const seen = new Set<string>()
  const add = (e: GameEvent) => {
    const key = `${e.title.toLowerCase()}|${e.start.slice(0, 10)}`
    if (+new Date(e.end) < from || seen.has(key)) return
    seen.add(key)
    out.push(e)
  }
  if (upd.status === 'fulfilled') {
    // Del más reciente al más antiguo: los eventos largos siguen figurando en el aviso de la actualización en que empezaron.
    for (const a of upd.value.filter(x => Date.now() - x.create_datetime < 75 * DAY).slice(0, RECENT_UPDATES)) {
      try { for (const e of fromUpdate(gameId, await bodyLines(a.article_id), ends, thumb(a))) add(e) } catch { /* se omite este aviso */ }
    }
  }
  if (evs.status === 'fulfilled') for (const a of evs.value) { const e = fromEventPost(gameId, a); if (e) add(e) }
  return { events: out, patches: [], codes: [] }
}
