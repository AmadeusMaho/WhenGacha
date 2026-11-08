import { viaProxy } from '../net'
import type { GameEvent, Kind, Patch, PromoCode } from '../types'
import type { GameSync } from './ennead'

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
interface Message { id: string; content: string; timestamp: string; embeds?: Embed[]; attachments?: { url: string; content_type?: string }[] }

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
  const time = /(\d{1,2}):(\d{2})/.exec(s.replace(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/, ''))
  const t = time ? { h: +time[1], mi: +time[2] } : {}
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

interface Range { start: number; end: number; afterMaint: string | null; approx: boolean }

/**
 * "<inicio> – <fin> (UTC±n)" en una línea; "after maintenance" deja el inicio pendiente del aviso de mantenimiento.
 * "Now through <fin>" (Blue Archive: "Event Period: Now through <t:…>") empieza a la hora del mensaje (`postedAt`).
 */
function rangeIn(line: string, year: number, fallbackZone: number, postedAt?: number): Range | null {
  const body = line.replace(/^[^:]*?(period|duration|time|date|schedule)\s*:\s*/i, '')
  const parts = body.split(SEP)
  if (parts.length < 2) return null
  const zone = zoneOf(line) ?? fallbackZone
  if (postedAt !== undefined && /^\s*(?:from\s+)?(?:now|today)\s*$/i.test(parts[0])) {
    const b = dateIn(parts.slice(1).join(' '), new Date(postedAt).getUTCFullYear())
    if (!b) return null
    const end = Date.UTC(b.y, b.mo, b.d, (b.h ?? 23) - zone, b.mi ?? 59) + 59_000
    return { start: postedAt, end, afterMaint: null, approx: b.h === undefined }
  }
  const a = dateIn(parts[0], year), b = dateIn(parts.slice(1).join(' '), a?.y ?? year)
  if (!a || !b) return null
  if (b.y === a.y && (b.mo < a.mo || (b.mo === a.mo && b.d < a.d)) && !/\d{4}/.test(parts.slice(1).join(' '))) b.y++
  const at = (x: NonNullable<typeof a>, h: number, mi: number) => Date.UTC(x.y, x.mo, x.d, (x.h ?? h) - zone, x.mi ?? mi)
  const after = /after (the )?(maintenance|update)/i.test(parts[0])
  const end = at(b, 23, 59) + 59_000
  return { start: at(a, 0, 0), end, afterMaint: after ? `${a.y}-${a.mo}-${a.d}` : null, approx: !after && a.h === undefined }
}

const clean = (s: string) => s.replace(/[*_`#>|]+/g, '').replace(/^[\s■◆●▶◇□・\-–•]+/, '').replace(/[【】]/g, ' ').replace(/\s+/g, ' ').trim()
const isHeading = (raw: string) => /^\s*(\*\*|__|#+\s|[■◆●▶◇□【[])/.test(raw) || /\*\*\s*$/.test(raw)

export async function syncDiscord(gameId: string): Promise<GameSync> {
  const channel = discordChannel(gameId)
  if (!channel) return { events: [], patches: [], codes: [] }
  const res = await fetch(viaProxy(`${API}/${channel}/messages?limit=100`))
  if (!res.ok) throw new Error(`discord ${gameId} → HTTP ${res.status}`)
  const messages = (await res.json()) as Message[]
  if (!Array.isArray(messages)) throw new Error('discord: respuesta inesperada')

  const textOf = (m: Message) => discordStamps([m.content, ...(m.embeds ?? []).flatMap(e => [e.title ? `**${e.title}**` : '', e.description ?? '', ...(e.fields ?? []).flatMap(f => [`**${f.name}**`, f.value])])].join('\n'))
  const imageOf = (m: Message) => m.attachments?.find(a => /^image\//.test(a.content_type ?? '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url))?.url
    ?? m.embeds?.find(e => e.image?.url)?.image?.url ?? m.embeds?.find(e => e.thumbnail?.url)?.thumbnail?.url

  // Fin real de cada mantenimiento ("Maintenance … 2026/10/19 13:00 - 21:00 (UTC-7)"), por día de inicio.
  const maintEnd = new Map<string, number>()
  for (const m of messages) {
    const text = textOf(m)
    if (!/maintenance/i.test(text)) continue
    const year = new Date(m.timestamp).getUTCFullYear()
    for (const line of text.split('\n')) {
      if (!/maintenance|time|period/i.test(line)) continue
      const parts = line.split(SEP)
      const a = dateIn(parts[0] ?? '', year)
      const tail = parts.slice(1).join(' ')
      const tEnd = /(\d{1,2}):(\d{2})/.exec(tail)
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
    const raw = textOf(m).split('\n')
    const year = new Date(m.timestamp).getUTCFullYear()
    const msgZone = zoneOf(raw.join(' ')) ?? 0
    const image = imageOf(m)
    let heading = clean(raw.find(l => clean(l)) ?? '')
    for (const line of raw) {
      const c = clean(line)
      if (!c) continue
      const r = rangeIn(c, year, msgZone, +new Date(m.timestamp))
      if (!r) { if (isHeading(line) && c.length <= 90 && !/:$/.test(c)) heading = c; continue }
      // "Bounty / Scrimmage Triple Rewards: 11/9 (Mon) 19:00 ~ …" → el nombre va en la misma línea.
      const inline = /^(.{3,80}?):\s*\S/.exec(c)?.[1]
      // Sin emojis al final ("… On-Time Gift 🎁").
      const name = (inline && !/period|duration|time|date|schedule/i.test(inline) ? inline : heading).replace(/[\s\p{Extended_Pictographic}️]+$/u, '')
      if (!name) continue
      let start = r.start, approx = r.approx
      if (r.afterMaint) {
        const e = maintEnd.get(r.afterMaint)
        if (e) start = e
        else approx = true
      }
      if (!(r.end > start) || r.end < from || start > to || r.end - start > 150 * DAY) continue
      const kind: Kind = /recruit|banner|pick-?up|rate[- ]?up|gacha|headhunting|resonance|limited.*(trekker|student)/i.test(name) ? 'banner' : 'event'
      const id = `${gameId}:${kind}:dc:${name}:${new Date(start).toISOString().slice(0, 10)}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        id, gameId, kind, title: name, image,
        start: new Date(start).toISOString(), end: new Date(r.end).toISOString(),
        items: [], featured: [], pulls: 0, official: true, source: 'api',
        precision: approx ? 'approx' : undefined,
      })
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
