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

/** Próximos gachas descubiertos por el servidor (server/upcoming-live.mjs: titulares de noticias + App Store). Vacío sin servidor. */
export interface LiveUpcoming { id: string; appId: number; name: string; publisher: string; date: string; icon?: string; url: string; news?: { site: string; title: string; link: string } }

export async function fetchUpcomingLive(): Promise<LiveUpcoming[]> {
  if (!USE_PROXY) return []
  try {
    const res = await fetch('/data/upcoming.json')
    if (!res.ok) return []
    const j = await res.json() as { items?: LiveUpcoming[] }
    return Array.isArray(j.items) ? j.items.filter(i => i && typeof i.name === 'string' && typeof i.date === 'string') : []
  } catch { return [] }
}
