import { viaProxy } from '../net'
import type { GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'
import { pullsIn, type PullGame } from './pulls'
import { wikiSummary } from './summary'
import { fileKey, fileUrls } from './wikifiles'

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
/**
 * Página de cada evento en la wiki (una sola consulta, máx. 50): recompensas de su {{Event Rewards}} y un resumen de su texto
 * (`wikiSummary`: el {{Description|…}} del juego, requisitos y detalles, como las fichas de Endfield).
 */
export async function eventPages(host: string, pages: string[]): Promise<Map<string, { items: Reward[]; description?: string }>> {
  const out = new Map<string, { items: Reward[]; description?: string }>()
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
    if (!text) continue
    const block = /\{\{\s*Event Rewards([\s\S]*?)\}\}/i.exec(text)?.[1]
    const items = block ? [...block.matchAll(/\|\s*([^=|\n]+?)\s*=\s*([\d,]+)\s*(?=\n|\||$)/g)]
      .map(m => ({ name: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) }))
      .filter(i => i.amount > 0 && !/^sort$/i.test(i.name)) : cardListTotal(text)
    const description = wikiSummary(text, p.title)
    if (items.length || description) out.set(back.get(p.title) ?? p.title, { items, description })
  }
  return out
}

/**
 * Sin {{Event Rewards}}: el total en `{{Card List|Polychrome*40; Official Investigator Log*10}}` tras "Total Rewards" o bajo "==Reward Preview=="
 * (ZZZ, 18 nov 2026: The Final Callback, Angels Support Operation…). Solo esa lista, no las de cada fila (se contarían dos veces).
 */
