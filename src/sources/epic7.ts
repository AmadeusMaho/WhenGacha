import { viaProxy } from '../net'
import type { GameEvent, PromoCode } from '../types'
import type { GameSync } from './ennead'
import { articles, bodyLines, bodyText as body, sized, thumb, type Article } from './stove'
import { pullsIn } from './pulls'
import { summarize } from './summary'

/**
 * Epic Seven (servidor Global) sin gachafocus:
 *  - Banners: calendario de "Drop Rate Up" de bannerhistory.app (inicio y fin exactos en UTC, héroe, artefacto, imagen). Los datos vienen
 *    incrustados en el HTML (flujo de Next.js), sin API. Se actualiza semanalmente; puede faltar algún banner especial muy reciente.
 *  - Eventos: avisos oficiales del tablón "Events" de STOVE (api.onstove.com, la API que usa su propia web). El periodo viene como texto en
 *    el resumen del aviso ("Schedule: 10/29 (Thu) after the maintenance – 12/10 (Thu) 02:59 UTC"). "Tras el mantenimiento" se resuelve con
 *    el aviso "Maintenance Notice (Completed)" del tablón de mantenimientos (hora exacta de fin); si aún no existe, se estima y se marca "≈".
 *    Lo que no se puede fechar con seguridad se descarta en vez de inventarlo.
 */
const DAY = 86_400_000
const BANNERS = 'https://bannerhistory.app/en/e7-pickup-history'
/** Hora (UTC) a la que se supone terminado un mantenimiento cuyo aviso de cierre aún no existe. */
const FALLBACK_MAINTENANCE_END = '09:00'

/* ---------- banners (bannerhistory.app) ---------- */

/** Une los fragmentos `self.__next_f.push([1,"..."])` del HTML: los datos de la página, sin el escapado del HTML. */
function flightData(html: string): string {
  let out = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { out += JSON.parse(m[1]) as string } catch { /* fragmento ilegible */ }
  }
  return out
}

/** El array JSON que empieza justo después de `key` (p. ej. `"banners":`), respetando cadenas. */
function arrayAfter(s: string, key: string): unknown[] | null {
  const at = s.indexOf(key)
  if (at < 0) return null
  const from = at + key.length
  if (s[from] !== '[') return null
  let depth = 0, inStr = false
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) { try { return JSON.parse(s.slice(from, i + 1)) as unknown[] } catch { return null } }
  }
  return null
}

interface RawBanner { id: string; title: string; hero?: string; artifact?: string; startUtc: string; endUtc: string; bannerSrc?: string; kind?: string; element?: string; class?: string }

async function syncBanners(gameId: string): Promise<GameEvent[]> {
  const res = await fetch(viaProxy(BANNERS))
  if (!res.ok) throw new Error(`bannerhistory → HTTP ${res.status}`)
  const list = arrayAfter(flightData(await res.text()), '"banners":') as RawBanner[] | null
  if (!list?.length) throw new Error('bannerhistory: no se encontraron banners')
  const from = Date.now() - 3 * DAY
  const out: GameEvent[] = []
  for (const b of list) {
    const s = +new Date(b.startUtc), e = +new Date(b.endUtc)
    if (!b.id || isNaN(s) || isNaN(e) || e < from || e <= s) continue
    const names = [b.hero, b.artifact].filter((x): x is string => !!x)
    out.push({
      id: `${gameId}:banner:${b.id}`, gameId, kind: 'banner',
      title: names.join(' / ') || b.title,
      description: b.title,
      image: sized(b.bannerSrc),
      start: new Date(s).toISOString(), end: new Date(e).toISOString(),
      items: [], featured: names.map(name => ({ name })), pulls: 0, source: 'api',
    })
  }
  return out
}

/* ---------- eventos y héroes nuevos (avisos oficiales de STOVE) ---------- */

/** Fecha mes/día sin año: el año que la deja más cerca de `ref` (la fecha del aviso). */
function nearYear(month: number, day: number, ref: number): number {
  const y = new Date(ref).getUTCFullYear()
  return [y - 1, y, y + 1].reduce((best, c) => Math.abs(Date.UTC(c, month - 1, day) - ref) < Math.abs(Date.UTC(best, month - 1, day) - ref) ? c : best)
}

