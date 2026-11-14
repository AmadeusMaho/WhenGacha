import { viaProxy } from '../net'
import type { Featured, GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { syncPocketGamerCodes } from './codes'
import { pullsIn } from './pulls'

/**
 * Wizardry Variants Daphne (Drecom). Fuentes revisadas el 14 nov 2026:
 *  - Un solo servicio mundial: la misma app (jp.co.drecom.wizardry.daphne, "Distribution: Worldwide") con varios idiomas. Los avisos en japonés
 *    (wizardry.info/daphne/news/) y en inglés dan exactamente las mismas fechas y horas en JST (UTC+9) (Ver 2.2.0: "11/12/2026 17:30 – 12/2/2026
 *    23:59 JST" en los dos). Sin selector de servidor (servers.ts). Los días cambian a las 00:00 JST y la semana el lunes a las 00:00 JST (avisos
 *    oficiales de la tienda: "Resets every Monday at 0:00 JST"); los eventos acaban a las 23:59 JST y las versiones abren tras el mantenimiento
 *    (13:30 o 17:00–17:30 JST).
 *  - Eventos y banners: el feed RSS oficial de noticias (wizardry.info/en/daphne/news/feed/, WordPress, con el texto completo de cada aviso;
 *    sin robots.txt que lo cierre). 10 avisos por página: se leen las dos primeras (≈ 8 semanas, lo justo para que entren los banners largos).
 *    Cada aviso es una lista de secciones `<h2>` con su periodo debajo ("Event Period" / "Featured Period" / "Campaign Period" / "Season Dates":
 *    "11/12/2026 17:30 – 12/2/2026 23:59 JST"). Los avisos de /news/adventures/ son los banners ("Clearwater Bride Lanavaille Arrives",
 *    "Chronicle of Battlefront Heroes [Season 2]") y su "Featured Period". Las ventas ("Sale Period"), pases ("Mission Pass Availability
 *    Period") e intercambios ("Exchange Period") no se listan.
 *  - Recompensas: el propio aviso ("such as a total of 2 Unique Remains: Clearwater Princess Knight, a total of 400 Gems of Org…").
 *    Tiradas: 200 Gems of Org o 1 Unique Remains = 1 tirada (pulls.ts).
 *  - Retratos: la lista oficial de aventureros (wizardry.info/en/daphne/adventurers/, 5 páginas; caché de 24 h): tarjeta con el epíteto,
 *    el nombre y su imagen; `legend` = legendario (5★).
 *  - Iconos de recompensas: la tienda oficial (webstore.wizardry.info, sus propias imágenes de "オルグの貴石" y "稀なる遺骸"); van fijos en
 *    `DAPHNE_ICONS` (la tienda es una SPA y no hace falta leerla en cada ciclo).
 *  - Códigos: PocketGamer (se canjean en la tienda oficial con el User ID; el juego no los lista).
 *  - Lo próximo: solo lo que anuncian los avisos con fecha ("[Announcement] Battlefront of Heroes Season 2"). Los adelantos de personajes salen
 *    solo en X (@Wiz_Daphne_en), sin fuente legible: no hay banners estimados.
 * Por ciclo: 2 páginas del feed (caché de 3 h), hasta 5 de aventureros (24 h) y 1 de PocketGamer.
 */
const BASE = 'https://wizardry.info/en/daphne'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const TZ = 9

/** Iconos de la tienda oficial (webstore.wizardry.info, 14 nov 2026): "オルグの貴石100個" y "稀なる遺骸" (×1). */
export const DAPHNE_ICONS = new Map<string, string>([
  ['gems of org', 'https://wizardry-static.synapse-lm.com/items/DJlaeJ5YRzq4/2a7373e3eb9b4886cb79fe9acd4a19a5b65d736b405bdc245858c4fea511fb75.png'],
  ['unique remains', 'https://wizardry-static.synapse-lm.com/items/57YzAd1Wxavd/22d08e555a8233a14a814851293fcdb57676c6221e64c0681d5504e9bbe5f9d7.png'],
])
const iconOf = (name: string) => DAPHNE_ICONS.get(name.toLowerCase()) ?? (/^unique remains\b/i.test(name) ? DAPHNE_ICONS.get('unique remains') : undefined)

const clean = (s: string) => s.replace(/[\s ]+/g, ' ').trim()
const text = (el: Element | null | undefined) => clean(el?.textContent ?? '')
const iso = (t: number) => new Date(t).toISOString()
/** Texto plano de un trozo de HTML (entidades incluidas). Documento completo: linkedom deja los fragmentos sueltos fuera de `<body>`. */
const plain = (html: string) => clean(new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html').body?.textContent ?? '')

/** "11/12/2026 17:30" (JST) → ms. Sin hora: 00:00 al empezar y 23:59:59 al acabar. Los cierres a las :59 se llevan al último segundo del minuto. */
function jstAt(m: string, d: string, y: string | undefined, hh: string | undefined, mm: string | undefined, end: boolean, year: number): number {
  const Y = y ? (+y < 100 ? 2000 + +y : +y) : year
  if (!hh) return Date.UTC(Y, +m - 1, +d, end ? 23 - TZ : -TZ, end ? 59 : 0, end ? 59 : 0)
  return Date.UTC(Y, +m - 1, +d, +hh - TZ, +mm!, +mm! === 59 ? 59 : 0)
}

/** "11/12/2026 17:30 – 12/2/2026 23:59 JST" (también "10/29 (Thu) – 11/25 (Wed) 23:59") → [inicio, fin]. `year`: el del aviso. */
export function daphneRange(s: string, year: number): [number, number] | null {
  const D = String.raw`(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*\([A-Za-z]{3}\))?(?:\s+(\d{1,2}):(\d{2}))?`
  const m = new RegExp(`${D}\\s*[–—~～-]\\s*${D}`).exec(s.replace(/&#8211;/g, '–'))
  if (!m) return null
  const a = jstAt(m[1], m[2], m[3], m[4], m[5], false, year)
  let b = jstAt(m[6], m[7], m[8], m[9], m[10], true, m[3] ? +m[3] : year)
  // "12/30 – 1/5" sin año: el fin es del año siguiente.
  if (!m[8] && b < a) b = jstAt(m[6], m[7], String(new Date(a).getUTCFullYear() + 1), m[9], m[10], true, year)
  return b > a ? [a, b] : null
}

/** Rótulos de periodo y apartados de una sección (no son eventos). */
const LABEL = /^(?:(?:full )?event|featured|sale|exchange|campaign|survey|mission pass availability|season)\s+(?:period|dates)$|^how to claim$|^request$|^phase \d+$|^implementation date$|^\[updated[^\]]*\]$/i
/** Periodos que no son un evento: ventas, pases e intercambios. */
const SKIP_LABEL = /^(?:sale|exchange|mission pass availability)\s+period$/i
/** Secciones de tienda y extras del banner. */
const SKIP_OWNER = /limited[- ]time items|mission pass|exchange$|official shop|bonus equipment|^changes$|^other$|fixed issues|privacy|end of (?:support|german)|^\[announcement\] end/i
/** Campañas menores (bonificaciones y descuentos): se ocultan por defecto. */
const MINOR = /day of blessing|discount|enhancement|reward period|buyback|survey|inn |sort option|fishing/i

type Block = { h: number; t: string } | { p: string } | { img: string }

function blocksOf(html: string): Block[] {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body><div id="x">${html}</div></body></html>`, 'text/html')
  const root = doc.getElementById('x') ?? doc.body
  const out: Block[] = []
  const walk = (el: Element) => {
    for (const c of [...el.children]) {
      const tag = c.tagName.toUpperCase()
      if (/^H[1-6]$/.test(tag)) out.push({ h: +tag[1], t: text(c) })
      else if (tag === 'IMG') { const src = c.getAttribute('src'); if (src && !/news_(?:issues_)?notice/i.test(src)) out.push({ img: src.replace(/&#038;/g, '&') }) }
      else if (tag === 'P' || tag === 'LI') {
        for (const img of [...c.querySelectorAll('img')]) { const src = img.getAttribute('src'); if (src) out.push({ img: src }) }
        // Saltos de línea dentro del párrafo: cada línea por separado ("*About Medals<br>Each medal…").
        for (const line of (c.innerHTML ?? '').split(/<br\s*\/?>/i)) {
          const t = plain(line)
          if (t) out.push({ p: t })
        }
      } else walk(c)
    }
  }
  walk(root)
  return out
}

/** "a total of 2 Unique Remains: Clearwater Princess Knight, a total of 400 Gems of Org" → recompensas. */
export function daphneRewards(lines: string[]): { items: RewardItem[]; pulls: number } {
  const all = new Map<string, number>()
  for (const l of lines) {
    if (/purchas|pass\b|price|discount/i.test(l)) continue
    const re = /(?:a total of|receive|obtain|send|get|such as)\s+(\d[\d,]*)\s+([A-Z][^,.;]*?)(?=,|\.|;|\s+and\b|\s+by\b|\s+during\b|\s+at\b|\s+from\b|\s+for\b|\s+as\b|\s+in\b|$)/g
    for (const m of l.matchAll(re)) {
      const name = m[2].trim().replace(/^Org Gems?$/i, 'Gems of Org').replace(/^Gem of Org$/i, 'Gems of Org')
      const n = Number(m[1].replace(/,/g, ''))
      if (n && name.split(/\s+/).length <= 9) all.set(name, (all.get(name) ?? 0) + n)
    }
  }
  const items = [...all].map(([name, amount]) => ({ name, amount, icon: iconOf(name) }))
  // Tiradas: "Unique Remains: <banner>" cuenta como "Unique Remains" (1 tirada cada uno).
  const pulls = pullsIn('daphne', items.map(i => `${i.name.replace(/:.*$/, '')} x${i.amount}`)).pulls
  return { items: items.slice(0, 10), pulls }
}

export interface DaphnePost { title: string; link: string; posted: number; html: string }

/** Avisos del feed RSS (título, enlace, fecha y el HTML completo de `content:encoded`). */
export function daphneFeed(xml: string): DaphnePost[] {
  return xml.split('<item>').slice(1).map(it => ({
    title: plain(/<title>([\s\S]*?)<\/title>/.exec(it)?.[1] ?? ''),
    link: /<link>([\s\S]*?)<\/link>/.exec(it)?.[1]?.trim() ?? '',
    posted: Date.parse(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1] ?? '') || Date.now(),
    html: /<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/.exec(it)?.[1] ?? '',
  })).filter(p => p.title && p.html)
}

/** Portada de cada aventurero de la lista oficial: [epíteto, nombre, imagen, legendario]. */
export interface Adventurer { nick: string; name: string; image?: string; legend: boolean }

export function daphneAdventurers(doc: Document): Adventurer[] {
  return [...doc.querySelectorAll('a.c-adventures__block')].map(a => ({
    nick: text(a.querySelector('.c-adventures__block-nickname')), name: text(a.querySelector('.c-adventures__block-title')),
    image: a.querySelector('.c-adventures__block-image img')?.getAttribute('src')?.replace(/&amp;/g, '&') ?? undefined,
    legend: /\blegend\b/.test(a.getAttribute('class') ?? ''),
  })).filter(x => x.name)
}

const norm = (s: string) => s.toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

/** Destacado con su retrato: "Fallen Holy Maiden, Arianaute" → la tarjeta cuyo nombre es la última palabra y cuyo epíteto coincide; sin epíteto,
 *  la más antigua con ese nombre (la versión base; la lista va de la más nueva a la más vieja). */
export function daphneFeatured(full: string, list: Adventurer[]): Featured {
  const words = norm(full).split(' ')
  const name = words[words.length - 1] ?? ''
  const same = list.filter(a => norm(a.name) === name)
  const nick = words.slice(0, -1).join(' ')
  const hit = (nick && same.find(a => norm(a.nick) === nick)) || (nick && same.find(a => nick.includes(norm(a.nick)) || norm(a.nick).includes(nick)))
    || same[same.length - 1]
  return { name: clean(full.replace(/,\s*/, ' ')), full: clean(full), icon: hit?.image, rarity: hit ? (hit.legend ? 5 : 4) : undefined, tag: /\[reminiscence\]/i.test(full) ? 'Reminiscence' : undefined }
}

const bannerTitle = (t: string) => t.replace(/\s+(?:Arrives?|Begins)$/i, '').trim()
const postTitle = (t: string) => t.replace(/^\[(?:updated|announcement)\]\s*/i, '').replace(/\s*\[added:[^\]]*\]$/i, '').trim()

/** Eventos y banners de un aviso. */
export function daphnePost(gameId: string, post: DaphnePost, adventurers: Adventurer[], now = Date.now()): GameEvent[] {
  const blocks = blocksOf(post.html)
  const year = new Date(post.posted + TZ * HOUR).getUTCFullYear()
  const firstImg = blocks.find((b): b is { img: string } => 'img' in b)?.img
  const out: GameEvent[] = []
  const kind = /\/news\/adventures\//.test(post.link) ? 'banner' : /\/news\/event\//.test(post.link) ? 'event' : 'news'

  if (kind === 'banner') {
    // Banner: el título del aviso y su primer "Featured Period".
    const i = blocks.findIndex(b => 'h' in b && /^featured period$/i.test(b.t))
    const range = i >= 0 ? blocks.slice(i + 1, i + 4).map(b => ('p' in b ? daphneRange(b.p, year) : null)).find(Boolean) : null
    if (!range || range[1] < now - 3 * DAY) return []
    const title = bannerTitle(post.title)
    // "Only the legendary adventurers listed below will appear": los nombres, en la lista que sigue. Si no, los del título ("A and B").
    const only = blocks.findIndex(b => 'p' in b && /legendary adventurers listed below will appear/i.test(b.p))
    const listed: string[] = []
    if (only >= 0) for (const b of blocks.slice(only + 1)) {
      if ('h' in b || ('p' in b && (/following general adventurers|^\*/i.test(b.p) || b.p.split(/\s+/).length > 6))) break
      if ('p' in b) listed.push(b.p)
    }
    const names = listed.length ? listed : title.split(/\s+and\s+/i)
    const featured = names.map(n => daphneFeatured(n, adventurers))
    const intro = blocks.find((b): b is { p: string } => 'p' in b)?.p
    out.push({
      id: `${gameId}:banner:wiz:${norm(title)}:${iso(range[0]).slice(0, 10)}`, gameId, kind: 'banner', title, image: firstImg,
      description: intro && intro.length < 260 ? intro : undefined, start: iso(range[0]), end: iso(range[1]),
      items: [], featured, pulls: 0, source: 'api', official: true,
    })
    return out
  }

  // Avisos de versión, de datos, de campaña y de evento: un evento por sección con periodo.
  const heads = blocks.map((b, k) => ('h' in b ? k : -1)).filter(k => k >= 0)
  const seen = new Set<string>()
  blocks.forEach((b, k) => {
    if (!('p' in b)) return
    const range = daphneRange(b.p, year)
    if (!range) return
    // "11/12/2026 – 11/18/2026 23:59" (sin hora de inicio) el día del aviso: empieza al publicarse, tras el mantenimiento, no a las 00:00 JST.
    if ((range[0] + TZ * HOUR) % DAY === 0 && post.posted > range[0] && post.posted - range[0] < DAY) range[0] = post.posted
    const prev = heads.filter(h => h < k)
    const label = prev.length ? (blocks[prev[prev.length - 1]] as { h: number; t: string }) : undefined
    if (label && SKIP_LABEL.test(label.t)) return
    // Dentro de un apartado de tienda ("Limited-Time Items" > "… Set [Gold]" > "Recommended Items"): no es un evento.
    const h2 = [...prev].reverse().map(h => blocks[h] as { h: number; t: string }).find(h => h.h <= 2)
    if (h2 && SKIP_OWNER.test(h2.t)) return
    // Dueño: el último título que no es un rótulo. Si el apartado de nivel 2 es un rótulo ("Event Period" con sus fases), el evento es el aviso.
    let owner: { h: number; t: string } | undefined
    let ownerAt = -1
    for (let j = prev.length - 1; j >= 0; j--) {
      const h = blocks[prev[j]] as { h: number; t: string }
      if (h.h <= 2 && LABEL.test(h.t)) break
      if (!LABEL.test(h.t)) { owner = h; ownerAt = prev[j]; break }
    }
    const title0 = owner ? owner.t : kind === 'event' ? postTitle(post.title) : ''
    const title = title0.replace(/^\[(?:urgent|daily|announcement)[^\]]*\]\s*/i, '').trim()
    if (!title || SKIP_OWNER.test(title) || /\barrives?$|\bbegins$/i.test(title) || seen.has(title.toLowerCase())) return
    seen.add(title.toLowerCase())
    if (range[1] < now - 3 * DAY) return
    // Texto de la sección: desde su título hasta el siguiente de su nivel (o superior) que no sea un rótulo.
    const from = ownerAt >= 0 ? ownerAt + 1 : 0
    const lvl = owner?.h ?? 2
    const stop = blocks.findIndex((x, j) => j > from && 'h' in x && x.h <= lvl && !LABEL.test(x.t))
    const section = blocks.slice(from, stop < 0 ? blocks.length : stop)
    // Fuera lo que va bajo el pase de pago ("… Mission Pass Introduction").
    const own: string[] = []
    let inPass = false
    for (const x of section) {
      if ('h' in x) inPass = /pass/i.test(x.t) && !LABEL.test(x.t)
      else if ('p' in x && !inPass) own.push(x.p)
    }
    const rewards = daphneRewards(own)
    const desc = own.find(p => !daphneRange(p, year) && !/^\*/.test(p) && p.length > 20)
    const image = section.find((x): x is { img: string } => 'img' in x)?.img ?? (kind === 'event' && !owner ? firstImg : undefined)
    const challenge = /battlefront of heroes season|old castle ruins|ancient mausoleum/i.test(title)
    out.push({
      id: `${gameId}:${challenge ? 'challenge' : 'event'}:wiz:${norm(title)}:${iso(range[0]).slice(0, 10)}`, gameId, kind: challenge ? 'challenge' : 'event', title, image,
      description: desc && desc.length > 280 ? `${desc.slice(0, 277)}…` : desc, start: iso(range[0]), end: iso(range[1]),
      items: rewards.items, featured: [], pulls: rewards.pulls, minor: MINOR.test(title) ? true : undefined, source: 'api', official: true,
    })
  })
  return out
}

async function get(url: string): Promise<string> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`wizardry.info ${url.replace(BASE, '')} → HTTP ${res.status}`)
  return res.text()
}

async function adventurersList(): Promise<Adventurer[]> {
  const out: Adventurer[] = []
  for (let n = 1; n <= 5; n++) {
    const html = await get(`${BASE}/adventurers/${n > 1 ? `page/${n}/` : ''}`).catch(() => '')
    const page = html ? daphneAdventurers(new DOMParser().parseFromString(html, 'text/html')) : []
    if (!page.length) break
    out.push(...page)
  }
  return out
}

export async function syncDaphne(gameId: string): Promise<GameSync> {
  const [f1, f2, adv, codes] = await Promise.allSettled([get(`${BASE}/news/feed/`), get(`${BASE}/news/feed/?paged=2`), adventurersList(), syncPocketGamerCodes('wizardry-variants-daphne')])
  if (f1.status === 'rejected' && f2.status === 'rejected') throw f1.reason
  if (codes.status === 'rejected') console.warn('[daphne] códigos:', (codes.reason as Error)?.message)
  if (adv.status === 'rejected') console.warn('[daphne] aventureros:', (adv.reason as Error)?.message)
  const posts = [f1, f2].flatMap(r => (r.status === 'fulfilled' ? daphneFeed(r.value) : []))
  const list = adv.status === 'fulfilled' ? adv.value : []
  // El mismo evento puede salir en el aviso de versión y en el suyo: se queda el primero (el más reciente).
  const byId = new Map<string, GameEvent>()
  for (const p of posts) for (const e of daphnePost(gameId, p, list)) if (!byId.has(e.id)) byId.set(e.id, e)
  return { events: [...byId.values()], patches: [], codes: codes.status === 'fulfilled' ? codes.value : [] }
}
