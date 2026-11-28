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
export default function Festive({ season, snow }: { season: Season; snow: 'auto' | 'on' | 'off' }) {
  // La cabecera ya está montada: Festive se carga aparte, después del primer dibujo de App.
  const [title] = useState(() => document.querySelector<HTMLElement>('.app > header .brand h1'))
  // Fondos de la temporada (los elige el dueño en Wallpaureka); cada visita, el siguiente de la lista. Sin ninguno, el degradado de siempre.
  const bgs = seasonBackgrounds(BG_LIST[season])
  if (season !== 'christmas') return null
  return (
    <>
      {bgs.length > 0 && <><LiveWallpaper skin={BG_LIST[season]} live={bgs} /><div className="xmas-veil" aria-hidden /></>}
      {snowAllowed(snow) && <Snow />}
      {title && <Tree title={title} />}
    </>
  )
}

/**
 * Arbolito junto al nombre (27 nov 2026; sustituye a las guirnaldas, y la 2.ª versión, más elaborada, al pino de tres triángulos que "parecía un
 * emoji"): cuatro pisos con el borde de ramas festoneado, sombra debajo y luz por la izquierda, nieve en las puntas, espumillón dorado, bolas con
 * brillo, lucecitas, estrella con halo y dos regalos al pie. Es un SVG fijo dentro del <h1>, junto a las letras (festive.css): las formas se
 * calculan una vez al cargar el módulo y no hay JavaScript después. Solo titilan las lucecitas, con `opacity` (la GPU, sin repintar la página);
 * con "reducir movimiento", fijas.
 */
/** Piso del árbol (dibujo de 48×64, eje en x = 24): lados algo curvos y el borde de abajo en `n` festones, como puntas de ramas. */
function tier(yt: number, yb: number, w: number, n: number): { d: string; tips: [number, number, number][] } {
  const l = 24 - w, step = (2 * w) / n, k = yt + (yb - yt) * 0.45
  let d = `M24 ${yt} C${24 - w * 0.35} ${k} ${24 - w * 0.8} ${yb - 3} ${l} ${yb}`
  const tips: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const x0 = l + i * step, xm = x0 + step / 2
    d += ` Q${xm.toFixed(2)} ${yb + 3.4} ${(x0 + step).toFixed(2)} ${yb}`
    tips.push([xm, yb + 1.9, step])
  }
  d += ` C${24 + w * 0.8} ${yb - 3} ${24 + w * 0.35} ${k} 24 ${yt} Z`
  return { d, tips }
}
const TIERS = [tier(27, 54, 20, 6), tier(19, 43, 16, 5), tier(12, 31, 12, 4), tier(6, 20, 8, 3)]
/** Bolas: posición, radio y color (rojo, oro, azul, plata). */
const BAUBLES: [number, number, number, string][] = [
  [19, 17, 1.7, '#d93a3a'], [28.5, 27, 1.9, '#f2b33d'], [17, 36, 2, '#3a7bd5'], [31.5, 39, 2, '#d93a3a'],
  [21, 49, 2.2, '#f2b33d'], [35, 50, 2, '#c9ced8'], [11.5, 50, 2, '#3a7bd5'],
]
/** Regalitos al pie: x, y, ancho, alto, color de la caja y de la cinta. Pequeños y de distintos tamaños, como apilados de cualquier manera. */
const GIFTS: [number, number, number, number, string, string][] = [
  [7, 56.5, 7, 6.5, '#c8323a', '#f2c14e'], [15.5, 59, 5, 4.5, '#f2b33d', '#c8323a'],
  [28.5, 58.5, 4.5, 5, '#2f9a5d', '#eef3ff'], [33.5, 56, 7.5, 7, '#3a6fc4', '#eef3ff'],
]
/** Lucecitas de la serie (titilan), repartidas por los cuatro pisos. */
const TREE_LIGHTS: [number, number, string][] = [
  [25.5, 14, '#ffe08a'], [16.5, 27.5, '#ffe08a'], [23.5, 24.5, '#ff9f8a'], [33.5, 33, '#ffe08a'], [12.5, 43, '#9fd8ff'],
  [26, 40.5, '#ffe08a'], [39, 46.5, '#ff9f8a'], [17, 53, '#ffe08a'], [29.5, 53.5, '#9fd8ff'], [7.5, 52.5, '#ffe08a'],
]

