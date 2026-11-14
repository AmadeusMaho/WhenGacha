import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { liveState, subscribeLive } from './liveMode'
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

/** Fondo que viene de fuera: los vídeos de R2 (skins.ts, LIVE_CDN) y el de la versión actual, desde el CDN oficial (liveFeed.ts). */
const remote = (c: LiveClip) => /^https?:/.test(c.video ?? c.poster)
/** Tiempo máximo para que un vídeo de fuera empiece a reproducirse antes de cambiarlo por uno propio. */
const STALL_MS = 10_000
/** Duración del fundido entre una vuelta del bucle y la siguiente (s). */
const FADE = 0.8

/**
 * Fondo animado de una skin (solo en la línea de tiempo). Va en <body>, fuera de la cabecera (su backdrop-filter atraparía `position: fixed`).
 * Vídeo en bucle, sin audio; si la skin trae varios, cada visita a la pestaña usa el siguiente. Un fondo sin vídeo (solo `poster`)
 * se mueve despacio (acercamiento y desplazamiento lentos, clase `kb`), como un fondo animado. Se queda en el fotograma fijo, sin
 * movimiento según el modo de liveMode.ts (por defecto según la conexión) o con "reducir movimiento"; si el navegador bloquea la
 * reproducción automática, su póster con movimiento lento. El vídeo se pausa mientras la pestaña no se ve.
 * Si el fondo de la versión (de fuera) falla —el vídeo da error o no arranca en 10 s, o su imagen no carga—, se cambia por uno de
 * los que trae la skin (un vídeo si lo hay).
 */
export default function LiveWallpaper({ skin, live }: { skin: string; live: NonNullable<SkinDef['live']> }) {
  const clips: LiveClip[] = Array.isArray(live) ? live : [live]
  // Se elige al montar: SkinPicker lo monta al entrar en la línea de tiempo y lo desmonta al salir.
  const [clip, setClip] = useState(() => clips[nextClip(skin, clips.length)])
  const video = useRef<HTMLVideoElement>(null)
  // Estático (solo el póster, sin descargar el vídeo) según el modo del menú de skins (liveMode.ts): "auto" mira la conexión (datos móviles,
  // conexión lenta o ahorro de datos → estático), o siempre en movimiento / siempre estático. "Reducir movimiento" lo deja estático.
  // Cambia al momento si se toca el selector o cambia la conexión.
  const still = !useSyncExternalStore(subscribeLive, liveState).animated
  // Si el navegador no deja reproducir el vídeo solo (iPhone en modo de bajo consumo, ahorro de batería de Android…), se queda su
  // póster con el recorrido de cámara lento en vez de un fotograma quieto.
  const [blocked, setBlocked] = useState(false)

  const fallback = useCallback(() => {
    setClip(cur => {
      if (!remote(cur)) return cur
      const own = clips.filter(c => !remote(c))
      // Los vídeos de R2 traen su póster en public/: si el vídeo falla, se queda ese mismo fondo como imagen que se mueve.
      const still: LiveClip | undefined = cur.video && !/^https?:/.test(cur.poster) ? { poster: cur.poster } : undefined
      return own.find(c => !!c.video && !!cur.video) ?? still ?? own[0] ?? cur
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

  // Vídeo de fuera: si no ARRANCA a tiempo, se cambia. Solo se mira una vez por fondo y solo si nunca llegó a reproducirse: antes el plazo
  // se reiniciaba en cada redibujado (la lista de Genshin/ZZZ/WuWa se rehace en cada render) y un atasco momentáneo a media reproducción
  // cambiaba el vídeo por su imagen fija ("salta cada x tiempo", 13 nov 2026).
  const fallbackRef = useRef(fallback); fallbackRef.current = fallback
  const started = useRef(false)
  useEffect(() => {
    started.current = false
    if (still || !clip.video || !remote(clip)) return
    const t = setTimeout(() => { if (!started.current) fallbackRef.current() }, STALL_MS)
    return () => clearTimeout(t)
  }, [clip, still])

  // Bucle con fundido (13 nov 2026): muchos fondos no cierran el bucle limpio (el último fotograma no es el primero) y al volver a empezar
  // se veía un salto. Hay dos <video> con el mismo archivo (el segundo sale de la caché: no gasta datos); el de abajo (A) se ve siempre y el
  // de arriba (B) aparece o desaparece con un fundido. FADE segundos antes del final del que suena, el otro arranca desde 0 y se funde.
  const videoB = useRef<HTMLVideoElement>(null)
  const [topOn, setTopOn] = useState(false)
  useEffect(() => {
    const a = video.current, b = videoB.current
    if (!a || !b) return
    let active: HTMLVideoElement = a, raf = 0, stopT = 0, alive = true
    a.play().catch(e => { if ((e as DOMException)?.name === 'NotAllowedError') setBlocked(true) })
    const tick = () => {
      if (!alive) return
      const d = active.duration
      if (d && isFinite(d) && d <= FADE * 3) active.loop = true // demasiado corto para el fundido: bucle normal
      if (d && isFinite(d) && d > FADE * 3 && active.currentTime >= d - FADE) {
        const prev = active, next = active === a ? b : a
        next.currentTime = 0
        next.play().catch(() => {})
        setTopOn(next === b) // B aparece encima, o se desvanece dejando ver A, que ya empezó
        active = next
        clearTimeout(stopT)
        stopT = window.setTimeout(() => { prev.pause() }, FADE * 1000 + 100)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const sync = () => { if (document.hidden) { a.pause(); b.pause() } else active.play().catch(() => {}) }
    document.addEventListener('visibilitychange', sync)
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(stopT); document.removeEventListener('visibilitychange', sync) }
  }, [still, clip, blocked])

  // Fondo fijo animado: la imagen hace un recorrido de cámara (clase `kb`) y encima va una capa de luz (`skin-live-fx`: motas que suben
  // y un haz que la cruza; color por skin con --live-fx). Antes solo había un acercamiento del 7 % en 48 s y parecía una imagen quieta.
  return createPortal(
    still || !clip.video || blocked
      ? <>
          <div key={clip.poster} className={`skin-live${still ? '' : ' kb'}`} style={{ backgroundImage: `url(${clip.poster})` }} aria-hidden />
          {!still && <div className="skin-live-fx" aria-hidden />}
        </>
      // Los dos vídeos van dentro de UN contenedor `.skin-live`, que es el que atenúa cada skin (opacity/filter): si cada vídeo llevara su
      // propia opacidad, al alternarse se sumarían las dos capas y el fondo cambiaba de tono cada vuelta ("un fondo transparente por encima").
      : <div key={clip.video} className="skin-live skin-live-pair" aria-hidden>
          <video ref={video} className="skin-live-v" src={clip.video} poster={clip.poster} autoPlay muted playsInline preload="auto"
            onPlaying={() => { started.current = true }} onError={remote(clip) ? fallback : undefined} />
          <video ref={videoB} className={`skin-live-v skin-live-b${topOn ? ' on' : ''}`} src={clip.video} muted playsInline preload="auto" />
        </div>,
    document.body,
  )
}
