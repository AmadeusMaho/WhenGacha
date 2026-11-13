import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Lang } from '../i18n'

/**
 * Música de cada skin (13 nov 2026): un botón junto al pincel (solo con una skin puesta) abre un mini-reproductor de YouTube flotante con la
 * banda sonora OFICIAL del juego. Empieza cerrado (sin sonido); al cerrarlo, la música para.
 *
 * Por qué así (normas de la API de YouTube para desarrolladores): el reproductor tiene que verse mientras suena (mínimo 200×200 px, y se usa
 * justo ese tamaño), no se puede ocultar ni separar el audio del vídeo, así que nunca queda sonando "de fondo" sin la ventana. Solo canales
 * oficiales (el del estudio, los "- Topic" que YouTube genera de su distribuidora, el compositor oficial o el sello), comprobados con oEmbed
 * (un vídeo o una lista con la inserción desactivada responde 401). `youtube-nocookie.com`: sin cookies hasta que se reproduce.
 *
 * Dos modos (botón ★/🔀 de la ventanita; se recuerda):
 *  - "Toda la banda sonora" (por defecto): una LISTA OFICIAL del juego en orden aleatorio. La mantiene el propio estudio, así que las
 *    canciones nuevas entran solas, sin tocar esto. Wuthering Waves no tiene lista oficial (solo de fans): sus 20 pistas más vistas del canal
 *    oficial "Wuthering Waves - Topic", barajadas aquí.
 *  - "Populares": las 4 subidas oficiales más vistas del juego, de más a menos vistas.
 * Para cambiar la música de una skin basta con tocar su entrada de `MUSIC`: `list` (id de una lista oficial, "PL…") o `ids` (vídeos sueltos).
 */
type Source = { list: string } | { ids: string[] }
const MUSIC: Record<string, { top: string[]; all: Source }> = {
  genshin: {
    // La vaguelette (HOYO-MiX, 16,5 M visitas), Nod-Krai Main Theme Live (canal Genshin Impact, 16,4 M), Flares of the Blazing Sun (10 M), Main Theme.
    top: ['lm3t3myPspk', 'RuXa_yxZMGI', 'o4ne1Xzp8m8', 'EEYMlUVKmyE'],
    all: { list: 'PLdni05PnuscvEM17RtWoy1jraPhumpdjV' }, // "原神OST" del canal oficial japonés (原神-Genshin-公式), 110 pistas
  },
  hsr: {
    // WHITE NIGHT (canal Honkai: Star Rail, 31,6 M), Wildfire (HOYO-MiX, 21,7 M), Hope Is the Thing With Feathers (19,3 M), Sway to My Beat in Cosmos (14,5 M).
    top: ['U7W8QR9fsFw', 'SxlW79tDhCA', 'aPyt41nnM0k', 'npyiiInMA0w'],
    all: { list: 'PLi18Roijwy3PjC4rvb6W8fq5HFFvhPV_8' }, // "Honkai: Star Rail - EP" del canal oficial
  },
  zzz: {
    // MoeChakkaFire (MV oficial de issey con HoYoFair, 108 M), ZENLESS – Tiësto (canal ZZZ, 20 M), Come Alive (Sān-Z, 11,7 M), Burning Desires (10 M).
    top: ['wZlv3qDPfjk', 'GkgtQOlJp0Y', 'R3tZmmiKi0o', 'LCo0KdbVIJM'],
    all: { list: 'PL_DB7Cdpj4lLd9yDVGlLpMf6-VGIvKFJf' }, // "MV" del canal oficial de Zenless Zone Zero
  },
  wuwa: {
    // Wuthering Waves - Topic (KURO GAMES): With Glory I Shall Fall (11,1 M), Against the Tide (8,7 M), Voyaging Star's Farewell (7,5 M), Ode to the Nameless Martyr (4,2 M).
    top: ['4ZKgq7Aw34s', 'Yr1RlcoqXTg', '0HrdRGuF2Y8', 'AuMcCiwNazo'],
    // Sin lista oficial: las 20 más vistas de "Wuthering Waves - Topic" (13 nov 2026).
    all: { ids: ['4ZKgq7Aw34s', 'Yr1RlcoqXTg', '0HrdRGuF2Y8', 'AuMcCiwNazo', 'Gp0Jbhu0FWA', '0hC73MsFBv8', 'Vd_zk_wj9b0', 'mWxP-sQmNMU', 'bPS8Ii6Ef14', 'nl_vdjf-jM0',
      'Lixpftlm0Eo', 'Se95CIbDWLc', 'eyb1h5LVHhg', '0gSyy50n6vc', '7nwzaBOmiYc', 'fL-izkjgm14', 'omUQ53VQwUw', 'uQLzhisQtgo', '6Axc3ezh290', 'yb4Dm666vSU'] },
  },
  nikke: {
    // Cosmograph (compositor oficial): THE REDHOOD (3,3 M), Stronghold Land Eater (3,3 M), Goddess of Victory (3,2 M), Inferno of Nihilist (3,2 M).
    top: ['rErd6UAXgBU', 'lSt_6SiAUwo', 'hK_6T-LzdbE', 'MTogyN87-L4'],
    all: { list: 'PL1KsHejR9xB-a1PMEvlBlXbALTpF-Wwtv' }, // "[GODDESS OF VICTORY: NIKKE]" de Cosmograph, 307 pistas
  },
  uma: {
    // Topic de los personajes (distribución oficial): めにしゅき♡ラッシュっしゅ！ (9,8 M), BRIGHTEST HEART (8 M), うまぴょい伝説 (8 M), GIRLS' LEGEND U (3,9 M).
    top: ['8ULbYqRtlMQ', 'YExL2ilCMLs', 'VFOg6mHtZcA', 'G7RmGsHxv-Q'],
    all: { list: 'PLbRq7_wpPI8nZHTi9t6Hd5nAQN_gdIY4S' }, // "Winning Concert Video" del canal oficial en inglés, 22 canciones
  },
  arknights: {
    // Radiant (Monster Siren Records, 7,7 M), Speed of Light (DJ OKAWARI, 6,7 M), Operation Pyrite (5,7 M), Operation Blade (5,3 M).
    top: ['eImNc6AIViQ', 'L2LB12IxLDU', 'saOnB_CRG9Y', 'hpI5vMxYJ_k'],
    all: { list: 'PLbuSQ8SJFnFEHL4_T9S0whD-TevceJIsl' }, // "Arknights Official EP" de Arknights Official - Yostar, 156 pistas
  },
}

