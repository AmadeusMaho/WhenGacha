import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Honkai Impact 3rd: eventos desde su wiki de Fandom (API de MediaWiki; robots.txt permite /api.php). Cada evento tiene
 * `{{Event Entry |start = 2026-10-29 04:00 |end = 2026-12-24 04:00 |version = 9.1}}`; se piden los 40 últimos añadidos a "Category:Events"
 * (una sola consulta con su texto y su imagen). La hora es la del servidor y la wiki no dice cuál: se toma UTC+8 (servidor de Asia) y se marca "≈".
 * Los gachapones ("Supply") la wiki ya no los registra: para ellos haría falta el Discord oficial (docs/discord-bot.md).
 */
const API = 'https://honkaiimpact3.fandom.com/api.php'
const DAY = 86_400_000
const SERVER = 8

const at = (s: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] ? +m[4] : 0) - SERVER, m[5] ? +m[5] : 0) : NaN
}

export async function syncHonkai3(gameId: string): Promise<GameSync> {
  const qs = new URLSearchParams({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:Events', gcmsort: 'timestamp', gcmdir: 'desc', gcmlimit: '40',
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '480', format: 'json', formatversion: '2', origin: '*',
  })
  const res = await fetch(viaProxy(`${API}?${qs}`))
  if (!res.ok) throw new Error(`honkaiimpact3.fandom.com → HTTP ${res.status}`)
  const pages = ((await res.json())?.query?.pages ?? []) as { title: string; revisions?: { slots?: { main?: { content?: string } } }[]; thumbnail?: { source: string } }[]
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  for (const p of pages) {
    const text = p.revisions?.[0]?.slots?.main?.content ?? ''
    const entry = /\{\{\s*Event Entry([\s\S]*?)\}\}/i.exec(text)?.[1]
    if (!entry) continue
    const field = (k: string) => new RegExp(`\\|\\s*${k}\\s*=\\s*([^|\\n}]+)`, 'i').exec(entry)?.[1]?.trim() ?? ''
    const start = at(field('start')), end = at(field('end'))
    if (isNaN(start) || isNaN(end) || !(end > start) || end < from || start > to || end - start > 150 * DAY) continue
    const title = p.title.replace(/\s*\((v[\d.]+|event)\)$/i, '').trim()
    out.push({
      id: `${gameId}:event:hi3:${p.title}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'event', title,
      description: field('version') ? `v${field('version')}` : undefined,
      image: p.thumbnail?.source,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: [], pulls: 0, source: 'api', precision: 'approx',
      minor: /Sale|Spend Bonuses|Shop/i.test(title) || undefined,
    })
  }
  if (!out.length) throw new Error('honkai3: sin eventos vigentes en la wiki')
  return { events: out, patches: [], codes: [] }
}