const pad = (n: number) => String(n).padStart(2, '0')
const utc = (y: number, m: number, d: number, hhmm: string) => new Date(`${y}-${pad(m)}-${pad(d)}T${hhmm.padStart(5, '0')}:00Z`)

/** "Schedule: 10/29 (Thu) after the maintenance – 12/10 (Thu) 02:59 UTC" y variantes (con o sin "(UTC)", con "Event Schedule]", "Period:"...). */
const SCHEDULE = /(?:Event Schedule\]|Schedule(?: Details)?\s*:?|Event Period:?|Period:?)\s*(?:Korea\/Asia\/Japan\s*)?(\d{1,2})\/(\d{1,2})\s*\([A-Za-z]{3}\)\s*(after (?:the )?maintenance|\d{1,2}:\d{2})?\s*[-–—~]\s*(\d{1,2})\/(\d{1,2})\s*\([A-Za-z]{3}\)\s*(\d{1,2}:\d{2})\s*\(?UTC\)?/i

/** "m/d" -> hora UTC (HH:MM) en que terminó el mantenimiento de ese día, según los avisos "Maintenance Notice (Completed)". */
function maintenanceEnds(list: Article[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const a of list) {
    const m = /maintenance has ended on (\d{1,2})\/(\d{1,2})\s*\([A-Za-z]{3}\)\s*(\d{1,2}:\d{2})\s*UTC/i.exec(a.summary ?? '')
    if (m) out.set(`${+m[1]}/${+m[2]}`, m[3])
  }
  return out
}

interface Period { start: Date; end: Date; precision?: 'approx'; dayOnly: boolean }

/** El primer periodo que aparece en `text` (el aviso se publicó en `posted`); null si no hay o no se puede fechar con seguridad. */
function period(text: string, posted: number, ends: Map<string, string>): Period | null {
  const m = SCHEDULE.exec(text.replace(/\s+/g, ' '))
  if (!m) return null
  const [, sm, sd, sTime, em, ed, eTime] = m
  const sy = nearYear(+sm, +sd, posted)
  let start: Date
  let precision: 'approx' | undefined
  if (sTime && /^\d/.test(sTime)) start = utc(sy, +sm, +sd, sTime)
  else if (sTime) { // "tras el mantenimiento": hora real de su aviso de cierre; si aún no existe, se estima
    const end = ends.get(`${+sm}/${+sd}`)
    start = utc(sy, +sm, +sd, end ?? FALLBACK_MAINTENANCE_END)
    if (!end) precision = 'approx'
  } else { // solo el día (eventos semanales de comentarios): empieza al publicarse el aviso ese mismo día
    const same = new Date(posted).toISOString().slice(0, 10) === `${sy}-${pad(+sm)}-${pad(+sd)}`
    start = same ? new Date(posted) : utc(sy, +sm, +sd, '03:00')
    precision = 'approx'
  }
  const ey = +em < +sm || (+em === +sm && +ed < +sd) ? sy + 1 : sy
  const end = utc(ey, +em, +ed, eTime)
  if (isNaN(+start) || isNaN(+end) || +end <= +start) return null
  return { start, end, precision, dayOnly: !sTime }
}

const NOT_AN_EVENT = /\b(pack|sale|sales|bundle)\b/i
/** Máximo de avisos cuyo cuerpo completo se pide (por no traer el periodo o las recompensas en el resumen; cada uno es una petición). */
const MAX_DETAILS = 14

/**
 * Tablas de recompensas que STOVE aplana una celda por línea: "Check-In Day / Standard Reward / Quantity / 1 / Faint Guiding Stone / 25 / 7+ /
 * Chronicle Bookmark / 100 …" (42-Day Journey). Se leen los tríos [número de día o fila, objeto, cantidad] y se suma cada objeto.
 * Solo tras una cabecera de tabla con "Reward" y "Quantity"/"Qty" (para no tomar fechas u horas por cantidades).
 */
