import { viaProxy } from '../net'
import type { GameEvent, PromoCode, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { syncGame8Codes } from './codes'
import { pullsIn } from './pulls'

/**
 * Monster Hunter Outlanders (Capcom / TiMi; versión global de Level Infinite, NA/JP/EU, salió el 29 oct 2026). Fuentes revisadas el 12 nov 2026:
 *  - GameWith (gamewith.ai, guía en inglés actualizada a diario; robots.txt solo cierra /api/):
 *    - "Event List" (/articles/event-list): tabla "Main Ongoing Events and End Dates" ("Rhythm of Maple | October 29, 2026 to November 13, 2026",
 *      los permanentes dicen "Permanent") y una sección por evento con su imagen y sus recompensas ("Rutacoin ×750", "Day 3 | Featured Contract ×2").
 *    - "Current Banners" (/articles/current-banners): banner destacado y rotatorio con su adventurer ("Featured banner (Midori)", "Runs: Thu, Oct 29 – Fri, Nov 27").
 *    - "Season Guide" (/articles/season-guide): temporada en curso ("Season 0 (Pre-Season) … October 29, 2026 – December 25, 2026").
 *    - "Redeem Codes" (/articles/redeem-codes): tabla de activos, con la nota "Global version only".
 *  - Game8 (archives/634765, "Redeem Codes"): segunda lista de códigos (`syncGame8Codes`), por si GameWith tarda en añadir uno.
 *  - Avisos oficiales: por Discord si se configura su canal (DISCORD_CHANNELS "mho"); mandan sobre GameWith.
 * Horas: las guías solo dan días "(server time)". Se usan las de los avisos oficiales (03:00 → 14:59 UTC, ver `dayStart`) y todo va marcado "≈"
 * hasta que el aviso por Discord da la hora exacta. La versión de Garena (KR/APAC/LatAm) es aparte y no se cubre.
 * 4 páginas de GameWith (caché de 6 h) y 1 de Game8 por ciclo.
 */
const GW = 'https://gamewith.ai/monster-hunter-outlanders/en/articles'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
/**
 * Inicio y fin de un día de las guías. Aviso oficial "When Steelwing Descends" (@MHO_English, 12 nov 2026): "November 13, 2026, 03:00 to
 * November 26, 2026, 14:59 (UTC)". Se usan esas horas (03:00 y 14:59:59 UTC); siguen marcadas "≈" porque GameWith solo da el día.
 */
const dayStart = (y: number, m: number, d: number) => Date.UTC(y, m, d, 3)
const dayEnd = (y: number, m: number, d: number) => Date.UTC(y, m, d, 14, 59, 59)

async function page(path: string): Promise<Document> {
  const res = await fetch(viaProxy(`${GW}/${path}`))
  if (!res.ok) throw new Error(`gamewith MHO ${path} → HTTP ${res.status}`)
  return new DOMParser().parseFromString(await res.text(), 'text/html')
}

/** "October 29, 2026 to November 13, 2026", "Thu, Oct 29 – Fri, Nov 27" (año: el más cercano a hoy) → [inicio, fin]; null si es permanente. */
export function mhoRange(s: string, now = Date.now()): [number, number] | null {
  const found = [...s.matchAll(/([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})(?:,? (\d{4}))?/g)]
    .map(m => ({ m: MONTHS.indexOf(m[1].toLowerCase()), d: +m[2], y: m[3] ? +m[3] : NaN })).filter(x => x.m >= 0)
  if (found.length < 2) return null
  const [a, b] = found
  const year = new Date(now).getUTCFullYear()
  // Sin año: el del inicio más cercano a hoy (en enero, un "Dec 20 – Jan 10" es del año anterior).
  const ay = !isNaN(a.y) ? a.y : [year - 1, year, year + 1].reduce((best, y) => Math.abs(Date.UTC(y, a.m, a.d) - now) < Math.abs(Date.UTC(best, a.m, a.d) - now) ? y : best)
  const by = !isNaN(b.y) ? b.y : b.m < a.m ? ay + 1 : ay
  return [dayStart(ay, a.m, a.d), dayEnd(by, b.m, b.d)]
}

/** Recompensas de las tablas de una sección: "Rutacoin | ×750" o "Day 3 | Featured Contract ×2" (sumadas por objeto). */
export function mhoRewards(rows: [string, string][]): RewardItem[] {
  const out = new Map<string, number>()
  const add = (name: string, n: string) => { const k = name.trim(); if (k && !/^(day|stage|rank)\b/i.test(k)) out.set(k, (out.get(k) ?? 0) + Number(n.replace(/,/g, ''))) }
  for (const [th, td] of rows) {
    const only = /^×\s?([\d,]+)$/.exec(td.trim())
    if (only) { add(th, only[1]); continue }
    for (const m of td.matchAll(/([A-Z][A-Za-z':\- ]*?)\s*×\s?([\d,]+)/g)) add(m[1], m[2])
  }
  return [...out].map(([name, amount]) => ({ name, amount }))
}

async function events(gameId: string): Promise<GameEvent[]> {
  const doc = await page('event-list')
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const heads = [...doc.querySelectorAll('h2')]
  const key = (s: string) => s.toLowerCase().replace(/\(.*?\)|[^a-z0-9]/g, '')
  const out: GameEvent[] = []
  const list = heads.find(h => /ongoing events/i.test(text(h)))
  let table: Element | null = null
  for (let n = list?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) if (n.tagName === 'TABLE' || n.querySelector('table')) { table = n.tagName === 'TABLE' ? n : n.querySelector('table'); break }
  if (!table) throw new Error('gamewith MHO: no se encontró la lista de eventos')
  for (const tr of table.querySelectorAll('tr')) {
    const name = text(tr.querySelector('th')), when = text(tr.querySelector('td'))
    const r = mhoRange(when, now)
    if (!name || !r || r[1] < from || r[0] > to || r[1] <= r[0]) continue
    // Su sección: imagen y tablas de recompensas.
    const head = heads.find(h => key(text(h)).startsWith(key(name)))
    let image: string | undefined
    const rows: [string, string][] = []
    for (let n = head?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
      image ??= (n.tagName === 'IMG' ? n : n.querySelector('img'))?.getAttribute('src') || undefined
      for (const row of (n.tagName === 'TABLE' ? [n] : [...n.querySelectorAll('table')]).flatMap(t => [...t.querySelectorAll('tr')]))
        rows.push([text(row.querySelector('th')), text(row.querySelector('td'))])
    }
    const items = mhoRewards(rows)
    out.push({
      id: `${gameId}:event:gw:${name}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind: 'event', title: name, image,
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items,
      featured: [], pulls: pullsIn('mho', items.map(i => `${i.name} x${i.amount}`)).pulls, source: 'api', precision: 'approx',
    })
  }
  return out
}

/** Banners con fecha (destacado y rotatorio); el de principiante y el permanente no caducan y no salen. */
async function banners(gameId: string): Promise<GameEvent[]> {
  const doc = await page('current-banners')
  const now = Date.now(), from = now - 3 * DAY
  const out: GameEvent[] = []
  const table = [...doc.querySelectorAll('table')].find(t => /banner/i.test(text(t.querySelector('th'))))
  for (const tr of table?.querySelectorAll('tr') ?? []) {
    const cells = [...tr.children].filter(c => c.tagName === 'TD')
    if (cells.length < 2) continue
    const label = text(cells[0])
    const runs = /Runs:\s*(.+?)(?=\s*(?:SSR|Rate-up|Guaranteed|Pick|10-pulls|Ends|$))/i.exec(text(cells[1]))?.[1] ?? ''
    const r = mhoRange(runs, now)
    if (!r || r[1] < from || r[1] <= r[0]) continue
    const who = /\(([^)]+)\)/.exec(label)?.[1]?.trim()
    const rotating = /rotating/i.test(label)
    const title = who ?? label
    out.push({
      id: `${gameId}:banner:gw:${title}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title,
      description: rotating ? '⟦d.mhoRotating⟧' : '⟦d.charBanner⟧', image: cells[0].querySelector('img')?.getAttribute('src') || undefined,
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items: [],
      featured: who ? [{ name: who, rarity: 5, tag: rotating ? 'Standard Contract' : undefined }] : [], pulls: 0, source: 'api', precision: 'approx',
    })
  }
  if (!out.length && !table) throw new Error('gamewith MHO: no se encontró la tabla de banners')
  return out
}

/**
 * Rotatorios: la temporada en curso (Season Guide: "October 29, 2026 – December 25, 2026", con su jefe) y Monster Challenge (Master), cuyas fases
 * "change every two weeks" desde que se abrió el 3 nov 2026 (Season Guide y "Daily and Weekly Checklist"). Recompensas: Rutacoin (100 por fase
 * en rango C, "How to Farm Rutacoin") y Radiant Coin (hasta 4,000 por temporada).
 */
async function challenges(gameId: string): Promise<GameEvent[]> {
  const out: GameEvent[] = []
  const now = Date.now()
  const doc = await page('season-guide').catch(() => null)
  const body = text(doc?.querySelector('main') ?? doc?.body)
  const season = /(Season \d+(?: \([^)]+\))?)[^.]*?runs from ([A-Z][a-z]+ \d{1,2}, \d{4}) to ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(body)
  // Celdas pegadas en el texto: "Season bossRuger AidalSeason 0 started…".
  const boss = /Season boss\s*([A-Z][\w' ]+?)(?=\s*Season \d)/.exec(body)?.[1]?.trim()
  const sr = season && mhoRange(`${season[2]} - ${season[3]}`, now)
  if (season && sr && sr[1] > now - 3 * DAY)
    out.push({
      id: `${gameId}:challenge:gw:${season[1]}:${new Date(sr[0]).toISOString().slice(0, 10)}`, gameId, kind: 'challenge', title: season[1],
      description: boss ? `⟦d.mhoSeason|${boss}⟧` : '⟦d.mhoSeason|—⟧', start: new Date(sr[0]).toISOString(), end: new Date(sr[1]).toISOString(),
      items: [{ name: 'Radiant Coin', amount: 4000 }], featured: [], pulls: 0, source: 'api', precision: 'approx',
    })
  const anchor = dayStart(2026, 10, 3)
  const k = Math.max(0, Math.floor((now - anchor) / (14 * DAY)))
  for (const i of [k, k + 1]) {
    const s = anchor + i * 14 * DAY
    out.push({
      id: `${gameId}:challenge:cycle:Monster Challenge:${new Date(s).toISOString().slice(0, 10)}`, gameId, kind: 'challenge', title: 'Monster Challenge (Master)',
      description: '⟦d.mhoChallenge⟧', start: new Date(s).toISOString(), end: new Date(s + 14 * DAY - 1000).toISOString(),
      items: [], featured: [], pulls: 0, source: 'api', precision: s > now ? 'estimated' : 'approx',
    })
  }
  return out
}

/** Códigos activos de GameWith: código en `<code>`, recompensas en la lista y la nota "Global version only…" se conserva. */
export async function syncMhoCodes(): Promise<PromoCode[]> {
  const doc = await page('redeem-codes')
  const head = [...doc.querySelectorAll('h2')].find(h => /active codes/i.test(text(h)))
  const out: PromoCode[] = []
  for (let n = head?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
    for (const tr of (n.tagName === 'TABLE' ? [n] : [...n.querySelectorAll('table')]).flatMap(t => [...t.querySelectorAll('tbody tr')])) {
      const cells = [...tr.children].filter(c => c.tagName === 'TD')
      const code = text(cells[0]?.querySelector('code'))
      if (!/^[A-Za-z0-9]{4,30}$/.test(code) || out.some(c => c.code.toUpperCase() === code.toUpperCase())) continue
      const rewards = [...(cells[1]?.querySelectorAll('li') ?? [])].map(li => text(li).replace(/\s*×\s*/, ' ×'))
      const note = /global version only/i.test(text(cells[0])) ? ['Global only'] : []
      const until = /(?:Until|Ends?)\s+([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(text(cells[2]))?.[1]
      out.push({ code, rewards: [...rewards.slice(0, 6), ...note, ...(until ? [`Until ${until}`] : [])] })
    }
  }
  return out
}

/**
 * Iconos de los objetos: la "Item and Material List" de GameWith (/en/items) trae los ~680 objetos del juego con su imagen en los datos de la página
 * (`"name":"Rutacoin","image":"https://img.gamewith.jp/…/item_3.png"`, escapados dentro del script de Next.js). 1 página por ciclo (caché de 6 h).
 * Sirven para las recompensas de GameWith y para las de los avisos por Discord (index.ts, `withItemIcons`).
 */
export async function mhoIcons(): Promise<Map<string, string>> {
  const res = await fetch(viaProxy('https://gamewith.ai/monster-hunter-outlanders/en/items'))
  if (!res.ok) throw new Error(`gamewith MHO items → HTTP ${res.status}`)
  const html = await res.text()
  const out = new Map<string, string>()
  for (const m of html.matchAll(/\\"name\\":\\"([^"\\]{1,80})\\",\\"image\\":\\"(https:\/\/img\.gamewith\.jp\/[^"\\]+)\\"/g)) if (!out.has(m[1].toLowerCase())) out.set(m[1].toLowerCase(), m[2])
  return out
}

export async function syncMho(gameId: string): Promise<GameSync> {
  const [ev, bn, ch, gw, g8] = await Promise.allSettled([events(gameId), banners(gameId), challenges(gameId), syncMhoCodes(), syncGame8Codes('mho')])
  if (ev.status === 'rejected' && bn.status === 'rejected') throw ev.reason
  for (const [what, r] of [['eventos', ev], ['banners', bn], ['códigos GameWith', gw], ['códigos Game8', g8]] as const)
    if (r.status === 'rejected') console.warn(`[mho] ${what}:`, (r.reason as Error)?.message)
  // Códigos: GameWith primero (trae la nota de región); los de Game8 que falten, después.
  const codes = [...(gw.status === 'fulfilled' ? gw.value : []), ...(g8.status === 'fulfilled' ? g8.value : [])]
    .filter((c, i, all) => all.findIndex(x => x.code.toUpperCase() === c.code.toUpperCase()) === i)
  return {
    events: [...(ev.status === 'fulfilled' ? ev.value : []), ...(bn.status === 'fulfilled' ? bn.value : []), ...(ch.status === 'fulfilled' ? ch.value : [])],
    patches: [],
    codes,
  }
}
