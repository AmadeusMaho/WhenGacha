import type { AppState, Game, GameEvent } from './types'

/**
 * Servidor de juego elegido por el jugador (pedido en comentarios de usuarios, 12 nov 2026: "estoy en el servidor EU de ZZZ", "horas del servidor
 * de Asia en Endfield"). En estos juegos cada región cambia a la misma hora LOCAL de su servidor (Asia UTC+8, Europa UTC+1, América UTC-5),
 * salvo la actualización de versión, que sale a la vez en todo el mundo.
 *
 * Los datos de cada juego vienen en la hora de un servidor (`base`, el que usa su fuente: la wiki de HoYoverse en Asia, Kuro, NTE y DNA en América,
 * la wiki de Endfield en AMEU). Al elegir otro, inicio y fin se desplazan la diferencia de zonas; las horas pegadas a una versión (desde 2 h antes de
 * su mantenimiento hasta 6 h después de la actualización: lo que acaba antes del mantenimiento y lo que empieza "tras la actualización") son globales. La app muestra siempre las horas en
 * la zona del navegador: el servidor solo cambia CUÁNDO pasan las cosas.
 *
 * Si la fuente da las horas exactas de otro servidor (`GameEvent.servers`; Endfield: Asia, de su wiki), se usan esas en vez del cálculo.
 *
 * Solo se guarda la elección (AppState.servers, en el navegador; no hace falta cuenta). Sin elección, **América** (NA / AMEU, el primero de cada
 * lista): la mayoría de los visitantes viene de allí (decisión del dueño, 12 nov 2026). En HoYoverse eso desplaza las horas de la wiki (Asia).
 */
export interface Server {
  id: string; label: string; offset: number
  /** Servidor que va por delante del global (NTE China): todo (versiones incluidas) llega estos días ANTES. Es un patrón, no un dato: se marca "≈". */
  ahead?: number
}
/** `base`: servidor en que vienen los datos. `list`: el primero es el que se usa por defecto (América). */
interface Regions {
  base: string; list: Server[]
  /** Horas de mantenimiento ANTES de la fecha de la versión (la app la pone al acabar la actualización): lo que acaba en ese rato es global. Por defecto 5. */
  maint?: number
  /** Solo se desplaza lo que viene de avisos oficiales (`official`); lo demás tiene otra base y se deja como está. */
  onlyOfficial?: boolean
  /** Las versiones también salen a la hora local de cada región (DNA: "July 23, 2026, 10:00" en Asia, Europa y América): todo se desplaza. */
  localLaunch?: boolean
}

const ASIA = { id: 'asia', label: 'Asia (UTC+8)', offset: 8 }
const EU = { id: 'eu', label: 'Europe (UTC+1)', offset: 1 }
const NA = { id: 'na', label: 'America (UTC-5)', offset: -5 }
const TW = { id: 'tw', label: 'TW/HK/MO (UTC+8)', offset: 8 }

const HOYO: Regions = { base: 'asia', list: [NA, EU, ASIA, TW] }
const REGIONS: Record<string, Regions> = {
  genshin: HOYO,
  starrail: HOYO,
  zenless: HOYO,
  honkai3: HOYO,
  // Kuro: "server time" de cada región; kuro.ts, Reverie y Prydwen usan América.
  // WuWa: mantenimiento de versión 04:00–11:00 (UTC+8), 7 h.
  wuwa: { base: 'na', maint: 7, list: [NA, EU, ASIA, { id: 'sea', label: 'SEA (UTC+8)', offset: 8 }, { id: 'hmt', label: 'HMT (UTC+8)', offset: 8 }] },
  // Endfield: dos servidores, Asia (UTC+8) y Americas/Europe (UTC-5); la wiki da las horas de AMEU.
  endfield: { base: 'ameu', list: [{ id: 'ameu', label: 'AMEU (UTC-5)', offset: -5 }, ASIA] },
  // Neverness to Everness: cuatro servidores aislados (América, Europa, Asia, SEA) con el reinicio a las 05:00 de su hora (guías de reinicio de
  // allthings.how y nerdschalk, 12 nov 2026). Los avisos oficiales dicen "server time" y nevernessgg.ts usa América (UTC-5); los eventos que solo
  // trae Game8 ("≈") van en hora de Asia, así que con otro servidor pueden quedar desfasados (marcados aproximados).
  // China (国服, UTC+8): recibe cada versión unos 6 días antes que el global (1.0: 23 abr / 29 abr; 1.2: 2 jul / 9 jul; 1.5: 5 nov / 11 nov,
  // avisos oficiales de Bilibili y nte.perfectworld.com). En vez de leer su web (lenta desde fuera de China), se adelanta el calendario global.
  nte: { base: 'na', onlyOfficial: true, list: [NA, EU, ASIA, { id: 'sea', label: 'SEA (UTC+8)', offset: 8 }, { id: 'cn', label: 'China (UTC+8, ≈6 días antes)', offset: 8, ahead: 6 }] },
  // Duet Night Abyss: dna.ts y discord.ts usan América.
  dna: { base: 'na', localLaunch: true, list: [NA, EU, { id: 'asia', label: 'Asia/SEA/HMT (UTC+8)', offset: 8 }] },
}

/*
 * Sin selector (revisado el 12 nov 2026): juegos con un solo servidor o con regiones que cambian en el MISMO instante, cuyos avisos dan hora UTC fija:
 * Arknights y Stella Sora (UTC-7), Infinity Nikki (todo anclado a UTC-7), NIKKE (UTC+9), CZN, Epic Seven, AFK Journey y PGR (UTC), Reverse: 1999
 * (UTC-5 en sus avisos), Blue Archive, Umamusume, FGO (NA), Limbus, BrownDust2 y Azur Lane (EN).
 */
