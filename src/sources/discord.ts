import { viaProxy } from '../net'
import type { GameEvent, Kind, Patch, PromoCode } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * Anuncios oficiales que llegan a NUESTRO servidor de Discord: cada canal "sigue" (función Follow de Discord) el canal de anuncios oficial de un juego
 * y el bot propio lee sus mensajes (`GET /api/v10/channels/<id>/messages`). Es la vía que usa gachafocus para Stella Sora o Blue Archive Global, cuyas
 * webs prohíben los robots. Puesta en marcha: docs/discord-bot.md.
 *
 * Solo funciona en el servidor: el token (DISCORD_TOKEN) lo añade el proxy y la fuente es interna. Sin DISCORD_CHANNELS para el juego, no hace nada.
 * Los formatos varían por juego, así que el lector es tolerante: busca rangos de fechas ("Period: Oct. 19, 2026 after maintenance – Nov. 09, 2026 19:59
 * (UTC-7)", "11/9 (Mon) 19:00 ~ 11/16 (Mon) 18:59 (UTC)", "2026/11/03 04:00 - 2026/11/10 02:59 (UTC-7)") y les pone el nombre más cercano.
 */
const API = 'https://discord.com/api/v10/channels'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

interface Embed { title?: string; description?: string; fields?: { name: string; value: string }[]; image?: { url: string }; thumbnail?: { url: string } }
/** HTML de un aviso de web oficial (Trickcal, GFL2) → texto con una línea por párrafo, para leerlo como un mensaje. */
export function htmlText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n')
}

export interface Message { id: string; content: string; timestamp: string; embeds?: Embed[]; attachments?: { url: string; content_type?: string }[] }

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env

/** Canal de Discord de un juego, desde DISCORD_CHANNELS ("stellasora:123,bluearchive:456"). Solo en el servidor. */
export function discordChannel(gameId: string): string | undefined {
  return (env?.DISCORD_CHANNELS ?? '').split(',').map(x => x.split(':').map(s => s.trim())).find(([g]) => g === gameId)?.[1]
}

/** Zona de una línea: "(UTC-7)", "UTC+9", "(UTC)", "GMT-5". */
function zoneOf(s: string): number | undefined {
  const m = /\b(?:UTC|GMT)\s*([+-]\s*\d{1,2})?/i.exec(s)
  return m ? (m[1] ? Number(m[1].replace(/\s/g, '')) : 0) : undefined
}

/** Una fecha con hora opcional dentro de un trozo de texto → [año, mes, día, h, min] o null. */
function dateIn(s: string, year: number): { y: number; mo: number; d: number; h?: number; mi?: number } | null {
  const time = /(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s?m\b\.?)?/i.exec(s.replace(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/, ''))
  // "11:59 P.M." (Azur Lane) → 23:59; "12:00 A.M." → 00:00.
  const h12 = (h: number, ap?: string) => !ap ? h : /p/i.test(ap) ? (h % 12) + 12 : h % 12
  const t = time ? { h: h12(+time[1], time[3]), mi: +time[2] } : {}
  let m = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(s)
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3], ...t }
  m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/.exec(s)
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return { y: m[3] ? +m[3] : year, mo: MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), d: +m[2], ...t }
  m = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/.exec(s)
  if (m) return { y: m[3] ? +m[3] : year, mo: +m[1] - 1, d: +m[2], ...t }
  // Texto copiado desde un cliente de Discord en español ("viernes, 30 de octubre de 2026 0:00"): sin zona, se marca aproximado.
  m = /(\d{1,2}) de ([a-záéíóú]+)(?: de (\d{4}))?/i.exec(s)
  const es = m ? MESES.indexOf(m[2].toLowerCase().slice(0, 3)) : -1
  if (m && es >= 0) return { y: m[3] ? +m[3] : year, mo: es, d: +m[1], ...t }
  return null
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Marcas de tiempo de Discord (`<t:1793318400:F>`, las que usan los anuncios oficiales) → "2026/10/30 07:00 (UTC)", que el resto del lector entiende. */
export function discordStamps(s: string): string {
  return s.replace(/<t:(\d{9,11})(?::[tTdDfFR])?>/g, (_m, sec: string) => {
    const d = new Date(+sec * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (UTC)`
  })
}

/**
 * Aviso de temporada (Infinity Nikki "Game Events Overview"): "VERSION 2.11" + "Season starts: <fecha>" + "Season ends: <fecha>" en líneas separadas,
 * y la sección "Limited-Time Resonances" con los banners vigentes ("5-star [Snowbloom Wishsong]"; los de "Upcoming" no traen fecha y se omiten).
 * Devuelve la versión (como parche) y esos banners, que duran como mucho hasta el fin de la temporada (`open`: fin no anunciado).
 */
export function seasonFrom(gameId: string, text: string, year: number, image?: string): { patch?: Patch; banners: GameEvent[] } {
  const lines = text.split('\n').map(clean).filter(Boolean)
  const pick = (re: RegExp) => { const l = lines.find(x => re.test(x)); return l ? dateIn(l.replace(re, ''), year) : null }
  const a = pick(/^.*\b(season|version)?\s*(starts?|begins?|start date)\s*:\s*/i), b = pick(/^.*\b(season|version)?\s*(ends?|end date)\s*:\s*/i)
  if (!a || !b) return { banners: [] }
  const zone = zoneOf(text) ?? 0
  const exact = /\(UTC\)/.test(text) && a.h !== undefined
  const start = Date.UTC(a.y, a.mo, a.d, (a.h ?? 0) - zone, a.mi ?? 0), end = Date.UTC(b.y, b.mo, b.d, (b.h ?? 23) - zone, b.mi ?? 59)
  if (!(end > start)) return { banners: [] }
  const version = /\bversion\s*(\d+(?:\.\d+)+)/i.exec(text)?.[1]
  const patch: Patch | undefined = version ? { id: `${gameId}:patch:${version}`, gameId, version, date: new Date(start).toISOString(), end: new Date(end).toISOString(), notes: '', source: 'api' } : undefined
  const banners: GameEvent[] = []
  let inRes = false
  for (const l of lines) {
    if (/limited[- ]time resonances?/i.test(l)) { inRes = true; continue }
    if (inRes && /^upcoming\b/i.test(l)) break
    if (inRes && /^[⸻—–-]{1,3}\s|^store\b/i.test(l)) break
    const m = inRes && /(\d)\s*-?\s*star\s*\[([^\]]+)\]/i.exec(l)
    if (!m) continue
    banners.push({
      id: `${gameId}:banner:dc:${m[2].trim()}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title: m[2].trim(),
      description: '⟦d.inResonance⟧', image, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: [{ name: m[2].trim(), rarity: +m[1] }], pulls: 0, official: true, source: 'api', open: true,
      precision: exact ? undefined : 'approx',
    })
  }
  return { patch, banners }
}

