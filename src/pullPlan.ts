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
 * Uma (10 nov 2026, tablas de umacaratcalculator.com, /api/calculator-data, la calculadora que recomendó el dueño): diarias 75, bonificación
 *   semanal 150, recompensa mensual 500, 150 cada 50 días de inicio de sesión, 4 tickets de personaje en la tienda mensual (se repone el
 *   día 2; hasta 9 comprando más) y Team Trials 375/semana en la Clase 6 (de 0 a 375 según la clase: se cuenta como modo de dificultad).
 *   No se cuentan el rango de club (225–4500/mes), Champions Meeting (1000–3300), League of Heroes ni sus "ingresos varios" (90/día de
 *   media): dependen de tu puesto o son una media, y la calculadora da un mínimo.
 * Más modos (10 nov 2026, a petición del dueño de que estén todos):
 * - Stella Sora (stelladb.pages.dev, "Pull Income"): semanales 500, check-in mensual 100 (días 5/13/20/25; se cuenta el 25),
 *   mantenimiento de versión 450, y Boss Blitz por temporada según el puesto (700 de las estrellas + 300–600 del puesto).
 * - Honkai Impact 3rd (guías de la comunidad): Elysian Realm 500/semana en Corruption o más; Memorial Arena hasta 140/semana (SSS).
 *   Superstring Abyss paga según el puesto y no hay tabla fiable: no se cuenta.
 * - NTE (Icy Veins, GameWith): Beyond the Rails, ruta especial 700 por versión.
 * - Uma: Team Trials, rango de club y Champions Meeting son elecciones (`choices`) que cada uno rellena con su puesto.
 * Dados por el dueño (10 nov 2026): Endfield, Umbral Monument 1200 por cada parte nueva (una por versión); CZN, Basin of Hyperspace
 *   (Dimensional Twilight) 1000 al mes; se reinicia el día 11 (el del 10 nov 2026 acababa hacia las 00:00 UTC del 11). Epic Seven, AFK Journey y BD2: ni el dueño ni las guías tienen tabla de la Arena / Mirror Wars,
 *   así que son campos (`inputs`) que rellena cada jugador.
 * Ingresos con `tickets: true` son billetes de tirada (cada uno = 1 tirada), no moneda.
 * Billetes promocionales de la tienda (10 nov 2026, a petición del dueño: "5 promocionales y 5 del permanente al mes"): Genshin
 * (Paimon's Bargains), HSR (Embers) y ZZZ (Residual Signal) 5 al mes, el día 1; WuWa, 7 Radiant Tides por versión (su tienda de Coral se
 * reinicia con cada versión, no cada mes: Sportskeeda y la tabla de Game8). Los del banner permanente no se cuentan: no sirven en el
 * banner promocional, que es el que se calcula.
 * Los modos de dificultad cuentan al máximo (todo con todas las estrellas); se pueden quitar del cálculo. No se cuentan los inicios
 * de sesión especiales ni los logros sueltos.
 */
export type SourceKey = 'daily' | 'weekly' | 'maint' | 'live' | 'shop' | 'login' | 'dailyTicket' | 'ticketShop' | 'ticketShopPatch' | 'monthly' | 'login50'
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
  /** Fila que sale de una elección de rango (`choices`). */
  rank?: boolean
  /** Nombres con que el modo sale entre los eventos de la app (por defecto, `name`): esos eventos se cuentan en esta fila y no aparte. */
  aliases?: string[]
  /** Días del mes (si son varios; `per: 'month'`). */
  days?: number[]
  /** Un reinicio conocido (ISO) para los ciclos de `every` días cuando la app no trae ninguna temporada del modo. */
  anchor?: string
  /** Este modo son los desafíos del juego que no coinciden con otro (HSR: las temporadas de MoC / Pure Fiction / Apocalyptic Shadow
   *  salen con su nombre temático, "Survival of the Fittest"…). */
  matchChallenges?: boolean
}

/** Opción de un modo que paga según tu puesto (rango de club, Champions Meeting…): moneda y tickets por cada vez. */
export interface RankOption { label: string; amount: number; tickets?: number }
/** Modo que paga según tu puesto: cada uno elige el suyo en la ficha (cfg.ranks[id] = índice; 0 = no participo / sin elegir). */
export interface RankChoice { id: string; name: string; per: Source['per']; day?: number; every?: number; options: RankOption[] }

