import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from './i18n'
import { bannerArt, eventImage, faceOf, officialArt, splashOf, wallpaperOf } from './images'
import { KIND_LABEL, countdown, eventStatus, packRows, pullsBefore, trackedGames, verdict } from './logic'
import { FILTER_ICON, GameAvatar, Img, Tag, anyArt, cssVar, fmtDate, fmtEnd, fmtDateTime, ReorderList, ZoneTag, type Ctx } from './ui'
import { locale } from './i18n'
import type { AppState, Game, GameEvent, Kind } from './types'

const DAY = 86_400_000
const HOUR = 3_600_000
const ROW_H = 48
const KIND_ORDER: Kind[] = ['banner', 'event', 'challenge']
/** Títulos de las secciones (en plural), en el idioma actual. */
const SECTION_LABEL = {
  get banner() { return t('kindN.banner') },
  get event() { return t('kindN.event') },
  get challenge() { return t('kindN.challenge') },
} as Record<Kind, string>
const HEAD_H = 32
const AXIS_H = 52
/** La línea de tiempo no se extiende más allá de este horizonte (lo más lejano queda en la cuadrícula). */
const HORIZON_DAYS = 75
/** En la cuadrícula, cada sección muestra lo activo y lo que empieza en este plazo; el resto, bajo "Mostrar más". */
const SOON_DAYS = 14
const COLLAPSE_OVER = 12
const ZOOMS = [{ key: 'zoom.2w', ppd: 56 }, { key: 'zoom.6w', ppd: 28 }, { key: 'zoom.3m', ppd: 14 }] as const
type View = 'timeline' | 'grid'

const precLabel = (p: NonNullable<GameEvent['precision']>) => t(p === 'estimated' ? 'prec.estimated' : 'prec.approx')
const precHint = (p: NonNullable<GameEvent['precision']>) => t(p === 'estimated' ? 'prec.estimatedHint' : 'prec.approxHint')

/** Tiñe la aurora del fondo con el color del juego que se está viendo (--glow); al salir la deja como estaba. */
function useGlow(game?: Game) {
  const [c, c2] = [game?.color, game?.color2]
  useEffect(() => {
    if (!c) return
    const root = document.documentElement.style
    root.setProperty('--glow', c)
    root.setProperty('--glow2', c2 ?? c)
    return () => { root.removeProperty('--glow'); root.removeProperty('--glow2') }
  }, [c, c2])
}

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

