/**
 * Próximos gachas: juegos aún sin lanzar (o sin lanzar en global). Lista CURADA A MANO, sin fuente automática:
 * las webs que mantienen calendarios (anigacha, hideoutgacha) prohíben el scraping y las demás no dan una API estable.
 * Se muestra en la pestaña Parches (`UpcomingGames` en Views.tsx). Guía de mantenimiento en docs/fuentes-y-proxy.md ("Próximos gachas").
 *
 * Reglas:
 * - `confirmed: true` solo si la fecha/ventana sale del editor (web oficial, cuenta oficial, nota de prensa). Una fecha de la App Store,
 *   TapTap o una web de calendarios es una estimación (`confirmed: false`) y se explica en `note`.
 * - `date` va en ISO con la zona del anuncio (casi todos usan UTC+8). Con `precision` distinta de 'day' indica el INICIO de la ventana
 *   ('2026-12' = diciembre de 2026, 'spring' = primavera, etc.). La cuenta atrás solo aparece con 'day'.
 * - `checked` es la última fecha en que se revisó la entrada. Al lanzarse el juego, quítalo de aquí (y añádelo al catálogo si toca).
 *   Por si se olvida: la app oculta una entrada 14 días después del final de su ventana.
 */
import type { LiveUpcoming } from './net'

export type Precision ='day' | 'month' | 'quarter' | 'spring' | 'half' | 'year' | 'tba'
export type UpcomingStatus = 'prereg' | 'beta' | 'announced'

export interface UpcomingGame {
  id: string
  name: string
  publisher: string
  /** Regiones del lanzamiento indicado ('Global', 'CN', 'JP', 'KR', 'TW'…). */
  regions: string[]
  /** Inicio de la fecha o ventana (ver `precision`). */
  date: string
  precision: Precision
  /** true = fecha/ventana anunciada por el editor; false = estimada (tienda, calendarios…). */
  confirmed: boolean
  status: UpcomingStatus
  platforms: string
  /** Prerregistro o web oficial. */
  url?: string
  /** Icono (App Store, mismo CDN que el catálogo; si no está, Steam/TapTap/arte oficial). Sin icono, iniciales sobre los colores. */
  icon?: string
  /** `object-position` del icono cuando es un arte apaisado recortado a cuadrado. */
  iconPos?: string
  color: string
  color2: string
  /** Fuentes que respaldan la fecha (para quien mantenga la lista; no se muestran). */
  sources: string[]
  /** Aclaración visible (es/en/zh). */
  note?: { es: string; en: string; zh: string }
  /** Última revisión (AAAA-MM-DD). */
  checked: string
  /** Solo en las añadidas automáticamente: la noticia que las trajo. */
  news?: { site: string; link: string }
}

const APPICON = (path: string) => `https://is1-ssl.mzstatic.com/image/thumb/${path}/256x256bb.jpg`

