import { useEffect, useState } from 'react'
import { t } from './i18n'
import { bannerArt, eventImage, faceOf, officialArt, splashOf, wallpaperOf } from './images'
import { countdown, eventStatus, trackedGames, verdict } from './logic'
import { fetchSnapshot } from './net'
import { enableNotifications } from './notify'
import { GameAvatar, Img, ReorderList, Tag, cssVar, fmtDate, fmtDateY, heroOf, useArtShape, type Ctx } from './ui'
import type { Game, GameEvent, Patch } from './types'

const DAY = 86_400_000

/* ---------- Mis gachas ---------- */
/** El catálogo de juegos arranca desplegado la primera vez que entras a la página; después queda plegado (salvo que no sigas ninguno). */
const FIRST_VISIT = (() => {
  try {
    const first = !localStorage.getItem('whengacha:seen')
    localStorage.setItem('whengacha:seen', '1')
    return first
  } catch { return true }
})()

/**
 * Juegos "en construcción" (`wip`) sin eventos vigentes: no se pueden seguir todavía. Se mira su copia del recolector (/data/<id>.json, solo nuestro
 * servidor, nunca la fuente externa) y lo que ya haya en el estado; hasta saberlo, cuentan como vacíos.
 */
function useWipEmpty(games: Game[], events: GameEvent[], now: number): Set<string> {
  const ids = games.filter(g => g.wip).map(g => g.id).join(',')
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    let alive = true
    for (const id of ids ? ids.split(',') : []) {
      fetchSnapshot(id).then(snap => {
        const n = snap ? snap.events.filter(e => +new Date(e.end) > Date.now()).length : 0
        if (alive) setCounts(c => ({ ...c, [id]: n }))
      })
    }
    return () => { alive = false }
  }, [ids])
  return new Set(games.filter(g => g.wip && !(counts[g.id] ?? 0) && !events.some(e => e.gameId === g.id && +new Date(e.end) > now)).map(g => g.id))
}

export function MyGachas({ ctx, goGame }: { ctx: Ctx; goGame: (id: string) => void }) {
  const { state, games, setState, now } = ctx
  const [msg, setMsg] = useState('')
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(FIRST_VISIT)
  const [ordering, setOrdering] = useState(false)
  const toggle = (id: string) => setState(s => ({ ...s, tracked: s.tracked.includes(id) ? s.tracked.filter(x => x !== id) : [...s.tracked, id] }))
  const mine = trackedGames(games, state.tracked)
  const q = query.trim().toLowerCase()
  const match = (g: Game) => !q || `${g.name} ${g.short} ${g.publisher}`.toLowerCase().includes(q)
  const auto = games.filter(g => g.api && match(g))
  const soon = games.filter(g => !g.api && match(g))
  const wipEmpty = useWipEmpty(games, state.events, now)
  // El catálogo se pliega tras un botón (salvo en la primera visita, si aún no sigues ninguno o mientras buscas).
  const showAdd = addOpen || !mine.length || !!q

  const toggleNotify = async () => {
    if (!state.notify && !(await enableNotifications())) { setMsg(t('notify.blocked')); return }
    setMsg('')
    setState(s => ({ ...s, notify: !s.notify }))
  }

  return (
    <>
      <section>
        <h3>{mine.length ? t('mine.addTitle') : t('mine.askTitle')}</h3>
        {!mine.length && <p className="muted lead">{t('mine.askLead')}</p>}
        <button className="btn add-toggle" onClick={() => setAddOpen(o => !o)} aria-expanded={showAdd}>{showAdd ? '− ' : '＋ '}{t('mine.add')}</button>
        <div className={`add-body ${showAdd ? 'open' : ''}`}>
          <input className="pick-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('mine.search')} aria-label={t('mine.search')} />
          <div className="picks">
            {auto.map(g => {
              const on = state.tracked.includes(g.id)
              // En construcción y sin eventos: desactivado (salvo que ya lo siguieras, para poder quitarlo).
              const wip = wipEmpty.has(g.id) && !on
              return <Pick key={g.id} g={g} on={on} state={state} onClick={() => toggle(g.id)} disabled={wip} wip={wip} />
            })}
          </div>
          {!auto.length && !soon.length && <p className="muted">{t('mine.noMatch')}</p>}
        {soon.length > 0 && (
          <details className="soon">
            <summary>{t('mine.soon', { n: soon.length })}</summary>
            <div className="picks">{soon.map(g => <Pick key={g.id} g={g} state={state} disabled />)}</div>
          </details>
        )}
        </div>
      </section>

      {mine.length > 0 && (
        <section>
          <div className="row between">
            <h3>{t('mine.yours')}</h3>
            {mine.length > 1 && <button className={`btn sm ghost ${ordering ? 'on' : ''}`} onClick={() => setOrdering(o => !o)} aria-pressed={ordering}>⇅ {t('order.btn')}</button>}
          </div>
          {ordering && <ReorderList games={games} state={state} setState={setState} onDone={() => setOrdering(false)} />}
          {/* Todas las tarjetas miden lo mismo (`even`): listas con tope y los códigos se despliegan encima, sin estirar la tarjeta. */}
          <div className="grid wide even">{mine.map(g => <GameCard key={g.id} g={g} ctx={ctx} onRemove={() => toggle(g.id)} onOpen={() => goGame(g.id)} />)}</div>
        </section>
      )}

      <section>
        <h3>{t('mine.settings')}</h3>
        <div className="group notify-row">
          <button className={`ichip bell ${state.notify ? 'on' : ''}`} onClick={toggleNotify} aria-pressed={state.notify} aria-label={state.notify ? t('notify.off') : t('notify.on')} title={state.notify ? t('notify.off') : t('notify.on')}>
            <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />{!state.notify && <path d="M3 3l18 18" />}
            </svg>
          </button>
          <label className="muted inline-label">{t('notify.lead')}
            <select value={state.leadHours} onChange={e => setState(s => ({ ...s, leadHours: Number(e.target.value) }))}>
              {[6, 12, 24, 48, 72].map(h => <option key={h} value={h}>{t('notify.before', { h })}</option>)}
            </select>
          </label>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </section>
    </>
  )
}

