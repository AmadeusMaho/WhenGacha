import { viaProxy } from '../net'
import type { Featured, GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * Suikoden STAR LEAP (幻想水滸伝 STAR LEAP; Konami, solo Japón desde el 7 ago 2026, horas JST = UTC+9). Fuentes revisadas el 13 nov 2026:
 *  - Kaiden.gg (www.kaiden.gg/suikoden-star-leap/, robots.txt "Allow: /", sin anuncios), actualizado a diario en inglés:
 *    - /gacha/: tarjetas `li[data-expandable-row]` por banner ("Whirlwind War Blade 3 / Nov 12, 2026, 18:00 JST — Nov 30, 2026, 11:59 JST"),
 *      con su arte (`-card-` / `-banner-`) y las caras de los destacados (`/characters/<slug>/face.webp`). Secciones "Running now", "Always
 *      available" (permanentes: no se listan), "Off the schedule" (anunciados sin fecha, p. ej. "D. Galaxy Conqueror 3") y "Past banners".
 *    - /events/: los Event RPG con inicio, fin y caras; la página de cada uno trae "Everything the event pays" (tabla con icono y total de cada
 *      recompensa: de ahí salen `items` y `pulls`), los invitados aún sin publicar ("Not yet released") y "Next episode <fecha>".
 *    - /tower/: el Transient Chamber (piso de la Mirage Tower que cambia cada mes, con fechas y recompensas): el desafío rotatorio.
 *    - /blog/category/suikoden-star-leap/: los regalos de la caja (tablas "Gift | Rewards | Claim by (JST)"): se listan como eventos.
 *  - Códigos: NO hay. El juego no tiene canje de códigos (ni en el juego ni en el soporte oficial de Konami, que no lo menciona); lo que se
 *    regala llega solo a la caja de regalos, y eso ya sale como evento ("regalos").
 *  - Lo próximo: el banner siguiente del Event RPG en curso ("Whirlwind War Blade 4: three from the event, from late November") se estima con
 *    el próximo episodio (las pickups abren a las 18:00 JST del día del episodio) y los invitados aún sin publicar; los banners "Off the schedule"
 *    van tras el último banner vigente con la duración del anterior de su serie. Los dos, `precision: 'estimated'`.
 *  - La web oficial (konami.com/games/suikoden/star_leap/jp/ja/) no tiene lista de noticias: los avisos salen solo en X (@GensoSuikodenSP).
 * Por ciclo (caché de 6 h): /gacha/, /events/, la página del evento en curso, /tower/, el blog y hasta 2 avisos de regalos (6–7 páginas).
 */
const BASE = 'https://www.kaiden.gg'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const TZ = 9
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const text = (el: Element | null | undefined) => el?.textContent?.replace(/[\s ]+/g, ' ').trim() ?? ''
const abs = (src: string | null | undefined) => (src ? (src.startsWith('/') ? BASE + src : src) : undefined)

async function page(path: string): Promise<Document> {
  const res = await fetch(viaProxy(`${BASE}${path}`))
  if (!res.ok) throw new Error(`kaiden ${path} → HTTP ${res.status}`)
  return new DOMParser().parseFromString(await res.text(), 'text/html')
}

/** "Nov 12, 2026, 18:00 JST", "November 19, 2026, 11:59:59" (JST) → ms. Los cierres a las :59 se llevan al último segundo del minuto. */
export function jst(s: string): number | null {
  const m = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  const mo = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1
  if (!m || mo < 0) return null
  const min = m[5] ? +m[5] : 59
  const sec = m[6] ? +m[6] : m[4] ? (min === 59 ? 59 : 0) : 59
  return Date.UTC(+m[3], mo, +m[2], (m[4] ? +m[4] : 23) - TZ, min, sec)
}

/** "A — B" (raya, guion o "to") → [inicio, fin]. */
export function jstRange(s: string): [number, number] | null {
  const [a, b] = s.split(/\s+(?:[—–-]|to)\s+/)
  const x = a && jst(a), y = b && jst(b)
  return x && y ? [x, y] : null
}

const iso = (t: number) => new Date(t).toISOString()

/** Cara de un personaje por su página: "/suikoden-star-leap/characters/tsubaki-blooming-in-darkness/" → ".../face.webp". */
const faceOf = (href: string | null | undefined) => {
  const slug = /\/characters\/([a-z0-9-]+)\/?$/.exec(href ?? '')?.[1]
  return slug && slug !== 'tier-list' ? `${BASE}/img/suikoden-star-leap/characters/${slug}/face.webp` : undefined
}

/** Destacados del panel de un banner ("Boosted": enlaces `character-card-trigger` con `data-name` y `data-grade`). */
function boostedOf(li: Element): Featured[] {
  const h = [...li.querySelectorAll('h4')].find(x => /boosted/i.test(text(x)))
  const list = h?.nextElementSibling ?? li
  return [...list.querySelectorAll('a[data-name]')].map(a => ({
    name: a.getAttribute('data-name')!.trim(), icon: faceOf(a.getAttribute('href')),
    rarity: a.getAttribute('data-grade') === 'SSR' ? 5 : a.getAttribute('data-grade') === 'SR' ? 4 : 3,
  }))
}

/** Personajes de una lista con enlace a su página y nombre como texto (tarjetas de /events/, "Event guests"). */
const cast = (root: Element): Featured[] => [...root.querySelectorAll('li')].map(li => {
  const a = li.querySelector('a[href*="/characters/"]')
  const name = text(li).replace(/\s*Not yet released$/i, '')
  return { name, rarity: 5, icon: faceOf(a?.getAttribute('href')) ?? abs(li.querySelector('img[src*="/characters/"]')?.getAttribute('src')) }
}).filter(f => f.name)

/** Iconos de objetos vistos en cualquier página de Kaiden (tooltips "Fantasy Stones" y filas de tablas con icono): nombre → URL. */
const ICONS = new Map<string, string>()
function learnIcons(doc: Document) {
  for (const b of doc.querySelectorAll('[data-floating-tooltip-title]')) {
    const src = b.querySelector('img')?.getAttribute('src')
    const n = b.getAttribute('data-floating-tooltip-title')?.trim().toLowerCase()
    if (n && src && /\/assets\/cmn_item_icon_/.test(src) && !ICONS.has(n)) ICONS.set(n, abs(src)!)
  }
}
const iconOf = (name: string) => ICONS.get(name.toLowerCase()) ?? ICONS.get(name.toLowerCase().replace(/s$/, '')) ?? ICONS.get(`${name.toLowerCase()}s`)

/** Banners con fecha y los anunciados sin fecha ("Off the schedule") de /gacha/. */
export function parseBanners(gameId: string, doc: Document, now = Date.now()) {
  const dated: GameEvent[] = []
  const unscheduled: { title: string; image?: string; note: string }[] = []
  for (const sec of doc.querySelectorAll('#section-banners > section')) {
    const head = text(sec.querySelector('h2'))
    if (/always available/i.test(head)) continue
    for (const li of sec.querySelectorAll('li[data-expandable-row]')) {
      const btn = li.querySelector('button')
      // El primer `span.block` es el marco del arte (vacío): el nombre es el `font-bold`.
      const spans = [...(btn?.querySelectorAll('span.block') ?? [])].map(text).filter(Boolean)
      const title = text(btn?.querySelector('span.font-bold')) || spans[0]
      if (!title) continue
      const image = abs(li.querySelector('.ks-row__panel img[src*="/gacha/"]')?.getAttribute('src') ?? btn?.querySelector('img[src*="/gacha/"]')?.getAttribute('src'))
      const note = text(li.querySelector('.ks-row__panel p'))
      if (/off the schedule/i.test(head)) {
        // Solo las series con fechas por anunciar; el "Boost Guaranteed Gacha" de las primeras 72 h de cada cuenta no es un banner del calendario.
        if (/not been announced|to be announced|TBA/i.test(note)) unscheduled.push({ title, image, note })
        continue
      }
      const r = spans.map(jstRange).find(Boolean)
      if (!r || r[1] < now - 30 * DAY) continue
      dated.push({
        id: `${gameId}:banner:kaiden:${title}`, gameId, kind: 'banner', title, image, start: iso(r[0]), end: iso(r[1]),
        description: note && !/battle exp/i.test(note) ? note : undefined,
        items: [], featured: boostedOf(li), pulls: 0, source: 'api',
      })
    }
  }
  return { dated, unscheduled }
}

interface EventCard { title: string; href: string; start: number; end: number; image?: string; cast: Featured[] }

/** Event RPG de /events/ (tarjetas con enlace, "Starts"/"Ends" y caras). */
export function parseEventList(doc: Document): EventCard[] {
  return [...doc.querySelectorAll('a[href^="/suikoden-star-leap/events/"]')].flatMap(a => {
    const title = text(a.querySelector('h3'))
    const dd = [...a.querySelectorAll('dd')].map(text)
    const start = dd[0] && jst(dd[0]), end = dd[1] && jst(dd[1])
    if (!title || !start || !end) return []
    const bg = /url\('([^']+)'\)/.exec(a.querySelector('[style*="background-image"]')?.getAttribute('style') ?? '')?.[1]
    const ul = a.querySelector('ul')
    const imgs = [...(ul?.querySelectorAll('li') ?? [])].map(li => ({ name: text(li), rarity: 5, icon: abs(li.querySelector('img')?.getAttribute('src')) })).filter(f => f.name)
    return [{ title, href: a.getAttribute('href')!, start, end, image: abs(bg), cast: imgs }]
  })
}

