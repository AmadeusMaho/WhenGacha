import { useEffect, useMemo, useRef, useState } from 'react'
import { bannerArt, eventImage, faceOf, splashOf, wallpaperOf } from './images'
import { KIND_LABEL, countdown, eventStatus, packRows, verdict } from './logic'
import { Chip, GameAvatar, Img, Tag, anyArt, cssVar, fmtDate, type Ctx } from './ui'
import type { Game, GameEvent, Kind } from './types'

const DAY = 86_400_000
const LABEL_W = 176
const ROW_H = 40
const KIND_ORDER: Kind[] = ['banner', 'event', 'challenge']
const SECTION_LABEL: Record<Kind, string> = { banner: 'Banners', event: 'Eventos', challenge: 'Desafíos' }
const HEAD_H = 22
const ZOOMS = [{ label: '2 semanas', ppd: 56 }, { label: '6 semanas', ppd: 28 }, { label: '3 meses', ppd: 14 }]
type View = 'timeline' | 'grid'

const stored = <T,>(key: string, fallback: T): T => {
  try { return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback } catch { return fallback }
}
const persist = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignorar */ } }

export default function TimelineTab(ctx: Ctx & { goMine: () => void; transition: (fn: () => void) => void }) {
  const { state, goMine, transition } = ctx
  const [view, setView] = useState<View>(() => stored('whengacha:view', 'timeline'))
  const [zoom, setZoom] = useState(() => stored('whengacha:zoom', 1))
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ event: true, banner: true, challenge: true })
  const [hideDone, setHideDone] = useState(false)
  useEffect(() => persist('whengacha:view', view), [view])
  useEffect(() => persist('whengacha:zoom', zoom), [zoom])

  if (!state.tracked.length)
    return (
      <div className="empty">
        <p>Elige los gachas que juegas y yo cargo sus eventos, banners y parches.</p>
        <button className="btn primary" onClick={goMine}>＋ Elegir mis gachas</button>
      </div>
    )

  return (
    <>
      <div className="toolbar">
        <div className="group">
          {(['event', 'banner', 'challenge'] as Kind[]).map(k => (
            <Chip key={k} on={kinds[k]} onClick={() => setKinds(s => ({ ...s, [k]: !s[k] }))}>{KIND_LABEL[k]}s</Chip>
          ))}
          <Chip on={hideDone} onClick={() => setHideDone(a => !a)}>Ocultar completados</Chip>
        </div>
        <div className="group">
          {view === 'timeline' && (
            <div className="seg" role="group" aria-label="Zoom">
              {ZOOMS.map((z, i) => <button key={z.label} className={i === zoom ? 'on' : ''} onClick={() => setZoom(i)}>{z.label}</button>)}
            </div>
          )}
          <div className="seg" role="group" aria-label="Vista">
            <button className={view === 'timeline' ? 'on' : ''} onClick={() => transition(() => setView('timeline'))}>☰ Línea</button>
            <button className={view === 'grid' ? 'on' : ''} onClick={() => transition(() => setView('grid'))}>▦ Cuadrícula</button>
          </div>
        </div>
      </div>
      {view === 'timeline' ? <Gantt {...ctx} kinds={kinds} hideDone={hideDone} zoom={zoom} /> : <GridView {...ctx} kinds={kinds} hideDone={hideDone} />}
    </>
  )
}

interface Filters { kinds: Record<Kind, boolean>; hideDone: boolean }