export interface Econ {
  currency: string; per: number; pass: number; pity: number; sources: Source[]
  /** Modos cuya recompensa depende de tu puesto: se rellenan en la ficha. */
  choices?: RankChoice[]
  /** Modos sin tabla fiable: cada jugador pone cuánto le dan (cfg.custom[id], moneda por cada vez). */
  inputs?: { id: string; name: string; per: Source['per']; day?: number }[]
  /** Nota propia en lugar de la genérica. */
  note?: 'limbus'
  /** Página de la wiki del juego con el icono de la moneda y del billete promocional (images.ts, `itemIcon`). */
  icon?: string
  ticket?: string
  /** Calculadora dedicada que recomendamos para este juego (enlace en la ficha). Uma: umacaratcalculator.com, la que recomendó el dueño. */
  more?: { name: string; url: string }
  /** Icono propio de la moneda cuando la wiki no lo tiene (Uma: la wiki no guarda iconos; public/icons/uma-carat.webp = utx_ico_menu_23
   *  del zip "Umamusume UI sprites" que aportó el dueño, la Carat del juego). */
  iconUrl?: string
}

const daily = (amount: number): Source => ({ key: 'daily', amount, per: 'day' })
const tickets = (key: SourceKey, amount: number, per: Source['per'], day?: number): Source => ({ key, amount, per, day, tickets: true })
const weekly = (amount: number): Source => ({ key: 'weekly', amount, per: 'week' })
const version = (maint: number, live: number): Source[] => [{ key: 'maint', amount: maint, per: 'patch' }, { key: 'live', amount: live, per: 'patch' }]

