import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Azur Lane (Yostar; servidor global/EN, horas UTC-7). Fuentes revisadas el 13 nov 2026:
 *  - Avisos de mantenimiento de su web oficial (azurlane.yo-star.com/news/, un WordPress; robots.txt sin reglas). Cada semana, "Maintenance
 *    Notice – 11/12, 12 A.M (UTC-7)" con todo lo nuevo en bloques `<p><strong>Tipo</strong><br><em>Available … between 11/12 – 11/26, 11:59 P.M.
 *    (UTC-7)</em><br>contenido…</p>`:
 *    - "New Event(s)" → eventos ("Collab Event – It's Showtime! Angels' Azur Stage (Participate to earn …)").
 *    - "New Characters" → los que dicen "(Rate up in event construction pool)" o "(Available in event construction pool)" forman el banner de
 *      construcción limitada; los que son "a reward for participating", recompensa del evento.
 *    - Skins, tienda, muebles, aspectos de equipo, secretos, JUUSTAGRAM…: campañas menores (ocultas por defecto).
 *    El inicio es el fin del mantenimiento (12:00 A.M. + "approximately 6 hours"), marcado "≈"; el fin, el del aviso.
 *  - Discord (canal "azurlane", tuits de @AzurLane_EN): `syncSource` lo une por encima; los avisos web cubren lo que el canal pierde.
 *  - Su wiki (azurlane.koumakan.jp) pone una barrera anti-bots: sin retratos ni iconos de esa fuente.
 *  - Códigos: no se publican con regularidad; los que lleguen por Discord.
 * 1 lista + hasta 3 avisos por ciclo (caché de 6 h en el proxy).
 */
const SITE = 'https://azurlane.yo-star.com/news/'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const TZ = -7
const text = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&#8211;|&#8212;/g, '–').replace(/&#8217;|&#8216;/g, "'")
  .replace(/&#8220;|&#8221;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&#\d+;/g, '')

/** "between 11/12 – 11/26, 11:59 P.M. (UTC-7)" → [inicio, fin]; el inicio, a la hora en que acaba el mantenimiento del aviso. */
export function azurPeriod(s: string, year: number, maintEnd: number | undefined): [number, number] | null {
  const m = /(\d{1,2})\/(\d{1,2})\s*[–-]\s*(\d{1,2})\/(\d{1,2})(?:,\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?)?/i.exec(s)
  if (!m) return null
  const h = m[5] ? +m[5] % 12 + (/p/i.test(m[7]) ? 12 : 0) : 23
  const mi = m[6] ? +m[6] : 59
  const day = Date.UTC(year, +m[1] - 1, +m[2]) - TZ * HOUR
  const start = maintEnd && maintEnd >= day && maintEnd < day + DAY ? maintEnd : day
  let ey = year
  if (+m[3] < +m[1]) ey++
  const end = Date.UTC(ey, +m[3] - 1, +m[4], h - TZ, mi, 59)
  return end > start ? [start, end] : null
}

const MINOR = /skins?|shop|furniture|gear ?box|gear skins?|secrets?|juustagram|meowfficers?|memory|fleetchat|cv update|outfits?|battle ui/i

/** Eventos de un aviso de mantenimiento. */
export function azurNotice(gameId: string, html: string, posted: Date): GameEvent[] {
  const year = posted.getUTCFullYear()
  const body = /<div class="entry-content"[^>]*>([\s\S]*?)<\/div>\s*(?:<footer|<div class="(?:sharedaddy|comments))/.exec(html)?.[1] ?? html
  const image = /<img[^>]+src="(https:\/\/azurlane\.yo-star\.com\/news\/wp-content\/uploads\/20\d\d\/[^"]+)"/.exec(body)?.[1]
  // "Headquarters will carry out maintenance on 11/12, 12:00 A.M. (UTC-7) for approximately 6 hours".
  const mt = /maintenance on (\d{1,2})\/(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?\s*\(UTC-7\)(?:[^.]*?approximately (\d+) hours?)?/i.exec(text(body))
  const maintEnd = mt ? Date.UTC(year, +mt[1] - 1, +mt[2], (+mt[3] % 12) + (/p/i.test(mt[5]) ? 12 : 0) - TZ + (mt[6] ? +mt[6] : 0), +mt[4]) : undefined
  const out: GameEvent[] = []
  const add = (e: Omit<GameEvent, 'id' | 'gameId' | 'source' | 'official' | 'precision' | 'items' | 'featured' | 'pulls'> & Partial<GameEvent>) => {
    const id = `${gameId}:${e.kind}:yostar:${e.title}:${e.start.slice(0, 10)}`
    if (!out.some(o => o.id === id)) out.push({ items: [], featured: [], pulls: 0, ...e, id, gameId, source: 'api', official: true, precision: 'approx' })
  }
  for (const p of body.matchAll(/<p>\s*<strong>([^<]+)<\/strong>\s*<br\s*\/?>([\s\S]*?)<\/p>/gi)) {
    const label = text(p[1]).trim()
    const lines = text(p[2]).split('\n').map(l => l.trim()).filter(Boolean)
    const when = lines.find(l => /between\s+\d{1,2}\/\d{1,2}/i.test(l))
    const r = when ? azurPeriod(when, year, maintEnd) : null
    if (!r || r[1] < Date.now() - 3 * DAY) continue
    const content = lines.filter(l => l !== when)
    const start = new Date(r[0]).toISOString(), end = new Date(r[1]).toISOString()
    if (/^new events?$|^rerun events?$/i.test(label)) {
      // "Collab Event – It's Showtime! Angels' Azur Stage (Participate to earn …)" + notas "※…" debajo.
      for (const [i, l] of content.entries()) {
        if (l.startsWith('※')) continue
        const name = l.replace(/\s*\(.*\)\s*$/, '').replace(/^(?:[\w ]{0,25}?(?:event|rerun))\s*[–-]\s*/i, '').trim()
        const notes = [/\((.*)\)\s*$/.exec(l)?.[1], ...content.slice(i + 1).filter(x => x.startsWith('※')).map(x => x.slice(1))].filter(Boolean).join(' ')
        if (name.length > 2) add({ kind: 'event', title: name, image, start, end, description: notes || undefined })
      }
    } else if (/^new characters?$/i.test(label)) {
      const pool = content.filter(l => /construction/i.test(l))
      const featured: Featured[] = pool.map(l => ({ name: l.replace(/\s*\(.*\)\s*$/, '').trim(), rarity: /rate up/i.test(l) ? 5 : 4, tag: /rate up/i.test(l) ? 'Rate up' : undefined }))
      if (featured.length) add({ kind: 'banner', title: `Limited Construction: ${featured.filter(f => f.tag).map(f => f.name).join(', ') || featured[0].name}`, image, start, end,
        description: '⟦d.azurConstruction⟧', featured })
      // Personajes que se ganan en el evento: recompensas del evento de ese periodo (si lo hay).
      const rewards = content.filter(l => !/construction/i.test(l) && !/^available/i.test(l)).map(l => l.replace(/\s*\(.*\)\s*$/, '').trim())
      if (/reward for participating/i.test(when ?? '') && rewards.length) {
        const ev = out.find(o => o.kind === 'event' && o.start === start && o.end === end)
        if (ev) ev.items = [...ev.items, ...rewards.map(name => ({ name, amount: 1 }))]
      }
    } else if (MINOR.test(label)) {
      const what = content.filter(l => !l.startsWith('※')).slice(0, 4).map(l => l.replace(/\s*\(\d+ purchases? limited\)/i, ''))
      add({ kind: 'event', title: `${label.replace(/^new\s+/i, '')}${what.length === 1 ? `: ${what[0]}` : ''}`, image, start, end,
        description: what.length > 1 ? what.join(' · ') : undefined, minor: true })
    }
  }
  return out
}

export async function syncAzurLane(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(SITE))
  if (!res.ok) throw new Error(`yostar Azur Lane → HTTP ${res.status}`)
  const list = await res.text()
  // Enlaces a los avisos de mantenimiento ("/news/2026/11/11/maintenance-notice-11-12-12-a-m-utc-7-2/"), los más recientes (40 días).
  const urls = [...new Set([...list.matchAll(/https:\/\/azurlane\.yo-star\.com\/news\/(20\d\d)\/(\d\d)\/(\d\d)\/maintenance-notice[a-z0-9-]*\//g)].map(m => m[0]))]
    .map(u => ({ u, at: Date.UTC(+/\/(20\d\d)\//.exec(u)![1], +/\/20\d\d\/(\d\d)\//.exec(u)![1] - 1, +/\/20\d\d\/\d\d\/(\d\d)\//.exec(u)![1]) }))
    .filter(x => Date.now() - x.at < 40 * DAY).sort((a, b) => b.at - a.at).slice(0, 3)
  if (!urls.length) throw new Error('yostar Azur Lane: sin avisos de mantenimiento recientes')
  const events: GameEvent[] = []
  for (const { u, at } of urls) {
    const html = await fetch(viaProxy(u)).then(r => (r.ok ? r.text() : '')).catch(() => '')
    if (html) events.push(...azurNotice(gameId, html, new Date(at)))
  }
  return { events, patches: [], codes: [] }
}