const SEP = /\s+(?:-|–|—|~|to|until|through|thru)\s+|\s*[~～]\s*/i

interface Range { start: number; end: number; afterMaint: string | null; approx: boolean; open?: boolean }

/**
 * Horas (UTC) de un día sin hora en los avisos de cada juego: inicio y fin. BLEACH: Soul Resonance (avisos de 23 sep, 14 oct y 4 nov 2026): el
 * mantenimiento es los miércoles de 08:00 a 11:00 UTC, así que "September 23, 2026 (after maintenance)" empieza a las 11:00 y "to October 14, 2026"
 * acaba a las 08:00, al empezar el mantenimiento de ese día. Monster Hunter Outlanders ("When Steelwing Descends", 13 nov 2026): 03:00 → 14:59 UTC.
 */
export const DAY_HOURS: Record<string, { start: [number, number]; end: [number, number] }> = {
  bleach: { start: [11, 0], end: [8, 0] },
  mho: { start: [3, 0], end: [14, 59] },
}

/** Sin fecha de fin: "to the end of the special edition" (BLEACH), "– End of Season 0" (MHO), "until the end of the version". */
const OPEN_END = /^\s*(?:the\s+)?end\s+of\s+(?:the\s+)?(?:special\s+edition|edition|version|season|event|patch|update)\b/i
/** Duración en vez de fin: "Unlocks on September 30, lasts for 14 days", "Will unlock on September 23 after maintenance, last for 21 days." (BLEACH). */
const LASTS = /^(?:will\s+)?(?:unlocks?|opens?|starts?|begins?|available)\s+(?:on|from)\s+(.+?)[,;]?\s+(?:and\s+)?lasts?\s+(?:for\s+)?(\d{1,3})\s+days?\b/i

/**
 * "<inicio> – <fin> (UTC±n)" en una línea; "after maintenance" deja el inicio pendiente del aviso de mantenimiento.
 * "Now through <fin>" (Blue Archive: "Event Period: Now through <t:…>") empieza a la hora del mensaje (`postedAt`).
 * `hours`: horas por defecto del juego (DAY_HOURS) para las fechas que no las traen.
 */