/** Página de un Event RPG: total de recompensas (`#reward-totals`), invitados aún sin publicar y próximo episodio. */
export function parseEventPage(doc: Document) {
  const lines: string[] = []
  const items: RewardItem[] = []
  for (const tr of doc.querySelectorAll('#reward-totals tbody tr')) {
    const name = text(tr.querySelector('th'))
    const cells = [...tr.querySelectorAll('td')].map(text)
    const amount = Number((cells[cells.length - 1] ?? '').replace(/[^\d]/g, ''))
    if (!name || !amount) continue
    lines.push(`${name} x${amount}`)
    items.push({ name, amount, icon: abs(tr.querySelector('img')?.getAttribute('src')) ?? iconOf(name) })
  }
  const r = pullsIn('suikoden', lines)
  // Primero lo que sirve para tirar (el orden de pullsIn), con el icono de la tabla.
  const order = new Map(r.items.map((i, k) => [i.name.toLowerCase(), k]))
  items.sort((a, b) => (order.get(a.name.toLowerCase()) ?? 99) - (order.get(b.name.toLowerCase()) ?? 99))
  const body = text(doc.querySelector('#story') ?? doc.body)
  const next = /Next episode\s+([A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2})/.exec(body)?.[1]
  // "Event guests": los que llevan "Not yet released" (sin página ni retrato todavía).
  const gh = [...doc.querySelectorAll('h3')].find(h => /event guests/i.test(text(h)))
  const ul = gh?.nextElementSibling?.tagName === 'UL' ? gh.nextElementSibling : gh?.parentElement?.querySelector('ul')
  const unreleased = ul ? cast(ul).filter((_, k) => /not yet released/i.test(text(ul.querySelectorAll('li')[k]))) : []
  return { items: items.slice(0, 10), pulls: r.pulls, nextEpisode: next ? jst(`${next} JST`) : null, unreleased }
}