export const regionsOf =(g: Game): Regions | undefined => (g.api ? REGIONS[g.api] : undefined)

/** Servidor elegido de un juego o, si no eligió ninguno, el de América (el primero de su lista). */
export function serverOf(g: Game, state: Pick<AppState, 'servers'>): Server | undefined {
  const r = regionsOf(g)
  if (!r) return undefined
  return r.list.find(s => s.id === state.servers?.[g.id]) ?? r.list[0]
}

const HOUR = 3_600_000

/** Estado con las horas de cada juego llevadas a su servidor (el elegido o América). Devuelve el mismo objeto si todos coinciden con su base. */
export function withServers(state: AppState, games: Game[]): AppState {
  const shift = new Map<string, number>()
  const maint = new Map<string, number>()
  const officialOnly = new Set<string>()
  /** Servidor elegido distinto del base, por juego (para las horas exactas de `GameEvent.servers`). */
  const picked = new Map<string, string>()
  /** Días que se adelanta todo el juego (servidor que va por delante). */
  const ahead = new Map<string, number>()
  for (const g of games) {
    const r = regionsOf(g)
    const base = r?.list.find(s => s.id === r.base), chosen = serverOf(g, state)
    if (!base || !chosen || base.id === chosen.id) continue
    picked.set(g.id, chosen.id)
    maint.set(g.id, (r?.maint ?? 5) * HOUR)
    if (r?.onlyOfficial) officialOnly.add(g.id)
    const id = g.id
    if (base.offset !== chosen.offset) shift.set(id, (base.offset - chosen.offset) * HOUR)
    if (chosen.ahead) ahead.set(id, chosen.ahead * 24 * HOUR)
  }
  if (!picked.size) return state
  const launches = new Map<string, number[]>()
  // Solo versiones con fecha confirmada: una estimada congelaría (o recortaría) horas que sí cambian con el servidor.
  const local = new Set(games.filter(g => regionsOf(g)?.localLaunch).map(g => g.id))
  for (const p of state.patches) if (shift.has(p.gameId) && !p.estimated && !local.has(p.gameId)) launches.set(p.gameId, [...(launches.get(p.gameId) ?? []), +new Date(p.date)])
  // Juegos sin versiones fechadas (NTE): los instantes en que empiezan o acaban a la vez 3 o más cosas, banners incluidos, son la
  // actualización y el mantenimiento (globales): esas horas no se tocan (`fixed`), y además sirven de versión para no cruzarlas.
  const fixed = new Map<string, number[]>()
  for (const id of shift.keys()) {
    if (launches.has(id) || local.has(id)) continue
    const at = new Map<number, { n: number; banner: boolean }>()
    for (const e of state.events) if (e.gameId === id) for (const k of [+new Date(e.start), +new Date(e.end)]) {
      const c = at.get(k) ?? { n: 0, banner: false }
      at.set(k, { n: c.n + 1, banner: c.banner || e.kind === 'banner' })
    }
    const ks = [...at].filter(([, c]) => c.n >= 3 && c.banner).map(([k]) => k)
    if (ks.length) fixed.set(id, ks)
  }
  const move = (gameId: string, iso: string) => {
    const t = +new Date(iso)
    const ls = launches.get(gameId) ?? []
    // Pegado a una versión (mantenimiento, "tras la actualización", banners que acaban justo antes): es global.
    // Desde 2 h antes del mantenimiento de versión hasta 6 h después de la fecha de la versión (fin de la actualización).
    if (ls.some(l => t >= l - (maint.get(gameId) ?? 5 * HOUR) - 2 * HOUR && t <= l + 6 * HOUR)) return iso
    if ((fixed.get(gameId) ?? []).some(k => Math.abs(t - k) < HOUR)) return iso
    let m = t + shift.get(gameId)!
    // Nada cruza una versión al desplazarse: lo que acababa antes del mantenimiento sigue acabando antes, y lo que empezaba después no se adelanta a él.
    for (const l of ls) {
      if (t < l && m >= l) m = l - 1000
      else if (t > l && m <= l) m = l
    }
    return new Date(m).toISOString()
  }
  const local1 = (e: GameEvent): GameEvent => {
    const exact = e.servers?.[picked.get(e.gameId) ?? '']
    if (exact) return { ...e, start: exact.start, end: e.open ? e.end : exact.end }
    if (!shift.has(e.gameId) || e.source === 'manual' || (officialOnly.has(e.gameId) && !e.official)) return e
    return { ...e, start: move(e.gameId, e.start), end: e.open ? e.end : move(e.gameId, e.end) }
  }
  const early = (iso: string, d: number) => new Date(+new Date(iso) - d).toISOString()
  const events = state.events.map((e): GameEvent => {
    const x = local1(e), d = ahead.get(e.gameId)
    if (!d || e.source === 'manual') return x
    // Servidor adelantado: todo llega `d` antes, también lo global (la versión), y es una estimación por el patrón.
    return { ...x, start: early(x.start, d), end: x.open ? x.end : early(x.end, d), precision: x.precision ?? 'approx' }
  })
  const patches = ahead.size ? state.patches.map(p => { const d = ahead.get(p.gameId); return d ? { ...p, date: early(p.date, d), end: p.end && early(p.end, d), estimated: true } : p }) : state.patches
  return { ...state, events, patches }
}
