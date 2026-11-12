import type { Game, GameEvent } from '../types'
import { GACHAFOCUS, syncGachafocus } from './gachafocus'
import { syncGame, syncHoyoCodes, type GameSync } from './ennead'
import { hasWikiCodes, syncWikiCodes } from './codes'
import { syncBluepoch } from './bluepoch'
import { withChallengeRewards, type ChallengePage } from './challenges'
import { hi3MemorialArena, r99Limbo } from './cycles'
import { syncCznEvents } from './czn'
import { discordChannel, syncDiscord } from './discord'
import { syncAfkJourney } from './afkjourney'
import { syncBd2 } from './bd2'
import { syncInfinityNikki } from './infinitynikki'
import { syncEpic7 } from './epic7'
import { syncDna } from './dna'
import { syncTrickcal, syncTrickcalNews } from './trickcal'
import { syncGfl2, syncGfl2Official } from './gfl2'
import { mhoIcons, syncMho, syncMhoNews } from './mho'
import { BLEACH_ICONS, syncBleach } from './bleach'
import { syncFgo } from './fgo'
import { syncBlueArchive } from './mediawiki'
import { syncKuro, syncPgr, wuwaChallengeRewards, wuwaChallenges, wuwaMatrix, type WuwaRewards } from './kuro'
import { syncHonkai3 } from './honkai3'
import { eventRewards, syncHoyoWiki } from './hoyowiki'
import { pullsIn, type PullGame } from './pulls'
import { syncLimbus } from './limbus'
import { syncNikke } from './nikke'
import { syncNikkeGg } from './nikkegg'
import { syncNevernessGg } from './nevernessgg'
import { game8Recurring, syncGame8 } from './game8'
import { syncPrydwen } from './prydwen'
import { syncReverie } from './reverie'
import { syncReverse1999 } from './reverse1999'
import { syncStellaSora, syncStellaSoraNews } from './stellasora'
import { syncUma } from './uma'
import { alignPatches, buildPatches, fetchHistory, finalize } from './versions'
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

const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2)
/** Nombres casi iguales: comparten al menos el 70 % de las palabras (o la misma raíz de 6 letras). */
function similar(a: string, b: string): boolean {
  const A = wordsOf(a), B = wordsOf(b)
  if (!A.length || !B.length) return false
  const hit = A.filter(w => B.some(x => x === w || (w.length >= 6 && x.slice(0, 6) === w.slice(0, 6)))).length
  return hit / Math.max(A.length, B.length) >= 0.7
}

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
 * así que corrige las horas de wikis y agregadores: los eventos que ambas fuentes tienen toman su hora y pierden la marca
 * de aproximado; los que solo tiene gachafocus se añaden. La fuente principal conserva el resto (imágenes, nombres).
 * Excepción: los eventos `official` (avisos del propio juego) con hora exacta no se tocan; las fuentes oficiales mandan.
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
    // Las fuentes oficiales mandan: gachafocus solo corrige sus horas si el aviso no las daba (marcadas "≈").
    if (events[i].official && !events[i].precision) continue
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

/**
 * Une una fuente oficial de eventos (manda en nombres y horas) con una de la comunidad (Reverie): de los eventos que tienen ambas,
 * la oficial conserva su imagen (salvo `communityArt`: cuando la oficial solo tiene la cabecera genérica del aviso, como Kuro) y toma de la otra
 * la descripción, los personajes y las recompensas que le falten; los que solo tiene la comunidad se añaden. Si una falla, queda la otra.
 */
