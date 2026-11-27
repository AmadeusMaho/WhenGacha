import { useSyncExternalStore } from 'react'
import { isSupporter, subscribe, useSupporter } from './premium'

/**
 * Skins del sitio (prototipo, 9 nov 2026): cambian TODO el aspecto (botones, paneles, línea de tiempo, cursor…) al estilo de un gacha.
 * Cada skin es una hoja CSS de esta carpeta que solo aplica con <html data-skin="<id>"> y usa recursos de public/skins/<id>/.
 * Todo vive aquí; para quitarlas, ver README.md al lado. Se guarda aparte del estado de la app (`whengacha:skin`).
 * (Antes hubo temas "Negro OLED" y "Colores"; se quitaron.)
 */
export interface SkinDef {
  id: string
  /** Juego del catálogo (para el icono del selector). */
  game: string
  name: string
  /** Fuentes de Google Fonts que usa (familias con sus pesos, formato css2). */
  fonts?: string
  /** Fondo animado de la línea de tiempo: vídeo (sin audio) y su fotograma fijo (ahorro de datos, "reducir movimiento", vídeo bloqueado).
   *  Con una lista, cada pestaña (y cada visita) usa el siguiente (LiveWallpaper.tsx; desde el 15 nov 2026 en todas las pestañas y todas las skins). */
  live?: LiveClip | LiveClip[]
  /** Fondo propio de una pestaña en lugar de los de `live` (id de la pestaña: timeline, mine, patches, pulls). PGR: en "Mis gachas" el arte
   *  de inicio de sesión del juego, quieto (petición del dueño, 15 nov 2026). */
  tabLive?: Record<string, LiveClip | LiveClip[]>
}

/** Un fondo de la línea de tiempo: vídeo con su fotograma fijo, o solo una imagen (`poster`), que se mueve despacio. */
export interface LiveClip {
  video?: string
  poster: string
  /** URL original en la web oficial (para no repetirlo si /data/skin-live.json trae el mismo; ver liveFeed.ts). */
  official?: string
  /** Fondo fijo de verdad: sin el recorrido de cámara ni las motas de luz de los fondos sin vídeo. */
  fixed?: boolean
}

/** Fondos fijos (sin vídeo, se mueven despacio) de public/skins/<skin>/still-*.webp. */
const stills = (skin: string, names: string[]): LiveClip[] => names.map(n => ({ poster: `/skins/${skin}/still-${n}.webp` }))

/*
 * Fondos animados en Cloudflare R2 (11 nov 2026): el despliegue tiene un límite de 20 MB y los vídeos no caben en public/.
 * Bucket `whengacha-fondos` (URL pública r2.dev); cada nombre de FONDOS es `<skin>/live-<nombre>.mp4` en el bucket (copia local en
 * ../fondos-skins/r2/). Su fotograma fijo `live-<nombre>.webp` (~45 KB) va en public/skins/<skin>/: es el póster, el fondo con "ahorro de datos"
 * y el de reserva si R2 no responde (LiveWallpaper.tsx). Ver README, "Fondos en R2". Créditos de los de fans: public/acerca.html.
 * Para añadir o quitar fondos: la app de fondos local del dueño (scripts/fondos/abrir.cmd; no está en el repositorio).
 */
