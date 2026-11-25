import { viaProxy } from '../net'
import type { Featured, GameEvent, Kind, Patch } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'
import { summarize } from './summary'

/**
 * Persona 5: The Phantom X (SEGA / Atlus; versión global, un solo servidor). Fuentes revisadas el 25 nov 2026:
 *  - **Avisos oficiales en Steam** (app 3061570, `ISteamNews`): uno por actualización, cada dos semanas (miércoles; 15 oct, 29 oct, 12 nov 2026).
 *    Cada apartado es «[h3][img]• Título[/h3]» con «Duration: Until Dec 10, 2026 at 1:59 AM (UTC)» (o «Season Duration», «Available Until»,
 *    «Claim by»); los subapartados «▽ Nombre» llevan su propio periodo. El inicio es el del aviso (sale al acabar el mantenimiento): "≈".
 *    - Banners: «5★ Fuuka Yamagishi comes to Most Wanted Phantom Idol Contracts!», «Most Wanted Phantom Idol Contracts for 5★ Phantom Thieves
 *      Gunslinger Shun and Tenebre Shoki!» → un banner por personaje, con la imagen del contrato de cada uno (las del título, en orden).
 *    - Eventos, login (con sus tiradas: «7 Platinum Tickets») y regalos; el Phantom Pass, la grúa de peluches y las campañas de pago, menores.
 *    - Versión: «Ver. 4.7 Update Information» o, sin número, la fecha del aviso.
 *    - Lo próximo: los avisos de presentación («New Phantom Idol Kumi Katayama», «… Teaser Trailer») de un personaje que aún no tiene banner
 *      → banner estimado desde la siguiente actualización (14 días tras la última), 4 semanas.
 *  - **Web oficial (persona5x.com), solo desde la tarea del PC** (OFFICIAL_SITES=1; decisión del dueño, 25 nov 2026, aunque sus Términos prohíben los
 *    robots: consulta pequeña). Da el fin real de cada mantenimiento (inicio exacto de todo, también de lo de Steam), las reposiciones de mitad de
 *    versión, los contratos de arma y el número de versión. Ver `syncOfficial` y "Persona 5: The Phantom X" en docs/fuentes-y-proxy.md.
 *  - Retratos: la lista de personajes de Prydwen (`/persona-5x/characters`, cartas `cdn.prydwen.gg/…/<slug>_card.webp`). Los nombres globales de
 *    las variantes («Wavecatcher Miyu») se buscan como «Miyu Sahara [Wavecatcher]»; si Prydwen la llama de otra forma, el retrato base del personaje.
 *  - Códigos: SIN fuente. El juego casi no publica (Game8 registra dos en 2026, sin el texto del código) y PocketGamer no tiene página.
 *  - Rotatorios (Gates of the Nightmare Catcher, Trials from the Sea of Souls, Velvet Trials): SIN calendario en ninguna fuente permitida (Game8 se
 *    quedó en marzo de 2026). Salen solo si un aviso los fecha; sus recompensas van como campos propios en el plan de tiradas.
 * 1 consulta a Steam (caché de 3 h) y 1 página de Prydwen (caché de 2 h, pausa de 10 s) por ciclo.
 */
