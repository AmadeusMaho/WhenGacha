import type { GameEvent } from '../types'

/**
 * Rotatorios con calendario fijo documentado (sin fuente con fechas): se calcula el ciclo en curso y el siguiente.
 * Cada regla cita su origen; si el juego cambia el calendario, hay que actualizarla aquí.
 */
const HOUR = 3_600_000
const DAY = 24 * HOUR

const ev = (gameId: string, title: string, start: number, end: number, description: string, approx: boolean, now: number): GameEvent => ({
  id: `${gameId}:challenge:cycle:${title}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'challenge', title, description,
  start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured: [], pulls: 0, source: 'api',
  precision: start > now ? 'estimated' : approx ? 'approx' : undefined,
})

/**
 * Honkai Impact 3rd · Memorial Arena: "runs from Tuesday, 04:00 to Monday, 02:00 every week" (wiki de Fandom, página "Memorial Arena", sep 2026).
 * Hora del servidor: como el resto de HI3 en la app, la de América (UTC-5; servers.ts la desplaza a cada región) y marcado "≈".
 */
export function hi3MemorialArena(gameId: string, now = Date.now()): GameEvent[] {
  const off = -5 * HOUR
  const local = new Date(now + off)
  // Martes 04:00 (hora del servidor) más reciente.
  const back = (local.getUTCDay() - 2 + 7) % 7
  let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back, 4) - off
  if (start > now) start -= 7 * DAY
  return [0, 1].map(k => {
    const s = start + k * 7 * DAY
    // Tope semanal en Exalted (wiki "Memorial Arena", versión 8.4): 100 Crystals por puntuación + 20 por cada uno de los 2 jefes SSS.
    return { ...ev(gameId, 'Memorial Arena', s, s + 6 * DAY - 2 * HOUR - 1000, '⟦d.hi3Arena⟧ ⟦d.upTo|140 Crystals⟧', true, now), items: [{ name: 'Crystals', amount: 140 }] }
  })
}

/**
 * Reverse: 1999 · Limbo (Artificial Somnambulism): "The dream stages will be regularly reset at 5:00am (UTC+8) on the 1st and 16th day of each month"
 * (wiki de Fandom, página "Artificial Somnambulism"). Las recompensas de Limbo Experiment se reinician con cada ciclo.
 */
export function r99Limbo(gameId: string, now = Date.now()): GameEvent[] {
  const off = 8 * HOUR
  const at = (y: number, m: number, d: number) => Date.UTC(y, m, d, 5) - off
  const local = new Date(now + off)
  const y = local.getUTCFullYear(), m = local.getUTCMonth()
  // Reinicios alrededor de hoy: 16 del mes anterior, 1 y 16 de este mes, 1 del siguiente…
  const resets = [at(y, m - 1, 16), at(y, m, 1), at(y, m, 16), at(y, m + 1, 1), at(y, m + 1, 16)]
  const i = resets.findIndex((r, j) => r <= now && now < resets[j + 1])
  return [i, i + 1].filter(j => j >= 0 && j + 1 < resets.length)
    // Tope por ciclo (dotgg.gg, "Artificial Somnambulism and Limbo Guide": "Limbo will net players with 600 clear drops 2160 oneiric fluid and
    // 30k sharpodonty if they are able to complete all the stages"; la wiki de Fandom no da el total). 600 Clear Drops = 3,3 tiradas.
    .map(j => ({ ...ev(gameId, 'Limbo', resets[j], resets[j + 1] - 1000, '⟦d.r99Limbo⟧ ⟦d.upTo|600 Clear Drops⟧', false, now),
      items: [{ name: 'Clear Drop', amount: 600 }, { name: 'Oneiric Fluid', amount: 2160 }, { name: 'Sharpodonty', amount: 30000 }], pulls: 3.3 }))
}

/**
 * Azur Lane · Ejercicios (PvP): temporadas de 14 días que acaban un lunes a las 00:00 del servidor global (UTC-7, sin horario de verano), un lunes sí y
 * otro no (blhx.fandom.com/wiki/Exercise: "reset every two weeks"; los Méritos no se reinician). Ninguna fuente publica las fechas: la referencia es una
 * captura del juego que encontró el dueño (14 nov 2026), "Season Time 0d 00:08:31" el lunes 16 dic 2024 a las 03:53 (GMT-3) → fin el 16 dic 2024 a las
 * 07:00 UTC. De ahí al 16 nov 2026 hay 700 días (50 temporadas exactas). Si el juego corriera el ciclo (un mantenimiento largo), hay que mover la referencia.
 */
export function alExercise(gameId: string, now = Date.now()): GameEvent[] {
  const ref = Date.UTC(2024, 11, 16, 7)
  const len = 14 * DAY
  const start = ref + Math.floor((now - ref) / len) * len
  return [0, 1].map(k => {
    const s = start + k * len
    // Méritos por temporada (wiki azurlane.koumakan.jp, "Exercise" → "Total Merit per Season": "a player can expect to earn about 20000 Merit in a
    // season if playing all the battles with an 80% or higher win rate"; los mejores, 25.000–30.000). No dan gemas ni cubos: no suman tiradas.
    return { ...ev(gameId, 'Exercise Season', s, s + len - 1000, '⟦d.alExercise⟧ ⟦d.upTo|~20,000 Merit⟧', true, now), items: [{ name: 'Merit', amount: 20000, icon: 'https://azurlane.netojuu.com/images/thumb/d/d6/Swordicon2.png/46px-Swordicon2.png' }] }
  })
}

/**
 * Punishing: Gray Raven · Phantom Pain Cage (Jaula del Dolor Fantasma): rotatorio semanal que se renueva con el reinicio del lunes
 * (grayravens.com/wiki/Phantom_Pain_Cage: "missions that refresh weekly on the Monday reset"; 3 jefes desde el nivel 54, 3 intentos al día
 * de lunes a viernes y 9 el sábado y el domingo). Los jefes salen al azar cada semana y por servidor (subpágina Bosses), así que no se pueden
 * anunciar; cada jefe tiene su debilidad de elemento, que decide qué equipo conviene esa semana. Ninguna fuente da la hora: se usa el reinicio
 * diario del juego, 05:00 del servidor, con la hora de América (UTC-5), y se marca "≈".
 */
export function pgrPainCage(gameId: string, now = Date.now()): GameEvent[] {
  const off = -5 * HOUR
  const local = new Date(now + off)
  const back = (local.getUTCDay() - 1 + 7) % 7
  let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back, 5) - off
  if (start > now) start -= 7 * DAY
  return [0, 1].map(k => {
    const s = start + k * 7 * DAY
    // Arte: tres tarjetas de jefe de la Jaula (bosssingletab53/54/34 del cliente: Melinoe y compañía), una por jefe de la semana;
    // public/icons/pgr-pain-cage.webp, del explorador de assets.huaxu.app (no son los jefes de esa semana, que no se conocen).
    // Tope semanal, zona Ultimate (Gray Ravens wiki, grayravens.com/wiki/Phantom_Pain_Cage, recompensas base ×1; con la sincronización con CN el
    // Global las da dobles o triples): Black Cards = 400 de las 8 misiones semanales + 50 de la puntuación acumulada; Phantom Pain Scar = 60 de la
    // puntuación + 12 del ranking del 1 % de Intensive Battle; Cogs = 36.000 + 68.000. Indicado por el dueño el 21 nov 2026 (la página de Fandom
    // que se usó antes está desfasada: no tenía las misiones ni los Black Cards).
    const W = 'https://static.wikitide.net/pgrwiki/thumb'
    return { ...ev(gameId, 'Phantom Pain Cage', s, s + 7 * DAY - 1000, '⟦d.pgrCage⟧ ⟦d.upTo|450 Black Cards⟧', true, now), image: '/icons/pgr-pain-cage.webp',
      items: [
        { name: 'Black Card', amount: 450, icon: `${W}/2/2e/Item-BlackCard.png/46px-Item-BlackCard.png` },
        { name: 'Phantom Pain Scar', amount: 72, icon: `${W}/6/60/Item-PhantomPainScar.png/46px-Item-PhantomPainScar.png` },
        { name: 'Cogs', amount: 104000, icon: `${W}/a/a3/Item-Cogs.png/46px-Item-Cogs.png` },
      ] }
  })
}

/**
 * Punishing: Gray Raven · War Zone: semanal, de lunes a domingo, 07:00–20:00 UTC (Gray Ravens wiki, "War Zone": "appears once a week, running
 * from Monday - Sunday, 7:00 - 20:00 UTC"). Tope: las misiones semanales de participación, 600 Black Cards y 40.000 Cogs (base ×1; el Global las da
 * dobles o triples mientras se sincroniza con CN). La War Zone Influence depende del rango: no se suma.
 */
export function pgrWarZone(gameId: string, now = Date.now()): GameEvent[] {
  const d = new Date(now)
  const back = (d.getUTCDay() - 1 + 7) % 7
  let start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, 7)
  if (start > now) start -= 7 * DAY
  const W = 'https://static.wikitide.net/pgrwiki/thumb'
  return [0, 1].map(k => {
    const s = start + k * 7 * DAY
    return { ...ev(gameId, 'War Zone', s, s + 6 * DAY + 13 * HOUR - 1000, '⟦d.pgrWarZone⟧ ⟦d.upTo|600 Black Cards⟧', false, now),
      items: [
        { name: 'Black Card', amount: 600, icon: `${W}/2/2e/Item-BlackCard.png/46px-Item-BlackCard.png` },
        { name: 'Cogs', amount: 40000, icon: `${W}/a/a3/Item-Cogs.png/46px-Item-Cogs.png` },
      ] }
  })
}
