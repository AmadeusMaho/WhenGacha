import { useSyncExternalStore } from 'react'
import type { LiveClip } from './skins'

/**
 * Fondo de la versión actual de cada juego (server/skin-live.mjs → GET /data/skin-live.json): el vídeo de la portada de la web oficial
 * (si pesa ≤ 12 MB) o, si no, su imagen de portada. Se añade delante de los fondos que trae la skin, salvo que ya esté (`official`).
 * Solo con servidor propio (VITE_USE_PROXY=1); sin él, la skin usa solo sus fondos. Se pide una vez por visita.
 */
interface FeedItem { video?: string; poster: string; updated: number }
const USE_PROXY = import.meta.env.VITE_USE_PROXY === '1'

let feed: Record<string, FeedItem> = {}
let asked = false
const listeners = new Set<() => void>()

function load() {
  if (asked || !USE_PROXY) return
  asked = true
  fetch('/data/skin-live.json')
    .then(r => (r.ok ? r.json() : {}))
    .then(j => { if (j && typeof j === 'object') { feed = j as Record<string, FeedItem>; listeners.forEach(l => l()) } })
    .catch(() => { /* sin fondo de la versión: quedan los de la skin */ })
}

const sub = (cb: () => void) => { listeners.add(cb); load(); return () => { listeners.delete(cb) } }

/** Los fondos de la skin con el de la versión actual delante (si lo hay y no está ya entre ellos). */
export function useLiveWithFeed(skin: string | null, live: LiveClip | LiveClip[] | undefined): LiveClip[] | undefined {
  const all = useSyncExternalStore(sub, () => feed)
  if (!live || !skin) return live ? (Array.isArray(live) ? live : [live]) : undefined
  const list = Array.isArray(live) ? live : [live]
  const f = all[skin]
  if (!f?.poster) return list
  const known = new Set(list.flatMap(c => [c.official, c.video, c.poster]).filter(Boolean))
  if ((f.video && known.has(f.video)) || (!f.video && known.has(f.poster))) return list
  return [{ video: f.video, poster: f.poster, official: f.video ?? f.poster }, ...list]
}
