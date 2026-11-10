import { Fragment, useState } from 'react'
import { t } from './i18n'
import { detailsPulls, partialPulls, trackedGames } from './logic'
import { bannersOf, cfgOf, econOf, planPulls, type Source, type SourceRow } from './pullPlan'
import type { Game, PlanCfg } from './types'
import { itemIcon } from './images'
import { GameAvatar, cssVar, fmtDate, type Ctx } from './ui'
import { Ico, type IconName } from './PlanIcons'

/* ---------- Tiradas (calculadora) ---------- */
/**
 * Una ficha por juego que sigues. Tú pones lo que tienes (moneda y billetes) y si tienes el pase mensual; lo que el juego da sin
 * pagar (diarias, semanales, modos de dificultad, mantenimiento y códigos de cada versión) sale solo de pullPlan.ts, y se suman los
 * eventos pendientes que ya conoce la app. Dice cuántas tiradas tendrás al empezar o al terminar un banner y cuánto falta para la
 * meta (el pity, por defecto). Lo manual (otros ingresos, coste de una tirada) queda en "Ajustar".
 * Los ajustes se guardan por juego en `state.planner` (solo lo que cambias). Usa las clases de siempre (.psec, .gsec-head, .stats,
 * .list, .progress, .seg) para que cada skin la pinte sola; lo propio de esta vista va en App.css con el prefijo `.plan-`.
 */
export function Planner(ctx: Ctx & { goMine: () => void }) {
  const { state, games, goMine } = ctx
  const mine = trackedGames(games, state.tracked)
  if (!mine.length)
    return <div className="empty"><p>{t('plan.empty')}</p><button className="btn primary" onClick={goMine}>{t('btn.choose')}</button></div>
  return (
    <>
      <h3 className="plan-lead">{t('plan.lead')}</h3>
      {/* El aviso de que es un mínimo, plegado en un botón para que no ocupe siempre la pantalla. */}
      <details className="plan-disclaimer">
        <summary className="btn sm">ⓘ {t('plan.disclaimerBtn')}</summary>
        <p className="muted">{t('plan.disclaimer')}</p>
      </details>
      <div className="psecs">{mine.map((g, i) => <PlanCard key={g.id} g={g} ctx={ctx} i={i} />)}</div>
    </>
  )
}

/** Campo numérico que deja borrar el número mientras escribes (vacío = 0 al guardar). */
function Num({ label, value, onChange, suffix, disabled }: { label: React.ReactNode; value: number; onChange: (n: number) => void; suffix?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="plan-field">
      <span>{label}</span>
      <span className="plan-input">
        <input type="number" inputMode="numeric" min={0} value={draft ?? String(value)} disabled={disabled}
          onChange={e => { setDraft(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.max(0, n)) }}
          onBlur={() => { if (draft === '') onChange(0); setDraft(null) }} />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  )
}

