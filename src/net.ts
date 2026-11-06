/**
 * Cuando la app se sirve desde su propio servidor (Docker, VITE_USE_PROXY=1), las consultas a las fuentes
 * externas pasan por /proxy: el servidor las cachea y las comparte entre todos los visitantes.
 * En desarrollo (npm run dev) se consulta directamente cada fuente.
 */
import type { GameEvent, Patch, PromoCode } from './types'

const USE_PROXY = import.meta.env.VITE_USE_PROXY === '1'

export const viaProxy = (url: string): string => (USE_PROXY ? `/proxy?u=${encodeURIComponent(url)}` : url)

/** Copia ya normalizada de un juego que genera el recolector del servidor (solo existe cuando la app se sirve desde su servidor). */
export interface GameSnapshot { id: string; updated: number; events: GameEvent[]; patches: Patch[]; codes: PromoCode[] }

const SNAPSHOT_MAX_AGE = 48 * 3_600_000

/** La copia del servidor, o `null` si no hay (desarrollo, servidor sin recolector, aún sin generar o demasiado vieja). */
export async function fetchSnapshot(id: string): Promise<GameSnapshot | null> {
  if (!USE_PROXY) return null
  try {
    const res = await fetch(`/data/${id}.json`)
    if (!res.ok) return null
    const snap = (await res.json()) as GameSnapshot
    return Array.isArray(snap.events) && Date.now() - snap.updated < SNAPSHOT_MAX_AGE ? snap : null
  } catch { return null }
}