export const P5X_STEAM_APP = 3061570
const STEAM = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${P5X_STEAM_APP}&count=20&maxlength=0&format=json`
const PRYDWEN = 'https://www.prydwen.gg/persona-5x/characters'
const CLAN_IMG = 'https://clan.akamai.steamstatic.com/images'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const CYCLE = 14 * DAY
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

interface Post { title: string; date: number; contents: string; feedname: string }

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[•・\s]+/, '').trim()
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const iso = (t: number) => new Date(t).toISOString()

/** "Dec 10, 2026 at 1:59 AM (UTC)" / "Nov 26, 2026" → ms (UTC; sin hora, las 00:00). */
export function p5xDate(s: string): number {
  const m = /([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?)?(?:\s*\(UTC([+-]\d{1,2})?\))?/.exec(s)
  const mo = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1
  if (!m || mo < 0) return NaN
  let h = m[4] ? +m[4] : 0
  if (m[6] === 'PM' && h < 12) h += 12
  if (m[6] === 'AM' && h === 12) h = 0
  const min = m[5] ? +m[5] : 0
  return Date.UTC(+m[3], mo, +m[2], h - (m[7] ? +m[7] : 0), min, min === 59 ? 59 : 0) + (min === 59 ? 999 : 0)
}

/** BBCode → texto por líneas, sin etiquetas. */
const text = (bb: string) => bb.replace(/\[img[^\]]*\][^[]*\[\/img\]/gi, '').replace(/\[\/?(?:p|h\d|b|i|u|list|\*|url[^\]]*)\]/gi, '\n')
  .replace(/\[[^\]]{1,20}\]/g, '').split('\n').map(clean).filter(Boolean)
const images = (bb: string) => [...bb.matchAll(/\[img src="([^"]+)"\]/gi)].map(m => m[1].replace('{STEAM_CLAN_IMAGE}', CLAN_IMG))

/** Periodo de una línea: "Duration: Until …", "Season Duration: Until …", "Available Until: Until …", "Claim by: …", "From … until/to …". */
function rangeOf(line: string, posted: number): { start: number; end: number } | null {
  if (!/^(?:(?:season |event )?duration|available until|claim by|period)\s*:/i.test(line)) return null
  if (/following the first login|after (?:clearing|reaching)/i.test(line)) return null // plazos personales, sin fin común
  const from = /\bfrom\s+([A-Z][a-z]{2,8}\.? \d{1,2},? \d{4}[^–~]*?)\s+(?:until|to|–|~)\s+(.+)$/i.exec(line)
  const end = p5xDate(from ? from[2] : line.replace(/^[^:]+:\s*(?:until\s+)?/i, ''))
  const start = from ? p5xDate(from[1]) : posted
  return isNaN(end) || isNaN(start) || end <= start ? null : { start, end }
}

/** "5★ Phantom Thieves Gunslinger Shun and Tenebre Shoki" / "5★ Fuuka Yamagishi comes to …" / "5★ Phantom Thief: Wavecatcher Miyu Makes a Comeback". */
function contractNames(title: string): string[] {
  const m = /5★\s*(?:Phantom Thie(?:f|ves)\s*:?\s*)?(.+?)(?:\s+(?:comes to|makes a comeback|joins?|arrives?)\b|!|$)/i.exec(title)
  return m ? m[1].split(/\s*,\s*|\s+and\s+|\s*&\s*/).map(clean).filter(n => n.length >= 2 && n.length <= 40) : []
}

const BANNER = /contracts?\b/i
const MINOR = /phantom pass|plush|crane game|double contract|package|\bpacks?\b|outfit|costume|sale\b/i
const CHALLENGE = /shadow hunt|nightmare catcher|sea of souls|velvet trials|gates of/i

/**
 * Apartados de un aviso: título, imágenes y líneas. Las imágenes van dentro del título («[h3][img]• …[/h3]») o sueltas al final del texto, y una
 * suelta tras un apartado que ya trae la suya es la del SIGUIENTE (comprobado el 25 nov 2026: tras «Most Wanted … Contracts», que lleva las de
 * Shun y Shoki, va el arte de «Unbridled Radiance», el apartado de después). Sin imagen propia ni heredada, la suelta del final es la suya.
 */
function sectionsOf(bb: string): { title: string; imgs: string[]; lines: string[] }[] {
  let carry: string[] = []
  return bb.split(/\[h3\]/i).slice(1).map(part => {
    const close = part.search(/\[\/h3\]/i)
    const h = close >= 0 ? part.slice(0, close) : part
    const body = close >= 0 ? part.slice(close + 5) : ''
    const head = images(h), tail = images(body)
    const own = carry.length ? carry : head.length ? head : tail
    carry = (carry.length || head.length) && tail.length ? tail : []
    return { title: clean(text(h).join(' ')), imgs: own, lines: text(body) }
  }).filter(s => s.title)
}

/** "distributing Repression Skip Ticket x200", "Glimmer Stamp ×3": las recompensas "Nombre xN" que `pullsIn` no toma por ir en mitad de una frase. */
function namedItems(lines: string[]): { name: string; amount: number }[] {
  const out: { name: string; amount: number }[] = []
  for (const l of lines) for (const m of l.matchAll(/((?:[A-Z][\w'’-]*\s+){0,4}[A-Z][\w'’-]*)\s*[x×]\s?(\d[\d,]*)\b/g)) {
    const name = m[1].trim(), amount = +m[2].replace(/,/g, '')
    if (amount > 0 && !out.some(o => o.name === name)) out.push({ name, amount })
  }
  return out
}

/** Eventos, banners y versión de un aviso. */
export function p5xPost(gameId: string, post: Post): { events: GameEvent[]; patch?: Patch } {
  const posted = post.date * 1000
  const out: GameEvent[] = []
  const sections = sectionsOf(post.contents)
  // Sin imagen propia (Shadow Hunt, New Bonds): la del primer apartado del aviso, el arte de la actualización.
  const cover = sections.find(s => s.imgs.length)?.imgs[0]
  for (const s of sections) {
    // Subapartados «▽ Nombre» con su periodo: un elemento cada uno; el resto, con el título del apartado.
    // "Phantom Pass Update" → "Phantom Pass"; "New Bonds" + «└ Shoki Ikenami» → "New Bonds: Shoki Ikenami".
    let name = s.title.replace(/^(?:event|new)\s*:\s*/i, '').replace(/[!！]+$/, '').replace(/\s+update$/i, '').trim()
    const who = /^new bonds?$/i.test(name) ? s.lines.map(l => /^[　\s]*[└┗]\s*(.+)$/.exec(l)?.[1]).filter(Boolean) : []
    if (who.length) name = `${name}: ${who.join(' / ')}`
    let block: string[] = []
    const items: { name: string; at: number; range: { start: number; end: number } }[] = []
    const lines = s.lines
    for (const [i, raw] of lines.entries()) {
      const l = raw.replace(/^[　\s]*/, '')
      const sub = /^▽\s*(.+)$/.exec(l)
      if (sub && !/^(?:new|content added)\s*:?$/i.test(sub[1])) { name = clean(sub[1]).replace(/[!！]+$/, ''); block = []; continue }
      block.push(l)
      const r = rangeOf(l.replace(/^[└┗]\s*/, ''), posted)
      if (r && !items.some(x => x.name === name)) items.push({ name, at: i, range: r })
    }
    for (const [k, it] of items.entries()) {
      const until = items[k + 1]?.at ?? lines.length
      const sec = lines.slice(it.at, until)
      if (BANNER.test(it.name) && !/double contract/i.test(it.name)) {
        const names = contractNames(it.name)
        names.forEach((who, j) => out.push({
          id: `${gameId}:banner:steam:${key(who)}:${iso(it.range.start).slice(0, 10)}`, gameId, kind: 'banner', title: who,
          description: /comeback|rerun/i.test(it.name) ? '⟦d.p5xRerun⟧' : '⟦d.p5xContract⟧', image: s.imgs[j] ?? s.imgs[0] ?? cover,
          start: iso(it.range.start), end: iso(it.range.end), items: [], featured: [{ name: who, rarity: 5 }], pulls: 0,
          source: 'api', official: true, precision: 'approx',
        }))
        if (names.length) continue
      }
      const kind: Kind = CHALLENGE.test(it.name) ? 'challenge' : 'event'
      const found = pullsIn('persona5x', sec)
      const rewards = [...found.items, ...namedItems(sec).filter(x => !found.items.some(i => key(i.name).includes(key(x.name)) || key(x.name).includes(key(i.name))))].slice(0, 10)
      const title = /^login bonus$/i.test(it.name) ? `Login Bonus (${new Date(posted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})` : it.name
      out.push({
        id: `${gameId}:${kind}:steam:${key(title)}:${iso(it.range.start).slice(0, 10)}`, gameId, kind, title,
        description: summarize(sec.filter(l => !rangeOf(l, posted)), { title }), image: s.imgs[0] ?? cover,
        start: iso(it.range.start), end: iso(it.range.end), items: rewards, pulls: found.pulls, featured: [],
        source: 'api', official: true, precision: it.range.start === posted ? 'approx' : undefined,
        // Pase, peluches, campañas de pago y regalos de meses (el del ASMR dura hasta junio de 2027): menores.
        ...(MINOR.test(it.name) || MINOR.test(s.title) || it.range.end - it.range.start > 60 * DAY ? { minor: true } : {}),
      })
    }
  }
  // Versión: cada aviso de actualización con periodos. "Ver. 4.7 Update Information" da el número; si no, la fecha.
  const ver = /\bVer\.?\s*(\d+\.\d+)/i.exec(post.title)?.[1]
  const patch: Patch | undefined = out.length ? {
    id: `${gameId}:patch:${iso(posted).slice(0, 10)}`, gameId, version: ver ?? new Date(posted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    name: ver ? undefined : clean(post.title.replace(/[（(].*?[)）]/g, '')).slice(0, 80), date: iso(posted), notes: '', source: 'api',
  } : undefined
  return { events: out, patch }
}

/** Retratos de Prydwen: "Miyu Sahara [Wavecatcher]" → carta. Índice por nombre completo, por "Variante Nombre" y por nombre de pila. */
export function p5xPortraits(html: string): (name: string) => string | undefined {
  const cards = new Map<string, string>()
  for (const m of html.matchAll(/<img alt="([^"]{2,60})"[^>]*?src="(https:\/\/cdn\.prydwen\.gg\/images\/persona-5x\/characters\/[a-z0-9-]+_card\.webp)"/g)) {
    const full = m[1].replace(/&amp;/g, '&')
    if (cards.has(key(full))) continue
    cards.set(key(full), m[2])
    const v = /^(.+?)\s*\[(.+)\]$/.exec(full)
    const first = (v ? v[1] : full).split(/\s+/)[0]
    if (v) cards.set(key(`${v[2]} ${first}`), m[2]) // "Wavecatcher Miyu"
    else if (!cards.has(`base:${key(first)}`)) cards.set(`base:${key(first)}`, m[2])
  }
  return (name: string) => {
    if (cards.get(key(name))) return cards.get(key(name))
    // "Tenebre Shoki" sin esa variante en Prydwen: la carta base del personaje (último nombre = el de pila en los nombres de variante).
    const words = name.split(/\s+/)
    return cards.get(`base:${key(words[words.length - 1])}`) ?? cards.get(`base:${key(words[0])}`)
  }
}

/** Presentaciones de un personaje nuevo: «New Phantom Idol Kumi Katayama», «Kumi Katayama (VA: Aya Endo) Teaser Trailer». */
function teased(posts: Post[]): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = []
  for (const p of posts) {
    const m = /^New (?:Phantom (?:Idol|Thief)|Character)\s*:?\s*(.+)$/i.exec(p.title) ?? /^(.+?)\s*\(VA:[^)]*\)\s*Teaser Trailer$/i.exec(p.title)
    const name = m && clean(m[1].replace(/[!！]+$/, ''))
    if (name && !out.some(o => key(o.name) === key(name))) out.push({ name, at: p.date * 1000 })
  }
  return out
}

/* ---------- Web oficial (persona5x.com): solo desde la tarea del PC (OFFICIAL_SITES=1 en el proxy) ---------- */
const SITE = 'https://persona5x.com'
interface News { day: string; category: string; text: string; link: string }
interface Notice { news: News; title: string; image?: string; lines: string[] }

/** La lista es casi JSON (comas finales): se lee objeto a objeto. */
export function p5xNewsList(txt: string): News[] {
  return [...txt.matchAll(/\{[^{}]*\}/g)].map(m => {
    const f = (k: string) => new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(m[0])?.[1]?.trim() ?? ''
    return { day: `${f('year')}-${f('month').padStart(2, '0')}-${f('day').padStart(2, '0')}`, category: f('category'), text: f('text').replace(/\s+/g, ' '), link: f('link') }
  }).filter(n => n.link && /^\d{4}-\d\d-\d\d$/.test(n.day))
}

/** Página de un aviso → título, primera imagen subida y líneas de texto. */
export function p5xNotice(news: News, html: string): Notice {
  const main = html.slice(Math.max(0, html.search(/class="newsDetail/i)))
  const img = /<img[^>]*src="(\/persona5x\.com\/upload_images\/[^"]+)"/i.exec(main)?.[1]
  const lines = main.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr|dt|dd)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#039;|&rsquo;/g, "'")
    .split('\n').map(l => l.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean)
  return { news, title: news.text.replace(/\s*\(Updated[^)]*\)+\s*$/i, '').trim(), image: img ? `${SITE}${img}` : undefined, lines }
}

/** "1:59 AM on Dec 10, 2026" / "2:30 AM on Nov 19" / "Nov 26, 2026 2:00 AM" / "Nov 12, 2026" (UTC) → ms; sin año, el de `year`. */
export function p5xWhen(s: string, year: number): { t: number; hour: boolean } | null {
  // El primer "Mes día" con un mes de verdad: "From 2:30 AM on Nov 19" también encaja en "From 2" (24 nov 2026: las reposiciones salían a las 00:00).
  const md = [...s.matchAll(/([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/g)].find(m => MONTHS.includes(m[1].slice(0, 3).toLowerCase()))
  const mo = md ? MONTHS.indexOf(md[1].slice(0, 3).toLowerCase()) : -1
  if (!md || mo < 0) return null
  const hm = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s)
  let h = hm ? +hm[1] % 12 : 0
  if (hm && /PM/i.test(hm[3])) h += 12
  const min = hm ? +hm[2] : 0
  return { t: Date.UTC(md[3] ? +md[3] : year, mo, +md[2], h, min, min === 59 ? 59 : 0) + (min === 59 ? 999 : 0), hour: !!hm }
}

/**
 * Fin real de cada mantenimiento, por día (UTC) de inicio: "Implementation period: From Nov 26, 2026 2:00 AM until 11:00 AM (UTC)", corregido por
 * las actualizaciones del mismo aviso ("Maintenance has ended ahead of schedule, and service resumed at 10:00 AM", "has been extended … until").
 * Los de emergencia no: no abren contenido. Y la versión que trae cada uno ("・Ver. 4.14 update").
 */
export function p5xMaintenance(notices: Notice[]): Map<string, { end: number; version?: string; planned: boolean }> {
  const out = new Map<string, { end: number; version?: string; planned: boolean }>()
  for (const n of notices) {
    if (!/maintenance/i.test(n.title) || /emergency/i.test(n.title)) continue
    const text = n.lines.join('\n')
    const period = /From\s+([A-Z][a-z]{2,8}\.? \d{1,2},? \d{4},?\s+\d{1,2}:\d{2}\s*[AP]M)\s+until\s+((?:[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4},?\s+)?\d{1,2}:\d{2}\s*[AP]M)\s*\(UTC\)/i.exec(text)
    if (!period) continue
    const a = p5xWhen(period[1], +n.news.day.slice(0, 4))
    if (!a) continue
    const day = iso(a.t).slice(0, 10)
    let end = p5xWhen(/[A-Z][a-z]{2,8}\.? \d/.test(period[2]) ? period[2] : `${period[1].replace(/,?\s+\d{1,2}:\d{2}\s*[AP]M$/i, '')} ${period[2]}`, +day.slice(0, 4))?.t ?? NaN
    if (end <= a.t) end += DAY
    let planned = true
    // "service resumed at 10:00 AM" / "maintenance has ended as of 3:15 PM" / "extended … until 12:00 PM": la hora real, el mismo día del mantenimiento.
    const real = /(?:resumed|ended|completed)\s+(?:at|as of)\s+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(text) ?? /extended[^.\n]{0,80}?until\s+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(text)
    if (real) {
      let t = p5xWhen(`${period[1].replace(/,?\s+\d{1,2}:\d{2}\s*[AP]M$/i, '')} ${real[1]}`, +day.slice(0, 4))?.t ?? NaN
      if (t <= a.t) t += DAY
      if (!isNaN(t)) { end = t; planned = false }
    }
    const version = /Ver\.?\s*(\d+\.\d+)\s+update/i.exec(text)?.[1]
    if (!isNaN(end) && !out.has(day)) out.set(day, { end, version, planned })
  }
  return out
}

/** Inicio del contenido de un aviso publicado el día `day`: el fin de su mantenimiento (ese día o el anterior, por la diferencia horaria). */
function maintOn(maint: Map<string, { end: number }>, t: number): number | undefined {
  for (const d of [0, -1, 1]) {
    const m = maint.get(iso(t + d * DAY).slice(0, 10))
    if (m) return m.end
  }
  return undefined
}

/**
 * Periodo de una línea "Duration: …" de la web oficial:
 *  "From 2:30 AM on Nov 19, 2026 until 1:59 AM on Dec 3, 2026 (UTC)" · "From the end of maintenance on Nov 12, 2026 until 1:59 AM on Dec 10 (UTC)" ·
 *  "After the Oct 29, 2026 maintenance ends until …" · "Until 1:59 AM on Dec 10, 2026 (UTC)" (empieza con el mantenimiento del día del aviso) ·
 *  "Every day from Oct 29, 2026 to Nov 2, at 1:00 AM (UTC)".
 */
export function p5xRange(line: string, noticeAt: number, maint: Map<string, { end: number }>): { start: number; end: number; exact: boolean } | null {
  const m = /^(?:[■・•]\s*)?(?:event\s+)?(?:duration|period|claim before|available until)\s*:\s*(.+)$/i.exec(line)
  if (!m) return null
  const body = m[1]
  const year = new Date(noticeAt).getUTCFullYear()
  const parts = /^(.*?)\s+(?:until|to)\s+(.+)$/i.exec(body.replace(/^until\s+/i, 'X until '))
  if (!parts) return null
  const endW = p5xWhen(parts[2], year)
  if (!endW) return null
  let start: number | undefined, exact = true
  const head = parts[1]
  if (/maintenance/i.test(head)) {
    const d = p5xWhen(head, year)
    start = d ? maintOn(maint, d.t) : undefined
    if (start === undefined) { start = d?.t ?? noticeAt; exact = false }
  } else {
    const d = head === 'X' ? null : p5xWhen(head.replace(/^every day from\s+/i, ''), year)
    if (d?.hour) start = d.t
    else {
      // Solo el día ("Every day from Oct 29", o nada): el fin del mantenimiento de ese día si lo hubo; si no, el día, "≈".
      const base = d?.t ?? noticeAt
      start = maintOn(maint, base)
      if (start === undefined) { start = base; exact = false }
    }
  }
  let end = endW.t
  if (end <= start && !/\d{4}/.test(parts[2])) end = Date.UTC(new Date(end).getUTCFullYear() + 1, new Date(end).getUTCMonth(), new Date(end).getUTCDate(), new Date(end).getUTCHours(), new Date(end).getUTCMinutes(), new Date(end).getUTCSeconds()) + (end % 1000)
  return end > start ? { start, end, exact } : null
}

/** Eventos, contratos y contratos de arma de un aviso de la categoría "events". */
export function p5xOfficialEvents(gameId: string, n: Notice, maint: Map<string, { end: number }>): GameEvent[] {
  const noticeAt = Date.parse(`${n.news.day}T00:00:00Z`)
  const out: GameEvent[] = []
  // Apartados "■Nombre" con su periodo; sin apartados, el título del aviso.
  let name = n.title.replace(/[!！]+$/, '').trim()
  const done = new Set<string>()
  for (const [i, raw] of n.lines.entries()) {
    const head = /^■\s*(.+)$/.exec(raw)
    // "■Phantom Pass Season Update" → "Phantom Pass" (como en Steam).
    if (head && !/^\d|details|notes|rewards?$/i.test(head[1])) { name = head[1].replace(/[!！]+$/, '').replace(/\s+(?:season\s+)?update$/i, '').trim(); continue }
    const r = p5xRange(raw, noticeAt, maint)
    if (!r || done.has(name)) continue
    done.add(name)
    const next = n.lines.findIndex((l, j) => j > i && /^■/.test(l))
    const sec = n.lines.slice(i, next > 0 ? next : n.lines.length)
    const base = { gameId, start: iso(r.start), end: iso(r.end), source: 'api' as const, official: true, ...(r.exact ? {} : { precision: 'approx' as const }) }
    if (/Most Wanted Phantom Idol Contracts?/i.test(n.title) && name === n.title.replace(/[!！]+$/, '').trim()) {
      const who = contractNames(n.title)
      const rerun = /comeback|rerun|return/i.test(n.title)
      for (const w of who) out.push({ ...base, id: `${gameId}:banner:p5x:${key(w)}:${iso(r.start).slice(0, 10)}`, kind: 'banner', title: w,
        description: rerun ? '⟦d.p5xRerun⟧' : '⟦d.p5xContract⟧', image: n.image, items: [], featured: [{ name: w, rarity: 5 }], pulls: 0 })
      // Contrato de arma (Arms Deal) con el arma exclusiva de 5★: "5★ Weapon: Mermaid Dreamer (Wavecatcher Miyu-exclusive)" / "5★ Spada della Vita (Tenebre Shoki-exclusive)".
      for (const l of n.lines) {
        const wm = /^5★\s*(?:Weapon:\s*)?(.+?)\s*\(([^)]+?)-exclusive\)/i.exec(l)
        if (!wm || !who.some(w => key(w) === key(wm[2]))) continue
        const id = `${gameId}:banner:p5x:arms:${key(wm[1])}:${iso(r.start).slice(0, 10)}`
        // Sin icono de armas en ninguna fuente: el arte del contrato (como los banners anunciados de BLEACH).
        if (!out.some(e => e.id === id)) out.push({ ...base, id, kind: 'banner', title: wm[1].trim(), description: `⟦d.weaponBanner⟧ · ${wm[2].trim()}`,
          image: n.image, items: [], featured: [{ name: wm[1].trim(), rarity: 5, tag: 'Arms Deal', icon: n.image }], pulls: 0 })
      }
      continue
    }
    const kind: Kind = CHALLENGE.test(name) ? 'challenge' : 'event'
    // Recompensas "Stardust Gem (x70)" / "Meta Jewels x 300" del apartado.
    const items = sec.flatMap(l => [...l.matchAll(/([A-Z][\w'’ -]{2,40}?)\s*\(?x\s?(\d[\d,]*)\)?/g)].map(m => ({ name: m[1].replace(/^[A-Z][a-z]{2} \d{1,2}:\s*/, '').trim(), amount: +m[2].replace(/,/g, '') })))
      // Nombres de objeto, no frases ("Cognitite for the obtained Phantom Thief"): hasta 4 palabras y sin "for/the/of the…" en medio.
      .filter((x, k, all) => x.amount > 0 && x.name.split(/\s+/).length <= 4 && !/\b(?:for|the|obtained|from|each|per)\b/i.test(x.name) && all.findIndex(y => y.name === x.name) === k).slice(0, 10)
    const pulls = pullsIn('persona5x', items.map(x => `${x.name} x${x.amount}`)).pulls
    const title = name.replace(/^Main Story Chapter \d+:\s*/i, '')
    out.push({ ...base, id: `${gameId}:${kind}:p5x:${key(title)}:${iso(r.start).slice(0, 10)}`, kind, title, image: n.image, items, pulls, featured: [],
      description: summarize(sec.slice(1), { title }), ...(MINOR.test(name) || r.end - r.start > 60 * DAY ? { minor: true } : {}) })
  }
  return out
}

/** Lo de la web oficial: avisos de eventos y de mantenimiento de las últimas 5 semanas (como mucho 18 páginas, caché de 24 h). */
async function syncOfficial(now: number): Promise<{ notices: Notice[]; maint: Map<string, { end: number; version?: string; planned: boolean }> }> {
  const year = new Date(now).getUTCFullYear()
  const res = await fetch(viaProxy(`${SITE}/news/data/news${year}.txt`))
  if (!res.ok) throw new Error(`persona5x.com → HTTP ${res.status}`)
  const list = p5xNewsList(await res.text())
  const want = list.filter(n => now - Date.parse(`${n.day}T00:00:00Z`) < 35 * DAY
    && (n.category === 'events' || (n.category === 'update' && /maintenance announcement|update information/i.test(n.text)))).slice(0, 18)
  const notices: Notice[] = []
  for (const n of want) {
    const r = await fetch(viaProxy(`${SITE}/news/details/${n.link}`)).catch(() => null)
    if (r?.ok) notices.push(p5xNotice(n, await r.text()))
  }
  return { notices, maint: p5xMaintenance(notices) }
}

export async function syncPersona5x(gameId: string, now = Date.now()): Promise<GameSync> {
  // La web oficial, si el proxy la permite (solo en el PC); si no, todo sale de Steam como antes.
  const off = await syncOfficial(now).catch(err => { console.warn('[persona5x] web oficial:', (err as Error)?.message); return null })
  const synced = await syncSteam(gameId, now, off?.maint)
  if (!off) return { events: synced.events, patches: synced.patches, codes: [] }
  const official = off.notices.filter(n => n.news.category === 'events').flatMap(n => p5xOfficialEvents(gameId, n, off.maint))
    .filter(e => Date.parse(e.end) > now - 3 * DAY)
  // Unión: lo oficial manda en fechas y nombres; de Steam se queda su arte si lo tiene (no carga imágenes de persona5x.com en cada visita) y lo que
  // la web no trae (Shadow Hunt, New Bonds…). Se emparejan por destacado (banners) o por nombre contenido en el otro.
  const events: GameEvent[] = []
  const used = new Set<GameEvent>()
  for (const o of official) {
    const twin = synced.events.find(s => !used.has(s) && s.kind === o.kind && (o.featured.length
      ? s.featured.some(f => o.featured.some(g => key(g.name) === key(f.name)))
      : key(s.title).includes(key(o.title)) || key(o.title).includes(key(s.title))) && Math.abs(Date.parse(s.end) - Date.parse(o.end)) <= DAY)
    if (twin) used.add(twin)
    events.push({ ...o, image: twin?.image ?? o.image, featured: o.featured.map(f => ({ ...f, icon: f.icon ?? twin?.featured.find(g => key(g.name) === key(f.name))?.icon })),
      items: o.items.length ? o.items : twin?.items ?? [], pulls: o.pulls || twin?.pulls || 0, description: o.description ?? twin?.description, minor: o.minor ?? twin?.minor })
  }
  events.push(...synced.events.filter(e => !used.has(e)))
  // Retratos para los que solo da la web (reposiciones).
  const portrait = synced.portrait
  for (const e of events) e.featured = e.featured.map(f => ({ ...f, icon: f.icon ?? portrait(f.name) }))
  // Versiones con su número ("Ver. 4.13 Update Information", "・Ver. 4.14 update" del aviso de mantenimiento) a la hora real del fin del mantenimiento.
  const patches: Patch[] = []
  for (const [day, m] of [...off.maint].sort((a, b) => a[1].end - b[1].end)) {
    const ver = m.version ?? off.notices.map(n => new RegExp(`^${new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}:\\s*Ver\\.?\\s*(\\d+\\.\\d+)`, 'i').exec(n.title)?.[1]).find(Boolean)
    if (ver) patches.push({ id: `${gameId}:patch:${day}`, gameId, version: ver, date: iso(m.end), notes: '', source: 'api' })
  }
  const known = patches.map(p => Date.parse(p.date))
  const merged = [...patches, ...synced.patches.filter(p => !known.some(t => Math.abs(t - Date.parse(p.date)) < 2 * DAY) && !(p.estimated && known.some(t => t > now)))]
  return { events, patches: merged, codes: [], pcOnly: true }
}

async function syncSteam(gameId: string, now: number, maint?: Map<string, { end: number }>): Promise<GameSync & { portrait: (name: string) => string | undefined }> {
  const [st, pr] = await Promise.allSettled([
    fetch(viaProxy(STEAM)).then(r => (r.ok ? r.json() : Promise.reject(new Error(`steam P5X → HTTP ${r.status}`)))),
    fetch(viaProxy(PRYDWEN)).then(r => (r.ok ? r.text() : Promise.reject(new Error(`prydwen P5X → HTTP ${r.status}`)))),
  ])
  if (st.status === 'rejected') throw st.reason
  if (pr.status === 'rejected') console.warn('[persona5x] retratos:', (pr.reason as Error)?.message)
  const portrait = pr.status === 'fulfilled' ? p5xPortraits(pr.value) : () => undefined

  const posts = ((st.value?.appnews?.newsitems ?? []) as Post[])
    .filter(p => p.feedname === 'steam_community_announcements' && now - p.date * 1000 < 90 * DAY)
    .sort((a, b) => b.date - a.date)
  const events: GameEvent[] = []
  const patches: Patch[] = []
  for (const p of posts) {
    const r = p5xPost(gameId, p)
    // Con la web oficial (solo en el PC): lo que empezaba "≈ a la hora del aviso" empieza al acabar el mantenimiento de ese día, exacto.
    const posted = p.date * 1000
    const mEnd = maint ? maintOn(maint, posted) : undefined
    const at = mEnd !== undefined && mEnd <= posted + HOUR && posted - mEnd < DAY ? mEnd : undefined
    for (const e of r.events) {
      if (at !== undefined && Date.parse(e.start) === posted) { e.start = iso(at); delete e.precision }
      if (!events.some(x => x.id === e.id) && Date.parse(e.end) > now - 3 * DAY) events.push(e)
    }
    if (r.patch && at !== undefined) r.patch.date = iso(at)
    if (r.patch && !patches.some(x => x.date.slice(0, 10) === r.patch!.date.slice(0, 10))) patches.push(r.patch)
  }
  // Lo próximo: personaje presentado sin banner todavía → estimado desde la siguiente actualización (14 días después de la última), 4 semanas.
  const last = patches.map(p => Date.parse(p.date)).sort((a, b) => b - a)[0]
  if (last) {
    let next = last + CYCLE
    while (next < now - DAY) next += CYCLE
    for (const t of teased(posts)) {
      if (t.at < last - 7 * DAY || events.some(e => e.kind === 'banner' && e.featured.some(f => key(f.name) === key(t.name)))) continue
      events.push({
        id: `${gameId}:banner:steam:teased:${key(t.name)}`, gameId, kind: 'banner', title: t.name, description: '⟦d.p5xTeased⟧',
        start: iso(next), end: iso(next + 28 * DAY - 60_000), items: [], featured: [{ name: t.name, rarity: 5 }], pulls: 0, source: 'api', precision: 'estimated',
      })
    }
  }
  // Siguiente actualización estimada (cada dos semanas), como en Horizon Walker; `finalize` (index.ts) cierra cada versión con la siguiente.
  if (last) {
    // Como mucho al acabar los contratos en curso (alignPatches de index.ts no deja empezar una versión antes): con la fecha ya en su sitio, la
    // etiqueta ("Dec 10") coincide; antes salía "Nov 26" movida al 10 dic. La actualización de mitad de contrato sí llega en su aviso de Steam.
    const bannersEnd = Math.max(0, ...events.filter(e => e.kind === 'banner' && e.precision !== 'estimated').map(e => Date.parse(e.end)))
    let t = last + CYCLE
    while (t < now || t < bannersEnd - DAY) t += CYCLE
    patches.push({ id: `${gameId}:patch:${iso(t).slice(0, 10)}`, gameId, version: new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      date: iso(t), notes: '', source: 'api', estimated: true })
  }
  for (const e of events) e.featured = e.featured.map((f): Featured => ({ ...f, icon: f.icon ?? portrait(f.name) }))
  if (!events.length) throw new Error('P5X: sin eventos vigentes en los avisos de Steam')
  return { events, patches, codes: [], portrait }
}
