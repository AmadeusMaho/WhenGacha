import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Dragon Ball Legends (Bandai Namco; un solo servidor mundial). Fuente revisada el 27 nov 2026: dblegends.net, la base de datos de la comunidad
 * (datos del juego; robots.txt sin reglas). legends.dbz.space, la otra, estaba caída (522) ese día.
 *  - /summons: todo el catálogo de banners en `<script id="gacha" type="application/json">` (`id`, `type` 0 Zenkai / 1 Ticket / 2 Crystal, `name`,
 *    `img`, `begin`/`end` en Unix, `perm`, `stepup`). Se toman los de cristales y los de tickets limitados vigentes o próximos, no los permanentes.
 *  - /events: lo mismo para los eventos (`<script id="events">`: `id`, `name`, `img`, `begin`, `end`, `perm`).
 *  - /banner/<id>: los destacados ("Featured Units", con su retrato `/assets/card_icons/…webp`). 1,2 MB por página: como mucho 12 por ciclo, con
 *    caché de 24 h.
 * Las horas son las del juego (exactas). Sin códigos de canje: el juego no los tiene. Sin recompensas: la base de datos no las publica.
 */
const BASE = 'https://dblegends.net'
const DAY = 86_400_000

interface Row { id: number; name: string; img: string; begin: number; end: number; perm?: number; type?: number; stepup?: number }

/** El JSON de `<script id="<id>" type="application/json">`. */
export function dblJson(html: string, id: string): Row[] {
  const a = html.indexOf(`<script id="${id}"`)
  if (a < 0) return []
  const s = html.indexOf('>', a) + 1
  try { return JSON.parse(html.slice(s, html.indexOf('</script>', s))) as Row[] } catch { return [] }
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')

/** Destacados de /banner/<id>: la sección "Featured Units", cada unidad con su nombre y su primer retrato. */
export function dblFeatured(html: string): Featured[] {
  const i = html.search(/<h2 class="bv-h">Featured Units/)
  if (i < 0) return []
  const end = html.indexOf('</section>', i)
  const block = html.slice(i, end > i ? end : i + 200_000)
  const out: Featured[] = []
  for (const m of block.matchAll(/<div class="gunit(?! si)[^"]*"[^>]*>\s*<a href="character\/\d+"[^>]*data-charaname="([^"]+)"[^>]*data-rarity="([A-Z]+)"[\s\S]*?<img[^>]*src="(\/assets\/card_icons\/[^"]+)"/g)) {
    const name = decode(m[1])
    if (!out.some(f => f.name === name)) out.push({ name, icon: `${BASE}${m[3]}`, tag: m[2] === 'LEGEND' ? 'LL' : m[2] === 'ULTRA' ? 'UL' : m[2][0] + m[2].slice(1).toLowerCase(), rarity: m[2] === 'ULTRA' || m[2] === 'LEGEND' ? 5 : 4 })
  }
  return out.slice(0, 8)
}

const get = async (path: string) => { const r = await fetch(viaProxy(`${BASE}${path}`)); if (!r.ok) throw new Error(`dblegends ${path} → HTTP ${r.status}`); return r.text() }

export async function syncDbLegends(gameId: string): Promise<GameSync> {
  const now = Date.now()
  const live = (r: Row) => !r.perm && r.end * 1000 > now - DAY && r.begin * 1000 < now + 30 * DAY && r.end - r.begin < 120 * 86_400
  const [s, e] = await Promise.allSettled([get('/summons'), get('/events')])
  if (s.status === 'rejected' && e.status === 'rejected') throw s.reason
  const events: GameEvent[] = []
  if (s.status === 'fulfilled') {
    // Banners: los de cristales (2) y los de tickets (1) limitados; los Zenkai (0) son permanentes.
    const rows = dblJson(s.value, 'gacha').filter(r => r.type !== 0 && live(r)).sort((a, b) => a.begin - b.begin)
    let pages = 0
    for (const r of rows) {
      let featured: Featured[] = []
      // Destacados de todos los vigentes o próximos (cristales y tickets), salvo los de bienvenida, que no cambian; como mucho 12 páginas (caché de
      // 24 h: si una agota el tiempo de espera, sale en el ciclo siguiente).
      if (pages < 12 && !/start dash|welcome|comeback/i.test(r.name)) {
        pages++
        featured = await get(`/banner/${r.id}`).then(dblFeatured).catch(() => [])
      }
      events.push({
        id: `${gameId}:banner:${r.id}`, gameId, kind: 'banner', title: decode(r.name), image: `${BASE}/assets/gasha/${r.img}.webp`,
        start: new Date(r.begin * 1000).toISOString(), end: new Date(r.end * 1000).toISOString(),
        items: [], featured, pulls: 0, source: 'api', official: true,
        // Los de tickets (los dan los eventos o la tienda) y los gratuitos son secundarios.
        minor: r.type === 1 || /free|weekend/i.test(r.name) ? true : undefined,
      })
    }
  }
  if (e.status === 'fulfilled') {
    for (const r of dblJson(e.value, 'events').filter(live)) {
      events.push({
        id: `${gameId}:event:${r.id}`, gameId, kind: 'event', title: decode(r.name), image: `${BASE}/assets/events/${r.img}.webp`,
        start: new Date(r.begin * 1000).toISOString(), end: new Date(r.end * 1000).toISOString(),
        items: [], featured: [], pulls: 0, source: 'api', official: true,
        // Eventos de un día y modos de farmeo (Boost, Arts, Equipment, Zenkai Rush) son secundarios.
        minor: r.end - r.begin <= 86_400 || /boost|arts |equipment|supporter level|weekend|double-up|seed harvest/i.test(r.name) ? true : undefined,
      })
    }
  }
  return { events, patches: [], codes: [] }
}
