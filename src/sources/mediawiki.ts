import type { GameEvent } from '../types'
import { viaProxy } from '../net'
import type { GameSync } from './ennead'

/**
 * Fuentes que se leen del HTML ya renderizado de una wiki MediaWiki (API `action=parse`):
 * Blue Archive (Global). Las páginas las edita la comunidad, así que el
 * formato puede cambiar y las fechas pueden retrasarse respecto al juego.
 */
const DAY = 86_400_000

async function parsePage(base: string, page: string): Promise<Document> {
  const qs = new URLSearchParams({ action: 'parse', page, prop: 'text', format: 'json', origin: '*', disableeditsection: '1', disabletoc: '1' })
  const res = await fetch(viaProxy(`${base}?${qs}`))
  if (!res.ok) throw new Error(`${new URL(base).hostname} → HTTP ${res.status}`)
  const json = await res.json()
  const html: string | undefined = json?.parse?.text?.['*']
  if (!html) throw new Error(`${new URL(base).hostname}: ${json?.error?.info ?? 'respuesta vacía'}`)
  return new DOMParser().parseFromString(html, 'text/html')
}

const inWindow = (s: number, e: number) => e > s && e > Date.now() - 3 * DAY && s < Date.now() + 120 * DAY

/* ---------- Blue Archive (servidor Global) ---------- */
const wikiImg = (src: string | null | undefined, from: string, to: string) => (src ? `https:${src.replace(from, to)}` : undefined)

/** Banners de reclutamiento del servidor Global: los de un mismo periodo se agrupan en una sola barra. */
async function blueArchiveBanners(gameId: string): Promise<GameEvent[]> {
  const doc = await parsePage('https://bluearchive.wiki/w/api.php', 'Banner_List_(Global)')
  const groups = new Map<string, { s: number; e: number; names: string[]; tags: (string | undefined)[]; img?: string; rerun: boolean }>()
  for (const row of doc.querySelectorAll('tr[data-server="gl"]')) {
    const dates = [...row.querySelectorAll('.datetime')].map(d => +new Date(d.getAttribute('data-datetime') ?? ''))
    if (dates.length < 2 || dates.some(isNaN) || !inWindow(dates[0], dates[1]) || dates[1] - dates[0] > 120 * DAY) continue
    const name = row.querySelector('td:nth-child(2) a')?.textContent?.trim()
    if (!name) continue
    const key = `${dates[0]}-${dates[1]}`
    const g = groups.get(key) ?? { s: dates[0], e: dates[1], names: [], tags: [], img: undefined, rerun: true }
    g.names.push(name)
    g.tags.push(/fes/i.test(row.getAttribute('data-type') ?? '') ? 'Fes' : undefined)
    g.img ??= wikiImg(row.querySelector('td.image img')?.getAttribute('src'), '/300px-', '/600px-')
    if (row.getAttribute('data-release') !== 'rerun') g.rerun = false
    groups.set(key, g)
  }
  return [...groups.entries()].map(([key, g]) => ({
    id: `${gameId}:banner:${key}`,
    gameId,
    kind: 'banner' as const,
    title: g.names.slice(0, 3).join(' / ') + (g.names.length > 3 ? ` +${g.names.length - 3}` : ''),
    description: [g.rerun ? '⟦d.rerun⟧' : '', g.names.length > 3 ? g.names.join(', ') : ''].filter(Boolean).join('\n') || undefined,
    image: g.img,
    start: new Date(g.s).toISOString(),
    end: new Date(g.e).toISOString(),
    items: [],
    featured: g.names.slice(0, 3).map((name, i) => ({ name, rarity: 3, tag: g.tags[i] })),
    pulls: 0,
    source: 'api' as const,
  }))
}

export async function syncBlueArchive(gameId: string): Promise<GameSync> {
  const [doc, banners] = await Promise.all([
    parsePage('https://bluearchive.wiki/w/api.php', 'Events'),
    blueArchiveBanners(gameId).catch(() => []),
  ])
  const events: GameEvent[] = [...banners]
  for (const row of doc.querySelectorAll('#eventtable tr[data-event-id]')) {
    // Solo cuentan los eventos con periodo (inicio y fin) ya anunciado para el servidor Global.
    const dates = [...row.querySelectorAll('td.event-region-gl .datetime')].map(d => +new Date(d.getAttribute('data-datetime') ?? ''))
    if (dates.length < 2 || dates.some(isNaN)) continue
    const [s, e] = dates
    if (!inWindow(s, e)) continue
    const title = (row.querySelector('.event-region-gl .event-title') ?? row.querySelector('.event-title'))?.textContent?.trim()
    if (!title) continue
    const src = row.querySelector('.event-promo img')?.getAttribute('src')
    const release = row.getAttribute('data-release')
    events.push({
      id: `${gameId}:event:${row.getAttribute('data-event-id')}:${s}`,
      gameId,
      kind: 'event',
      title,
      description: release === 'rerun' ? '⟦d.rerun⟧' : undefined,
      image: wikiImg(src, '/160px-', '/320px-'),
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      items: [],
      featured: [],
      pulls: 0,
      source: 'api',
    })
  }
  return { events, patches: [], codes: [] }
}
