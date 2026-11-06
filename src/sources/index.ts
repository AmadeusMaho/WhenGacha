import type { Game, GameEvent } from '../types'
import { GACHAFOCUS, syncGachafocus } from './gachafocus'
import { syncGame, type GameSync } from './ennead'
import { syncFgo } from './fgo'
import { syncBlueArchive } from './mediawiki'
import { syncLimbus } from './limbus'
import { syncNikke } from './nikke'
import { syncUma } from './uma'
import { buildPatches, fetchHistory, finalize } from './versions'
import { syncArknights, syncEndfield } from './wiki'

const HOUR = 3_600_000
const DAY = 24 * HOUR

const key = (s: string) => s.toLowerCase().replace(/\(.*?\)|[^a-z0-9]/g, '')

/** Índice del elemento de `base` que es el mismo que `e` (de gachafocus), con otro nombre o formato; -1 si no hay. */
function findMatch(base: GameEvent[], e: GameEvent, used: Set<number>): number {
  const k = key(e.title)
  const names = e.featured.map(f => f.name.toLowerCase())
  return base.findIndex((b, i) => {
    if (used.has(i)) return false
    if ((b.kind === 'banner') !== (e.kind === 'banner')) return false
    // Mismo periodo (aprox.): evita confundir una repetición (rerun) con el original.
    if (Math.abs(+new Date(b.start) - +new Date(e.start)) > 3 * DAY) return false
    const bk = key(b.title)
    if (k && bk && (bk.includes(k) || k.includes(bk))) return true
    if (e.kind !== 'banner') return false
    const hay = `${b.title} ${b.featured.map(f => f.name).join(' ')}`.toLowerCase()
    return names.some(n => hay.includes(n))
  })
}

/**
 * Completa una fuente principal con gachafocus. Gachafocus trae inicio y fin con hora exacta (ISO con zona),
 * así que manda en las horas: los eventos que ambas fuentes tienen se corrigen con su hora y pierden la marca
 * de aproximado; los que solo tiene gachafocus se añaden. La fuente principal conserva el resto (imágenes, nombres).
 */
async function withGachafocus(id: string, gfKey: keyof typeof GACHAFOCUS, main: Promise<GameSync>): Promise<GameSync> {
  const [a, b] = await Promise.allSettled([main, syncGachafocus(id, gfKey)])
  if (a.status === 'rejected' && b.status === 'rejected') throw a.reason
  const base: GameSync = a.status === 'fulfilled' ? a.value : { events: [], patches: [], codes: [] }
  if (b.status === 'rejected') return base
  const events = base.events.map(e => ({ ...e }))
  const used = new Set<number>()
  const extra: GameEvent[] = []
  for (const g of b.value.events) {
    const i = findMatch(events, g, used)
    if (i < 0) { extra.push(g); continue }
    used.add(i)
    events[i] = { ...events[i], start: g.start, end: g.end, precision: undefined }
  }
  return { ...base, events: [...events, ...extra] }
}

/** Descarga eventos, banners, desafíos, parches y códigos de un juego. */
export async function syncSource(game: Game): Promise<GameSync> {
  const id = game.id
  switch (game.api) {
    case 'arknights': return withGachafocus(id, 'arknights', syncArknights(id))
    case 'endfield': {
      const s = await withGachafocus(id, 'endfield', syncEndfield(id))
      return { ...s, patches: finalize(s.patches, game.patchCycleDays) }
    }
    case 'uma': return withGachafocus(id, 'uma', syncUma(id))
    case 'czn':
    case 'nte':
    case 'reverse1999':
    case 'epic7':
    case 'stellasora': return syncGachafocus(id, game.api)
    case 'nikke': return withGachafocus(id, 'nikke', syncNikke(id))
    case 'fgo': return syncFgo(id)
    case 'bluearchive': return withGachafocus(id, 'bluearchive', syncBlueArchive(id))
    case 'limbus': return syncLimbus(id)
    case 'wuwa': {
      const [s, history] = await Promise.all([syncGachafocus(id, 'wuwa'), fetchHistory('wuwa').catch(() => [])])
      return { ...s, patches: buildPatches(id, [], history, game.patchCycleDays) }
    }
    case 'genshin':
    case 'starrail':
    case 'zenless': {
      const [s, history] = await Promise.all([syncGame(id, game.api), fetchHistory(game.api).catch(() => [])])
      return { ...s, patches: buildPatches(id, s.patches, history, game.patchCycleDays) }
    }
    default: throw new Error(`Sin fuente para ${game.name}`)
  }
}

/** Las wikis y sitios de la comunidad se consultan menos seguido para no abusar. */
export const staleMs = (g: Game) => (g.api === 'genshin' || g.api === 'starrail' || g.api === 'zenless' ? HOUR : g.api === 'arknights' || g.api === 'endfield' || g.api === 'fgo' || g.api === 'bluearchive' ? 6 * HOUR : 3 * HOUR)
