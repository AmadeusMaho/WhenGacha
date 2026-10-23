import { useState } from 'react'
import { bannerArt, eventImage, faceOf, gameImage, wallpaperOf } from './images'
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
  new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
export const fmtDateY = (iso: string | number) =>
  new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

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
