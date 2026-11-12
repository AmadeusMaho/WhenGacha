import { viaProxy } from '../net'
import { withGrayRavens } from './grayravens'
import type { GameEvent, Patch, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { pullsIn, segments } from './pulls'

/**
 * Eventos de Wuthering Waves desde las notas de parche oficiales de Kuro Games.
 *
 * La web oficial (wutheringwaves.kurogames.com/en/main/news) lee sus noticias de JSON estáticos en su CDN:
 *  - `ArticleMenu.json`: lista de artículos (id, título, `startTime` de publicación en UTC+8), ~26 KB.
 *  - `article/<id>.json`: el artículo con `articleContent` en HTML.
 * Términos de Kuro (sdk-global.kurogames.com, revisados el 6 nov 2026): cubren las webs pero no prohíben bots ni scraping;
 * robots.txt de la web: `User-agent: *` sin `Disallow`; el del CDN no existe (404).
 *
 * Cada versión tiene un aviso "Patch Notes for Wuthering Waves Version X.Y" con la sección de eventos:
 *   [Echo Erase] Leisure Event
 *   ✦Duration: 2026-10-22 10:00 - 2026-11-09 03:59 (server time)
 * "server time" = hora local de cada servidor; se usa la de América (UTC-5), como con Reverie y Prydwen.
 * "Version 3.7 Update" = fin del mantenimiento, que el mismo aviso da en UTC+8 ("Maintenance Time: … 04:00 - … 11:00 (UTC+8)").
 * Los avisos no traen arte por evento: se usa la imagen de cabecera del aviso (index.ts la sustituye por la de Reverie si coincide).
 */
const CDN = 'https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const AMERICA = -5
const ASIA = 8

interface MenuItem { articleId: number; articleTitle: string; startTime: string }

/** "2026-10-22 10:00" en la zona `offset` → ms UTC. */
function at(s: string, offset: number): number {
  const m = /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - offset, +m[5]) : NaN
}

