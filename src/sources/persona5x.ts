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
 *  - **La web oficial (persona5x.com) NO se usa**: sus Términos (SEGA Mobile Application Terms of Use, "Services" incluye sus webs) prohíben
 *    acceder con "spiders, robots, crawlers, data mining tools". Allí salen además las reposiciones de mitad de versión («… Makes a Comeback»,
 *    19 nov 2026), que Steam no publica: solo llegarán si se sigue el Discord oficial (canal "persona5x" de DISCORD_CHANNELS).
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

export async function syncPersona5x(gameId: string, now = Date.now()): Promise<GameSync> {
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
    for (const e of r.events) if (!events.some(x => x.id === e.id) && Date.parse(e.end) > now - 3 * DAY) events.push(e)
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
  return { events, patches, codes: [] }
}