export function tableRewards(lines: string[]): string[] {
  const head = lines.findIndex((l, i) => /reward/i.test(l) && lines.slice(i, i + 4).some(x => /^(quantity|qty|amount)$/i.test(x.trim())))
  if (head < 0) return []
  const sum = new Map<string, number>()
  const num = (x?: string) => (x && /^[\d,]+$/.test(x.trim()) ? Number(x.replace(/,/g, '')) : NaN)
  for (let i = head; i < lines.length - 2; i++) {
    const [a, b, c] = [lines[i].trim(), lines[i + 1].trim(), lines[i + 2].trim()]
    if (!/^\d{1,3}\+?$/.test(a) || /^[\d,+]+$/.test(b) || b.length < 3 || b.length > 60 || isNaN(num(c))) continue
    sum.set(b, (sum.get(b) ?? 0) + num(c))
    i += 2
  }
  return [...sum].map(([n, q]) => `${n} x${q}`)
}

async function syncEvents(gameId: string, list: Article[], ends: Map<string, string>): Promise<GameEvent[]> {
  const from = Date.now() - 3 * DAY
  const out: GameEvent[] = []
  const seen = new Set<string>()
  let details = 0
  for (const a of list) {
    if (NOT_AN_EVENT.test(a.title)) continue
    let text = a.summary ?? ''
    let p = period(text, a.create_datetime, ends)
    // El resumen se corta a ~1000 caracteres: si no trae el periodo, y el aviso es reciente, se lee el aviso entero.
    if (!p && details < MAX_DETAILS && Date.now() - a.create_datetime < 100 * DAY) {
      details++
      try { text = await body(a.article_id); p = period(text, a.create_datetime, ends) } catch { /* se omite este aviso */ }
    }
    if (!p || +p.end < from) continue
    // Recompensas: el resumen corta las tablas; para los vigentes sin ninguna en el resumen, el aviso entero.
    if (text === (a.summary ?? '') && details < MAX_DETAILS && !/purchas|top-?up/i.test(text) && !pullsIn('epic7', text.split('\n')).items.length) {
      details++
      try { text = await body(a.article_id) } catch { /* se queda el resumen */ }
    }
    const title = a.title.replace(/\s*\((?:Edited|Added on)[^)]*\)?\s*$/i, '').trim()
    const key = `${title.toLowerCase()}|${p.start.toISOString().slice(0, 10)}`
    if (seen.has(key)) continue
    seen.add(key)
    // Recompensas del aviso ("Covenant Bookmark x5", "300 Skystones"); 5 Covenant Bookmarks o 100 Skystones = 1 tirada (pulls.ts).
    // Sus tablas llegan aplanadas ("Reward Name Quantity … Covenant Bookmark 50"): se reescriben como "Covenant Bookmark x50". Los avisos de
    // recompensas por compras (Golden Scales: "points earned from purchasing") no se cuentan: no son tiradas gratis.
    const flat = text.replace(/\b(Covenant Bookmarks?|Skystones?)\s+(\d[\d,]*)\b/g, '$1 x$2')
    const table = tableRewards(text.split('\n'))
    const { pulls, items } = /purchas|top-?up/i.test(text) ? { pulls: 0, items: [] } : pullsIn('epic7', table.length ? table : flat.split(/\n|(?<=[.!])\s+/))
    out.push({
      id: `${gameId}:event:${a.article_id}`, gameId, kind: 'event', title,
      image: thumb(a),
      start: p.start.toISOString(), end: p.end.toISOString(), items, featured: [], pulls,
      description: summarize(text.split('\n'), { title, sections: false }),
      minor: p.dayOnly || undefined, // los eventos semanales de comentarios no traen hora: campañas menores
      precision: p.precision, official: true, source: 'api',
    })
  }
  return out
}

/**
 * Banners de héroes nuevos que bannerhistory aún no tiene (se actualiza cada semana): los avisos "Update Content" anuncian
 * "New 5★ Hero, <nombre>" seguido del periodo de su invocación.
 */
