import { useState } from 'react'
import { countdown, eventStatus, isTaskDone, uid, verdict } from './logic'
import { enableNotifications } from './notify'
import { GameAvatar, Img, Tag, cssVar, fmtDate, fmtDateY, heroOf, type Ctx } from './ui'
import type { Cadence, Game, Patch } from './types'

const DAY = 86_400_000

/* ---------- Mis gachas ---------- */
export function MyGachas({ ctx, sync, syncing }: { ctx: Ctx; sync: (force?: boolean) => void; syncing: boolean }) {
  const { state, games, setState } = ctx
  const [msg, setMsg] = useState('')
  const toggle = (id: string) => setState(s => ({ ...s, tracked: s.tracked.includes(id) ? s.tracked.filter(x => x !== id) : [...s.tracked, id] }))
  const mine = games.filter(g => state.tracked.includes(g.id))
  const auto = games.filter(g => g.api)
  const soon = games.filter(g => !g.api)

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'whengacha-respaldo.json'; a.click(); URL.revokeObjectURL(url)
  }
  const toggleNotify = async () => {
    if (!state.notify && !(await enableNotifications())) { setMsg('El navegador bloqueó las notificaciones.'); return }
    setMsg('')
    setState(s => ({ ...s, notify: !s.notify }))
  }

  return (
    <>
      <section>
        <h3>{mine.length ? 'Añadir o quitar gachas' : '¿A qué gachas juegas?'}</h3>
        {!mine.length && <p className="muted lead">Elige tus juegos y listo: los eventos, banners, desafíos y parches se cargan solos.</p>}
        <div className="picks">
          {auto.map(g => <Pick key={g.id} g={g} on={state.tracked.includes(g.id)} state={state} onClick={() => toggle(g.id)} />)}
        </div>
        <details className="soon">
          <summary>Próximamente ({soon.length}) · sin fuente de datos abierta todavía</summary>
          <div className="picks">{soon.map(g => <Pick key={g.id} g={g} state={state} disabled />)}</div>
        </details>
      </section>

      {mine.length > 0 && (
        <section>
          <h3>Tus gachas</h3>
          <div className="grid wide">{mine.map(g => <GameCard key={g.id} g={g} ctx={ctx} onRemove={() => toggle(g.id)} />)}</div>
        </section>
      )}

      <section>
        <h3>Ajustes</h3>
        <div className="toolbar">
          <div className="group">
            <button className="btn" onClick={() => sync(true)} disabled={syncing}><span className={syncing ? 'spin on' : 'spin'}>⟳</span> {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
            <button className={`btn ${state.notify ? '' : 'primary'}`} onClick={toggleNotify}>{state.notify ? '🔕 Desactivar avisos' : '🔔 Activar avisos'}</button>
            <label className="muted inline-label">Avisar
              <select value={state.leadHours} onChange={e => setState(s => ({ ...s, leadHours: Number(e.target.value) }))}>
                {[6, 12, 24, 48, 72].map(h => <option key={h} value={h}>{h} h antes del fin</option>)}
              </select>
            </label>
          </div>
          <button className="btn ghost" onClick={exportJson}>⭳ Respaldo</button>
        </div>
        {msg && <p className="muted">{msg}</p>}
        <p className="muted small">
          Fuentes: <code>api.ennead.cc</code> (Genshin, HSR, ZZZ), wikis de Fandom y wiki.gg (historial de parches, Arknights, Endfield y eventos de Nikke),
          {' '}<code>uma.moe</code> (Umamusume), <code>gachafocus.com.br</code> (Chaos Zero Nightmare, Wuthering Waves y Neverness to Everness)
          y <code>lootandwaifus.com</code> (banners de Nikke). Son datos de la comunidad y pueden ir con retraso;
          si una fuente cambia su formato, ese juego deja de actualizarse.
        </p>
      </section>
    </>
  )
}

function Pick({ g, on, state, onClick, disabled }: { g: Game; on?: boolean; state: Ctx['state']; onClick?: () => void; disabled?: boolean }) {
  return (
    <button className={`pick ${on ? 'on' : ''}`} style={cssVar(g)} onClick={onClick} disabled={disabled} aria-pressed={on}>
      <GameAvatar game={g} state={state} size={52} />
      <span className="pick-txt"><strong>{g.name}</strong><small>{g.publisher}</small></span>
      {disabled ? <Tag tone="off">Pronto</Tag> : <span className="check">{on ? '✓' : '＋'}</span>}
    </button>
  )
}

