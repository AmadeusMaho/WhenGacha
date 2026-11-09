import { useSyncExternalStore } from 'react'

/**
 * Skins del sitio (prototipo, 9 nov 2026): cambian TODO el aspecto (botones, paneles, línea de tiempo, cursor…) al estilo de un gacha.
 * Cada skin es una hoja CSS de esta carpeta que solo aplica con <html data-skin="<id>"> y usa recursos de public/skins/<id>/.
 * Todo vive aquí; para quitarlas, ver README.md al lado. Se guarda aparte del estado de la app (`whengacha:skin`).
 * (Antes hubo temas "Negro OLED" y "Colores"; se quitaron.)
 */
export interface SkinDef {
  id: string
  /** Juego del catálogo (para el icono del selector). */
  game: string
  name: string
  /** Fuentes de Google Fonts que usa (familias con sus pesos, formato css2). */
  fonts?: string
  /** Fondo animado de la línea de tiempo: vídeo en bucle (sin audio) y su fotograma fijo (móvil, ahorro de datos, "reducir movimiento"). */
  live?: { video: string; poster: string }
}

export const SKINS: SkinDef[] = [
  { id: 'wuwa', game: 'wuwa', name: 'Wuthering Waves', fonts: 'family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600',
    // Vídeo de la portada de la web oficial, sin las bandas negras, a 960 px y sin audio (24 MB → 2,3 MB).
    live: { video: '/skins/wuwa/live.mp4', poster: '/skins/wuwa/live.jpg' } },
]

const KEY = 'whengacha:skin'
/** Código de apoyo ya comprobado por el servidor (POST /api/unlock, server/supporter.mjs). Desbloquea las skins en este navegador. */
const SUPPORTER_KEY = 'whengacha:supporter'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* solo para esta visita */ } },
}

let supporter = !!store.get(SUPPORTER_KEY)
// Sin código de apoyo no se aplica ninguna skin (una guardada con el selector anterior, o de antes del desbloqueo, se ignora).
let current = (() => { const raw = store.get(KEY); return supporter && raw && SKINS.some(s => s.id === raw) ? raw : null })()

export function setSkin(id: string | null) {
  if (id && !supporter) return
  current = id
  store.set(KEY, id)
  emit()
}

export const useSkin = (): string | null => useSyncExternalStore(subscribe, () => current)
export const useSupporter = (): boolean => useSyncExternalStore(subscribe, () => supporter)

export type UnlockResult = 'ok' | 'invalid' | 'too-many' | 'unavailable'

/** Comprueba un código de apoyo en el servidor y, si vale, desbloquea las skins en este navegador. */
export async function unlock(code: string): Promise<UnlockResult> {
  try {
    const res = await fetch('/api/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) })
    if (res.status === 429) return 'too-many'
    if (res.status >= 500 || res.status === 404) return 'unavailable'
    if (!((await res.json().catch(() => ({}))) as { ok?: boolean }).ok) return 'invalid'
  } catch { return 'unavailable' }
  supporter = true
  store.set(SUPPORTER_KEY, code.trim().toUpperCase())
  emit()
  return 'ok'
}

/** Pone `data-skin` en <html> y carga sus fuentes. Sin skin, no deja nada. */
export function applySkin(id: string | null) {
  const root = document.documentElement
  const def = SKINS.find(s => s.id === id)
  if (def) root.setAttribute('data-skin', def.id)
  else root.removeAttribute('data-skin')
  if (def?.fonts && !document.getElementById(`skin-font-${def.id}`)) {
    const link = Object.assign(document.createElement('link'), { id: `skin-font-${def.id}`, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${def.fonts}&display=swap` })
    document.head.appendChild(link)
  }
}

applySkin(current)
