import { eventStatus } from './logic'
import type { Game, GameEvent, Patch, PlanCfg } from './types'

/**
 * Pestaña "Tiradas" (calculadora, Planner.tsx): cuánto vas a tener para un banner con lo que tienes, lo que el juego da sin pagar
 * (diarias, semanales, modos de dificultad, mantenimiento y códigos de cada versión), el pase mensual si lo tienes y las tiradas de
 * los eventos pendientes que ya conoce la app.
 *
 * Los ingresos fijos de cada juego (SOURCES) se investigaron el 10 nov 2026 en guías que detallan cada reinicio y coinciden entre sí:
 * - WuWa: tabla de recompensas por reinicio de Game8 ("2026 WuWa Anniversary Rewards", archives/595771): diarias 60, Thousand
 *   Gateways 160/semana, Tower of Adversity 800 por versión, Whimpering Wastes 800 por reinicio (dos por versión: cada 21 días), Endstate Matrix 150, mantenimiento 600.
 * - ZZZ: timesaver.gg ("ZZZ Polychrome Farming 3.2", reinicio por reinicio): diarias 60, Ridu Weekly 60 y Hollow Zero 160 por
 *   semana, Shiyu Defense 780 y Deadly Assault 300 cada 14 días.
 * - HSR: varias guías (Game8, Icy Veins, Sportskeeda 4.6/4.7): diarias 60; Memory of Chaos, Pure Fiction y Apocalyptic Shadow 800
 *   cada uno y duran 6 semanas, escalonados (≈ uno cada 14 días); Simulated Universe / Currency Wars 225/semana (1350 por versión).
 * - Genshin: diarias 60; Spiral Abyss 800 cada día 16 (desde jun 2024 se reinicia una vez al mes); Imaginarium Theater 800 cada día 1.
 * - HoYoverse y WuWa: compensación de mantenimiento 600 y códigos del directo ~300 por versión.
 * - Arknights (arknights.wiki.gg y guías): diarias 100, semanales 500, Annihilation hasta 1800/semana, tienda de certificados 600/mes.
 * - Reverse: 1999 (EnjoyGM, recuento de 3.8): diarias 90 y semanales 100; Limbo hasta 600 por versión.
 * - Blue Archive (guías de farmeo): diarias 20 y semanales 120. Tactical Challenge y Total Assault dependen de tu puesto: no se cuentan.
 * - NIKKE (esports.gg): diarias 100 y semanales 100. El resto (Union Raid, Interception…) varía mucho entre fuentes: no se cuenta.
 * Diarias que dio el dueño (10 nov 2026), en los juegos donde las guías no coincidían: Endfield 200 Oroberyl, Uma 75 Carats, CZN 60
 * Crystals, NTE 60 Annulith, Epic Seven 50 Skystones, Stella Sora 100 Stellanite Dust, PGR 30 Black Cards, HI3 40 Crystals, Azur Lane
 * 4 Wisdom Cubes, BD2 60 Dia, Infinity Nikki 90 Diamonds; AFK Journey 100 Diamonds + 1 Invite Letter al día (lo demás de sus diarias
 * —oro, esencias, piedras de alma— no son tiradas); FGO 3 Saint Quartz semanales, 4 SQ + 1 billete por cada 7 días de inicio de
 * sesión y 5 billetes al mes en la tienda. Limbus: las diarias dan módulos de Enkephalin, no Lunacy (sin ingresos automáticos).
 * Ingresos con `tickets: true` son billetes de tirada (cada uno = 1 tirada), no moneda.
 * Billetes promocionales de la tienda (10 nov 2026, a petición del dueño: "5 promocionales y 5 del permanente al mes"): Genshin
 * (Paimon's Bargains), HSR (Embers) y ZZZ (Residual Signal) 5 al mes, el día 1; WuWa, 7 Radiant Tides por versión (su tienda de Coral se
 * reinicia con cada versión, no cada mes: Sportskeeda y la tabla de Game8). Los del banner permanente no se cuentan: no sirven en el
 * banner promocional, que es el que se calcula.
 * Los modos de dificultad cuentan al máximo (todo con todas las estrellas); se pueden quitar del cálculo. No se cuentan los inicios
 * de sesión especiales ni los logros sueltos.
 */
