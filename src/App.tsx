import './install' // registra el evento de instalación al cargar (el botón está en los ajustes de avisos)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ConsentBanner from './ConsentBanner'
import { consentEnabled, reopenConsent } from './ads'
import { flushSync } from 'react-dom'
import './App.css'
import { CATALOG } from './catalog'
import EventModal, { lastPointer } from './EventModal'
import { t, useLang } from './i18n'
import { useImages } from './images'
import LangSwitch from './LangSwitch'
import SkinPicker from './skins/SkinPicker' // skins (prueba): para quitarlas, ver src/skins/README.md
import SupporterBadge from './skins/SupporterBadge' // skins
import { useKofiUrl } from './skins/premium' // skins
import { fireDue, mirrorAlerts } from './notify'
import { useAutoSync, useStore } from './store'
import TimelineTab from './Timeline'
import type { GameEvent } from './types'
import type { Ctx } from './ui'
import { MyGachas, Patches } from './Views'
import { Planner } from './Planner'
import { estimatedEvents } from './pullPlan'
import { withServers } from './servers'

/** Donación de PayPal: solo si el servidor no tiene KOFI_URL (el botón del pie usa Ko-fi cuando la hay). Déjalo vacío para ocultar el botón. */
/** Servidor de Discord de la comunidad (botón del pie). */
const DISCORD_URL = 'https://discord.gg/zz3XtbTrqP'
const DONATE_URL = 'https://www.paypal.com/donate/?business=amadeusmaho45%40gmail.com&item_name=WhenGacha&currency_code=USD'

type Tab = 'timeline' | 'mine' | 'patches' | 'pulls'
const TABS: [Tab, 'tab.timeline' | 'tab.mine' | 'tab.patches' | 'tab.pulls'][] = [['timeline', 'tab.timeline'], ['mine', 'tab.mine'], ['patches', 'tab.patches'], ['pulls', 'tab.pulls']]

const ago = (ts?: number) => {
  if (!ts) return t('ago.never')
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? t('ago.now') : m < 60 ? t('ago.min', { n: m }) : m < 48 * 60 ? t('ago.hour', { n: Math.round(m / 60) }) : t('ago.day', { n: Math.round(m / 1440) })
}

