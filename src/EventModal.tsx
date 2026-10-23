import { useEffect, useLayoutEffect, useRef } from 'react'
import { bannerArt, eventImage, faceOf, splashOf } from './images'
import { KIND_LABEL, countdown, eventStatus, verdict } from './logic'
import { GameAvatar, Img, Tag, fmtDateY, type Ctx } from './ui'
import type { GameEvent } from './types'

/** Último punto donde el usuario hizo clic: el modal "crece" desde ahí. */
export const lastPointer = { x: 0, y: 0 }

export default function EventModal({ event: e, onClose, closing, ...ctx }: Ctx & { event: GameEvent; onClose: () => void; closing: boolean }) {
  const { state, setState, now, gameOf } = ctx
  const g = gameOf(e.gameId)
  const st = eventStatus(e, now)
  const v = verdict(e, now)
  const done = !!state.done[e.id]
  const box = useRef<HTMLDivElement>(null)
  const isBanner = e.kind === 'banner'
  const art = isBanner ? bannerArt(e) : eventImage(e)
  const f0Splash = isBanner ? splashOf(e.gameId, e.featured[0]) : undefined

  useEffect(() => {
    const onKey = (k: KeyboardEvent) => k.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect()
    if (r && lastPointer.x) box.current!.style.transformOrigin = `${lastPointer.x - r.left}px ${lastPointer.y - r.top}px`
  }, [])

  return (
    <div className={`backdrop ${closing ? 'closing' : ''}`} onClick={onClose}>
      <div ref={box} className={`modal ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={e.title}
        style={{ '--c': g?.color } as React.CSSProperties} onClick={ev => ev.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className={`modal-hero ${isBanner && f0Splash ? 'tall' : isBanner && e.gameId === 'uma' && e.image ? 'bnr' : ''}`}>
          <Img className={`hero-art ${e.gameId}`} src={art} />
          <div className="modal-hero-fade" />
          <div className="modal-title">
            {g && <GameAvatar game={g} state={state} size={44} />}
            <div>
              <small>{g?.name} · {KIND_LABEL[e.kind]}</small>
              <h2>{e.title}</h2>
            </div>
          </div>
        </div>
        <div className="modal-body">
          <div className="row wrap">
            <Tag tone={v.tone}>{v.label}</Tag>
            <strong>{st === 'upcoming' ? `Empieza en ${countdown(+new Date(e.start) - now)}` : st === 'active' ? `Quedan ${countdown(+new Date(e.end) - now)}` : 'Terminado'}</strong>
            <span className="muted">{fmtDateY(e.start)} → {fmtDateY(e.end)}</span>
          </div>
          {e.pulls > 0 && <p className="pulls">≈ <b>{e.pulls}</b> tiradas disponibles{e.hours ? ` en ~${e.hours}h` : ''}</p>}
          {e.description && <p className="desc">{e.description}</p>}
          {e.featured.length > 0 && (
            <>
              <h3>Destacados</h3>
              <div className="featured">
                {e.featured.map(f => (
                  <div key={f.name} className="portrait">
                    <Img src={splashOf(e.gameId, f) ?? faceOf(e.gameId, f)} />
                    <span>{f.name}</span>
                    {f.tag && <small>{f.tag}</small>}
                  </div>
                ))}
              </div>
            </>
          )}
          {e.items.length > 0 && (
            <>
              <h3>Recompensas</h3>
              <div className="rewards">
                {e.items.map(r => (
                  <span key={r.name} className="reward"><Img src={r.icon} />{r.name}<b>×{r.amount.toLocaleString('es')}</b></span>
                ))}
              </div>
            </>
          )}
          <div className="row actions">
            <button className={`btn ${done ? '' : 'primary'}`} onClick={() => setState(s => ({ ...s, done: { ...s.done, [e.id]: !done } }))}>
              {done ? '✓ Completado (deshacer)' : 'Marcar como completado'}
            </button>
            <small className="muted">Datos sincronizados automáticamente</small>
          </div>
        </div>
      </div>
    </div>
  )
}