async function syncNewHeroes(gameId: string, list: Article[], ends: Map<string, string>, known: GameEvent[]): Promise<GameEvent[]> {
  const from = Date.now() - 3 * DAY
  const out: GameEvent[] = []
  for (const a of list.filter(x => /Update Content/i.test(x.title)).slice(0, 2)) {
    let lines: string[]
    try { lines = await bodyLines(a.article_id) } catch { continue }
    lines.forEach((line, i) => {
      const h = /New 5\s?★ Hero,\s*(.{3,80})$/.exec(line)
      if (!h) return
      const name = h[1].trim()
      const after = lines.slice(i + 1, i + 80)
      const p = period(after.filter(l => !l.startsWith('@@IMG ')).join('\n'), a.create_datetime, ends)
      if (!p || +p.end < from) return
      const nk = name.toLowerCase()
      const dup = [...known, ...out].some(b => b.kind === 'banner' && Math.abs(+new Date(b.start) - +p.start) <= 3 * DAY &&
        b.featured.some(f => { const fk = f.name.toLowerCase(); return fk.includes(nk) || nk.includes(fk) }))
      if (dup) return
      out.push({
        id: `${gameId}:banner:hero:${nk.replace(/[^a-z0-9]+/g, '-')}:${p.start.toISOString().slice(0, 10)}`, gameId, kind: 'banner', title: name,
        description: a.title, image: after.slice(0, 15).find(l => l.startsWith('@@IMG '))?.slice(6) ?? thumb(a),
        start: p.start.toISOString(), end: p.end.toISOString(), items: [], featured: [{ name }], pulls: 0,
        precision: p.precision, official: true, source: 'api',
      })
    })
  }
  return out
}

/**
 * Cupones oficiales de los avisos de STOVE (los resúmenes que ya se piden; ninguna consulta más): "Coupon Code: EPICWITHCZN Coupon Redemption
 * Period: 9/17 (Thu) after the maintenance - 10/29 (Thu) 02:59 UTC Rewards - Covenant Bookmark x 15 - Gold x 300,000". Solo los vigentes.
 * La lista de PocketGamer no se usa: mezcla cupones de un solo uso, de torneos y caducados sin fecha (revisado el 14 nov 2026).
 */
export function e7Coupons(list: Article[], now = Date.now()): PromoCode[] {
  const out: PromoCode[] = []
  for (const a of list) {
    const t = (a.summary ?? '').replace(/\s+/g, ' ')
    for (const m of t.matchAll(/Coupon Code\s*:\s*([A-Z0-9_!]{4,30})/gi)) {
      if (out.some(c => c.code === m[1])) continue
      const rest = t.slice(m.index! + m[0].length, m.index! + m[0].length + 400)
      const end = /[-–~]\s*(\d{1,2})\/(\d{1,2})\s*\([A-Za-z]{3}\)\s*(\d{1,2}:\d{2})\s*UTC/i.exec(rest)
      if (!end) continue
      const e = utc(nearYear(+end[1], +end[2], a.create_datetime), +end[1], +end[2], end[3])
      if (+e < now) continue
      const rewards = [...(/Rewards?\s*(.+?)(?:\s+\*|\s+Coupon|\s+Thank|$)/i.exec(rest)?.[1] ?? '').matchAll(/-\s*([A-Z][^-]*?x\s*[\d,]+)/g)].map(r => r[1].trim().replace(/\s*x\s*/, ' ×'))
      out.push({ code: m[1], rewards: [...rewards.slice(0, 6), `Until ${e.toUTCString().slice(5, 22)} UTC`] })
    }
  }
  return out
}

export async function syncEpic7(gameId: string): Promise<GameSync> {
  const [banners, events, maint] = await Promise.allSettled([syncBanners(gameId), articles(988, 100), articles(986, 100)])
  if (banners.status === 'rejected' && events.status === 'rejected') throw banners.reason
  const ends = maint.status === 'fulfilled' ? maintenanceEnds(maint.value) : new Map<string, string>()
  const base = banners.status === 'fulfilled' ? banners.value : []
  const parsed = events.status === 'fulfilled' ? await syncEvents(gameId, events.value, ends) : []
  const heroes = maint.status === 'fulfilled' ? await syncNewHeroes(gameId, maint.value, ends, base).catch(() => []) : []
  const codes = e7Coupons([...(events.status === 'fulfilled' ? events.value : []), ...(maint.status === 'fulfilled' ? maint.value : [])])
  return { events: [...base, ...heroes, ...parsed], patches: [], codes }
}
