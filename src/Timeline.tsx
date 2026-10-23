import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from './i18n'
import { bannerArt, eventImage, faceOf, splashOf, wallpaperOf } from './images'
import { KIND_LABEL, countdown, eventStatus, packRows, verdict } from './logic'
import { Chip, GameAvatar, Img, Tag, anyArt, cssVar, fmtDate, type Ctx } from './ui'
import type { AppState, Game, GameEvent, Kind } from './types'

const DAY = 86_400_000
const HOUR = 3_600_000
const ROW_H = 40
const KIND_ORDER: Kind[] = ['banner', 'event', 'challenge']
/** Títulos de las secciones (en plural), en el idioma actual. */
const SECTION_LABEL = {
  get banner() { return t('kindN.banner') },
  get event() { return t('kindN.event') },
  get challenge() { return t('kindN.challenge') },
} as Record<Kind, string>
const HEAD_H = 32
const AXIS_H = 34
/** La línea de tiempo no se extiende más allá de este horizonte (lo más lejano queda en la cuadrícula). */
const HORIZON_DAYS = 75
/** En la cuadrícula, cada sección muestra lo activo y lo que empieza en este plazo; el resto, bajo "Mostrar más". */
const SOON_DAYS = 14
const COLLAPSE_OVER = 12
const ZOOMS = [{ key: 'zoom.2w', ppd: 56 }, { key: 'zoom.6w', ppd: 28 }, { key: 'zoom.3m', ppd: 14 }] as const
type View = 'timeline' | 'grid'

const precLabel = (p: NonNullable<GameEvent['precision']>) => t(p === 'estimated' ? 'prec.estimated' : 'prec.approx')
const precHint = (p: NonNullable<GameEvent['precision']>) => t(p === 'estimated' ? 'prec.estimatedHint' : 'prec.approxHint')

function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try { return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback } catch { return fallback }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignorar */ } }, [key, value])
  return [value, setValue] as const
}

