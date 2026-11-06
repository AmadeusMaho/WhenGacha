import { useRef, useState } from 'react'
import { locale, t } from './i18n'
import { bannerArt, eventImage, faceOf, gameImage, logoOf, officialArt, wallpaperOf } from './images'
import { moveTracked, placeTracked, trackedGames } from './logic'
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

/** Fecha y hora en la zona horaria del navegador (con su abreviatura, p. ej. "GMT-5"). */
export const fmtDateTime = (iso: string | number, year = false) =>
  new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

/** Fin de un elemento con hora exacta; con "≈" cuando la hora no está confirmada. Sin fin anunciado: nada. */
export const fmtEnd = (e: { end: string; precision?: string }, year = false) => `${e.precision ? '≈ ' : ''}${fmtDateTime(e.end, year)}`

/** Lista para cambiar el orden de los juegos seguidos: filas grandes con subir / bajar (cómodas en móvil). */
export function ReorderList({ games, state, setState, onDone }: { games: Game[]; state: AppState; setState: Ctx['setState']; onDone: () => void }) {
  const list = trackedGames(games, state.tracked)
  const move = (id: string, dir: -1 | 1) => setState(s => ({ ...s, tracked: moveTracked(s.tracked, id, dir) }))

  // Arrastrar desde el asa: la fila se reubica en vivo según la fila sobre la que está el puntero.
  const [drag, setDrag] = useState<string | null>(null)
  const rows = useRef<HTMLOListElement>(null)
  const onMove = (ev: React.PointerEvent) => {
    if (!drag || !rows.current) return
    const over = [...rows.current.children].findIndex(r => {
      const b = r.getBoundingClientRect()
      return ev.clientY >= b.top && ev.clientY <= b.bottom
    })
    if (over >= 0 && list[over] && list[over].id !== drag) setState(s => ({ ...s, tracked: placeTracked(s.tracked, drag, list[over].id) }))
    if (ev.clientY < 70) window.scrollBy(0, -14)
    else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14)
  }
  const stop = () => setDrag(null)
  return (
    <section className="reorder" aria-label={t('order.title')}>
      <div className="reorder-head">
        <strong>{t('order.title')}</strong>
        <button className="btn sm soft" onClick={onDone}>{t('order.done')}</button>
      </div>
      <ol ref={rows}>
        {list.map((g, i) => (
          <li key={g.id} style={cssVar(g)} className={drag === g.id ? 'dragging' : ''}>
            <span className="reorder-grip" role="presentation" title={t('order.drag')}
              onPointerDown={ev => { ev.currentTarget.setPointerCapture(ev.pointerId); setDrag(g.id) }}
              onPointerMove={onMove} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>⠿</span>
            <span className="reorder-n">{i + 1}</span>
            <GameAvatar game={g} state={state} size={40} />
            <strong>{g.name}</strong>
            <span className="reorder-btns">
              <button disabled={i === 0} onClick={() => move(g.id, -1)} aria-label={t('move.up', { name: g.name })} title={t('move.upT')}>▲</button>
              <button disabled={i === list.length - 1} onClick={() => move(g.id, 1)} aria-label={t('move.down', { name: g.name })} title={t('move.downT')}>▼</button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Zona horaria del navegador: abreviatura corta (p. ej. "GMT-3") y nombre completo (p. ej. "America/Argentina/Buenos_Aires"). */
export function userZone(at: number | Date = Date.now()): { short: string; name: string } {
  const fmt = new Intl.DateTimeFormat(locale(), { timeZoneName: 'short' })
  return { short: fmt.formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? '', name: fmt.resolvedOptions().timeZone }
}

/** Letrero pequeño con la zona horaria en la que se muestran todas las horas. */
export function ZoneTag({ now }: { now: number }) {
  const z = userZone(now)
  if (!z.short) return null
  return <span className="ztag" title={t('tz.hint', { tz: z.name })}>🕒 {z.short}</span>
}

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
        <Img className="applogo" src={logo} alt={game.name} />
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

/** Mejor imagen de portada para un juego: el arte de su parche, su arte oficial, o la mejor que haya. */
export function heroOf(state: AppState, gameId: string): string | undefined {
  return wallpaperOf(gameId) || officialArt(gameId) || anyArt(state, gameId) || gameImage(gameId)
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
