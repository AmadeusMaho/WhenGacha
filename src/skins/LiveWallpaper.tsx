import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SkinDef } from './skins'

/**
 * Fondo animado de una skin (solo en la línea de tiempo). Va en <body>, fuera de la cabecera (su backdrop-filter atraparía `position: fixed`).
 * Vídeo en bucle, sin audio. Se queda en el fotograma fijo con pantallas pequeñas, "ahorro de datos" o "reducir movimiento",
 * y se pausa mientras la pestaña no se ve.
 */
export default function LiveWallpaper({ live }: { live: NonNullable<SkinDef['live']> }) {
  const video = useRef<HTMLVideoElement>(null)
  const [still] = useState(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    return !!conn?.saveData || matchMedia('(prefers-reduced-motion: reduce), (max-width: 700px)').matches
  })

  useEffect(() => {
    const v = video.current
    if (!v) return
    const sync = () => { if (document.hidden) v.pause(); else v.play().catch(() => {}) }
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [still])

  return createPortal(
    still
      ? <div className="skin-live" style={{ backgroundImage: `url(${live.poster})` }} aria-hidden />
      : <video ref={video} className="skin-live" src={live.video} poster={live.poster} autoPlay muted loop playsInline preload="auto" aria-hidden />,
    document.body,
  )
}