async function officialFirst(official: Promise<GameSync>, community: Promise<GameSync>, communityArt = false): Promise<GameSync> {
  const [o, c] = await Promise.allSettled([official, community])
  if (o.status === 'rejected') {
    console.warn('[sources] fuente oficial:', (o.reason as Error)?.message ?? o.reason)
    if (c.status === 'rejected') throw o.reason
    return c.value
  }
  if (c.status === 'rejected') return o.value
  const events = o.value.events.map(e => ({ ...e }))
  const used = new Set<number>()
  const extra: GameEvent[] = []
  for (const r of c.value.events) {
    let i = findMatch(events, r, used)
    // Mismo nombre y mismo fin aunque la comunidad dé otro inicio (p. ej. Game8 con un día equivocado).
    if (i < 0) i = events.findIndex((e, j) => !used.has(j) && e.kind === r.kind && key(e.title) === key(r.title) && Math.abs(+new Date(e.end) - +new Date(r.end)) <= DAY)
    // Mismo periodo (±1 día) y nombre casi igual ("Unjust Judgement" / "Judgment"): al menos el 70 % de las palabras en común.
    if (i < 0) i = events.findIndex((e, j) => !used.has(j) && e.kind === r.kind && Math.abs(+new Date(e.start) - +new Date(r.start)) <= DAY
      && Math.abs(+new Date(e.end) - +new Date(r.end)) <= DAY && similar(e.title, r.title))
    if (i < 0) { extra.push(r); continue }
    used.add(i)
    events[i] = { ...events[i], image: communityArt ? r.image ?? events[i].image : events[i].image ?? r.image, description: events[i].description ?? r.description,
      // Destacados de la oficial, salvo que la comunidad traiga los mismos con retrato (Trickcal: el tuit dice "★3 Vivi"; lootandwaifus da su icono y rol).
      featured: events[i].featured.length && !(r.featured.some(f => f.icon) && events[i].featured.every(f => r.featured.some(x => x.name.toLowerCase() === f.name.toLowerCase())))
        ? events[i].featured : r.featured.length ? r.featured : events[i].featured,
      items: events[i].items.length ? events[i].items : r.items,
      pulls: events[i].pulls || r.pulls, hours: events[i].hours ?? r.hours }
  }
  // Códigos: los de la fuente oficial primero; sin repetir el mismo código (p. ej. el de Discord y el de la wiki).
  const codes = [...o.value.codes, ...c.value.codes].filter((x, i, all) => all.findIndex(y => y.code.toUpperCase() === x.code.toUpperCase()) === i)
  return { events: [...events, ...extra], patches: [...o.value.patches, ...c.value.patches], codes }
}

/**
 * HoYoverse: eventos que llegan sin recompensas (los de ennead que la lista de la wiki no trae; en HSR la "Event List" de la wiki está vacía para los
 * eventos en curso, nov 2026) → se busca la página del evento por su título y se lee su {{Event Rewards}} ("Magic Invitation": Tracks of Destiny…).
 * Una sola consulta (máx. 50 páginas) por ciclo; los que no tienen página o plantilla (p. ej. "Planar Fissure", de bonificación) se quedan igual.
 */