export const UPCOMING: UpcomingGame[] = [
  {
    id: 'azurpromilia', name: 'Azur Promilia', publisher: 'Manjuu', regions: ['CN', 'JP', 'KR', 'TW'],
    date: '2026-11-26T00:00:00+08:00', precision: 'day', confirmed: true, status: 'prereg', platforms: 'PC · iOS · Android',
    url: 'https://apps.apple.com/jp/app/id6787982572',
    icon: APPICON('Purple211/v4/2f/c5/46/2fc54681-40d6-6023-3c07-52355cf6c2a3/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png'),
    color: '#5eb3f0', color2: '#1d3c66',
    sources: ['App Store JP id6787982572 (Yostar, 26 nov 2026)', 'https://www.gematsu.com/2026/10/azur-promilia-launches-november-26-in-japan-south-korea-taiwan-and-china',
      'https://www.invenglobal.com/articles/27610/nexons-azur-promilia-officially-launches-november-26'],
    note: {
      es: 'Solo Asia (Yostar en JP, Nexon en KR). Global: beta abierta en inglés prevista para el verano de 2027.',
      en: 'Asia only (Yostar in JP, Nexon in KR). Global: English open beta planned for summer 2027.',
      zh: '仅亚洲地区（日服 Yostar，韩服 Nexon）。国际服：英文公测预计 2027 年夏季。',
    },
    checked: '2026-11-12',
  },
  {
    id: 'petitplanet', name: 'Petit Planet', publisher: 'HoYoverse', regions: ['Global'],
    date: '2026-12-04T00:00:00+08:00', precision: 'day', confirmed: true, status: 'prereg', platforms: 'PC · iOS · Android',
    url: 'https://planet.hoyoverse.com/en-us/',
    icon: APPICON('Purple211/v4/f6/77/9b/f6779b6f-4f37-9ab1-5843-72db9e7cc3b5/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png'),
    color: '#8bd17c', color2: '#2f5a3a',
    sources: ['https://planet.hoyoverse.com/en-us/ ("Coming December 4!")', 'https://www.pocketgamer.biz/hoyoverses-petit-planet-sets-december-4th-release-date/',
      'App Store id6776621908 (4 dic 2026)'],
    note: { es: 'Switch 2 en 2027.', en: 'Switch 2 version in 2027.', zh: 'Switch 2 版 2027 年推出。' },
    checked: '2026-11-12',
  },
  {
    id: 'silverpalace', name: 'Silver Palace', publisher: 'Elementa', regions: ['Global'],
    date: '2026-12-14T00:00:00+08:00', precision: 'day', confirmed: true, status: 'prereg', platforms: 'PC · PS5 · iOS · Android',
    url: 'https://silverpalace.elementagames.com/en-us/home',
    icon: APPICON('Purple221/v4/ba/b8/ea/bab8ea17-9a7f-142b-d900-8c3198487673/AppIcon-0-0-1x_U007emarketing-0-4-85-220.png'),
    color: '#c9b37e', color2: '#3a2f1e',
    sources: ['https://automaton-media.com/en/news/open-world-anime-style-detective-arpg-silver-palace-gets-december-14-global-release-date/',
      'https://www.invenglobal.com/articles/28054/silver-palace-sets-december-14th-global-launch-on-pc-ps5-and-mobile', 'App Store id6758292278 (14 dic 2026)'],
    checked: '2026-11-12',
  },
  {
    id: 'azurehaven', name: 'Azure Haven', publisher: 'MoeFantasy', regions: ['CN'],
    date: '2026-12-01T00:00:00+08:00', precision: 'month', confirmed: false, status: 'prereg', platforms: 'iOS · Android',
    url: 'https://www.taptap.cn/app/741465',
    // Icono de su ficha de TapTap (苍蓝避风港, "官方预约"); no está en la App Store.
    icon: 'https://img-tc.tapimg.com/market/images/8923321f6936edf7ab225a94c79201b0.png/_tap_appicon.jpg',
    color: '#4fa3c7', color2: '#14324a',
    sources: ['TapTap CN app/741465 (diciembre 2026)', 'https://www.gacha.gg/azure-haven', 'https://revenue.ennead.cc/upcoming/azure-haven'],
    note: {
      es: 'Mes según TapTap; sin día anunciado. Sucesor de Warship Girls R.',
      en: 'Month per TapTap; no day announced. Successor to Warship Girls R.',
      zh: '月份来自 TapTap，具体日期未公布。《战舰少女R》系列新作。',
    },
    checked: '2026-11-12',
  },
  {
    id: 'digimonalysion', name: 'DIGIMON ALYSION', publisher: 'Bandai', regions: ['Global'],
    date: '2026-01-01T00:00:00+09:00', precision: 'year', confirmed: true, status: 'prereg', platforms: 'iOS · Android',
    url: 'https://www.digimon-alysion.com/en/',
    icon: APPICON('Purple221/v4/3a/b4/87/3ab4871b-e969-3da4-48a3-9c0b19febf45/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png'),
    color: '#f2a03d', color2: '#5a2d10',
    sources: ['https://www.digimon-alysion.com/en/ (prerregistro desde el 28 oct 2026)', 'https://game8.co/articles/release-dates/digimon-alysion-release-date-and-time',
      'App Store id6745321429 (23 dic 2026, provisional)'],
    note: {
      es: 'Bandai solo dice «2026». La App Store marca el 23 dic (provisional).',
      en: 'Bandai only says "2026". The App Store lists Dec 23 (placeholder).',
      zh: '万代仅公布「2026 年」。App Store 显示 12 月 23 日（暂定）。',
    },
    checked: '2026-11-12',
  },
  {
    id: 'limitzerobreakers', name: 'LIMIT ZERO BREAKERS', publisher: 'NCSOFT', regions: ['Global'],
    date: '2026-01-01T00:00:00+09:00', precision: 'year', confirmed: true, status: 'beta', platforms: 'PC · iOS · Android',
    url: 'https://breakers.plaync.com/en-us',
    // Sin ficha en la App Store aún: cabecera de su página de Steam (app 3764400), recortada al centro.
    icon: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3764400/bc01c94054abd0d78cb0a80ada15bee6eaccca58/header.jpg',
    color: '#ff6b6b', color2: '#3d1420',
    sources: ['https://www.gematsu.com/2025/08/breakers-unlock-the-world-title-changed-to-limit-zero-breakers-launches-in-2026-worldwide',
      'https://playday.one/2026/08/20/limit-zero-breakers-holds-second-frontier-test/ (Frontier Test, 9-13 sep 2026)'],
    note: {
      es: 'NCSOFT mantiene «2026» sin día; última prueba en septiembre. Podría retrasarse.',
      en: 'NCSOFT still says "2026" with no day; last test in September. May slip.',
      zh: 'NCSOFT 仍称「2026 年」，未定具体日期；最近一次测试在 9 月。可能延期。',
    },
    checked: '2026-11-12',
  },
  {
    id: 'guardianmaiden', name: 'Guardian Maiden', publisher: 'Kakao Games · Kong Studios', regions: ['Global', 'KR'],
    date: '2026-01-01T00:00:00+09:00', precision: 'year', confirmed: true, status: 'announced', platforms: 'PC · iOS · Android',
    // Sin tiendas ni web propia: key art oficial de la nota de prensa de Kakao Games (28 jul 2026, vía Inven Global).
    icon: 'https://static.invenglobal.com/upload/image/2026/07/28/i1785201077717747.jpeg', iconPos: '47% 40%',
    color: '#9d8cf0', color2: '#2a2154',
    sources: ['https://www.asiae.co.kr/en/article/IT/2026072817354035652 (28 jul 2026: lanzamiento previsto «este año»)',
      'https://www.gamemeca.com/en/view.php?gid=1778726 (CEO de Kakao Games: fin de año o, como tarde, 1.er semestre de 2027)'],
    note: {
      es: 'Kakao Games: «a finales de 2026 o, como tarde, en el primer semestre de 2027». Sin prerregistro aún.',
      en: 'Kakao Games: "by the end of 2026 or, at the latest, H1 2027". No pre-registration yet.',
      zh: 'Kakao Games：「2026 年底，最迟 2027 年上半年」。尚未开放预约。',
    },
    checked: '2026-11-12',
  },
  {
    id: 'ananta', name: 'ANANTA', publisher: 'NetEase · Naked Rain', regions: ['Global'],
    date: '2027-01-15T00:00:00+08:00', precision: 'day', confirmed: true, status: 'prereg', platforms: 'PC · PS5 · iOS · Android',
    url: 'https://www.anantagame.com/',
    icon: APPICON('Purple211/v4/af/61/e5/af61e5f8-d175-6048-1234-a036a0f9d2e2/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png'),
    color: '#ff5fa2', color2: '#2b1446',
    sources: ['https://www.anantagame.com/ ("global release on January 15th, 2027")',
      'https://gameinformer.com/gamescom-2026/2026/08/25/urban-open-world-action-game-ananta-has-a-new-trailer-and-release-date'],
    checked: '2026-11-12',
  },
  {
    id: 'medabotss', name: 'Medabots S', publisher: 'Imagineer', regions: ['Global'],
    date: '2027-01-21T00:00:00+09:00', precision: 'day', confirmed: false, status: 'prereg', platforms: 'iOS · Android',
    url: 'https://apps.apple.com/us/app/medabots-s/id6784058691',
    icon: APPICON('Purple221/v4/8e/a2/7e/8ea27e89-f42b-bed2-9f5c-8a20202a23b3/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png'),
    color: '#f5c542', color2: '#4a3410',
    sources: ['https://www.animenewsnetwork.com/news/2026-09-05/medabots-s-smartphone-game-to-get-global-launch/.241429', 'App Store id6784058691 (21 ene 2027)'],
    note: {
      es: 'Fecha de la App Store; Imagineer aún no la ha anunciado. Ya disponible en Japón.',
      en: 'App Store date; not yet announced by Imagineer. Already live in Japan.',
      zh: '日期来自 App Store，Imagineer 尚未正式公布。日服已上线。',
    },
    checked: '2026-11-12',
  },
  {
    id: 'hna', name: 'Honkai: Nexus Anima', publisher: 'HoYoverse', regions: ['Global'],
    date: '2027-03-01T00:00:00+08:00', precision: 'spring', confirmed: true, status: 'beta', platforms: 'PC · iOS · Android',
    url: 'https://hna.hoyoverse.com/',
    icon: APPICON('Purple221/v4/21/63/40/216340a0-52ba-443b-b7e7-4c463d6c5f2c/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png'),
    color: '#b48cff', color2: '#2a1a52',
    sources: ['https://hna.hoyoverse.com/ ("scheduled to launch in Spring 2027")',
      'https://game8.co/articles/latest/honkai-nexus-anima-launches-spring-2027-with-final-beta-test-coming-november-25'],
    note: {
      es: 'Beta final desde el 25 nov 2026 (inscripción hasta el 22 nov).',
      en: 'Final closed beta from Nov 25, 2026 (sign-ups until Nov 22).',
      zh: '最终封测 2026 年 11 月 25 日开始（报名截至 11 月 22 日）。',
    },
    checked: '2026-11-12',
  },
]