export const LIVE_CDN = 'https://pub-f0ae309961c44cf990b8708e645b1aa8.r2.dev'
// <fondos> (lo edita la app de fondos local; se puede tocar a mano manteniendo este formato)
export const FONDOS: Record<string, string[]> = {
  wuwa: [
    'iuno-moonlight-lantern', 'suisui-yangyang-xuanling-lotus-lanterns', 'suoming', 'hiyuki-entrust-your-wishes-to-me',
    'qingxiao-sword-riding', 'changli-autumn-umbrella', 'mornye-sofa-chilling', 'aemeath-cherry-blossom', 'aemeath-neon-rain',
    'hsin-moon-fox', 'jingran-underworld', 'denia-celestial-sea', 'yangyang', 'hiyuki-sakura', 'aemeath-x-rover', 'augusta-broadblade',
    'chisa-kumokiri', 'cartethyia-and-adanto', 'phrolova', 'the-shorekeeper-cosmic-meadow', 'shorekeeper-flower-butterflies',
    'yangyang-x-rover'
  ],
  genshin: [
    'columbina-blue-flower-fields', 'arlecchino-crimson-moon', 'bride-furina', 'hu-tao-mid-autumn-festival', 'sea-of-flowers',
    'yae-miko-sakura-sunset', 'aether-vs-ronova-boss-fight', 'columbina-luminous-moon', 'lonely-ganyu-in-the-rain', 'sumeru', 'ronova',
    'clorinde', 'genshin-impact', 'zhongli-and-hu-tao', 'raiden-ei-x-raiden-makoto', 'kamisato-ayaka-cherry-blossom',
    'xiao-lanterns-on-the-full-moon-night', 'klee-trip', 'aether-and-paimon'
  ],
  zzz: [
    'v33', 'claret-and-roxy', 'remielle-dan', 'yuzuha-x-alice', 'yixuan', 'yidhari', 'hoshimi-miyabi', 'ye-shunguang', 'vivian-x-hugo',
    'billy-kid-s-rank', 'angels-of-delusion-livestream', 'yuzuha', 'astra-yao', 'yanagi', 'burnice-white-burning-desires',
    'zenless-zone-zero', 'grace', 'roxy', 'ellen', 'dj-remielle-wise', 'vivian-banshee'
  ],
  hsr: [
    'chibi-stelle-black-hole', 'evanescia', 'acheron-crimson-lotus', 'acheron-black-hole', 'sparkle-trash-can-dance', 'sparxie-yao-guang',
    'galaxy-ranger-acheron', 'castorice-river-flower', 'honkai-star-rail-phainon', 'astral-express', 'cyrene-the-starry-muse', 'stellaron',
    'cyrene', 'phainon', 'castorice', 'firefly-sunset-city', 'jing-yuan', 'kafka-in-the-rain', 'ruan-mei-cherry-blossom', 'huohuo',
    'silver-wolf-and-kafka', 'jingliu-moon-night', 'mommy-kafka'
  ],
  nikke: [
    'sin', 'coins', 'phantom', 'heaven', 'absolute', 'sphere', 'arcane', 'blankticket', 'boomtheghost', 'colorless', 'for-rest',
    'goddessfall', 'goninjathief', 'ice-dragon-saga', 'jinx-player', 'juvenile-days', 'lifeagain', 'new-flavor', 'old-tales',
    'romantic-valentine', 'secret-garden', 'summer', 'terminusticket', 'wisdom-spring', 'red-hood-goddess-of-victory',
    'nikke-goddess-of-victory'
  ],
  uma: [],
  arknights: [
    'spark-in-the-eyes-exusiai', 'skadi-blood-moon-ocean', 'mizuki-and-caerula-arbor', 'kaltsit-esperanta', 'mon3tr', 'texas-x-exusiai',
    'lappland-x-texas', 'amiya-midnight-blue-city', 'collapse', 'melantha', 'amiya-stellar-valkyrie', 'exusiai', 'frostnova',
    'texas-the-omertosa', 'skadi-the-corrupting-heart', 'dusk', 'nian', 'coral-coast', 'pc-desktop-candle-knight-desktop',
    'pc-amiya-in-apartment-free', 'angelina-hd'
  ],
  bluearchive: [
    'misono-mika-angel-wings', 'ushio-noa-starlight-float', 'yutori-natsu', 'iroha-sunset-summer', 'tendou-arisu-maid', 'mutsuki',
    'hina-demon-queen', 'arona-cloudscape', 'arona-ruined-classroom', 'hina-cosmic-nocturne-piano', 'tsukatsuki-rio', 'shiroko-terror',
    'hinomiya-chinatsu-shy', 'misono-mika-angel', 'waraku-chise-moonlit-night-sky', 'kasumizawa-miyu-sniper', 'ajitani-hifumi-summer',
    'sorasaki-hina-piano', 'chise-swimsuit', 'izuna-swimsuit', 'wakamo', 'ako'
  ],
  pgr: [
    'adelyde-anabasis', 'kurumi-x-adelyde', 'lucia-pyroath-under-tree', 'hanying-autumn-tree', 'nier-automata-x-pgr',
    'bianca-stigmata-floating', 'lamia-mermaid', 'solitary-dream-bianca-stigmata', 'lucia-crimson-abyss-apocalyptic-cyan',
    'liv-solaeter-special-coating', 'selena-phantom', 'nanami-pulse-tide-heart-view', 'lucia-snowfall', 'lucia', 'selena-lunar-elegance',
    'bianca', 'luna', 'luna-oblivion', 'nirvatia-wings-of-stillness', 'lucia-celestial-reverie', 'nirvatia'
  ],
  fgo: [
    'saber-cloudy-vortex-fate-series', 'emiya-archer-unlimited-blade-works-fate-stay-night', 'rin-and-archer-fishing-fate-stay-night',
    'jeanne-darc-and-jeanne-alter', 'king-hassan', 'jeanne-darc-alter', 'saber-alter-vs-berserker-fate-stay-night-heavens-feel-ii-los',
    'jack-the-ripper-fate-apocrypha', 'lancer', 'mashu-kyrielight-with-glasses', 'katsushika-hokusai',
    'saber-alter-fate-stay-night-heaven-s-feel', 'cool-fate-zero-saber-king-arthur-artoria-pendragon-4k-live-w', 'pc-ishtar',
    '4k-fate-stay-night', 'archer-fate-stay-night', 'pc-flames', 'fate-grand-order-anime-sitonai-girl', 'okita-souji',
    'mashu-kyrielight-fate', 'mash-kyrielight', 'oda-nobunaga-fate'
  ],
  navidad: [
    'christmas-trees', 'anime-christmas', 'genshin-christmas'
  ],
}
// </fondos>