/** Transient Chamber de /tower/ (uno por mes, con fecha y recompensas totales). */
export function parseTower(gameId: string, doc: Document, now = Date.now()): GameEvent[] {
  const out: GameEvent[] = []
  for (const card of doc.querySelectorAll('div.ks-panel')) {
    const a = card.querySelector('h3 a[href*="/tower/transient-chamber"]')
    if (!a) continue
    const open = [...card.querySelectorAll('dd')].map(text).find(t => /^Open\s/i.test(t)) ?? ''
    const r = jstRange(open.replace(/^Open\s+/i, ''))
    if (!r || r[1] < now - DAY || out.some(e => Date.parse(e.start) === r[0])) continue
    const items: RewardItem[] = [...card.querySelectorAll('[data-floating-tooltip-title]')].map(b => ({
      name: b.getAttribute('data-floating-tooltip-title') ?? '', amount: Number((b.getAttribute('data-floating-tooltip-subtitle') ?? '').replace(/[^\d]/g, '')),
      icon: abs(b.querySelector('img')?.getAttribute('src')),
    })).filter(i => i.name && i.amount)
    const pulls = pullsIn('suikoden', items.map(i => `${i.name} x${i.amount}`)).pulls
    out.push({
      id: `${gameId}:challenge:transient:${iso(r[0]).slice(0, 10)}`, gameId, kind: 'challenge', title: 'Mirage Tower: Transient Chamber',
      description: '⟦d.suikodenTransient⟧', start: iso(r[0]), end: iso(r[1]), items, featured: [], pulls, source: 'api',
    })
  }
  return out
}

