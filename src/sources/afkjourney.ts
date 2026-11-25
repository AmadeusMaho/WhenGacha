import { viaProxy } from '../net'
import type { GameEvent, Kind, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { cardList } from './challenges'
import { syncPocketGamerCodes } from './codes'
import { pullsIn } from './pulls'

/**
 * AFK Journey (Global) desde su wiki de Fandom (afk-journey.fandom.com, API de MediaWiki; robots.txt lo permite). Revisado el 7 nov 2026: al día.
 *  - Eventos: los 40 últimos de "Category:Events", con `{{Event Infobox |name |time_start = 2026-11-02 00:00 |time_end = 2026-11-22 23:59 |group = Guild}}`.
 *    Los que son ediciones con fecha de un modo que se repite ("Horn Rally/2026-11-02", "Titan Reaver/2026-10-24") y de grupo Guild/Strategy son rotatorios.
 *    Recompensas: todos los `{{Card List|…}}` / `{{Item List|…}}` de la página (Diamond*50;Guild Medal*100), sumados: el máximo que da.
 *  - Banners: subpáginas "Rate Up Recruitment/<fecha>" y "…/Rate Up Return/<fecha>" con `{{Rate Up Info |hero = Kazim;Evie |time_start |time_end}}`.
 *  - Hora: UTC. Lo dice la documentación de `Template:Rate Up Info` ("banner start (UTC)") y `Template:Event Infobox` calcula con "GMT+0".
 *  - **Códigos: no hay fuente fiable.** La página "Redemption Code" de la wiki está marcada para rehacer y su lista de "activos" es de 2024.
 *  - Modos con subpágina fechada (cambios recientes) y héroes anunciados (`type = Upcoming`): ver `datedModes` y `upcomingHeroes`.
 * 5–6 consultas por ciclo (caché de 12 h en el proxy).
 */
const API = 'https://afk-journey.fandom.com/api.php'
const DAY = 86_400_000

interface Page { title: string; revisions?: { slots?: { main?: { content?: string } } }[]; thumbnail?: { source: string } }

async function query(params: Record<string, string>): Promise<{ query?: { pages?: Page[]; allpages?: { title: string }[] } }> {
  const res = await fetch(viaProxy(`${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' })}`))
  if (!res.ok) throw new Error(`afk-journey wiki → HTTP ${res.status}`)
  return res.json()
}

/**
 * La wiki da 00:00 / 23:59 UTC, pero cada servidor de AFK Journey cambia a su medianoche local: con esas horas, "≈ Hora aprox."
 * (antes salían como exactas; revisión del 12 nov 2026).
 */
const dayOnly = (s: number, e: number): 'approx' | undefined =>
  new Date(s).getUTCHours() === 0 && new Date(s).getUTCMinutes() === 0 && new Date(e).getUTCHours() === 23 && new Date(e).getUTCMinutes() === 59 ? 'approx' : undefined
const field = (text: string, name: string) => new RegExp(`\\|\\s*${name}\\s*=\\s*([^|\\n}]*)`).exec(text)?.[1]?.trim() ?? ''
/** "2026-11-02 00:00" (UTC) → ms; "23:59" cierra al final del minuto. */
const at = (s: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) + (m[5] === '59' ? 59_999 : 0) : NaN
}
const content = (p: Page) => p.revisions?.[0]?.slots?.main?.content ?? ''

function rewards(text: string): { items: RewardItem[]; pulls: number } {
  const tot = new Map<string, number>()
  for (const m of text.matchAll(/\{\{\s*(?:Card|Item) List\s*\|([^}]*)\}\}/gi)) {
    // Las tarjetas de enemigos (`type=Enemy`: el jefe del evento) y los puntos del propio evento no son recompensas.
    if (/\btype\s*=\s*Enemy/i.test(m[1])) continue
    for (const it of cardList(m[1])) if (!/^Event Points/i.test(it.name)) tot.set(it.name, (tot.get(it.name) ?? 0) + it.amount)
  }
  const items = [...tot].sort((a, b) => Number(/^Diamonds?$/.test(b[0])) - Number(/^Diamonds?$/.test(a[0])) || b[1] - a[1])
    .map(([name, amount]) => ({ name, amount })).slice(0, 10)
  return { items, pulls: pullsIn('afkjourney', items.map(i => `${i.name} x${i.amount}`)).pulls }
}

