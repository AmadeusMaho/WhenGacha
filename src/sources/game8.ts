import { viaProxy } from '../net'
import type { GameEvent, RewardItem } from '../types'
import { pullsIn, type PullGame } from './pulls'
import type { GameSync } from './ennead'

/**
 * Eventos desde las páginas "List of Events and Schedule" de Game8 (game8.co). Solo traen el día (sin hora) y es una guía
 * editada a mano: puede equivocarse en fechas sueltas (se comprobó que los banners sí coinciden con Prydwen y gachafocus).
 * Por eso las horas se completan con las que usa cada juego y se marcan como aproximadas; si gachafocus responde, manda él.
 */
const SITE = 'https://game8.co/games'
const DAY = 86_400_000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

interface Config {
  path: string
  /** Hora local (UTC+8, servidor Asia: es en la que Game8 escribe las fechas) de inicio, y de fin, con su día respecto al listado. */
  utc: number
  start: [number, number]
  end: [number, number, number]
}

/** Horas habituales de cada juego, sacadas de sus banners: WuWa 10:00 → 11:59 (UTC+8); NTE 11:00 → 05:59 (UTC+8). */
export const GAME8: Record<string, Config> = {
  wuwa: { path: 'Wuthering-Waves/archives/453473', utc: 8, start: [10, 0], end: [11, 59, 0] },
  nte: { path: 'Neverness-to-Everness/archives/592073', utc: 8, start: [11, 0], end: [5, 59, 0] },
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const DATE = /([A-Z][a-z]+)\.? (\d{1,2})(?:[,.]? (\d{4}))?/g
const LABEL = /^(start date|end date|event duration|event|date|duration|name)$/i

/** "October 15, 2026 - November 1, 2026" o "October 8 - November 11, 2026" -> [inicio, fin] como {año, mes, día}; null si no hay fin (permanente, TBA). */
function range(s: string): [{ y: number; m: number; d: number }, { y: number; m: number; d: number }] | null {
  if (/permanent|indefinite|tba|until/i.test(s)) return null
  const found = [...s.matchAll(DATE)].map(m => ({ m: MONTHS.indexOf(m[1].toLowerCase()), d: +m[2], y: m[3] ? +m[3] : NaN })).filter(x => x.m >= 0)
  if (found.length < 2) return null
  const [a, b] = found
  if (isNaN(b.y)) return null
  const startY = isNaN(a.y) ? (a.m > b.m ? b.y - 1 : b.y) : a.y
  return [{ y: startY, m: a.m, d: a.d }, { y: b.y, m: b.m, d: b.d }]
}

export async function syncGame8(gameId: string, key: keyof typeof GAME8): Promise<GameSync> {
  const { events } = await game8List(gameId, key)
  return { events, patches: [], codes: [] }
}

/** Filas de la lista de eventos de Game8, con el enlace a la guía de cada evento (id del evento → URL). */
async function game8List(gameId: string, key: keyof typeof GAME8): Promise<{ events: GameEvent[]; links: Map<string, string> }> {
  const cfg = GAME8[key]
  const links = new Map<string, string>()
  const res = await fetch(viaProxy(`${SITE}/${cfg.path}`))
  if (!res.ok) throw new Error(`game8 ${cfg.path} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY
  const toMs = (d: { y: number; m: number; d: number }, h: number, mi: number) => Date.UTC(d.y, d.m, d.d, h - cfg.utc, mi)

  const out: GameEvent[] = []
  const seen = new Set<string>()
  doc.querySelectorAll('table tr').forEach(tr => {
    const cells = [...tr.children].filter(c => /^T[DH]$/i.test(c.tagName)).map(text)
    if (cells.length < 2 || LABEL.test(cells[0])) return
    const name = cells[0]
    const r = cells.slice(1).map(range).find(Boolean)
    if (!name || !r) return
    const start = toMs(r[0], cfg.start[0], cfg.start[1])
    const end = toMs({ ...r[1], d: r[1].d + cfg.end[2] }, cfg.end[0], cfg.end[1]) + (cfg.end[1] === 59 ? 59_000 : 0)
    if (!(end > start) || end < from || start > to || end - start > 150 * DAY) return
    const id = `${gameId}:event:g8:${name}:${new Date(start).toISOString().slice(0, 10)}`
    if (seen.has(id)) return
    seen.add(id)
    const href = tr.querySelector('a[href*="/archives/"]')?.getAttribute('href')
    if (href) links.set(id, new URL(href, 'https://game8.co').toString())
    // Arte del evento: Game8 carga sus imágenes en diferido (`data-src`); `src` es un GIF vacío.
    const img = tr.querySelector('img')
    const image = img?.getAttribute('data-src') || (img?.getAttribute('src')?.startsWith('http') ? img.getAttribute('src')! : undefined)
    // Columna "Rewards" de NTE: "・Glider Skin - Joy Buoy ・Annulith ・Fons", sin cantidades (21 nov 2026: 7 eventos salían sin recompensas).
    // Van sin cifra (amount 0), como en R:1999; los aumentos de botín ("Double Event Rewards", "x2 Fons") no son objetos.
    const items = (cells.slice(2).reverse().find(c => c.includes('・')) ?? '').split('・').map(s => s.trim())
      .filter(s => s && s.length < 60 && !/double|^x\d|\bx\d+\s*$/i.test(s)).map(name => ({ name, amount: 0 }))
    out.push({
      id, gameId, kind: 'event', title: name, image,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), items, featured: [], pulls: 0, source: 'api',
      precision: 'approx',
    })
  })
  if (!out.length) throw new Error(`game8 ${cfg.path}: no se encontraron eventos`)
  return { events: out, links }
}

/** Recompensas de la guía de un evento: la primera tabla tras el título "… Rewards" ("Astrite", "Premium Tuner"; "x60" si la da), con su icono. */
export async function game8PageRewards(url: string): Promise<RewardItem[]> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`game8 ${url} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const head = [...doc.querySelectorAll('h2')].find(h => /\bRewards?\b/i.test(text(h)))
  let table: Element | null = null
  for (let n = head?.nextElementSibling; n && n.tagName !== 'H2' && !table; n = n.nextElementSibling) table = n.tagName === 'TABLE' ? n : n.querySelector('table')
  if (!table) return []
  const out: RewardItem[] = []
  for (const td of table.querySelectorAll('td')) {
    const t = text(td)
    const img = td.querySelector('img')
    const icon = img?.getAttribute('data-src') || (img?.getAttribute('src')?.startsWith('http') ? img.getAttribute('src')! : undefined)
    // Una celda por objeto ("Astrite x400") o una por tramo con varios ("Astrite x20 Advanced Resonance Potion x2", Ascendant Aces): se suman.
    const many = [...t.matchAll(/([A-Za-z][^×]*?)\s*[x×]\s?([\d,]+)(?=\s|$)/g)]
    const parts = many.length ? many.map(m => [m[1].trim(), Number(m[2].replace(/,/g, ''))] as const) : [[t.trim(), 0] as const]
    for (const [name, amount] of parts) {
      // Números de día sueltos (las tablas de inicio de sesión: "1", "2"…) no son objetos.
      if (!name || name.length > 50 || !/[A-Za-z]/.test(name)) continue
      const had = out.find(i => i.name === name)
      if (had) { had.amount += amount; continue }
      out.push({ name, amount, ...(icon && parts.length === 1 ? { icon } : {}) })
    }
  }
  return out
}

/**
 * WuWa (21 nov 2026): los avisos de Kuro no traen las recompensas de los eventos sin "Event Preview" (Lahai-Roi Blocks, Dreamfield Odyssey,
 * Whither the Wind…), pero la guía de Game8 de cada uno sí las nombra. También añade lo que solo está en Game8 (Ascendant Aces).
 * 1 lista + hasta 8 guías por ciclo (caché del proxy). Game8 rechaza las IP de servidores: solo llega desde la tarea del PC (carryOver lo conserva).
 */
export async function withGame8Extras(s: GameSync, gameId: string, key: keyof typeof GAME8, game: PullGame): Promise<GameSync> {
  const list = await game8List(gameId, key).catch(err => { console.warn('[game8]', (err as Error)?.message ?? err); return null })
  if (!list) return s
  const norm = (t: string) => t.toLowerCase().replace(/\[[^\]]*\]|[^a-z0-9]/g, '')
  const now = Date.now()
  const events = s.events.map(e => ({ ...e }))
  const want: [GameEvent, string][] = []
  for (const g of list.events) {
    if (+new Date(g.end) < now) continue
    const k = norm(g.title)
    const twin = events.find(e => e.kind !== 'banner' && Math.abs(+new Date(e.start) - +new Date(g.start)) <= 2 * DAY
      && (norm(e.title).includes(k) || k.includes(norm(e.title)) || norm(e.title.replace(/^\[([^\]]+)\].*$/, '$1')) === k))
    const url = list.links.get(g.id)
    if (!twin) { events.push(g); if (url && !g.items.length) want.push([g, url]); continue }
    // Los de aumento de botín ("Limited-Time Material Double Drop Event") no reparten nada: no se pide su guía.
    if (!twin.items.length && url && !/double drop/i.test(twin.title)) want.push([twin, url])
  }
  for (const [e, url] of want.slice(0, 8)) {
    const items = await game8PageRewards(url).catch(() => [] as RewardItem[])
    if (!items.length) continue
    e.items = items
    e.pulls = pullsIn(game, items.filter(i => i.amount > 0).map(i => `${i.name} x${i.amount}`)).pulls
  }
  return { ...s, events }
}

