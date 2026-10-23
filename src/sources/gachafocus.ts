import { viaProxy } from '../net'
import type { Featured, GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'

/**
 * Eventos y banners de varios juegos desde gachafocus.com.br (HTML renderizado en el servidor).
 * Se lee solo /en/<juego>/events y /en/<juego>/banners, que su robots.txt permite, a través del proxy con caché.
 * Las imágenes se cargan directo desde su sitio en el navegador (como al visitarlo); si fallan, se busca otra.
 */
const SITE = 'https://gachafocus.com.br'
const DAY = 86_400_000

interface Config {
  slug: string
  /** Eventos que en realidad son desafíos periódicos. */
  challenge?: RegExp
}

export const GACHAFOCUS: Record<string, Config> = {
  czn: { slug: 'chaos-zero-nightmare', challenge: /^overdrive/i },
  wuwa: { slug: 'wuthering-waves', challenge: /^(tower of adversity|whimpering wastes)/i },
  nte: { slug: 'neverness-to-everness' },
}

/** Zona preferida cuando una tarjeta trae fechas por región. */
const REGIONS = ['america', 'global', 'europe', 'asia']

const abs = (src?: string | null) => (!src ? undefined : src.startsWith('http') ? src : `${SITE}${src}`)
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

async function loadPage(slug: string, section: 'events' | 'banners'): Promise<Document> {
  const res = await fetch(viaProxy(`${SITE}/en/${slug}/${section}`))
  if (!res.ok) throw new Error(`gachafocus ${slug}/${section} → HTTP ${res.status}`)
  return new DOMParser().parseFromString(await res.text(), 'text/html')
}

/** Inicio y fin de una tarjeta, eligiendo la región preferida. */
function pickDates(tile: Element): { start: string; end: string } | null {
  const slots = [...tile.querySelectorAll('[data-server-slot]')].map(s => ({
    region: s.getAttribute('data-region') ?? '', start: s.getAttribute('data-start-iso'), end: s.getAttribute('data-end-iso'),
  })).filter(s => s.start && s.end)
  const slot = REGIONS.map(r => slots.find(s => s.region === r)).find(Boolean) ?? slots[0]
  if (slot) return { start: new Date(slot.start!).toISOString(), end: new Date(slot.end!).toISOString() }
  const t = [...tile.querySelectorAll('time[datetime]')].map(x => x.getAttribute('datetime')!)
  return t.length >= 2 ? { start: new Date(t[0]).toISOString(), end: new Date(t[1]).toISOString() } : null
}

function parseUnits(tile: Element): (Featured & { rank: number })[] {
  return [...tile.querySelectorAll('.strip-list .unit')].map(u => {
    const meta = text(u.querySelector('.unit-text small')) // "5★ · Resonator"
    const rank = Number(/(\d)/.exec(meta)?.[1] ?? /rarity-(\d)/.exec(u.className)?.[1] ?? 0)
    return { name: text(u.querySelector('.unit-text strong')), icon: abs(u.querySelector('img')?.getAttribute('src')), rarity: rank || undefined,
      tag: meta.split('·')[1]?.trim(), rank }
  }).filter(u => u.name)
}

function parseTiles(gameId: string, cfg: Config, doc: Document, section: 'events' | 'banners'): GameEvent[] {
  const out: GameEvent[] = []
  const from = Date.now() - 3 * DAY
  doc.querySelectorAll('main article.tile').forEach(tile => {
    const dates = pickDates(tile)
    const title = text(tile.querySelector('.tile-title'))
    if (!dates || !title || +new Date(dates.end) < from || +new Date(dates.end) <= +new Date(dates.start)) return
    const id = tile.getAttribute('data-card-id') ?? `${title}${dates.start}`
    const desc = text(tile.querySelector('.tile-desc')) || undefined
    const image = abs(tile.querySelector('.tile-art img')?.getAttribute('src'))

    if (section === 'banners') {
      const units = parseUnits(tile)
      const top = Math.max(0, ...units.map(u => u.rank))
      const stars = units.filter(u => u.rank === top)
      const featured: Featured[] = (stars.length ? stars : units).slice(0, 3).map(({ rank: _rank, ...f }) => f)
      const weapon = tile.getAttribute('data-banner-kind') === 'weapon'
      out.push({
        id: `${gameId}:banner:${id}`, gameId, kind: 'banner',
        title: featured.length ? featured.map(f => f.name).join(' / ') : title,
        description: [`${weapon ? 'Banner de arma' : 'Banner de personaje'} · ${title}`, desc].filter(Boolean).join('\n'),
        image, start: dates.start, end: dates.end, items: [], featured, pulls: 0, source: 'api',
      })
      return
    }
    const kind: Kind = cfg.challenge?.test(title) ? 'challenge' : 'event'
    out.push({ id: `${gameId}:${kind}:${id}`, gameId, kind, title, description: desc, image, start: dates.start, end: dates.end, items: [], featured: [], pulls: 0, source: 'api' })
  })
  return out
}

export async function syncGachafocus(gameId: string, key: keyof typeof GACHAFOCUS): Promise<GameSync> {
  const cfg = GACHAFOCUS[key]
  const [events, banners] = await Promise.allSettled([loadPage(cfg.slug, 'events'), loadPage(cfg.slug, 'banners')])
  if (events.status === 'rejected' && banners.status === 'rejected') throw events.reason
  return {
    events: [
      ...(events.status === 'fulfilled' ? parseTiles(gameId, cfg, events.value, 'events') : []),
      ...(banners.status === 'fulfilled' ? parseTiles(gameId, cfg, banners.value, 'banners') : []),
    ],
    patches: [],
    codes: [],
  }
}
