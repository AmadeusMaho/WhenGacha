import { viaProxy } from '../net'
import type { GameEvent, Patch, PromoCode } from '../types'
import type { GameSync } from './ennead'
import { syncGame8Codes } from './codes'

/**
 * Duet Night Abyss (Pan Studio / Hero Games). Fuentes revisadas el 12 nov 2026:
 *  - Eventos: "List of All Events and Schedule" de Game8 (archives/559948), tablas "Current" y "Upcoming": nombre + "Duration: November 10 –
 *    December 21, 2026 …". Solo el día; las horas son las del servidor América (abajo) y se marcan "≈".
 *  - Banners (Myriad, gacha de cosméticos: los personajes y armas NO van por gacha): página "Banners" de Game8 (archives/554952), sección
 *    "Limited-Time Myriad Gacha Banners": cada `<h3>` es un banner con "released on October 20 2026 and will be available until November 30, 2026"
 *    y su aspecto destacado ("All Golden-Tier Character Skin Drops Veil in Shadows" o "features Su Yi's skin, Volant Viriditiy").
 *  - Códigos: "Redeem Codes" de Game8 (archives/557781), mismo formato que CZN/Endfield (`syncGame8Codes`).
 *  - Avisos oficiales: canal de Discord "dna" de DISCORD_CHANNELS (el oficial de DNA seguido en nuestro servidor); mandan sobre Game8 (index.ts).
 *  - La wiki de Fandom (duetnightabyss.fandom.com) se dejó de actualizar en marzo de 2026: solo se usa para los iconos (Phoxene, Hourglass).
 *  - Segunda lista de eventos (26 nov 2026): gacha.gg (`ggEvents`), para cuando Game8 rechaza la IP del servidor; añade los que Game8 no tenga.
 * 3 páginas de Game8 y 1 de gacha.gg por ciclo (caché de 6 h y 12 h en el proxy).
 *
 * Servidores: Asia/SEA/HMT (UTC+8), Europa (UTC+1) y América (UTC-5) cambian a la misma hora LOCAL ("July 23, 2026, 10:00 - August 4, 2026, 05:00"
 * en los tres, aviso oficial). La app usa el de América, el más cercano a su público: inicio 10:00 y fin 05:00 (UTC-5).
 */
const SITE = 'https://game8.co/games/Duet-Night-Abyss/archives'
export const DNA_ZONE = -5
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const at = (y: number, m: number, d: number, h: number) => Date.UTC(y, m, d, h - DNA_ZONE)

/** "November 10 – December 21, 2026", "October 20, 2026 – November 22, 2026" → [inicio, fin] (ms, hora de América); null sin fin. */
export function dnaRange(s: string): [number, number] | null {
  const found = [...s.matchAll(/([A-Z][a-z]+)\.? (\d{1,2})(?:(?:st|nd|rd|th)?,? (\d{4}))?/g)]
    .map(m => ({ m: MONTHS.indexOf(m[1].toLowerCase()), d: +m[2], y: m[3] ? +m[3] : NaN })).filter(x => x.m >= 0)
  if (found.length < 2) return null
  const [a, b] = found
  const by = isNaN(b.y) ? (isNaN(a.y) ? NaN : a.y + (b.m < a.m ? 1 : 0)) : b.y
  if (isNaN(by)) return null
  const ay = isNaN(a.y) ? (a.m > b.m ? by - 1 : by) : a.y
  return [at(ay, a.m, a.d, 10), at(by, b.m, b.d, 5)]
}

async function page(id: string): Promise<Document> {
  const res = await fetch(viaProxy(`${SITE}/${id}`))
  if (!res.ok) throw new Error(`game8 DNA ${id} → HTTP ${res.status}`)
  return new DOMParser().parseFromString(await res.text(), 'text/html')
}

const imgOf = (el: Element | null | undefined) => {
  const img = el?.querySelector('img')
  return img?.getAttribute('data-src') || (img?.getAttribute('src')?.startsWith('http') ? img.getAttribute('src')! : undefined)
}

