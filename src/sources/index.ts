import type { Game, GameEvent } from '../types'
import { GACHAFOCUS, syncGachafocus } from './gachafocus'
import { syncGame, type GameSync } from './ennead'
import { syncCznEvents } from './czn'
import { syncEpic7 } from './epic7'
import { syncFgo } from './fgo'
import { syncBlueArchive } from './mediawiki'
import { syncLimbus } from './limbus'
import { syncNikke } from './nikke'
import { syncGame8 } from './game8'
import { syncPrydwen } from './prydwen'
import { syncReverie } from './reverie'
import { syncReverse1999 } from './reverse1999'
import { syncStellaSora } from './stellasora'
import { syncUma } from './uma'
import { buildPatches, fetchHistory, finalize } from './versions'
import { syncArknights, syncEndfield } from './wiki'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * Gachafocus como complemento (corrige horas y añade lo menor que las wikis no listan) para los juegos con fuente propia.
 * Cada consulta cuenta ante sus protecciones, así que se limita a los juegos donde más aporta: Arknights, Blue Archive y
 * Reverse: 1999 (solo la página de eventos) y NIKKE (eventos y banners). Se ajusta en el servidor con GACHAFOCUS_EXTRAS:
 * "0" lo desactiva, "1" lo activa para todos los juegos, o una lista de ids ("nikke,arknights"). En la app sin servidor, VITE_GACHAFOCUS_EXTRAS.
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
const EXTRAS_RAW: string | undefined = (env ? env.GACHAFOCUS_EXTRAS : import.meta.env.VITE_GACHAFOCUS_EXTRAS)?.trim()
/**
 * Interruptor general de gachafocus. DESACTIVADO por defecto: su web prohíbe la recolección automatizada (aviso del 6 nov 2026; ofrecerá una API de pago).
 * El código se conserva para usarlo con esa API: con GACHAFOCUS_ENABLED=1 (servidor) / VITE_GACHAFOCUS_ENABLED=1 (app sin servidor) vuelve a consultarse.
 */
const GF_ON = (env ? env.GACHAFOCUS_ENABLED : import.meta.env.VITE_GACHAFOCUS_ENABLED)?.trim() === '1'
const DEFAULT_EXTRAS: Record<string, 'events' | 'all'> = { arknights: 'events', bluearchive: 'events', reverse1999: 'events', nikke: 'all', wuwa: 'events', nte: 'events' }

/** Qué pide a gachafocus un juego que ya tiene fuente propia: nada, solo eventos, o eventos y banners. */
function extrasFor(id: string): 'none' | 'events' | 'all' {
  if (EXTRAS_RAW === '0') return 'none'
  if (EXTRAS_RAW === '1') return 'all'
  if (EXTRAS_RAW) return EXTRAS_RAW.split(',').map(x => x.trim()).includes(id) ? 'all' : 'none'
  return DEFAULT_EXTRAS[id] ?? 'none'
}

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
async function withGachafocus(id: string, gfKey: keyof typeof GACHAFOCUS, main: Promise<GameSync>, eventsOnly = false): Promise<GameSync> {
  if (!GF_ON) return main
  // Los juegos que no tienen otra fuente de eventos (`eventsOnly` forzado) lo usan siempre, pidiendo solo la página de eventos;
  // los demás, según extrasFor().
  if (!eventsOnly) {
    const mode = extrasFor(id)
    if (mode === 'none') return main
    eventsOnly = mode === 'events'
  }
  const [a, b0] = await Promise.allSettled([main, syncGachafocus(id, gfKey, eventsOnly)])
  // Si la fuente principal (p. ej. Prydwen para los banners) falla, se piden también los banners de gachafocus como respaldo.
  const b = eventsOnly && a.status === 'rejected' ? await syncGachafocus(id, gfKey, false).then(v => ({ status: 'fulfilled' as const, value: v }), reason => b0.status === 'fulfilled' ? b0 : { status: 'rejected' as const, reason }) : b0
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

/** Une dos fuentes complementarias de un mismo juego; con que responda una, basta. */
async function both(a: Promise<GameSync>, b: Promise<GameSync>): Promise<GameSync> {
  const [x, y] = await Promise.allSettled([a, b])
  if (x.status === 'rejected' && y.status === 'rejected') throw x.reason
  const ok = [x, y].flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
  return { events: ok.flatMap(s => s.events), patches: ok.flatMap(s => s.patches), codes: ok.flatMap(s => s.codes) }
}

/** "Virtual Tactical Simulation: Rossweisse" usa el arte del banner de ese combatiente en vez de la imagen genérica del aviso. */
function withBannerArt(s: GameSync): GameSync {
  const art = (name: string) => s.events.find(b => b.kind === 'banner' && b.image && b.featured.some(f => f.name.toLowerCase() === name.toLowerCase()))?.image
  return { ...s, events: s.events.map(e => {
    const who = e.kind === 'event' ? /^Virtual Tactical Simulation:\s*(.+)$/.exec(e.title)?.[1] : undefined
    const image = who && art(who)
    return image ? { ...e, image } : e
  }) }
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
    // Banners desde Prydwen (hora exacta, fuente propia); los eventos, de gachafocus si responde.
    // Sin gachafocus (apagado): los eventos salen de los avisos oficiales de STOVE (czn.ts).
    case 'czn': return GF_ON ? withGachafocus(id, game.api, syncPrydwen(id, game.api), true) : both(syncPrydwen(id, game.api), syncCznEvents(id)).then(withBannerArt)
    // WuWa y NTE: banners de Prydwen + eventos de Game8 (solo el día; "≈"); gachafocus los corrige si responde.
    case 'nte': return withGachafocus(id, game.api, both(syncPrydwen(id, game.api), syncGame8(id, game.api)))
    case 'reverse1999': return withGachafocus(id, 'reverse1999', syncReverse1999(id))
    // Stella Sora: banners exactos de su wiki; los eventos (que la wiki no fecha) siguen siendo de gachafocus.
    case 'stellasora': return withGachafocus(id, 'stellasora', syncStellaSora(id), true)
    // Epic Seven: banners de bannerhistory.app + eventos de los avisos oficiales de STOVE. Gachafocus solo si se reactiva (GACHAFOCUS_ENABLED=1).
    case 'epic7': return GF_ON ? syncGachafocus(id, game.api) : syncEpic7(id)
    case 'nikke': return withGachafocus(id, 'nikke', syncNikke(id))
    case 'fgo': return syncFgo(id)
    case 'bluearchive': return withGachafocus(id, 'bluearchive', syncBlueArchive(id))
    case 'limbus': return syncLimbus(id)
    case 'wuwa': {
      const [s, history] = await Promise.all([withGachafocus(id, 'wuwa', both(syncPrydwen(id, 'wuwa'), syncReverie(id, 'wuwa'))), fetchHistory('wuwa').catch(() => [])])
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