async function withWikiEventRewards(s: GameSync, host: string, game: PullGame): Promise<GameSync> {
  const need = s.events.filter(e => e.kind === 'event' && !e.items.length && +new Date(e.end) > Date.now())
  if (!need.length) return s
  const found = await eventRewards(host, need.map(e => e.title)).catch(() => new Map<string, { name: string; amount: number }[]>())
  if (!found.size) return s
  return { ...s, events: s.events.map(e => {
    const items = need.includes(e) ? found.get(e.title) : undefined
    return items ? { ...e, items, pulls: e.pulls || pullsIn(game, items.map(i => `${i.name} x${i.amount}`)).pulls } : e
  }) }
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

/** Página de la wiki con la tabla "Total Rewards" de cada desafío rotatorio (ver challenges.ts), por juego. */
const CHALLENGE_PAGES: Partial<Record<string, ChallengePage[]>> = {
  zenless: [
    { match: /^Shiyu Defense/i, page: 'Shiyu Defense/Critical Node' },
    { match: /^Deadly Assault/i, page: 'Deadly Assault' },
  ],
}

/**
 * CZN: rotatorios. Virtual Tactical Simulation llega de los avisos oficiales como evento: es un modo recurrente. Los demás modos recurrentes que los avisos
 * no traen (Full-Scale Offensive, Spiral Tower of Screams) salen de la lista de Game8 (su sección "Permanent Events" los agrupa). 1 página de Game8 por ciclo.
 */
const CZN_RECURRING = /Full[- ]Scale Offensive|Virtual Tactical Simulation|Spiral Tower|Great Rift/i
async function cznRecurring(s: GameSync): Promise<GameSync> {
  const events = s.events.map(e => e.kind === 'event' && CZN_RECURRING.test(e.title) ? { ...e, kind: 'challenge' as const } : e)
  const extra = await game8Recurring(s.events[0]?.gameId ?? 'czn', 'Chaos-Zero-Nightmare/archives/559899', CZN_RECURRING, events)
    .catch(err => { console.warn('[czn] game8:', (err as Error)?.message ?? err); return [] as GameEvent[] })
  return { ...s, events: [...events, ...extra] }
}

/** Descarga eventos, banners, desafíos, parches y códigos de un juego. */
/** Hora (UTC) a la que suelen salir las versiones: tras el mantenimiento, 11:00 UTC+8 (Endfield, 12:00 UTC+8). Para fechas de la wiki sin hora. */
const LAUNCH_UTC_HOUR: Record<string, number> = { wuwa: 3, genshin: 3, starrail: 3, zenless: 3, endfield: 4 }

/**
 * Iconos de recompensas de los juegos sin wiki (el recolector los busca en la wiki del juego, `withItemIcons` de collector.ts): MHO, la lista de objetos
 * de GameWith; BLEACH, los iconos oficiales de su web. Se aplica después de unir Discord, así también los avisos oficiales salen con icono.
 */
const ITEM_ICONS: Partial<Record<string, () => Promise<Map<string, string>>>> = { mho: mhoIcons, bleach: async () => BLEACH_ICONS }
async function withItemIcons(id: string, s: GameSync): Promise<GameSync> {
  const load = ITEM_ICONS[id]
  if (!load || !s.events.some(e => e.items.some(i => !i.icon))) return s
  const icons = await load().catch(() => new Map<string, string>())
  if (!icons.size) return s
  const find = (n: string) => { const k = n.toLowerCase().trim(); return icons.get(k) ?? icons.get(k.replace(/(?<!s)s$/, '')) ?? icons.get(k.replace(/^limited /, '')) }
  return { ...s, events: s.events.map(e => (e.items.some(i => !i.icon) ? { ...e, items: e.items.map(i => (i.icon ? i : { ...i, icon: find(i.name) })) } : e)) }
}

export async function syncSource(game: Game): Promise<GameSync> {
  // Cualquier juego con canal en DISCORD_CHANNELS (solo en el servidor): sus anuncios oficiales mandan y sus fuentes de siempre completan. docs/discord-bot.md
  const s0 = discordChannel(game.id) ? await officialFirst(syncDiscord(game.id), syncSourceRaw(game)) : await syncSourceRaw(game)
  const s = await withItemIcons(game.id, s0)
  const aligned = s.patches.length ? { ...s, patches: alignPatches(s.patches, s.events, LAUNCH_UTC_HOUR[game.api ?? ''], game.patchCycleDays) } : s
  // Códigos de canje: HoYoverse ya los trae (ennead); HI3 también sale de ennead y WuWa, R:1999 y NTE de la página de códigos de su wiki.
  if (aligned.codes.length || !game.api) return aligned
  const codes = game.api === 'honkai3' ? await syncHoyoCodes('honkai').catch(() => [])
    : hasWikiCodes(game.api) ? await syncWikiCodes(game.api).catch(() => [])
    : []
  return codes.length ? { ...aligned, codes } : aligned
}

async function syncSourceRaw(game: Game): Promise<GameSync> {
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
    case 'czn': return GF_ON ? withGachafocus(id, game.api, syncPrydwen(id, game.api), true) : both(syncPrydwen(id, game.api), syncCznEvents(id)).then(withBannerArt).then(cznRecurring)
    // WuWa y NTE: banners de Prydwen + eventos de Game8 (solo el día; "≈"); gachafocus los corrige si responde.
    // NTE: banners de Prydwen + avisos oficiales (vía neverness.gg, horas exactas) completados con Game8 (imágenes y eventos aún sin aviso, "≈").
    case 'nte': return withGachafocus(id, game.api, both(syncPrydwen(id, game.api), officialFirst(syncNevernessGg(id), syncGame8(id, game.api))))
      // Hunter's Crucible es el endgame recurrente de NTE (wiki: "recurrent event … end-game combat content"): rotatorio, no evento.
      .then(s => ({ ...s, events: s.events.map(e => e.kind === 'event' && /Hunter's Crucible/i.test(e.title) ? { ...e, kind: 'challenge' as const, description: '⟦d.nteCrucible⟧' } : e) }))
    // Avisos oficiales de Bluepoch (eventos y banners con hora exacta e imagen) + la wiki para lo que no traen.
    case 'reverse1999': return withGachafocus(id, 'reverse1999', officialFirst(syncBluepoch(id), syncReverse1999(id))).then(s => ({ ...s, events: [...s.events, ...r99Limbo(id)] }))
    // Stella Sora: avisos oficiales de stellasora.global (todos los eventos de la versión, hora exacta) + banners exactos de su wiki (con imagen).
    // Gachafocus solo si se reactiva.
    case 'stellasora': return withGachafocus(id, 'stellasora', officialFirst(syncStellaSoraNews(id), syncStellaSora(id)), true)
    // Epic Seven: banners de bannerhistory.app + eventos de los avisos oficiales de STOVE. Gachafocus solo si se reactiva (GACHAFOCUS_ENABLED=1).
    case 'epic7': return GF_ON ? syncGachafocus(id, game.api) : syncEpic7(id)
    // Notas de parche oficiales (vía nikke.gg) con hora exacta + Prydwen/wiki para banners y lo que no traen.
    case 'nikke': return withGachafocus(id, 'nikke', officialFirst(syncNikkeGg(id), syncNikke(id)))
    // BrownDust2: avisos oficiales (eventos, pickups, temporadas del Colosseum/Tower) de webapi.browndust2.com.
    case 'bd2': return syncBd2(id)
    // AFK Journey: eventos (con recompensas), rotatorios y banners de su wiki; sin códigos (no hay fuente fiable).
    case 'afkjourney': return syncAfkJourney(id)
    // Infinity Nikki: wiki (eventos, banners, códigos); con canal de Discord (#game-news y #redeem-codes oficiales), sus anuncios mandan.
    case 'infinitynikki': return syncInfinityNikki(id)
    // Duet Night Abyss: Game8 (eventos, banners Myriad, códigos) + Immersive Theatre (ciclo de 28 días); con canal de Discord ("dna"), sus anuncios mandan.
    case 'dna': return syncDna(id).then(s => ({ ...s, patches: finalize(s.patches, game.patchCycleDays) }))
    // Trickcal: Chibi Go: banners y códigos de lootandwaifus; eventos y horas exactas solo por Discord (tuits oficiales, canal "trickcal").
    // + los "Event Notice" de su web oficial (biligames), con hora exacta: mandan sobre lootandwaifus.
    case 'trickcal': return officialFirst(syncTrickcalNews(id), syncTrickcal(id))
    // Girls' Frontline 2: IOP Wiki (eventos del servidor global con hora exacta y recompensas de su tienda, banners con sus muñecas). Códigos por Discord.
    // + avisos oficiales de su web (sunborngame), con imagen y hora exacta: mandan.
    case 'gfl2': return officialFirst(syncGfl2Official(id), syncGfl2(id))
    // Monster Hunter Outlanders: GameWith (eventos con recompensas, banners, temporada, Monster Challenge, códigos) + códigos de Game8.
    // + los "Update Notice" oficiales de su web (Level Infinite), con los eventos que vienen en hora exacta: mandan.
    case 'mho': return officialFirst(syncMhoNews(id), syncMho(id))
    // BLEACH: Soul Resonance: códigos de game.guide; eventos y banners solo por Discord (canal "bleach"), sin fuente web permitida.
    case 'bleach': return syncBleach()
    case 'fgo': return syncFgo(id)
    case 'bluearchive': return withGachafocus(id, 'bluearchive', syncBlueArchive(id))
    case 'limbus': return syncLimbus(id)
    case 'wuwa': {
      // Banners de Prydwen + eventos de las notas de parche oficiales de Kuro (horas exactas), con las imágenes y los eventos extra de Reverie.
      // Desafíos rotatorios: Tower of Adversity y Whimpering Wastes (ciclo fijo) y Endstate Matrix (una fase por versión), con recompensas de la wiki.
      const rewards = wuwaChallengeRewards().catch((): WuwaRewards => ({}))
      const events = officialFirst(syncKuro(id), syncReverie(id, 'wuwa'), true)
      const [s, history, r] = await Promise.all([withGachafocus(id, 'wuwa', both(syncPrydwen(id, 'wuwa'), events)), fetchHistory('wuwa').catch(() => []), rewards])
      const patches = buildPatches(id, [], history, game.patchCycleDays)
      return { ...s, events: [...s.events, ...wuwaChallenges(id, Date.now(), r), ...wuwaMatrix(id, patches, r.matrix)], patches }
    }
    case 'genshin':
    case 'starrail':
    case 'zenless': {
      // La wiki de Fandom (Event List) manda en las horas: inicio tras la actualización (11:00 UTC+8) y cierre real del servidor (03:59 UTC+8), mientras que
      // ennead da 07:00 UTC+8 (en pleno mantenimiento) y cierres redondos. ennead aporta las recompensas y tiradas, sus banners y desafíos, y lo que la wiki no tenga.
      const [s0, history] = await Promise.all([officialFirst(syncHoyoWiki(id, game.wiki.host, game.api), syncGame(id, game.api)), fetchHistory(game.api).catch(() => [])])
      // ennead no trae recompensas para los desafíos de ZZZ: el total por ciclo sale de la wiki.
      const s1 = CHALLENGE_PAGES[game.api] ? await withChallengeRewards(s0, game.wiki.host, game.api, CHALLENGE_PAGES[game.api]!) : s0
      const s = await withWikiEventRewards(s1, game.wiki.host, game.api)
      return { ...s, patches: buildPatches(id, s.patches, history, game.patchCycleDays) }
    }
    // Punishing: Gray Raven: notas de versión oficiales de Kuro (mismo CDN que WuWa).
    case 'pgr': return syncPgr(id)
    // Honkai Impact 3rd: eventos de su wiki (Fandom); banners solo vía Discord.
    case 'honkai3': return syncHonkai3(id).then(s => ({ ...s, events: [...s.events, ...hi3MemorialArena(id)] }))
    // Azur Lane: solo anuncios oficiales vía Discord (syncSource los añade si hay canal); sin fuente web permitida.
    case 'azurlane': return { events: [], patches: [], codes: [] }
    default: throw new Error(`Sin fuente para ${game.name}`)
  }
}

/** Las wikis y sitios de la comunidad se consultan menos seguido para no abusar. */
export const staleMs = (g: Game) => (g.api === 'genshin' || g.api === 'starrail' || g.api === 'zenless' ? HOUR : g.api === 'arknights' || g.api === 'endfield' || g.api === 'fgo' || g.api === 'bluearchive' ? 6 * HOUR : 3 * HOUR)
