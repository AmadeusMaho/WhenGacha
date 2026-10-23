import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import { CATALOG } from './catalog'
import EventModal, { lastPointer } from './EventModal'
import { useImages } from './images'
import { fireDue, mirrorAlerts } from './notify'
import { useAutoSync, useStore } from './store'
import TimelineTab from './Timeline'
import type { GameEvent } from './types'
import type { Ctx } from './ui'
import { MyGachas, Patches } from './Views'

type Tab = 'timeline' | 'mine' | 'patches'
const TABS: [Tab, string][] = [['timeline', 'Línea de tiempo'], ['mine', 'Mis gachas'], ['patches', 'Parches']]

interface InstallEvent extends Event { prompt(): Promise<void> }

const ago = (t?: number) => {
  if (!t) return 'sin sincronizar'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`
}

export default function App() {
  const [state, setState] = useStore()
  const { status, sync } = useAutoSync(state, setState)
  useImages(state)
  const [tab, setTab] = useState<Tab>(() => (state.tracked.length ? 'timeline' : 'mine'))
  const [now, setNow] = useState(Date.now())
  const [selected, setSelected] = useState<GameEvent | null>(null)
  const [closing, setClosing] = useState(false)
  const [installEv, setInstallEv] = useState<InstallEvent | null>(null)

  // El fondo no se desplaza mientras hay un modal abierto.
  useEffect(() => {
    document.documentElement.style.overflow = selected ? 'hidden' : ''
    return () => { document.documentElement.style.overflow = '' }
  }, [selected])

  useEffect(() => {
    const down =(e: PointerEvent) => { lastPointer.x = e.clientX; lastPointer.y = e.clientY }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEv(e as InstallEvent) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  // Avisos: al abrir, cada minuto, y copia para el service worker.
  useEffect(() => {
    mirrorAlerts(state)
    fireDue(state)
    const t = setInterval(() => fireDue(state), 60_000)
    return () => clearInterval(t)
  }, [state])

  const games = useMemo(() => [...CATALOG, ...state.customGames], [state.customGames])
  const open = useCallback((e: GameEvent) => { setClosing(false); setSelected(e) }, [])
  const close = useCallback(() => { setClosing(true); setTimeout(() => { setSelected(null); setClosing(false) }, 230) }, [])
  const ctx: Ctx = { state, setState, games, now, gameOf: id => games.find(g => g.id === id), open }

  /** Cambios de pestaña/vista con transición suave del navegador (View Transitions), si existe. */
  const transition = useCallback((fn: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return }
    doc.startViewTransition(() => { flushSync(fn); window.scrollTo({ top: 0, behavior: 'instant' }) })
  }, [])
  useEffect(() => { if ('startViewTransition' in document) document.documentElement.classList.add('has-vt') }, [])
  // El modal debe reflejar el estado más reciente (p. ej. "completado").
  const current = selected ? state.events.find(e => e.id === selected.id) ?? selected : null
  const goMine = () => transition(() => setTab('mine'))

  return (
    <div className="app">
      <div className="aurora" aria-hidden />
      <header>
        <div className="brand"><img className="logo" src="/logo.webp" alt="" width="40" height="40" /><h1>WhenGacha</h1></div>
        <nav>
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => transition(() => setTab(id))}>{label}</button>)}
        </nav>
        <div className="head-actions">
          <button className={`btn sm ${status.busy ? 'busy' : ''}`} onClick={() => sync(true)} title="Sincronizar ahora">
            <span className={status.busy ? 'spin on' : 'spin'}>⟳</span> {status.busy ? 'Sincronizando' : ago(Math.max(0, ...Object.values(state.synced)))}
          </button>
          {installEv && <button className="btn sm primary" onClick={() => installEv.prompt()}>⭳ Instalar app</button>}
        </div>
      </header>
      {status.error && <div className="banner-err">{status.error}. Se muestran los últimos datos guardados.</div>}
      <main key={tab}>
        {tab === 'timeline' && <TimelineTab {...ctx} goMine={goMine} transition={transition} />}
        {tab === 'mine' && <MyGachas ctx={ctx} sync={sync} syncing={status.busy} />}
        {tab === 'patches' && <Patches {...ctx} goMine={goMine} />}
      </main>
      {current && <EventModal {...ctx} event={current} closing={closing} onClose={close} />}
    </div>
  )
}
