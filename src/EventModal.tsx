import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t, tx } from './i18n'
import { bannerArt, eventImage, faceOf, splashOf } from './images'
import { KIND_LABEL, countdown, eventStatus, partialPulls, pullsBefore, verdict } from './logic'
import { GameAvatar, Img, Tag, fmtDateTime, fmtEnd, type Ctx } from './ui'
import type { GameEvent } from './types'

/** Último punto donde el usuario hizo clic: el modal "crece" desde ahí. */
export const lastPointer = { x: 0, y: 0 }

export default function EventModal({ event: e, onClose, closing, ...ctx }: Ctx & { event: GameEvent; onClose: () => void; closing: boolean }) {
  const { state, setState, now, gameOf } = ctx
  const g = gameOf(e.gameId)
  const st = eventStatus(e, now)
  const v = verdict(e, now, g)
  const done = !!state.done[e.id]
  const box = useRef<HTMLDivElement>(null)
  const [pop, setPop] = useState(false) // chispa ✦ al marcar como completado
  const isBanner = e.kind === 'banner'
  const art = isBanner ? bannerArt(e) : eventImage(e)
  const plan = pullsBefore(e, state, g, now)
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

  const when = st === 'upcoming' ? t('card.startsIn', { t: countdown(+new Date(e.start) - now) })
    : st === 'active' ? (e.open ? t('time.open') : t('card.endsIn', { t: countdown(+new Date(e.end) - now) })) : t('time.ended')

  return (
    <div className={`backdrop ${closing ? 'closing' : ''}`} onClick={onClose}>
      <div ref={box} className={`modal ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={e.title}
        style={{ '--c': g?.color } as React.CSSProperties} onClick={ev => ev.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label={t('modal.close')}>×</button>
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
            {v.label && <Tag tone={v.tone}>{v.label}</Tag>}
            {e.precision && <Tag tone="mid">≈ {t(e.precision === 'estimated' ? 'prec.estimated' : 'prec.approx')}</Tag>}
            <strong>{when}</strong>
            <span className="muted">{fmtDateTime(e.start, true)} → {e.open ? t('time.open') : fmtEnd(e, true)}</span>
          </div>
          {e.pulls > 0 && <p className="pulls">{t('modal.pulls', { n: e.pulls })}{e.hours ? t('modal.pullsHours', { h: e.hours }) : ''}</p>}
          {e.description && <p className="desc">{tx(e.description)}</p>}
          {e.precision && <p className="desc muted">{t(e.precision === 'estimated' ? 'prec.estimatedHint' : 'prec.approxHint')}</p>}
          {plan && (
            <>
              <h3>{t('pull.title')}</h3>
              <p className="pulls"><b>~{plan.total}</b> {t('pull.unit')}</p>
              {plan.items.length > 0 ? (
                <ul className="pull-list">
                  {plan.items.map(p => (
                    <li key={p.id}>
                      <span>{p.title}</span>
                      <em>~{p.pulls}✦</em>
                      <button className="btn sm ghost" onClick={() => setState(s => ({ ...s, done: { ...s.done, [p.id]: true } }))}>{t('pull.done')}</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{t('pull.none')}</p>}
              <small className="muted">{t(partialPulls(g) ? 'pull.notePartial' : 'pull.note')}</small>
            </>
          )}
          {e.featured.length > 0 && (
            <>
              <h3>{t('modal.featured')}</h3>
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
              <h3>{t('modal.rewards')}</h3>
              <div className="rewards">
                {e.items.map(r => (
                  <span key={r.name} className="reward"><Img src={r.icon} />{r.name}<b>×{r.amount.toLocaleString()}</b></span>
                ))}
              </div>
            </>
          )}
          <div className="row actions">
            <button className={`btn mark ${done ? '' : 'primary'} ${pop ? 'pop' : ''}`} onClick={() => {
              if (!done) { setPop(true); setTimeout(() => setPop(false), 700) }
              setState(s => ({ ...s, done: { ...s.done, [e.id]: !done } }))
            }}>
              {!done && <span className="spark" aria-hidden>✦</span>}{done ? t('modal.undo') : t('modal.markDone')}
            </button>
            <small className="muted">{t('modal.synced')}</small>
          </div>
        </div>
      </div>
    </div>
  )
}
