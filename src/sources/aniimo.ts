import { viaProxy } from '../net'
import type { Featured, GameEvent, Kind, Patch, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { syncGame8Codes, syncPocketGamerCodes } from './codes'
import { pullsIn } from './pulls'
import { steamText } from './steam'

/**
 * Aniimo (Pawprint Studio / Kingsglory; global desde el 16 sep 2026). Fuentes (revisadas el 14 nov 2026):
 *  - **Avisos oficiales en Steam** (app 4126040, la misma API que src/sources/steam.ts): cada aviso de versión da cada evento con sus horas EXACTAS
 *    por región: «「Aniimo-Europe」2026/11/20 04:00 ~ 2026/12/10 03:59 (UTC+0)», «"Aniimo-Americas" After the version update ~ 2026/12/9 19:59 UTC-4».
 *    Tres servidores (Europe UTC+0, Americas UTC-4, Apac UTC+8). Casi todo cambia a la misma hora LOCAL de cada uno (04:00, el reinicio diario),
 *    pero la actualización de versión y el fin de temporada son a la vez en todo el mundo: por eso cada evento guarda las horas de las tres regiones
 *    (`servers`) en vez de calcular el desfase. También trae el sorteo de trajes "Lightweave" (el único gacha del juego: las criaturas no salen de
 *    banners) y la temporada (Companion Handbook), que va como versión.
 *  - **Game8** ("List of Events and Schedule", archives/622475): todos los eventos, también los que no salen en Steam, con su imagen y sus
 *    recompensas con icono. Solo trae el día ("11/6 ~ 11/19", sin año ni hora): lo que no está en Steam se marca "≈".
 *  - **Códigos**: Game8 (archives/619365) y, si falta alguno, PocketGamer.
 * Lightweave: su aviso no da la fecha de fin; cada traje ha durado de una versión a la siguiente (4 semanas: Forest of Butterfly Dreams del 30 sep
 * al 28 oct, Nightborn Allure desde el 29 oct), así que el fin se estima ("estimated"). Sin retrato de los trajes: ninguna fuente permitida
 * publica su imagen a tiempo (la lista de trajes de GameWith va atrasada); se deja dicho en docs/fuentes-y-proxy.md.
 * 1 consulta a Steam y 2 páginas de Game8 por ciclo (+ PocketGamer solo si Game8 falla).
 */
export const ANIIMO_STEAM_APP = 4126040
const STEAM = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${ANIIMO_STEAM_APP}&count=15&maxlength=0&format=json`
const G8 = 'https://game8.co/games/Aniimo/archives/622475'
const CLAN_IMG = 'https://clan.akamai.steamstatic.com/images'
const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Servidor en que van `start`/`end` (servers.ts, `base`). */
const BASE = 'na'
const REGION: Record<string, string> = { europe: 'eu', americas: 'na', apac: 'asia' }
/** Fechas de Game8 (solo el día): inicio al reinicio de América (04:00 UTC-4) y fin a las 23:59 UTC, el cierre de temporada. Son aproximadas. */
const G8_START_UTC = 8
/** Iconos de Game8 para lo que no trae su lista de eventos (la calculadora y los códigos). */
export const ANIIMO_ICONS = new Map<string, string>([
  ['glimmer', 'https://img.game8.co/4622704/d376c11890317af3680c75d5276f4e89.png/show'],
])

const clean = (s: string) => s.replace(/[\s ]+/g, ' ').trim()
const iso = (t: number) => new Date(t).toISOString()
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Clave para comparar nombres entre Steam y Game8 ("First Visit to the Whisperwake Isles" = "First Visit to Whisperwake Isles"). */
export const nameKey = (s: string) => s.toLowerCase().replace(/[‘’']/g, '').replace(/\bthe\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Nombres que Steam y Game8 traducen distinto (el aviso de temporada y el de la versión siguiente tampoco coinciden: "Prismana Photo" /
 * "Prismana Snapshots"). Se usa el de Game8, que es el del juego.
 */
const ALIAS: Record<string, string> = {
  'aniimo go': 'Aniimo Dash - Breezy Plains Cup',
  'aniimo dash': 'Aniimo Dash - Breezy Plains Cup',
  'prismana photo': 'Prismana Snapshots',
  'fantasy resonance': 'Resonance Fantasia',
  'tidal treasures': 'Tidal Path Rewards',
  'companion handbook update': 'Companion Handbook',
}
const CHALLENGE = /glamour star|holo-battle|egg heist|elite training/i
/** Secciones con fechas que no son eventos (mantenimiento, reajustes de personajes, compensaciones). */
const SKIP = /maintenance|adjustment|optimi[sz]ation|fix|schedule|reset|compensation/i
/** Pagos y avisos de servicio: se ocultan por defecto. */
const MINOR = /set off together|top-up|test rewards|polaris liason|boundless twining|quick leveling/i

interface Range { start: number; end: number; approx?: boolean }
type Regions = Record<string, Range>

/** "2026/11/20 04:00" o "2026/12/9 19:59" en la zona `off` → ms. */
function at(s: string, off: number): number | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(s.trim())
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - off * HOUR : null
}

/** Momento de una actualización nombrada ("After the November 26 version update"): mismo día, a la hora UTC de la última conocida. */
function namedUpdate(s: string, year: number, updateHourUtc: number): number | null {
  const m = /after the (\w+) (\d{1,2})(?:st|nd|rd|th)? version update/i.exec(s)
  const mo = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
  return mo < 0 ? null : Date.UTC(year, mo, +m![2], updateHourUtc)
}

/**
 * Línea de región: «「Aniimo-Europe」2026/10/28 22:00~2026/10/29 7:00 (UTC+0)», «"Aniimo-Americas" After the version update ~ 2026/12/9 19:59 UTC-4»,
 * «"Aniimo-Apac" 2026/11/12 14:00 ~ 19:00 UTC+8» (el fin solo con la hora es del mismo día). `update`: fin del mantenimiento de ese aviso.
 */
export function regionLine(line: string, update: number, updateHourUtc: number): { region: string; range: Range } | null {
  const m = /^[「"“]?Aniimo-(Europe|Americas|Apac)[」"”]?\s*(.+?)\s*~\s*(.+?)\s*\(?UTC\s*([+-]\d{1,2})\)?\s*$/i.exec(clean(line))
  if (!m) return null
  const off = +m[4]
  let approx = false
  let start = at(m[2], off)
  if (start == null && /version update/i.test(m[2])) {
    const named = namedUpdate(m[2], new Date(update).getUTCFullYear(), updateHourUtc)
    if (named != null) approx = true
    start = named ?? update
  }
  if (start == null) return null
  let end = at(m[3], off)
  const hm = /^(\d{1,2}):(\d{2})$/.exec(m[3].trim())
  if (end == null && hm) {
    const d = new Date(start + off * HOUR)
    end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hm[1], +hm[2]) - off * HOUR
  }
  if (end == null) return null
  if (new Date(end).getUTCMinutes() === 59) end += 59_000
  return end > start ? { region: REGION[m[1].toLowerCase()], range: { start, end, ...(approx ? { approx } : {}) } } : null
}

export interface SteamPost { title: string; date: number; contents: string }

/** BBCode de Steam → líneas. Los rótulos "\[Event Period]" se conservan como "【Event Period】" (steamText los tomaría por etiquetas). */
export function postLines(bb: string): string[] {
  // Los avisos van en una sola línea: un "[p][b]Prismana Snapshots[/b][/p]" solo en su párrafo es el título de un evento.
  const bold = bb.replace(/\[p[^\]]*\]\s*\[b\]([^[\]\n]{1,90}?)\[\/b\]\s*\[\/p\]/gi, '\n[b]$1[/b]\n')
  return steamText(bold.replace(/\\\[([^\]\n]{1,40})\]/g, '【$1】')).split('\n').map(clean).filter(Boolean)
}

/** Título de sección: línea entera en negrita (**…**) o entre comillas ("Night Parade", 「…」). */
function heading(line: string): string | null {
  const m = /^\*\*(.+)\*\*$/.exec(line) ?? /^["“「]([^"”」]{2,80})["”」]$/.exec(line)
  return m ? clean(m[1].replace(/^["“「]|["”」]$/g, '')) : null
}

interface Section { title: string; lines: string[] }
function sectionsOf(lines: string[]): Section[] {
  const out: Section[] = []
  for (const l of lines) {
    const h = heading(l)
    if (h) out.push({ title: h, lines: [] })
    else out[out.length - 1]?.lines.push(l)
  }
  return out
}

/** Rangos de una sección agrupados por fase: "Phase 1:" separa; sin fases, cada bloque de 3 líneas de región con el texto que lo sigue. */
interface Block { label?: string; regions: Regions; note: string[] }
function blocksOf(lines: string[], update: number, hourUtc: number): Block[] {
  const out: Block[] = []
  let cur: Block | null = null
  for (const l of lines) {
    const r = regionLine(l, update, hourUtc)
    if (r) {
      // Un bloque nuevo cuando la región se repite (el mismo evento con otra fase sin rótulo, como las de Vein Abundance).
      if (!cur || cur.regions[r.region]) { cur = { regions: {}, note: [] }; out.push(cur) }
      cur.regions[r.region] = r.range
      continue
    }
    const phase = /^phase (\d+):/i.exec(l)
    if (phase) { cur = { label: `Phase ${phase[1]}`, regions: {}, note: [] }; out.push(cur); continue }
    if (cur && Object.keys(cur.regions).length) cur.note.push(l)
  }
  return out.filter(b => Object.keys(b.regions).length)
}

const describe = (lines: string[]) => {
  const text = lines.filter(l => !/^【|^\\$|^※|^\d+\.\s/.test(l) && !/aniimo-(europe|americas|apac)/i.test(l)).join(' ')
  return text ? clean(text).slice(0, 320) : undefined
}

function event(gameId: string, kind: Kind, title: string, regions: Regions, extra: Partial<GameEvent> = {}): GameEvent {
  const main = regions[BASE] ?? Object.values(regions)[0]
  const servers = Object.fromEntries(Object.entries(regions).map(([k, r]) => [k, { start: iso(r.start), end: iso(r.end) }]))
  return {
    id: `${gameId}:${kind}:steam:${nameKey(title)}:${iso(main.start).slice(0, 10)}`, gameId, kind, title,
    start: iso(main.start), end: iso(main.end), items: [], featured: [], pulls: 0, source: 'api', official: true, servers,
    ...(Object.values(regions).some(r => r.approx) ? { precision: 'approx' as const } : {}), ...extra,
  }
}

/** Eventos, Lightweave y temporada de un aviso de Steam. */
export function aniimoPost(gameId: string, post: SteamPost): { events: GameEvent[]; patches: Patch[] } {
  const lines = postLines(post.contents)
  const posted = post.date * 1000
  // Fin del mantenimiento de la versión: el mismo instante en las tres regiones (07:00 UTC el 29 oct, 11:00 UTC el 12 nov).
  let update = posted
  const maint = sectionsOf(lines).find(s => /maintenance (schedule|time)/i.test(s.title))
  const ml = maint?.lines.map(l => regionLine(l, posted, 7)).find(Boolean)
  if (ml) update = ml.range.end
  const hourUtc = new Date(update).getUTCHours()
  const header = /\{STEAM_CLAN_IMAGE\}(\S+?\.(?:png|jpe?g|gif|webp))/i.exec(post.contents)?.[1]
  const image = header ? `${CLAN_IMG}${header}` : undefined

  const events: GameEvent[] = []
  const patches: Patch[] = []
  for (const s of sectionsOf(lines)) {
    // Lightweave: «After the version update, Pathfinders can go to "Lightweave" to obtain the new appearance set.»
    if (s.lines.some(l => /"lightweave"/i.test(l))) {
      if (update < posted - DAY) continue
      events.push({
        id: `${gameId}:banner:lightweave:${nameKey(s.title)}`, gameId, kind: 'banner', title: `Lightweave: ${s.title}`,
        description: describe(s.lines.filter(l => !/lightweave/i.test(l))), image,
        start: iso(update), end: iso(update + 28 * DAY), items: [], pulls: 0, source: 'api', official: true, precision: 'estimated',
        featured: [{ name: s.title, tag: 'Outfit' }],
        // Va de una versión a otra, y las versiones salen a la vez en las tres regiones: el mismo instante en todas.
        servers: Object.fromEntries(Object.values(REGION).map(r => [r, { start: iso(update), end: iso(update + 28 * DAY) }])),
      })
      continue
    }
    if (SKIP.test(s.title)) continue
    const blocks = blocksOf(s.lines, update, hourUtc)
    if (!blocks.length) continue
    // Temporada ("S1 Departure with the Wind: Part 2") → versión.
    const season = /^S(\d+)\s+(.+?)(?::\s*Part\s*(\d+))?$/i.exec(s.title)
    if (season) {
      const r = blocks[0].regions[BASE] ?? Object.values(blocks[0].regions)[0]
      patches.push({
        id: `${gameId}:patch:S${season[1]}${season[3] ? `.${season[3]}` : ''}`, gameId, version: `S${season[1]}${season[3] ? ` Part ${season[3]}` : ''}`,
        name: season[2], date: iso(r.start), end: iso(r.end), notes: describe(blocks[0].note) ?? '', source: 'api',
      })
      continue
    }
    const home = s.title.toLowerCase() === 'homeland' ? /new season "([^"]+)" begins/i.exec(s.lines.join(' '))?.[1] : undefined
    const title = home ? `${home} Home Event` : ALIAS[nameKey(s.title)] ?? s.title
    const kind: Kind = CHALLENGE.test(title) ? 'challenge' : 'event'
    const description = describe(s.lines)
    const phased = blocks.some(b => b.label)
    // Vein Abundance: un bloque general y después uno por región, cada uno con «Prismana Form "Royalby" appears in Wildwater Gorge / Sea of Flowers.»
    const sub = !phased && blocks.length > 1 && blocks.slice(1).every(b => /prismana form/i.test(b.note.join(' '))) ? blocks.slice(1) : null
    if (!phased && !sub && blocks.length > 1) {
      // Varias tandas del mismo evento sin rótulo de fase (las pistas de Aniimo Dash): un solo periodo, del primer inicio al último fin.
      const regions: Regions = {}
      for (const b of blocks) for (const [k, r] of Object.entries(b.regions)) {
        const cur = regions[k]
        regions[k] = !cur ? { ...r } : { start: Math.min(cur.start, r.start), end: Math.max(cur.end, r.end), ...(r.start < cur.start ? (r.approx ? { approx: true } : {}) : cur.approx ? { approx: true } : {}) }
      }
      blocks.splice(0, blocks.length, { regions, note: blocks[0].note })
    }
    if (sub) {
      for (const b of sub) {
        const note = b.note.join(' ')
        const where = /appears in ([^.]+)\.?/i.exec(note)?.[1]
        const who = [...note.matchAll(/Prismana Form "([^"]+)"/gi)].map(m => `Prismana ${m[1]}`)
        events.push(event(gameId, kind, where ? `${title}: ${where.replace(/\s*\/\s*/g, ' & ')}` : `${title}: ${who.length > 1 ? 'Prismana Carnival' : 'Phase'}`, b.regions, {
          description: clean(note).slice(0, 320) || description, featured: who.map(name => ({ name })),
        }))
      }
      continue
    }
    for (const b of phased ? blocks : blocks.slice(0, 1))
      events.push(event(gameId, kind, title, b.regions, { description, ...(MINOR.test(title) ? { minor: true } : {}) }))
  }
  return { events, patches }
}

/** Holo-Battle Interlink: "every Thursday 04:00 ~ the following Monday 03:59" (hora de cada servidor). La semana en curso y la siguiente. */
export function holoInterlink(gameId: string, now = Date.now()): GameEvent[] {
  const offs: Record<string, number> = { na: -4, eu: 0, asia: 8 }
  const weeks = [0, 1].map(k => {
    const regions: Regions = {}
    for (const [id, off] of Object.entries(offs)) {
      const local = new Date(now + off * HOUR)
      const back = (local.getUTCDay() - 4 + 7) % 7
      let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back, 4) - off * HOUR
      // Ya pasó el lunes 03:59 de esta tanda: la siguiente.
      if (now >= start + 4 * DAY) start += 7 * DAY
      start += k * 7 * DAY
      regions[id] = { start, end: start + 4 * DAY - 1000 }
    }
    return event(gameId, 'challenge', 'Holo-Battle Interlink', regions, { description: '⟦d.aniimoInterlink⟧', official: false })
  })
  return weeks.map(e => ({ ...e, id: e.id.replace(':steam:', ':cycle:'), ...(+new Date(e.start) > now ? { precision: 'estimated' as const } : {}) }))
}

/* ---------- Game8 ---------- */

export interface G8Row { title: string; start: number; end: number; image?: string; description?: string; items: RewardItem[]; featured: Featured[]; upcoming: boolean }

/** "11/6 ~ 11/19" (sin año): el año que deja la fecha más cerca de hoy. */
function g8Range(s: string, now: number): [number, number] | null {
  const m = /(\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})/.exec(s)
  if (!m) return null
  const year = (mo: number, d: number) => {
    const y = new Date(now).getUTCFullYear()
    return [y - 1, y, y + 1].reduce((a, b) => (Math.abs(Date.UTC(b, mo, d) - now) < Math.abs(Date.UTC(a, mo, d) - now) ? b : a))
  }
  const sy = year(+m[1] - 1, +m[2])
  const ey = +m[3] < +m[1] ? sy + 1 : sy
  return [Date.UTC(sy, +m[1] - 1, +m[2], G8_START_UTC), Date.UTC(ey, +m[3] - 1, +m[4], 23, 59, 59)]
}

const text = (el: Element | null | undefined) => clean(el?.textContent ?? '')
const imgOf = (el: Element | null | undefined) => {
  const img = el?.querySelector('img')
  return img?.getAttribute('data-src') || (img?.getAttribute('src')?.startsWith('http') ? img.getAttribute('src')! : undefined)
}

export function aniimoGame8(html: string, now = Date.now()): G8Row[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: G8Row[] = []
  let section = ''
  for (const el of doc.querySelectorAll('h2, h3, tr')) {
    if (el.tagName !== 'TR') { section = text(el); continue }
    if (!/ongoing|upcoming/i.test(section)) continue
    const cells = [...el.children].filter(c => c.tagName === 'TD')
    if (cells.length < 2) continue
    const r = g8Range(text(el), now)
    if (!r) continue
    const title = clean(text(cells[0]).replace(/\d{1,2}\/\d{1,2}\s*~\s*\d{1,2}\/\d{1,2}.*$/, ''))
    if (!title) continue
    const items: RewardItem[] = []
    const featured: Featured[] = []
    // Cada recompensa es un `.align` con su icono: «<img alt="Tumbler">Tumbler × 12» (con o sin enlace). Sin cifra es un Aniimo destacado
    // (los Prismana de Vein Abundance). Los enlaces del texto ("Track down the brand new Aniimo Hoptail!") no cuentan.
    for (const div of cells[1].querySelectorAll('.align')) {
      if (div.querySelector('.align') || !div.querySelector('img')) continue
      const t = text(div)
      const name = clean(t.replace(/×\s*[\d,]+.*$/, ''))
      if (!name) continue
      const icon = imgOf(div)
      const amount = /×\s*([\d,]+)/.exec(t)?.[1]
      if (amount) items.push({ name, icon, amount: Number(amount.replace(/,/g, '')) })
      else featured.push({ name, icon })
    }
    const lead = cells[1].innerHTML.split(/<hr|<div/i)[0]
    const description = clean(new DOMParser().parseFromString(`<!doctype html><html><body>${lead}</body></html>`, 'text/html').body?.textContent ?? '')
    out.push({ title, start: r[0], end: r[1], image: imgOf(cells[0]), items, featured, upcoming: /upcoming/i.test(section),
      description: description && !/event duration|rewards/i.test(description) ? description : undefined })
  }
  return out
}

const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))

/**
 * Une Steam (manda en nombres y horas) con Game8 (imagen y recompensas): misma clave de nombre y periodos que se solapan, o un nombre que
 * contiene al otro y comparten al menos el 60 % del más largo. Lo que solo tiene Game8 se añade con horas aproximadas ("≈").
 */
export function mergeAniimo(gameId: string, official: GameEvent[], rows: G8Row[], now = Date.now()): GameEvent[] {
  const events = official.map(e => ({ ...e }))
  const span = (e: GameEvent) => ({ start: +new Date(e.start), end: +new Date(e.end) })
  for (const g of rows) {
    const k = nameKey(g.title)
    let best = -1, bestO = 0
    events.forEach((e, i) => {
      if (e.kind === 'banner') return
      const ek = nameKey(e.title)
      const o = overlap(span(e), g)
      const longer = Math.max(span(e).end - span(e).start, g.end - g.start)
      const ok = ek === k ? o > 0 : (ek.includes(k) || k.includes(ek)) && o >= 0.6 * longer
      if (ok && o > bestO) { best = i; bestO = o }
    })
    if (best >= 0) {
      const e = events[best]
      events[best] = { ...e, image: e.image ?? g.image, description: e.description ?? g.description,
        items: e.items.length ? e.items : g.items, featured: g.featured.some(f => f.icon) ? g.featured : e.featured }
      continue
    }
    if (g.end < now - 3 * DAY) continue
    const kind: Kind = CHALLENGE.test(g.title) ? 'challenge' : 'event'
    events.push({
      id: `${gameId}:${kind}:g8:${k}:${iso(g.start).slice(0, 10)}`, gameId, kind, title: g.title, description: g.description, image: g.image,
      start: iso(g.start), end: iso(g.end), items: g.items, featured: g.featured, pulls: 0, source: 'api', precision: 'approx',
      ...(MINOR.test(g.title) ? { minor: true } : {}),
    })
  }
  // Tiradas: Glimmer (38 = 1 Lightweave Ticket) y billetes de las recompensas (pulls.ts).
  return events.map(e => (e.items.length ? { ...e, pulls: pullsIn('aniimo', e.items.map(i => `${i.name} x${i.amount}`)).pulls } : e))
}

async function get(url: string): Promise<string> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.text()
}

export async function syncAniimo(gameId: string, now = Date.now()): Promise<GameSync> {
  const [st, g8, c8] = await Promise.allSettled([get(STEAM), get(G8), syncGame8Codes('aniimo')])
  if (st.status === 'rejected' && g8.status === 'rejected') throw st.reason
  if (st.status === 'rejected') console.warn('[aniimo] steam:', (st.reason as Error)?.message)
  if (g8.status === 'rejected') console.warn('[aniimo] game8:', (g8.reason as Error)?.message)

  const posts: SteamPost[] = st.status === 'fulfilled'
    ? ((JSON.parse(st.value)?.appnews?.newsitems ?? []) as (SteamPost & { feedname: string })[])
      .filter(n => n.feedname === 'steam_community_announcements' && now - n.date * 1000 < 75 * DAY)
    : []
  // Del más reciente al más antiguo: si dos avisos traen el mismo evento (el de temporada y el de la versión siguiente), manda el último.
  posts.sort((a, b) => b.date - a.date)
  const byKey = new Map<string, GameEvent>()
  const patches = new Map<string, Patch>()
  for (const p of posts) {
    const r = aniimoPost(gameId, p)
    for (const e of r.events) {
      const k = `${e.kind}:${nameKey(e.title)}:${e.start.slice(0, 10)}`
      // Mismo evento con otro inicio ("after the version update" en un aviso y la hora en el otro): mismo nombre y mismo fin.
      const twin = [...byKey.values()].find(x => x.kind === e.kind && nameKey(x.title) === nameKey(e.title) && Math.abs(+new Date(x.end) - +new Date(e.end)) < HOUR)
      if (!byKey.has(k) && !twin) byKey.set(k, e)
    }
    for (const pt of r.patches) if (!patches.has(pt.id)) patches.set(pt.id, pt)
  }
  const official = [...byKey.values()].filter(e => +new Date(e.end) > now - 3 * DAY)
  // Lightweave: el traje siguiente cierra el anterior.
  const lw = official.filter(e => e.kind === 'banner').sort((a, b) => +new Date(a.start) - +new Date(b.start))
  lw.forEach((e, i) => {
    if (!lw[i + 1] || +new Date(lw[i + 1].start) >= +new Date(e.end)) return
    e.end = lw[i + 1].start
    delete e.precision
    for (const r of Object.values(e.servers ?? {})) r.end = e.end
  })

  const rows = g8.status === 'fulfilled' ? aniimoGame8(g8.value, now) : []
  const events = [...mergeAniimo(gameId, official, rows, now), ...holoInterlink(gameId, now)]

  // Temporada siguiente: empieza al acabar la actual (anunciada en los avisos como "the S2 season version update"), fecha estimada.
  const list = [...patches.values()].sort((a, b) => +new Date(a.date) - +new Date(b.date))
  const last = list[list.length - 1]
  const n = last && /^S(\d+)/.exec(last.version)
  if (last?.end && n && +new Date(last.end) > now) {
    list.push({ id: `${gameId}:patch:S${+n[1] + 1}`, gameId, version: `S${+n[1] + 1}`, date: iso(+new Date(last.end) + 1000), notes: '', source: 'api', estimated: true })
  }

  let codes = c8.status === 'fulfilled' ? c8.value : []
  if (!codes.length) codes = await syncPocketGamerCodes('aniimo').catch(err => { console.warn('[aniimo] códigos:', (err as Error)?.message); return [] })
  return { events, patches: list, codes }
}
