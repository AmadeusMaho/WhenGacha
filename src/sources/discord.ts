import { viaProxy } from '../net'
import type { GameEvent, Kind } from '../types'
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
  return null
}

const SEP = /\s+(?:-|–|—|~|to|until)\s+|\s*[~～]\s*/i

interface Range { start: number; end: number; afterMaint: string | null; approx: boolean }

/** "<inicio> – <fin> (UTC±n)" en una línea; "after maintenance" deja el inicio pendiente del aviso de mantenimiento. */
function rangeIn(line: string, year: number, fallbackZone: number): Range | null {
  const body = line.replace(/^[^:]*?(period|duration|time|date|schedule)\s*:\s*/i, '')
  const parts = body.split(SEP)
  if (parts.length < 2) return null
  const zone = zoneOf(line) ?? fallbackZone
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

  const textOf = (m: Message) => [m.content, ...(m.embeds ?? []).flatMap(e => [e.title ? `**${e.title}**` : '', e.description ?? '', ...(e.fields ?? []).flatMap(f => [`**${f.name}**`, f.value])])].join('\n')
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
      const r = rangeIn(c, year, msgZone)
      if (!r) { if (isHeading(line) && c.length <= 90 && !/:$/.test(c)) heading = c; continue }
      // "Bounty / Scrimmage Triple Rewards: 11/9 (Mon) 19:00 ~ …" → el nombre va en la misma línea.
      const inline = /^(.{3,80}?):\s*\S/.exec(c)?.[1]
      const name = inline && !/period|duration|time|date|schedule/i.test(inline) ? inline : heading
      if (!name) continue
      let start = r.start, approx = r.approx
      if (r.afterMaint) {
        const e = maintEnd.get(r.afterMaint)
        if (e) start = e
        else approx = true
      }
      if (!(r.end > start) || r.end < from || start > to || r.end - start > 150 * DAY) continue
      const kind: Kind = /recruit|banner|pick-?up|rate[- ]?up|gacha|headhunting|limited.*(trekker|student)/i.test(name) ? 'banner' : 'event'
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
  return { events: out, patches: [], codes: [] }
}
