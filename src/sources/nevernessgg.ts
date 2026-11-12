import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'
import { summarize, withSummary } from './summary'

/**
 * NTE (Global): avisos oficiales de Perfect World ("Source: Perfect World"), tal como los reproduce neverness.gg (red DotGG) en su API
 * pública de WordPress. La web oficial no es opción (sus Términos prohíben robots y scraping); neverness.gg es un tercero cuyos robots.txt y
 * Términos (los de DotGG, como nikke.gg) lo permiten. 1 lista + hasta 3 avisos por ciclo, caché de 3 h.
 *
 * Formato: `● "Gold Clash" Limited-Time Event` + `Duration: October 26, 05:00 – November 9, 04:59 (server time)`.
 * "(after update)" = fin del mantenimiento de ese día ("Maintenance Window: September 30, 2026, 06:00 – 11:00 (UTC+8)").
 * "server time" = servidor de América (UTC-5), el mismo criterio que usaba gachafocus (Gold Clash 26 oct 10:00Z).
 */
const API = 'https://neverness.gg/wp-json/wp/v2/posts'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const AMERICA = -5
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

interface Post { id: number; date: string; title: { rendered: string }; content?: { rendered: string } }

function lines(html: string): string[] {
  const marked = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr|td|figure)>/gi, '$&\n')
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${marked}</body></html>`, 'text/html')
  return (doc.body.textContent ?? '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** "October 26, 05:00" / "September 30, 2026, 06:00" en UTC+off; sin año, el del aviso (o el siguiente si cae antes). */
function when(s: string, off: number, year: number, after?: number): number {
  const m = /([A-Z][a-z]+) (\d{1,2})(?:, (\d{4}))?(?:,? (\d{1,2}):(\d{2}))?/.exec(s)
  // "November 11" y, desde la nota de la 1.5 (9 nov 2026), "Nov 11": se compara por las tres primeras letras.
  const mo = m && m[1].length >= 3 ? MONTHS.findIndex(x => x.startsWith(m[1].toLowerCase().slice(0, 3))) : -1
  if (!m || mo < 0) return NaN
  let y = m[3] ? +m[3] : year
  let t = Date.UTC(y, mo, +m[2], (m[4] ? +m[4] : 0) - off, m[5] ? +m[5] : 0)
  if (!m[3] && after !== undefined && t < after - 30 * DAY) t = Date.UTC(++y, mo, +m[2], (m[4] ? +m[4] : 0) - off, m[5] ? +m[5] : 0)
  return t
}

function parse(gameId: string, post: Post, out: GameEvent[], seen: Set<string>) {
  const ls = lines(post.content?.rendered ?? '')
  const year = new Date(post.date).getUTCFullYear()
  // Fin del mantenimiento de ese aviso (lo que significa "after update").
  const mw = ls.map(l => /(?:Maintenance (?:Window|Period)|● Duration):\s*([A-Z][a-z]+ \d{1,2}, \d{4}), \d{1,2}:\d{2}\s*[–-]\s*(\d{1,2}):(\d{2})\s*\(UTC([+-]\d+)\)/.exec(l)).find(Boolean)
  const maintEnd = mw ? when(`${mw[1]}, ${mw[2]}:${mw[3]}`, +mw[4], year) : NaN
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  let head: string | null = null
  for (const [i, l] of ls.entries()) {
    // Cabecera: "● "Gold Clash" Limited-Time Event" o un apartado numerado con su propio evento ("5. New Mystery Box Event "Open Roads Ahead"").
    if (l.startsWith('●')) { head = l.replace(/^●\s*/, ''); continue }
    if (/^\d+\.\s+.*"[^"]+"/.test(l)) { head = l.replace(/^\d+\.\s*/, ''); continue }
    const m = /^(?:Event )?(Duration|Available|Discount Period):\s*(.+?)\s*[–-]\s*(.+?)\s*\((UTC([+-]\d+)|server time)\)/i.exec(l)
    if (!m || !head) continue
    const h = head
    head = null
    if (/Discount/i.test(m[1]) || /Outfit|Accessory/i.test(h)) continue
    const off = m[5] ? +m[5] : AMERICA
    const start = /after update/i.test(m[2]) ? maintEnd : when(m[2], off, year)
    const end = when(m[3], off, year, start) + 59_000
    if (isNaN(start) || isNaN(end) || !(end > start) || end < from || start > to || end - start > 150 * DAY) continue
    // Los banners ya vienen de Prydwen (misma hora); aquí solo eventos.
    if (/Limited S-Class (Character|Arc)/i.test(h)) continue
    const banner = null as RegExpExecArray | null
    const quoted = /"([^"]+)"/.exec(h)?.[1]
    const title = banner ? h.split(':').slice(1).join(':').replace(/"/g, '').trim() : (quoted ?? h).trim()
    const kind = banner ? 'banner' as const : 'event' as const
    const id = `${gameId}:${kind}:ngg:${title}:${new Date(start).toISOString().slice(0, 10)}`
    if (!title || seen.has(id)) continue
    seen.add(id)
    out.push({
      id, gameId, kind, title,
      // Tipo ("New Mystery Box Event") + resumen del apartado, hasta el siguiente "●".
      description: banner ? undefined : withSummary(h.replace(/"[^"]+"/, '').trim() || undefined,
        summarize(ls.slice(i + 1, (k => (k > 0 ? k : ls.length))(ls.findIndex((l, j) => j > i && (l.startsWith('●') || /^\d+\.\s/.test(l))))), { title })),
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      // Recompensas: los "Nombre xN" hasta el siguiente apartado "●"; 160 Annulith = 1 tirada (pulls.ts).
      ...rewardsAt(ls, i),
      featured: banner && /Character/i.test(banner[1]) ? [{ name: title, rarity: 5 }] : [], official: true, source: 'api',
      minor: /Web Event|Gift Pack|Mystery Box/i.test(h) || undefined,
    })
  }
}

/**
 * Monedas y materiales de NTE que los avisos nombran sin cantidad ("rewards including … Annulith, Fabricated Dice, Fons, and more").
 * Se listan sin cifra (la ficha muestra solo el nombre) y no suman tiradas: solo cuentan las que traen "xN".
 */
const NAMED: [RegExp, string][] = [
  [/\bAnnulith\b/i, 'Annulith'], [/\bSolid Dice\b/i, 'Solid Dice'], [/\bFabricated Dice\b/i, 'Fabricated Dice'], [/\bFons\b/i, 'Fons'],
  [/\bFloe Cinema Tickets?\b/i, 'Floe Cinema Ticket'], [/\bElite Hunter Guides?\b/i, 'Elite Hunter Guide'], [/\bChaotic Dye\b/i, 'Chaotic Dye'],
]

function rewardsAt(ls: string[], i: number) {
  const next = ls.findIndex((l, j) => j > i && (l.startsWith('●') || /^\d+\.\s/.test(l)))
  // Las notas "※" (contenido de cofres de pago: "Fons x2,000,000") y lo que trae una caja misteriosa de pago no son recompensas del evento.
  const sec = ls.slice(i, next > 0 ? next : ls.length).filter(l => !l.startsWith('※') && !/^Mystery Box Contents/i.test(l))
  const r = pullsIn('nte', sec)
  // Lo de pago ("Purchase "Elite Hunter Supplies" to unlock…") y lo que se gasta ("costs Fons x50,000") no es recompensa del evento.
  // Gastar la moneda del evento ("Spend Kool tokens … to redeem") sí es gratis; gastar Fons o Annulith (cajas misteriosas), no.
  const free = sec.filter(l => !/purchase|\bcosts?\b|(?:spend|consume)s? (?:Fons|Annulith)/i.test(l)).join(' ')
  const has = new Set(r.items.map(x => x.name.toLowerCase()))
  const extra = NAMED.filter(([re, name]) => re.test(free) && ![...has].some(h => h.startsWith(name.toLowerCase()))).map(([, name]) => ({ name, amount: 0 }))
  return { pulls: r.pulls, items: [...r.items, ...extra].slice(0, 10) }
}

export async function syncNevernessGg(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${API}?${new URLSearchParams({ categories: '1', per_page: '20', _fields: 'id,date,title' })}`))
  if (!res.ok) throw new Error(`neverness.gg → HTTP ${res.status}`)
  const list = (await res.json()) as Post[]
  if (!Array.isArray(list)) throw new Error('neverness.gg: lista inesperada')
  // La nota de parche más reciente y los avisos de mantenimiento posteriores (actualizaciones a mitad de versión).
  const pi = list.findIndex(p => /Patch Notes/i.test(p.title.rendered))
  const picked = [...list.slice(0, Math.max(pi, 0)).filter(p => /Maintenance Notice/i.test(p.title.rendered)).slice(0, 2), ...(pi >= 0 ? [list[pi]] : [])]
  const out: GameEvent[] = []
  const seen = new Set<string>()
  for (const p of picked) {
    const r = await fetch(viaProxy(`${API}/${p.id}?${new URLSearchParams({ _fields: 'id,date,title,content' })}`))
    if (r.ok) parse(gameId, (await r.json()) as Post, out, seen)
  }
  if (!out.length) throw new Error('neverness.gg: sin eventos vigentes')
  return { events: out, patches: [], codes: [] }
}