export default function TimelineTab(ctx: Ctx & { goMine: () => void; transition: (fn: () => void) => void; focusGame?: string; onFocused: () => void }) {
  const { state, games, now, open, goMine, transition, focusGame, onFocused } = ctx
  const narrow = useNarrow()
  // Solo se guarda la vista si la eliges tú; mientras tanto, cuadrícula en celular y línea en pantallas grandes.
  const [picked, setPicked] = useStored<View | null>('whengacha:view', null)
  const view: View = picked ?? (narrow ? 'grid' : 'timeline')
  const setView = setPicked
  const [zoom, setZoom] = useStored<number>('whengacha:zoom', narrow ? 0 : 1)
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ event: true, banner: true, challenge: true })
  const [hideDone, setHideDone] = useState(false)
  const [showMinor, setShowMinor] = useStored<boolean>('whengacha:minor', false)
  // Los juegos aparecen siempre abiertos al entrar; se pueden cerrar mientras usas la app.
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [ordering, setOrdering] = useState(false)
  const [sheet, setSheet] = useState(false)
  const tracked = useMemo(() => trackedGames(games, state.tracked), [games, state.tracked])
  const hasMinor = state.events.some(e => e.minor && state.tracked.includes(e.gameId))
  const filters: Filters = { kinds, hideDone, showMinor }
  const activeFilters = KIND_ORDER.filter(k => !kinds[k]).length + (hideDone ? 1 : 0) + (showMinor ? 1 : 0)

  // Llegar desde "Mis gachas": se despliega ese juego y se baja hasta su fila / sección.
  useEffect(() => {
    if (!focusGame) return
    setCollapsed(c => c.filter(x => x !== focusGame))
    const timer = setTimeout(() => {
      document.getElementById(`g-${focusGame}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onFocused()
    }, 120)
    return () => clearTimeout(timer)
  }, [focusGame, onFocused])

  const toggle = useCallback((id: string) => setCollapsed(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id])), [])
  const allFolded = tracked.length > 0 && tracked.every(g => collapsed.includes(g.id))

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

      <div className="mbar">
        <div className="seg view" role="group" aria-label={t('view.aria')}>
          <button className={view === 'timeline' ? 'on' : ''} onClick={() => transition(() => setView('timeline'))}>{t('view.line')}</button>
          <button className={view === 'grid' ? 'on' : ''} onClick={() => transition(() => setView('grid'))}>{t('view.grid')}</button>
        </div>
        <ZoneTag now={now} />
        <button className={`btn sm ghost fbtn ${activeFilters ? 'on' : ''}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
          ☰ {t('filters.btn')}{activeFilters > 0 && <b className="badge">{activeFilters}</b>}
        </button>
      </div>
      {sheet && (
        <FilterSheet onClose={() => setSheet(false)} kinds={kinds} setKinds={setKinds} hideDone={hideDone} setHideDone={setHideDone}
          hasMinor={hasMinor} showMinor={showMinor} setShowMinor={setShowMinor} timeline={view === 'timeline'} zoom={zoom} setZoom={setZoom}
          allFolded={allFolded} onFold={() => setCollapsed(allFolded ? [] : tracked.map(g => g.id))}
          canOrder={tracked.length > 1} onOrder={() => { setSheet(false); setOrdering(true) }} />
      )}

      {ordering
        ? <ReorderList games={games} state={state} setState={ctx.setState} onDone={() => setOrdering(false)} />
        : view === 'timeline'
        ? <Gantt {...ctx} filters={filters} zoom={zoom} narrow={narrow} fold={{ collapsed, toggle }} />
        : <GridView {...ctx} filters={filters} fold={{ collapsed, toggle }} />}
    </>
  )
}

/* ---------- Resumen: lo que termina en las próximas 72 horas ---------- */
function EndingSoon({ state, games, now, open, showMinor }: Pick<Ctx, 'state' | 'games' | 'now' | 'open'> & { showMinor: boolean }) {
  const items = state.events
    .filter(e => state.tracked.includes(e.gameId) && !state.done[e.id] && !e.open && (showMinor || !e.minor)
      && +new Date(e.start) <= now && +new Date(e.end) > now && +new Date(e.end) - now <= 72 * HOUR)
    .sort((a, b) => +new Date(a.end) - +new Date(b.end))
    .slice(0, 14)
  const gameOf = (id: string) => games.find(g => g.id === id)
  const [expanded, setExpanded] = useState(false)
  return (
    <section className="soon-strip" aria-label={t('soon.title')}>
      <h3>
        {t('soon.title')} {items.length > 0 && <small>{items.length}</small>}
        {items.length > 1 && (
          <button className="soon-toggle" onClick={() => setExpanded(x => !x)} aria-expanded={expanded}>
            {expanded ? t('soon.collapse') : t('soon.expand')} <span aria-hidden>{expanded ? '▴' : '▾'}</span>
          </button>
        )}
      </h3>
      {items.length === 0
        ? <p className="muted">{t('soon.none')}</p>
        : (
          <div className={`soon-list ${expanded ? 'open' : ''}`}>
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
  const box = useRef<HTMLDivElement>(null)
  const [laneId, setLaneId] = useState<string>()
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

  const lanes = trackedGames(games, state.tracked)
  useGlow(lanes.find(g => g.id === laneId) ?? lanes[0])
  const weeks: number[] = []
  const first = new Date(t0)
  first.setDate(first.getDate() + ((8 - first.getDay()) % 7 || 7))
  for (let tm = +first; tm < t0 + days * DAY; tm += 7 * DAY) weeks.push(tm)
  const tEndAll = t0 + days * DAY
  const months: { tm: number; label: string }[] = []
  for (const m = new Date(t0); +m < tEndAll; m.setMonth(m.getMonth() + 1, 1), m.setHours(0, 0, 0, 0))
    months.push({ tm: Math.max(+m, t0), label: m.toLocaleDateString(locale(), { month: 'long', year: +m.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' }) })

  return (
    <>
      <div className="tl" ref={box} onScroll={() => {
        const el = box.current
        if (!el) return
        let cur: string | undefined
        for (const g of lanes) { const l = document.getElementById(`g-${g.id}`); if (l && l.offsetTop <= el.scrollTop + AXIS_H + 60) cur = g.id }
        setLaneId(cur)
      }} style={{ '--label-w': `${labelW}px` } as React.CSSProperties}>
        <div className="tl-inner" style={{ width: labelW + width }}>
          <div className="tl-axis">
            <div className="tl-corner" />
            <div className="tl-track axis" style={{ width }}>
              {months.map((m, i) => {
                const next = months[i + 1]?.tm ?? tEndAll
                return <span key={m.tm} className="month" style={{ left: x(m.tm), width: x(next) - x(m.tm) }}><b>{m.label}</b></span>
              })}
              {weeks.filter(w => Math.abs(x(w) - x(now)) > 34).map(w => <span key={w} className="tick" style={{ left: x(w) }}>{fmtDate(w)}</span>)}
              <span className="today-flag" style={{ left: x(now) }}>{t('today')}<span className="today-date"> · {fmtDate(now)}</span></span>
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
                  {months.map(m => <i key={m.tm} className="grid-line month-line" style={{ left: x(m.tm) }} />)}
                  {months.map((m, i) => i % 2 ? <i key={`b${m.tm}`} className="month-band" style={{ left: x(m.tm), width: x(months[i + 1]?.tm ?? tEndAll) - x(m.tm) }} /> : null)}
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
                      <span className="sec-title"><span className="sec-ico">{FILTER_ICON[sec.k]}</span>{SECTION_LABEL[sec.k]} · {sec.packed.length}</span>
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
    </>
  )
}

/** "3 nov 20:00" en la zona del navegador, sin abreviatura de zona (la barra tiene poco sitio; la zona está en el selector de la cabecera). */
const fmtShort = (ms: number) => new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Bar({ e, top, x, maxX, now, done, open }: { e: GameEvent; top: number; x: (tm: number) => number; maxX: number; now: number; done: boolean; open: (e: GameEvent) => void }) {
  const s = +new Date(e.start), en = +new Date(e.end)
  const left = Math.max(0, x(s))
  const w = Math.max(14, Math.min(x(en), maxX) - left)
  const faces = e.featured.map(f => ({ f, src: faceOf(e.gameId, f) })).filter(v => v.src).slice(0, 3)
  const img = e.kind === 'banner' ? bannerArt(e) : eventImage(e)
  const pct = s < now && en > now && !e.open ? ((now - s) / (en - s)) * 100 : 0
  const state = s > now ? t('bar.startsIn', { t: countdown(s - now) }) : en > now ? t('bar.endsIn', { t: countdown(en - now) }) : t('bar.ended')
  // Tooltip: fechas completas con zona. Barra: fechas cortas (la zona ya está en el selector de arriba) y el estado coloreado por urgencia.
  const range = e.open ? `${fmtDate(s)} → ${t('time.open')}` : `${fmtDateTime(s)} → ${fmtEnd(e)} · ${state}`
  const short = e.open ? `${fmtDate(s)} → ${t('time.open')}` : `${fmtShort(s)} → ${e.precision ? '≈ ' : ''}${fmtShort(en)}`
  const left_ = en - now
  const urgency = s > now ? 'upcoming' : en <= now ? 'ended' : e.open ? '' : left_ < DAY ? 'urgent' : left_ < 3 * DAY ? 'soon' : ''
  // Barra estrecha de algo en curso (se acaba pronto): una pastilla con lo que queda ("18h", "1d") para que no se pierda entre el texto
  // recortado. Solo la primera unidad de la cuenta atrás: cabe en barras de ~28 px.
  const chip = s < now && en > now && !e.open && w < 150 ? countdown(left_).split(' ')[0] : ''
  return (
    <button
      className={`bar ${e.kind} ${done ? 'done' : ''} ${en < now ? 'past' : ''} ${s < now && en > now ? 'live' : ''} ${e.precision ? 'est' : ''} ${e.open ? 'open' : ''} ${urgency === 'urgent' || urgency === 'soon' ? urgency : ''}${chip ? ' has-chip' : ''}`}
      style={{ left, width: w, top }}
      onClick={() => open(e)}
      title={`${e.title}\n${range}${e.pulls ? `\n${t('pulls.about', { n: e.pulls })}` : ''}${e.precision ? `\n≈ ${precHint(e.precision)}` : ''}`}
    >
      <span className="bar-clip">
        {img && <Img className="bar-bg" src={img} />}
        {pct > 0 && <i className="bar-prog" style={{ width: `${pct}%` }} />}
      </span>
      {w >= 70 && <span className="bar-in">
        {faces.length ? faces.map(v => <Img key={v.f.name} className="face" src={v.src} />) : <Img className="thumb" src={img} />}
        <span className="bar-txt">
          <b>{e.precision && '≈ '}{done && '✓ '}{e.title}</b>
          {/* Primero el estado (lo que más importa): si falta sitio se recortan las fechas, no el "quedan…". */}
          {w > 90 && !chip && <small>{!e.open && <><span className={`when ${urgency}`}>{state}</span>{w > 130 && ' · '}</>}{(w > 130 || e.open) && short}</small>}
        </span>
        {e.pulls > 0 && w > 260 && <em>~{e.pulls}✦</em>}
      </span>}
      {chip && w >= 26 && <span className={`bar-left ${urgency}`} aria-label={state}>{chip}</span>}
    </button>
  )
}

/* ---------- Cuadrícula por juego, con fondo que cambia al scrollear ---------- */
const byWhen = (now: number) => (a: GameEvent, b: GameEvent) => {
  const ua = eventStatus(a, now) === 'upcoming', ub = eventStatus(b, now) === 'upcoming'
  return Number(ua) - Number(ub) || +new Date(ua ? a.start : a.end) - +new Date(ub ? b.start : b.end)
}

function GridView({ state, games, now, open, filters, fold }: Ctx & { filters: Filters; fold: Fold }) {
  const tracked = useMemo(() => trackedGames(games, state.tracked), [games, state.tracked])
  const [active, setActive] = useState<string | undefined>(tracked[0]?.id)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  useGlow(tracked.find(g => g.id === active) ?? tracked[0])
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
          const src = wallpaperOf(g.id) || officialArt(g.id) || anyArt(state, g.id)
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
                    <h3 className="kind-head"><span className="sec-ico">{FILTER_ICON[k]}</span>{SECTION_LABEL[k]} <small>{items.length}</small></h3>
                    <div className="grid">
                      {shown.map((e, i) => <EventCard key={e.id} e={e} g={g} i={i} now={now} done={!!state.done[e.id]} open={open} left={pullsBefore(e, state, g, now)?.total} />)}
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
  if (e.open) return null
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

interface SheetProps {
  onClose: () => void
  kinds: Record<Kind, boolean>; setKinds: React.Dispatch<React.SetStateAction<Record<Kind, boolean>>>
  hideDone: boolean; setHideDone: (v: boolean) => void
  hasMinor: boolean; showMinor: boolean; setShowMinor: (v: boolean) => void
  timeline: boolean; zoom: number; setZoom: (z: number) => void
  allFolded: boolean; onFold: () => void
  canOrder: boolean; onOrder: () => void
}

function SheetOpt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`fopt ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>{children}</button>
}

/** Filtros y ajustes de la lista en una hoja que sube desde abajo (celular), en vez de apilarlos arriba. */
function FilterSheet(p: SheetProps) {
  const { onClose } = p
  useEffect(() => {
    const onKey = (k: KeyboardEvent) => k.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t('filters.btn')} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden />
        <h3>{t('filters.show')}</h3>
        <div className="fopts">
          {KIND_ORDER.map(k => <SheetOpt key={k} on={p.kinds[k]} onClick={() => p.setKinds(s => ({ ...s, [k]: !s[k] }))}>{FILTER_ICON[k]}<span>{SECTION_LABEL[k]}</span></SheetOpt>)}
        </div>
        <h3>{t('filters.more')}</h3>
        <div className="fopts">
          <SheetOpt on={p.hideDone} onClick={() => p.setHideDone(!p.hideDone)}>{FILTER_ICON.hideDone}<span>{t('f.hideDone')}</span></SheetOpt>
          {p.hasMinor && <SheetOpt on={p.showMinor} onClick={() => p.setShowMinor(!p.showMinor)}>{FILTER_ICON.minor}<span>{t('f.minor')}</span></SheetOpt>}
        </div>
        {p.timeline && (
          <>
            <h3>{t('filters.zoom')}</h3>
            <div className="seg zoom" role="group" aria-label={t('zoom.aria')}>
              {ZOOMS.map((z, i) => <button key={z.key} className={i === p.zoom ? 'on' : ''} onClick={() => p.setZoom(i)}>{t(z.key)}</button>)}
            </div>
          </>
        )}
        <div className="sheet-actions">
          <button className="btn sm ghost" onClick={p.onFold}>{p.allFolded ? t('jump.unfold') : t('jump.fold')}</button>
          {p.canOrder && <button className="btn sm ghost" onClick={p.onOrder}>⇅ {t('order.btn')}</button>}
          <button className="btn sm soft" onClick={onClose}>{t('order.done')}</button>
        </div>
      </div>
    </div>
  )
}

function Precision({ e }: { e: GameEvent }) {
  return e.precision ? <span className="prec" title={precHint(e.precision)}>≈ {precLabel(e.precision)}</span> : null
}

function EventCard({ e, g, i, now, done, open, left }: { e: GameEvent; g: Game; i: number; now: number; done: boolean; open: (e: GameEvent) => void; left?: number }) {
  const v = verdict(e, now, g)
  const st = eventStatus(e, now)
  const stagger = { '--i': Math.min(i, 12) } as React.CSSProperties
  const when = st === 'upcoming' ? t('card.startsIn', { t: countdown(+new Date(e.start) - now) }) : e.open ? t('time.open') : t('card.endsIn', { t: countdown(+new Date(e.end) - now) })
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
            <span className="muted">{fmtDate(e.start)} → {e.open ? t('time.open') : fmtEnd(e)}</span>
          </div>
          {left !== undefined && <div className="pull-left">{t('pull.left', { n: left })}</div>}
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
        {v.label && <Tag tone={v.tone}>{v.label}</Tag>}
        {faces.length > 0 && e.image && <div className="mini-faces">{faces.slice(0, 3).map(s => <Img key={s} src={s} />)}</div>}
      </div>
      <div className="ecard-body">
        <small>{g.short} · {KIND_LABEL[e.kind]} <Precision e={e} /></small>
        <h4>{done ? '✓ ' : ''}{e.title}</h4>
        <p className="muted">{fmtDate(e.start)} → {e.open ? t('time.open') : fmtEnd(e)}</p>
        <p><strong>{when}</strong>{e.pulls > 0 && <span className="muted"> · {t('pulls.about', { n: e.pulls })}</span>}</p>
        {left !== undefined && <p className="pull-left">{t('pull.left', { n: left })}</p>}
        <Progress e={e} now={now} />
      </div>
    </article>
  )
}