/** Icono de una fila de ingresos según lo que es. */
function sourceIcon(s: Source): IconName {
  if (s.tickets) return s.key === 'login' ? 'login' : 'ticket'
  switch (s.key) {
    case 'daily': return 'sun'
    case 'weekly': return 'week'
    case 'maint': return 'wrench'
    case 'live': return 'live'
    case 'shop': return 'shop'
    case 'login': return 'login'
    case 'login50': return 'login'
    case 'monthly': return 'calendar'
  }
  return s.endgame ? 'trophy' : 'repeat'
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString()
const fmtN = (n: number) => Math.round(n).toLocaleString()

/** Valor de una fila del desglose: la moneda (o los tickets) que da con su icono, en pequeño, y lo que suma en tiradas. */
function Val({ icon, cur, pulls, ticket }: { icon?: string; cur: string; pulls: string; ticket?: boolean }) {
  return (
    <span className="plan-val">
      <small className="plan-cur">{cur && <>{icon ? <img src={icon} alt="" loading="lazy" /> : <Ico name={ticket ? 'ticket' : 'gem'} />}{cur}</>}</small>
      <b>{pulls}</b>
    </span>
  )
}

/** Nombre de una fila de ingresos: el del modo, o el texto genérico ("Misiones diarias"…). */
const rowName = (r: SourceRow) => r.src.name ?? t(`plan.src.${r.src.key}` as 'plan.src.daily')

function PlanCard({ g, ctx, i }: { g: Game; ctx: Ctx; i: number }) {
  const { state, setState, now, open } = ctx
  const econ = econOf(g)
  const cfg = cfgOf(g, state.planner?.[g.id])
  const set = (patch: Partial<PlanCfg>) => setState(s => ({ ...s, planner: { ...s.planner, [g.id]: { ...s.planner?.[g.id], ...patch } } }))
  const cur = econ.currency || t('plan.currency')
  const auto = econ.sources.length > 0

  const banners = bannersOf(state.events, g.id, now)
  const useDate = cfg.target === 'date' || (!banners.length && !!cfg.date)
  // Sin elegir: el próximo banner que aún no ha empezado (para el que estás ahorrando); si no hay, el que está en curso.
  const banner = useDate ? undefined : banners.find(b => b.id === cfg.target) ?? banners.find(b => +new Date(b.start) > now) ?? banners[0]
  const started = !!banner && +new Date(banner.start) <= now
  const until = useDate
    ? (cfg.date ? +new Date(`${cfg.date}T23:59`) : 0)
    : banner ? +new Date(cfg.at === 'start' && !started ? banner.start : banner.end) : 0
  const hasEvents = !!g.api && (detailsPulls(g) || partialPulls(g))
  const r = planPulls({ ...cfg, events: cfg.events && hasEvents }, until, g, state, now)
  const per = Math.max(1, cfg.per)
  const diff = r.total - cfg.goal
  const pct = cfg.goal > 0 ? Math.min(100, (r.total / cfg.goal) * 100) : 0
  const curIcon = econ.iconUrl ?? itemIcon(state, g.id, econ.icon)
  const ticketIcon = itemIcon(state, g.id, econ.ticket)
  type Row = { ico: IconName; name: string; times?: number; amount: number; tickets?: boolean }
  const groupOf = (s: Source) => (s.endgame ? 'endgame' : s.per === 'day' || s.per === 'week' ? 'routine' : 'version')
  type GroupId = 'routine' | 'endgame' | 'rank' | 'version'
  const groups: { id: GroupId; rows: Row[] }[] = (['routine', 'endgame', 'rank', 'version'] as const).map(id => ({ id, rows: [] }))
  const add = (id: GroupId, row: Row) => groups.find(x => x.id === id)!.rows.push(row)
  const [evOpen, setEvOpen] = useState(false)
  // Los modos de dificultad se listan aunque estén quitados del cálculo (para poder volver a marcarlos): se cuentan aparte.
  for (const src of econ.sources) {
    const row = r.rows.find(x => x.src === src)
    const times = row?.times ?? 0
    if (src.endgame && !cfg.endgame) { add('endgame', { ico: sourceIcon(src), name: src.name ?? '', times, amount: 0 }); continue }
    if (!times) continue
    add(groupOf(src), { ico: sourceIcon(src), name: rowName(row!), times, amount: row!.amount, tickets: src.tickets })
  }
  // Lo que pagan los modos según tu puesto (lo que elegiste en "Tu puesto").
  for (const x of r.rows) if (x.src.rank && x.times) add('rank', { ico: x.src.tickets ? 'ticket' : 'trophy', name: x.src.name ?? '', times: x.times, amount: x.amount, tickets: x.src.tickets })
  if (cfg.pass) add('routine', { ico: 'card', name: t('plan.rowPass'), times: r.days, amount: r.pass })
  if (r.manual > 0) add('routine', { ico: 'pencil', name: t('plan.rowManual'), amount: r.manual })

  return (
    <section className="psec plan" style={{ ...cssVar(g), '--i': i } as React.CSSProperties}>
      <header className="gsec-head">
        <GameAvatar game={g} state={state} size={48} />
        <div className="grow"><h2>{g.name}</h2>
          <small>{t('plan.rate', { n: fmt(per), cur })}</small></div>
        <div className="stats">
          <div><b>{until ? r.total : '—'}</b><small>{t('plan.pulls')}</small></div>
          {cfg.goal > 0 && until > 0 && <div><b>{diff >= 0 ? `+${diff}` : -diff}</b><small>{diff >= 0 ? t('plan.spare') : t('plan.missing')}</small></div>}
        </div>
      </header>

      <div className="plan-grid">
        <div className="plan-col">
          <h3><Ico name="wallet" title />{t('plan.have')}</h3>
          <div className="plan-fields">
            <Num label={<>{curIcon ? <img className="plan-ico" src={curIcon} alt="" /> : <Ico name="gem" />}{cur}</>} value={cfg.cur} onChange={n => set({ cur: n })} />
            <Num label={<>{ticketIcon ? <img className="plan-ico" src={ticketIcon} alt="" /> : <Ico name="ticket" />}{t('plan.tickets')}</>} value={cfg.tickets} onChange={n => set({ tickets: n })} />
            <label className="plan-field plan-pass wide">
              <span><input type="checkbox" checked={cfg.pass} onChange={e => set({ pass: e.target.checked })} /><Ico name="card" />{t('plan.pass')}</span>
              <span className="plan-input">
                <input type="number" min={0} value={cfg.passDaily} disabled={!cfg.pass} aria-label={t('plan.pass')}
                  onChange={e => set({ passDaily: Math.max(0, Number(e.target.value) || 0) })} />
                <small>{cur} {t('plan.perDay')}</small>
              </span>
            </label>
          </div>

          {((econ.choices?.length ?? 0) > 0 || (econ.inputs?.length ?? 0) > 0) && <>
            <h3><Ico name="trophy" title />{t('plan.ranks')}</h3>
            <div className="plan-fields">
              {econ.inputs?.map(inp => (
                <Num key={inp.id} label={<><Ico name="trophy" />{inp.name}</>} value={cfg.custom?.[inp.id] ?? 0}
                  onChange={n => set({ custom: { ...cfg.custom, [inp.id]: n } })} suffix={`${cur} ${inp.per === 'week' ? t('plan.perWeek') : inp.per === 'month' ? t('plan.perMonth') : t('plan.perDay')}`} />
              ))}
              {econ.choices?.map(ch => (
                <label key={ch.id} className="plan-field">
                  <span><Ico name="trophy" />{ch.name}</span>
                  <select value={cfg.ranks?.[ch.id] ?? 0} onChange={e => set({ ranks: { ...cfg.ranks, [ch.id]: Number(e.target.value) } })}>
                    {ch.options.map((o, k) => <option key={k} value={k}>{k === 0 ? t('plan.noRank') : `${o.label} · ${o.amount.toLocaleString()} ${cur}${o.tickets ? ` + ${o.tickets} ${t('plan.ticketsShort')}` : ''}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {(econ.inputs?.length ?? 0) > 0 && <small className="muted plan-hint">{t('plan.inputsHint')}</small>}
          </>}

          <h3><Ico name="target" title />{t('plan.target')}</h3>
          <div className="plan-fields">
            <label className="plan-field wide">
              <span><Ico name="flag" />{t('plan.banner')}</span>
              <select value={useDate ? 'date' : banner?.id ?? ''} onChange={e => set({ target: e.target.value })}>
                {banners.map(b => <option key={b.id} value={b.id}>{b.title} · {fmtDate(b.start)} → {fmtDate(b.end)}</option>)}
                <option value="date">{t('plan.ownDate')}</option>
              </select>
            </label>
            {useDate
              ? <label className="plan-field"><span><Ico name="calendar" />{t('plan.date')}</span><input type="date" value={cfg.date ?? ''} onChange={e => set({ date: e.target.value })} /></label>
              : banner && (
                <div className="plan-field plan-at">
                  <span><Ico name="calendar" />{t('plan.countTo')}</span>
                  <div className="seg">
                    <button className={cfg.at === 'start' && !started ? 'on' : ''} disabled={started} onClick={() => set({ at: 'start' })}>{t('plan.atStart')}</button>
                    <button className={cfg.at === 'end' || started ? 'on' : ''} onClick={() => set({ at: 'end' })}>{t('plan.atEnd')}</button>
                  </div>
                </div>
              )}
            <Num label={<><Ico name="goal" />{t('plan.goal')}</>} value={cfg.goal} onChange={n => set({ goal: n })} />
          </div>

          <details className="plan-adjust">
            <summary><Ico name="sliders" />{t('plan.adjust')}</summary>
            <div className="plan-fields">
              <Num label={auto ? t('plan.extraDaily') : t('plan.daily')} value={cfg.daily} onChange={n => set({ daily: n })} suffix={t('plan.perDay')} />
              <Num label={auto ? t('plan.extraWeekly') : t('plan.weekly')} value={cfg.weekly} onChange={n => set({ weekly: n })} suffix={t('plan.perWeek')} />
              <Num label={t('plan.per')} value={cfg.per} onChange={n => set({ per: Math.max(1, n) })} />
            </div>
          </details>
        </div>

        <div className="plan-col">
          {until > 0 ? (
            <>
              <h3><Ico name="chart" title />{t('plan.forecast')}</h3>
              <p className="plan-when muted">{t('plan.until', { date: fmtDate(until), n: r.days })}</p>
              {/* Desglose por grupos (diario y semanal, modos de dificultad, versión y tiendas, eventos) en tres columnas: nombre con
                  sus veces, la moneda con su icono (o los tickets) y lo que suma en tiradas. */}
              <ul className="list plan-break">
                <li><span className="plan-name"><Ico name="wallet" />{t('plan.rowNow')}</span>
                  <Val icon={curIcon} cur={cfg.cur > 0 ? fmtN(cfg.cur) : ''} pulls={fmt(r.now)} /></li>
                {groups.map(grp => grp.rows.length > 0 && (
                  <Fragment key={grp.id}>
                    <li className="plan-group">{grp.id === 'endgame'
                      ? <label><input type="checkbox" checked={cfg.endgame} onChange={e => set({ endgame: e.target.checked })} /><span className="plan-grp-t">{t('plan.grpEndgame')}</span><small>{t('plan.endgameHint')}</small></label>
                      : <span>{t(`plan.grp.${grp.id}` as 'plan.grp.routine')}</span>}</li>
                    {(grp.id !== 'endgame' || cfg.endgame) && grp.rows.map((x, k) => (
                      <li key={k}><span className="plan-name"><Ico name={x.ico} /><span>{x.name} {x.times !== undefined && <small className="muted">× {x.times}</small>}</span></span>
                        <Val icon={x.tickets ? ticketIcon : curIcon} ticket={x.tickets} cur={fmtN(x.amount)} pulls={`+${fmt(x.tickets ? x.amount : x.amount / per)}`} /></li>
                    ))}
                  </Fragment>
                ))}
                {hasEvents && <li className="plan-group plan-group-row">
                  <label><input type="checkbox" checked={cfg.events} onChange={e => set({ events: e.target.checked })} />{t('plan.rowEvents', { n: r.eventList.length })}</label>
                  {cfg.events && r.eventList.length > 0 && <button className="plan-ev-toggle" aria-expanded={evOpen} onClick={() => setEvOpen(o => !o)}>{evOpen ? t('plan.hideEvents') : t('plan.showEvents')} <span aria-hidden>▾</span></button>}
                  <b>+{fmt(r.events)}</b></li>}
                {/* Cada evento pendiente con lo que da en tiradas y cuándo termina; al pulsarlo se abre su ventana. */}
                {hasEvents && cfg.events && evOpen && r.eventList.map(e => (
                  <li key={e.id} className="clickable plan-ev" onClick={() => open(e)}>
                    <span className="plan-name"><Ico name="flag" /><span>{e.title} <small className="muted">{t('plan.evEnds', { date: fmtDate(e.end) })}</small></span></span>
                    <span className="plan-val"><small className="plan-cur" /><b>+{fmt(e.pulls)}</b></span>
                  </li>
                ))}
                <li className="plan-total"><span className="plan-name"><Ico name="sum" />{t('plan.total')}</span><b>{r.total}</b></li>
              </ul>
              {cfg.goal > 0 && (
                <div className={`plan-goal ${diff >= 0 ? 'ok' : 'short'}`}>
                  <div className="progress"><i style={{ width: `${pct}%` }} /></div>
                  <p>{diff >= 0 ? t('plan.reach', { n: diff }) : t('plan.short', { n: -diff, cur: fmt(Math.max(0, -diff * per - r.rest)), c: cur })}</p>
                </div>
              )}
              {econ.more && <p className="plan-more"><Ico name="chart" />{t('plan.more')} <a href={econ.more.url} target="_blank" rel="noopener noreferrer">{econ.more.name} ↗</a></p>}
              <small className="muted plan-hint">{auto ? t('plan.noteAuto') : econ.note === 'limbus' ? t('plan.noteLimbus') : t('plan.noDefaults')}</small>
            </>
          ) : <p className="muted">{banners.length ? t('plan.pickDate') : t('plan.noBanners')}</p>}
        </div>
      </div>
    </section>
  )
}