function Tree({ title }: { title: HTMLElement }) {
  return createPortal(
    <svg className="xmas-tree" viewBox="0 0 48 64" aria-hidden>
      <defs>
        <linearGradient id="xt-leaf" x1="0" x2="1">
          <stop offset="0" stopColor="#2f8c53" />
          <stop offset=".5" stopColor="#1f6b3e" />
          <stop offset="1" stopColor="#13482a" />
        </linearGradient>
        {/* Luz por la izquierda: un velo claro que se apaga hacia el centro. */}
        <linearGradient id="xt-shine" x1="0" x2="1">
          <stop offset="0" stopColor="#bff5cf" stopOpacity=".28" />
          <stop offset=".45" stopColor="#bff5cf" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="xt-halo">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity=".75" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Tronco */}
      <rect x="21" y="52" width="6" height="8" rx="1" fill="#6b4428" />
      {/* Pisos, de abajo arriba: sombra, follaje, luz y nieve en las puntas */}
      {TIERS.map((t, i) => (
        <g key={i}>
          <path d={t.d} transform="translate(0 1.6)" fill="#0d3320" />
          <path d={t.d} fill="url(#xt-leaf)" />
          <path d={t.d} fill="url(#xt-shine)" />
          {t.tips.filter((_, j) => j % 2 === i % 2).map(([x, y, s], j) => (
            <ellipse key={j} cx={x} cy={y} rx={s * 0.32} ry="1.05" fill="#eef3ff" opacity=".88" />
          ))}
        </g>
      ))}
      {/* Espumillón dorado enrollado (cuentas) */}
      <path className="xt-tinsel" d="M15.5 21.5 Q24 26.5 33 21" />
      <path className="xt-tinsel" d="M11 33 Q24 39 37.5 32" />
      <path className="xt-tinsel" d="M7.5 45 Q24 51.5 41 44" />
      {BAUBLES.map(([x, y, r, c], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill={c} />
          <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.32} fill="#fff" opacity=".7" />
        </g>
      ))}
      {TREE_LIGHTS.map(([x, y, c], i) => (
        <circle key={i} className="xt-light" cx={x} cy={y} r=".95" fill={c} style={{ animationDelay: `${-(i * 0.73) % 3.2}s` }} />
      ))}
      {/* Regalitos al pie, delante de las ramas de abajo: caja, cinta en cruz y lazo */}
      {GIFTS.map(([x, y, w, h, box, ribbon], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx=".7" fill={box} />
          <rect x={x} y={y} width={w} height={h * 0.28} rx=".5" fill="#000" opacity=".12" />
          <path d={`M${x + w / 2} ${y} V${y + h} M${x} ${y + h * 0.45} H${x + w}`} stroke={ribbon} strokeWidth=".9" />
          <ellipse cx={x + w / 2 - 1.1} cy={y - 0.6} rx="1.2" ry=".75" fill="none" stroke={ribbon} strokeWidth=".8" />
          <ellipse cx={x + w / 2 + 1.1} cy={y - 0.6} rx="1.2" ry=".75" fill="none" stroke={ribbon} strokeWidth=".8" />
        </g>
      ))}
      {/* Estrella con su halo */}
      <circle cx="24" cy="5" r="7" fill="url(#xt-halo)" />
      <path className="xt-star" d="M24 0 L25.6 3.4 L29.3 3.8 L26.5 6.3 L27.3 10 L24 8.1 L20.7 10 L21.5 6.3 L18.7 3.8 L22.4 3.4 Z" />
    </svg>,
    title,
  )
}

/**
 * ¿Se dibuja la nieve? (28 nov 2026: en móviles y equipos modestos el canvas a 60 fps gastaba batería y daba tirones.) Con 'auto' no sale en
 * pantallas táctiles/estrechas, con ahorro de datos, ni con pocos núcleos o poca memoria; 'on'/'off' (Mis gachas → Ajustes) mandan siempre.
 * "Reducir movimiento" la apaga en cualquier caso (dentro de Snow).
 */
export function snowAllowed(mode: 'auto' | 'on' | 'off'): boolean {
  if (mode !== 'auto') return mode === 'on'
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || !!nav.connection?.saveData
  return !mobile && !weak
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