const ECON: Record<string, Econ> = {
  genshin: { currency: 'Primogems', icon: 'Primogem', ticket: 'Intertwined Fate', per: 160, pass: 90, pity: 90, sources: [
    daily(60),
    { name: 'Spiral Abyss', amount: 800, per: 'month', day: 16, endgame: true, aliases: ['spiral abyss', 'abyssal moon spire'] },
    { name: 'Imaginarium Theater', amount: 800, per: 'month', day: 1, endgame: true },
    tickets('ticketShop', 5, 'month', 1),
    ...version(600, 300)] },
  starrail: { currency: 'Stellar Jade', icon: 'Stellar Jade', ticket: 'Star Rail Special Pass', per: 160, pass: 90, pity: 90, sources: [
    daily(60),
    { name: 'Simulated Universe / Currency Wars', amount: 225, per: 'week', aliases: ['simulated universe', 'currency wars', 'divergent universe'] },
    { name: 'Memory of Chaos · Pure Fiction · Apocalyptic Shadow', amount: 800, per: 'every', every: 14, endgame: true, matchChallenges: true },
    tickets('ticketShop', 5, 'month', 1),
    ...version(600, 300)] },
  zenless: { currency: 'Polychrome', icon: 'Polychrome', ticket: 'Encrypted Master Tape', per: 160, pass: 90, pity: 90, sources: [
    daily(60),
    { name: 'Hollow Zero', amount: 160, per: 'week', aliases: ['hollow zero', 'lost void'] },
    { name: 'Ridu Weekly', amount: 60, per: 'week' },
    { name: 'Shiyu Defense', amount: 780, per: 'every', every: 14, endgame: true },
    { name: 'Deadly Assault', amount: 300, per: 'every', every: 14, endgame: true },
    tickets('ticketShop', 5, 'month', 1),
    ...version(600, 300)] },
  wuwa: { currency: 'Astrite', icon: 'Astrite', ticket: 'Radiant Tide', per: 160, pass: 90, pity: 80, sources: [
    daily(60),
    { name: 'Thousand Gateways', amount: 160, per: 'week' },
    // Ciclos sacados de las fechas que trae la app (10 nov 2026): Torre y Whimpering Wastes cada 28 días, Endstate Matrix cada 42.
    { name: 'Tower of Adversity', amount: 800, per: 'every', every: 28, endgame: true },
    // 800 por reinicio (Game8). Antes iba como 1600 de golpe por versión y la fila decía «× 1 +10».
    { name: 'Whimpering Wastes', amount: 800, per: 'every', every: 28, endgame: true },
    { name: 'Endstate Matrix', amount: 150, per: 'every', every: 42, endgame: true },
    tickets('ticketShopPatch', 7, 'patch'),
    ...version(600, 300)] },
  arknights: { currency: 'Orundum', icon: 'Orundum', ticket: 'Headhunting Permit', per: 600, pass: 0, pity: 0, sources: [
    daily(100), weekly(500),
    { name: 'Annihilation', amount: 1800, per: 'week', endgame: true },
    { key: 'shop', amount: 600, per: 'month', day: 1 }] },
  reverse1999: { currency: 'Clear Drop', icon: 'Clear Drop', ticket: 'Unilog', per: 180, pass: 0, pity: 70, sources: [
    daily(90), weekly(100),
    // Limbo se reinicia los días 1 y 16 de cada mes (dotgg y las notas de la 2.4: 1 y 16 mar 2025), hasta 600 por reinicio.
    { name: 'Limbo', amount: 600, per: 'month', days: [1, 16], endgame: true }] },
  // Blue Archive: Tactical Challenge (al día, según tu puesto) y Total/Grand Assault (por temporada, según tu puesto) no tienen una tabla
  // pública fiable (13 nov 2026: las guías dan de 70 a 300 al mes y de 400 a 2400): cada jugador pone lo suyo.
  bluearchive: { currency: 'Pyroxene', icon: 'Pyroxene', per: 120, pass: 0, pity: 200, sources: [daily(20), weekly(120)],
    inputs: [{ id: 'tc', name: 'Tactical Challenge', per: 'day' }, { id: 'raid', name: 'Total / Grand Assault', per: 'month', day: 1 }] },
  nikke: { currency: 'Gems', icon: 'Gem', ticket: 'Advanced Recruit Voucher', per: 300, pass: 0, pity: 200, sources: [daily(100), weekly(100)] },
  // Endfield (13 nov 2026; TopUpLive "1.6 Pull Count" y el recuento por fuente de Neptune Impact para la 1.6): semanales 500 (3000 en las 6
  // semanas de la versión), compensación de la actualización 1800, regalo del directo 1000, la pista gratuita del Originium Supply Pass 1200
  // y Echoes of War (Phantasia + Fervor) 300 + 300 por versión.
  endfield: { currency: 'Oroberyl', icon: 'Oroberyl', per: 500, pass: 0, pity: 0, sources: [daily(200), weekly(500),
    { name: 'Umbral Monument', amount: 1200, per: 'patch', endgame: true },
    { name: 'Echoes of War', amount: 600, per: 'patch', endgame: true },
    { name: 'Originium Supply Pass (free)', amount: 1200, per: 'patch' },
    ...version(1800, 1000)] },
  uma: { currency: 'Carats', more: { name: 'Uma Carat Calculator', url: 'https://umacaratcalculator.com/app' }, icon: 'Carat', iconUrl: '/icons/uma-carat.webp', per: 150, pass: 0, pity: 200, sources: [
    daily(75), weekly(150),
    { key: 'monthly', amount: 500, per: 'month', day: 1 },
    { key: 'login50', amount: 150, per: 'every', every: 50 },
    tickets('ticketShop', 4, 'month', 2)],
    choices: [
      { id: 'tt', name: 'Team Trials', per: 'week', options: [['—', 0], ['Class 1', 0], ['Class 2', 35], ['Class 3', 75], ['Class 4', 150], ['Class 5', 225], ['Class 5.5', 262], ['Class 6', 375]].map(([label, amount]) => ({ label: String(label), amount: Number(amount) })) },
      { id: 'club', name: 'Club', per: 'month', day: 1, options: [['—', 0], ['D+', 225], ['C', 450], ['C+', 900], ['B', 1350], ['B+', 1800], ['A', 2250], ['A+', 2700], ['S', 3150], ['S+', 3600], ['SS', 4500]].map(([label, amount]) => ({ label: String(label), amount: Number(amount) })) },
      // Champions Meeting: uno al mes, con la final hacia el final del mes (21–27 nov, 19–25 dic 2026): se cuenta el día 25. Además de
      // Carats da tickets de personaje.
      { id: 'cm', name: 'Champions Meeting', per: 'month', day: 25, options: [
        { label: '—', amount: 0 }, { label: 'Open League 3rd', amount: 1000, tickets: 1 }, { label: 'Open League 2nd', amount: 1250, tickets: 2 }, { label: 'Open League 1st', amount: 1500, tickets: 3 },
        { label: 'Group B 3rd', amount: 1000, tickets: 1 }, { label: 'Group B 2nd', amount: 1250, tickets: 2 }, { label: 'Group B 1st', amount: 1800, tickets: 3 },
        { label: 'Group A 3rd', amount: 1600, tickets: 3 }, { label: 'Group A 2nd', amount: 2400, tickets: 4 }, { label: 'Champion', amount: 3300, tickets: 5 }] },
    ] },
  czn: { currency: 'Crystals', icon: 'Crystal', per: 160, pass: 0, pity: 0, sources: [daily(60),
    // Cada 28 días: la temporada 5 acabó el 4 feb 2026 (GameWith) y la del 10 nov 2026 acaba hacia las 00:00 UTC del 11 (el dueño):
    // 280 días = 10 ciclos de 28. "Full-Scale Offensive" (30 sep → 10 nov 2026 en los datos) es OTRO modo, de las seasons de CZN
    // (confirmado por el dueño): no se junta con este aunque terminen el mismo día.
    { name: 'Basin of Hyperspace', amount: 1000, per: 'every', every: 28, anchor: '2026-11-11T00:00:00Z', endgame: true, aliases: ['basin of hyperspace', 'dimensional twilight'] }] },
  // NTE (13 nov 2026, Kaiden.gg "Version 1.3 Income"): Beyond the Rails da 2400 por versión en sus tres fases (antes 700, de Icy Veins y
  // GameWith, que contaban una sola ruta); Hunter Exchange 500 y compensación de mantenimiento 900 por versión. Sin directo con códigos fijos.
  nte: { currency: 'Annulith', icon: 'Annulith', per: 160, pass: 0, pity: 0, sources: [daily(60),
    { name: 'Beyond the Rails', amount: 2400, per: 'patch', endgame: true },
    { name: 'Hunter Exchange', amount: 500, per: 'patch' },
    { key: 'maint', amount: 900, per: 'patch' }] },
  fgo: { currency: 'Saint Quartz', icon: 'Saint Quartz', ticket: 'Summon Ticket', per: 3, pass: 0, pity: 0, sources: [weekly(3), { key: 'login', amount: 4, per: 'week' }, tickets('login', 1, 'week'), tickets('ticketShop', 5, 'month', 1)] },
  limbus: { currency: 'Lunacy', icon: 'Lunacy', per: 130, pass: 0, pity: 0, sources: [], note: 'limbus' },
  epic7: { currency: 'Skystones', icon: 'Skystone', per: 100, pass: 0, pity: 0, inputs: [{ id: 'arena', name: 'Arena', per: 'week' }], sources: [daily(50)] },
  stellasora: { currency: 'Stellanite Dust', icon: 'Stellanite Dust', per: 300, pass: 0, pity: 0, sources: [daily(100), weekly(500),
    { key: 'monthly', amount: 100, per: 'month', day: 25 },
    { key: 'maint', amount: 450, per: 'patch' }],
    choices: [{ id: 'blitz', name: 'Boss Blitz', per: 'patch', options: [{ label: '—', amount: 0 }, { label: 'Top 50 %+', amount: 1000 }, { label: 'Top 20–50 %', amount: 1100 }, { label: 'Top 10–20 %', amount: 1200 }, { label: 'Top 10 %', amount: 1300 }] }] },
  // PGR (13 nov 2026, FandomSpot "How To Farm Black Cards"): tareas semanales hasta 1000 (jugar Phantom Pain Cage y War Zone y llegar a sus
  // puntos; por eso no van aparte) y al menos 500 de compensación tras cada versión grande.
  pgr: { currency: 'Black Cards', icon: 'Black Card', per: 250, pass: 0, pity: 0, sources: [daily(30), weekly(1000), { key: 'maint', amount: 500, per: 'patch' }] },
  honkai3: { currency: 'Crystals', icon: 'Crystal', per: 280, pass: 0, pity: 0, sources: [daily(40),
    { name: 'Elysian Realm', amount: 500, per: 'week', endgame: true },
    { name: 'Memorial Arena', amount: 140, per: 'week', endgame: true }] },
  // Azur Lane (13 nov 2026, wiki de koumakan, "Missions"): misiones semanales 12 cubos; el calendario de inicio de sesión, 30 al mes.
  azurlane: { currency: 'Wisdom Cubes', icon: 'Wisdom Cube', per: 2, pass: 0, pity: 0, sources: [daily(4), weekly(12), { key: 'monthly', amount: 30, per: 'month', day: 1 }] },
  bd2: { currency: 'Dia', icon: 'Dia', per: 200, pass: 0, pity: 0, inputs: [{ id: 'mirror', name: 'Mirror Wars', per: 'week' }], sources: [daily(60)] },
  afkjourney: { currency: 'Diamonds', icon: 'Diamonds', ticket: 'Invite Letter', per: 300, pass: 0, pity: 0, inputs: [{ id: 'arena', name: 'Arena', per: 'week' }, { id: 'honor', name: 'Honor Duel', per: 'week' }], sources: [daily(100), tickets('dailyTicket', 1, 'day')] },
  // Duet Night Abyss: 160 Phoxene / Phoxene Plumule = 1 Prismatic Hourglass (banner limitado); pity de 90 (Game8). El pase mensual da
  // 90 Plumule al día (allthings.how). Sin ingresos diarios fijos de Phoxene: llega de eventos, códigos y el Trial Rank (sin tabla fiable).
  // Las diarias dan 15 Secret Letter Clues (el dueño, 13 nov 2026), pero no son tiradas: 10 Clues = 1 Secret Letter, que desbloquea personajes en
  // las Covert Commissions (allthings.how); los banners Myriad usan Hourglasses/Phoxene. Por eso no se cuentan aquí.
  dna: { currency: 'Phoxene', icon: 'Phoxene', ticket: 'Prismatic Hourglass', per: 160, pass: 90, pity: 90, sources: [] },
  // Trickcal: Chibi Go: 100 Crystal Leaf = 1 reclutamiento (pulls.ts). Sin pity: el "Devotion" (mileage) canjea el Apóstol a las 200 tiradas (300 si es
  // Eldyne; lootandwaifus, "Gacha System"). Sin pase ni ingresos diarios fijos documentados: llegan de eventos, códigos y PvP ("500 gems" por temporada).
  // Diarias (las dio el dueño, 13 nov 2026): 10 Crystal Leaf al día de la tienda gratis.
  trickcal: { currency: 'Crystal Leaf', icon: 'Crystal Leaf', ticket: 'Recruitment Ticket', per: 100, pass: 0, pity: 200, sources: [{ name: 'Free shop', amount: 10, per: 'day' }] },
  // Infinity Nikki (13 nov 2026; Game Rant, recuento de la 1.3, y games.gg): Mira Crown, dos Pinnacle Contest por versión con 900 cada uno
  // (todas las rondas perfectas) y 500 de mantenimiento. "Monthly Reset" y "Mira Store" del recuento no dicen qué son: no se cuentan.
  infinitynikki: { currency: 'Diamonds', icon: 'Diamond', ticket: 'Revelation Crystal', per: 120, pass: 0, pity: 0, sources: [daily(90),
    { name: 'Mira Crown', amount: 1800, per: 'patch', endgame: true },
    { key: 'maint', amount: 500, per: 'patch' }] },
  // Girls' Frontline 2 (IOP Wiki, "Monthly currency income" y "Recruitment", 12 nov 2026): 150 Collapse Piece por tirada; pity de 80 (el limitado
  // está garantizado a las 160 si se pierde el 50/50). Diarias 110 (Daily Patrol 20 + Combat Exercise 30 + Daily Activity 60); semanales 345
  // (Boundary Push 120 + Peak Value Assessment 225); al mes, 120 de inicios de sesión y 55 del pase gratuito, y Military Simulation 300 (15 partidas).
  // No se cuentan Gunsmoke Frontline (300 + 300 cada 3 semanas) ni Expansion Drills (500 cada 2): la wiki no da sus fechas de reinicio.
  gfl2: { currency: 'Collapse Piece', icon: 'Collapse Piece', ticket: 'Targeted Access Permission', per: 150, pass: 0, pity: 80, sources: [daily(110), weekly(345),
    { key: 'monthly', amount: 175, per: 'month', day: 1 },
    // Sin `endgame`: no se conoce el día en que empieza su temporada y así no sale en la línea de tiempo con una fecha supuesta.
    { name: 'Military Simulation', amount: 300, per: 'month', day: 1 }] },
  // Monster Hunter Outlanders (GameWith, "How to Farm Rutacoin" y "Gacha Rates and Pity", 12 nov 2026): 150 Rutacoin por contrato; SSR a las 90 y el
  // destacado garantizado a las 120 (una vez por banner). Diarias 50 y semanales 100. Monster Challenge (100 por fase, cada 2 semanas) no se cuenta: el
  // número de fases cambia por temporada.
  // Iconos de la lista de objetos de GameWith (sin wiki que los dé).
  mho: { currency: 'Rutacoin', icon: 'Rutacoin', iconUrl: 'https://img.gamewith.jp/article_tools/mhoutlanders/gacha/item_3.png', ticket: 'Featured Contract', per: 150, pass: 0, pity: 120, sources: [daily(50), weekly(100)] },
  // BLEACH: Soul Resonance: 160 Spiritual Jade por tirada; pity de 80 sin 50/50 (BlueStacks, BitTopup). Sin tabla fiable de ingresos diarios.
  // Icono oficial de la web global (bleach.ts, BLEACH_ICONS).
  // Frenzied Feast (jefe semanal, 5 intentos al día): hasta 450 por semana con la puntuación alta (Vortex Gaming). Diarias y semanales sin cifra fiable.
  bleach: { currency: 'Spiritual Jade', icon: 'Spiritual Jade', iconUrl: 'https://game-cdn.aplusjapan-game.com/bleach_web/web/reg_0.png', ticket: 'Gacha Ticket', per: 160, pass: 0, pity: 80, sources: [
    { name: 'Frenzied Feast', amount: 450, per: 'week', endgame: true }] },
  // Juegos añadidos el 13 nov 2026 (ver pulls.ts para las equivalencias). Ninguna guía coincide en los ingresos diarios: sin `sources`, cada
  // jugador pone los suyos. Onmyoji: 100 Jade = 1 invocación, sin pity fijo (la wiki solo da las probabilidades: SSR 1 %, SP 0,25 %).
  onmyoji: { currency: 'Jade', icon: 'Jade', ticket: 'Mystery Amulet', per: 100, pass: 0, pity: 0, sources: [],
    // El Duel paga Jade cada semana según el tier (hasta 500, guía de la comunidad de 2019): campo propio.
    inputs: [{ id: 'duel', name: 'Duel', per: 'week' }] },
  // Path to Nowhere: 180 Hypercubes por arresto; S garantizada a los 80 (wiki, "Arrests/Info").
  // Diarias (las dio el dueño, 13 nov 2026): 40 Hypercubes.
  ptn: { currency: 'Hypercube', icon: 'Hypercube', per: 180, pass: 0, pity: 80, sources: [daily(40)] },
  // Sword of Convallaria: 150 Hope Luxite = 1 Secret Fate; el destacado del banner de debut está garantizado a las 180 (GameWith).
  // Ingresos (13 nov 2026, GameWith "How to Farm Hope Luxite", act. 17 oct 2025): diarias 60 + 5 de la actividad diaria de Clash; Tower of
  // Conquest 380/semana (5 pisos); check-in 100 por cada 7 inicios seguidos (400 al mes) y 250 de la pista gratuita del Cornucopia al mes;
  // Clash al final de la temporada según la división (GameWith la cuenta al mes).
  soc: { currency: 'Hope Luxite', icon: 'Hope Luxite', ticket: 'Secret Fate', per: 150, pass: 0, pity: 180, sources: [daily(65),
    { name: 'Tower of Conquest', amount: 380, per: 'week', endgame: true },
    { key: 'monthly', amount: 400, per: 'month', day: 1 },
    { name: 'Cornucopia (free)', amount: 250, per: 'month', day: 1 }],
    choices: [{ id: 'clash', name: 'Clash', per: 'month', day: 1, options: [['—', 0], ['Bronze', 100], ['Silver', 150], ['Gold', 200], ['Platinum', 250], ['Radiance', 300]].map(([label, amount]) => ({ label: String(label), amount: Number(amount) })) }] },
  // MONGIL: STAR DIVE: 160 Starlight Crystal = 1 Compass of Destiny; 5★ garantizado a las 90 en el banner de personaje (Prydwen).
  // Suikoden STAR LEAP: 150 Fantasy Stones por tirada; 200 puntos del banner compran el destacado que elijas (Kaiden.gg, "How Gacha Points work").
  // Ingresos (13 nov 2026, GameWith JP "幻想石の効率的な集め方", act. 7 oct 2026, y kamigame): diarias 60, semanales 180; 異境の宝求 da 50
  // por piso cada semana, pero el número de pisos depende de cada uno: campo propio.
  suikoden: { currency: 'Fantasy Stone', icon: 'Fantasy Stone', iconUrl: 'https://www.kaiden.gg/img/suikoden-star-leap/assets/cmn_item_icon_30000.webp', ticket: 'Season Gacha Ticket', per: 150, pass: 0, pity: 200, sources: [daily(60), weekly(180)],
    inputs: [{ id: 'ikyo', name: '異境の宝求', per: 'week' }] },
  // Ingresos (13 nov 2026, GameWith "How to Farm Starlight Crystals", act. 12 nov 2026): diarias 75 (Adventurer Quests 50 + 5 Requests de 5).
  // Dimensional Rift solo paga la primera vez de cada nivel por temporada y la guía no da su duración: no se cuenta.
  mongil: { currency: 'Starlight Crystal', icon: 'Starlight Crystal', ticket: 'Compass of Destiny', per: 160, pass: 0, pity: 90, sources: [daily(75)] },
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
function monthDays(from: number, to: number, day: number | number[]): number {
  return monthTimes(from, to, day).length
}

/** Reinicios de los días `day` del mes (a las 04:00) entre `from` y `to`. */
function monthTimes(from: number, to: number, day: number | number[]): number[] {
  const out: number[] = []
  const days = Array.isArray(day) ? day : [day]
  const d = new Date(from)
  for (let i = -1; i < 48; i++) {
    const ts = days.map(x => +new Date(d.getFullYear(), d.getMonth() + i, x, 4))
    if (Math.min(...ts) > to) break
    for (const t of ts) if (t > from && t <= to) out.push(t)
  }
  return out.sort((a, b) => a - b)
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

/** Reinicios de un ciclo de `every` días anclado en `anchor`, entre `from` y `to`. */
function everyTimes(anchor: number, every: number, from: number, to: number): number[] {
  const step = every * DAY, out: number[] = []
  for (let t = anchor + Math.ceil((from - anchor) / step) * step; t <= to; t += step) if (t > from) out.push(t)
  return out
}

/* ---------- Reinicios estimados para la línea de tiempo ---------- */
/**
 * Temporadas de los modos de dificultad que la app no trae (CZN, Limbo…) y las siguientes de los que sí trae (Abismo, Shiyu, Torre…),
 * marcadas como estimadas ("≈"). Se generan desde la última temporada conocida (o la fecha de referencia del modo) hasta 90 días.
 * Solo modos con ciclo fijo (cada N días o días fijos del mes); los semanales llenarían la línea de tiempo de barras repetidas.
 * La línea de tiempo y la calculadora usan esta misma lista (App.tsx): la calculadora los cuenta como temporadas conocidas.
 */
const HORIZON = 90 * DAY
/** HSR: los tres modos rotan cada 14 días en este orden; Apocalyptic Shadow empezó el 5 oct 2026 (Sportskeeda, fechas de la 4.6). */
const HSR_ROTATION = { anchor: Date.parse('2026-10-04T20:00:00Z'), modes: ['Apocalyptic Shadow', 'Pure Fiction', 'Memory of Chaos'] }
/* Uma: los Champions Meeting ya vienen en los datos ("Aquarius Cup", "Pisces Cup"…); hubo una lista a mano aquí que los
   duplicaba con otro nombre (10 nov 2026) y se quitó. */

/** Temporada de MoC / Pure Fiction / Apocalyptic Shadow (HSR, `matchChallenges`): un desafío de unas 6 semanas. Otros rotatorios
 *  ("Return to Roots") duran menos y no son estos modos. */
const isSeason = (e: GameEvent) => { const d = (+new Date(e.end) - +new Date(e.start)) / DAY; return e.kind === 'challenge' && d >= 35 && d <= 49 }

const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function estimatedEvents(game: Game, events: GameEvent[], nowMs: number): GameEvent[] {
  const econ = econOf(game)
  const own = events.filter(e => e.gameId === game.id && e.kind !== 'banner')
  const out: GameEvent[] = []
  const make = (name: string, start: number, end: number, pulls: number): GameEvent => ({
    id: `est:${game.id}:${slug(name)}:${new Date(start).toISOString().slice(0, 10)}`, gameId: game.id, kind: 'challenge', title: name,
    start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured: [], pulls, precision: 'estimated', source: 'feed',
  })
  const taken = new Set<string>()
  const named = (s: Source) => (s.aliases ?? (s.name ? [s.name.toLowerCase()] : []))
  const ordered = [...econ.sources.filter(s => !s.matchChallenges), ...econ.sources.filter(s => s.matchChallenges)]
  for (const s of ordered) {
    if (!s.endgame || !s.name || (s.per !== 'every' && s.per !== 'month')) continue
    const known = own.filter(e => !taken.has(e.id) && (s.matchChallenges ? isSeason(e) : named(s).some(a => e.title.toLowerCase().includes(a))))
    known.forEach(e => taken.add(e.id))
    // Lo que da cada temporada: la media de las que ya trae la app (HSR da ~5,6 por temporada: 900 Stellar Jade; antes salía 11,3 porque ennead repetía la recompensa destacada, ver `rewardsOf` en ennead.ts); si no hay,
    // la cifra fija del modo.
    const seen = known.filter(e => e.pulls > 0)
    const pulls = Math.round((seen.length ? seen.reduce((n, e) => n + e.pulls, 0) / seen.length : s.amount / Math.max(1, econ.per)) * 10) / 10
    const lastStart = known.length ? Math.max(...known.map(e => +new Date(e.start))) : 0
    const after = lastStart ? lastStart + 2 * DAY : nowMs - 60 * DAY
    const to = nowMs + HORIZON
    const hsr = !!s.matchChallenges && game.api === 'starrail'
    if (s.per === 'every') {
      const every = s.every || 1
      const anchor = lastStart || (s.anchor ? +new Date(s.anchor) : 0)
      if (!anchor) continue
      // Sin temporadas conocidas: también la que está en curso (empezó en el reinicio anterior).
      const starts = everyTimes(anchor, every, after - 1, to).filter(t => lastStart || t + every * DAY > nowMs)
      for (const t of starts) {
        // HSR: cada temporada nueva con el nombre de su modo; duran 6 semanas aunque se reinicie uno cada 14 días.
        const name = hsr ? HSR_ROTATION.modes[((Math.round((t - HSR_ROTATION.anchor) / (14 * DAY)) % 3) + 3) % 3] : s.name
        out.push(make(name, t, t + (hsr ? 42 : every) * DAY, pulls))
      }
    } else {
      const all = monthTimes(after - 40 * DAY, to + 40 * DAY, s.days ?? s.day ?? 1)
      all.forEach((t, i) => {
        const next = all[i + 1] ?? t + 30 * DAY
        if (t > after && t <= to && (lastStart || next > nowMs)) out.push(make(s.name!, t, next, pulls))
      })
    }
  }
  return out
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
  const between = (s: Source, from: number) => !until || from >= until ? 0
    : s.per === 'day' ? Math.floor((until - from) / DAY)
    : s.per === 'week' ? mondays(from, until)
    : s.per === 'month' ? monthDays(from, until, s.days ?? s.day ?? 1)
    : s.per === 'every' ? Math.floor((until - from) / DAY / (s.every || 1))
    : patchesBetween(state.patches, game, from, until)
  const timesOf = (s: Source) => between(s, nowMs)
  // Modos que la app ya tiene como desafíos con fecha (Abismo, Shiyu, Torre…): los reinicios conocidos se cuentan con su dato real y la
  // cifra fija solo para los reinicios posteriores al último conocido. Así no se cuentan dos veces (10 nov 2026: en WuWa y Genshin pasaba).
  const claimed = new Set<string>()
  const named = (s: Source) => (s.aliases ?? (s.name ? [s.name.toLowerCase()] : []))
  const matchesOf = (s: Source) => state.events.filter(e => e.gameId === game.id && e.kind !== 'banner' && !claimed.has(e.id)
    && (s.matchChallenges ? isSeason(e) : named(s).some(a => e.title.toLowerCase().includes(a))))
  const ordered = [...econ.sources.filter(s => !s.matchChallenges), ...econ.sources.filter(s => s.matchChallenges)]
  const known = new Map<Source, { pending: GameEvent[]; from: number }>()
  for (const src of ordered) {
    if (!src.name) continue
    const m = matchesOf(src)
    if (!m.length) continue
    m.forEach(e => claimed.add(e.id))
    // Sin `pulls > 0`: una temporada conocida sin cifra en los datos (Memorial Arena de HI3) vale lo de la cifra fija, no 0.
    const pending = until ? m.filter(e => !state.done[e.id] && eventStatus(e, nowMs) !== 'ended' && +new Date(e.start) < until) : []
    known.set(src, { pending, from: Math.max(...m.map(e => +new Date(e.start))) })
  }
  const rows = econ.sources.filter(s => cfg.endgame || !s.endgame).map(src => {
    const k = known.get(src)
    if (!k && src.per === 'every' && src.anchor) { const times = everyTimes(+new Date(src.anchor), src.every || 1, nowMs, until).length; return { src, times, amount: times * src.amount } }
    if (!k) { const times = timesOf(src); return { src, times, amount: times * src.amount } }
    // Reinicios después de la última temporada conocida (`k.from`, su inicio). Cada N días: anclados a ese inicio (HSR escalona sus tres
    // modos cada 14 días). El resto: desde 2 días después de ese inicio, para no volver a contar la misma temporada (Endstate Matrix de
    // WuWa empieza el mismo día que la versión).
    const fixed = src.per === 'every'
      ? Math.max(0, Math.floor((until - k.from) / DAY / (src.every || 1)) - Math.floor(Math.max(0, nowMs - k.from) / DAY / (src.every || 1)))
      : between(src, Math.max(nowMs, k.from + 2 * DAY))
    return { src, times: k.pending.length + fixed, amount: k.pending.reduce((n, e) => n + (e.pulls > 0 ? e.pulls * per : src.amount), 0) + fixed * src.amount }
  })
  // Modos según tu puesto: cada elección hecha se convierte en una fila (y otra con sus tickets, si da).
  for (const ch of econ.choices ?? []) {
    const opt = ch.options[cfg.ranks?.[ch.id] ?? 0]
    if (!opt || (!opt.amount && !opt.tickets)) continue
    const base: Source = { name: `${ch.name} · ${opt.label}`, amount: opt.amount, per: ch.per, day: ch.day, every: ch.every, rank: true }
    const times = timesOf(base)
    if (opt.amount) rows.push({ src: base, times, amount: times * opt.amount })
    if (opt.tickets) rows.push({ src: { ...base, amount: opt.tickets, tickets: true }, times, amount: times * opt.tickets })
  }
  for (const inp of econ.inputs ?? []) {
    const amount = Math.max(0, cfg.custom?.[inp.id] ?? 0)
    if (!amount) continue
    const src: Source = { name: inp.name, amount, per: inp.per, day: inp.day, rank: true }
    const times = timesOf(src)
    rows.push({ src, times, amount: times * amount })
  }
  const eventList = until && cfg.events
    ? state.events.filter(e => e.gameId === game.id && e.kind !== 'banner' && !claimed.has(e.id) && e.pulls > 0 && !state.done[e.id] && eventStatus(e, nowMs) !== 'ended' && +new Date(e.start) < until)
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