export type SourceKey = 'daily' | 'weekly' | 'maint' | 'live' | 'shop' | 'login' | 'dailyTicket' | 'ticketShop' | 'ticketShopPatch'
export interface Source {
  /** Nombre del modo (se deja tal cual, en inglés como en el juego) o clave de texto genérico (plan.src.<key>). */
  name?: string
  key?: SourceKey
  amount: number
  /** day = cada día; week = cada lunes; month = un día fijo del mes (`day`); every = cada `every` días; patch = cada versión nueva. */
  per: 'day' | 'week' | 'month' | 'every' | 'patch'
  day?: number
  every?: number
  /** Modo de dificultad: se cuenta al máximo y se puede quitar con un interruptor. */
  endgame?: boolean
  /** `amount` son billetes de tirada (1 = 1 tirada), no moneda. */
  tickets?: boolean
}

export interface Econ { currency: string; per: number; pass: number; pity: number; sources: Source[]; /** Nota propia en lugar de la genérica. */ note?: 'limbus' }

const daily = (amount: number): Source => ({ key: 'daily', amount, per: 'day' })
const tickets = (key: SourceKey, amount: number, per: Source['per'], day?: number): Source => ({ key, amount, per, day, tickets: true })
const weekly = (amount: number): Source => ({ key: 'weekly', amount, per: 'week' })
const version = (maint: number, live: number): Source[] => [{ key: 'maint', amount: maint, per: 'patch' }, { key: 'live', amount: live, per: 'patch' }]

