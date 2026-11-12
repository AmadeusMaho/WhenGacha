import { viaProxy } from '../net'
import type { Featured, GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'
import { htmlText, rangeIn } from './discord'

/**
 * Girls' Frontline 2: Exilium (Sunborn / Darkwinter; servidor global, horas en UTC-4). Fuentes revisadas el 12 nov 2026:
 *  - IOP Wiki (iopwiki.com, MediaWiki; la wiki de referencia del juego, mantenida al día): "GFL2 Events" lista cada evento con
 *    `{{EventPeriod|…|start=2026-10-29T09:00:00-04|end=…|type=Character Event|server=EN}}`: horas EXACTAS del servidor global.
 *    Cada sección lleva su página ("===[[Themis' Game]]===") y su imagen ("[[File:GFL2 Branch Welrod.png]]").
 *  - Recompensas: la tabla "Event Shop" de la página de cada evento ("Collapse Piece (x100) || 6 || 200", "Targeted Access Permission (x1) || 3").
 *    Una sola consulta para todas (`prop=revisions`, hasta 50 páginas).
 *  - Banners: "GFL2 Banners", sección "==EN==" por años ("*Oct 28, 09:00 - Nov 18, 18:59 (UTC-4)" + "**Dolls: [[Faelynn]], Groza, Colphne" +
 *    "**Weapons: …"). La primera muñeca es la limitada (enlazada si es nueva); las otras dos, las SR con probabilidad aumentada.
 *  - Códigos: sin fuente web fiable (la wiki no los lista; los agregadores se contradicen y caducan en días). Llegan por Discord (`codesFrom`).
 *  - Rotatorios (Gunsmoke Frontline cada 3 semanas, Expansion Drills cada 2, Military Simulation al mes): la wiki da sus recompensas
 *    (pullPlan.ts) pero no sus fechas; sin fuente de calendario, no salen en la línea de tiempo.
 * 3 consultas a la wiki por ciclo (caché de 12 h en el proxy).
 */
const WIKI = 'https://iopwiki.com'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

async function api(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })
  const res = await fetch(viaProxy(`${WIKI}/api.php?${qs}`))
  if (!res.ok) throw new Error(`iopwiki → HTTP ${res.status}`)
  return res.json()
}
const wikitext = async (page: string): Promise<string> => (await api({ action: 'parse', page, prop: 'wikitext' }))?.parse?.wikitext ?? ''

/** "2026-10-29T09:00:00-04" (sin minutos en la zona) → ms. */
const iso = (s: string) => Date.parse(s.trim().replace(/([+-]\d{2})$/, '$1:00'))
/**
 * URL real (`/images/thumb/…`) de los archivos de la wiki, en una sola consulta. `Special:FilePath` no sirve de `<img>`: la wiki responde 403
 * con `Cross-Origin-Resource-Policy: same-origin` a /wiki/ desde otro sitio; /images/ sí carga.
 */