/** Fondos que son la portada oficial de una versión (para no repetirlos si /data/skin-live.json trae el mismo; ver liveFeed.ts). */
const OFFICIAL: Record<string, string> = {
  'zzz/v33': 'https://act-webstatic.hoyoverse.com/puzzle/zzz/pz_ZYBGoSIMEV/resource/puzzle/2026/10/14/ef6f80c3ae7410ca14fd4d77571450ec_1154396356221499835.mp4',
}
const cdn = (skin: string): LiveClip[] => (FONDOS[skin] ?? []).map(n => ({
  video: `${LIVE_CDN}/${skin}/live-${n}.mp4`, poster: `/skins/${skin}/live-${n}.webp`, official: OFFICIAL[`${skin}/${n}`],
}))

/**
 * Fondos de temporada de la skin base (Festive.tsx): `FONDOS.navidad`, que el dueño llena con Wallpaureka como los de cualquier skin ("Navidad
 * (skin estándar)"). Vacío = la skin base sigue con su degradado de siempre.
 */
export const seasonBackgrounds = (id: string): LiveClip[] => cdn(id)

/*
 * Fondos de la línea de tiempo (ver README, "Fondos de la línea de tiempo"). Cada visita a la pestaña muestra el siguiente.
 * NIKKE: los live wallpapers oficiales de nikke-en.com/art.html. WuWa, Genshin, HSR y ZZZ: animaciones de fans de MoeWalls/Steam
 * Workshop elegidas por el dueño. ZZZ conserva `still-sofa` y Uma sus fondos fijos (`stills`).
 */
export const SKINS: SkinDef[] = [
  { id: 'wuwa', game: 'wuwa', name: 'Wuthering Waves', fonts: 'family=Sora:wght@400;500;600;700&family=Barlow:wght@400;500;600;700', live: cdn('wuwa') },
  // Prueba local con piezas de interfaz del Drive "UI Assets" (genshin.css).
  { id: 'genshin', game: 'genshin', name: 'Genshin Impact', fonts: 'family=M+PLUS+Rounded+1c:wght@500;700;800', live: cdn('genshin') },
  // Prueba local (zzz.css) con assets oficiales de skowt.cc en public/skins/zzz/ y cursor propio (ver README).
  { id: 'zzz', game: 'zzz', name: 'Zenless Zone Zero', fonts: 'family=Rubik:wght@500;600;700;800;900', live: [...cdn('zzz'), ...stills('zzz', ['sofa'])] },
  // hsr.css (3.ª versión): galaxia en CSS, paneles de cristal y el motivo de la vía; cursor del juego (ver README).
  { id: 'hsr', game: 'hsr', name: 'Honkai: Star Rail', fonts: 'family=Barlow:wght@400;500;600;700', live: cdn('hsr') },
  // Prueba local (nikke.css) con fondo y galones de la web oficial en public/skins/nikke/ (ver README); sin cursor propio.
  { id: 'nikke', game: 'nikke', name: 'NIKKE', fonts: 'family=Saira+Semi+Condensed:wght@400;500;600;700', live: cdn('nikke') },
  // Prueba local (uma.css) con piezas de interfaz del zip "Umamusume UI sprites" y el cursor del juego en public/skins/uma/ (ver README).
  { id: 'uma', game: 'uma', name: 'Umamusume', fonts: 'family=M+PLUS+Rounded+1c:wght@500;700;800', live: [...cdn('uma'), ...stills('uma', ['kv', 'stadium', 'race'])] },
  // arknights.css (3.ª versión): piezas de interfaz y fuentes de la extracción del cliente en public/skins/arknights/.
  { id: 'arknights', game: 'arknights', name: 'Arknights', fonts: 'family=Barlow:wght@400;500;600;700', ...(FONDOS.arknights?.length ? { live: cdn('arknights') } : {}) },
  // bluearchive.css (13 nov 2026): piezas de los atlas de interfaz que aportó el dueño en public/skins/bluearchive/ (ver la cabecera del CSS).
  // Fondos animados de fans (MoeWalls…) que elige el dueño con Wallpaureka (22, 13 nov 2026); en todas las pestañas, uno distinto en cada una.
  { id: 'bluearchive', game: 'bluearchive', name: 'Blue Archive', fonts: 'family=Noto+Sans+JP:wght@400;500;700&family=Exo+2:ital,wght@1,700;1,800', ...(FONDOS.bluearchive?.length ? { live: cdn('bluearchive') } : {}) },
  // pgr.css (15 nov 2026): piezas y retratos del cliente (explorador público de assets.huaxu.app) en public/skins/pgr/. Sus fondos animados los
  // añade el dueño con Wallpaureka (FONDOS.pgr); mientras esté vacío, lleva el arte de la pantalla de inicio de sesión del juego.
  { id: 'pgr', game: 'pgr', name: 'Punishing: Gray Raven', fonts: 'family=Barlow+Condensed:wght@500;600;700;800&family=Rajdhani:wght@500;600;700&family=Barlow:wght@400;500;600;700', live: FONDOS.pgr?.length ? cdn('pgr') : stills('pgr', ['login']),
    tabLive: { mine: { poster: '/skins/pgr/still-login.webp', fixed: true } } },
  // fgo.css (16 nov 2026): piezas de interfaz del Drive de assets de FGO que aportó el dueño, en public/skins/fgo/ (ver la cabecera del CSS).
  // Fondos animados: los 22 que eligió el dueño (MoeWalls, WallpaperWaifu, DesktopHut y MotionBGs), publicados con Wallpaureka (16 nov 2026).
  // Si FONDOS.fgo se vaciara, fondos fijos de Chaldea del mismo Drive (CHALDEAS, Rayshift, pasillo, taller de Da Vinci y el exterior). En "Mis gachas", My Room, quieta.
  { id: 'fgo', game: 'fgo', name: 'Fate/Grand Order', fonts: 'family=Cinzel:wght@600;700;800&family=Noto+Sans+JP:wght@400;500;700', live: FONDOS.fgo?.length ? cdn('fgo') : stills('fgo', ['chaldeas', 'rayshift', 'corridor', 'workshop', 'chaldea']),
    tabLive: { mine: { poster: '/skins/fgo/still-myroom.webp', fixed: true } } },
]