const ECON: Record<string, Econ> = {
  genshin: { currency: 'Primogems', per: 160, pass: 90, pity: 90, sources: [
    daily(60),
    { name: 'Spiral Abyss', amount: 800, per: 'month', day: 16, endgame: true },
    { name: 'Imaginarium Theater', amount: 800, per: 'month', day: 1, endgame: true },
    tickets('ticketShop', 5, 'month', 1),
    ...version(600, 300)] },
  starrail: { currency: 'Stellar Jade', per: 160, pass: 90, pity: 90, sources: [
    daily(60),
    { name: 'Simulated Universe / Currency Wars', amount: 225, per: 'week' },
    { name: 'Memory of Chaos · Pure Fiction · Apocalyptic Shadow', amount: 800, per: 'every', every: 14, endgame: true },
    tickets('ticketShop', 5, 'month', 1),
    ...version(600, 300)] },
  zenless: { currency: 'Polychrome', per: 160, pass: 90, pity: 90, sources: [
    daily(60),
    { name: 'Hollow Zero', amount: 160, per: 'week' },
    { name: 'Ridu Weekly', amount: 60, per: 'week' },
    { name: 'Shiyu Defense', amount: 780, per: 'every', every: 14, endgame: true },
    { name: 'Deadly Assault', amount: 300, per: 'every', every: 14, endgame: true },
    tickets('ticketShop', 5, 'month', 1),
    ...version(600, 300)] },
  wuwa: { currency: 'Astrite', per: 160, pass: 90, pity: 80, sources: [
    daily(60),
    { name: 'Thousand Gateways', amount: 160, per: 'week' },
    { name: 'Tower of Adversity', amount: 800, per: 'patch', endgame: true },
    // 800 por reinicio y dos reinicios por versión (Game8): cada 21 días. Antes iba como 1600 de golpe por versión y la fila decía «× 1 +10».
    { name: 'Whimpering Wastes', amount: 800, per: 'every', every: 21, endgame: true },
    { name: 'Endstate Matrix', amount: 150, per: 'patch', endgame: true },
    tickets('ticketShopPatch', 7, 'patch'),
    ...version(600, 300)] },
  arknights: { currency: 'Orundum', per: 600, pass: 0, pity: 0, sources: [
    daily(100), weekly(500),
    { name: 'Annihilation', amount: 1800, per: 'week', endgame: true },
    { key: 'shop', amount: 600, per: 'month', day: 1 }] },
  reverse1999: { currency: 'Clear Drop', per: 180, pass: 0, pity: 70, sources: [
    daily(90), weekly(100),
    { name: 'Limbo', amount: 600, per: 'patch', endgame: true }] },
  bluearchive: { currency: 'Pyroxene', per: 120, pass: 0, pity: 200, sources: [daily(20), weekly(120)] },
  nikke: { currency: 'Gems', per: 300, pass: 0, pity: 200, sources: [daily(100), weekly(100)] },
  endfield: { currency: 'Oroberyl', per: 500, pass: 0, pity: 0, sources: [daily(200)] },
  uma: { currency: 'Carats', per: 150, pass: 0, pity: 200, sources: [daily(75)] },
  czn: { currency: 'Crystals', per: 160, pass: 0, pity: 0, sources: [daily(60)] },
  nte: { currency: 'Annulith', per: 160, pass: 0, pity: 0, sources: [daily(60)] },
  fgo: { currency: 'Saint Quartz', per: 3, pass: 0, pity: 0, sources: [weekly(3), { key: 'login', amount: 4, per: 'week' }, tickets('login', 1, 'week'), tickets('ticketShop', 5, 'month', 1)] },
  limbus: { currency: 'Lunacy', per: 130, pass: 0, pity: 0, sources: [], note: 'limbus' },
  epic7: { currency: 'Skystones', per: 100, pass: 0, pity: 0, sources: [daily(50)] },
  stellasora: { currency: 'Stellanite Dust', per: 300, pass: 0, pity: 0, sources: [daily(100)] },
  pgr: { currency: 'Black Cards', per: 250, pass: 0, pity: 0, sources: [daily(30)] },
  honkai3: { currency: 'Crystals', per: 280, pass: 0, pity: 0, sources: [daily(40)] },
  azurlane: { currency: 'Wisdom Cubes', per: 2, pass: 0, pity: 0, sources: [daily(4)] },
  bd2: { currency: 'Dia', per: 200, pass: 0, pity: 0, sources: [daily(60)] },
  afkjourney: { currency: 'Diamonds', per: 300, pass: 0, pity: 0, sources: [daily(100), tickets('dailyTicket', 1, 'day')] },
  infinitynikki: { currency: 'Diamonds', per: 120, pass: 0, pity: 0, sources: [daily(90)] },
}

/** Juegos sin economía conocida (los que añades a mano): moneda genérica a 160 por tirada, que se puede cambiar. */
const GENERIC: Econ = { currency: '', per: 160, pass: 0, pity: 0, sources: [] }

export const econOf = (g: Game): Econ => (g.api && ECON[g.api]) || GENERIC

/** Ajustes del juego con los valores por defecto de su economía debajo. `daily`/`weekly` son ingresos EXTRA puestos a mano. */
export function cfgOf(g: Game, saved?: Partial<PlanCfg>): PlanCfg {
  const e = econOf(g)
  return { cur: 0, tickets: 0, daily: 0, pass: false, passDaily: e.pass, weekly: 0, per: e.per, goal: e.pity, at: 'end', events: true, endgame: true, ...saved }
}

const DAY = 86_400_000

/** Banners del juego que aún no han terminado, del que empieza antes al que empieza después. */
export function bannersOf(events: GameEvent[], gameId: string, now: number): GameEvent[] {
  return events.filter(e => e.gameId === gameId && e.kind === 'banner' && eventStatus(e, now) !== 'ended')
    .sort((a, b) => +new Date(a.start) - +new Date(b.start) || +new Date(a.end) - +new Date(b.end))
}

