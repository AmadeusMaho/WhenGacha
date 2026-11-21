import { viaProxy } from '../net'
import type { Featured, GameEvent, Kind, Patch, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { syncPocketGamerCodes } from './codes'
import { pullsIn } from './pulls'
import { postLines, type SteamPost } from './aniimo'
import { syncPrydwen } from './prydwen'

/**
 * StarSavior (Studiobside; global desde el 19 mar 2026). Dos servidores, "Global" y "Asia" (Corea, Japón y Asia fusionados el 22 oct 2026), pero con
 * el MISMO horario: un solo parche para todos, con las horas en UTC, y el mantenimiento de los jueves es a la vez (01:00 UTC = 10:00 JST/KST en los
 * avisos japoneses). Por eso no hay selector de servidor en servers.ts. Fuentes (revisadas el 16 nov 2026):
 *  - **Avisos oficiales en Steam** (app 3609080; son los mismos que starsavior.com/en/news). Las notas de cada actualización (los jueves, mantenimiento
 *    01:00–03:00 UTC) dan cada evento, banner y modo con su hora EXACTA en UTC: «▶ Period: After maintenance on November 12 – December 3, 19:00 UTC»,
 *    «▶ Season Period: … ▶ Settlement Period: November 11, 19:00 – November 18, 19:00 UTC». "After maintenance" = fin del mantenimiento de ese aviso
 *    («▣ Maintenance: November 12, 01:00–~~05:00~~ 07:00 UTC»: manda la última hora). Los "On-Time Event" semanales traen sus recompensas
 *    («1) 20,000 Lunar Elixir»). Los resúmenes de las retransmisiones ("Special Broadcast Summary") anuncian lo próximo: «The [Memoirs of a Year Yet
 *    to Come] event is scheduled to run from December 3 to December 25» y «[Butterfly Dream: Lacy] will be available through Observation starting in
 *    Week 1 of [Memoirs…]» → evento y banners estimados.
 *  - **Prydwen** (/other-games/starsavior/banners): banners de Savior y de Arcana con inicio y fin exactos (`syncPrydwen`). Prydwen pone el inicio a las
 *    04:00 UTC; si el aviso de Steam da el fin real del mantenimiento (07:00 el 12 nov, con la prórroga), se usa ese.
 *  - **Códigos**: PocketGamer (`star-savior`).
 * Retratos: no hay wiki con iconos (Prydwen no tiene página de personajes y la web oficial solo enseña los 15 del lanzamiento). Se usa la imagen que
 * el propio aviso pone tras el nombre del Savior («[Gille]» + imagen; «● Butterfly Dream: Lacy (Sun Attribute, Assassin)» + imagen).
 * Hora del juego: el día cambia a las 15:00 UTC (00:00 KST: «compensation will be sent … by November 6, 14:59 UTC») y los eventos acaban a las
 * 19:00 UTC (04:00 KST). Rotatorios: Cosmo Gate Prism (temporadas de 14 días: una semana de juego y otra de liquidación) y Guild Defense Prism (cada
 * 28 días) salen de los avisos; la temporada siguiente se calcula ("estimated") a partir de la última publicada.
 * 1 consulta a Steam (hasta 50 avisos: publican 5–10 por semana y las notas de una actualización duran 3 semanas), 1 página de Prydwen y 1 de
 * PocketGamer por ciclo.
 */
export const STARSAVIOR_STEAM_APP = 3609080
const STEAM = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STARSAVIOR_STEAM_APP}&count=50&maxlength=0&format=json`
const CLAN_IMG = 'https://clan.akamai.steamstatic.com/images'
const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Fin habitual del mantenimiento de los jueves (01:00–03:00 UTC) cuando el aviso no lo da. */
const MAINT_END_UTC = 3
/** Cierre de eventos y banners: 19:00 UTC (04:00 KST). */
const CLOSE_UTC = 19
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/**
 * Iconos de objetos (sin wiki que los dé): Stellagem y billete de Observation destacada, recortados (sin la cifra) de las capturas del juego de
 * tychara.com (guía de principiantes: "starlightstones.webp", "yellowticket.webp") y guardados en public/icons. Lunar Elixir, Willpower y el resto
 * no tienen imagen en ninguna fuente permitida (docs/fuentes-y-proxy.md).
 */
export const STARSAVIOR_ICONS = new Map<string, string>([
  ['stellagem', '/icons/starsavior-stellagem.webp'],
  ['featured observation ticket', '/icons/starsavior-featured-ticket.webp'],
  ['featured savior observation ticket', '/icons/starsavior-featured-ticket.webp'],
  ['featured arcana observation ticket', '/icons/starsavior-featured-ticket.webp'],
])

/** Recompensas de los códigos que PocketGamer da sin ellas (SuperCheats y BlueStacks, "StarSavior codes", jun 2026). */
const CODE_REWARDS: Record<string, string[]> = {
  STARHALFANNIVSAVIOR: ['Pulsar Core'],
  '26SHOWCASEHALFANNY': ['Featured Arcana Observation Ticket ×10'],
}

const clean = (s: string) => s.replace(/[\s ]+/g, ' ').trim()
const iso = (t: number) => new Date(t).toISOString()
export const nameKey = (s: string) => s.toLowerCase().replace(/[‘’'"“”]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** "November 12" / "January 10, 2027" (+ ", 19:00") → ms. Sin año: el del aviso (o el siguiente si queda muy atrás). */
function dateAt(s: string, year: number, posted: number): { t: number; time: boolean } | null {
  const m = /([A-Z][a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?(?:,?\s*(\d{1,2}):(\d{2}))?/.exec(s)
  if (!m) return null
  const mo = MONTHS.findIndex(x => x.startsWith(m[1].toLowerCase().slice(0, 3)))
  if (mo < 0) return null
  let y = m[3] ? +m[3] : year
  const time = m[4] != null
  let t = Date.UTC(y, mo, +m[2], time ? +m[4] : 0, time ? +m[5] : 0)
  if (!m[3] && t < posted - 120 * DAY) t = Date.UTC(++y, mo, +m[2], time ? +m[4] : 0, time ? +m[5] : 0)
  return { t, time }
}

/**
 * Periodo de una línea: «After maintenance on November 12 – December 3, 19:00 UTC», «After the October 22 maintenance - October 28, 19:00 UTC»,
 * «September 23, 19:00 - September 30, 19:00 UTC», «November 8, 19:00 UTC – January 10, 2027, 14:00 UTC», «November 12 after maintenance -
 * November 16, 14:59 UTC». `maint(day)`: fin del mantenimiento de ese día.
 */
export function periodOf(s: string, year: number, posted: number, maint: (day: number) => number): { start: number; end: number; approx?: boolean } | null {
  const parts = clean(s).replace(/\s*\(?UTC\)?/gi, ' UTC').split(/\s+[–—~-]\s+|\s*[–—~]\s*(?=[A-Z])/)
  if (parts.length < 2) return null
  const [a, b] = [parts[0], parts.slice(1).join(' - ')]
  let start: number | null = null
  let approx = false
  const da = dateAt(a, year, posted)
  if (/after/i.test(a)) {
    const day = da ? da.t : posted
    start = maint(Date.UTC(new Date(day).getUTCFullYear(), new Date(day).getUTCMonth(), new Date(day).getUTCDate()))
  } else if (da) {
    start = da.time ? da.t : da.t + MAINT_END_UTC * HOUR
    approx = !da.time
  }
  const db = dateAt(b, year, posted)
  if (start == null || !db) return null
  let end = db.time ? db.t : db.t + CLOSE_UTC * HOUR
  if (new Date(end).getUTCMinutes() === 59) end += 59_000
  if (end <= start) end = Date.UTC(new Date(end).getUTCFullYear() + 1, new Date(end).getUTCMonth(), new Date(end).getUTCDate(), new Date(end).getUTCHours(), new Date(end).getUTCMinutes())
  return { start, end, ...(approx || !db.time ? { approx: true } : {}) }
}

/** Marca cada imagen del aviso como línea propia («⟪IMG /45693889/abc.png⟫») antes de pasarlo a texto: así se sabe qué imagen va tras cada nombre. */
const IMG_MARK = /^⟪IMG (\S+)⟫$/
export function linesOf(bb: string): string[] {
  const marked = bb.replace(/\[img[^\]]*?src="\{STEAM_CLAN_IMAGE\}([^"]+)"[^\]]*\]\s*\[\/img\]/gi, '[/p][p]⟪IMG $1⟫[/p][p]')
    .replace(/\[strike\][\s\S]*?\[\/strike\]/gi, '')
  return postLines(marked)
}
const imgUrl = (l: string) => { const m = IMG_MARK.exec(l); return m ? `${CLAN_IMG}${m[1]}` : undefined }

/** Fin del mantenimiento de un aviso («▣ Maintenance: November 12, 01:00–07:00 UTC», «■ Schedule: November 5, 01:00 - 03:00 UTC»). */
function maintenanceOf(lines: string[], year: number, posted: number): number | null {
  for (let i = 0; i < lines.length; i++) {
    // El rótulo y la hora pueden ir en líneas distintas («▣ Maintenance:» / «November 12, 01:00– 07:00 UTC»).
    const l = /^[▣■]?\s*\**\s*(?:maintenance|schedule)\s*:?\**\s*:?\s*$/i.test(lines[i]) ? `${lines[i]} ${lines[i + 1] ?? ''}` : lines[i]
    const m = /^[▣■]?\s*\**\s*(?:maintenance|schedule)\s*:?\**\s*:?\s*([A-Z][a-z]+\.?\s+\d{1,2}),?\s*(\d{1,2}):(\d{2})\s*[–—~-]\s*(?:(\d{1,2}):(\d{2})\s+)*?(\d{1,2}):(\d{2})\s*\(?UTC/i.exec(l)
    if (!m) continue
    const d = dateAt(m[1], year, posted)
    if (d) return d.t + +m[6] * HOUR + +m[7] * 60_000
  }
  return null
}

const CHALLENGE = /cosmo gate|gauntlet|overload cube|guild defense|onslaught|hunt quest|raid|prism season/i
const BANNER = /observation/i
/** Secciones con periodo que no son eventos (tienda de pago, ajustes, arreglos). */
const SKIP = /cash shop|package|product|improvement|change|adjust|bug|fix|qol|known issue|maintenance|compensation|journey changes|shop$/i
/** Pequeños: inicios de sesión diarios y misiones de apoyo; se ocultan por defecto. */
const MINOR = /check-in|on-time|boost missions|celebration missions|unlock/i

interface Raw { title: string; kind: Kind; start: number; end: number; approx?: boolean; description?: string; image?: string; items: RewardItem[]; featured: Featured[]; minor?: boolean
  /** De un apartado "New Event: …": da nombre a la actualización. */
  headline?: boolean }

/** Recompensas listadas «1) 20,000 Lunar Elixir» o «- 10 Standard Savior Observation Tickets». */
function itemsOf(lines: string[]): RewardItem[] {
  const out: RewardItem[] = []
  for (const l of lines) {
    const m = /^(?:\d+\)|[-•·])\s*([\d,]+)\s*x?\s+([A-Z][^()※]{2,60}?)\s*$/.exec(l)
    if (m) out.push({ name: clean(m[2]), amount: Number(m[1].replace(/,/g, '')) })
  }
  return out
}

/** Nombre de un evento: «The 'At the End of the Journey Check-in' event will be held.» → el entrecomillado; si no, el rótulo sin "New Event:". */
function titleOf(label: string): string {
  // La comilla de apertura va tras un espacio (el apóstrofo de "A Warrior's Oath" no abre nada).
  const q = /(?:^|\s)['‘"“【]\s*([^"”】]{3,80}?)\s*['’"”】](?=\s|$|[.,])/.exec(label)?.[1]
  const t = clean((q ?? label).replace(/^(?:new |returning |special )*(?:mini-)?event(?: rerun)?:\s*/i, '').replace(/^the new (?:mini-)?event\s*/i, ''))
  return t.replace(/\s*\.$/, '')
}

/** Nombre de Savior en una línea: «【Gille】» sola, o «● Butterfly Dream: Lacy (Sun Attribute, Assassin)» (también tras otro rótulo en la misma línea). */
const WHO = (l: string): string | undefined => {
  const m = /^【([^】]{2,40})】$/.exec(l)?.[1] ?? [...l.matchAll(/[●■]\s*([^()●■*]{2,50}?)\s*\([^)]*attribute[^)]*\)/gi)].pop()?.[1]
  return m ? clean(m.replace(/\*+/g, '')) : undefined
}

/**
 * Retratos de un aviso: la primera imagen tras el nombre del Savior. En las notas con un solo Savior destacado no hay rótulo con su nombre
 * («▶ Noble Princess : Frey will be available through [Featured Savior Observation]» y su imagen tras el periodo): se toma ese nombre.
 */
export function portraitsOf(lines: string[]): Map<string, string> {
  const out = new Map<string, string>()
  let name = ''
  let featured = false
  for (const l of lines) {
    const img = imgUrl(l)
    if (img) { if (name && !out.has(nameKey(name))) out.set(nameKey(name), img); name = ''; continue }
    const who = WHO(l)
    if (who) { name = who; continue }
    if (/^\**\s*\d{1,2}\.\s/.test(l)) { featured = /featured savior observation/i.test(l); name = ''; continue }
    const one = featured && /^▶\s*(?:the (?:new )?savior\s*)?[“"]?\s*([^“”"]{2,50}?)\s*[”"]?\s+(?:will be|can be) (?:available|obtained)/i.exec(l)?.[1]
    if (one && !/^new saviors?\b/i.test(one)) name = one
  }
  return out
}

/** Eventos, banners y modos de unas notas de actualización (o de un "On-Time Event"). */
export function starPost(post: SteamPost, ends: Map<number, number> = new Map()): { raws: Raw[]; images: Map<string, string>; update: number | null; title: string } {
  const lines = linesOf(post.contents)
  const posted = post.date * 1000
  const year = new Date(posted).getUTCFullYear()
  const own = maintenanceOf(lines, year, posted)
  // Fin del mantenimiento del día pedido: el de este aviso si es ese día; si no, el habitual (03:00 UTC).
  // Fin del mantenimiento de ese día: el de este aviso, el de otro aviso del mismo día (el "Maintenance Announcement") o el habitual (03:00 UTC).
  const maint = (day: number) => (own != null && Math.abs(own - day) < DAY ? own : ends.get(day) ?? day + MAINT_END_UTC * HOUR)
  const raws: Raw[] = []
  const images = new Map<string, string>()
  const header = lines.map(imgUrl).find(Boolean)

  // "On-Time Event": un solo periodo (🗓️ Event Schedule) y su lista de recompensas.
  if (/on-time event/i.test(post.title)) {
    const i = lines.findIndex(l => /event schedule/i.test(l))
    const p = i >= 0 ? lines.slice(i, i + 3).map(l => periodOf(l.replace(/^.*?schedule\s*/i, ''), year, posted, maint)).find(Boolean) : null
    if (p) raws.push({ title: clean(post.title.replace(/^special\s+/i, '')), kind: 'event', ...p, image: header, items: itemsOf(lines), featured: [], minor: true,
      description: '⟦d.ssOnTime⟧' })
    return { raws, images, update: null, title: post.title }
  }

  for (const [k, v] of portraitsOf(lines)) images.set(k, v)
  let section = ''
  let sub = ''
  let block: string[] = []
  let sectionImg: string | undefined
  const flush = () => { block = [] }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (IMG_MARK.test(l) || WHO(l)) continue
    const sec = /^\**\s*(\d{1,2})\.\s+(.{3,90}?)\**$/.exec(l)
    if (sec) { section = clean(sec[2].replace(/\*+/g, '')); sub = ''; sectionImg = undefined; flush(); continue }
    const sb = /^(\d{1,2})-(\d{1,2})\.\s*(.+)$/.exec(l)
    if (sb) { sub = sb[3]; flush(); continue }
    block.push(l)
    const pm = /^▶?\s*(event |season |preseason |settlement )?period\s*:\s*(.+)$/i.exec(l)
    if (!pm || !section) continue
    if (/settlement/i.test(pm[1] ?? '')) continue
    // "6. Other Events" sin subapartado no es un evento.
    if (!sub && /^other events?$/i.test(section)) continue
    if (SKIP.test(section) && !BANNER.test(section)) continue
    const p = periodOf(pm[2], year, posted, maint)
    if (!p) continue
    const label = sub || section
    let title = titleOf(label)
    // "6. Event" a secas: el nombre va entrecomillado en su primera línea («▶ “Ruins Exploration Boost Missions” event will begin.», 19 nov 2026).
    if (/^(?:new |other )?events?$/i.test(title)) title = clean(block.map(x => /(?:^|\s)[‘"“]\s*([^"”’]{3,80}?)\s*[’"”]/.exec(x)?.[1]).find(Boolean) ?? title)
    const ctx = [...block, ...lines.slice(i + 1, i + 6)].join(' ')
    const season = /(cosmo gate|guild defense) prism season (\d+)/i.exec(`${section} ${sub} ${ctx}`)
    if (season) title = `${season[1].replace(/\b\w/g, c => c.toUpperCase())} Prism Season ${season[2]}`
    if (/^gauntlet preseason$/i.test(section)) title = 'Gauntlet Preseason'
    const kind: Kind = BANNER.test(section) ? 'banner' : CHALLENGE.test(`${section} ${title}`) ? 'challenge' : 'event'
    // Arte del evento: la imagen pegada al periodo (como mucho tras la línea de "Settlement Period"). Una imagen después de un párrafo de
    // explicación es una captura del juego (el tablero de recompensas del Orbital Link, 791×158): entonces se usa el arte de la sección.
    const next = /settlement period/i.test(lines[i + 1] ?? '') ? lines[i + 2] : lines[i + 1]
    const own = imgUrl(next ?? '')
    if (own && !sectionImg) sectionImg = own
    const firstImg = own ?? sectionImg
    const description = clean(block.filter(x => !/period\s*:/i.test(x) && !/^※/.test(x)).join(' ').replace(/^▶\s*/, '')).slice(0, 320) || undefined
    // Personajes de regalo: «Earn Savior Gille and Arcana 'Never Ending Dance' through the … Celebration Missions» (la única recompensa que las
    // notas dan con nombre; el resto va en imágenes). Su retrato, el del aviso si lo hay.
    const gift = /\bearn (?:the )?savior\s+([^,]{2,40}?)\s+and arcana\s+['‘"“]([^'’"”]{2,50})['’"”]/i.exec(block.join(' '))
    const items: RewardItem[] = gift ? [{ name: clean(gift[1]), amount: 1, icon: images.get(nameKey(clean(gift[1]))) }, { name: clean(gift[2]), amount: 1 }] : []
    raws.push({ title, kind, ...p, description, image: firstImg, items, featured: [], ...(MINOR.test(title) && !gift ? { minor: true } : {}),
      // El primer evento del primer apartado "New Event:" (4-1. 'Main Stream Episode 8: At the End of the Journey').
      ...(/^new event:/i.test(section) && !raws.some(r => r.headline) ? { headline: true } : {}) })
  }
  const day = /^\[([A-Z][a-z]+ \d{1,2})\]/.exec(post.title)?.[1]
  const d = day ? dateAt(day, year, posted) : null
  return { raws, images, update: own ?? (d ? maint(d.t) : null), title: post.title }
}

/**
 * Lo próximo de los resúmenes de las retransmisiones: el evento («The [X] event is scheduled to run from December 3 to December 25») y sus Saviors
 * («[Name] will be available through Observation starting in Week N of [X]»), con el retrato que acompaña al nombre. Todo estimado: el día de
 * Corea va de 15:00 a 15:00 UTC, así que «hasta el 25» cierra el 24 a las 19:00 UTC, y se empieza tras el mantenimiento del jueves (03:00 UTC).
 */
export function announced(gameId: string, post: SteamPost, images: Map<string, string>, now: number): GameEvent[] {
  const lines = linesOf(post.contents)
  const text = lines.filter(l => !IMG_MARK.test(l)).join('\n')
  const posted = post.date * 1000
  const year = new Date(posted).getUTCFullYear()
  const out: GameEvent[] = []
  for (const m of text.matchAll(/【([^】]+)】 event is scheduled to run from ([A-Z][a-z]+ \d{1,2}) to ([A-Z][a-z]+ \d{1,2})/g)) {
    const a = dateAt(m[2], year, posted), b = dateAt(m[3], year, posted)
    if (!a || !b) continue
    const start = a.t + MAINT_END_UTC * HOUR
    const end = b.t - DAY + CLOSE_UTC * HOUR
    if (end < now) continue
    out.push({ id: `${gameId}:event:announced:${nameKey(m[1])}`, gameId, kind: 'event', title: m[1], start: iso(start), end: iso(end), items: [], featured: [],
      pulls: 0, source: 'api', official: true, precision: 'estimated', description: '⟦d.ssAnnounced⟧' })
    for (const w of text.matchAll(new RegExp(`【([^】]+)】 will be available through Observation starting in Week (\\d+) of 【${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}】`, 'g'))) {
      const s = start + (+w[2] - 1) * 7 * DAY
      // Los banners duran tres semanas (los del aniversario: del 12 nov al 3 dic) y cierran a las 19:00 UTC del jueves.
      const e = Date.UTC(new Date(s).getUTCFullYear(), new Date(s).getUTCMonth(), new Date(s).getUTCDate() + 21, CLOSE_UTC)
      out.push({ id: `${gameId}:banner:announced:${nameKey(w[1])}`, gameId, kind: 'banner', title: w[1], start: iso(s), end: iso(e), items: [],
        featured: [{ name: w[1], rarity: 5, icon: portrait(images, w[1]) }], pulls: 0, source: 'api', official: true, precision: 'estimated',
        description: `⟦d.charBanner⟧ · ${m[1]}` })
    }
  }
  return out
}

/** Retrato por nombre: exacto o el que contiene/está contenido ("Gille" ↔ "Executor: Gille", "Witch of Favoritism" ↔ "Witch of Favoritism: Asherah"). */
function portrait(images: Map<string, string>, name: string): string | undefined {
  const k = nameKey(name)
  if (images.has(k)) return images.get(k)
  for (const [n, url] of images) if (n.length > 3 && (k.includes(n) || n.includes(k))) return url
  return undefined
}

/** Temporadas siguientes de los rotatorios (Cosmo Gate cada 14 días, Guild Defense cada 28): a partir de la última publicada, hasta 3 semanas vista. */
export function nextSeasons(gameId: string, seasons: GameEvent[], now: number): GameEvent[] {
  const out: GameEvent[] = []
  for (const [mode, every] of [['Cosmo Gate', 14], ['Guild Defense', 28]] as const) {
    const list = seasons.filter(e => e.title.startsWith(mode)).sort((a, b) => +new Date(a.start) - +new Date(b.start))
    const last = list[list.length - 1]
    const n = last && /Season (\d+)/.exec(last.title)
    if (!last || !n) continue
    let s = +new Date(last.start), e = +new Date(last.end), k = +n[1]
    while (s < now + 21 * DAY) {
      s += every * DAY; e += every * DAY; k++
      if (e < now) continue
      // El inicio cae en un jueves de mantenimiento o a las 19:00 UTC del miércoles (Cosmo Gate 4): se deja al cierre del día anterior, 19:00 UTC.
      const start = Date.UTC(new Date(s).getUTCFullYear(), new Date(s).getUTCMonth(), new Date(s).getUTCDate() - (new Date(s).getUTCHours() < CLOSE_UTC ? 1 : 0), CLOSE_UTC)
      out.push({ ...last, id: `${gameId}:challenge:cycle:${nameKey(mode)}:${k}`, title: `${mode} Prism Season ${k}`, start: iso(start), end: iso(e),
        precision: 'estimated', official: false, description: mode === 'Cosmo Gate' ? '⟦d.ssCosmo⟧' : '⟦d.ssGuild⟧' })
    }
  }
  return out
}

async function get(url: string): Promise<string> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.text()
}

export async function syncStarSavior(gameId: string, now = Date.now()): Promise<GameSync> {
  const [st, pr, pg] = await Promise.allSettled([get(STEAM), syncPrydwen(gameId, 'starsavior'), syncPocketGamerCodes('star-savior')])
  if (st.status === 'rejected' && pr.status === 'rejected') throw st.reason
  if (st.status === 'rejected') console.warn('[starsavior] steam:', (st.reason as Error)?.message)
  if (pr.status === 'rejected') console.warn('[starsavior] prydwen:', (pr.reason as Error)?.message)
  if (pg.status === 'rejected') console.warn('[starsavior] códigos:', (pg.reason as Error)?.message)

  const posts: SteamPost[] = st.status === 'fulfilled'
    ? ((JSON.parse(st.value)?.appnews?.newsitems ?? []) as (SteamPost & { feedname: string })[])
      .filter(n => n.feedname === 'steam_community_announcements' && now - n.date * 1000 < 75 * DAY)
    : []
  // Del más reciente al más antiguo: si dos avisos traen el mismo evento (aviso corregido), manda el último.
  posts.sort((a, b) => b.date - a.date)
  const images = new Map<string, string>()
  const byKey = new Map<string, GameEvent>()
  const patches: Patch[] = []
  // Fin de cada mantenimiento (día UTC → instante), de las notas y de los "Maintenance Announcement".
  const ends = new Map<number, number>()
  // Solo los avisos de mantenimiento y las notas: los "Server Patch" / "Data Patch" también traen "Schedule:" (07:30–07:40) y no abren nada.
  for (const p of posts.filter(p => /maintenance announcement|update notes/i.test(p.title))) {
    const posted = p.date * 1000
    const t = maintenanceOf(linesOf(p.contents), new Date(posted).getUTCFullYear(), posted)
    if (t == null) continue
    const day = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate())
    if (!ends.has(day)) ends.set(day, t)
  }
  const notes = posts.filter(p => /update notes|on-time event/i.test(p.title))
  for (const p of notes) {
    const r = starPost(p, ends)
    for (const [k, v] of r.images) if (!images.has(k)) images.set(k, v)
    for (const x of r.raws) {
      const k = `${x.kind}:${nameKey(x.title)}:${iso(x.start).slice(0, 10)}`
      if (byKey.has(k)) continue
      byKey.set(k, {
        id: `${gameId}:${x.kind}:steam:${nameKey(x.title)}:${iso(x.start).slice(0, 10)}`, gameId, kind: x.kind, title: x.title, description: x.description,
        image: x.image, start: iso(x.start), end: iso(x.end), items: x.items, featured: x.featured, pulls: 0, source: 'api', official: true,
        ...(x.approx ? { precision: 'approx' as const } : {}), ...(x.minor ? { minor: true } : {}),
      })
    }
    // Cada actualización con notas es una "versión" (el juego no numera versiones; Prydwen las llama «1st Anniversary Update», «November 5th Update»).
    const d = /^\[([A-Z][a-z]+ \d{1,2})\] Update Notes/.exec(p.title)
    if (d && r.update) {
      const main = r.raws.find(x => x.headline && !x.minor)
      patches.push({ id: `${gameId}:patch:${iso(r.update).slice(0, 10)}`, gameId, version: d[1], name: main?.title, date: iso(r.update), notes: '', source: 'api' })
    }
  }
  // Retratos también de los resúmenes de las retransmisiones (los Saviors anunciados).
  for (const p of posts.filter(p => /broadcast summary|developer talk|dev notes/i.test(p.title)))
    for (const [k, v] of portraitsOf(linesOf(p.contents))) if (!images.has(k)) images.set(k, v)
  // Temporadas de Cosmo Gate y Guild Defense, también las ya cerradas: de la última se calcula la siguiente.
  const seasons = [...byKey.values()].filter(e => /prism season/i.test(e.title))
  let official = [...byKey.values()].filter(e => +new Date(e.end) > now - 3 * DAY)

  // Banners: Prydwen (Savior y Arcana, con nombre completo) manda; de Steam se toma el inicio real (fin del mantenimiento) y el retrato.
  const steamBanners = official.filter(e => e.kind === 'banner')
  const pry = pr.status === 'fulfilled' ? pr.value.events : []
  const banners = pry.map(b => {
    const twin = steamBanners.find(s => Math.abs(+new Date(s.end) - +new Date(b.end)) < 2 * HOUR && s.start.slice(0, 10) === b.start.slice(0, 10))
    const featured = b.featured.map(f => ({ ...f, icon: f.icon ?? portrait(images, f.name) }))
    return { ...b, ...(twin ? { start: twin.start, official: true } : {}), featured,
      // Arcana = banner de arma de Prydwen (desde el 21 nov 2026 también lleva su arcana como destacado: no vale mirar si tiene destacados).
      description: (b.description ?? '').includes('⟦d.weaponBanner⟧') ? '⟦d.ssArcana⟧' : '⟦d.ssSavior⟧' }
  })
  // De Steam solo quedan los banners que Prydwen no tiene (la "Select Observation").
  const extra = steamBanners.filter(s => !/featured/i.test(s.title) && !banners.some(b => Math.abs(+new Date(s.end) - +new Date(b.end)) < 2 * HOUR && s.start.slice(0, 10) === b.start.slice(0, 10) && /featured/i.test(s.title)))
    .filter(s => /select/i.test(s.title)).map(s => ({ ...s, title: 'Select Observation', description: '⟦d.ssSelect⟧' }))
  official = official.filter(e => e.kind !== 'banner')

  // Lo anunciado (el más reciente de los resúmenes), sin repetir lo que ya tiene fecha oficial.
  const known = new Set([...banners.flatMap(b => [nameKey(b.title), ...b.featured.map(f => nameKey(f.name))]), ...official.map(e => nameKey(e.title))])
  const ann = posts.filter(p => /broadcast summary|developer talk|dev notes/i.test(p.title))
    .flatMap(p => announced(gameId, p, images, now)).filter(e => !known.has(nameKey(e.title)))
    .filter((e, i, a) => a.findIndex(x => x.id === e.id) === i)

  const events = [...official, ...banners, ...extra, ...ann, ...nextSeasons(gameId, seasons, now)]
    .map(e => (e.items.length ? { ...e, pulls: pullsIn('starsavior', e.items.map(i => `${i.name} x${i.amount}`)).pulls } : e))

  // Versión anunciada (el evento de fin de año) tras la última.
  const list = patches.sort((a, b) => +new Date(a.date) - +new Date(b.date))
  for (const a of ann.filter(e => e.kind === 'event')) {
    if (!list.some(p => p.date.slice(0, 10) === a.start.slice(0, 10)))
      list.push({ id: `${gameId}:patch:${a.start.slice(0, 10)}`, gameId, version: new Date(a.start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }),
        name: a.title, date: a.start, notes: '', source: 'api', estimated: true })
  }
  list.forEach((p, i) => { if (list[i + 1]) p.end = list[i + 1].date })

  // PocketGamer solo da el código: las recompensas de los vigentes, de SuperCheats y BlueStacks (jun 2026), si la lista no trae ninguna.
  const codes = (pg.status === 'fulfilled' ? pg.value : []).map(c => (c.rewards.length ? c : { ...c, rewards: CODE_REWARDS[c.code.toUpperCase()] ?? [] }))
  return { events, patches: list, codes }
}