/** Skins con reproductor temático compacto (además de ZZZ, que tiene la tele): HSR funda de vinilo, Genshin pergamino, NIKKE el teléfono del
 *  comandante, WuWa panel holográfico, Arknights ficha de PRTS, Uma entrada del Winning Live. Las que no estén aquí usan la ventanita sencilla. */
const MINI = new Set(['hsr', 'genshin', 'nikke', 'wuwa', 'arknights', 'uma'])

type Mode = 'all' | 'top'
const TXT: Record<Lang, { open: string; close: string; title: string; side: string; all: string; top: string; allShort: string; topShort: string; mode: string }> = {
  es: { open: 'Música oficial del juego', close: 'Cerrar (para la música)', title: 'Banda sonora oficial', side: 'Cambiar de esquina',
    all: 'Toda la banda sonora oficial, en orden aleatorio', top: 'Las 4 canciones oficiales más vistas', allShort: 'Todas', topShort: 'Populares', mode: 'Qué música suena' },
  en: { open: "Game's official music", close: 'Close (stops the music)', title: 'Official soundtrack', side: 'Switch corner',
    all: 'The whole official soundtrack, shuffled', top: 'The 4 most viewed official songs', allShort: 'All', topShort: 'Popular', mode: 'What plays' },
  zh: { open: '游戏官方音乐', close: '关闭（停止音乐）', title: '官方原声', side: '切换角落',
    all: '全部官方原声，随机播放', top: '观看次数最多的 4 首官方歌曲', allShort: '全部原声', topShort: '热门', mode: '播放内容' },
}

/** Iconos del selector (trazo en `currentColor`: toman el color de cada skin). */
const SHUFFLE = <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21" /><path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4C15.1 7.5 16.1 7 17.5 7H21" /><path d="m18 4 3 3-3 3M18 14l3 3-3 3" />
</svg>
const STAR = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path fill="currentColor" d="m12 3.2 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z" /></svg>

const SIDE_KEY = 'whengacha:music-side'
const MODE_KEY = 'whengacha:music-mode'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* solo esta visita */ } }

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
const BASE = 'https://www.youtube-nocookie.com/embed/'
const COMMON = 'autoplay=1&rel=0&playsinline=1&loop=1'

