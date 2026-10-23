import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * NIKKE (servidor Global).
 *  - Banners: historial de lootandwaifus.com (HTML de la página, lista GLOBAL), vía proxy con caché.
 *  - Eventos: tabla de la wiki de Fandom (API de MediaWiki), horas en UTC+9.
 */
const LOOT = 'https://lootandwaifus.com'
const WIKI = 'nikke-goddess-of-victory-international.fandom.com'
const DAY = 86_400_000
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
/** Texto de una celda: los <br> cuentan como espacio ("28 October 2026<br>23:59:59"). */
function cellText(cell: Element): string {
  const c = cell.cloneNode(true) as Element
  c.querySelectorAll('br').forEach(b => b.replaceWith(' '))
  return text(c)
}
const monthOf = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase())

/* ---------- banners ---------- */
/** Los banners globales empiezan y terminan a estas horas UTC (las que muestra el propio sitio). */
const BANNER_START_H = 6
const BANNER_END = { h: 14, m: 59, s: 59 }

async function loadBanners(gameId: string): Promise<GameEvent[]> {
  const res = await fetch(viaProxy(`${LOOT}/nikke-banner-history/`))
  if (!res.ok) throw new Error(`lootandwaifus → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY
  const out: GameEvent[] = []
  doc.querySelectorAll('.bh-list[data-server="GLOBAL"] .bh-row').forEach(row => {
    const name = text(row.querySelector('h3'))
    const m = /([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})\s*-\s*([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})/.exec(text(row.querySelector('.bh-dates')))
    if (!name || !m || monthOf(m[1]) < 0 || monthOf(m[4]) < 0) return
    const start = Date.UTC(+m[3], monthOf(m[1]), +m[2], BANNER_START_H)
    const end = Date.UTC(+m[6], monthOf(m[4]), +m[5], BANNER_END.h, BANNER_END.m, BANNER_END.s)
    if (end < from || start > to || end <= start) return
    const src = row.querySelector('img.bh-portrait')?.getAttribute('src')
    const icon = src ? (src.startsWith('http') ? src : `${LOOT}${src}`) : undefined
    const traits = [...row.querySelectorAll('.bh-icon')].map(i => i.getAttribute('title')).filter(Boolean) as string[]
    const featured: Featured[] = [{ name, icon, rarity: /\bssr\b/.test(row.className) ? 5 : 4, tag: traits.slice(0, 3).join(' · ') || undefined }]
    out.push({
      id: `${gameId}:banner:${name}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title: name,
      description: `Banner de personaje${traits.length ? ` · ${traits.join(' · ')}` : ''}`,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured, pulls: 0, source: 'api',
    })
  })
  return out
}

/* ---------- eventos ---------- */
const UTC9 = 9 * 3_600_000

/** "8 October 2026" o "28 October 2026 23:59:59" (UTC+9) -> ms UTC. Sin hora: la indicada por defecto. */
function parseWikiDate(s: string, def: [number, number, number]): number | null {
  const m = /(\d{1,2}) ([A-Za-z]+) (\d{4})(?: (\d{1,2}):(\d{2}):(\d{2}))?/.exec(s)
  if (!m || monthOf(m[2]) < 0) return null
  const [h, mi, se] = m[4] ? [+m[4], +m[5], +m[6]] : def
  return Date.UTC(+m[3], monthOf(m[2]), +m[1], h, mi, se) - UTC9
}

async function loadEvents(gameId: string): Promise<GameEvent[]> {
  const qs = new URLSearchParams({ action: 'parse', page: 'Event', prop: 'text', format: 'json', origin: '*' })
  const res = await fetch(viaProxy(`https://${WIKI}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${WIKI} → HTTP ${res.status}`)
  const html = (await res.json())?.parse?.text?.['*'] as string | undefined
  if (!html) throw new Error('la wiki no devolvió la lista de eventos')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = [...doc.querySelectorAll('table')].find(t => /Start/.test(text(t.rows[0])) && /End/.test(text(t.rows[0])))
  if (!table) throw new Error('no se encontró la tabla de eventos')

  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY
  const out: GameEvent[] = []
  let last: { start: number; end: number } | null = null
  for (const row of [...table.rows].slice(1)) {
    const cells = [...row.cells]
    let range = last
    if (cells.length >= 3) {
      const start = parseWikiDate(cellText(cells[1]), [5, 0, 0]), end = parseWikiDate(cellText(cells[2]), [4, 59, 59])
      if (start === null || end === null) continue
      range = last = { start, end }
    }
    if (!range || range.end < from || range.start > to || range.end <= range.start) continue

    const link = cells[0].querySelector('a')?.getAttribute('title') ?? ''
    const alt = cells[0].querySelector('img')?.getAttribute('data-image-name') ?? ''
    const name = (link.startsWith('File:') || !link ? (link || alt).replace(/^File:/, '').replace(/ logo\.(png|jpe?g|webp)$/i, '') : link).trim()
    if (!name) continue
    const img = cells[0].querySelector('img')
    const raw = img?.getAttribute('data-src') ?? img?.getAttribute('src') ?? ''
    const image = raw.startsWith('https') ? raw.replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/640') : undefined
    out.push({
      id: `${gameId}:event:${name}:${new Date(range.start).toISOString().slice(0, 10)}`, gameId, kind: 'event', title: name,
      description: 'Evento del servidor Global (horas en UTC+9 según la wiki).',
      image, start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString(), items: [], featured: [], pulls: 0, source: 'api',
    })
  }
  return out
}

export async function syncNikke(gameId: string): Promise<GameSync> {
  const [banners, events] = await Promise.allSettled([loadBanners(gameId), loadEvents(gameId)])
  if (banners.status === 'rejected' && events.status === 'rejected') throw banners.reason
  return {
    events: [...(events.status === 'fulfilled' ? events.value : []), ...(banners.status === 'fulfilled' ? banners.value : [])],
    patches: [],
    codes: [],
  }
}
