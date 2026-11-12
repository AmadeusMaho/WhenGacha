import { viaProxy } from '../net'
import type { GameEvent, Kind, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { cardList } from './challenges'
import { pullsIn } from './pulls'

/**
 * AFK Journey (Global) desde su wiki de Fandom (afk-journey.fandom.com, API de MediaWiki; robots.txt lo permite). Revisado el 7 nov 2026: al día.
 *  - Eventos: los 40 últimos de "Category:Events", con `{{Event Infobox |name |time_start = 2026-11-02 00:00 |time_end = 2026-11-22 23:59 |group = Guild}}`.
 *    Los que son ediciones con fecha de un modo que se repite ("Horn Rally/2026-11-02", "Titan Reaver/2026-10-24") y de grupo Guild/Strategy son rotatorios.
 *    Recompensas: todos los `{{Card List|…}}` / `{{Item List|…}}` de la página (Diamond*50;Guild Medal*100), sumados: el máximo que da.
 *  - Banners: subpáginas "Rate Up Recruitment/<fecha>" y "…/Rate Up Return/<fecha>" con `{{Rate Up Info |hero = Kazim;Evie |time_start |time_end}}`.
 *  - Hora: UTC. Lo dice la documentación de `Template:Rate Up Info` ("banner start (UTC)") y `Template:Event Infobox` calcula con "GMT+0".
 *  - **Códigos: no hay fuente fiable.** La página "Redemption Code" de la wiki está marcada para rehacer y su lista de "activos" es de 2024.
 * 3–4 consultas por ciclo (caché de 12 h en el proxy).
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
  const [ev, bn] = await Promise.allSettled([events(gameId), banners(gameId)])
  if (ev.status === 'rejected' && bn.status === 'rejected') throw ev.reason
  return { events: [...(ev.status === 'fulfilled' ? ev.value : []), ...(bn.status === 'fulfilled' ? bn.value : [])], patches: [], codes: [] }
}