/** Eventos vigentes y próximos (tablas "Event | Schedule & Summary"); la tabla de pasados y la de permanentes no traen dos fechas útiles. */
async function events(gameId: string): Promise<GameEvent[]> {
  const doc = await page('559948')
  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY
  const out: GameEvent[] = []
  for (const tr of doc.querySelectorAll('table tr')) {
    const cells = [...tr.children].filter(c => /^T[DH]$/i.test(c.tagName))
    if (cells.length < 2) continue
    const name = text(cells[0]).replace(/\s*\((?:New Event!|Returning Event)\)\s*$/i, '').replace(/\s+Returning Event$/i, '').trim()
    const info = text(cells[1])
    if (!name || /^event$/i.test(name) || /tba|coming soon/i.test(info)) continue
    // "Phase I: October 29 - November 5 Phase II: November 12 - November 19" → la fase que aún no ha terminado.
    const phases = info.split(/Phase [IVX]+\s*:/i).slice(1)
    const ranges = (phases.length ? phases : [info]).map(dnaRange).filter((r): r is [number, number] => !!r)
    const r = ranges.find(x => x[1] > from) ?? ranges[0]
    if (!r) continue
    const [start, end] = r
    if (!(end > start) || end < from || start > to || end - start > 150 * DAY) continue
    const summary = info.replace(/^.*?\d{4}\s*/, '').trim()
    out.push({
      id: `${gameId}:event:g8:${name}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'event', title: name,
      description: summary.length > 3 ? summary : undefined, image: imgOf(tr),
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured: [], pulls: 0, source: 'api', precision: 'approx',
      // Rebajas de la tienda y pruebas de personaje: menores (como en los demás juegos).
      minor: /^(Traces in the Sand|Silken Serenade)\b/i.test(name) || /\btry out\b|\btrial play\b/i.test(info) || undefined,
    })
  }
  if (!out.length) throw new Error('game8 DNA: no se encontraron eventos')
  return out
}

/** «18 November to 4 December 2026», «29 December 2026 to 5 January 2027» → [inicio, fin] (hora de América, como Game8); null si no encaja. */
export function ggRange(s: string): [number, number] | null {
  const m = /(\d{1,2}) ([A-Z][a-z]+)(?: (\d{4}))? to (\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(s)
  if (!m) return null
  const am = MONTHS.indexOf(m[2].toLowerCase()), bm = MONTHS.indexOf(m[5].toLowerCase())
  if (am < 0 || bm < 0) return null
  const by = +m[6], ay = m[3] ? +m[3] : am > bm ? by - 1 : by
  return [at(ay, am, +m[1], 10), at(by, bm, +m[4], 5)]
}

/**
 * Lista de eventos de gacha.gg («Every event so far»: `<li>` con el nombre y «Dates: 18 November to 4 December 2026 (on now)»; robots.txt
 * "Allow: /"). Solo el día, como Game8. Segunda lista desde el 26 nov 2026: Game8 rechaza las IP de servidores (su WAF) y sin la tarea del PC DNA
 * se quedaba sin eventos; además el canal de Discord seguido no publica nada. Solo los vigentes o recién acabados.
 */
export function ggEvents(gameId: string, doc: Document, now = Date.now()): GameEvent[] {
  const out: GameEvent[] = []
  for (const li of doc.querySelectorAll('li')) {
    const spans = [...li.children]
    const name = text(spans[0])
    const r = /^Dates\s*:/i.test(text(spans[1])) ? ggRange(text(spans[1])) : null
    if (!name || !r || r[1] < now - 3 * DAY || !(r[1] > r[0]) || r[1] - r[0] > 150 * DAY) continue
    out.push({
      id: `${gameId}:event:gg:${name}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind: 'event', title: name,
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items: [], featured: [], pulls: 0, source: 'api', precision: 'approx',
      minor: /^(Traces in the Sand|Silken Serenade)\b/i.test(name) || undefined,
    })
  }
  return out
}

async function ggList(gameId: string): Promise<GameEvent[]> {
  const res = await fetch(viaProxy('https://www.gacha.gg/duet-night-abyss/events'))
  if (!res.ok) throw new Error(`gacha.gg DNA → HTTP ${res.status}`)
  const list = ggEvents(gameId, new DOMParser().parseFromString(await res.text(), 'text/html'))
  if (!list.length) throw new Error('gacha.gg DNA: no se encontraron eventos')
  return list
}

/**
 * Los de gacha.gg que Game8 no tiene: mismo nombre (o uno empieza por el otro: gacha.gg dice "Immersive Theatre" y Game8 "Immersive Theatre:
 * Ensemble Act") y fin a ±2 días = el mismo evento. Los "Immersive Theatre" a secas no se añaden nunca: el nombre completo llega de Game8 o de
 * Steam y la temporada del modo, de `dnaTheatre`.
 */
function withGg(g8: GameEvent[], gg: GameEvent[]): GameEvent[] {
  const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const same = (a: string, b: string) => k(a) === k(b) || k(a).startsWith(k(b)) || k(b).startsWith(k(a))
  return [...g8, ...gg.filter(e => !/^immersive theatre$/i.test(e.title)
    && !g8.some(o => o.kind === 'event' && same(o.title, e.title) && Math.abs(Date.parse(o.end) - Date.parse(e.end)) <= 2 * DAY))]
}