/** Lunes (reinicio semanal) entre `from` y `to`. */
function mondays(from: number, to: number): number {
  let n = 0
  const d = new Date(from); d.setHours(4, 0, 0, 0)
  if (+d <= from) d.setDate(d.getDate() + 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  for (; +d <= to; d.setDate(d.getDate() + 7)) n++
  return n
}

/** Veces que llega el día `day` del mes (a las 04:00) entre `from` y `to`. */
function monthDays(from: number, to: number, day: number): number {
  let n = 0
  const d = new Date(from); d.setDate(1); d.setHours(4, 0, 0, 0)
  for (let i = 0; i < 48; i++) {
    const at = new Date(d.getFullYear(), d.getMonth() + i, day, 4)
    if (+at > to) break
    if (+at > from) n++
  }
  return n
}

/** Versiones nuevas entre `from` y `to`: las fechas que ya conoce la app (anunciadas o estimadas) o, si no hay, por la duración típica. */
function patchesBetween(patches: Patch[], game: Game, from: number, to: number): number {
  const known = patches.filter(p => p.gameId === game.id).map(p => +new Date(p.date))
  const last = Math.max(0, ...known)
  let n = known.filter(t => t > from && t <= to).length
  // Más allá de la última versión conocida, una cada `patchCycleDays` días.
  if (game.patchCycleDays > 0 && to > Math.max(last, from)) {
    const base = last > from ? last : from
    n += Math.floor((to - base) / (game.patchCycleDays * DAY))
  }
  return n
}

export interface SourceRow { src: Source; times: number; amount: number }

export interface PlanResult {
  until: number
  days: number
  /** Tiradas de lo que tienes ahora. */
  now: number
  /** Ingresos fijos del juego, uno por fila, en moneda. */
  rows: SourceRow[]
  pass: number
  /** Lo puesto a mano (diario y semanal extra), en moneda. */
  manual: number
  events: number
  eventList: GameEvent[]
  /** Tiradas en total (hacia abajo: una tirada a medias no se puede hacer). */
  total: number
  /** Moneda que sobra tras las tiradas enteras. */
  rest: number
}

/** Cuenta las tiradas hasta `until`. Diarias: un reinicio por día completo que queda (la de hoy se supone hecha). */
export function planPulls(cfg: PlanCfg, until: number, game: Game, state: { events: GameEvent[]; done: Record<string, boolean>; patches: Patch[] }, nowMs: number): PlanResult {
  const econ = econOf(game)
  const span = Math.max(0, until - nowMs)
  const days = until ? Math.floor(span / DAY) : 0
  const per = Math.max(1, cfg.per || 1)
  const timesOf = (s: Source) => !until ? 0
    : s.per === 'day' ? days
    : s.per === 'week' ? mondays(nowMs, until)
    : s.per === 'month' ? monthDays(nowMs, until, s.day ?? 1)
    : s.per === 'every' ? Math.floor(days / (s.every || 1))
    : patchesBetween(state.patches, game, nowMs, until)
  const rows = econ.sources.filter(s => cfg.endgame || !s.endgame).map(src => { const times = timesOf(src); return { src, times, amount: times * src.amount } })
  const eventList = until && cfg.events
    ? state.events.filter(e => e.gameId === game.id && e.kind !== 'banner' && e.pulls > 0 && !state.done[e.id] && eventStatus(e, nowMs) !== 'ended' && +new Date(e.start) < until)
      .sort((a, b) => +new Date(a.end) - +new Date(b.end))
    : []
  const pass = cfg.pass ? days * Math.max(0, cfg.passDaily) : 0
  const manual = days * Math.max(0, cfg.daily) + mondays(nowMs, until || nowMs) * Math.max(0, cfg.weekly)
  const currency = Math.max(0, cfg.cur) + rows.reduce((n, r) => n + (r.src.tickets ? 0 : r.amount), 0) + pass + manual
  const ticketRows = rows.reduce((n, r) => n + (r.src.tickets ? r.amount : 0), 0)
  const events = Math.round(eventList.reduce((n, e) => n + e.pulls, 0) * 10) / 10
  const exact = currency / per + Math.max(0, cfg.tickets) + ticketRows + events
  return { until, days, now: cfg.cur / per + cfg.tickets, rows, pass, manual, events, eventList, total: Math.floor(exact + 1e-9), rest: Math.round(currency % per) }
}
