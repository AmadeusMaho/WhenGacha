import { useState } from 'react'
import { locale } from './i18n'
import { bannerArt, eventImage, faceOf, gameImage, logoOf, wallpaperOf } from './images'
import type { AppState, Game, GameEvent } from './types'

export interface Ctx {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  games: Game[]
  now: number
  gameOf: (id: string) => Game | undefined
  open: (e: GameEvent) => void
}

export const fmtDate = (iso: string | number) =>
  new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
export const fmtDateY = (iso: string | number) =>
  new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })

export const cssVar = (g?: Game) => ({ '--c': g?.color ?? '#888', '--c2': g?.color2 ?? '#333' }) as React.CSSProperties

/** Imagen remota con aparición suave; se oculta si falla (muchas CDN bloquean hotlinking). */
export function Img({ src, alt = '', className, style }: { src?: string; alt?: string; className?: string; style?: React.CSSProperties }) {
  if (!src) return null
  return <FadeImg key={src} src={src} alt={alt} className={className} style={style} />
}

function FadeImg({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [st, setSt] = useState<'load' | 'ok' | 'bad'>('load')
  if (st === 'bad') return null
  return (
    <img className={`${className ?? ''} fx ${st === 'ok' ? 'in' : ''}`} style={style} src={src} alt={alt} loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onLoad={() => setSt('ok')} onError={() => setSt('bad')} />
  )
}

/** Avatar del juego: retrato del 5★ del banner activo, imagen del juego o monograma. */
export function GameAvatar({ game, state, size = 40 }: { game: Game; state: AppState; size?: number }) {
  const now = Date.now()
  const logo = logoOf(game.id)
  if (logo) {
    return (
      <span className="avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, ${game.color}, ${game.color2})`, fontSize: size * 0.3 }}>
        <Img className="logo" src={logo} alt={game.name} />
      </span>
    )
  }
  const banner = state.events.find(e => e.gameId === game.id && e.kind === 'banner' && +new Date(e.end) > now && e.featured[0] && faceOf(game.id, e.featured[0]))
  return (
    <span className="avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, ${game.color}, ${game.color2})`, fontSize: size * 0.3 }}>
      <span>{game.short}</span>
      <Img src={(banner && faceOf(game.id, banner.featured[0])) || gameImage(game.id) || anyArt(state, game.id)} />
    </span>
  )
}

/** Cualquier imagen disponible de un juego (evento, banner o splash), para que nunca falte una. */
export function anyArt(state: AppState, gameId: string): string | undefined {
  const now = Date.now()
  const list = state.events.filter(e => e.gameId === gameId && +new Date(e.end) > now - 30 * 86_400_000)
  const pick = list.find(e => e.kind === 'banner' && bannerArt(e)) ?? list.find(e => e.image) ?? list.find(e => eventImage(e))
  return pick ? (pick.kind === 'banner' ? bannerArt(pick) : eventImage(pick)) : undefined
}

/** Mejor imagen de portada para un juego: su fondo, o la mejor que haya. */
export function heroOf(state: AppState, gameId: string): string | undefined {
  return wallpaperOf(gameId) || anyArt(state, gameId) || gameImage(gameId)
}

export function Tag({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`chip ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>{children}</button>
}

const ico = (p: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p}</svg>
)
/** Iconos de los filtros: banner = estrella, evento = calendario, rotatorio = flechas circulares. */
export const FILTER_ICON = {
  banner: ico(<path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />),
  event: ico(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  challenge: ico(<><path d="M17 3l3.5 3.5L17 10" /><path d="M3.5 11V10a3.5 3.5 0 0 1 3.5-3.5h13.5" /><path d="M7 21l-3.5-3.5L7 14" /><path d="M20.5 13v1a3.5 3.5 0 0 1-3.5 3.5H3.5" /></>),
  hideDone: ico(<><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-3 3.8M6.4 6.5C4 8.2 2.5 12 2.5 12S6 19 12 19c1.5 0 2.8-.4 4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>),
  minor: ico(<><path d="M4 7h16M4 12h10M4 17h6" /></>),
} as const

/** Filtro de solo icono: se explica con un tooltip y funciona como interruptor. */
export function IconChip({ on, onClick, label, tone, children }: { on: boolean; onClick: () => void; label: string; tone?: string; children: React.ReactNode }) {
  return <button className={`ichip ${tone ?? ''} ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} aria-label={label} title={label}>{children}</button>
}