export function cardListTotal(text: string): Reward[] {
  const at = text.search(/'''\s*Total Rewards\s*:?\s*'''|==\s*(?:Total Rewards|Reward Preview)\s*==/i)
  if (at < 0) return []
  const near = text.slice(at, at + 1500)
  const list = /\{\{\s*Card List\s*\|(?:\s*1\s*=)?([^}]*)\}\}/i.exec(near)?.[1]
  if (list) {
    return list.split(';').map(x => /^\s*([^*|=]+?)\s*\*\s*([\d,]+)\s*(?:\{[^}]*\})?\s*$/.exec(x)).filter((m): m is RegExpExecArray => !!m)
      .map(m => ({ name: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) })).filter(i => i.amount > 0)
  }
  // "===Total Rewards===" con fichas sueltas: {{Card |Boopon |10 |rank=S}} (los inicios de sesión de ZZZ).
  const head = /==\s*Total Rewards\s*==|'''\s*Total Rewards/i.test(near.slice(0, 40))
  const end = near.slice(4).search(/\n==/)
  return head ? [...near.slice(0, end < 0 ? undefined : end + 4).matchAll(/\{\{\s*Card\s*\|\s*([^|}]+?)\s*\|\s*([\d,]+)\s*[|}]/gi)]
    .map(m => ({ name: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) })).filter(i => i.amount > 0) : []
}

/** Solo las recompensas (compatibilidad). */
export async function eventRewards(host: string, pages: string[]): Promise<Map<string, Reward[]>> {
  const pg = await eventPages(host, pages)
  return new Map([...pg].filter(([, v]) => v.items.length).map(([k, v]) => [k, v.items]))
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
    if (tds.length < 2 || !times.length) continue
    // Sin fin ("TBA"): solo si empezó hace poco o está por empezar (la selección de aniversario de Genshin, la colaboración ZZZ × HSR del 21 nov 2026).
    // Lo de hace meses con fin abierto ("Battle Trial", modos fijos) es permanente y no se lista.
    // "TBA" llega como "2050-01-01 00:00:00"; "none" (indefinido), sin segunda fecha.
    const open = times.length < 2 || /^20[5-9]\d-/.test(times[1] ?? '')
    const start = at(times[0] ?? '')
    if (open && !(start > now - 30 * DAY)) continue
    const end = open ? Math.max(start, now) + 42 * DAY : at(times[1] ?? '')
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
      ...(open ? { open: true } : {}),
    })
    if (page) pageOf.set(id, page)
  }
  // Recompensas y tiradas desde la página de cada evento. Si falla, quedan sin recompensas (sin veredicto), como antes.
  if (pullGame) {
    const pages = await eventPages(host, [...pageOf.values()]).catch(() => new Map<string, { items: Reward[]; description?: string }>())
    for (const e of out) {
      const pg = pages.get(pageOf.get(e.id) ?? '')
      if (!pg) continue
      if (pg.description) e.description = pg.description
      if (!pg.items.length) continue
      e.items = pg.items
      e.pulls = pullsIn(pullGame, pg.items.map(i => `${i.name} x${i.amount}`)).pulls
    }
    // Eventos que se repiten (inicios de sesión, pruebas de agentes de ZZZ): la página general no trae recompensas, cada edición tiene la suya
    // con su fecha de inicio en hora del servidor ('"En-Nah" Into Your Lap/2026-11-11'). Una consulta más, solo si hace falta.
    const dated = new Map<string, GameEvent>()
    for (const e of out) {
      const page = pageOf.get(e.id)
      if (e.items.length || !page || page.includes('/')) continue
      dated.set(`${page}/${new Date(+new Date(e.start) + SERVER * 3_600_000).toISOString().slice(0, 10)}`, e)
    }
    const sub = dated.size ? await eventPages(host, [...dated.keys()]).catch(() => new Map<string, { items: Reward[]; description?: string }>()) : new Map<string, { items: Reward[]; description?: string }>()
    for (const [page, e] of dated) {
      const items = sub.get(page)?.items
      if (!items?.length) continue
      e.items = items
      e.pulls = pullsIn(pullGame, items.map(i => `${i.name} x${i.amount}`)).pulls
    }
  }
  return { events: out, patches: [], codes: [] }
}

/**
 * Banners ya anunciados de Genshin que ennead aún no trae (21 nov 2026: la fase 2 de la 7.2, del 24 nov, faltaba en la app y la wiki ya la tenía).
 * `{{Wish List|no_past=1|no_current=1}}` da los enlaces a la página de cada banner ("Harmonious Abundance/2026-11-24"); de cada página, su
 * `{{Wish |type |time_start |time_end}}` (hora del servidor de Asia, UTC+8) y el primer `{{Wish Item|…}}` del resumen (el 5★, o los 5★ del banner
 * de armas). 2 consultas (caché del proxy). El que ya tenga ennead (mismo inicio ±2 días y algún destacado en común) se descarta fuera (syncSourceRaw).
 */
export async function syncWishList(gameId: string, host: string): Promise<GameEvent[]> {
  const qs = new URLSearchParams({ action: 'parse', contentmodel: 'wikitext', text: '{{Wish List|no_past=1|no_current=1|no_headers=1}}', prop: 'links', format: 'json', origin: '*' })
  const res = await fetch(viaProxy(`https://${host}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${host} Wish List → HTTP ${res.status}`)
  const links: string[] = ((await res.json())?.parse?.links ?? []).map((l: { '*'?: string }) => l['*'] ?? '').filter((t: string) => /\/\d{4}-\d{2}-\d{2}$/.test(t))
  const pages = [...new Set(links)].slice(0, 12)
  if (!pages.length) return []
  const q = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: pages.join('|'), format: 'json', formatversion: '2', origin: '*' })
  const r2 = await fetch(viaProxy(`https://${host}/api.php?${q}`))
  if (!r2.ok) throw new Error(`${host} Wish pages → HTTP ${r2.status}`)
  const out: GameEvent[] = []
  for (const p of (await r2.json())?.query?.pages ?? []) {
    const text: string = p?.revisions?.[0]?.slots?.main?.content ?? ''
    const field = (k: string) => new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n|]*)`).exec(text)?.[1]?.trim() ?? ''
    const start = at(field('time_start')), end = at(field('time_end'))
    if (isNaN(start) || isNaN(end) || end <= start || end < Date.now()) continue
    const type = field('type')
    const weapon = /weapon/i.test(type)
    const names = (/\{\{\s*Wish Item\s*\|([^}]+)\}\}/i.exec(text)?.[1] ?? '').split(';').map(s => s.trim()).filter(Boolean).slice(0, weapon ? 2 : 3)
    const title = String(p.title).replace(/\/\d{4}-\d{2}-\d{2}$/, '')
    const image = field('image')
    out.push({
      id: `${gameId}:banner:wish:${p.title}`, gameId, kind: 'banner',
      title: names.length && !/chronicled/i.test(type) ? names.join(' / ') : title,
      description: `${weapon ? '⟦d.weaponBanner⟧' : '⟦d.charBanner⟧'} · ${title}`,
      image: image || undefined, // nombre de archivo: se cambia por su URL al final
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: names.map(name => ({ name, rarity: 5 })), pulls: 0, source: 'api',
    })
  }
  const urls = await fileUrls(host, out.map(e => e.image ?? ''), 800).catch(() => new Map<string, string>())
  return out.map(e => ({ ...e, image: e.image ? urls.get(fileKey(e.image)) : undefined }))
}
