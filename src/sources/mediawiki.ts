import type { GameEvent } from '../types'
import { viaProxy } from '../net'
import type { GameSync } from './ennead'

/**
 * Fuentes que se leen del HTML ya renderizado de una wiki MediaWiki (API `action=parse`):
 * FGO (servidor US) y Blue Archive (Global). Las páginas las edita la comunidad, así que el
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

/* ---------- Fate/Grand Order (servidor US) ---------- */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** Los eventos de FGO US cambian a las 18:00 hora del Pacífico; la wiki solo publica el día. */
const FGO_HOUR = 18

/** "October 16, 2026 ~ November 5, 2026 PST" -> inicio y fin en UTC. */
function fgoRange(text: string): [number, number] | null {
  const m = /([A-Za-z]+) (\d{1,2}), (\d{4})\s*[~–-]\s*([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(text)
  if (!m) return null
  const at = (mon: string, d: string, y: string) => {
    const mi = MONTHS.indexOf(mon.toLowerCase())
    return mi < 0 ? NaN : Date.UTC(+y, mi, +d, FGO_HOUR - ptOffset(+y, mi, +d))
  }
  const s = at(m[1], m[2], m[3]), e = at(m[4], m[5], m[6])
  return isNaN(s) || isNaN(e) ? null : [s, e]
}

/** Hora del Pacífico en una fecha: PDT entre el segundo domingo de marzo y el primer domingo de noviembre. */
function ptOffset(y: number, m: number, d: number): number {
  const nthSunday = (month: number, n: number) => 1 + ((7 - new Date(Date.UTC(y, month, 1)).getUTCDay()) % 7) + (n - 1) * 7
  const t = Date.UTC(y, m, d)
  return t >= Date.UTC(y, 2, nthSunday(2, 2)) && t < Date.UTC(y, 10, nthSunday(10, 1)) ? -7 : -8
}

/** Banners de invocación del servidor NA, de la lista de GamePress (solo las filas con periodo NA). */
async function fgoBanners(gameId: string): Promise<GameEvent[]> {
  const res = await fetch(viaProxy('https://grandorder.gamepress.gg/summon-banner-list'))
  if (!res.ok) throw new Error(`gamepress → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const events: GameEvent[] = []
  for (const row of doc.querySelectorAll('div.table-row')) {
    const img = row.querySelector('img')
    if (!img || !row.textContent?.includes('NA:')) continue
    const na = [...row.querySelectorAll('li')].find(li => li.firstElementChild?.firstElementChild?.textContent?.trim() === 'NA:')
    const [from, to] = [...(na?.querySelectorAll('div > div:not(:first-child)') ?? [])].map(d => d.textContent?.trim() ?? '')
    const at = (iso: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
      return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], FGO_HOUR - ptOffset(+m[1], +m[2] - 1, +m[3])) : NaN
    }
    const s = at(from), e = at(to)
    if (isNaN(s) || isNaN(e) || !inWindow(s, e)) continue
    const names = [...new Set([...row.querySelectorAll('a[href^="/c/servants/"]')].map(a => a.textContent?.trim() ?? '').filter(Boolean))]
    const raw = row.querySelector('img + span')?.textContent?.trim() ?? ''
    const label = raw.replace(/\s*(Pickup(\s\d+)?|Summon|\(Daily\))(\s+(Pickup(\s\d+)?|Summon|\(Daily\)))*$/i, '').trim() || raw
    events.push({
      id: `${gameId}:banner:${raw}:${s}`,
      gameId,
      kind: 'banner',
      title: names.length && names.length <= 3 ? names.join(' / ') : label,
      description: names.length > 3 || !names.length ? undefined : label,
      image: img.getAttribute('src')?.startsWith('https://') ? img.getAttribute('src')! : undefined,
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      items: [],
      featured: names.slice(0, 3).map(name => ({ name })),
      pulls: 0,
      precision: 'approx',
      source: 'api',
    })
  }
  return events
}

export async function syncFgo(gameId: string): Promise<GameSync> {
  const [doc, banners] = await Promise.all([
    parsePage('https://fategrandorder.fandom.com/api.php', 'Event_List_(US)'),
    fgoBanners(gameId).catch(() => []),
  ])
  const events: GameEvent[] = [...banners]
  for (const h of doc.querySelectorAll('h2')) {
    const box = h.parentElement
    const range = fgoRange(box?.querySelector('p b')?.parentElement?.textContent ?? '')
    const link = h.querySelector('a')
    if (!box || !range || !link) continue
    const [s, e] = range
    if (!inWindow(s, e)) continue
    const title = (link.textContent ?? '').replace(/\s*\(US\)\s*$/, '').trim()
    const img = box.querySelector('img')
    const src = img?.getAttribute('data-src') ?? undefined
    events.push({
      id: `${gameId}:event:${title}:${s}`,
      gameId,
      kind: 'event',
      title,
      image: src?.startsWith('https://') ? src : undefined,
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      items: [],
      featured: [],
      pulls: 0,
      minor: /campaign/i.test(title) ? true : undefined,
      precision: 'approx',
      source: 'api',
    })
  }
  return { events, patches: [], codes: [] }
}

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
