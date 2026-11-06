import { viaProxy } from '../net'
import type { GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'
import { pullsIn, type PullGame } from './pulls'

/**
 * Eventos de Genshin, Star Rail y ZZZ desde sus wikis de Fandom: la plantilla `{{Event List|hidepast=1}}` (la que usa su página "Event") se renderiza con
 * `action=parse` y cada fila trae el periodo exacto en `data-sort-value="2026-11-04 11:00:00 2026-12-14 03:59:59"`, la imagen y los tipos.
 * Complementa a ennead (HoYoLAB), que solo da los eventos principales: en la comparación del 6 nov 2026 faltaban 13 de Genshin (Chronicle of Polyphony,
 * Stygian Onslaught, Hour of Ruin…). Las horas son del servidor de Asia (UTC+8): la actualización de versión sale a la vez en todo el mundo (11:00 UTC+8),
 * y los cierres "03:59:59" son los de ese servidor.
 * Recompensas: de la página de cada evento (`{{Event Rewards |Primogem = 60}}`, sección "Total Rewards"), todas en una sola consulta.
 * 2 consultas por juego (caché de 12 h en el proxy).
 */
const SERVER = 8
const DAY = 86_400_000

/** Tipos que son desafíos rotativos (endgame). */
const CHALLENGE = /Spiral Abyss|Stygian Onslaught|Imaginarium Theater|Memory of Chaos|Pure Fiction|Apocalyptic Shadow|Anomaly Arbitration|Shiyu Defense|Deadly Assault|Annihilation/i

const at = (s: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - SERVER, +m[5], m[6] ? +m[6] : 0) : NaN
}

type Reward = { name: string; amount: number }

/** Recompensas de cada página (`{{Event Rewards |Primogem = 60 |sort = …}}`), en una sola consulta (máx. 50 páginas). Título pedido → recompensas. */
async function eventRewards(host: string, pages: string[]): Promise<Map<string, Reward[]>> {
  const out = new Map<string, Reward[]>()
  const titles = [...new Set(pages)].slice(0, 50)
  if (!titles.length) return out
  const qs = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.join('|'), redirects: '1', format: 'json', formatversion: '2', origin: '*' })
  const res = await fetch(viaProxy(`https://${host}/api.php?${qs}`))
  if (!res.ok) return out
  const json = await res.json()
  // La API normaliza títulos ("A_b" → "A b") y sigue redirecciones: se guarda con el título que pedimos.
  const back = new Map<string, string>()
  for (const n of json?.query?.normalized ?? []) back.set(n.to, n.from)
  for (const r of json?.query?.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from)
  for (const p of json?.query?.pages ?? []) {
    const text: string = p?.revisions?.[0]?.slots?.main?.content ?? ''
    const block = /\{\{\s*Event Rewards([\s\S]*?)\}\}/i.exec(text)?.[1]
    if (!block) continue
    const items = [...block.matchAll(/\|\s*([^=|\n]+?)\s*=\s*([\d,]+)\s*(?=\n|\||$)/g)]
      .map(m => ({ name: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) }))
      .filter(i => i.amount > 0 && !/^sort$/i.test(i.name))
    if (items.length) out.set(back.get(p.title) ?? p.title, items)
  }
  return out
}

export async function syncHoyoWiki(gameId: string, host: string, pullGame?: PullGame): Promise<GameSync> {
  const qs = new URLSearchParams({ action: 'parse', contentmodel: 'wikitext', text: '{{Event List|hidepast=1|h=3}}', prop: 'text', format: 'json', origin: '*' })
  const res = await fetch(viaProxy(`https://${host}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${host} → HTTP ${res.status}`)
  const html: string | undefined = (await res.json())?.parse?.text?.['*']
  if (!html) throw new Error(`${host}: Event List vacío`)
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html')
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  const seen = new Set<string>()
  const pageOf = new Map<string, string>() // id del evento → página de la wiki
  for (const tr of doc.querySelectorAll('tr')) {
    const tds = [...tr.children].filter(c => c.tagName === 'TD')
    const sort = tds[1]?.getAttribute('data-sort-value') ?? ''
    const times = sort.match(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?/g) ?? []
    if (tds.length < 2 || times.length < 2) continue // sin fin ("none", "unknown"): indefinido
    const [t0 = '', t1 = ''] = times
    const start = at(t0), end = at(t1)
    if (isNaN(start) || isNaN(end) || !(end > start) || end < from || start > to || end - start > 150 * DAY) continue
    const anchors = [...tds[0].querySelectorAll('a')]
    const links = anchors.map(a => a.textContent?.trim() ?? '').filter(Boolean)
    const page = anchors.map(a => a.getAttribute('title') ?? '').filter(Boolean).pop() ?? ''
    // "Nameless Honor 2026-09-28", "Ley Line Overflow 2026-12-07": la fecha sobra en el título.
    const title = (links[links.length - 1] ?? '').replace(/\s+\d{4}-\d{2}-\d{2}$/, '').trim()
    if (!title) continue
    const types = tds[2]?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const kind: Kind = CHALLENGE.test(`${types} ${title}`) ? 'challenge' : 'event'
    const id = `${gameId}:${kind}:hw:${title}:${new Date(start).toISOString().slice(0, 10)}`
    if (seen.has(id)) continue
    seen.add(id)
    const img = tds[0].querySelector('img')
    const src = img?.getAttribute('data-src') || img?.getAttribute('src') || ''
    out.push({
      id, gameId, kind, title,
      description: types.replace(/^In-Game,?\s*/, '') || undefined,
      // La tabla trae miniaturas de 250 px; en una barra larga se ven borrosas: se pide la misma imagen a 800 px.
      image: src.startsWith('http') ? src.replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/800') : undefined,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: [], pulls: 0, source: 'api',
      minor: /\bWeb\b/.test(types) || /^Test Run/i.test(title) || undefined,
    })
    if (page) pageOf.set(id, page)
  }
  // Recompensas y tiradas desde la página de cada evento. Si falla, quedan sin recompensas (sin veredicto), como antes.
  if (pullGame) {
    const rewards = await eventRewards(host, [...pageOf.values()]).catch(() => new Map<string, Reward[]>())
    for (const e of out) {
      const items = rewards.get(pageOf.get(e.id) ?? '')
      if (!items) continue
      e.items = items
      e.pulls = pullsIn(pullGame, items.map(i => `${i.name} x${i.amount}`)).pulls
    }
  }
  return { events: out, patches: [], codes: [] }
}
