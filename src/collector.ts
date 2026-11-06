import { DOMParser } from 'linkedom'
import { CATALOG } from './catalog'
import { staleMs, syncSource } from './sources'
import type { GameEvent, Patch, PromoCode } from './types'

/**
 * Punto de entrada del recolector del servidor (se empaqueta con `npm run build:server` en server/bundle/collector.mjs).
 * Reutiliza las mismas fuentes que la app (src/sources): el servidor las ejecuta con un DOM de Node (linkedom) y su propio
 * proxy con caché, y guarda el resultado ya normalizado por juego para que los jugadores solo descarguen esa copia.
 */
export interface Snapshot {
  id: string
  /** Momento (ms) en que se generó la copia. */
  updated: number
  events: GameEvent[]
  patches: Patch[]
  codes: PromoCode[]
}

/** Trae la URL de una fuente (a través del proxy del servidor, con su caché y sus límites). */
export type Fetcher = (url: string) => Promise<Response>

/** Prepara el entorno de Node para ejecutar el código de las fuentes, pensado para el navegador. */
export function setup(fetcher: Fetcher): void {
  const g = globalThis as Record<string, unknown>
  g.DOMParser = DOMParser
  const store = new Map<string, string>()
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  g.fetch = (input: string | URL | Request) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const m = /^\/proxy\?u=(.+)$/.exec(raw) // si la app se empaquetó con VITE_USE_PROXY, las URLs vienen como /proxy?u=...
    return fetcher(m ? decodeURIComponent(m[1]) : raw)
  }
}

/** Juegos con fuente de datos y cada cuánto conviene renovarlos (ms). */
export const games = () => CATALOG.filter(g => g.api).map(g => ({ id: g.id, every: staleMs(g) }))

export async function collect(id: string): Promise<Snapshot> {
  const game = CATALOG.find(g => g.id === id && g.api)
  if (!game) throw new Error(`juego desconocido: ${id}`)
  const s = await syncSource(game)
  return { id, updated: Date.now(), events: s.events, patches: s.patches, codes: s.codes }
}