async function events(gameId: string): Promise<GameEvent[]> {
  const j = await query({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:Events', gcmsort: 'timestamp', gcmdir: 'desc', gcmlimit: '40',
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '480',
  })
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  for (const p of j.query?.pages ?? []) {
    const text = content(p)
    if (!/\{\{\s*Event Infobox/i.test(text)) continue
    const s = at(field(text, 'time_start')), e = at(field(text, 'time_end'))
    if (isNaN(s) || isNaN(e) || e <= s || e < from || s > to || e - s > 150 * DAY) continue
    const name = field(text, 'name') || p.title.replace(/\/\d{4}-\d\d-\d\d$/, '')
    const groups = [field(text, 'group'), field(text, 'group2')].filter(Boolean)
    const recurring = /\/\d{4}-\d\d-\d\d$/.test(p.title) && groups.some(g => /Guild|Strategy/i.test(g))
    const kind: Kind = recurring ? 'challenge' : 'event'
    const r = rewards(text)
    out.push({
      id: `${gameId}:${kind}:${p.title}`, gameId, kind, title: name,
      description: groups.length ? groups.join(' · ') : undefined,
      image: p.thumbnail?.source,
      start: new Date(s).toISOString(), end: new Date(e).toISOString(),
      items: r.items, featured: [], pulls: r.pulls, source: 'api', precision: dayOnly(s, e),
    })
  }
  return out
}

/**
 * Modos periódicos con subpágina fechada que no entran en "Category:Events" (24 nov 2026): "Heroic Gauntlet/2026-11-23" (`{{Battle Mode Infobox |title = Block
 * |time_start |time_end}}`), "Relentless Rumble/…", "Treasure Rush/…". Se encuentran en los cambios recientes de la wiki (la subpágina se crea y edita al
 * empezar cada ronda): 1 consulta para la lista y 1 para leerlas. Los que ya salieron de la categoría se descartan después por id.
 */
async function datedModes(gameId: string, known: Set<string>): Promise<GameEvent[]> {
  const rc = await query({ action: 'query', list: 'recentchanges', rcnamespace: '0', rclimit: '500', rcprop: 'title', rctoponly: '1' }) as { query?: { recentchanges?: { title: string }[] } }
  const now = Date.now()
  const titles = [...new Set((rc.query?.recentchanges ?? []).map(r => r.title))]
    .filter(t => { const m = /^(.+)\/(\d{4}-\d\d-\d\d)$/.exec(t); return !!m && !/^Rate Up/i.test(m[1]) && !known.has(t) && Date.parse(m[2]) > now - 40 * DAY })
    .slice(0, 50)
  if (!titles.length) return []
  const j = await query({ action: 'query', titles: titles.join('|'), prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '480' })
  const out: GameEvent[] = []
  for (const p of j.query?.pages ?? []) {
    const text = content(p)
    const mode = /\{\{\s*Battle Mode Infobox/i.test(text)
    if (!mode && !/\{\{\s*Event Infobox/i.test(text)) continue
    const s = at(field(text, 'time_start')), e = at(field(text, 'time_end'))
    if (isNaN(s) || isNaN(e) || e <= s || e < now - 3 * DAY || s > now + 120 * DAY || e - s > 150 * DAY) continue
    const base = p.title.replace(/\/\d{4}-\d\d-\d\d$/, '')
    // "Heroic Gauntlet: Block" (el título de la ronda); en los eventos, su nombre.
    const own = field(text, mode ? 'title' : 'name')
    const name = own && own !== base ? `${base}: ${own}` : base
    const r = rewards(text)
    out.push({
      id: `${gameId}:challenge:${p.title}`, gameId, kind: 'challenge', title: name, image: p.thumbnail?.source,
      start: new Date(s).toISOString(), end: new Date(e).toISOString(), items: r.items, featured: [], pulls: r.pulls, source: 'api', precision: dayOnly(s, e),
    })
  }
  return out
}

/**
 * Héroes anunciados (24 nov 2026): la ficha de un héroe nuevo se crea antes de su banner con `|type = Upcoming |release_date = 2026-11-26 00:00:00`
 * (Sherlock Holmes). Mientras no exista su "Rate Up Recruitment/<fecha>", sale como banner estimado desde ese día, 3 semanas (lo que duran los de rate up).
 * 1 consulta: las últimas fichas añadidas a "Category:Heroes".
 */
async function upcomingHeroes(gameId: string): Promise<GameEvent[]> {
  const j = await query({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:Heroes', gcmsort: 'timestamp', gcmdir: 'desc', gcmlimit: '8',
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '160',
  })
  const now = Date.now()
  const out: GameEvent[] = []
  for (const p of j.query?.pages ?? []) {
    const text = content(p)
    if (!/\{\{\s*Character Infobox/i.test(text) || !/^upcoming$/i.test(field(text, 'type'))) continue
    const s = at(field(text, 'release_date'))
    if (isNaN(s) || s < now - 3 * DAY || s > now + 60 * DAY) continue
    const name = field(text, 'name') || p.title
    out.push({
      id: `${gameId}:banner:upcoming:${name}`, gameId, kind: 'banner', title: name, description: '⟦d.afkTeased⟧',
      start: new Date(s).toISOString(), end: new Date(s + 21 * DAY - 60_000).toISOString(), items: [], pulls: 0, source: 'api', precision: 'estimated',
      featured: [{ name, rarity: 5, icon: p.thumbnail?.source }],
    })
  }
  return out
}

async function banners(gameId: string): Promise<GameEvent[]> {
  const list = await query({ action: 'query', list: 'allpages', apprefix: 'Rate Up Recruitment/', aplimit: '500' })
  const dated = (list.query?.allpages ?? []).map(p => p.title).filter(t => /\/\d{4}-\d\d-\d\d$/.test(t))
    .sort((a, b) => a.slice(-10).localeCompare(b.slice(-10))).slice(-8)
  if (!dated.length) return []
  const j = await query({ action: 'query', titles: dated.join('|'), prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '640' })
  const now = Date.now()
  const rows: { p: Page; s: number; e: number; heroes: string[]; ret: boolean; file: string }[] = []
  for (const p of j.query?.pages ?? []) {
    const text = content(p)
    const s = at(field(text, 'time_start')), e = at(field(text, 'time_end'))
    const heroes = field(text, 'hero').split(';').map(h => h.trim()).filter(Boolean)
    if (!heroes.length || isNaN(s) || isNaN(e) || e <= s || e < now - 3 * DAY) continue
    const ret = /return/i.test(field(text, 'type')) || /Rate Up Return/.test(p.title)
    rows.push({ p, s, e, heroes, ret, file: field(text, 'image') })
  }
  const art = await bannerArt(rows)
  return rows.map(({ p, s, e, heroes, ret }) => ({
    id: `${gameId}:banner:${p.title}`, gameId, kind: 'banner' as const, title: heroes.join(' / '),
    description: `⟦d.charBanner⟧${ret ? ' · Rate Up Return' : ''}`,
    image: p.thumbnail?.source ?? art.banner(p.title, heroes),
    start: new Date(s).toISOString(), end: new Date(e).toISOString(),
    items: [], featured: heroes.map(name => ({ name, rarity: 5, icon: art.hero.get(name) })), pulls: 0, source: 'api' as const,
    precision: dayOnly(s, e),
  }))
}

/**
 * Arte de los banners. La plantilla `Rate Up Info` usa `|image=` o, por defecto, "Recruitment Rate Up <héroe>.png"; los de regreso (Rate Up Return)
 * no suelen tener imagen propia, así que se reutiliza la del banner original del primer héroe. Iconos de "destacados": la imagen de la página de cada héroe.
 * 1 consulta más (imageinfo + pageimages de los héroes), solo si hay banners vigentes.
 */
async function bannerArt(rows: { p: Page; heroes: string[]; file: string }[]) {
  const files = new Map<string, string[]>() // título de la página del banner → archivos candidatos
  for (const r of rows) files.set(r.p.title, [r.file, ...r.heroes.map(h => `Recruitment Rate Up ${h}.png`)].filter(Boolean).map(f => `File:${f.replace(/^File:/i, '')}`))
  const heroes = [...new Set(rows.flatMap(r => r.heroes))]
  const titles = [...new Set([...files.values()].flat()), ...heroes].slice(0, 50)
  const found = new Map<string, string>()
  if (titles.length) {
    const j = await query({ action: 'query', titles: titles.join('|'), prop: 'imageinfo|pageimages', iiprop: 'url', iiurlwidth: '640', piprop: 'thumbnail', pithumbsize: '160' })
      .catch(() => ({ query: { pages: [] as (Page & { imageinfo?: { thumburl?: string; url?: string }[] })[] } }))
    for (const p of (j.query?.pages ?? []) as (Page & { imageinfo?: { thumburl?: string; url?: string }[] })[]) {
      const src = p.imageinfo?.[0]?.thumburl ?? p.imageinfo?.[0]?.url ?? p.thumbnail?.source
      if (src) found.set(p.title, src)
    }
  }
  const hero = new Map(heroes.map(h => [h, found.get(h)]).filter((x): x is [string, string] => !!x[1]))
  return {
    hero,
    banner: (title: string, _heroes: string[]) => (files.get(title) ?? []).map(f => found.get(f)).find(Boolean),
  }
}

export async function syncAfkJourney(gameId: string): Promise<GameSync> {
  // Códigos (19 nov 2026): la lista de PocketGamer (la wiki no los lista). Su lista "activa" arrastra años de códigos con los nuevos arriba (84 el
  // 21 nov 2026: AFKJGIFT2024, PUMPKIN2025…): se corta en el primero que delata ser viejo (staleCode en codes.ts).
  const [ev, bn, cd, up] = await Promise.allSettled([events(gameId), banners(gameId), syncPocketGamerCodes('afk-journey', 'codes', true), upcomingHeroes(gameId)])
  if (ev.status === 'rejected' && bn.status === 'rejected') throw ev.reason
  const evs = ev.status === 'fulfilled' ? ev.value : []
  const modes = await datedModes(gameId, new Set(evs.map(e => e.id.split(':').slice(2).join(':')))).catch(() => [] as GameEvent[])
  const dated = bn.status === 'fulfilled' ? bn.value : []
  // El anunciado se va en cuanto hay banner con fecha que lo destaque.
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const teased = (up.status === 'fulfilled' ? up.value : []).filter(u => !dated.some(d => d.featured.some(f => key(f.name) === key(u.title))))
  return { events: [...evs, ...modes, ...dated, ...teased], patches: [], codes: cd.status === 'fulfilled' ? cd.value : [] }
}