export default function App() {
  useLang() // vuelve a dibujar toda la interfaz al cambiar de idioma
  const [state, setState] = useStore()
  const { status, sync } = useAutoSync(state, setState)
  useImages(state)
  const donateUrl = useKofiUrl() || DONATE_URL // skins: sin ellas, deja solo DONATE_URL
  const [tab, setTab] = useState<Tab>(() => (state.tracked.length ? 'timeline' : 'mine'))
  const navRef = useRef<HTMLElement>(null)
  // Coloca el indicador bajo la pestaña activa; se recalcula al cambiar de pestaña, de idioma (otro ancho) o de tamaño de ventana.
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const place = () => {
      const b = nav.querySelector<HTMLElement>('button.on')
      if (!b) return
      nav.style.setProperty('--ind-x', `${b.offsetLeft}px`)
      nav.style.setProperty('--ind-w', `${b.offsetWidth}px`)
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(nav)
    return () => ro.disconnect()
  })
  const [now, setNow] = useState(Date.now())
  const [selected, setSelected] = useState<GameEvent | null>(null)
  const [closing, setClosing] = useState(false)
  // Juego al que ir al abrir la línea de tiempo (desde "Mis gachas").
  const [focusGame, setFocusGame] = useState<string>()

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

  // Avisos: al abrir, cada minuto, y copia para el service worker.
  const games = useMemo(() => [...CATALOG, ...state.customGames], [state.customGames])
  // Horas llevadas al servidor que eligió el jugador en cada juego (servers.ts). Todo lo que se ve y los avisos usan esta copia.
  const served = useMemo(() => withServers(state, games), [state, games])

  useEffect(() => {
    mirrorAlerts(served)
    fireDue(served)
    const timer = setInterval(() => fireDue(served), 60_000)
    return () => clearInterval(timer)
  }, [served])

  const open = useCallback((e: GameEvent) => { setClosing(false); setSelected(e) }, [])
  const close = useCallback(() => { setClosing(true); setTimeout(() => { setSelected(null); setClosing(false) }, 230) }, [])
  // Reinicios estimados de los modos de dificultad (pullPlan.ts, estimatedEvents): se ven en la línea de tiempo y la calculadora los cuenta
  // como temporadas conocidas. No se guardan en el estado (se recalculan), así una sincronización nunca los mezcla con los datos reales.
  const hour = Math.floor(now / 3_600_000)
  const estimated = useMemo(() => [...new Set(state.tracked)].flatMap(id => { const g = games.find(x => x.id === id); return g ? estimatedEvents(g, served.events, hour * 3_600_000) : [] }),
    [state.tracked, served.events, games, hour])
  const view = useMemo(() => (estimated.length ? { ...served, events: [...served.events, ...estimated] } : served), [served, estimated])
  const ctx: Ctx = { state: view, setState, games, now, gameOf: id => games.find(g => g.id === id), open }

  /** Cambios de pestaña/vista con transición suave del navegador (View Transitions), si existe. */
  const transition = useCallback((fn: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return }
    doc.startViewTransition(() => { flushSync(fn); window.scrollTo({ top: 0, behavior: 'instant' }) })
  }, [])
  useEffect(() => { if ('startViewTransition' in document) document.documentElement.classList.add('has-vt') }, [])
  // El modal debe reflejar el estado más reciente (p. ej. "completado").
  const current = selected ? view.events.find(e => e.id === selected.id) ?? selected : null
  const goMine = () => transition(() => setTab('mine'))
  const goGame = (id: string) => transition(() => { setFocusGame(id); setTab('timeline') })

  return (
    <div className="app">
      <div className="aurora" aria-hidden />
      <header>
        <div className="brand"><img className="logo" src="/logo.webp" alt="" width="40" height="40" /><h1>WhenGacha</h1><SupporterBadge /> {/* skins */}</div>
        <nav ref={navRef}>
          {/* Indicador que se desliza bajo la pestaña activa (posición medida en useLayoutEffect). */}
          <span className="nav-ind" aria-hidden />
          {/* Con cuatro pestañas, en móvil "Línea de tiempo" se acorta a "Línea" (App.css, .tab-short) para que quepan con cualquier skin. */}
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => transition(() => setTab(id))}>
            {id === 'timeline' ? <><span className="tab-full">{t(label)}</span><span className="tab-short">{t('tab.timelineShort')}</span></> : t(label)}
          </button>)}
        </nav>
        <div className="head-actions">
          <SkinPicker timeline={tab === 'timeline'} donateUrl={donateUrl} /> {/* skins */}
          <LangSwitch />
          <button className={`btn sm ${status.busy ? 'busy' : ''}`} onClick={() => sync(true)} title={t('sync.title')}>
            <span className={status.busy ? 'spin on' : 'spin'}>⟳</span> <span className="sync-t">{status.busy ? t('sync.busy') : ago(Math.max(0, ...Object.values(state.synced)))}</span>
          </button>
        </div>
      </header>
      {status.failed && <div className="banner-err">{t('sync.failed', { games: status.failed.map(name => { const g = games.find(x => x.name === name); const ts = g && state.synced[g.id]; return ts ? `${name} (${ago(ts)})` : name }).join(', ') })}</div>}
      <main key={tab}>
        {tab === 'timeline' && <TimelineTab {...ctx} goMine={goMine} transition={transition} focusGame={focusGame} onFocused={() => setFocusGame(undefined)} />}
        {tab === 'mine' && <MyGachas ctx={ctx} goGame={goGame} />}
        {tab === 'patches' && <Patches {...ctx} goMine={goMine} />}
        {tab === 'pulls' && <Planner {...ctx} goMine={goMine} />}
      </main>
      <footer className="site-foot">
        <span>© WhenGacha</span>
        <a href="/acerca.html">{t('footer.about')}</a>
        <a href="/privacidad.html">{t('footer.privacy')}</a>
        {consentEnabled && <button className="linkbtn" onClick={reopenConsent}>{t('consent.settings')}</button>}
        <a className="btn sm discord" href={DISCORD_URL} title={t('footer.discordTip')} target="_blank" rel="noopener noreferrer">{t('footer.discord')}</a>
        {donateUrl && <a className="btn sm donate" href={donateUrl} title={t('footer.donateTip')} target="_blank" rel="noopener noreferrer">{t('footer.donate')}</a>}
        {donateUrl && <span className="donate-note">{t('footer.donateNote')}</span>}
      </footer>
      <ConsentBanner />
      {current && <EventModal {...ctx} event={current} closing={closing} onClose={close} />}
    </div>
  )
}