/** Regalos de un aviso del blog: tablas "Gift | Rewards | Claim by (JST)". Empiezan el día del aviso. */
export function parseGifts(gameId: string, doc: Document, now = Date.now()): GameEvent[] {
  const posted = Date.parse(doc.querySelector('article time[datetime], time[datetime]')?.getAttribute('datetime') ?? '')
  const out: GameEvent[] = []
  for (const table of doc.querySelectorAll('article table')) {
    const head = [...table.querySelectorAll('th')].map(text)
    const gi = head.findIndex(h => /^gift/i.test(h)), ri = head.findIndex(h => /^rewards?/i.test(h)), ci = head.findIndex(h => /claim by/i.test(h))
    if (gi < 0 || ri < 0 || ci < 0) continue
    for (const tr of table.querySelectorAll('tr')) {
      const td = [...tr.querySelectorAll('td')].map(text)
      if (td.length < 3) continue
      const end = jst(td[ci])
      if (!end || end < now - DAY) continue
      const start = Number.isFinite(posted) ? Math.min(posted, end - HOUR) : end - 7 * DAY
      // "Fantasy Stones ×1,500, Potch ×25,000": se separa por la coma que va antes de un nombre, no la de los miles.
      const lines = td[ri].split(/,\s+(?=[A-Za-z])/)
      const r = pullsIn('suikoden', lines)
      const items = lines.map(l => /^(.+?)\s*[×x]\s*([\d,]+)$/.exec(l)).filter(Boolean).map(m => ({ name: m![1], amount: Number(m![2].replace(/,/g, '')), icon: iconOf(m![1]) }))
      out.push({
        id: `${gameId}:event:gift:${td[gi]}`, gameId, kind: 'event', title: td[gi], description: '⟦d.suikodenGift⟧',
        start: iso(start), end: iso(end), items, featured: [], pulls: r.pulls, source: 'api', precision: Number.isFinite(posted) ? 'approx' : 'estimated',
      })
    }
  }
  return out
}

async function gifts(gameId: string, now: number): Promise<GameEvent[]> {
  const cat = await page('/blog/category/suikoden-star-leap/')
  const posts = [...new Set([...cat.querySelectorAll('a[href^="/blog/suikoden-star-leap-"]')].map(a => a.getAttribute('href')!))]
    .filter(h => /gift|campaign|stones|present|compensation/i.test(h)).slice(0, 2)
  const out: GameEvent[] = []
  for (const p of posts) out.push(...parseGifts(gameId, await page(p).catch(() => null) ?? new DOMParser().parseFromString('', 'text/html'), now))
  return out
}

