import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './festive.css'
import type { Season } from './seasonal'
import LiveWallpaper from './skins/LiveWallpaper'
import { seasonBackgrounds } from './skins/skins'

/** Lista de fondos de cada temporada en FONDOS (skins.ts) / Wallpaureka. */
const BG_LIST: Record<Season, string> = { christmas: 'navidad' }

/**
 * Adornos de Navidad de la skin base (seasonal.ts decide cuándo): arbolito detrás del nombre, nieve suave detrás de las tarjetas y gorrito en el logo
 * (este, solo CSS: festive.css). Nada recibe clics ni tapa texto. Con "reducir movimiento", luces fijas y sin nieve.
 * Se carga aparte (React.lazy en App.tsx): fuera de temporada no se descarga.
 */
export default function Festive({ season }: { season: Season }) {
  // La cabecera ya está montada: Festive se carga aparte, después del primer dibujo de App.
  const [title] = useState(() => document.querySelector<HTMLElement>('.app > header .brand h1'))
  // Fondos de la temporada (los elige el dueño en Wallpaureka); cada visita, el siguiente de la lista. Sin ninguno, el degradado de siempre.
  const bgs = seasonBackgrounds(BG_LIST[season])
  if (season !== 'christmas') return null
  return (
    <>
      {bgs.length > 0 && <><LiveWallpaper skin={BG_LIST[season]} live={bgs} /><div className="xmas-veil" aria-hidden /></>}
      <Snow />
      {title && <Tree title={title} />}
    </>
  )
}

/**
 * Arbolito detrás del nombre (27 nov 2026; sustituye a las guirnaldas, que no convencían): un pino pequeño que asoma por detrás del final de
 * "WhenGacha", con estrella y 8 lucecitas. Es un SVG fijo dentro del <h1>, detrás de las letras (festive.css): no mide nada ni usa JavaScript
 * después de montarse. Las luces titilan solo con `opacity` (lo anima la GPU sin volver a pintar la página); con "reducir movimiento", fijas.
 */
/** Lucecitas: posición en el dibujo (30×40) y color, repartidas por los tres pisos como una serie enrollada. */
const TREE_LIGHTS: [number, number, string][] = [
  [12, 13.5, '#ffd166'], [18.5, 14.5, '#e8433f'],
  [9, 21.5, '#5cc8ff'], [15.5, 20.5, '#ffd166'], [22, 22.5, '#e8433f'],
  [6.5, 31, '#ffd166'], [14, 30, '#5cc8ff'], [22.5, 31.5, '#ffd166'],
]

function Tree({ title }: { title: HTMLElement }) {
  return createPortal(
    <svg className="xmas-tree" viewBox="0 0 30 40" aria-hidden>
      <defs>
        <linearGradient id="xt-leaf" x1="0" x2="1">
          <stop offset="0" stopColor="#2f8a52" />
          <stop offset=".55" stopColor="#1f6b3e" />
          <stop offset="1" stopColor="#164f2e" />
        </linearGradient>
      </defs>
      <rect x="13" y="33" width="4" height="6" rx="1" fill="#6b4428" />
      <path d="M15 16 L2 34 Q15 37 28 34 Z" fill="url(#xt-leaf)" />
      <path d="M15 9 L4.5 25 Q15 27.5 25.5 25 Z" fill="url(#xt-leaf)" />
      <path d="M15 3.5 L7 16.5 Q15 18.5 23 16.5 Z" fill="url(#xt-leaf)" />
      {/* Nieve en las puntas de cada piso */}
      <path d="M2.5 33.6 Q15 36.4 27.5 33.6" className="xt-snow" />
      <path d="M5 24.7 Q15 27 25 24.7" className="xt-snow" />
      {TREE_LIGHTS.map(([x, y, c], i) => (
        <circle key={i} className="xt-light" cx={x} cy={y} r="1.25" fill={c} style={{ animationDelay: `${-(i * 0.73) % 3.2}s` }} />
      ))}
      <path className="xt-star" d="M15 0 L16.2 2.6 L19 2.9 L16.9 4.8 L17.5 7.6 L15 6.2 L12.5 7.6 L13.1 4.8 L11 2.9 L13.8 2.6 Z" />
    </svg>,
    title,
  )
}

/**
 * Nieve: copos pequeños y lentos en un <canvas> fijo detrás del contenido (encima del fondo). Pocos (menos en móvil), se para con la pestaña oculta
 * y no se dibuja con "reducir movimiento".
 */
function Snow() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0
    type Flake = { x: number; y: number; r: number; vy: number; ph: number; sw: number; a: number }
    let flakes: Flake[] = []
    const make = (top = false): Flake => ({
      x: Math.random() * W, y: top ? -10 : Math.random() * H, r: 0.8 + Math.random() * 2.2,
      vy: 12 + Math.random() * 22, ph: Math.random() * Math.PI * 2, sw: 8 + Math.random() * 18, a: 0.35 + Math.random() * 0.45,
    })
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight
      cv.width = W * dpr; cv.height = H * dpr
      // Cambiar el tamaño del canvas borra su estado (color incluido): sin volver a ponerlo, la nieve salía negra tras un `resize` (en móvil, cada vez
      // que se esconde la barra de direcciones).
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#eef3ff'
      const want = Math.round(Math.min(90, W / (W < 700 ? 22 : 16)))
      flakes = flakes.slice(0, want)
      while (flakes.length < want) flakes.push(make())
    }
    resize()
    let raf = 0, last = performance.now()
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      ctx.clearRect(0, 0, W, H)
      for (const f of flakes) {
        f.y += f.vy * dt
        f.ph += dt * 0.8
        if (f.y > H + 10) Object.assign(f, make(true))
        const x = f.x + Math.sin(f.ph) * f.sw
        ctx.globalAlpha = f.a
        ctx.beginPath()
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    ctx.fillStyle = '#eef3ff'
    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame) }
    const vis = () => (document.hidden ? cancelAnimationFrame(raf) : start())
    start()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', vis)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return <canvas ref={ref} className="xmas-snow" aria-hidden />
}