function Pick({ g, on, state, onClick, disabled, wip }: { g: Game; on?: boolean; state: Ctx['state']; onClick?: () => void; disabled?: boolean; wip?: boolean }) {
  return (
    <button className={`pick ${on ? 'on' : ''} ${wip ? 'wip' : ''}`} style={cssVar(g)} onClick={onClick} disabled={disabled} aria-pressed={on} title={wip ? t('mine.wipHint') : undefined}>
      {/* Arte del juego de fondo (el de su parche o el oficial), bajo un velo que mantiene el texto legible. */}
      <span className="pick-art" aria-hidden><Img src={wallpaperOf(g.id) || officialArt(g.id)} /></span>
      <GameAvatar game={g} state={state} size={52} />
      <span className="pick-txt"><strong>{g.name}</strong><small>{g.publisher}</small></span>
      {disabled ? <Tag tone="off">{wip ? `🚧 ${t('tag.wip')}` : t('tag.soon')}</Tag> : <span className="check">{on ? '✓' : '＋'}</span>}
    </button>
  )
}

/** Un código cuenta como "nuevo" durante 3 días desde que apareció (y mientras no lo canjees). */
const NEW_CODE_MS = 3 * DAY
/** Cuántos banners activos se listan en la tarjeta; el resto, en la línea de tiempo. */
const MAX_BANNERS = 3
/** Topes de "Terminan pronto" y "Próximos", para que todas las tarjetas midan lo mismo. */
const MAX_LIVE = 4
const MAX_UPCOMING = 2

/** Cuenta atrás corta para chips: días si queda 1 día o más ("11d"), si no horas ("10h"). */
const shortIn = (ms: number) => (ms >= DAY ? `${Math.round(ms / DAY)}d` : `${Math.max(1, Math.round(ms / 3_600_000))}h`)

/** Códigos de un juego que aún no copiaste y aparecieron hace menos de 3 días. */
function freshCodes(state: Ctx['state'], gameId: string, now: number) {
  return (state.codes[gameId] ?? []).filter(c => {
    const k = `${gameId}:${c.code.toUpperCase()}`
    return !(state.copied ?? {})[k] && now - ((state.codeSeen ?? {})[k] ?? 0) < NEW_CODE_MS
  }).length
}