export function rangeIn(line: string, year: number, fallbackZone: number, postedAt?: number, hours?: (typeof DAY_HOURS)[string]): Range | null {
  const zone = zoneOf(line) ?? fallbackZone
  const def = (x: { y: number; mo: number; d: number; h?: number; mi?: number }, h: number, mi: number, own?: [number, number]) =>
    x.h !== undefined ? Date.UTC(x.y, x.mo, x.d, x.h - zone, x.mi ?? 0) : own ? Date.UTC(x.y, x.mo, x.d, own[0], own[1]) : Date.UTC(x.y, x.mo, x.d, h - zone, mi)
  const lasts = LASTS.exec(line.trim())
  if (lasts) {
    const a = dateIn(lasts[1], year)
    if (!a) return null
    const after = /after (the )?(maintenance|update)/i.test(lasts[1])
    const start = def(a, 0, 0, hours?.start)
    return { start, end: start + +lasts[2] * DAY - 1000, afterMaint: after ? `${a.y}-${a.mo}-${a.d}` : null, approx: !after && a.h === undefined }
  }
  const body = line.replace(/^[^:]*?(period|duration|time|date|schedule)\s*:\s*/i, '')
  const parts = body.split(SEP)
  if (parts.length < 2) return null
  // Fin sin anunciar: se dibuja 6 semanas (`open`: la app no lo muestra como fecha).
  if (OPEN_END.test(parts.slice(1).join(' '))) {
    const a = dateIn(parts[0], year)
    if (!a) return null
    const after = /after (the )?(maintenance|update)/i.test(parts[0])
    const start = def(a, 0, 0, hours?.start)
    return { start, end: start + 42 * DAY, afterMaint: after ? `${a.y}-${a.mo}-${a.d}` : null, approx: !after && a.h === undefined, open: true }
  }
  if (postedAt !== undefined && /^\s*(?:from\s+)?(?:now|today)\s*$/i.test(parts[0])) {
    const b = dateIn(parts.slice(1).join(' '), new Date(postedAt).getUTCFullYear())
    if (!b) return null
    const end = Date.UTC(b.y, b.mo, b.d, (b.h ?? 23) - zone, b.mi ?? 59) + 59_000
    return { start: postedAt, end, afterMaint: null, approx: b.h === undefined }
  }
  const a = dateIn(parts[0], year), b = dateIn(parts.slice(1).join(' '), a?.y ?? year)
  if (!a || !b) return null
  if (b.y === a.y && (b.mo < a.mo || (b.mo === a.mo && b.d < a.d)) && !/\d{4}/.test(parts.slice(1).join(' '))) b.y++
  const after = /after (the )?(maintenance|update)/i.test(parts[0])
  // Sin hora: la del juego (DAY_HOURS) si se conoce; si no, el día entero en la zona del aviso (como hasta ahora).
  const end = b.h === undefined && hours ? def(b, 23, 59, hours.end) + (hours.end[1] === 59 ? 59_000 : 0) : def(b, 23, 59) + 59_000
  return { start: def(a, 0, 0, hours?.start), end, afterMaint: after ? `${a.y}-${a.mo}-${a.d}` : null, approx: !after && a.h === undefined }
}

/**
 * Ruido de los avisos reenviados: la mención del rol que los anuncia ("@News Feed", "@Schale news"), el aviso de tuit nuevo y los enlaces.
 * Sin esto, el título de un aviso de Azur Lane era "@News Feed https://twitter.com/…".
 */
const noise = (s: string) => s.replace(/<?https?:\/\/\S+>?/g, '')
  // Emojis propios del servidor ("<:3_:801450203134689291>"): quedaban en el título del aviso.
  .replace(/<a?:[\w~]+:\d+>/g, '')
  .replace(/^\s*@\S+(?:\s+(?:news|feed|updates?|announcements?|notifications?|alerts?))?\s*/i, '')
  .replace(/^\s*a new (tweet|post) has been posted!?\s*/i, '')
  // Tuits reenviados: la línea del autor ("DuetNightAbyss (@DNAbyss_EN)") no es el nombre de nada.
  // También en negrita, como título del embed de Readybot ("**Trickcal:Chibi Go (@trickcal_en) on X**").
  .replace(/^\s*(?:\*\*|__)?[^()\n*]{1,40}\(@\w{1,30}\)(?:\s+on\s+(?:X|Twitter))?(?:\*\*|__)?\s*$/i, '')

/**
 * Tuits de Readybot (Trickcal, 12 nov 2026): "Trickcal:Chibi Go" y "@trickcal_en" en dos líneas antes del texto. El nombre de la cuenta no es el de
 * ningún evento (salía "Trickcal:Chibi Go" de título): se vacían las dos líneas. Va antes de `noise`, que ya borra la del "@".
 */
export function dropTweetAuthor(lines: string[]): string[] {
  const out = [...lines]
  for (let i = 0; i + 1 < out.length; i++)
    if (/^\s*@(?!everyone\b|here\b)\w{1,30}\s*$/.test(out[i + 1]) && out[i].trim().length <= 40 && !/\d{1,2}[:/]\d/.test(out[i])) { out[i] = ''; out[i + 1] = '' }
  return out
}
/**
 * Saludos que no son el nombre de nada: "Dear Commander,", "Dear Tyrant,", "Sensei,", "Hello Doctors!". Cualquier "Dear …" corto o una línea corta
 * que acaba en coma cuenta, para no tener que añadir el apodo de cada juego (Stella Sora, 11 nov 2026: el evento se llamaba "Dear Tyrant,").
 */
const GREETING = /^(?:(?:dear|hello|hi|hey|greetings),?\s+[^.!?:]{1,40}|(?:commanders?|doctors?|sensei|managers?|captains?|trailblazers?|travell?ers?|proxies|trekkers?|tyrants?|everyone|all))\s*[,!]?$/i
const isGreeting = (c: string) => GREETING.test(c) || /^[^.!?:\d]{1,30},$/.test(c)
/**
 * Rótulos de apartado que no son el nombre de nada: "▌ Event Period", "Recruitment Period", "Details", "Rewards". Si se tomaban como cabecera,
 * el evento se llamaba "Event Period".
 */
const LABEL = /^(?:[\w-]+\s+){0,2}(?:period|duration|time|dates?|schedule|details?|rewards?|notes?|overview|rules|requirements?|(?:unlock\s+)?conditions?|how to (?:join|participate|play))\s*:?$/i
/**
 * Nombre dentro de una frase. `loose` añade el patrón "X will be available", que solo vale en la propia línea del periodo (en una frase cualquiera
 * daba nombres como "A new hotfix for Stella Sora").
 */
