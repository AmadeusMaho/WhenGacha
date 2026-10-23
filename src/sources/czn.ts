import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Chaos Zero Nightmare: avisos oficiales de STOVE republicados en czn.gg (API REST pública de WordPress).
 * Las fechas se extraen del texto de cada aviso; si no se reconoce un periodo, el aviso se omite.
 */
const URL = 'https://czn.gg/wp-json/wp/v2/posts?categories=17&per_page=40&_fields=id,date,link,title,content,yoast_head_json'
const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'
const MARKER = /(?:event period|rate[- ]?up rescue period|rescue period|period)\s*[:\-–]?\s*/gi
const TOKEN = new RegExp(String.raw`(?:(\d{1,2})/(\d{1,2})(?:/(\d{4}))?|(${MONTHS})\.?\s+(\d{1,2})(?:st|nd|rd|th)?)(?:\s*\([A-Za-z]+\))?(?:,?\s*(\d{1,2}):(\d{2}))?`, 'gi')

const monthIndex = (m: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m.slice(0, 3).toLowerCase())

const decode = (s: string) => s.replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&#8203;/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')).replace(/\s+/g, ' ').trim()

/** Primer periodo "inicio – fin" reconocible en el texto (horas en UTC). */
function parsePeriod(body: string, postDate: string): { start: Date; end: Date } | null {
  const year = new Date(postDate).getUTCFullYear()
  MARKER.lastIndex = 0
  for (const mk of body.matchAll(MARKER)) {
    const seg = body.slice(mk.index! + mk[0].length, mk.index! + mk[0].length + 110)
    const toks = [...seg.matchAll(TOKEN)]
    if (toks.length < 2 || toks[0].index! > 3) continue
    const at = (m: RegExpMatchArray, fallbackHour: number, y: number) => {
      const mon = m[4] ? monthIndex(m[4]) : Number(m[1]) - 1
      const day = Number(m[5] ?? m[2])
      const yy = m[3] ? Number(m[3]) : y
      const h = m[6] ? Number(m[6]) : fallbackHour
      return new Date(Date.UTC(yy, mon, day, h, m[7] ? Number(m[7]) : 0))
    }
    const start = at(toks[0], 9, year)
    let end = at(toks[1], 15, year)
    if (end < start) end = at(toks[1], 15, year + 1)
    if (end > start) return { start, end }
  }
  return null
}

export async function syncCzn(gameId: string): Promise<GameSync> {
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`czn.gg → HTTP ${res.status}`)
  const posts = (await res.json()) as {
    id: number; date: string; link: string; title: { rendered: string }; content: { rendered: string }
    yoast_head_json?: { og_image?: { url: string }[] }
  }[]

  const events: GameEvent[] = []
  for (const p of posts) {
    const body = text(p.content.rendered)
    const period = parsePeriod(body, p.date)
    if (!period || +period.end < Date.now() - 3 * 86_400_000) continue
    const raw = text(p.title.rendered)
    const banner = /rate[- ]?up|rescue/i.test(raw) || raw.startsWith('◤')
    const title = raw.replace(/^\[Event\]\s*/i, '').replace(/[◤◢]/g, '').trim()
    const names = banner ? title.replace(/rate[- ]?up.*$/i, '').split('/').map(s => s.trim()).filter(Boolean) : []
    const featured: Featured[] = names.map(name => ({ name, rarity: 5 }))
    events.push({
      id: `${gameId}:${banner ? 'banner' : 'event'}:${p.id}`,
      gameId,
      kind: banner ? 'banner' : 'event',
      title: banner && names.length ? names.join(' / ') : title,
      description: banner ? `Rescate (banner) · ${title}` : undefined,
      image: p.yoast_head_json?.og_image?.[0]?.url,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      items: [],
      featured,
      pulls: 0,
      source: 'api',
    })
  }
  return { events, patches: [], codes: [] }
}