/* ---------- Línea de tiempo ---------- */
function Gantt({ state, games, now, open, kinds, hideDone, zoom }: Ctx & Filters & { zoom: number }) {
  const ppd = ZOOMS[zoom].ppd
  const t0 = new Date(now - 3 * DAY).setHours(0, 0, 0, 0)
  const visible = useMemo(
    () => state.events.filter(e => state.tracked.includes(e.gameId) && kinds[e.kind] && !(hideDone && state.done[e.id]) && +new Date(e.end) > t0),
    [state.events, state.tracked, state.done, kinds, hideDone, t0],
  )
  const tEnd = Math.min(
    Math.max(now + 45 * DAY, ...visible.map(e => +new Date(e.end)), ...state.patches.filter(p => state.tracked.includes(p.gameId)).map(p => +new Date(p.date))),
    now + 150 * DAY,
  )
  const days = Math.ceil((tEnd - t0) / DAY) + 2
  const width = days * ppd
  const x = (t: number) => ((t - t0) / DAY) * ppd

  const lanes = games.filter(g => state.tracked.includes(g.id))
  const weeks: number[] = []
  const first = new Date(t0)
  first.setDate(first.getDate() + ((8 - first.getDay()) % 7 || 7))
  for (let t = +first; t < t0 + days * DAY; t += 7 * DAY) weeks.push(t)

  return (
    <>
      <div className="tl">
        <div className="tl-inner" style={{ width: LABEL_W + width }}>
          <div className="tl-axis">
            <div className="tl-corner" style={{ width: LABEL_W }} />
            <div className="tl-track axis" style={{ width }}>
              {weeks.map(t => <span key={t} className="tick" style={{ left: x(t) }}>{fmtDate(t)}</span>)}
              <span className="today-flag" style={{ left: x(now) }}>Hoy</span>
            </div>
          </div>

          {lanes.map(g => {
            const mine = visible.filter(e => e.gameId === g.id)
            let y = 26
            const sections = KIND_ORDER.flatMap(k => {
              const packed = packRows(mine.filter(e => e.kind === k))
              if (!packed.length) return []
              const rows = Math.max(...packed.map(p => p.row + 1))
              const sec = { k, packed, top: y, height: HEAD_H + rows * ROW_H + 6 }
              y += sec.height
              return [sec]
            })
            const patches = state.patches.filter(p => p.gameId === g.id && +new Date(p.date) > t0)
            return (
              <div key={g.id} className="tl-lane" style={cssVar(g)}>
                <div className="tl-label" style={{ width: LABEL_W }}>
                  <GameAvatar game={g} state={state} size={36} />
                  <span><strong>{g.short}</strong><small>{g.name}</small></span>
                </div>
                <div className="tl-track" style={{ width, height: Math.max(y, 26 + ROW_H) }}>
                  {weeks.map(t => <i key={t} className="grid-line" style={{ left: x(t) }} />)}
                  <i className="now-line" style={{ left: x(now) }} />
                  {patches.map(p => (
                    <span key={p.id} className={`patch-mark ${p.estimated ? 'est' : ''}`} style={{ left: x(+new Date(p.date)) }}
                      title={`${p.estimated ? 'Parche estimado' : 'Parche'} ${p.version} · ${fmtDate(p.date)}`}>
                      ◆ v{p.version}
                    </span>
                  ))}
                  {!sections.length && <span className="lane-empty">Sin eventos con estos filtros</span>}
                  {sections.map(sec => (
                    <div key={sec.k} className={`sec-band ${sec.k}`} style={{ top: sec.top, height: sec.height }}>
                      <span className="sec-title">{SECTION_LABEL[sec.k]} · {sec.packed.length}</span>
                    </div>
                  ))}
                  {sections.flatMap(sec => sec.packed.map(({ item: e, row }) =>
                    <Bar key={e.id} e={e} top={sec.top + HEAD_H + row * ROW_H} x={x} now={now} done={!!state.done[e.id]} open={open} />))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="hint">Clic en una barra para ver el detalle. ◆ marca un parche (tenue = estimado). Las barras con brillo están activas ahora.</p>
    </>
  )
}

function Bar({ e, top, x, now, done, open }: { e: GameEvent; top: number; x: (t: number) => number; now: number; done: boolean; open: (e: GameEvent) => void }) {
  const s = +new Date(e.start), en = +new Date(e.end)
  const left = Math.max(0, x(s))
  const w = Math.max(14, x(en) - left)
  const faces = e.featured.map(f => ({ f, src: faceOf(e.gameId, f) })).filter(v => v.src).slice(0, 3)
  const img = e.kind === 'banner' ? bannerArt(e) : eventImage(e)
  return (
    <button
      className={`bar ${e.kind} ${done ? 'done' : ''} ${en < now ? 'past' : ''} ${s < now && en > now ? 'live' : ''}`}
      style={{ left, width: w, top }}
      onClick={() => open(e)}
      title={`${e.title}\n${fmtDate(s)} → ${fmtDate(en)} · ${s > now ? `empieza en ${countdown(s - now)}` : en > now ? `quedan ${countdown(en - now)}` : 'terminado'}${e.pulls ? `\n~${e.pulls} tiradas` : ''}`}
    >
      <span className="bar-clip">{img && <Img className="bar-bg" src={img} />}</span>
      <span className="bar-in">
        {faces.length ? faces.map(v => <Img key={v.f.name} className="face" src={v.src} />) : <Img className="thumb" src={img} />}
        <b>{e.title}</b>
        {e.pulls > 0 && w > 150 && <em>~{e.pulls}✦</em>}
        {done && <em>✓</em>}
      </span>
    </button>
  )
}

/* ---------- Cuadrícula por juego, con fondo que cambia al scrollear ---------- */
function GridView({ state, games, now, open, kinds, hideDone }: Ctx & Filters) {
  const tracked = useMemo(() => games.filter(g => state.tracked.includes(g.id)), [games, state.tracked])
  const [active, setActive] = useState<string | undefined>(tracked[0]?.id)
  const wall = useRef<HTMLDivElement>(null)
  const secs = useRef(new Map<string, HTMLElement>())
  const ids = tracked.map(g => g.id).join()

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
          const list = state.events
            .filter(e => e.gameId === g.id && kinds[e.kind] && !(hideDone && state.done[e.id]) && eventStatus(e, now) !== 'ended')
            .sort((a, b) => Number(eventStatus(a, now) === 'upcoming') - Number(eventStatus(b, now) === 'upcoming')
              || +new Date(eventStatus(a, now) === 'upcoming' ? a.start : a.end) - +new Date(eventStatus(b, now) === 'upcoming' ? b.start : b.end))
          const live = list.filter(e => eventStatus(e, now) === 'active').length
          return (
            <section key={g.id} className="gsec" style={cssVar(g)} data-game={g.id} ref={el => { if (el) secs.current.set(g.id, el); else secs.current.delete(g.id) }}>
              <header className="gsec-head">
                <GameAvatar game={g} state={state} size={44} />
                <div className="grow"><h2>{g.name}</h2><small>{live} activos · {list.length - live} próximos</small></div>
              </header>
              {!list.length && <p className="muted">Sin eventos con estos filtros.</p>}
              {KIND_ORDER.map(k => {
                const items = list.filter(e => e.kind === k)
                if (!items.length) return null
                return (
                  <div key={k} className="kind-group">
                    <h3 className="kind-head"><span className={`kind-dot ${k}`} />{SECTION_LABEL[k]} <small>{items.length}</small></h3>
                    <div className="grid">
                      {items.map((e, i) => <EventCard key={e.id} e={e} g={g} i={i} now={now} done={!!state.done[e.id]} open={open} />)}
                    </div>
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
      aria-label={`Progreso de ${e.title}`} title={upcoming ? 'Aún no empieza' : `${Math.round(pct)}% transcurrido`}>
      <div className="prog-bar"><i style={{ width: `${pct}%` }} /></div>
      <span>{upcoming ? 'Próximo' : `${Math.round(pct)}%`}</span>
    </div>
  )
}

function EventCard({ e, g, i, now, done, open }: { e: GameEvent; g: Game; i: number; now: number; done: boolean; open: (e: GameEvent) => void }) {
  const v = verdict(e, now)
  const st = eventStatus(e, now)
  const stagger = { '--i': Math.min(i, 12) } as React.CSSProperties
  const when = st === 'upcoming' ? `Empieza en ${countdown(+new Date(e.start) - now)}` : `Quedan ${countdown(+new Date(e.end) - now)}`
  const f0 = e.featured[0]
  const splash = e.kind === 'banner' ? splashOf(e.gameId, f0) : undefined

  if (splash) {
    return (
      <article className={`bcard ${done ? 'done' : ''}`} style={{ ...cssVar(g), ...stagger }} onClick={() => open(e)} tabIndex={0} onKeyDown={k => k.key === 'Enter' && open(e)}>
        <Img className={`splash ${e.gameId}`} src={splash} />
        <div className="bcard-fade" />
        <div className="bcard-top">
          <span className="stars">{'★'.repeat(f0?.rarity && f0.rarity > 0 && f0.rarity <= 6 ? f0.rarity : 5)}</span>
          <Tag tone={st === 'upcoming' ? 'mid' : 'great'}>{st === 'upcoming' ? 'Próximo' : 'Activo'}</Tag>
        </div>
        <div className="bcard-info">
          <small>{g.short} · Banner{f0?.tag ? ` · ${f0.tag}` : ''}</small>
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
        <small>{g.short} · {KIND_LABEL[e.kind]}</small>
        <h4>{done ? '✓ ' : ''}{e.title}</h4>
        <p className="muted">{fmtDate(e.start)} → {fmtDate(e.end)}</p>
        <p><strong>{when}</strong>{e.pulls > 0 && <span className="muted"> · ~{e.pulls} tiradas</span>}</p>
        <Progress e={e} now={now} />
      </div>
    </article>
  )
}