function sentenceName(c: string, loose = true): string | undefined {
  // "The collab event, It's Showtime! Angels' Azur Stage, will be available…" (Azur Lane).
  const m = /\b(?:event|banner|rerun|campaign|collab(?:oration)?)\s*,\s*["“]?(.{3,80}?)["”]?\s*,\s+(?:will|is|has|runs?|starts?|begins?)\b/i.exec(c)
    // "Limited event: Map the Uncharted With Pen in Hand is coming soon", "Limited recruitment event: Boundless Journey, Endless Romance will begin soon!" (Stella Sora).
    ?? /\b(?:event|recruitment|banner|rerun|campaign|collab(?:oration)?|pick-?up|gacha|headhunting|summon)\s*[:：]\s*["“「『]?(.{3,80}?)["”」』]?\s+(?:is (?:coming|here|now|live|back)|will|has (?:begun|started|arrived)|returns?|starts?|begins?|runs?|arrives?)\b/i.exec(c)
    ?? /^the\s+["“]?(.{3,80}?)["”]?\s+(?:event|campaign)\s+(?:will|is|runs?|starts?|begins?)\b/i.exec(c)
    // "Weekend Event [Trick Dice] begin! Participate for…" (Trickcal, 6 nov 2026): el nombre entre corchetes justo después de "Event".
    ?? /\b(?:event|campaign|recruitment|banner)\s*[[「『]([^\]」』]{2,60})[\]」』]\s*(?:will|is|has|begins?|starts?|returns?|arrives?|opens?|[!,.:]|$)/i.exec(c)
    // "Limited collab gear skins will be available between 11/12 - 11/26…" (Azur Lane): sin esto el título era la frase entera cortada.
    ?? (loose ? /^["“]?([A-Z][^.!?]{2,70}?)["”]?\s+(?:will be|are|is)\s+(?:available|live|held|running)\b/.exec(c) : null)
  return m?.[1].trim()
}

/**
 * Quita del nombre lo que no es nombre: "Event Preview: When Steelwing Descends" (MHO) → "When Steelwing Descends"; "Limited-Time Gacha: Soi Fon" y
 * "Candice Limited-Time Gacha" (BLEACH) → "Soi Fon", "Candice"; "Candice Themed Event: Execution Begins" → "Execution Begins".
 */
export function tidyName(s: string): string {
  return s.replace(/^(?:event\s+)?(?:preview|announcement|notice|reminder)\s*[:：]\s*/i, '')
    .replace(/^.{0,30}?\bthemed event(?:\s*\d+)?\s*[:：]\s*/i, '')
    .replace(/^limited[- ]time (?:gacha|banner|event)\s*[:：]\s*/i, '')
    .replace(/\s+limited[- ]time (?:gacha|banner)$/i, '')
    // "Apex Challenge Starts Today!" (MHO) → "Apex Challenge".
    // Solo con "today/now" o con "!": "Execution Begins" (BLEACH) es el nombre del evento.
    .replace(/\s+(?:(?:starts?|begins?|returns?)\s+(?:today|now)|is (?:now )?live|now live|is here)\s*!*$|\s+(?:starts?|begins?)\s*!+$/i, '').trim() || s
}

/** Tipo delante del nombre en una cabecera: "Event: X", "Limited Headhunting: X", "New Pick-Up Recruitment: X". */
const TYPE_PREFIX = /^(?:(?:new|limited(?:-time)?|special|unique|collab(?:oration)?|rerun)\s+){0,3}(?:event|banner|recruitment|headhunting|pick-?up(?:\s+recruitment)?|gacha|summon|resonance|warp|wish|rerun)\s*[:：]\s*/i