/** true en pantallas de celular (ancho ≤ 700 px). */
function useNarrow() {
  const q = '(max-width: 700px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

interface Filters { kinds: Record<Kind, boolean>; hideDone: boolean; showMinor: boolean }
interface Fold { collapsed: string[]; toggle: (id: string) => void }

/** Elementos de los juegos que sigues que pasan los filtros. */
function filterEvents(state: AppState, f: Filters) {
  return state.events.filter(e => state.tracked.includes(e.gameId) && f.kinds[e.kind] && !(f.hideDone && state.done[e.id]) && (f.showMinor || !e.minor))
}

export default function TimelineTab(ctx: Ctx & { goMine: () => void; transition: (fn: () => void) => void }) {
  const { state, games, now, open, goMine, transition } = ctx
  const narrow = useNarrow()
  const [view, setView] = useStored<View>('whengacha:view', 'timeline')
  const [zoom, setZoom] = useStored<number>('whengacha:zoom', narrow ? 0 : 1)
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ event: true, banner: true, challenge: true })
  const [hideDone, setHideDone] = useState(false)
  const [showMinor, setShowMinor] = useStored<boolean>('whengacha:minor', false)
  // Los juegos aparecen siempre abiertos al entrar; se pueden cerrar mientras usas la app.
  const [collapsed, setCollapsed] = useState<string[]>([])
  const tracked = useMemo(() => games.filter(g => state.tracked.includes(g.id)), [games, state.tracked])
  const hasMinor = state.events.some(e => e.minor && state.tracked.includes(e.gameId))
  const filters: Filters = { kinds, hideDone, showMinor }

  const toggle = useCallback((id: string) => setCollapsed(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id])), [])
  const allFolded = tracked.length > 0 && tracked.every(g => collapsed.includes(g.id))

  /** Lleva a un juego: en la cuadrícula baja a su sección; en la línea de tiempo desplaza el carril dentro de su caja. */
  const jump = (id: string) => {
    setCollapsed(c => c.filter(x => x !== id))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`g-${id}`)
      if (!el) return
      const tl = el.closest('.tl') as HTMLElement | null
      if (tl) {
        tl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        tl.scrollTo({ top: Math.max(0, el.offsetTop - AXIS_H), behavior: 'smooth' })
      } else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }))
  }

  if (!state.tracked.length)
    return (
      <div className="empty">
        <p>{t('tl.empty')}</p>
        <button className="btn primary" onClick={goMine}>{t('btn.choose')}</button>
      </div>
    )

  return (
    <>
      <EndingSoon state={state} games={games} now={now} open={open} showMinor={showMinor} />

      <div className="toolbar">
        <div className="group">
          {(['event', 'banner', 'challenge'] as Kind[]).map(k => (
            <Chip key={k} on={kinds[k]} onClick={() => setKinds(s => ({ ...s, [k]: !s[k] }))}>{SECTION_LABEL[k]}</Chip>
          ))}
          <Chip on={hideDone} onClick={() => setHideDone(a => !a)}>{t('f.hideDone')}</Chip>
          {hasMinor && <Chip on={showMinor} onClick={() => setShowMinor(a => !a)}>{t('f.minor')}</Chip>}
        </div>
        <div className="group">
          {view === 'timeline' && (
            <div className="seg" role="group" aria-label={t('zoom.aria')}>
              {ZOOMS.map((z, i) => <button key={z.key} className={i === zoom ? 'on' : ''} onClick={() => setZoom(i)}>{t(z.key)}</button>)}
            </div>
          )}
          <div className="seg" role="group" aria-label={t('view.aria')}>
            <button className={view === 'timeline' ? 'on' : ''} onClick={() => transition(() => setView('timeline'))}>{t('view.line')}</button>
            <button className={view === 'grid' ? 'on' : ''} onClick={() => transition(() => setView('grid'))}>{t('view.grid')}</button>
          </div>
        </div>
      </div>

      <nav className="jump" aria-label={t('jump.aria')}>
        {tracked.map(g => (
          <button key={g.id} className="jump-chip" style={cssVar(g)} onClick={() => jump(g.id)} title={t('jump.go', { name: g.name })}>
            <i className="jump-dot" />{g.short}
          </button>
        ))}
        <button className="jump-chip ghost" onClick={() => setCollapsed(allFolded ? [] : tracked.map(g => g.id))}>
          {allFolded ? t('jump.unfold') : t('jump.fold')}
        </button>
      </nav>

      {view === 'timeline'
        ? <Gantt {...ctx} filters={filters} zoom={zoom} narrow={narrow} fold={{ collapsed, toggle }} />
        : <GridView {...ctx} filters={filters} fold={{ collapsed, toggle }} />}
    </>
  )
}

/* ---------- Resumen: lo que termina en las próximas 72 horas ---------- */
function EndingSoon({ state, games, now, open, showMinor }: Pick<Ctx, 'state' | 'games' | 'now' | 'open'> & { showMinor: boolean }) {
  const items = state.events
    .filter(e => state.tracked.includes(e.gameId) && !state.done[e.id] && (showMinor || !e.minor)
      && +new Date(e.start) <= now && +new Date(e.end) > now && +new Date(e.end) - now <= 72 * HOUR)
    .sort((a, b) => +new Date(a.end) - +new Date(b.end))
    .slice(0, 14)
  const gameOf = (id: string) => games.find(g => g.id === id)
  return (
    <section className="soon-strip" aria-label={t('soon.title')}>
      <h3>{t('soon.title')} {items.length > 0 && <small>{items.length}</small>}</h3>
      {items.length === 0
        ? <p className="muted">{t('soon.none')}</p>
        : (
          <div className="soon-list">
            {items.map(e => {
              const g = gameOf(e.gameId)
              const left = +new Date(e.end) - now
              const img = e.kind === 'banner' ? bannerArt(e) : eventImage(e)
              return (
                <button key={e.id} className={`soon-card ${left < 24 * HOUR ? 'urgent' : ''}`} style={cssVar(g)} onClick={() => open(e)}>
                  <Img className="soon-img" src={img} />
                  <span className="soon-txt"><b>{e.title}</b><small>{g?.short} · {KIND_LABEL[e.kind]}</small></span>
                  <em>{countdown(left)}</em>
                </button>
              )
            })}
          </div>
        )}
    </section>
  )
}

