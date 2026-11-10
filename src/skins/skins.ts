import { useSyncExternalStore } from 'react'
import { isSupporter, subscribe, useSupporter } from './premium'

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
  /** Fondo animado de la línea de tiempo: vídeo (sin audio) y su fotograma fijo (móvil, ahorro de datos, "reducir movimiento").
   *  Con una lista, cada visita a la línea de tiempo usa el siguiente (LiveWallpaper.tsx). */
  live?: LiveClip | LiveClip[]
}

/** Un fondo de la línea de tiempo: vídeo con su fotograma fijo, o solo una imagen (`poster`), que se mueve despacio. */
export interface LiveClip {
  video?: string
  poster: string
  /** URL original en la web oficial (para no repetirlo si /data/skin-live.json trae el mismo; ver liveFeed.ts). */
  official?: string
}

/** Fondos fijos (sin vídeo, se mueven despacio) de public/skins/<skin>/still-*.webp. */
const stills = (skin: string, names: string[]): LiveClip[] => names.map(n => ({ poster: `/skins/${skin}/still-${n}.webp` }))

/*
 * Fondos de la línea de tiempo: el vídeo de la web oficial que haya y fondos fijos oficiales (ver README, "Fondos de la línea de tiempo").
 * Cada visita a la pestaña muestra el siguiente.
 */
export const SKINS: SkinDef[] = [
  { id: 'wuwa', game: 'wuwa', name: 'Wuthering Waves', fonts: 'family=Sora:wght@400;500;600;700&family=Barlow:wght@400;500;600;700',
    // Vídeo de la portada de la web oficial, sin las bandas negras, a 960 px y sin audio (24 MB → 2,3 MB).
    live: [{ video: '/skins/wuwa/live.mp4', poster: '/skins/wuwa/live.jpg', official: 'https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/video/1785686400000/5yc48bs9y6at2nxg1h-1785753011124.mp4' },
      ...stills('wuwa', ['kv']), { poster: '/skins/wuwa/still-land.webp', official: 'https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/images/1785686400000/2si3153aj66b20t4be-1785753005811.png' }, { poster: '/skins/wuwa/bg.jpg' }] },
  // Prueba local con piezas de interfaz del Drive "UI Assets" (genshin.css); sin vídeo ni arte de personajes.
  { id: 'genshin', game: 'genshin', name: 'Genshin Impact', fonts: 'family=M+PLUS+Rounded+1c:wght@500;700;800',
    live: [{ video: '/skins/genshin/live-hour.mp4', poster: '/skins/genshin/live-hour.webp', official: 'https://act-webstatic.hoyoverse.com/puzzle/hk4e/pz_c6XZYm0GKS/resource/puzzle/2026/10/19/d138d1ad3bf6f5240eb726ed2ac3d4b0_1292059728731863742.mp4' }, ...stills('genshin', ['mond', 'liyue', 'inazuma', 'mond-dusk', 'sumeru'])] },
  // Prueba local (zzz.css) con assets oficiales de skowt.cc en public/skins/zzz/ y cursor propio (ver README).
  { id: 'zzz', game: 'zzz', name: 'Zenless Zone Zero', fonts: 'family=Rubik:wght@500;600;700;800;900',
    live: [{ video: '/skins/zzz/live-v33.mp4', poster: '/skins/zzz/live-v33.webp', official: 'https://act-webstatic.hoyoverse.com/puzzle/zzz/pz_ZYBGoSIMEV/resource/puzzle/2026/10/14/ef6f80c3ae7410ca14fd4d77571450ec_1154396356221499835.mp4' }, ...stills('zzz', ['agents', 'shards', 'sofa', 'party'])] },
  // Prueba local (hsr.css) con fondo y estrella de skowt.cc en public/skins/hsr/ y cursor propio (ver README).
  { id: 'hsr', game: 'hsr', name: 'Honkai: Star Rail', fonts: 'family=Barlow:wght@400;500;600;700',
    live: stills('hsr', ['v46', 'pink', 'mech', 'radio', 'pool']) },
  // Prueba local (nikke.css) con fondo y galones de la web oficial en public/skins/nikke/ (ver README); sin cursor propio.
  { id: 'nikke', game: 'nikke', name: 'NIKKE', fonts: 'family=Saira+Semi+Condensed:wght@400;500;600;700',
    // Siete live wallpapers de la página Art de la web oficial: uno distinto en cada visita a la línea de tiempo (LiveWallpaper.tsx).
    live: ['sin', 'coins', 'phantom', 'heaven', 'absolute', 'sphere', 'arcane'].map(n => ({ video: `/skins/nikke/live-${n}.mp4`, poster: `/skins/nikke/live-${n}.webp` })) },
  // Prueba local (uma.css) con piezas de interfaz del zip "Umamusume UI sprites" y el cursor del juego en public/skins/uma/ (ver README).
  { id: 'uma', game: 'uma', name: 'Umamusume', fonts: 'family=M+PLUS+Rounded+1c:wght@500;700;800',
    live: stills('uma', ['kv', 'stadium', 'race']) },
]

const KEY = 'whengacha:skin'
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* solo para esta visita */ } },
}
// Restos del sistema anterior de códigos "WG-…" (se podían publicar): se borran y ya no desbloquean nada.
store.set('whengacha:supporter', null)

// Las skins son de WhenGacha Premium (premium.ts): sin sesión de apoyo no se aplica ninguna.
let current = (() => { const raw = store.get(KEY); return isSupporter() && raw && SKINS.some(s => s.id === raw) ? raw : null })()

const listeners = new Set<() => void>()

export function setSkin(id: string | null) {
  if (id && !isSupporter()) return
  current = id
  store.set(KEY, id)
  applySkin(id)
  listeners.forEach(l => l())
}

const sub = (cb: () => void) => { listeners.add(cb); const off = subscribe(cb); return () => { listeners.delete(cb); off() } }
export const useSkin = (): string | null => useSyncExternalStore(sub, () => current)
// Si se cierra la sesión (o la anulan), vuelve la vista original.
subscribe(() => { if (current && !isSupporter()) { current = null; applySkin(preview) } })
export { useSupporter }

/*
 * Vista previa: sin Premium, cualquiera puede ver una skin puesta en la web para decidir si le gusta. Es temporal: no se guarda
 * (desaparece al recargar o al salir) y la barra de abajo lo deja claro. Si activa Premium durante la vista previa, se queda con esa skin.
 */
let preview: string | null = null
export const usePreview = (): string | null => useSyncExternalStore(sub, () => preview)

export function startPreview(id: string) {
  if (!SKINS.some(s => s.id === id)) return
  preview = id
  applySkin(id)
  listeners.forEach(l => l())
}

export function endPreview() {
  if (!preview) return
  preview = null
  applySkin(current)
  listeners.forEach(l => l())
}

subscribe(() => {
  if (preview && isSupporter()) { const keep = preview; preview = null; setSkin(keep) }
})

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