const DAY = 86_400_000

/** Fin de la ventana (exclusivo): para ordenar por cercanía y ocultar entradas caducadas. */
export function windowEnd(g: UpcomingGame): number {
  const d = new Date(g.date)
  // Año y mes del propio texto: con "+08:00", 1 dic 00:00 aún es 30 nov en UTC.
  const y = +g.date.slice(0, 4), m = +g.date.slice(5, 7) - 1
  switch (g.precision) {
    case 'day': return +d + DAY
    case 'month': return Date.UTC(y, m + 1, 1)
    case 'quarter': return Date.UTC(y, m + 3, 1)
    case 'spring': return Date.UTC(y, 5, 1)
    case 'half': return Date.UTC(y, m + 6, 1)
    case 'year': return Date.UTC(y + 1, 0, 1)
    case 'tba': return Infinity
  }
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)) }

const AUTO_NOTE = {
  es: 'Añadido automáticamente desde las noticias; fecha de la App Store.',
  en: 'Added automatically from the news; App Store date.',
  zh: '根据新闻自动添加；日期来自 App Store。',
}

/** Entrada descubierta por el servidor (noticias + App Store) en el formato de la lista curada. */
function fromLive(l: LiveUpcoming): UpcomingGame {
  return {
    id: l.id, name: l.name, publisher: l.publisher, regions: [], date: l.date, precision: 'day', confirmed: false, status: 'prereg',
    platforms: 'iOS', url: l.url, icon: l.icon, color: '#8ea2d8', color2: '#232a45', sources: [l.news?.link ?? l.url], note: AUTO_NOTE,
    news: l.news, checked: l.date.slice(0, 10),
  }
}

/**
 * Entradas vigentes, de la más cercana a la más lejana (TBA al final). Se ocultan 14 días después de su ventana.
 * `live` (del servidor) añade los juegos que la lista curada no tiene (ni el catálogo, `known`), y al día exacto de la App Store pone al día
 * las entradas curadas con fecha solo estimada.
 */
export function upcomingList(now: number, live: LiveUpcoming[] = [], known: string[] = []): UpcomingGame[] {
  const curated = UPCOMING.map(g => {
    const l = !g.confirmed && g.precision === 'day' ? live.find(l => same(l.name, g.name)) : undefined
    return l ? { ...g, date: l.date } : g
  })
  const extra = live.filter(l => !UPCOMING.some(g => same(g.name, l.name)) && !known.some(k => same(k, l.name))).map(fromLive)
  return [...curated, ...extra].filter(g => windowEnd(g) + 14 * DAY > now)
    .sort((a, b) => windowEnd(a) - windowEnd(b) || +new Date(a.date) - +new Date(b.date))
}