/** Banners Myriad limitados (cosméticos) y la versión en que salieron. */
async function banners(gameId: string): Promise<{ events: GameEvent[]; patches: Patch[] }> {
  const doc = await page('554952')
  const out: GameEvent[] = []
  const patches: Patch[] = []
  const head = [...doc.querySelectorAll('h2')].find(h => /Limited[- ]Time Myriad/i.test(text(h)))
  const found: { name: string; info: string; image?: string; skinImg?: string }[] = []
  for (let n = head?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
    if (n.tagName !== 'H3') continue
    let info = '', image: string | undefined, skinImg: string | undefined
    for (let k = n.nextElementSibling; k && !/^H[23]$/.test(k.tagName); k = k.nextElementSibling) {
      // La tabla "Rate-Up Character Skins" trae la imagen del aspecto (vertical, 400×550): es el retrato del destacado.
      if (k.tagName === 'TABLE') skinImg ??= imgOf(k)
      else image ??= imgOf(k)
      info += ' ' + text(k)
    }
    found.push({ name: text(n), info, image, skinImg })
  }
  // Los banners de una misma versión acaban juntos: si uno no dice su fin, toma el del otro que empezó el mismo día.
  const parsed = found.map(f => {
    const start = /(?:released on|Release Date)\s+([A-Z][a-z]+ \d{1,2},? \d{4})/i.exec(f.info)?.[1]
    const end = /(?:until|~|–|-)\s*([A-Z][a-z]+ \d{1,2},? \d{4})/i.exec(f.info.replace(/released on [A-Z][a-z]+ \d{1,2},? \d{4}/i, ''))?.[1]
    const r = start ? dnaRange(`${start} - ${end ?? start}`) : null
    return { ...f, s: r?.[0], e: end ? r?.[1] : undefined }
  })
  const now = Date.now()
  for (const b of parsed) {
    if (b.s === undefined) continue
    const e = b.e ?? parsed.find(o => o.e && o.s === b.s)?.e
    const end = e ?? b.s + 41 * DAY - 5 * HOUR
    if (end < now - 3 * DAY) continue
    // "All Golden-Tier Character Skin Drops Veil in Shadows", "called Veil in the Shadows", "features Su Yi's skin, Volant Viriditiy".
    const skin = /\bskin for [^,.]+? called ([A-Z][^.]+?)\./.exec(b.info)?.[1]?.trim()
      ?? /'s skin,\s+([A-Z][^.]+?)\./.exec(b.info)?.[1]?.trim()
      ?? /Skin Drops\s+(.+?)(?=\s+\S+(?:\s+\S+)*\s+Banner and\b|$)/.exec(b.info)?.[1]?.trim()
    const owner = /skin for ([A-Z][\w:' ]+?) called/.exec(b.info)?.[1] ?? /features ([A-Z][\w:' ]+?)'s skin/.exec(b.info)?.[1]
    out.push({
      id: `${gameId}:banner:g8:${b.name}:${new Date(b.s).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title: b.name,
      description: '⟦d.dnaMyriad⟧', image: b.image, start: new Date(b.s).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: skin ? [{ name: skin, rarity: 5, tag: owner, icon: b.skinImg }] : [], pulls: 0, source: 'api', precision: 'approx', open: !e || undefined,
    })
    const v = /Version (?:update )?(\d+\.\d+)/i.exec(b.info)?.[1]
    if (v && !patches.some(p => p.version === v))
      patches.push({ id: `${gameId}:patch:${v}`, gameId, version: v, date: new Date(b.s).toISOString(), notes: '', source: 'api' })
  }
  return { events: out, patches }
}

/**
 * Immersive Theatre: modo de combate de fin de juego que "resets every 28 days" (Game8, eventos permanentes; allthings.how, "the 28-day cycle").
 * Temporada en curso desde el 20 oct 2026 (Game8: "Event Start: October 20, 2026"). Recompensas: Secret Letter Clues (hasta 280 por ciclo) y Thoughts.
 */
export function dnaTheatre(gameId: string, now = Date.now()): GameEvent[] {
  const anchor = at(2026, 9, 20, 10)
  const k = Math.floor((now - anchor) / (28 * DAY))
  return [k, k + 1].map(i => {
    const s = anchor + i * 28 * DAY
    return {
      id: `${gameId}:challenge:cycle:Immersive Theatre:${new Date(s).toISOString().slice(0, 10)}`, gameId, kind: 'challenge' as const, title: 'Immersive Theatre',
      description: '⟦d.dnaTheatre⟧', start: new Date(s).toISOString(), end: new Date(s + 28 * DAY - 5 * HOUR - 1000).toISOString(),
      items: [{ name: 'Secret Letter Clue', amount: 280 }], featured: [], pulls: 0, source: 'api' as const, precision: s > now ? 'estimated' as const : 'approx' as const,
    }
  })
}

export async function syncDna(gameId: string): Promise<GameSync> {
  const [ev, bn, cd, gg] = await Promise.allSettled([events(gameId), banners(gameId), syncGame8Codes('dna'), ggList(gameId)])
  if (ev.status === 'rejected' && bn.status === 'rejected' && gg.status === 'rejected') throw ev.reason
  if (gg.status === 'rejected') console.warn('[dna] gacha.gg:', (gg.reason as Error)?.message)
  const codes: PromoCode[] = cd.status === 'fulfilled' ? cd.value : []
  const list = withGg(ev.status === 'fulfilled' ? ev.value : [], gg.status === 'fulfilled' ? gg.value : [])
  return {
    events: [...list, ...(bn.status === 'fulfilled' ? bn.value.events : []), ...dnaTheatre(gameId)],
    patches: bn.status === 'fulfilled' ? bn.value.patches : [],
    codes,
  }
}