async function fileUrls(names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const titles = [...new Set(names)].slice(0, 50)
  if (!titles.length) return out
  const j = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '480', titles: titles.map(t => `File:${t}`).join('|') }).catch(() => null)
  const alias = new Map<string, string>((j?.query?.normalized ?? []).map((r: { from: string; to: string }) => [r.to, r.from]))
  for (const p of j?.query?.pages ?? []) {
    const url = p.imageinfo?.[0]?.thumburl ?? p.imageinfo?.[0]?.url
    if (url) out.set((alias.get(p.title) ?? p.title).replace(/^File:/, ''), url)
  }
  return out
}
/** "[[Sextans ELMO|Sextans]]" → Sextans; "{{GFL2|OTs-14}}" → OTs-14; quita comillas y marcas. */
const plain = (s: string) => s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/\{\{GFL2\|([^}|]+)[^}]*\}\}/gi, '$1')
  .replace(/\{\{[^}]*\}\}|<[^>]+>|'''?|"/g, '').replace(/\s+/g, ' ').trim()

/** Monedas de tirada de la tienda del evento: "Collapse Piece (x100) || 6 || 200" → 600 Collapse Piece. */
export function gfl2Shop(text: string): RewardItem[] {
  const shop = /==\s*Event Shop\s*==([\s\S]*?)(?:\n==[^=]|$)/i.exec(text)?.[1] ?? ''
  const out: RewardItem[] = []
  for (const row of shop.split(/\n\|-/)) {
    const cells = row.replace(/^\s*\|/, '').split('||').map(c => plain(c))
    const m = /^(Collapse Piece|Targeted Access Permission|Access Permission)\s*\(x([\d,]+)\)$/i.exec(cells[0] ?? '')
    const qty = Number((cells[1] ?? '').replace(/,/g, ''))
    if (!m || !(qty > 0)) continue
    const amount = Number(m[2].replace(/,/g, '')) * qty
    const prev = out.find(i => i.name === m[1])
    if (prev) prev.amount += amount
    else out.push({ name: m[1], amount })
  }
  return out
}

interface Found { title: string; page?: string; image?: string; start: number; end: number; type: string; comment: string }

/** Periodos del servidor global (EN) de "GFL2 Events", con la página y la imagen de su sección. */
export function gfl2Events(text: string): Found[] {
  const out: Found[] = []
  for (const sec of text.split(/\n(?====[^=])/)) {
    const head = /^===\s*(.+?)\s*===/.exec(sec)?.[1] ?? ''
    // "[[Exotic Cadence]]/[[Amidst Wings of Gray]]": la página del EN es la última enlazada.
    const pages = [...head.matchAll(/\[\[([^|\]]+)/g)].map(m => m[1])
    // El arte del evento va en la galería ("File:Themis' Game.jpg"); si no hay, el icono de la rama ("[[File:GFL2 Branch Welrod.png]]").
    const image = /<gallery[^>]*>\s*(?:File:)?([^\n|<]+)/i.exec(sec)?.[1] ?? /\[\[File:([^|\]]+)/.exec(sec)?.[1]
    for (const m of sec.matchAll(/\{\{EventPeriod\|([^\n]*?)\}\}\s*$/gm)) {
      const f = Object.fromEntries(m[1].split('|').map(p => p.split('=')).filter(p => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join('=').trim()]))
      if (f.game !== 'GFL2' || !/^(EN|Global)$/i.test(f.server ?? '')) continue
      const start = iso(f.start ?? ''), end = iso(f.end ?? '')
      if (!f.title || isNaN(start) || isNaN(end) || end <= start) continue
      out.push({ title: f.title, page: pages[pages.length - 1], image: image?.trim(), start, end, type: f.type ?? '', comment: f.comment ?? '' })
    }
  }
  return out
}

async function events(gameId: string): Promise<GameEvent[]> {
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const found = gfl2Events(await wikitext('GFL2 Events')).filter(e => e.end >= from && e.start <= to)
  if (!found.length) throw new Error('iopwiki GFL2: no se encontraron eventos')
  // Recompensas de la tienda de cada evento: una sola consulta con todas sus páginas.
  const shops = new Map<string, RewardItem[]>()
  const titles = [...new Set(found.map(e => e.page).filter(Boolean) as string[])].slice(0, 50)
  if (titles.length) {
    const j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.join('|'), redirects: '1' }).catch(() => null)
    const alias = new Map<string, string>([...(j?.query?.redirects ?? []), ...(j?.query?.normalized ?? [])].map((r: { from: string; to: string }) => [r.to, r.from]))
    for (const p of j?.query?.pages ?? []) {
      const items = gfl2Shop(p.revisions?.[0]?.slots?.main?.content ?? '')
      if (items.length) { shops.set(p.title, items); if (alias.has(p.title)) shops.set(alias.get(p.title)!, items) }
    }
  }
  const art = await fileUrls(found.map(e => e.image).filter(Boolean) as string[])
  return found.map(e => {
    // Los "Iliad - Part 1/1.5/2" comparten página: la tienda se cuenta solo en la primera parte.
    const first = !found.some(o => o !== e && o.page === e.page && o.start < e.start)
    const items = (e.page && first && shops.get(e.page.replace(/_/g, ' '))) || []
    // Comentario útil (p. ej. las muñecas de "Leisure Days"), sin referencias ni enlaces.
    const comment = plain(e.comment.replace(/\[https?:[^\]]*\]|<ref[\s\S]*?<\/ref>/g, ''))
    return {
      id: `${gameId}:event:iop:${e.title}:${new Date(e.start).toISOString().slice(0, 10)}`, gameId, kind: 'event' as const, title: e.title,
      description: comment.length > 2 ? comment : undefined, image: e.image ? art.get(e.image) : undefined,
      start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString(),
      items, featured: [], pulls: pullsIn('gfl2', items.map(i => `${i.name} x${i.amount}`)).pulls, official: true, source: 'api' as const,
      // Concurso de popularidad: no da tiradas ni contenido; menor, como las campañas de otros juegos.
      minor: /popularity/i.test(e.type) || undefined,
    }
  })
}

/** "Oct 28, 09:00 - Nov 18, 18:59 (UTC-4)" (año de la sección) o "2025/1/16 13:00 ~ 2025/2/5 18:59(UTC-4)" → [inicio, fin] en ms. */
export function gfl2Range(line: string, year: number): [number, number] | null {
  const zone = Number(/UTC\s*([+-]\d{1,2})/i.exec(line)?.[1] ?? -4)
  const a = /([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}),? (\d{1,2}):(\d{2})\s*[-–~]\s*([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}),? (\d{1,2}):(\d{2})/.exec(line)
  if (a) {
    const m1 = MONTHS.indexOf(a[1].toLowerCase()), m2 = MONTHS.indexOf(a[5].toLowerCase())
    if (m1 < 0 || m2 < 0) return null
    return [Date.UTC(year, m1, +a[2], +a[3] - zone, +a[4]), Date.UTC(m2 < m1 ? year + 1 : year, m2, +a[6], +a[7] - zone, +a[8], 59)]
  }
  const b = /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?[^~]*~\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(line)
  if (!b) return null
  return [Date.UTC(+b[1], +b[2] - 1, +b[3], +(b[4] ?? 9) - zone, +(b[5] ?? 0)), Date.UTC(+b[6], +b[7] - 1, +b[8], +b[9] - zone, +b[10], 59)]
}

/** Nombre y página de una muñeca de la lista: "[[Sextans ELMO|Sextans]]", "{{GFL2|OTs-14}}", "\"Tololo\"". */
function doll(raw: string): Featured & { linked: boolean } {
  const s = raw.trim().replace(/^"|"$/g, '')
  const link = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(s)
  const tpl = /\{\{GFL2\|([^}|]+)/i.exec(s)
  const name = plain(s)
  return { name, full: link ? link[1] : tpl ? `${tpl[1]} (GFL2)` : undefined, linked: !!(link || tpl) }
}

async function banners(gameId: string): Promise<GameEvent[]> {
  const text = await wikitext('GFL2 Banners')
  const en = text.slice(text.search(/^==\s*EN\s*==/m))
  if (en.length === text.length) throw new Error('iopwiki GFL2: falta la sección EN de los banners')
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  // Las reposiciones no enlazan a la muñeca ("Sextans"): su página sale del enlace de su primer banner ("[[Sextans ELMO|Sextans]]"), para el retrato.
  const pages = new Map<string, string>()
  for (const m of en.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]|\{\{GFL2\|([^}|]+)/gi)) {
    const name = (m[2] ?? m[1] ?? m[3]).trim()
    if (!pages.has(name)) pages.set(name, m[3] ? `${m[3].trim()} (GFL2)` : m[1].trim())
  }
  let year = 2024
  for (const block of en.replace(/<!--[\s\S]*?-->/g, '').split(/\n(?=\*[^*]|===)/)) {
    const y = /^===\s*(\d{4})\s*===/.exec(block)
    if (y) { year = +y[1]; continue }
    const lines = block.split('\n')
    const r = gfl2Range(lines[0], year)
    if (!r || r[1] < from || r[0] > to || r[1] <= r[0]) continue
    const custom = /Custom Procurement/i.test(block)
    const dolls = (/\*\*\s*Dolls:\s*(.+)/.exec(block)?.[1] ?? '').split(/,(?![^[]*\]\])/).map(doll).filter(d => d.name)
    // Primera arma: '"Feral Fang", "Sturmgewehr 41", …' o sin comillas ("Rectrix, Pluma Edge, …").
    const wl = /\*\*\s*Weapons:\s*(.+)/.exec(block)?.[1] ?? ''
    const weapon = plain(/"([^"]+)"/.exec(wl)?.[1] ?? wl.split(',')[0] ?? '')
    if (!dolls.length) continue
    const main = dolls[0]
    const title = custom ? 'Custom Procurement' : main.name
    const featured: Featured[] = custom ? [] : dolls.map((d, i) => ({ name: d.name, full: d.full ?? pages.get(d.name) ?? `${d.name} (GFL2)`, rarity: i === 0 ? 5 : 4, tag: i === 0 && weapon ? weapon : undefined }))
    out.push({
      id: `${gameId}:banner:iop:${title}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title,
      // Nueva (enlazada en la wiki) o repetición; el arma limitada que la acompaña va en la etiqueta de la muñeca.
      description: custom ? '⟦d.gfl2Custom⟧' : `⟦d.charBanner⟧${main.linked ? '' : ' · Rerun'}`,
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items: [], featured, pulls: 0, official: true, source: 'api',
    })
  }
  return out.filter((b, i) => out.findIndex(o => o.id === b.id) === i)
}

/**
 * Avisos oficiales de la web global (gf2exilium.sunborngame.com, que los pide a `gf2-web-us-api.sunborngame.com/website/…`; sin claves). Cada evento y
 * banner tiene el suyo ("[Themis' Game]", "Faelynn Rate Up!", "[Broker's Rebate] Is Now Open") con su imagen y "[Duration] 2026/10/29 9:00 ~
 * 2026/11/18 18:59 (UTC-4)". Mandan en horas e imagen; la IOP Wiki completa recompensas, retratos y si es reposición (`officialFirst`, index.ts).
 * 1 lista (`news_list/4`, los 10 más recientes) + el detalle de los de los últimos 45 días (caché de 6 h y 12 h en el proxy).
 */
const SUNBORN = 'https://gf2-web-us-api.sunborngame.com/website'

export function gfl2Notice(gameId: string, title: string, html: string, year: number): GameEvent | null {
  const text = htmlText(html)
  const line = text.split('\n').find(l => /\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s*[~～-]/.test(l))
  const r = line ? rangeIn(line, year, -4) : null
  if (!r || !(r.end > r.start)) return null
  const rate = /^(.+?)\s+Rate Up!?$/i.exec(title.trim())
  const name = (rate?.[1] ?? title).replace(/\s+Is Now (?:Available|Open|Live)$/i, '').replace(/^\[(.+)\]$/, '$1').trim()
  const kind = rate ? 'banner' as const : 'event' as const
  const image = /<img[^>]*\bsrc="([^"]+)"/i.exec(html)?.[1]
  return {
    id: `${gameId}:${kind}:sb:${name}:${new Date(r.start).toISOString().slice(0, 10)}`, gameId, kind, title: name, image,
    start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString(),
    // Los destacados (con retrato y SR) y si es reposición los pone la IOP Wiki al unirse.
    items: [], featured: [], pulls: 0, official: true, source: 'api',
    // Pases y tiendas de pago ("Voyage Logs", "Broker's Rebate"): menores.
    minor: /logs?$|rebate|pack|bundle|shop/i.test(name) || undefined,
  }
}

export async function syncGfl2Official(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${SUNBORN}/news_list/4?page=1&limit=10`))
  if (!res.ok) throw new Error(`sunborn GFL2 → HTTP ${res.status}`)
  const list = ((await res.json())?.data?.list ?? []) as { Id: number; Title: string; Date: string }[]
  // "2026-10-29 09:00:00" en UTC-4 (el servidor global).
  const at = (s: string) => Date.parse(`${s.replace(' ', 'T')}-04:00`)
  const out: GameEvent[] = []
  for (const n of list.filter(x => Date.now() - at(x.Date) < 45 * DAY)) {
    const d = await fetch(viaProxy(`${SUNBORN}/news/${n.Id}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    const e = d?.data?.Content ? gfl2Notice(gameId, n.Title, d.data.Content, new Date(at(n.Date)).getUTCFullYear()) : null
    if (e && +new Date(e.end) > Date.now() - 3 * DAY && !out.some(o => o.id === e.id)) out.push(e)
  }
  if (!out.length && !list.length) throw new Error('sunborn GFL2: sin avisos')
  return { events: out, patches: [], codes: [] }
}

export async function syncGfl2(gameId: string): Promise<GameSync> {
  const [ev, bn] = await Promise.allSettled([events(gameId), banners(gameId)])
  if (ev.status === 'rejected' && bn.status === 'rejected') throw ev.reason
  if (ev.status === 'rejected') console.warn('[gfl2] eventos:', (ev.reason as Error)?.message)
  if (bn.status === 'rejected') console.warn('[gfl2] banners:', (bn.reason as Error)?.message)
  return { events: [...(ev.status === 'fulfilled' ? ev.value : []), ...(bn.status === 'fulfilled' ? bn.value : [])], patches: [], codes: [] }
}
