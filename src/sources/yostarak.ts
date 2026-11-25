import { viaProxy } from '../net'
import type { Featured, GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'
import { summarize } from './summary'

/**
 * Arknights (Global): avisos oficiales de arknights.global (Yostar; la misma API que Stella Sora: `/api/resource/news/list?index=1&size=…&type=latest`
 * y `/api/resource/news/detail?id=…`, sin claves). Decisión del dueño (25 nov 2026): se consulta aunque los Términos de Yostar prohíban los robots,
 * como la de Stella Sora: consulta pequeña. Cada aviso trae apartados numerados:
 *   «01 POSITIONAL FOOTBALL CHAMPIONSHIP LIMITED-TIME EVENT OPEN» / «DURATION: November 23, 2026, 08:00 – December 7, 2026, 03:59 (UTC-7)» /
 *   «Day 2: Orundum * 200, Recruitment Permit * 5» / «★★★★★★: Violet Mizutsune Orchid».
 * La wiki (wiki.ts) ya da los eventos y banners con hora exacta y mejores nombres: esto los completa (recompensas con cifra y tiradas, imagen,
 * descripción, destacados con estrellas) y añade lo que la wiki no tiene (logins, tienda de trajes). 1 lista + hasta 5 avisos (caché 3 h).
 */
const API = 'https://www.arknights.global/api/resource/news'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const iso = (t: number) => new Date(t).toISOString()
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

interface Row { id: number; title: string; type: string; publishTime: number }

/** "November 23, 2026, 08:00" / "November 16, 08:00" (sin año: el del aviso) en UTC-7 → ms. */
function when(s: string, year: number, off: number): number {
  const m = /([A-Z][a-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?,?\s+(\d{1,2}):(\d{2})/.exec(s)
  const mo = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
  if (!m || mo < 0) return NaN
  const min = +m[5]
  return Date.UTC(m[3] ? +m[3] : year, mo, +m[2], +m[4] - off, min, min === 59 ? 59 : 0) + (min === 59 ? 999 : 0)
}

/** "DURATION: November 16, 08:00 - December 7, 03:59 (UTC-7)" → [inicio, fin]. */
export function akRange(line: string, year: number): [number, number] | null {
  const m = /^DURATION:\s*(.+?)\s+[–-]\s+(.+?)\s*\(UTC([+-]\d{1,2})\)/i.exec(line)
  if (!m) return null
  const off = +m[3]
  const a = when(m[1], year, off)
  let b = when(m[2], year, off)
  if (b <= a) b = when(m[2], year + 1, off) // de diciembre a enero
  return isNaN(a) || isNaN(b) || b <= a ? null : [a, b]
}

/** "[ARKNIGHTS X MONSTER HUNTER] LIMITED LOGIN EVENT OPEN" → "Limited Login Event"; "SIDESTORY: THUNDER IN THE AZURE DREAM OPEN" → "Thunder in the Azure Dream". */
export function akTitle(raw: string): string {
  const t = raw.replace(/^\d{2}\s+/, '').replace(/^\[[^\]]+\]\s*/, '').replace(/\s+(?:OPEN|IS NOW OPEN|BEGINS?)\s*$/i, '')
    .replace(/^(?:SIDESTORY|SIDE STORY|STORY COLLECTION)\s*:\s*/i, '').replace(/\s+LIMITED-TIME EVENT$/i, '').trim()
  const small = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
  return t.toLowerCase().split(/(\s+)/).map((w, i) => (/\s/.test(w) || (i > 0 && small.has(w)) ? w : w.replace(/^(\W*)(\w)/, (_x, p, c) => p + c.toUpperCase()))).join('')
    .replace(/\b(Ii|Iii|Iv)\b/g, s => s.toUpperCase())
}

/** Apartados numerados de un aviso ("01 …", "02 …"), con su imagen (la anterior al título) y sus líneas. */
function sections(html: string): { head: string; image?: string; lines: string[] }[] {
  const ls = html.replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi, '\n@@IMG $1\n').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&ndash;|&mdash;/g, '–').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&times;/g, '×')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const out: { head: string; image?: string; lines: string[] }[] = []
  let img: string | undefined
  for (const l of ls) {
    if (l.startsWith('@@IMG ')) { img = l.slice(6).trim(); continue }
    if (/^\d{2}\s+\S/.test(l) && l === l.toUpperCase()) { out.push({ head: l, image: img, lines: [] }); img = undefined; continue }
    out[out.length - 1]?.lines.push(l)
  }
  return out
}