function GameCard({ g, ctx, onRemove }: { g: Game; ctx: Ctx; onRemove: () => void }) {
  const { state, now, setState, open } = ctx
  const live = state.events
    .filter(e => e.gameId === g.id && e.kind !== 'banner' && eventStatus(e, now) !== 'ended')
    .sort((a, b) => +new Date(a.end) - +new Date(b.end))
  const banners = state.events.filter(e => e.gameId === g.id && e.kind === 'banner' && eventStatus(e, now) === 'active')
  const patches = state.patches.filter(p => p.gameId === g.id)
  const cur = patches.find(p => !p.estimated && +new Date(p.date) <= now && (!p.end || +new Date(p.end) > now))
  const next = patches.filter(p => +new Date(p.date) > now).sort((a, b) => +new Date(a.date) - +new Date(b.date))[0]
  const tasks = state.tasks.filter(t => t.gameId === g.id)
  const codes = state.codes[g.id] ?? []
  const pending = tasks.filter(t => !isTaskDone(t, now)).length
  return (
    <article className="gcard" style={cssVar(g)}>
      <div className="gcard-hero">
        <Img src={heroOf(state, g.id)} />
        <div className="fade" />
        <button className="x corner" onClick={onRemove} title="Dejar de seguir" aria-label={`Dejar de seguir ${g.name}`}>×</button>
        <div className="gcard-head">
          <GameAvatar game={g} state={state} size={52} />
          <div>
            <h2>{g.name}</h2>
            <p>{next ? `${next.estimated ? '≈ ' : ''}v${next.version} · ${fmtDate(next.date)} (${countdown(+new Date(next.date) - now)})`
              : cur ? `Versión ${cur.version} en curso` : `${live.length} eventos activos o próximos`}</p>
          </div>
        </div>
      </div>
      <div className="gcard-body">
        {banners.length > 0 && (
          <div className="faces">
            {banners.flatMap(b => b.featured).filter(f => f.icon).slice(0, 6).map(f => <span key={f.name} className="face-lg" title={f.name}><Img src={f.icon} /></span>)}
            <small className="muted">Banners activos · terminan en {countdown(Math.min(...banners.map(b => +new Date(b.end))) - now)}</small>
          </div>
        )}
        <h3>Pendientes {pending > 0 && <Tag tone="mid">{pending}</Tag>}</h3>
        <ul className="list">
          {tasks.map(t => {
            const done = isTaskDone(t, now)
            return (
              <li key={t.id} className={done ? 'done' : ''}>
                <label>
                  <input type="checkbox" checked={done} onChange={() => setState(s => ({ ...s, tasks: s.tasks.map(x => x.id === t.id ? { ...x, doneAt: done ? undefined : new Date().toISOString() } : x) }))} />
                  <span>{t.title}</span> <em>{t.cadence === 'daily' ? 'diaria' : t.cadence === 'weekly' ? 'semanal' : 'única'}</em>
                </label>
                <button className="x" onClick={() => setState(s => ({ ...s, tasks: s.tasks.filter(x => x.id !== t.id) }))} aria-label="Quitar">×</button>
              </li>
            )
          })}
        </ul>
        <TaskForm onAdd={(title, cadence) => setState(s => ({ ...s, tasks: [...s.tasks, { id: uid(), gameId: g.id, title, cadence }] }))} />

        <h3>Terminan pronto</h3>
        {live.length ? (
          <ul className="list">
            {live.slice(0, 5).map(e => (
              <li key={e.id} className="clickable" onClick={() => open(e)}>
                <span>{state.done[e.id] ? '✓ ' : ''}{e.title}</span>
                <Tag tone={verdict(e, now).tone}>{eventStatus(e, now) === 'upcoming' ? `en ${countdown(+new Date(e.start) - now)}` : countdown(+new Date(e.end) - now)}</Tag>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Nada activo por ahora.</p>}

        {codes.length > 0 && (
          <details>
            <summary>Códigos de canje ({codes.length})</summary>
            <ul className="list">
              {codes.map(c => (
                <li key={c.code}>
                  <span><code>{c.code}</code><br /><small className="muted">{c.rewards.join(' · ')}</small></span>
                  <button className="btn sm" onClick={() => navigator.clipboard?.writeText(c.code)}>Copiar</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  )
}

function TaskForm({ onAdd }: { onAdd: (title: string, c: Cadence) => void }) {
  const [title, setTitle] = useState('')
  const [c, setC] = useState<Cadence>('daily')
  return (
    <form className="inline" onSubmit={e => { e.preventDefault(); if (title.trim()) { onAdd(title.trim(), c); setTitle('') } }}>
      <input placeholder="Nueva tarea…" value={title} onChange={e => setTitle(e.target.value)} />
      <select value={c} onChange={e => setC(e.target.value as Cadence)}>
        <option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="once">Única</option>
      </select>
      <button className="btn sm" aria-label="Añadir tarea">＋</button>
    </form>
  )
}

/* ---------- Parches ---------- */
export function Patches(ctx: Ctx & { goMine: () => void }) {
  const { state, games, goMine } = ctx
  const mine = games.filter(g => state.tracked.includes(g.id))
  if (!mine.length)
    return <div className="empty"><p>Elige tus gachas para ver la duración de sus parches.</p><button className="btn primary" onClick={goMine}>＋ Elegir mis gachas</button></div>
  return <div className="psecs">{mine.map(g => <PatchCard key={g.id} g={g} ctx={ctx} />)}</div>
}

const daysOf = (p: Patch) => (p.end ? Math.round((+new Date(p.end) - +new Date(p.date)) / DAY) : 0)

function PatchCard({ g, ctx }: { g: Game; ctx: Ctx }) {
  const { state, now } = ctx
  const all = state.patches.filter(p => p.gameId === g.id).sort((a, b) => +new Date(a.date) - +new Date(b.date))
  const done = all.filter(p => !p.estimated && p.end && +new Date(p.end) <= now)
  const cur = all.find(p => !p.estimated && +new Date(p.date) <= now && (!p.end || +new Date(p.end) > now))
  const next = all.find(p => +new Date(p.date) > now)
  const recent = done.slice(-12).reverse()
  const durs = done.slice(-10).map(daysOf).filter(Boolean)
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0
  const maxD = Math.max(50, ...recent.map(daysOf))
  const typical = g.patchCycleDays

  return (
    <section className="psec" style={cssVar(g)}>
      <header className="gsec-head">
        <GameAvatar game={g} state={state} size={48} />
        <div className="grow"><h2>{g.name}</h2>
          <small>{all.length ? `${done.length} versiones completadas` : 'No usa parches numerados'}</small></div>
        {avg > 0 && (
          <div className="stats">
            <div><b>{avg} d</b><small>duración media</small></div>
            <div><b>{Math.min(...durs)} d</b><small>más corta</small></div>
            <div><b>{Math.max(...durs)} d</b><small>más larga</small></div>
          </div>
        )}
      </header>

      {!all.length && <p className="muted">{g.name} se actualiza con eventos continuos en vez de versiones: míralos en la línea de tiempo.</p>}

      {cur && <CurrentPatch p={cur} now={now} typical={typical} />}
      {next && (
        <div className="next-patch">
          <Tag tone={next.estimated ? 'mid' : 'good'}>{next.estimated ? 'Estimado' : 'Anunciado'}</Tag>
          <span><strong>v{next.version}</strong> llega el {fmtDateY(next.date)} · <b>en {countdown(+new Date(next.date) - now)}</b>
            {next.end && <> · durará ≈ {daysOf(next)} d</>}</span>
        </div>
      )}

      {recent.length > 0 && (
        <ul className="hist">
          {recent.map(p => {
            const d = daysOf(p)
            return (
              <li key={p.id} title={`${p.name ?? ''} ${fmtDateY(p.date)} → ${fmtDateY(p.end!)}`}>
                <span className="ver">v{p.version}</span>
                <span className="when">{fmtDate(p.date)} → {fmtDate(p.end!)}</span>
                <span className="bar-wrap">
                  <i className="dur" style={{ width: `${(d / maxD) * 100}%` }} />
                  {typical > 0 && <i className="ref" style={{ left: `${(typical / maxD) * 100}%` }} title={`Típico: ${typical} d`} />}
                </span>
                <b>{d} d</b>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function CurrentPatch({ p, now, typical }: { p: Patch; now: number; typical: number }) {
  const start = +new Date(p.date)
  const total = p.end ? +new Date(p.end) - start : (typical || 42) * DAY
  const elapsed = Math.min(total, now - start)
  const pct = Math.round((elapsed / total) * 100)
  return (
    <div className="current">
      <div className="current-top">
        <span><Tag tone="great">En curso</Tag> <strong>v{p.version}</strong>{p.name && <small> · {p.name}</small>}</span>
        <small>día {Math.max(1, Math.ceil(elapsed / DAY))} de {Math.round(total / DAY)} · quedan {countdown(start + total - now)}</small>
      </div>
      <div className="progress"><i style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