const KEY = 'whengacha:skin'
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* solo para esta visita */ } },
}
// Restos del sistema anterior de códigos "WG-…" (se podían publicar): se borran y ya no desbloquean nada.
store.set('whengacha:supporter', null)

// Las skins son de WhenGacha Premium (premium.ts): sin sesión de apoyo no se aplica ninguna.
let current = (() => { const raw = store.get(KEY); return isSupporter() && raw && SKINS.some(s => s.id === raw) ? raw : null })()

const listeners = new Set<() => void>()

export function setSkin(id: string | null) {
  if (id && !isSupporter()) return
  current = id
  store.set(KEY, id)
  applySkin(id)
  listeners.forEach(l => l())
}

const sub = (cb: () => void) => { listeners.add(cb); const off = subscribe(cb); return () => { listeners.delete(cb); off() } }
export const useSkin = (): string | null => useSyncExternalStore(sub, () => current)
// Si se cierra la sesión (o la anulan), vuelve la vista original.
subscribe(() => { if (current && !isSupporter()) { current = null; applySkin(preview) } })
export { useSupporter }

/*
 * Vista previa: sin Premium, cualquiera puede ver una skin puesta en la web para decidir si le gusta. Es temporal: no se guarda
 * (desaparece al recargar o al salir) y la barra de abajo lo deja claro. Si activa Premium durante la vista previa, se queda con esa skin.
 */
let preview: string | null = null
export const usePreview = (): string | null => useSyncExternalStore(sub, () => preview)

export function startPreview(id: string) {
  if (!SKINS.some(s => s.id === id)) return
  preview = id
  applySkin(id)
  listeners.forEach(l => l())
}

export function endPreview() {
  if (!preview) return
  preview = null
  applySkin(current)
  listeners.forEach(l => l())
}

subscribe(() => {
  if (preview && isSupporter()) { const keep = preview; preview = null; setSkin(keep) }
})

/** Pone `data-skin` en <html> y carga sus fuentes. Sin skin, no deja nada. */
export function applySkin(id: string | null) {
  const root = document.documentElement
  const def = SKINS.find(s => s.id === id)
  if (def) root.setAttribute('data-skin', def.id)
  else root.removeAttribute('data-skin')
  if (def?.fonts && !document.getElementById(`skin-font-${def.id}`)) {
    const link = Object.assign(document.createElement('link'), { id: `skin-font-${def.id}`, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${def.fonts}&display=swap` })
    document.head.appendChild(link)
  }
}

applySkin(current)