export function akNotice(gameId: string, html: string, posted: number): GameEvent[] {
  const year = new Date(posted).getUTCFullYear()
  const out: GameEvent[] = []
  for (const s of sections(html)) {
    const r = s.lines.map(l => akRange(l, year)).find(Boolean)
    if (!r) continue
    const title = akTitle(s.head)
    const banner = /HEADHUNTING/i.test(s.head)
    // Destacados: "★★★★★★: Violet Mizutsune Orchid" / "★★★★★: A / B".
    const featured: Featured[] = banner ? s.lines.flatMap(l => {
      const m = /^(★{4,6})\s*:\s*(.+)$/.exec(l)
      return m ? m[2].split(/\s*\/\s*|\s*,\s*/).map(name => ({ name: name.trim(), rarity: m[1].length })) : []
    }) : []
    // Recompensas "Orundum * 200" de cada día del login, sumadas; tiradas según pulls.ts (600 Orundum o 1 Headhunting Permit).
    const found = banner ? { pulls: 0, items: [] } : pullsIn('arknights', s.lines.map(l => l.replace(/\s*\*\s*(\d)/g, ' x$1')))
    const kind: Kind = banner ? 'banner' : /CONTINGENCY CONTRACT|ANNIHILATION|INTEGRATED STRATEGIES|RECLAMATION/i.test(s.head) ? 'challenge' : 'event'
    // Tienda de trajes, muebles, packs de pago y tarjeta mensual: menores, y lo que traen se compra, así que no cuenta como tiradas gratis.
    const shop = /OUTFIT|STORE|PACK|MONTHLY CARD|FURNITURE SET/i.test(s.head)
    out.push({
      id: `${gameId}:${kind}:yostar:${key(title)}:${iso(r[0]).slice(0, 10)}`, gameId, kind, title: banner ? title.replace(/^Limited Headhunting(?: Open)?\s*[–-]\s*/i, '') : title,
      image: s.image, start: iso(r[0]), end: iso(r[1]), items: found.items, pulls: shop ? 0 : found.pulls, featured, official: true, source: 'api',
      description: banner ? undefined : summarize(s.lines.filter(l => !/^DURATION:/i.test(l)).map(l => l.replace(/^DETAILS:\s*/i, '')), { title }),
      ...(shop ? { minor: true } : {}),
    })
  }
  return out
}

export async function syncArknightsNews(gameId: string, now = Date.now()): Promise<GameSync> {
  const res = await fetch(viaProxy(`${API}/list?index=1&size=10&type=latest`))
  if (!res.ok) throw new Error(`arknights.global → HTTP ${res.status}`)
  const rows = ((await res.json())?.data?.rows ?? []) as Row[]
  const want = rows.filter(n => n.type === 'event' && now - n.publishTime < 40 * DAY && !/FAQ|CONTEST|CREATION/i.test(n.title)).slice(0, 5)
  const out: GameEvent[] = []
  for (const n of want) {
    const d = await fetch(viaProxy(`${API}/detail?id=${n.id}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    const html: string = d?.data?.content ?? d?.data?.news?.content ?? ''
    for (const e of html ? akNotice(gameId, html, n.publishTime) : []) if (Date.parse(e.end) > now - 3 * DAY && !out.some(o => o.id === e.id)) out.push(e)
  }
  if (!out.length) throw new Error('arknights.global: sin eventos vigentes')
  return { events: out, patches: [], codes: [] }
}

const STOP = new Set(['event', 'limited', 'the', 'of', 'and', 'in', 'to', 'a', 'login', 'sign', 'headhunting', 'rerun', 'open'])
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))

/**
 * Une los avisos con la wiki: si la wiki ya tiene el elemento (mismo tipo, mismo periodo ±1 día y una palabra en común, o los dos son logins, o el
 * banner comparte destacado), se completa (recompensas, tiradas, imagen, descripción, destacados con estrellas); si no, se añade el del aviso.
 */
export function withArknightsNews(wiki: GameSync, news: GameEvent[]): GameSync {
  const events = wiki.events.map(e => ({ ...e }))
  for (const n of news) {
    const near = (e: GameEvent) => e.kind === n.kind && Math.abs(Date.parse(e.start) - Date.parse(n.start)) <= DAY && Math.abs(Date.parse(e.end) - Date.parse(n.end)) <= 8 * DAY
    const login = (t: string) => /sign-?in|login|log-in/i.test(t)
    const twin = events.find(e => near(e) && (n.kind === 'banner'
      ? e.featured.some(f => n.featured.some(g => key(g.name) === key(f.name))) || key(e.title) === key(n.title)
      : (login(e.title) && login(n.title)) || [...words(n.title)].some(w => words(e.title).has(w))
        // El login de la colaboración se llama "Hunting Time" en la wiki y "Limited Login Event" en el aviso: 3 recompensas en común bastan.
        || e.items.filter(i => n.items.some(x => key(x.name) === key(i.name))).length >= 3))
    if (!twin) { events.push(n); continue }
    if (!twin.items.length && n.items.length) { twin.items = n.items; twin.pulls = n.pulls }
    twin.image ??= n.image
    twin.description ??= n.description
    if (n.featured.length) twin.featured = n.featured.map(f => ({ ...f, icon: twin.featured.find(g => key(g.name) === key(f.name))?.icon }))
  }
  return { ...wiki, events }
}
