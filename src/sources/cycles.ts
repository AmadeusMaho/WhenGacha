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
 * Hora del servidor: como el resto de HI3 en la app, UTC+8 (Asia) y marcado "≈".
 */
export function hi3MemorialArena(gameId: string, now = Date.now()): GameEvent[] {
  const off = 8 * HOUR
  const local = new Date(now + off)
  // Martes 04:00 (hora del servidor) más reciente.
  const back = (local.getUTCDay() - 2 + 7) % 7
  let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back, 4) - off
  if (start > now) start -= 7 * DAY
  return [0, 1].map(k => {
    const s = start + k * 7 * DAY
    return ev(gameId, 'Memorial Arena', s, s + 6 * DAY - 2 * HOUR - 1000, '⟦d.hi3Arena⟧', true, now)
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
    .map(j => ev(gameId, 'Limbo', resets[j], resets[j + 1] - 1000, '⟦d.r99Limbo⟧', false, now))
}