/* ---------- Línea de tiempo ---------- */
function FoldButton({ folded, onClick, name }: { folded: boolean; onClick: () => void; name: string }) {
  return (
    <button className="fold" onClick={onClick} aria-expanded={!folded} aria-label={t(folded ? 'fold.expand' : 'fold.collapse', { name })} title={t(folded ? 'fold.expandT' : 'fold.collapseT')}>
      {folded ? '▸' : '▾'}
    </button>
  )
}

function Gantt({ state, games, now, open, filters, zoom, narrow, fold }: Ctx & { filters: Filters; zoom: number; narrow: boolean; fold: Fold }) {
  const ppd = ZOOMS[zoom].ppd
  const labelW = narrow ? 64 : 176
  const t0 = new Date(now - 3 * DAY).setHours(0, 0, 0, 0)
  const horizon = now + HORIZON_DAYS * DAY
  const visible = useMemo(
    () => filterEvents(state, filters).filter(e => +new Date(e.end) > t0 && +new Date(e.start) < horizon),
    [state, filters, t0, horizon],
  )
  const tEnd = Math.min(Math.max(now + 45 * DAY, ...visible.map(e => +new Date(e.end))), horizon)
  const days = Math.ceil((tEnd - t0) / DAY) + 2
  const width = days * ppd
  const x = (tm: number) => ((tm - t0) / DAY) * ppd

  const lanes = games.filter(g => state.tracked.includes(g.id))
  const weeks: number[] = []
  const first = new Date(t0)
  first.setDate(first.getDate() + ((8 - first.getDay()) % 7 || 7))
  for (let tm = +first; tm < t0 + days * DAY; tm += 7 * DAY) weeks.push(tm)

  return (
    <>
      <div className="tl" style={{ '--label-w': `${labelW}px` } as React.CSSProperties}>
        <div className="tl-inner" style={{ width: labelW + width }}>
          <div className="tl-axis">
            <div className="tl-corner" />
            <div className="tl-track axis" style={{ width }}>
              {weeks.map(w => <span key={w} className="tick" style={{ left: x(w) }}>{fmtDate(w)}</span>)}
              <span className="today-flag" style={{ left: x(now) }}>{t('today')}</span>
            </div>
          </div>

          {lanes.map(g => {
            const mine = visible.filter(e => e.gameId === g.id)
            const folded = fold.collapsed.includes(g.id)
            let y = 26
            const sections = folded ? [] : KIND_ORDER.flatMap(k => {
              const packed = packRows(mine.filter(e => e.kind === k))
              if (!packed.length) return []
              const rows = Math.max(...packed.map(p => p.row + 1))
              const sec = { k, packed, top: y, height: HEAD_H + rows * ROW_H + 14 }
              y += sec.height
              return [sec]
            })
            const patches = state.patches.filter(p => p.gameId === g.id && +new Date(p.date) > t0 && +new Date(p.date) < tEnd)
            return (
              <div key={g.id} id={`g-${g.id}`} className={`tl-lane ${folded ? 'folded' : ''}`} style={cssVar(g)}>
                <div className="tl-label">
                  <div className="tl-label-in">
                    <GameAvatar game={g} state={state} size={narrow ? 34 : 36} />
                    {!narrow && <span><strong>{g.short}</strong><small>{g.name}</small></span>}
                    <FoldButton folded={folded} onClick={() => fold.toggle(g.id)} name={g.name} />
                  </div>
                </div>
                <div className="tl-track" style={{ width, height: folded ? 48 : Math.max(y, 26 + ROW_H) }}>
                  {weeks.map(w => <i key={w} className="grid-line" style={{ left: x(w) }} />)}
                  <i className="now-line" style={{ left: x(now) }} />
                  {folded && <span className="lane-empty">{t('lane.folded', { n: mine.length })}</span>}
                  {!folded && patches.map(p => (
                    <span key={p.id} className={`patch-mark ${p.estimated ? 'est' : ''}`} style={{ left: x(+new Date(p.date)) }}
                      title={t(p.estimated ? 'patch.markEst' : 'patch.mark', { v: p.version, date: fmtDate(p.date) })}>
                      ◆ v{p.version}
                    </span>
                  ))}
                  {!folded && !sections.length && <span className="lane-empty">{t('lane.none')}</span>}
                  {sections.map(sec => (
                    <div key={sec.k} className={`sec-band ${sec.k}`} style={{ top: sec.top, height: sec.height }}>
                      <span className="sec-title">{SECTION_LABEL[sec.k]} · {sec.packed.length}</span>
                    </div>
                  ))}
                  {sections.flatMap(sec => sec.packed.map(({ item: e, row }) =>
                    <Bar key={e.id} e={e} top={sec.top + HEAD_H + row * ROW_H} x={x} maxX={width} now={now} done={!!state.done[e.id]} open={open} />))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="hint">{t('tl.hint')}</p>
    </>
  )
}

function Bar({ e, top, x, maxX, now, done, open }: { e: GameEvent; top: number; x: (tm: number) => number; maxX: number; now: number; done: boolean; open: (e: GameEvent) => void }) {
  const s = +new Date(e.start), en = +new Date(e.end)
  const left = Math.max(0, x(s))
  const w = Math.max(14, Math.min(x(en), maxX) - left)
  const faces = e.featured.map(f => ({ f, src: faceOf(e.gameId, f) })).filter(v => v.src).slice(0, 3)
  const img = e.kind === 'banner' ? bannerArt(e) : eventImage(e)
  const state = s > now ? t('bar.startsIn', { t: countdown(s - now) }) : en > now ? t('bar.endsIn', { t: countdown(en - now) }) : t('bar.ended')
  return (
    <button
      className={`bar ${e.kind} ${done ? 'done' : ''} ${en < now ? 'past' : ''} ${s < now && en > now ? 'live' : ''} ${e.precision ? 'est' : ''}`}
      style={{ left, width: w, top }}
      onClick={() => open(e)}
      title={`${e.title}\n${fmtDate(s)} → ${fmtDate(en)} · ${state}${e.pulls ? `\n${t('pulls.about', { n: e.pulls })}` : ''}${e.precision ? `\n≈ ${precHint(e.precision)}` : ''}`}
    >
      <span className="bar-clip">{img && <Img className="bar-bg" src={img} />}</span>
      <span className="bar-in">
        {faces.length ? faces.map(v => <Img key={v.f.name} className="face" src={v.src} />) : <Img className="thumb" src={img} />}
        <b>{e.precision && '≈ '}{e.title}</b>
        {e.pulls > 0 && w > 150 && <em>~{e.pulls}✦</em>}
        {done && <em>✓</em>}
      </span>
    </button>
  )
}

/* ---------- Cuadrícula por juego, con fondo que cambia al scrollear ---------- */
const byWhen = (now: number) => (a: GameEvent, b: GameEvent) => {
  const ua = eventStatus(a, now) === 'upcoming', ub = eventStatus(b, now) === 'upcoming'
  return Number(ua) - Number(ub) || +new Date(ua ? a.start : a.end) - +new Date(ub ? b.start : b.end)
}

function GridView({ state, games, now, open, filters, fold }: Ctx & { filters: Filters; fold: Fold }) {
  const tracked = useMemo(() => games.filter(g => state.tracked.includes(g.id)), [games, state.tracked])
  const [active, setActive] = useState<string | undefined>(tracked[0]?.id)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const wall = useRef<HTMLDivElement>(null)
  const secs = useRef(new Map<string, HTMLElement>())
  const ids = tracked.map(g => g.id).join()
  const events = useMemo(() => filterEvents(state, filters).filter(e => eventStatus(e, now) !== 'ended'), [state, filters, now])

  // El juego cuya sección cruza la mitad de la pantalla pasa a ser el activo.
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) setActive((en.target as HTMLElement).dataset.game)
    }, { rootMargin: '-45% 0px -50% 0px' })
    secs.current.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [ids])

  // Parallax suave del fondo con el scroll.
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => wall.current?.style.setProperty('--sy', String(Math.min(window.scrollY, 4000))))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <div className="wall" ref={wall} aria-hidden>
        {tracked.map(g => {
          const src = wallpaperOf(g.id) || anyArt(state, g.id)
          return (
            <div key={g.id} className={`wall-layer ${g.id === active ? 'on' : ''}`} style={cssVar(g)}>
              <Img src={src} />
              <span className="wall-tint" />
            </div>
          )
        })}
      </div>
      <div className="gsecs">
        {tracked.map(g => {
          const list = events.filter(e => e.gameId === g.id).sort(byWhen(now))
          const live = list.filter(e => eventStatus(e, now) === 'active').length
          const folded = fold.collapsed.includes(g.id)
          return (
            <section key={g.id} id={`g-${g.id}`} className={`gsec ${folded ? 'folded' : ''}`} style={cssVar(g)} data-game={g.id}
              ref={el => { if (el) secs.current.set(g.id, el); else secs.current.delete(g.id) }}>
              <header className="gsec-head">
                <GameAvatar game={g} state={state} size={44} />
                <div className="grow"><h2>{g.name}</h2><small>{t('grid.counts', { a: live, u: list.length - live })}</small></div>
                <FoldButton folded={folded} onClick={() => fold.toggle(g.id)} name={g.name} />
              </header>
              {!folded && !list.length && <p className="muted">{t('grid.none')}</p>}
              {!folded && KIND_ORDER.map(k => {
                const items = list.filter(e => e.kind === k)
                if (!items.length) return null
                const key = `${g.id}:${k}`
                const soon = items.filter(e => eventStatus(e, now) === 'active' || +new Date(e.start) - now <= SOON_DAYS * DAY)
                const trim = items.length > COLLAPSE_OVER && !expanded[key]
                const shown = trim ? items.slice(0, Math.max(soon.length, 6)) : items
                const hidden = items.length - shown.length
                // Los banners con splash art son tarjetas altas: toda la sección usa el mismo tamaño alto.
                const tall = k === 'banner' && items.some(e => splashOf(e.gameId, e.featured[0]))
                return (
                  <div key={k} className={`kind-group ${k} ${tall ? 'tall' : ''}`}>
                    <h3 className="kind-head"><span className={`kind-dot ${k}`} />{SECTION_LABEL[k]} <small>{items.length}</small></h3>
                    <div className="grid">
                      {shown.map((e, i) => <EventCard key={e.id} e={e} g={g} i={i} now={now} done={!!state.done[e.id]} open={open} />)}
                    </div>
                    {(hidden > 0 || (expanded[key] && items.length > COLLAPSE_OVER)) && (
                      <div className="more-row">
                        <button className="btn ghost" onClick={() => setExpanded(s => ({ ...s, [key]: !s[key] }))}>
                          {hidden > 0 ? t('grid.more', { n: hidden }) : t('grid.less')}
                        </button>
                        {hidden > 0 && <small className="muted">{t('grid.moreHint', { d: SOON_DAYS })}</small>}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}

/** Progreso del evento: cuánto de su duración ya pasó (vacío si aún no empieza). */
function Progress({ e, now }: { e: GameEvent; now: number }) {
  const s = +new Date(e.start), en = +new Date(e.end)
  const upcoming = now < s
  const pct = upcoming ? 0 : Math.min(100, Math.max(0, ((now - s) / (en - s)) * 100))
  const left = (en - now) / DAY
  const urgent = !upcoming && (pct >= 80 || left < 2)
  return (
    <div className={`prog ${upcoming ? 'wait' : ''} ${urgent ? 'urgent' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      aria-label={t('prog.aria', { title: e.title })} title={upcoming ? t('prog.notStarted') : t('prog.elapsed', { p: Math.round(pct) })}>
      <div className="prog-bar"><i style={{ width: `${pct}%` }} /></div>
      <span>{upcoming ? t('prog.upcoming') : `${Math.round(pct)}%`}</span>
    </div>
  )
}

function Precision({ e }: { e: GameEvent }) {
  return e.precision ? <span className="prec" title={precHint(e.precision)}>≈ {precLabel(e.precision)}</span> : null
}

function EventCard({ e, g, i, now, done, open }: { e: GameEvent; g: Game; i: number; now: number; done: boolean; open: (e: GameEvent) => void }) {
  const v = verdict(e, now)
  const st = eventStatus(e, now)
  const stagger = { '--i': Math.min(i, 12) } as React.CSSProperties
  const when = st === 'upcoming' ? t('card.startsIn', { t: countdown(+new Date(e.start) - now) }) : t('card.endsIn', { t: countdown(+new Date(e.end) - now) })
  const f0 = e.featured[0]
  const splash = e.kind === 'banner' ? splashOf(e.gameId, f0) : undefined

  if (splash) {
    return (
      <article className={`bcard ${done ? 'done' : ''}`} style={{ ...cssVar(g), ...stagger }} onClick={() => open(e)} tabIndex={0} onKeyDown={k => k.key === 'Enter' && open(e)}>
        <Img className={`splash ${e.gameId}`} src={splash} />
        <div className="bcard-fade" />
        <div className="bcard-top">
          <span className="stars">{'★'.repeat(f0?.rarity && f0.rarity > 0 && f0.rarity <= 6 ? f0.rarity : 5)}</span>
          <Tag tone={st === 'upcoming' ? 'mid' : 'great'}>{st === 'upcoming' ? t('st.upcoming') : t('st.active')}</Tag>
        </div>
        <div className="bcard-info">
          <small>{g.short} · {KIND_LABEL.banner}{f0?.tag ? ` · ${f0.tag}` : ''} <Precision e={e} /></small>
          <h3>{e.title}</h3>
          <div className="bcard-meta">
            <span>{when}</span>
            <span className="muted">{fmtDate(e.start)} → {fmtDate(e.end)}</span>
          </div>
          <Progress e={e} now={now} />
          {e.featured.length > 1 && (
            <div className="bcard-others">
              {e.featured.slice(1, 4).map(f => <Img key={f.name} src={faceOf(e.gameId, f)} />)}
            </div>
          )}
        </div>
      </article>
    )
  }

  const img = e.kind === 'banner' ? bannerArt(e) : eventImage(e)
  const faces = e.featured.map(f => faceOf(e.gameId, f)).filter(Boolean) as string[]
  return (
    <article className={`ecard ${done ? 'done' : ''} ${e.kind === 'banner' && e.gameId === 'uma' && e.image ? 'bnr' : ''}`} style={{ ...cssVar(g), ...stagger }} onClick={() => open(e)} tabIndex={0} onKeyDown={k => k.key === 'Enter' && open(e)}>
      <div className="ecard-img">
        {faces.length > 0 && !e.image ? <div className="ecard-faces">{faces.slice(0, 3).map(s => <Img key={s} src={s} />)}</div> : <Img src={img} />}
        <div className="fade" />
        <Tag tone={v.tone}>{v.label}</Tag>
        {faces.length > 0 && e.image && <div className="mini-faces">{faces.slice(0, 3).map(s => <Img key={s} src={s} />)}</div>}
      </div>
      <div className="ecard-body">
        <small>{g.short} · {KIND_LABEL[e.kind]} <Precision e={e} /></small>
        <h4>{done ? '✓ ' : ''}{e.title}</h4>
        <p className="muted">{fmtDate(e.start)} → {fmtDate(e.end)}</p>
        <p><strong>{when}</strong>{e.pulls > 0 && <span className="muted"> · {t('pulls.about', { n: e.pulls })}</span>}</p>
        <Progress e={e} now={now} />
      </div>
    </article>
  )
}
