import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import { CATALOG } from './catalog'
import EventModal, { lastPointer } from './EventModal'
import { t, useLang } from './i18n'
import { useImages } from './images'
import LangSwitch from './LangSwitch'
import { fireDue, mirrorAlerts } from './notify'
import { useAutoSync, useStore } from './store'
import TimelineTab from './Timeline'
import type { GameEvent } from './types'
import type { Ctx } from './ui'
import { MyGachas, Patches } from './Views'

type Tab = 'timeline' | 'mine' | 'patches'
const TABS: [Tab, 'tab.timeline' | 'tab.mine' | 'tab.patches'][] = [['timeline', 'tab.timeline'], ['mine', 'tab.mine'], ['patches', 'tab.patches']]

interface InstallEvent extends Event { prompt(): Promise<void> }

const ago = (ts?: number) => {
  if (!ts) return t('ago.never')
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? t('ago.now') : m < 60 ? t('ago.min', { n: m }) : t('ago.hour', { n: Math.round(m / 60) })
}

export default function App() {
  useLang() // vuelve a dibujar toda la interfaz al cambiar de idioma
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
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
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
    const timer = setInterval(() => fireDue(state), 60_000)
    return () => clearInterval(timer)
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
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => transition(() => setTab(id))}>{t(label)}</button>)}
        </nav>
        <div className="head-actions">
          <LangSwitch />
          <button className={`btn sm ${status.busy ? 'busy' : ''}`} onClick={() => sync(true)} title={t('sync.title')}>
            <span className={status.busy ? 'spin on' : 'spin'}>⟳</span> {status.busy ? t('sync.busy') : ago(Math.max(0, ...Object.values(state.synced)))}
          </button>
          {installEv && <button className="btn sm primary" onClick={() => installEv.prompt()}>{t('install')}</button>}
        </div>
      </header>
      {status.failed && <div className="banner-err">{t('sync.failed', { games: status.failed.join(', ') })}</div>}
      <main key={tab}>
        {tab === 'timeline' && <TimelineTab {...ctx} goMine={goMine} transition={transition} />}
        {tab === 'mine' && <MyGachas ctx={ctx} sync={sync} syncing={status.busy} />}
        {tab === 'patches' && <Patches {...ctx} goMine={goMine} />}
      </main>
      {current && <EventModal {...ctx} event={current} closing={closing} onClose={close} />}
    </div>
  )
}
