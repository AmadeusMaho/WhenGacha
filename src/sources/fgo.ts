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
interface RawGacha { id: number; name: string; type: string; openedAt: number; closedAt: number; featuredSvtIds?: number[] }
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
      start: iso(g.openedAt), end: iso(g.closedAt), items: [], featured, pulls: 0, source: 'api',
    })
  }
  return { events, patches: [], codes: [] }
}