/** Viñetas y marcas de apartado al principio de una línea ("▌", "■", "◆", "►"…). */
const MARKS = '■◆●▶◇□・▌▍▎▐►▷▸▹◢◣✦✧◈❖♦◎'
const clean = (s: string) => s.replace(/[*_`#>|]+/g, '').replace(new RegExp(`^[\\s${MARKS}\\-–•]+`), '').replace(/[【】]/g, ' ').replace(/\s+/g, ' ').trim()
  // Rótulo entre corchetes en toda la línea ("◈ [Event Duration]", Duet Night Abyss) → "Event Duration".
  .replace(/^\[([^[\]]+)\]$/, '$1')
  // Emojis delante ("💜The Dreamland event…", "🕒Event Period:", "⭐️ Apostle…", tuits de Trickcal): no son parte del nombre ni del rótulo.
  .replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '')
// Una lista "[Pristine Hourglass], [Coin]" (recompensas de DNA) empieza por corchete pero no es una cabecera.
const isHeading = (raw: string) => !/^\s*\[[^\]]*\]\s*[,，、]/.test(raw) && (new RegExp(`^\\s*(\\*\\*|__|#+\\s|[${MARKS}【[])`).test(raw) || /\*\*\s*$/.test(raw))

/**
 * Inicio y fin en líneas separadas ("Start: Nov. 12, 2026 after maintenance" / "End: Dec. 03, 2026 19:59 (UTC-7)", Stella Sora 11 nov 2026)
 * → una sola línea "Period: <inicio> – <fin>" que `rangeIn` entiende; la del fin queda vacía (los índices no cambian). Las de temporada
 * ("Season starts:") se dejan para `seasonFrom`.
 */
const START_L = /^(?!season|version)((?:[\w-]+\s+){0,2})(?:start(?:s|ing)?|begins?|beginning|from|opens?)(?:\s+(?:time|date|at|on))?\s*[:：]\s*(.+)$/i
const END_L = /^(?!season|version)(?:[\w-]+\s+){0,2}(?:end(?:s|ing)?|until|closes?|to)(?:\s+(?:time|date|at|on))?\s*[:：]\s*(.+)$/i
function joinStartEnd(lines: string[]): string[] {
  const out = [...lines]
  for (let i = 0; i < out.length; i++) {
    const a = START_L.exec(clean(out[i]))
    if (!a) continue
    // El fin va en una de las dos líneas siguientes con texto.
    for (let j = i + 1, seen = 0; j < out.length && seen < 2; j++) {
      const c = clean(out[j])
      if (!c) continue
      seen++
      const b = END_L.exec(c)
      if (!b) continue
      // Se conserva lo que precede a "Start" ("Maintenance Start:" → "Maintenance Period:"): así un mantenimiento sigue sin contar como evento.
      out[i] = `${a[1]}Period: ${a[2]} – ${b[1]}`
      out[j] = ''
      break
    }
  }
  // "… maintenance from <t:…>" / "to" / "<t:…>" en tres líneas (BLEACH, 4 nov 2026) → una sola línea con el rango.
  for (let i = 0; i + 2 < out.length; i++) {
    if (/^(?:to|until|through|[-–~～])$/i.test(clean(out[i + 1])) && /\d{1,2}:\d{2}|\d{4}[/-]\d{1,2}/.test(out[i]) && /\d/.test(out[i + 2])) {
      out[i] = `${out[i].trimEnd()} – ${clean(out[i + 2])}`
      out[i + 1] = ''
      out[i + 2] = ''
    }
  }
  return out
}

/** "★5 Trekker, Leafia", "★4 Trekkers, Ridge and Amber", "5★ Character: X" → destacados de un banner. */
function featuredIn(lines: string[]): { name: string; rarity: number; tag?: string }[] {
  const out: { name: string; rarity: number; tag?: string }[] = []
  const re = /(?:[★☆]\s*(\d)|(\d)\s*[★☆]|(\d)-star)\s+[A-Z][\w-]*s?\s*[,:：]\s*([A-Z][^.!?\n]{0,60}?)(?=\s+(?:is|are|will|has|have)\b|[.!?]|$)/g
  for (const l of lines) for (const m of l.matchAll(re)) {
    const rarity = +(m[1] ?? m[2] ?? m[3])
    for (const n of m[4].split(/\s*,\s*|\s+and\s+|\s*&\s*/)) {
      const name = n.trim()
      if (name && name.length <= 40 && !out.some(f => f.name === name)) out.push({ name, rarity })
    }
  }
  // "★3 Vivi,★3 Rohne Limited-Time Rate Up" (Trickcal): estrella y nombre sin tipo delante; solo si lo anterior no encontró nada.
  if (!out.length) for (const l of lines) for (const m of l.matchAll(/[★☆]\s*(\d)\s+([A-Z][\w'-]{1,20})(?=\s*[,&]|\s+and\b|\s+(?:limited|rate|pick)|$)/gi)) {
    if (!/^(?:apostles?|limited|rate|pick)$/i.test(m[2]) && !out.some(f => f.name === m[2])) out.push({ name: m[2], rarity: +m[1] })
  }
  // 'Limited SSR Character "Candice"', 'Limited SSR Weapon Stamp "Execution Verdict"' (BLEACH): solo si lo anterior no encontró nada.
  if (!out.length) for (const l of lines) for (const m of l.matchAll(/\b(UR|SSR|SR|[5-6]★|★[5-6])\s+(Character|Weapon Stamp|Core Stamp|Stamp|Weapon|Doll|Adventurer)\s+["“]([^"”]{2,40})["”]/g)) {
    if (!out.some(f => f.name === m[3])) out.push({ name: m[3], rarity: /^SR$/.test(m[1]) ? 4 : 5, ...(/character|doll|adventurer/i.test(m[2]) ? {} : { tag: m[2] }) })
  }
  return out.sort((a, b) => b.rarity - a.rarity)
}

/** Hora del servidor de los juegos cuyos avisos dicen "(server time)" sin zona. Duet Night Abyss: servidor de América, UTC-5 (dna.ts). */
const SERVER_ZONE: Record<string, number> = { dna: -5 }

/** Línea de un periodo por región: "Asia/HMT/SEA: July 23, 2026, 10:00 - …", "Europe: …", "America: …". */
const REGION = /^(?:(?:asia|europe|eu|americas?|na|north america|sea|hmt|tw|hk|mo|jp|kr|global|other regions?)[\s/,&]*)+[:：]\s*/i
/**
 * Avisos con el periodo repetido por región (Duet Night Abyss: Asia UTC+8, Europa UTC+1, América UTC-5, a la misma hora local): se queda la de
 * América (la de nuestro público; si no está, la primera) sin el nombre de la región y las demás se vacían. Así no salen tres eventos ni uno llamado "America".
 */
export function pickRegion(lines: string[]): string[] {
  const idx = lines.map((l, i) => (REGION.test(clean(l)) && /\d/.test(l) ? i : -1)).filter(i => i >= 0)
  if (!idx.length) return lines
  const keep = idx.find(i => /^(?:north\s+)?americas?\b|^na\b/i.test(clean(lines[i]))) ?? idx[0]
  return lines.map((l, i) => (i === keep ? clean(l).replace(REGION, '') : idx.includes(i) ? '' : l))
}

/** "◈ [Rewards]" seguido de "[Pristine Hourglass], [Secret Letter Clue], [Coin]": nombres sin cantidad (amount 0 = sin cifra en la ficha). */
export function bracketRewards(section: string[]): { name: string; amount: number }[] {
  const at = section.findIndex(l => LABEL.test(l) && /reward/i.test(l))
  if (at < 0) return []
  const out: { name: string; amount: number }[] = []
  for (const l of section.slice(at + 1)) {
    if (!l) continue
    if (LABEL.test(l)) break
    for (const m of l.matchAll(/\[([^[\]]{2,40})\]/g)) if (!out.some(o => o.name === m[1].trim())) out.push({ name: m[1].trim(), amount: 0 })
  }
  return out.slice(0, 10)
}

export async function syncDiscord(gameId: string): Promise<GameSync> {
  const channel = discordChannel(gameId)
  if (!channel) return { events: [], patches: [], codes: [] }
  const res = await fetch(viaProxy(`${API}/${channel}/messages?limit=100`))
  if (!res.ok) throw new Error(`discord ${gameId} → HTTP ${res.status}`)
  const messages = (await res.json()) as Message[]
  if (!Array.isArray(messages)) throw new Error('discord: respuesta inesperada')
  return parseNotices(gameId, messages)
}

/**
 * El lector de avisos, separado de Discord: también lee los avisos de las webs oficiales (Trickcal, `trickcal.ts`), pasados como mensajes
 * (`content` = texto del aviso, `timestamp` = publicación). Mensajes del más nuevo al más viejo, como los da Discord.
 */
export function parseNotices(gameId: string, messages: Message[]): GameSync {
  const textOf = (m: Message) => discordStamps([m.content, ...(m.embeds ?? []).flatMap(e => [e.title ? `**${e.title}**` : '', e.description ?? '', ...(e.fields ?? []).flatMap(f => [`**${f.name}**`, f.value])])].join('\n'))
  const imageOf = (m: Message) => m.attachments?.find(a => /^image\//.test(a.content_type ?? '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url))?.url
    ?? m.embeds?.find(e => e.image?.url)?.image?.url ?? m.embeds?.find(e => e.thumbnail?.url)?.thumbnail?.url

  // Fin real de cada mantenimiento ("Maintenance … 2026/10/19 13:00 - 21:00 (UTC-7)"), por día de inicio.
  const maintEnd = new Map<string, number>()
  // Solo el inicio ("Trickcal will undergo maintenance on 2026/11/05 11:00 (UTC+9)"): lo "after maintenance" empieza ahí, aproximado.
  const maintAt = new Map<string, number>()
  for (const m of messages) {
    const text = textOf(m)
    if (!/maintenance/i.test(text)) continue
    const year = new Date(m.timestamp).getUTCFullYear()
    for (const line of joinStartEnd(text.split('\n'))) {
      if (!/maintenance|time|period/i.test(line)) continue
      const parts = line.split(SEP)
      const a = dateIn(parts[0] ?? '', year)
      const tail = parts.slice(1).join(' ')
      const tEnd = /(\d{1,2}):(\d{2})/.exec(tail)
      if (a && a.h !== undefined && !tEnd && parts.length === 1 && /\bmaintenance\s+(?:on|at|from)\b/i.test(line)) {
        const k = `${a.y}-${a.mo}-${a.d}`
        if (!maintAt.has(k)) maintAt.set(k, Date.UTC(a.y, a.mo, a.d, a.h - (zoneOf(line) ?? 0), a.mi ?? 0))
        continue
      }
      if (!a || a.h === undefined || !tEnd) continue
      const b = dateIn(tail, a.y) ?? a
      const zone = zoneOf(line) ?? 0
      maintEnd.set(`${a.y}-${a.mo}-${a.d}`, Date.UTC(b.y, b.mo, b.d, +tEnd[1] - zone, +tEnd[2]))
      break
    }
  }

  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  const seen = new Set<string>()
  for (const m of messages) {
    const raw = pickRegion(joinStartEnd(dropTweetAuthor(textOf(m).split('\n')).map(noise)))
    const year = new Date(m.timestamp).getUTCFullYear()
    // "(server time)" sin zona: la del servidor del juego.
    const msgZone = zoneOf(raw.join(' ')) ?? SERVER_ZONE[gameId] ?? 0
    const image = imageOf(m)
    const firstLine = raw.findIndex(l => clean(l) && !isGreeting(clean(l)) && !LABEL.test(clean(l)))
    // Nombre por defecto: la primera línea si es corta (un título); si es una frase larga, el nombre que se saque de alguna frase ("Limited event: X is coming soon").
    let heading = firstLine >= 0 && clean(raw[firstLine]).length <= 90 ? clean(raw[firstLine]) : ''
    let headAt = Math.max(firstLine, 0)
    // `fromHead`: el nombre viene de una cabecera de verdad (■, **…**); entonces una frase posterior no lo sustituye.
    let fromHead = false
    // Último rótulo visto ("Recruitment Period"): ayuda a saber si el periodo es de un banner.
    let label = ''
    // Nombres que ya tuvieron periodo en este mensaje (aunque se descartaran por fecha).
    const msgNames = new Set<string>()
    for (const [i, line] of raw.entries()) {
      const c = clean(line)
      if (!c) continue
      const r = rangeIn(c, year, msgZone, +new Date(m.timestamp), zoneOf(raw.join(' ')) === undefined ? DAY_HOURS[gameId] : undefined)
      if (!r) {
        if (LABEL.test(c)) { label = c; continue }
        // "■ Limited Headhunting: Sea of Stars" → "Sea of Stars"; el prefijo queda en `label` para saber que es un banner.
        if (isHeading(line) && c.length <= 90 && !/:$/.test(c) && !isGreeting(c)) {
          const p = TYPE_PREFIX.exec(c)
          heading = p && c.length > p[0].length + 2 ? c.slice(p[0].length) : c; headAt = i; fromHead = true; label = p?.[0] ?? ''
          continue
        }
        const s = !fromHead && sentenceName(c, false)
        if (s) { heading = s; headAt = i; label = '' }
        continue
      }
      // Avisos de mantenimiento ("the service will be unavailable during … through …"): ya se usaron para `maintEnd`, no son eventos.
      if (/maintenance|unavailable/i.test(c) && !/after (the )?(maintenance|update)/i.test(c)) continue
      // "Bounty / Scrimmage Triple Rewards: 11/9 (Mon) 19:00 ~ …" → el nombre va en la misma línea.
      // (Los dos puntos de una hora, "11:59", no cuentan: con ellos el nombre era la frase entera hasta la hora.)
      const inline = /^(.{3,80}?)(?<!\d):(?!\d)\s*\S/.exec(c)?.[1]
      // Sin emojis al final ("… On-Time Gift 🎁").
      // Título en la línea justo encima del periodo, sin viñeta (BLEACH: " Limited-Time Gacha: Soi Fon" / " Event Period: …"; " Deck Inspector" /
      // " Unlocks on …, lasts for 14 days"): manda sobre una cabecera más lejana. Solo una línea corta que no sea una frase ni un rótulo.
      // La propia cabecera cuenta si salió de una frase ("Candice Themed Event: Execution Begins" daba "Execution", con "Begins" como verbo).
      const prevAt = (() => { for (let j = i - 1; j > headAt || (j === headAt && !fromHead && j >= 0); j--) if (clean(raw[j])) return j; return -1 })()
      const prev = prevAt >= 0 ? clean(raw[prevAt]) : ''
      const near = prev && prev.length <= 60 && !/[.!?,:;]$/.test(prev) && !isGreeting(prev) && !LABEL.test(prev) && !rangeIn(prev, year, msgZone) && /^[A-Z0-9"“「]/.test(prev) ? prev : ''
      const lineName = inline && !/period|duration|time|date|schedule|unlocks?|opens?/i.test(inline) ? inline : sentenceName(c)
      const name = tidyName(lineName ?? (near || heading)).replace(/[\s\p{Extended_Pictographic}️]+$/u, '')
      if (!name) continue
      if (near && !lineName) { label = /gacha|banner|recruit|summon/i.test(near) ? near : label; headAt = prevAt }
      // "Reward Claiming Time: …" (Trickcal, Trick Dice) es el plazo para canjear lo ganado, no el evento: solo vale si el mensaje no dio otro periodo
      // para ese nombre (antes, con el evento ya terminado, salía como vigente hasta el fin del canje).
      const claim = /^(?:reward\s+)?(?:claim(?:ing)?|redemption|exchange)\b[^:]{0,20}(?:time|period)/i.test(c)
      if (claim && msgNames.has(name)) continue
      msgNames.add(name)
      let start = r.start, approx = r.approx
      if (r.afterMaint) {
        const e = maintEnd.get(r.afterMaint)
        if (e) start = e
        else { approx = true; start = maintAt.get(r.afterMaint) ?? start }
      }
      if (!(r.end > start) || r.end < from || start > to || r.end - start > 150 * DAY) continue
      // "200 FREE RECRUITMENTS" (Blue Archive, 10 nov 2026) es un evento de inicio de sesión que regala tiradas, no un banner.
      // El tipo sale del nombre y, si no lo dice, del rótulo del periodo ("Recruitment Period") o de la frase de la que salió el nombre
      // ("Limited recruitment event: Boundless Journey, Endless Romance…").
      const ctx = [name, label, name === heading && !fromHead ? clean(raw[headAt]).slice(0, 120) : ''].join(' | ')
      const kind: Kind = !/\bfree\b.{0,20}(recruit|pulls?|summons?|draws?)/i.test(ctx) && /recruit|banner|pick-?up|rate[- ]?up|gacha|headhunting|resonance|limited.*(trekker|student)/i.test(ctx) ? 'banner' : 'event'
      const id = `${gameId}:${kind}:dc:${name}:${new Date(start).toISOString().slice(0, 10)}`
      if (seen.has(id)) continue
      seen.add(id)
      // Recompensas: los "Nombre xN" / "600 Pyroxenes" del apartado del evento (desde su título hasta el siguiente); tiradas según pulls.ts.
      let nextHead = raw.findIndex((l, j) => j > i && isHeading(l) && clean(l).length <= 90 && !LABEL.test(clean(l)))
      // Sin cabeceras marcadas (BLEACH): el apartado acaba en el título del siguiente periodo (la línea con texto anterior a él).
      if (near && !lineName) {
        const nextRange = raw.findIndex((l, j) => j > i && !!clean(l) && !!rangeIn(clean(l), year, msgZone))
        if (nextRange > 0) {
          let t = nextRange - 1
          while (t > i && !clean(raw[t])) t--
          if (t > i && (nextHead < 0 || t < nextHead)) nextHead = t
        }
      }
      const section = raw.slice(headAt, nextHead > 0 ? nextHead : raw.length).map(clean)
      const found = kind === 'event' ? pullsIn(gameId, section) : { pulls: 0, items: [] }
      const pulls = found.pulls
      const items = found.items.length ? found.items : kind === 'event' ? bracketRewards(section) : []
      const featured = kind === 'banner' ? featuredIn(section) : []
      const base: GameEvent = {
        id, gameId, kind, title: name, image,
        start: new Date(start).toISOString(), end: new Date(r.end).toISOString(),
        items, featured, pulls, official: true, source: 'api',
        precision: approx ? 'approx' : undefined, open: r.open || undefined,
      }
      // Varios rate-up en el título ("Apostle ★3 Vivi,★3 Rohne Limited-Time Rate Up", Trickcal): un banner por Apóstol, para unirse con los de lootandwaifus.
      const stars = (name.match(/[★☆]\s*\d/g) ?? []).length
      const split = kind === 'banner' && stars >= 2 ? featured.filter(f => name.includes(f.name)) : []
      if (split.length >= 2) {
        for (const f of split) {
          const sid = `${gameId}:banner:dc:${f.name}:${new Date(start).toISOString().slice(0, 10)}`
          if (!seen.has(sid)) { seen.add(sid); out.push({ ...base, id: sid, title: f.name, featured: [f] }) }
        }
      } else out.push(base)
    }
  }
  // Avisos de temporada: versión (parche) y banners vigentes. Si se repite la versión, manda el aviso más reciente (los mensajes llegan del más nuevo al más viejo).
  const patches: Patch[] = []
  for (const m of messages) {
    const { patch, banners } = seasonFrom(gameId, textOf(m), new Date(m.timestamp).getUTCFullYear(), imageOf(m))
    if (patch && !patches.some(p => p.version === patch.version)) patches.push(patch)
    for (const b of banners) if (!seen.has(b.id) && +new Date(b.end) > from) { seen.add(b.id); out.push(b) }
  }
  return { events: out, patches, codes: codesFrom(messages.map(m => ({ text: textOf(m), at: +new Date(m.timestamp) }))) }
}

/** Palabras en mayúsculas que no son códigos aunque vayan solas en una línea. */
const NOT_CODE = /^(REDEEM|REDEMPTION|CODES?|REWARDS?|EXPIRES?|EXPIRATION|VALID|UNTIL|NOTICE|IMPORTANT|EVENT|UPDATE|GLOBAL|SERVER|DIAMONDS?)$/
/**
 * Códigos de canje en los anuncios (p. ej. el #redeem-codes oficial): "Redemption Code: ABC123", "Code - ABC123" o el código solo en una línea
 * dentro de un mensaje que habla de códigos. Recompensas: los "Nombre x100" del mismo mensaje; caducidad: "valid until / expires … <fecha>".
 * Solo mensajes de los últimos 45 días y que no digan que el código caducó.
 */
export function codesFrom(msgs: { text: string; at: number }[]): PromoCode[] {
  const out: PromoCode[] = []
  for (const { text, at } of msgs) {
    if (Date.now() - at > 45 * DAY || !/\bcodes?\b/i.test(text) || /\b(expired|no longer valid)\b/i.test(text)) continue
    const found = new Set<string>()
    for (const m of text.matchAll(/\bcodes?\b[^\n:：-]{0,30}[:：-]\s*`?([A-Za-z0-9]{5,24})`?/gi)) found.add(m[1])
    for (const line of text.split('\n')) {
      const c = line.replace(/[*_`>|]+/g, '').trim()
      if (/^[A-Z0-9]{6,24}$/.test(c) && /[A-Z]/.test(c) && !NOT_CODE.test(c)) found.add(c)
    }
    if (!found.size) continue
    // "Diamond x100, Bling x20,000" → ["Diamond ×100", "Bling ×20,000"]; sin verbos delante ("Redeem for …") ni puntuación pegada a la cifra.
    const rewards = [...text.matchAll(/([A-Z][A-Za-z' ]{2,40}?)\s*[x×]\s?(\d(?:[\d,.]*\d)?\s*[kK]?)/g)]
      .map(m => `${clean(m[1]).replace(/^.*\b(?:for|get|obtain|receive|claim|rewards?:?)\s+/i, '')} ×${m[2].trim()}`)
    const until = /(?:valid until|until|expires?(?: on)?|expiration(?: date)?)\s*:?\s*([A-Za-z]{3,9}\.? \d{1,2}(?:,? \d{4})?|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i.exec(text)?.[1]
    for (const code of found) {
      if (out.some(c => c.code.toUpperCase() === code.toUpperCase()) || /^(?:code|codes)$/i.test(code)) continue
      out.push({ code, rewards: [...rewards.slice(0, 6), ...(until ? [`Until ${until}`] : [])] })
    }
  }
  return out
}