export async function syncSuikoden(gameId: string): Promise<GameSync> {
  const now = Date.now()
  const [g, e, t] = await Promise.allSettled([page('/suikoden-star-leap/gacha/'), page('/suikoden-star-leap/events/'), page('/suikoden-star-leap/tower/')])
  if (g.status === 'rejected' && e.status === 'rejected') throw g.reason
  const events: GameEvent[] = []
  let banners: GameEvent[] = []
  let unscheduled: ReturnType<typeof parseBanners>['unscheduled'] = []
  if (g.status === 'fulfilled') { learnIcons(g.value); ({ dated: banners, unscheduled } = parseBanners(gameId, g.value, now)) }
  else console.warn('[suikoden] gacha:', (g.reason as Error)?.message)
  if (t.status === 'fulfilled') { learnIcons(t.value); events.push(...parseTower(gameId, t.value, now)) }
  if (e.status === 'fulfilled') {
    for (const c of parseEventList(e.value).filter(c => c.end > now - 30 * DAY)) {
      const running = c.start <= now && c.end > now
      const d = running ? await page(c.href).catch(() => null) : null
      if (d) learnIcons(d)
      const info = d ? parseEventPage(d) : null
      events.push({
        id: `${gameId}:event:kaiden:${c.title}`, gameId, kind: 'event', title: c.title, description: '⟦d.suikodenEventRpg⟧', image: c.image,
        start: iso(c.start), end: iso(c.end), items: info?.items ?? [], featured: c.cast, pulls: info?.pulls ?? 0, source: 'api',
      })
      // Próxima pickup del Event RPG: abre con el siguiente episodio (18:00 JST) y dura hasta el fin del evento; destacados, los invitados sin publicar.
      const last = banners.filter(b => Date.parse(b.end) === c.end || Math.abs(Date.parse(b.end) - c.end) < HOUR).sort((x, y) => Date.parse(y.start) - Date.parse(x.start))[0]
      if (info?.nextEpisode && last && info.nextEpisode > Date.parse(last.start)) {
        const series = last.title.replace(/\s+\d+$/, '')
        const n = (Number(/\s(\d+)$/.exec(last.title)?.[1]) || 1) + 1
        const start = info.nextEpisode + 6 * HOUR
        banners.push({
          id: `${gameId}:banner:kaiden:next:${series} ${n}`, gameId, kind: 'banner', title: `${series} ${n}`, description: '⟦d.suikodenNextPickup⟧', image: c.image,
          start: iso(start), end: iso(c.end), items: [], featured: info.unreleased, pulls: 0, source: 'api', precision: 'estimated',
        })
      }
    }
  } else console.warn('[suikoden] events:', (e.reason as Error)?.message)
  // Anunciados sin fecha: tras el último banner con fecha, con la duración del anterior de su serie (o 14 días).
  const lastEnd = Math.max(now, ...banners.map(b => Date.parse(b.end)))
  for (const u of unscheduled) {
    const series = u.title.replace(/\s+\d+$/, '')
    const prev = banners.filter(b => b.title.startsWith(series)).sort((x, y) => Date.parse(y.start) - Date.parse(x.start))[0]
    const len = prev ? Date.parse(prev.end) - Date.parse(prev.start) : 14 * DAY
    const start = lastEnd + 6 * HOUR + 1000
    banners.push({
      id: `${gameId}:banner:kaiden:tba:${u.title}`, gameId, kind: 'banner', title: u.title, image: u.image, description: '⟦d.suikodenTba⟧',
      start: iso(start), end: iso(start + len), items: [], featured: [], pulls: 0, source: 'api', precision: 'estimated',
    })
  }
  events.push(...await gifts(gameId, now).catch(err => { console.warn('[suikoden] regalos:', (err as Error)?.message); return [] as GameEvent[] }))
  return { events: [...banners, ...events], patches: [], codes: [] }
}
