import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Fate/Grand Order (servidor NA) desde la API abierta de Atlas Academy (datos extraídos del propio juego).
 * Las horas son instantes exactos (epoch), sin suposiciones: los eventos del servidor NA cambian a las
 * 21:00 PDT / 20:00 PST, y eso ya viene en el dato.
 */
const BASE = 'https://api.atlasacademy.io/export/NA'
const DAY = 86_400_000

interface RawEvent { id: number; type: string; name: string; startedAt: number; endedAt: number }
interface RawGacha { id: number; name: string; type: string; openedAt: number; closedAt: number; featuredSvtIds?: number[]; imageId?: number }

/** Arte del banner de invocación (mismo CDN de Atlas Academy; comprobado el 9 nov 2026 con los banners vigentes). */
const summonArt = (imageId?: number) => imageId ? `https://static.atlasacademy.io/NA/SummonBanners/img_summon_${imageId}.png` : undefined
/** Máximo de fichas de evento que se piden por ciclo (solo para su arte). */
const MAX_EVENT_ART = 6

/** Arte de un evento: el campo `banner` de su ficha (`/nice/NA/event/<id>`); las campañas y quests sueltas no tienen. */
async function eventArt(id: number): Promise<string | undefined> {
  const res = await fetch(viaProxy(`https://api.atlasacademy.io/nice/NA/event/${id}`))
  if (!res.ok) return undefined
  const banner = ((await res.json()) as { banner?: string }).banner
  return typeof banner === 'string' && banner.startsWith('https://static.atlasacademy.io/') ? banner : undefined
}
interface RawServant { id: number; name: string; rarity?: number; face?: string; className?: string }

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(viaProxy(`${BASE}/${file}.json`))
  if (!res.ok) throw new Error(`atlasacademy ${file} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Los eventos "permanentes" tienen un fin ficticio en 2030. */
const LIMIT = Date.UTC(2029, 0, 1) / 1000

/** Campañas de bonificación (AP, EXP, vínculo…): se ocultan por defecto. */
const CAMPAIGN = /campaign$/i

const clean = (s: string) => s.replace(/\[[0-9A-Fa-f]{6}\]|\[-\]/g, '').replace(/\s+/g, ' ').trim()
const iso = (s: number) => new Date(s * 1000).toISOString()

export async function syncFgo(gameId: string): Promise<GameSync> {
  const [evs, gachas, servants] = await Promise.all([
    getJson<RawEvent[]>('basic_event'),
    getJson<RawGacha[]>('nice_gacha'),
    getJson<RawServant[]>('basic_servant').catch(() => [] as RawServant[]),
  ])
  const from = Date.now() / 1000 - 3 * DAY / 1000, to = Date.now() / 1000 + 120 * DAY / 1000
  const inWindow = (s: number, e: number) => e > s && e < LIMIT && e > from && s < to
  const svt = new Map(servants.map(s => [s.id, s]))

  const seen = new Set<string>()
  const events: GameEvent[] = []
  for (const r of evs) {
    if (!inWindow(r.startedAt, r.endedAt)) continue
    const title = clean(r.name)
    if (!title) continue
    const key = `${title}|${r.startedAt}|${r.endedAt}`
    if (seen.has(key)) continue // el juego repite la misma campaña con varios ids
    seen.add(key)
    const campaign = CAMPAIGN.test(r.type)
    events.push({
      id: `${gameId}:event:${r.id}`, gameId, kind: 'event', title,
      start: iso(r.startedAt), end: iso(r.endedAt), items: [], featured: [], pulls: 0, source: 'api',
      minor: campaign || /^recollection quest$/i.test(title) ? true : undefined,
    })
  }

  for (const g of gachas) {
    if (g.type !== 'stone' || !g.featuredSvtIds?.length || !inWindow(g.openedAt, g.closedAt)) continue
    const featured: Featured[] = g.featuredSvtIds.slice(0, 3).map(id => {
      const s = svt.get(id)
      return { name: s?.name ?? `#${id}`, icon: s?.face, rarity: s?.rarity, tag: s?.className }
    })
    const named = featured.every(f => !f.name.startsWith('#'))
    events.push({
      id: `${gameId}:banner:${g.id}`, gameId, kind: 'banner',
      title: named ? featured.map(f => f.name).join(' / ') : clean(g.name),
      description: clean(g.name),
      image: summonArt(g.imageId),
      start: iso(g.openedAt), end: iso(g.closedAt), items: [], featured, pulls: 0, source: 'api',
    })
  }

  // Arte de los eventos principales (no las campañas), en serie y con tope; las campañas que nombran un evento entre comillas
  // ("\"Mystery House Crafters\" Related Servant Bond…") usan el arte de ese evento.
  const main = events.filter(e => e.kind === 'event' && !e.minor).slice(0, MAX_EVENT_ART)
  for (const e of main) e.image = await eventArt(+e.id.split(':').pop()!).catch(() => undefined)
  for (const e of events) {
    if (e.kind !== 'event' || e.image) continue
    const quoted = /"([^"]{4,})"/.exec(e.title)?.[1]
    const parent = quoted && events.find(p => p.image && p.kind === 'event' && p.title.includes(quoted))
    if (parent) e.image = parent.image
  }
  return { events, patches: [], codes: [] }
}