/** URL del reproductor. Lista oficial: con la API de la ventana (`enablejsapi`) para barajarla al cargar (ver `onLoad`). */
function srcOf(m: { top: string[]; all: Source }, mode: Mode): string {
  if (mode === 'top') return `${BASE}${m.top[0]}?${COMMON}&playlist=${m.top.join(',')}`
  if ('list' in m.all) return `${BASE}videoseries?list=${m.all.list}&${COMMON}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
  const ids = shuffle(m.all.ids)
  return `${BASE}${ids[0]}?${COMMON}&playlist=${ids.join(',')}`
}

export default function SkinMusic({ skin, name, lang }: { skin: string; name: string; lang: Lang }) {
  const s = TXT[lang] ?? TXT.es
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'left' | 'right'>(() => (read(SIDE_KEY) === 'left' ? 'left' : 'right'))
  const [mode, setMode] = useState<Mode>(() => (read(MODE_KEY) === 'top' ? 'top' : 'all'))
  const frame = useRef<HTMLIFrameElement>(null)
  const m = MUSIC[skin]
  // Fijo mientras la ventana sigue abierta con el mismo modo (barajar en cada render recargaría el vídeo); al reabrir, otro orden.
  const src = useMemo(() => (m && open ? srcOf(m, mode) : ''), [m, mode, open])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])
  // Lista oficial barajada: cuando el reproductor avisa de que está listo, se activa el orden aleatorio y se salta a una pista al azar
  // (sin esto, siempre empezaría por la primera de la lista).
  useEffect(() => {
    if (!open || mode !== 'all' || !m || !('list' in m.all)) return
    let done = false
    const send = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
    const onMsg = (e: MessageEvent) => {
      if (done || e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let d: { event?: string; info?: { playlist?: string[] } } | null = null
      try { d = JSON.parse(e.data) } catch { return }
      const n = d?.info?.playlist?.length
      if (d?.event === 'onReady' || n) {
        done = true
        send('setShuffle', [true])
        send('playVideoAt', [n ? Math.floor(Math.random() * n) : 0])
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [open, mode, m])
  if (!m) return null
  const flip = () => { const n = side === 'right' ? 'left' : 'right'; setSide(n); write(SIDE_KEY, n) }
  const pick = (n: Mode) => { if (n !== mode) { setMode(n); write(MODE_KEY, n) } }
  // La ventana de YouTube pide que le digamos que escuchamos sus eventos para mandar "onReady".
  const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  const player = <iframe key={`${skin}:${mode}`} ref={frame} className="music-frame" src={src} title={`${s.title} · ${name}`} width="200" height="200" onLoad={listen}
    allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
  return (
    <>
      <button className={`btn sm lang-btn music-btn ${open ? 'on' : ''}`} onClick={() => setOpen(o => !o)} aria-pressed={open} title={s.open} aria-label={s.open}>
        {/* Nota centrada en su caja (x 6–18, y 3–21) y del tamaño del pincel (18 px), para que los dos botones midan lo mismo. */}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
      </button>
      {open && (skin === 'zzz' || MINI.has(skin)) && createPortal(
        /* ZZZ (13 nov 2026): el reproductor es la tele CRT de la pantalla de inicio del juego, dibujada solo con CSS. El vídeo va dentro
           de la pantalla a su tamaño (200×200) y sin nada encima (YouTube no deja taparlo): el cristal curvo y el brillo van en el marco.
           A la derecha, las dos ruedas son el selector de modo; abajo, el vídeo (VHS): encendido = cerrar, pantallita = título, ⇄ = esquina.
           Las demás skins de MINI reutilizan este HTML con otra silueta, compacta y sin mueble de tele (skins.css, "Temas compactos"):
           la primera versión les ponía a todas el mismo mueble y acababan pareciendo teles (13 nov 2026). */
        <div className={`music-dock tv ${skin === 'zzz' ? '' : 'tv-mini '}tv-${skin} ${side}`} role="region" aria-label={`${s.title} · ${name}`}>
          {skin !== 'zzz' && <span className="tv-deco" aria-hidden />}
          <div className="tv-set">
            <div className="tv-bezel"><div className="tv-screen">{player}</div></div>
            <div className="tv-side">
              <div className="tv-knobs" role="radiogroup" aria-label={s.mode}>
                {(['all', 'top'] as const).map(k => (
                  <button key={k} role="radio" aria-checked={mode === k} className={`tv-knob ${mode === k ? 'on' : ''}`} onClick={() => pick(k)} title={k === 'all' ? s.all : s.top}>
                    <i aria-hidden />{k === 'all' ? SHUFFLE : STAR}<span>{k === 'all' ? s.allShort : s.topShort}</span>
                  </button>
                ))}
              </div>
              <div className="tv-grille" aria-hidden />
            </div>
          </div>
          <div className="tv-deck">
            <button className="tv-power" onClick={() => setOpen(false)} title={s.close} aria-label={s.close}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 3v8" /><path d="M6.4 6.6a8 8 0 1 0 11.2 0" /></svg>
            </button>
            <div className="tv-slot" title={`${s.title} · ${name}`}><span>{name}</span></div>
            <button className="tv-eject" onClick={flip} title={s.side} aria-label={s.side}>⇄</button>
          </div>
        </div>,
        document.body,
      )}
      {open && skin !== 'zzz' && !MINI.has(skin) && createPortal(
        <div className={`music-dock ${side}`} role="region" aria-label={`${s.title} · ${name}`}>
          <div className="music-head">
            <span className="music-title" title={`${s.title} · ${name}`}><b>♪ {name}</b></span>
            <button className="music-ctl" onClick={flip} title={s.side} aria-label={s.side}>⇄</button>
            <button className="music-ctl" onClick={() => setOpen(false)} title={s.close} aria-label={s.close}>✕</button>
          </div>
          {/* Selector de modo: dos opciones con texto e icono propio (en el color de la skin), en vez de un solo botón con emoji. */}
          <div className="music-modes" role="radiogroup" aria-label={s.mode}>
            {(['all', 'top'] as const).map(k => (
              <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => pick(k)} title={k === 'all' ? s.all : s.top}>
                {k === 'all' ? SHUFFLE : STAR}<span>{k === 'all' ? s.allShort : s.topShort}</span>
              </button>
            ))}
          </div>
          {player}
        </div>,
        document.body,
      )}
    </>
  )
}