function GameCard({ g, ctx, onRemove, onOpen }: { g: Game; ctx: Ctx; onRemove: () => void; onOpen: () => void }) {
  const { state, now, open } = ctx
  const byEnd = (a: GameEvent, b: GameEvent) => Number(!!a.open) - Number(!!b.open) || +new Date(a.end) - +new Date(b.end)
  const mineEv = state.events.filter(e => e.gameId === g.id)
  const active = mineEv.filter(e => eventStatus(e, now) === 'active')
  // "Terminan pronto": solo lo que ya está en curso. Los eventos; si el juego no tiene ninguno (p. ej. Stella Sora, solo banners), sus banners.
  const activeEvents = active.filter(e => e.kind !== 'banner').sort(byEnd)
  const live = activeEvents.length ? activeEvents : active.filter(e => e.kind === 'banner').sort(byEnd)
  // "Próximos": lo que empieza en los próximos 30 días, por fecha de inicio.
  const upcoming = mineEv.filter(e => eventStatus(e, now) === 'upcoming' && +new Date(e.start) - now < 30 * DAY)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
  const banners = active.filter(e => e.kind === 'banner').sort(byEnd)
  const patches = state.patches.filter(p => p.gameId === g.id)
  const cur = patches.find(p => !p.estimated && +new Date(p.date) <= now && (!p.end || +new Date(p.end) > now))
  const next = patches.filter(p => +new Date(p.date) > now).sort((a, b) => +new Date(a.date) - +new Date(b.date))[0]
  const left = (e: GameEvent) => +new Date(e.end) - now
  // Indicadores de la cabecera: lo que termina en menos de 48 h y los códigos nuevos.
  const urgent = active.filter(e => !e.open && left(e) < 2 * DAY).length
  const fresh = freshCodes(state, g.id, now)
  return (
    <article className="gcard" style={cssVar(g)}>
      <div className="gcard-hero go" role="link" tabIndex={0} title={t('card.goTimeline')} onClick={onOpen} onKeyDown={k => { if (k.key === 'Enter' && k.target === k.currentTarget) onOpen() }}>
        <Img src={heroOf(state, g.id)} />
        <div className="fade" />
        <button className="x corner" onClick={ev => { ev.stopPropagation(); onRemove() }} title={t('card.unfollow')} aria-label={t('card.unfollowAria', { name: g.name })}>×</button>
        <div className="gcard-head">
          <GameAvatar game={g} state={state} size={52} />
          <div>
            <h2>{g.name}</h2>
            <p className="head-meta">
              {next ? <span>{next.estimated ? '≈ ' : ''}v{next.version} · {fmtDate(next.date)}</span> : cur ? <span>{t('card.inProgress', { v: cur.version })}</span> : null}
              {urgent > 0 && <span className="pill hot" title={t('card.urgentTip')}>⏳ {urgent}</span>}
              {fresh > 0 && <span className="pill new" title={t('card.freshTip')}>🎁 {fresh}</span>}
            </p>
          </div>
        </div>
      </div>
      <div className="gcard-body">
        {/* Banners activos como retratos, con la cuenta atrás encima. */}
        {banners.length > 0 && (
          <div className="bports" style={{ '--n': Math.min(banners.length, MAX_BANNERS) } as React.CSSProperties}>
            {/* Siempre una fila de 3 casillas: con más banners, 2 retratos y un "+N" que lleva a la línea de tiempo. */}
            {banners.slice(0, banners.length > MAX_BANNERS ? MAX_BANNERS - 1 : MAX_BANNERS).map(b => <Portrait key={b.id} b={b} now={now} onClick={() => open(b)} solo={banners.length === 1} />)}
            {banners.length > MAX_BANNERS && <MorePortrait b={banners[MAX_BANNERS - 1]} n={banners.length - MAX_BANNERS + 1} onClick={onOpen} />}
          </div>
        )}

        <h3>{t('card.endingSoon')}</h3>
        {live.length ? (
          <ul className="list ev-list">
            {live.slice(0, MAX_LIVE).map(e => (
              <li key={e.id} className="clickable" onClick={() => open(e)} title={e.title}>
                <span className="ev-row">
                  <span className="ev-thumb"><Img src={eventImage(e)} /></span>
                  <span className="ev-title">{state.done[e.id] ? '✓ ' : ''}{e.title}</span>
                </span>
                {/* Menos de 24 h: en rojo, pase lo que pase con su veredicto. */}
                <Tag tone={!e.open && left(e) < DAY ? 'bad' : verdict(e, now).tone}>{e.open ? t('time.open') : countdown(left(e))}</Tag>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('card.nothingActive')}</p>}

        {/* Próximos: una fila de chips ("Nombre · 2d"); los banners con su cara. */}
        {upcoming.length > 0 && (
          <div className="up-chips">
            <small className="up-lbl">{t('card.upcoming')}</small>
            <div className="up-row">
            {upcoming.slice(0, MAX_UPCOMING).map(e => {
              const face = e.kind === 'banner' && e.featured[0] ? faceOf(e.gameId, e.featured[0]) : undefined
              return (
                <button key={e.id} className="up-chip" onClick={() => open(e)} title={`${e.title} · ${t('card.startsIn', { t: countdown(+new Date(e.start) - now) })}`}>
                  {face && <span className="face-xs"><Img src={face} /></span>}
                  <span className="up-chip-t">{e.title}</span>
                  <b>{shortIn(+new Date(e.start) - now)}</b>
                </button>
              )
            })}
            {upcoming.length > MAX_UPCOMING && <button className="up-chip more" onClick={onOpen}>+{upcoming.length - MAX_UPCOMING}</button>}
            </div>
          </div>
        )}

        <Codes g={g} ctx={ctx} />
      </div>
    </article>
  )
}

/** Banner activo como retrato: arte del destacado (o del banner), nombre abajo y cuenta atrás arriba. */
function Portrait({ b, now, onClick, solo }: { b: GameEvent; now: number; onClick: () => void; solo?: boolean }) {
  const f = b.featured[0]
  const splash = f ? splashOf(b.gameId, f) : undefined
  // Splash del personaje (recorte vertical, suele ser PNG con fondo transparente) o arte apaisado del banner (se ve entero, centrado).
  const art = splash || b.image || bannerArt(b)
  const shape = useArtShape(splash ? undefined : art)
  const left = +new Date(b.end) - now
  const name = f ? f.name : b.title
  const extra = b.featured.length > 1 ? `+${b.featured.length - 1}` : ''
  return (
    <button className={`bport ${splash ? 'splash' : 'wide'} ${shape ? `art-${shape}` : ''} ${solo ? 'solo' : ''}`} onClick={onClick} title={b.title}>
      {/* Fondo: la misma imagen, desenfocada y oscurecida (da color a los PNG transparentes sin un fondo plano). */}
      <span className="bp-bg" aria-hidden><Img src={art} /></span>
      <Img src={art} className="bp-art" />
      <span className={`p-time ${!b.open && left < DAY ? 'hot' : ''}`}>{b.open ? t('time.open') : countdown(left)}</span>
      <span className="p-name">
        {f?.rarity ? <i className="p-stars">{'★'.repeat(Math.min(f.rarity, 6))}</i> : null}
        <span className="p-n">{name}{extra && <small> {extra}</small>}</span>
      </span>
    </button>
  )
}

/** Casilla "+N" de los banners que no caben: de fondo, el arte (oscurecido) del primero que queda fuera, para que no sea un cuadro vacío. */
function MorePortrait({ b, n, onClick }: { b: GameEvent; n: number; onClick: () => void }) {
  const art = splashOf(b.gameId, b.featured[0]) || b.image || bannerArt(b)
  return (
    <button className={`bport more ${art ? 'has-art' : ''}`} onClick={onClick} title={b.title}>
      {art && <Img src={art} className="bp-art" />}
      <span className="more-n">+{n}</span>
    </button>
  )
}

/** "Until 24 Nov 2026 (UTC)" y similares, que las fuentes meten entre las recompensas, van aparte. */
function splitRewards(rewards: string[]) {
  const until = rewards.find(r => /^(until|valid until|expires?)\b/i.test(r))
  return { items: rewards.filter(r => r !== until), until: until?.replace(/^(valid until|until|expires?(?: on)?)\s*:?\s*/i, '') }
}

function Codes({ g, ctx }: { g: Game; ctx: Ctx }) {
  const { state, setState, now } = ctx
  const codes = state.codes[g.id] ?? []
  if (!codes.length) return null
  const copiedMap = state.copied ?? {}
  const seenMap = state.codeSeen ?? {}
  const key = (code: string) => `${g.id}:${code.toUpperCase()}`
  const wasCopied = (code: string) => !!copiedMap[key(code)]
  const isNew = (code: string) => !wasCopied(code) && now - (seenMap[key(code)] ?? 0) < NEW_CODE_MS
  // Los más recientes primero. No depende de si ya lo copiaste: así el código no salta de sitio al copiarlo.
  const sorted = [...codes].sort((a, b) => (seenMap[key(b.code)] ?? 0) - (seenMap[key(a.code)] ?? 0))
  const fresh = codes.filter(c => isNew(c.code)).length
  // Copiar lo deja marcado (se recuerda): el botón y el código cambian de color.
  const copy = (code: string) => {
    // Solo se marca si de verdad se copió (el navegador puede negar el portapapeles).
    navigator.clipboard?.writeText(code)
      .then(() => setState(s => ({ ...s, copied: { ...s.copied, [key(code)]: true } })))
      .catch(() => { /* sin permiso: no se marca */ })
  }
  return (
    <details className="codes">
      <summary className="codes-chip">
        <span className="cc-ico" aria-hidden>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
          </svg>
        </span>
        <span className="cc-txt">{codes.length === 1 ? t('card.codesOne') : t('card.codesChip', { n: codes.length })}</span>
        {fresh > 0 && <span className="cc-new">{fresh === 1 ? t('code.newOne') : t('code.newCount', { n: fresh })}</span>}
        <span className="cc-chev" aria-hidden>▾</span>
      </summary>
      <ul className="list">
        {sorted.map(c => {
          const done = wasCopied(c.code)
          const { items, until } = splitRewards(c.rewards)
          return (
            <li key={c.code} className={done ? 'copied' : ''}>
              <span>
                <code>{c.code}</code> {isNew(c.code) && <Tag tone="great">{t('code.newTag')}</Tag>}
                {items.length > 0 && <><br /><small className="muted">{items.join(' · ')}</small></>}
                {until && <><br /><small className="code-until">{t('code.until', { d: until })}</small></>}
              </span>
              <button className={`btn sm copy-btn ${done ? 'done' : ''}`} onClick={() => copy(c.code)}>{done ? t('btn.copied') : t('btn.copy')}</button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

/* ---------- Parches ---------- */
/** Versiones del historial que se ven sin desplegar. */
const HIST_SHOWN = 4
/** HoYoverse emite su "Special Program" unos 12 días antes de cada versión: con eso se estima el directo mientras no esté anunciado. */
const STREAM_LEAD: Partial<Record<NonNullable<Game['api']>, number>> = { genshin: 12, starrail: 12, zenless: 12 }

const nextPatchOf = (patches: Patch[], gameId: string, now: number) =>
  patches.filter(p => p.gameId === gameId && +new Date(p.date) > now).sort((a, b) => +new Date(a.date) - +new Date(b.date))[0] as Patch | undefined

export function Patches(ctx: Ctx & { goMine: () => void }) {
  const { state, games, goMine, now } = ctx
  const mine = trackedGames(games, state.tracked)
  if (!mine.length)
    return <div className="empty"><p>{t('patch.empty')}</p><button className="btn primary" onClick={goMine}>{t('btn.choose')}</button></div>
  const withData = mine.filter(g => state.patches.some(p => p.gameId === g.id))
  const without = mine.filter(g => !withData.includes(g))
  // Próxima versión de cada juego, de la más cercana a la más lejana.
  const upcoming = withData.map(g => ({ g, p: nextPatchOf(state.patches, g.id, now) }))
    .filter((x): x is { g: Game; p: Patch } => !!x.p)
    .sort((a, b) => +new Date(a.p.date) - +new Date(b.p.date))
  const goTo = (id: string) => document.getElementById(`patch-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <>
      {upcoming.length > 0 && (
        <section className="up-patches">
          <h3>{t('patch.upcomingTitle')}</h3>
          <div className="up-strip">
            {upcoming.map(({ g, p }) => (
              <button key={g.id} className="up-card" style={cssVar(g)} onClick={() => goTo(g.id)}>
                <GameAvatar game={g} state={state} size={40} />
                <span className="up-txt">
                  <strong>{g.name} <span className="up-ver">v{p.version}</span></strong>
                  {p.name && <small className="up-name">{p.name}</small>}
                  <small>{p.estimated ? '≈ ' : ''}{fmtDate(p.date)} · {t('patch.in', { t: countdown(+new Date(p.date) - now) })}</small>
                </span>
                <Tag tone={p.estimated ? 'mid' : 'good'}>{p.estimated ? t('patch.estimated') : t('patch.announced')}</Tag>
              </button>
            ))}
          </div>
        </section>
      )}
      {withData.length > 0 && <div className="psecs">{withData.map(g => <PatchCard key={g.id} g={g} ctx={ctx} />)}</div>}
      {without.length > 0 && (
        <p className="nopatch muted">
          {t('patch.noVersionsLine', { names: without.map(g => g.name).join(', ').replace(/, ([^,]*)$/, ` ${t('sources.and')} $1`) })}{' '}
          <button className="link-btn" onClick={goMine}>{t('patch.seeMine')}</button>
        </p>
      )}
    </>
  )
}

const daysOf = (p: Patch) => (p.end ? Math.round((+new Date(p.end) - +new Date(p.date)) / DAY) : 0)

function PatchCard({ g, ctx }: { g: Game; ctx: Ctx }) {
  const { state, now } = ctx
  const [showAll, setShowAll] = useState(false)
  const all = state.patches.filter(p => p.gameId === g.id).sort((a, b) => +new Date(a.date) - +new Date(b.date))
  const done = all.filter(p => !p.estimated && p.end && +new Date(p.end) <= now)
  const cur = all.find(p => !p.estimated && +new Date(p.date) <= now && (!p.end || +new Date(p.end) > now))
  const next = all.find(p => +new Date(p.date) > now)
  const history = done.slice().reverse()
  const shown = showAll ? history : history.slice(0, HIST_SHOWN)
  const durs = done.slice(-10).map(daysOf).filter(Boolean)
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0
  const minD = durs.length ? Math.min(...durs) : 0, maxDur = durs.length ? Math.max(...durs) : 0
  // Si las versiones que se ven duran todas lo mismo, las barras no dicen nada: basta una línea (al desplegar, vuelven si varían).
  const shownD = shown.map(daysOf).filter(Boolean)
  const uniform = shownD.length > 1 && shownD.every(d => d === shownD[0]) ? shownD[0] : 0
  const maxD = Math.max(50, ...shownD)
  const typical = g.patchCycleDays
  const lead = g.api ? STREAM_LEAD[g.api] : undefined
  const stream = next && lead ? +new Date(next.date) - lead * DAY : 0

  return (
    <section className="psec" id={`patch-${g.id}`} style={cssVar(g)}>
      <header className="gsec-head">
        <GameAvatar game={g} state={state} size={48} />
        <div className="grow"><h2>{g.name}</h2>
          <small>{t('patch.completed', { n: done.length })}</small></div>
        {avg > 0 && (
          <div className="stats">
            <div><b>{t('unit.days', { n: avg })}</b><small>{t('stat.avg')}</small></div>
            {/* Mínima y máxima solo cuando dicen algo distinto de la media. */}
            {minD !== maxDur && <div><b>{t('unit.days', { n: minD })}</b><small>{t('stat.min')}</small></div>}
            {minD !== maxDur && <div><b>{t('unit.days', { n: maxDur })}</b><small>{t('stat.max')}</small></div>}
          </div>
        )}
      </header>

      {cur && <CurrentPatch g={g} p={cur} ctx={ctx} typical={typical} />}
      {/* Próxima versión: qué trae y el directo estimado. Su fecha y cuenta atrás ya están en la franja de arriba; sin nada que contar, no se muestra. */}
      {next && (hasContent(state.events, g, next) || stream > now) && (
        <div className="next-patch">
          <div className="next-top">
            <small className="lbl">{t('patch.next')}</small>
            <span><strong>v{next.version}</strong>{next.name && <> · <em>{next.name}</em></>}</span>
            {stream > now && <small className="stream" title={t('patch.streamHint')}>📺 {t('patch.stream', { date: fmtDate(stream), t: countdown(stream - now) })}</small>}
          </div>
          <VersionContent g={g} p={next} ctx={ctx} />
        </div>
      )}

      {history.length > 0 && (
        <>
          {uniform > 0 && <p className="muted uniform">{t('patch.allSame', { n: uniform })}</p>}
          <ul className={`hist ${uniform ? 'flat' : ''}`}>
            {shown.map(p => {
              const d = daysOf(p)
              return (
                <li key={p.id} title={`${p.name ?? ''} ${fmtDateY(p.date)} → ${fmtDateY(p.end!)}`}>
                  <span className="ver">v{p.version}</span>
                  <span className="pname">{p.name ?? ''}</span>
                  <span className="when">{fmtDate(p.date)} → {fmtDate(p.end!)}</span>
                  {!uniform && (
                    <>
                      <span className="bar-wrap">
                        <i className="dur" style={{ width: `${(d / maxD) * 100}%` }} />
                        {typical > 0 && <i className="ref" style={{ left: `${(typical / maxD) * 100}%` }} title={t('patch.typical', { n: typical })} />}
                      </span>
                      <b>{t('unit.days', { n: d })}</b>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {history.length > HIST_SHOWN && (
            <button className="link-btn" onClick={() => setShowAll(s => !s)}>{showAll ? t('patch.showLess') : t('patch.showAll', { n: history.length })}</button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Dos colores vivos del arte de un parche (para teñir su barra de avance). Se lee la imagen en un lienzo pequeño: solo funciona si el sitio
 * permite leerla (CORS; Fandom sí, wiki.gg no). Si no se puede, `null` y la barra usa el color del juego. Se recuerda por URL.
 */
const paletteCache = new Map<string, [string, string] | null>()
function useImagePalette(src?: string): [string, string] | null {
  const [pal, setPal] = useState<[string, string] | null>(null)
  useEffect(() => {
    if (!src || paletteCache.has(src)) return
    let alive = true
    const done = (out: [string, string] | null) => { paletteCache.set(src, out); if (alive) setPal(out) }
    // La miniatura carga esta imagen sin CORS y el navegador reutilizaría esa copia (sin la cabecera), así que la lectura fallaría:
    // se pide con otra URL (`wgpal=1`) para traerla con CORS. Si el sitio no lo permite (wiki.gg), queda el color del juego.
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => {
      let out: [string, string] | null = null
      try { out = paletteOf(img) } catch { /* imagen sin permiso de lectura */ }
      done(out)
    }
    img.onerror = () => done(null)
    img.src = `${src}${src.includes('?') ? '&' : '?'}wgpal=1`
    return () => { alive = false }
  }, [src])
  if (!src) return null
  return paletteCache.has(src) ? paletteCache.get(src)! : pal
}

/** Agrupa los píxeles por tono (24 grupos), pesa cada uno por saturación × brillo y devuelve los dos tonos dominantes más distintos. */
function paletteOf(img: HTMLImageElement): [string, string] | null {
  const W = 48, H = 27
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, W, H)
  const data = ctx.getImageData(0, 0, W, H).data
  const bins = Array.from({ length: 24 }, () => ({ w: 0, h: 0, s: 0 }))
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max, d = max - min
    const sat = max ? d / max : 0
    if (v < 0.25 || sat < 0.25) continue
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
    const w = sat * v
    const bin = bins[Math.floor(h / 15)]
    bin.w += w; bin.h += h * w; bin.s += sat * w
  }
  const ranked = bins.filter(x => x.w > 0).map(x => ({ w: x.w, h: x.h / x.w, s: x.s / x.w })).sort((a, b) => b.w - a.w)
  if (!ranked.length || ranked[0].w < 2) return null
  const a = ranked[0]
  const dist = (x: number, y: number) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y))
  const b = ranked.find(x => dist(x.h, a.h) >= 40 && x.w > a.w * 0.15) ?? { ...a, h: (a.h + 30) % 360 }
  // Saturación y luz fijas en un rango que se lee bien sobre el fondo oscuro.
  const css = (x: { h: number; s: number }) => `hsl(${Math.round(x.h)} ${Math.round(Math.max(60, Math.min(90, x.s * 100)))}% 62%)`
  return [css(a), css(b)]
}

/** Versión en curso: solo el avance (lo que trae ya está en Mis gachas). */
function CurrentPatch({ g, p, ctx, typical }: { g: Game; p: Patch; ctx: Ctx; typical: number }) {
  const { now } = ctx
  const start = +new Date(p.date)
  const total = p.end ? +new Date(p.end) - start : (typical || 42) * DAY
  const elapsed = Math.min(total, now - start)
  const pct = Math.round((elapsed / total) * 100)
  const art = wallpaperOf(g.id)
  const pal = useImagePalette(art)
  // Barra con los colores del arte del parche; sin ellos, el color del juego.
  const bar = pal ? { background: `linear-gradient(90deg, ${pal[0]}, ${pal[1]})`, boxShadow: `0 0 14px ${pal[0]}` }
    : { background: 'linear-gradient(90deg, var(--c), color-mix(in srgb, var(--c) 55%, #fff))', boxShadow: '0 0 14px var(--c)' }
  return (
    <div className={`current ${art ? 'has-art' : ''}`}>
      {/* El arte de la versión en curso, a la vista junto al avance (encima en móvil). */}
      {art && <span className="current-art"><Img src={art} alt={p.name ?? `v${p.version}`} /></span>}
      <div className="current-main">
        <div className="current-top">
          <span><Tag tone="great">{t('patch.current')}</Tag> <strong>v{p.version}</strong>{p.name && <span className="cur-name"> · {p.name}</span>}</span>
          <small>{t('patch.dayOf', { d: Math.max(1, Math.ceil(elapsed / DAY)), n: Math.round(total / DAY), t: countdown(start + total - now) })}</small>
        </div>
        <div className="progress"><i style={{ width: `${pct}%`, ...bar }} /></div>
      </div>
    </div>
  )
}

/**
 * Qué trae una versión: sus banners agrupados por fase (los que empiezan el mismo día) y los eventos principales que arrancan dentro de ella.
 * Sale de los eventos que ya tenemos, cruzados con las fechas del parche.
 */
/** ¿Empieza este elemento dentro de la versión? */
function insideOf(g: Game, p: Patch) {
  const s = +new Date(p.date) - DAY / 2
  const e = p.end ? +new Date(p.end) : +new Date(p.date) + (g.patchCycleDays || 42) * DAY
  return (x: GameEvent) => x.gameId === g.id && +new Date(x.start) >= s && +new Date(x.start) < e - DAY / 2
}
const hasContent = (events: GameEvent[], g: Game, p: Patch) => {
  const inside = insideOf(g, p)
  return events.some(x => (x.kind === 'banner' || (x.kind === 'event' && !x.minor)) && inside(x))
}

function VersionContent({ g, p, ctx }: { g: Game; p: Patch; ctx: Ctx }) {
  const { state, now, open } = ctx
  const inside = insideOf(g, p)
  const banners = state.events.filter(x => x.kind === 'banner' && inside(x)).sort((a, b) => +new Date(a.start) - +new Date(b.start))
  const phases: { start: number; end: number; items: GameEvent[] }[] = []
  for (const b of banners) {
    const bs = +new Date(b.start)
    const ph = phases.find(f => Math.abs(f.start - bs) < DAY)
    if (ph) { ph.items.push(b); ph.end = Math.max(ph.end, +new Date(b.end)) }
    else phases.push({ start: bs, end: +new Date(b.end), items: [b] })
  }
  // Si la primera fase que conocemos empieza bien entrada la versión, la 1.ª ya terminó (y salió de los datos): se numera desde la 2.ª.
  const offset = phases.length && phases[0].start - +new Date(p.date) > 7 * DAY ? 1 : 0
  const events = state.events.filter(x => x.kind === 'event' && !x.minor && inside(x))
    .sort((a, b) => (b.pulls || 0) - (a.pulls || 0) || +new Date(a.start) - +new Date(b.start)).slice(0, 4)
  if (!phases.length && !events.length) return null
  return (
    <div className="vcontent">
      {phases.length > 0 && (
        <div className="phases">
          {phases.slice(0, 3).map((ph, i) => {
            const active = ph.start <= now && ph.end > now
            const featured = ph.items.flatMap(b => b.featured.length ? b.featured.map(f => ({ ...f, b })) : [{ name: b.title, icon: undefined, b }])
            return (
              <div key={ph.start} className={`phase ${active ? 'on' : ''}`}>
                <small className="phase-head"><b>{t('patch.phase', { n: i + 1 + offset })}</b> · {fmtDate(ph.start)} → {fmtDate(ph.end)}</small>
                <div className="phase-units">
                  {featured.slice(0, 6).map(f => (
                    <button key={`${f.b.id}:${f.name}`} className="unit" onClick={() => open(f.b)} title={f.name}>
                      {f.icon ? <span className="face-sm"><Img src={f.icon} /></span> : bannerArt(f.b) ? <span className="bart"><Img src={bannerArt(f.b)!} /></span> : null}
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {events.length > 0 && (
        <div className="vevents">
          <small className="phase-head"><b>{t('patch.mainEvents')}</b></small>
          <ul className="list compact">
            {events.map(x => (
              <li key={x.id} className="clickable" onClick={() => open(x)}>
                <span>{x.title}</span>
                <small className="muted">{fmtDate(x.start)} → {fmtDate(x.end)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