/**
 * Modos recurrentes (rotatorios) desde la lista de eventos de Game8 en formato de secciones: bajo "List of Current Events", cada `<h3>` es un evento
 * con una tabla "Start Date October 21, 2026 End Date December 23, 2026 Rewards Crystals and Cores" y su imagen. Se usa para CZN, cuya sección
 * "Permanent Events" agrupa sus modos recurrentes (Full-Scale Offensive, Virtual Tactical Simulation, Spiral Tower of Screams).
 * Solo se añaden los que cumplen `recurring` y no están ya en `existing` (los avisos oficiales mandan). Game8 da el día: las horas son las del
 * mantenimiento semanal de CZN (inicio ≈07:00 UTC, fin 00:00 UTC) y se marcan "≈". Las recompensas, sin cantidades, van en la descripción.
 */
export async function game8Recurring(gameId: string, path: string, recurring: RegExp, existing: GameEvent[]): Promise<GameEvent[]> {
  const res = await fetch(viaProxy(`${SITE}/${path}`))
  if (!res.ok) throw new Error(`game8 ${path} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 3).join(' ')
  const have = new Set(existing.map(e => words(e.title)))
  const now = Date.now(), from = now - 3 * DAY
  const day = (s: string) => {
    const m = /([A-Z][a-z]+)\.? (\d{1,2}),? (\d{4})/.exec(s)
    const mo = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
    return m && mo >= 0 ? Date.UTC(+m[3], mo, +m[2]) : NaN
  }
  const out: GameEvent[] = []
  const head = [...doc.querySelectorAll('h2')].find(h => /List of Current Events/i.test(text(h)))
  for (let n = head?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
    if (n.tagName !== 'H3') continue
    const name = text(n)
    if (!recurring.test(name) || have.has(words(name))) continue
    let info = '', image: string | undefined
    for (let k = n.nextElementSibling; k && !/^H[23]$/.test(k.tagName); k = k.nextElementSibling) {
      if (!image) { const img = k.querySelector('img'); image = img?.getAttribute('data-src') || undefined }
      if (k.tagName === 'TABLE' && !info) info = text(k)
    }
    const s = day(/Start Date\s+(.+?)\s+End Date/i.exec(info)?.[1] ?? ''), e = day(/End Date\s+(.+?)(?:\s+Rewards|$)/i.exec(info)?.[1] ?? '')
    if (isNaN(s) || isNaN(e) || e <= s || e < from) continue
    const rewards = /Rewards\s+(.+)$/i.exec(info)?.[1]?.trim()
    out.push({
      id: `${gameId}:challenge:g8:${name}:${new Date(s).toISOString().slice(0, 10)}`, gameId, kind: 'challenge', title: name,
      description: rewards ? `⟦d.rewardsList|${rewards}⟧` : undefined, image,
      start: new Date(s + 7 * 3_600_000).toISOString(), end: new Date(e - 1000).toISOString(),
      items: [], featured: [], pulls: 0, source: 'api', precision: 'approx',
    })
  }
  return out
}