/** HTML del artículo → líneas de texto. */
function lines(html: string): string[] {
  // Documento completo: linkedom (Node) deja `body` vacío si solo recibe `<body>…`.
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h\d)>/gi, '$&\n')}</body></html>`, 'text/html')
  return (doc.body.textContent ?? '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** "[Special Events] [Cubie Wars] Leisure Event" → "Cubie Wars"; null si la línea no es la cabecera de un evento. */
function eventName(line: string): string | null {
  // "[Log in for 1 day in total]: Radiant Tide x5" es una línea de recompensas, no la cabecera de un evento.
  if (!line.startsWith('[') || /^\[[^\]]+\]\s*:/.test(line)) return null
  const names = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim())
  return names.length ? names[names.length - 1] : null
}

export async function syncKuro(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${CDN}/ArticleMenu.json`))
  if (!res.ok) throw new Error(`kuro ArticleMenu → HTTP ${res.status}`)
  const menu = (await res.json()) as MenuItem[]
  if (!Array.isArray(menu)) throw new Error('kuro: lista inesperada')
  const now = Date.now()
  // La nota de parche publicada más reciente (la de la versión en curso).
  const notes = menu
    .filter(a => /^Patch Notes for (?:Wuthering Waves )?Version/i.test(a.articleTitle) && at(a.startTime, ASIA) <= now + DAY)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))[0]
  if (!notes) throw new Error('kuro: sin notas de parche')

  const art = await fetch(viaProxy(`${CDN}/article/${notes.articleId}.json`))
  if (!art.ok) throw new Error(`kuro article ${notes.articleId} → HTTP ${art.status}`)
  const json = (await art.json()) as { articleContent?: string }
  const html = json.articleContent ?? ''
  const cover = /<img[^>]+src="([^"]+)"/.exec(html)?.[1]
  const text = lines(html)

  // Fin del mantenimiento de la versión = inicio de "Version X.Y Update".
  const maint = text.map(l => /Maintenance Time:.*?-\s*(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})\s*\(UTC([+-]\d+)\)/i.exec(l)).find(Boolean)
  const versionStart = maint ? at(maint[1], +maint[2]) : NaN

  const from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  const seen = new Set<string>()
  let current: string | null = null, currentAt = -1
  const titles: number[] = [], marks: { ev: GameEvent; title: number; dur: number }[] = []
  for (let i = 0; i < text.length; i++) {
    const l = text[i]
    const name = eventName(l)
    if (name) { current = name; currentAt = i; titles.push(i); continue }
    const d = /^✦?\s*Duration\s*(?::|✦)\s*(.+?)\s*-\s*(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})\s*\((server time|UTC([+-]\d+))\)/i.exec(l)
    if (!d || !current) continue
    const offset = d[4] ? +d[4] : AMERICA
    const start = /Version [\d.]+ Update/i.test(d[1]) ? versionStart : at(d[1], offset)
    // Los cierres "03:59" son hasta el final de ese minuto (03:59:59).
    const end = at(d[2], offset) + 59_000
    const title = current
    current = null
    if (isNaN(start) || isNaN(end) || end <= start || end < from || start > to || end - start > 150 * DAY) continue
    const id = `${gameId}:event:kuro:${title}:${new Date(start).toISOString().slice(0, 10)}`
    if (seen.has(id)) continue
    seen.add(id)
    const ev: GameEvent = {
      id, gameId, kind: 'event', title,
      image: cover,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: [], pulls: 0, official: true, source: 'api',
      // Los eventos web (fuera del juego) van como menores.
      minor: d[4] ? true : undefined,
    }
    out.push(ev)
    marks.push({ ev, title: currentAt, dur: i })
  }
  // Tiradas: recompensas listadas bajo cada evento ("[Log in for 1 day in total]: Radiant Tide x5, …").
  segments(text.length, titles, marks).forEach(([a, b], k) => {
    const { pulls, items } = pullsIn('wuwa', text.slice(a, b))
    marks[k].ev.pulls = pulls
    marks[k].ev.items = items
  })
  // Pase de batalla (Pioneer Podcast): toda la versión, del fin del mantenimiento al inicio del de la siguiente. El inicio de ese mantenimiento
  // sale de su "Update Maintenance Notice" si ya existe; si no, del día del "Version Preview … Scheduled for Release on November 12th (UTC+8)"
  // a las 04:00 (UTC+8), la hora habitual, marcado "≈".
  const next = menu.find(a => at(a.startTime, ASIA) > at(notes.startTime, ASIA) && /Version Preview .*Scheduled for Release on ([A-Z][a-z]+) (\d{1,2})/i.test(a.articleTitle))
  if (next && !isNaN(versionStart)) {
    const nm = /Version ([\d.]+)/.exec(next.articleTitle)?.[1]
    const notice = nm ? menu.find(a => a.articleTitle.includes(`Version ${nm} Update Maintenance Notice`)) : undefined
    let end = NaN, approx = true
    if (notice) {
      const r = await fetch(viaProxy(`${CDN}/article/${notice.articleId}.json`)).catch(() => null)
      const mt = r?.ok ? /(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})\s*-\s*\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*\(UTC([+-]\d+)\)/.exec(lines(((await r.json()) as { articleContent?: string }).articleContent ?? '').join(' ')) : null
      if (mt) { end = at(mt[1], +mt[2]); approx = false }
    }
    if (isNaN(end)) {
      const rd = /Release on ([A-Z][a-z]+) (\d{1,2})/i.exec(next.articleTitle)!
      const mo = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(rd[1].toLowerCase())
      const y = +next.startTime.slice(0, 4) + (mo < +next.startTime.slice(5, 7) - 1 ? 1 : 0)
      if (mo >= 0) end = Date.UTC(y, mo, +rd[2], 4 - ASIA, 0)
    }
    if (end > versionStart && end > from) {
      out.push({
        id: `${gameId}:event:kuro:Pioneer Podcast:${new Date(versionStart).toISOString().slice(0, 10)}`, gameId, kind: 'event', title: 'Pioneer Podcast',
        description: 'Battle pass', image: cover,
        start: new Date(versionStart).toISOString(), end: new Date(end - 1000).toISOString(),
        items: [], featured: [], pulls: 0, official: true, source: 'api', precision: approx ? 'approx' : undefined,
      })
    }
  }
  if (!out.length) throw new Error(`kuro: sin eventos vigentes en ${notes.articleId}`)
  return { events: out, patches: [], codes: [] }
}

/* ---------- Desafíos recurrentes de WuWa (sin fuente publicada: se calculan por su ciclo fijo) ---------- */

