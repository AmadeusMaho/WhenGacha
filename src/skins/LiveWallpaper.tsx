import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LiveClip, SkinDef } from './skins'

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* solo para esta visita */ } },
}

/** Con varios fondos, cada visita a la línea de tiempo muestra el siguiente; se recuerda cuál tocó (`whengacha:live:<skin>`). */
function nextClip(skin: string, n: number): number {
  if (n < 2) return 0
  const key = `whengacha:live:${skin}`
  const prev = Number(store.get(key))
  const i = Number.isInteger(prev) && prev >= 0 ? (prev + 1) % n : Math.floor(Math.random() * n)
  store.set(key, String(i))
  return i
}

/** Fondo que viene de fuera (el de la versión actual, desde el CDN oficial; ver liveFeed.ts). */
const remote = (c: LiveClip) => /^https?:/.test(c.video ?? c.poster)
/** Tiempo máximo para que un vídeo de fuera empiece a reproducirse antes de cambiarlo por uno propio. */
const STALL_MS = 10_000

/**
 * Fondo animado de una skin (solo en la línea de tiempo). Va en <body>, fuera de la cabecera (su backdrop-filter atraparía `position: fixed`).
 * Vídeo en bucle, sin audio; si la skin trae varios, cada visita a la pestaña usa el siguiente. Un fondo sin vídeo (solo `poster`)
 * se mueve despacio (acercamiento y desplazamiento lentos, clase `kb`), como un fondo animado. Se queda en el fotograma fijo, sin
 * movimiento, con pantallas pequeñas, "ahorro de datos" o "reducir movimiento"; el vídeo se pausa mientras la pestaña no se ve.
 * Si el fondo de la versión (de fuera) falla —el vídeo da error o no arranca en 10 s, o su imagen no carga—, se cambia por uno de
 * los que trae la skin (un vídeo si lo hay).
 */
export default function LiveWallpaper({ skin, live }: { skin: string; live: NonNullable<SkinDef['live']> }) {
  const clips: LiveClip[] = Array.isArray(live) ? live : [live]
  // Se elige al montar: SkinPicker lo monta al entrar en la línea de tiempo y lo desmonta al salir.
  const [clip, setClip] = useState(() => clips[nextClip(skin, clips.length)])
  const video = useRef<HTMLVideoElement>(null)
  const [still] = useState(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    return !!conn?.saveData || matchMedia('(prefers-reduced-motion: reduce), (max-width: 700px)').matches
  })

  const fallback = useCallback(() => {
    setClip(cur => {
      if (!remote(cur)) return cur
      const own = clips.filter(c => !remote(c))
      return own.find(c => !!c.video === !!cur.video) ?? own[0] ?? cur
    })
  }, [clips])

  // Imagen de fuera (fondo fijo, o el póster que se muestra en móvil): se comprueba que carga.
  useEffect(() => {
    if (!remote(clip) || (clip.video && !still)) return
    const img = new Image()
    img.onerror = fallback
    img.src = clip.poster
    return () => { img.onerror = null }
  }, [clip, still, fallback])

  // Vídeo de fuera: si no empieza a reproducirse a tiempo, se cambia.
  useEffect(() => {
    if (still || !clip.video || !remote(clip)) return
    const t = setTimeout(() => { if (!video.current || video.current.readyState < 3) fallback() }, STALL_MS)
    return () => clearTimeout(t)
  }, [clip, still, fallback])

  useEffect(() => {
    const v = video.current
    if (!v) return
    const sync = () => { if (document.hidden) v.pause(); else v.play().catch(() => {}) }
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [still, clip])

  // Fondo fijo animado: la imagen hace un recorrido de cámara (clase `kb`) y encima va una capa de luz (`skin-live-fx`: motas que suben
  // y un haz que la cruza; color por skin con --live-fx). Antes solo había un acercamiento del 7 % en 48 s y parecía una imagen quieta.
  return createPortal(
    still || !clip.video
      ? <>
          <div key={clip.poster} className={`skin-live${still ? '' : ' kb'}`} style={{ backgroundImage: `url(${clip.poster})` }} aria-hidden />
          {!still && <div className="skin-live-fx" aria-hidden />}
        </>
      : <video key={clip.video} ref={video} className="skin-live" src={clip.video} poster={clip.poster} autoPlay muted loop playsInline preload="auto"
          onError={remote(clip) ? fallback : undefined} aria-hidden />,
    document.body,
  )
}