/**
 * Ni las notas de parche ni Reverie dan el calendario de los desafíos; el juego los reinicia con un ciclo fijo de 28 días
 * el lunes a las 04:00 hora del servidor (América = 09:00 UTC). Anclas comprobadas con gachafocus el 6 nov 2026:
 * Tower of Adversity 12 oct → 9 nov 08:59Z y Whimpering Wastes 26 oct → 23 nov 08:59Z (14 días de desfase).
 * Se muestran el ciclo en curso y el siguiente (este marcado "estimated"). Por seguridad solo se proyecta hasta `validUntil`:
 * si Kuro cambia el ciclo, los desafíos dejan de aparecer en vez de salir mal. Al confirmar un ciclo nuevo, mover el ancla y la fecha.
 */
const CYCLES: { title: string; anchor: string; days: number; validUntil: string }[] = [
  { title: 'Tower of Adversity', anchor: '2026-10-12T09:00:00Z', days: 28, validUntil: '2027-05-01T00:00:00Z' },
  { title: 'Whimpering Wastes', anchor: '2026-10-26T09:00:00Z', days: 28, validUntil: '2027-05-01T00:00:00Z' },
]

/* ---------- Recompensas de los desafíos (wiki de Fandom) ---------- */

/**
 * La wiki de WuWa (Fandom, API de MediaWiki; robots.txt lo permite) tiene la tabla completa de recompensas de cada desafío:
 *  - "Tower of Adversity" y "Whimpering Wastes": sección "==Rewards==" con un `{{Card List|delim=;|Astrite*100;Shell Credit*30,000}}` por objetivo.
 *    Se suman todas: es lo máximo que da un ciclo.
 *  - "Endstate Matrix/<fecha del ciclo>": `{{Event Rewards|Astrite=400|…}}` en "==Total Rewards==" (todo el ciclo, varias versiones), el nombre del
 *    ciclo (`|name = Endstate Matrix: Adversity Vanguard`) y sus versiones ("spanning over Versions [[3.5]], [[3.6]], [[3.7]] and [[3.8]]").
 * 4 consultas por sincronización de WuWa (el proxy las cachea 12 h). Si fallan, los desafíos salen igual, sin recompensas.
 */
const WUWA_WIKI = 'https://wutheringwaves.fandom.com/api.php'
const numW = (s: string) => Number(s.replace(/,/g, ''))

async function wikiJson(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(viaProxy(`${WUWA_WIKI}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`))
  if (!res.ok) throw new Error(`wuwa wiki → HTTP ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}
const wikitext = (page: string) => wikiJson({ action: 'parse', page, prop: 'wikitext' })
  .then(j => ((j.parse as { wikitext?: Record<string, string> } | undefined)?.wikitext?.['*'] ?? ''))

/** Suma "Nombre*cantidad" de todos los Card List y los "Nombre=cantidad" de Event Rewards → mapa de totales. */
function sumRewards(text: string): Map<string, number> {
  const tot = new Map<string, number>()
  const add = (name: string, qty: string) => { const n = name.trim(); const q = numW(qty.trim()); if (n && q > 0) tot.set(n, (tot.get(n) ?? 0) + q) }
  for (const m of text.matchAll(/\{\{\s*Card List\s*\|([^}]*)\}\}/gi))
    for (const part of m[1].split('|').filter(p => !/^\s*\w+\s*=/.test(p)).join('|').split(';')) { const [n, q] = part.split('*'); if (q) add(n, q) }
  for (const m of text.matchAll(/\{\{\s*Event Rewards\s*\|([^}]*)\}\}/gi))
    for (const part of m[1].split('|')) { const [n, q] = part.split('='); if (q && /^[\d,\s]+$/.test(q) && n.trim() !== 'sort') add(n, q) }
  return tot
}

/** Recompensas + tiradas (Astrite/160, Tides = 1) con el mismo criterio que los eventos. */
function rewardsOf(tot: Map<string, number>): { items: RewardItem[]; pulls: number } {
  // Tiradas con `pullsIn`; la lista, tal cual la da la wiki (Astrite primero), para no partir nombres como "Past the Endstate: Adversity Vanguard".
  const items = [...tot].sort((a, b) => Number(b[0] === 'Astrite') - Number(a[0] === 'Astrite')).map(([name, amount]) => ({ name, amount }))
  return { items: items.slice(0, 12), pulls: pullsIn('wuwa', items.map(i => `${i.name} x${i.amount}`)).pulls }
}

/** Sección de nivel 2 "==Rewards==" hasta el siguiente título del mismo nivel. */
const section = (text: string, title: RegExp) => {
  const at = text.search(title)
  if (at < 0) return ''
  const rest = text.slice(at + 2)
  const next = rest.search(/\n==[^=]/)
  return next < 0 ? rest : rest.slice(0, next)
}

export interface WuwaRewards { tower?: Rewards; wastes?: Rewards; matrix?: Rewards & { name: string; versions: string[] } }
type Rewards = { items: RewardItem[]; pulls: number }

/**
 * Solo lo que se reinicia cada ciclo: de la sección de recompensas, los apartados `===…===` cuyo título cumple `which`, sin sus tablas "Total …"
 * (la wiki repite ahí la suma). Tower of Adversity: "Hazard Zone" ("Hazard Zone rewards refresh each cycle"; Stable/Experimental/Overdrive son permanentes,
 * se cobran una vez). Whimpering Wastes: "Respawning Waters: Chasm" y "…: Torrents" (Forbidden Waters es permanente).
 */
function cyclic(text: string, which: RegExp): Map<string, number> {
  const rewards = section(text, /==\s*Rewards\s*==/i)
  const tot = new Map<string, number>()
  for (const m of rewards.matchAll(/===\s*([^=\n]+?)\s*===([\s\S]*?)(?=\n===[^=]|$)/g)) {
    if (!which.test(m[1])) continue
    // Corta en el título de la tabla de totales ("Total Cyclic Rewards"), no en filas como "Obtain a total of 1,600 points" (sensible a mayúsculas; las filas empiezan por "|").
    const body = m[2].split(/\n(?![|!{])[^\n]*\bTotal [A-Z]/)[0]
    for (const [n, q] of sumRewards(body)) tot.set(n, (tot.get(n) ?? 0) + q)
  }
  return tot
}

export async function wuwaChallengeRewards(): Promise<WuwaRewards> {
  const [tower, wastes, matrix] = await Promise.allSettled([
    wikitext('Tower of Adversity').then(t => rewardsOf(cyclic(t, /^Hazard Zone$/i))),
    wikitext('Whimpering Wastes').then(t => rewardsOf(cyclic(t, /^Respawning Waters/i))),
    (async () => {
      const list = await wikiJson({ action: 'query', list: 'allpages', apprefix: 'Endstate Matrix/2', aplimit: '50' })
      const pages = ((list.query as { allpages?: { title: string }[] } | undefined)?.allpages ?? []).map(p => p.title).filter(t => /\/\d{4}-\d\d-\d\d$/.test(t)).sort()
      const last = pages[pages.length - 1]
      if (!last) throw new Error('sin ciclos de Endstate Matrix')
      const t = await wikitext(last)
      const name = /\|\s*name\s*=\s*([^\n|]+)/.exec(t)?.[1]?.trim() ?? 'Endstate Matrix'
      // "…spanning over [[Version]]s [[3.5]], [[3.6]], [[3.7]] and [[3.8]]." (hasta el final de la línea: los números llevan punto).
      const span = /spanning over[^\n]*/i.exec(t)?.[0] ?? ''
      const versions = [...span.matchAll(/\[\[(\d+\.\d+)\]\]/g)].map(m => m[1])
      return { name, versions, ...rewardsOf(sumRewards(section(t, /==\s*Total Rewards\s*==/i))) }
    })(),
  ])
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : undefined)
  for (const r of [tower, wastes, matrix]) if (r.status === 'rejected') console.warn('[wuwa] recompensas de desafíos:', (r.reason as Error)?.message ?? r.reason)
  return { tower: ok(tower), wastes: ok(wastes), matrix: ok(matrix) }
}

/**
 * Endstate Matrix: cada fase dura una versión (se reinicia con la actualización) y un ciclo abarca varias versiones (3.5–3.8 = "Adversity Vanguard").
 * Se muestra la fase en curso y la siguiente, con las fechas de versión que ya calcula la app (`patches`). Las recompensas de la wiki son del ciclo entero:
 * se listan completas y las tiradas se reparten a partes iguales entre sus fases (aprox.), para no contarlas varias veces.
 * Requisito del juego: 24 crestas en Tower of Adversity y 3.500 puntos en Whimpering Wastes.
 */
export function wuwaMatrix(gameId: string, patches: Patch[], info: WuwaRewards['matrix'], now = Date.now()): GameEvent[] {
  const out: GameEvent[] = []
  const live = patches.filter(p => p.end && +new Date(p.end) > now - 3 * DAY).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)
  for (const p of live) {
    const inCycle = !!info && info.versions.includes(p.version)
    const phase = inCycle ? info.versions.indexOf(p.version) + 1 : 0
    const start = +new Date(p.date), end = +new Date(p.end!) - 1000
    out.push({
      id: `${gameId}:challenge:Endstate Matrix:${p.version}`, gameId, kind: 'challenge',
      title: inCycle ? info.name : 'Endstate Matrix',
      description: inCycle ? `⟦d.matrixPhase|${phase}/${info.versions.length}⟧` : undefined,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: inCycle ? info.items : [], featured: [],
      pulls: inCycle ? Math.round((info.pulls / info.versions.length) * 10) / 10 : 0,
      source: 'api', precision: p.estimated || start > now ? 'estimated' : 'approx',
    })
  }
  return out
}

export function wuwaChallenges(gameId: string, now = Date.now(), rewards: WuwaRewards = {}): GameEvent[] {
  const out: GameEvent[] = []
  for (const c of CYCLES) {
    const r = c.title === 'Tower of Adversity' ? rewards.tower : rewards.wastes
    const anchor = +new Date(c.anchor), len = c.days * DAY, limit = +new Date(c.validUntil)
    const k = Math.floor((now - anchor) / len)
    for (const n of [k, k + 1]) {
      const start = anchor + n * len, end = start + len - 1000
      if (start > limit || end < now - 3 * DAY) continue
      out.push({
        id: `${gameId}:challenge:${c.title}:${new Date(start).toISOString().slice(0, 10)}`,
        gameId, kind: 'challenge', title: c.title,
        start: new Date(start).toISOString(), end: new Date(end).toISOString(),
        items: r?.items ?? [], featured: [], pulls: r?.pulls ?? 0, source: 'api',
        precision: start > now ? 'estimated' : undefined,
      })
    }
  }
  return out
}

/* ---------- Punishing: Gray Raven (Global): notas de versión oficiales de Kuro ---------- */

/**
 * La web oficial (pgr.kurogame.net) usa el mismo sistema que la de WuWa: JSON estáticos en el CDN de Kuro
 * (`media-cdn-zspms.kurogame.net/pnswebsite/website2.0/json/G167/ArticleMenu.json` y `article/<id>.json`; sin robots.txt; mismos Términos de Kuro).
 * Cada versión publica un "VERSION "…" UPDATE NOTE" con el mantenimiento ("2026/11/4, 23:00 – 2026/11/5, 05:00 (UTC)") y, por sección
 * ("1) New S-Rank Omniframe: [Leia: Fortunaster]", "IV. Munchy Pixels"…), su periodo ("Event Period: After the update on 2026/11/05 - 2026/12/16, 23:00 (UTC)",
 * o la línea siguiente a "4) Event Duration"). Todo en UTC. Se omiten los paquetes de revestimientos (con precio).
 */
const PGR_CDN = 'https://media-cdn-zspms.kurogame.net/pnswebsite/website2.0/json/G167'

/** "2026/11/05" o "2026/12/16, 23:00" / "2026/11/12 10:00" (UTC) → ms; sin hora → 00:00. */
function pgrAt(s: string): number {
  const m = /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:,?\s*(\d{1,2}):(\d{2}))?/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) : NaN
}

export async function syncPgr(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${PGR_CDN}/ArticleMenu.json`))
  if (!res.ok) throw new Error(`pgr ArticleMenu → HTTP ${res.status}`)
  const menu = (await res.json()) as MenuItem[]
  const now = Date.now()
  const notes = menu.filter(a => /UPDATE NOTE/i.test(a.articleTitle) && pgrAt(a.startTime.replace(/-/g, '/')) <= now + DAY)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))[0]
  if (!notes) throw new Error('pgr: sin notas de versión')
  const art = await fetch(viaProxy(`${PGR_CDN}/article/${notes.articleId}.json`))
  if (!art.ok) throw new Error(`pgr article ${notes.articleId} → HTTP ${art.status}`)
  const text = lines(((await art.json()) as { articleContent?: string }).articleContent ?? '')

  const mt = text.map(l => /maintenance.*?(\d{4}\/\d{1,2}\/\d{1,2},?\s*\d{1,2}:\d{2})\s*[–-]\s*(\d{4}\/\d{1,2}\/\d{1,2},?\s*\d{1,2}:\d{2})\s*\(UTC\)/i.exec(l)).find(Boolean)
  const versionStart = mt ? pgrAt(mt[2]) : NaN
  const from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  const seen = new Set<string>()
  const titles: number[] = [], marks: { ev: GameEvent; title: number; dur: number }[] = []
  let title: string | null = null, titleAt = -1, pending = false

  const SUB = /^\d+\)\s*(Event (Details|Rewards|Duration)|Requirements?)\s*$/i
  for (let i = 0; i < text.length; i++) {
    const l = text[i]
    // Cabeceras: "IV. Munchy Pixels", "2) Endeavorer's Charm: Character Trial Stage", "[Brilliant Instant]".
    const head = /^(?:[IVX]+\.|\d+\))\s+(.+)$/.exec(l)?.[1] ?? (/^\[[^\]]+\]$/.test(l) ? l : null)
    if (head && !SUB.test(l) && !/—/.test(head)) { title = head.trim(); titleAt = i; titles.push(i); pending = false; continue }
    if (SUB.test(l) && /Duration/i.test(l)) { pending = true; continue }
    const range = /(?:after the (?:version )?update on (\d{4}\/\d{1,2}\/\d{1,2})|(\d{4}\/\d{1,2}\/\d{1,2},?\s*\d{1,2}:\d{2}))\s*(?:-|–|to)\s*(\d{4}\/\d{1,2}\/\d{1,2}(?:,?\s*(?:at\s*)?\d{1,2}:\d{2})?)\s*\(UTC\)/i.exec(l)
    if (!range || !title || !(pending || /Period|Duration|From after|available/i.test(l))) continue
    pending = false
    // Paquetes de revestimientos (de pago): su precio va justo después del periodo.
    const near = text.slice(i, i + 4).join(' ')
    if (/Pack Contents|Discounted Price|Price:/i.test(near) || /Coating/i.test(title)) { title = null; continue }
    const start = range[1] ? versionStart : pgrAt(range[2])
    const end = pgrAt(range[3].replace(/at\s*/i, ''))
    const name = (/\[([^\]]+)\]/.exec(title)?.[1] ?? title).replace(/:\s*Character Trial Stage$/i, '').trim()
    const banner = /available via|Research Pool/i.test(l) || /Research$/i.test(title)
    if (isNaN(start) || isNaN(end) || !(end > start) || end < from || start > to || end - start > 150 * DAY) { title = null; continue }
    const kind = banner ? 'banner' as const : 'event' as const
    const id = `${gameId}:${kind}:pgr:${name}:${new Date(start).toISOString().slice(0, 10)}`
    const at = titleAt
    title = null
    if (seen.has(id)) continue
    seen.add(id)
    const ev: GameEvent = {
      id, gameId, kind, title: name,
      description: /\[/.test(text[at] ?? '') && kind === 'banner' ? (text[at] ?? '').replace(/^\d+\)\s*/, '').replace(/\s*\[[^\]]+\]\s*$/, '').replace(/:$/, '') : undefined,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: kind === 'banner' && /Omniframe/i.test(text[at] ?? '') ? [{ name, rarity: 6 }] : [], pulls: 0, official: true, source: 'api',
      minor: /Tactical Assessment Manual/i.test(name) || undefined,
    }
    out.push(ev)
    marks.push({ ev, title: at, dur: i })
  }
  segments(text.length, titles, marks).forEach(([a, b], k) => {
    if (marks[k].ev.kind === 'banner') return
    const { pulls, items } = pullsIn('pgr', text.slice(a, b))
    marks[k].ev.pulls = pulls
    marks[k].ev.items = items
  })
  if (!out.length) throw new Error(`pgr: sin eventos vigentes en ${notes.articleId}`)
  // Arte de la wiki GRAY RAVENS (la nota oficial no trae imágenes): nombre de la versión de "I. A Comet's Afterglow — New Character".
  const version = text.map(l => /^[IVX]+\.\s+(.+?)\s+[—–]\s+/.exec(l)?.[1]).find(Boolean)
  const trials = new Set(marks.filter(m => /Character Trial Stage/i.test(text[m.title] ?? '')).map(m => m.ev.id))
  const events = version ? await withGrayRavens(out, version, trials).catch(err => { console.warn('pgr: sin arte de grayravens', err); return out }) : out
  return { events, patches: [], codes: [] }
}
