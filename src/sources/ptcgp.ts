import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Pokémon TCG Pocket (The Pokémon Company / Creatures / DeNA; un solo servidor mundial; el juego cambia de día a las 06:00 UTC). Fuentes revisadas
 * el 27 nov 2026:
 *  - Game8, portada del juego ("Latest Updates"): cada expansión nueva con su salida exacta ("Dual Fusion (C1) … has been released on October 28,
 *    2026 at 6 PM PDT") y su imagen, y las anunciadas en cuanto Game8 las publica. Las expansiones son el "gacha" del juego: cada una es un banner
 *    hasta la siguiente. pokemon-zone.com (lista de expansiones y lo próximo con hora exacta) pone un desafío de Cloudflare al cliente del
 *    recolector (27 nov 2026): no se usa.
 *  - Game8, "All New and Upcoming Events Schedule" (archives/483037): la sección "List of Current and Upcoming Events", un apartado por evento con su
 *    imagen y "It will run from November 26 to December 26, 2026". Solo da días; la hora sale de la regla del juego (06:00 UTC del primer día a
 *    05:59 UTC del último; ver `game8PocketEvents`). Su calendario (api/calendars) exige la sesión de un navegador: no se usa.
 *  - Serebii (tcgpocket/events.shtml y la página de cada evento): las recompensas de las misiones con su icono y cantidad.
 *  - Sin códigos de canje: el juego no los tiene. ptcgpocket.gg (calendario con horas UTC) cierra su robots.txt a los rastreadores de IA: no se usa.
 * 2 páginas de Game8 + 1 lista y hasta 6 eventos de Serebii por ciclo (caché de 6 h).
 */
const G8_TOP = 'https://game8.co/games/Pokemon-TCG-Pocket'
const G8 = 'https://game8.co/games/Pokemon-TCG-Pocket/archives/483037'
const DAY = 86_400_000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "November 26" / "December 26, 2026" → ms a las 06:00 UTC. */
function date(s: string, year?: number): number | null {
  const m = /([A-Z][a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/.exec(s)
  if (!m) return null
  const mo = MONTHS.findIndex(x => x.startsWith(m[1].toLowerCase().slice(0, 3)))
  const y = m[3] ? +m[3] : year
  return mo < 0 || !y ? null : Date.UTC(y, mo, +m[2], 6)
}

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim()

/** Eventos de la lista de Game8: título, imagen y "from <inicio> to <fin, año>". */
export function game8PocketEvents(gameId: string, html: string): GameEvent[] {
  const a = html.indexOf('id="hl_2"'), b = html.indexOf('id="hl_3"', a)
  if (a < 0) return []
  const s = html.slice(a, b > a ? b : undefined)
  const out: GameEvent[] = []
  for (const m of s.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/g)) {
    const title = strip(m[1])
    const text = strip(m[2])
    const r = /(?:from|between)\s+([A-Z][a-z]+\.?\s+\d{1,2}(?:,?\s*\d{4})?)\s+(?:to|until|and|-|~)\s+([A-Z][a-z]+\.?\s+\d{1,2},?\s*\d{4})/.exec(text)
    if (!title || !r) continue
    const end = date(r[2])
    const yEnd = +(/\d{4}/.exec(r[2])?.[0] ?? 0)
    let start = date(r[1], yEnd)
    if (start && end && start > end) start = date(r[1], yEnd - 1)
    if (!start || !end || end < Date.now() - DAY) continue
    const link = /href="(\/games\/Pokemon-TCG-Pocket\/archives\/\d+)"/.exec(m[2])?.[1]
    out.push({
      id: `${gameId}:event:g8:${link?.split('/').pop() ?? title}`, gameId, kind: 'event', title,
      image: /data-src="(https:\/\/img\.game8\.co\/[^"]+)"/.exec(m[2])?.[1], description: text.split(/(?<=\.)\s/).find(x => /consists of|allows you|you can/i.test(x)),
      // Hora exacta por la regla del juego: todo empieza a las 06:00 UTC del primer día y acaba a las 05:59 UTC del último (Bulbapedia, "Wonder pick
      // event": "began at 06:00 UTC on the specified start date and concluded at 05:59 UTC on the specified end date"; comprobado el 27 nov 2026 con
      // los datos del juego de pokemon-zone: Vee Vee! Eevee 21 nov 06:00 → 15 dic 06:00, Winter Holidays 26 nov → 26 dic 06:00).
      start: new Date(start).toISOString(), end: new Date(end - 60_000).toISOString(), items: [], featured: [], pulls: 0, source: 'api',
      // Las de un año (Pika Pika! Pikachu, oct 2026 – oct 2027) y las de colección de cartas son de fondo.
      minor: end - start > 90 * DAY || /collection missions|deck gift/i.test(title) ? true : undefined,
    })
  }
  return out
}

interface Expansion { code: string; name: string; logo?: string; release: number; exact?: boolean }

/** "October 28, 2026 at 6 PM PDT" → ms (PDT = UTC-7, PST = UTC-8; sin hora, las 06:00 UTC). */
function g8Time(s: string): { at: number; exact: boolean } | null {
  const d = date(s)
  if (!d) return null
  const t = /at\s+(\d{1,2})(?::(\d{2}))?\s*([AP])M\s*(PDT|PST|UTC|JST)?/i.exec(s)
  if (!t) return { at: d, exact: false }
  const h = (+t[1] % 12) + (/p/i.test(t[3]) ? 12 : 0)
  const off = { PDT: -7, PST: -8, UTC: 0, JST: 9 }[(t[4] ?? 'PDT').toUpperCase() as 'PDT'] ?? -7
  const base = d - 6 * 3_600_000 // medianoche UTC de ese día
  return { at: base + (h - off) * 3_600_000 + (t[2] ? +t[2] : 0) * 60_000, exact: true }
}

/**
 * Expansiones de la portada del juego en Game8 ("Latest Updates"): "Dual Fusion (C1) Available Now!" + "has been released on October 28, 2026 at
 * 6 PM PDT"; las anunciadas, "… (C2) Release Date …" + "will be released on …". Su logo es la imagen del apartado.
 */
export function game8Expansions(html: string): Expansion[] {
  const a = html.indexOf('id="hl_1"'), b = html.indexOf('id="hl_2"', a)
  if (a < 0) return []
  const out: Expansion[] = []
  for (const m of html.slice(a, b > a ? b : undefined).matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/g)) {
    const h = strip(m[1])
    const x = /^(.+?)\s*\(([A-Z]\d+[a-z]?)\)\s*(?:Available Now|Release Date|Coming Soon|Announced|Releases?|Out Now)/i.exec(h)
    if (!x) continue
    const text = strip(m[2])
    const r = /(?:released|releases?|release date is|launch(?:es|ed)?)\s+(?:on\s+)?([A-Z][a-z]+\.?\s+\d{1,2},?\s*\d{4}(?:\s+at\s+\d{1,2}(?::\d{2})?\s*[AP]M\s*(?:PDT|PST|UTC|JST)?)?)/i.exec(text)
    const t = r && g8Time(r[1])
    if (!t || out.some(e => e.code === x[2])) continue
    out.push({ code: x[2], name: x[1].trim(), logo: /data-src="(https:\/\/img\.game8\.co\/[^"]+)"/.exec(m[2])?.[1], release: t.at, exact: t.exact })
  }
  return out
}

const get = async (url: string) => { const r = await fetch(viaProxy(url)); if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`); return r.text() }

const SEREBII = 'https://www.serebii.net/tcgpocket'
// "Vee Vee! Eevee Event" (Game8) = "Vee Vee Eevee Missions" (Serebii); "Dual Fusion Limited Battle Event" = "Dual Fusion Limited Battles".
const key = (s: string) => s.toLowerCase().replace(/pok[eé]mon/g, 'pokemon').replace(/\b(event|events|missions?|campaign|battles?)\b/g, '').replace(/[^a-z0-9]/g, '')

/** Lista de eventos de Serebii: nombre → página del evento. */
export function serebiiPocketList(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of html.matchAll(/<td class="fooinfo"><a href="(events\/[a-z0-9-]+\.shtml)"><u>([^<]+)<\/u><\/a><\/td>/g)) out.set(key(m[2].replace(/&amp;/g, '&')), `${SEREBII}/${m[1]}`)
  return out
}

/** Recompensas de un evento de Serebii (tablas "Task / Pic / Reward / Quantity"), sumadas por objeto y con su icono. */
export function serebiiPocketRewards(html: string): GameEvent['items'] {
  const sum = new Map<string, { name: string; icon: string; amount: number }>()
  for (const m of html.matchAll(/<td class="cen"><img src="(\/tcgpocket\/items\/[^"]+)"[^>]*><\/td>\s*<td class="fooinfo">([^<]+)<\/td>\s*<td class="fooinfo">([\d,]+)<\/td>/g)) {
    const name = m[2].replace(/&amp;/g, '&').trim()
    const prev = sum.get(name.toLowerCase())
    sum.set(name.toLowerCase(), { name, icon: `https://www.serebii.net${m[1]}`, amount: (prev?.amount ?? 0) + Number(m[3].replace(/,/g, '')) })
  }
  // Primero lo que sirve para abrir sobres (Pack Hourglass, Pack Stamina…), luego el resto.
  return [...sum.values()].sort((a, b) => Number(/pack|hourglass|ticket/i.test(b.name)) - Number(/pack|hourglass|ticket/i.test(a.name))).slice(0, 10)
}

/** Recompensas de Serebii para los eventos vigentes de Game8 (como mucho 6 páginas, caché de 6 h). */
async function withSerebiiRewards(events: GameEvent[]): Promise<void> {
  const list = await get(`${SEREBII}/events.shtml`).then(serebiiPocketList).catch(() => new Map<string, string>())
  let pages = 0
  for (const e of events) {
    const k = key(e.title)
    const url = list.get(k) ?? [...list.entries()].find(([n]) => n && (n.includes(k) || k.includes(n)))?.[1]
    if (!url || pages >= 6) continue
    pages++
    const items = await get(url).then(serebiiPocketRewards).catch(() => [] as GameEvent['items'])
    if (!items.length) continue
    e.items = items
    // 12 Pack Hourglass = 1 sobre; cada sobre regalado ("Promo Pack C Series Vol. 1", "Deluxe Pack Mega Booster") = 1.
    e.pulls = Math.floor(items.filter(i => /^pack hourglass$/i.test(i.name)).reduce((n, i) => n + i.amount, 0) / 12)
      + items.filter(i => /booster$|^promo pack\b/i.test(i.name)).reduce((n, i) => n + i.amount, 0)
  }
}

export async function syncPocket(gameId: string): Promise<GameSync> {
  const [top, g8] = await Promise.allSettled([get(G8_TOP), get(G8)])
  if (top.status === 'rejected' && g8.status === 'rejected') throw top.reason
  const events: GameEvent[] = []
  const list = (top.status === 'fulfilled' ? game8Expansions(top.value) : []).sort((a, b) => a.release - b.release)
  const now = Date.now()
  list.forEach((x, i) => {
    const after = list[i + 1]
    const end = after ? after.release : x.release + 45 * DAY
    if (end < now - DAY || x.release > now + 60 * DAY) return
    events.push({
      id: `${gameId}:banner:g8:${x.code}`, gameId, kind: 'banner', title: `${x.name} (${x.code})`, image: x.logo,
      start: new Date(x.release).toISOString(), end: new Date(end).toISOString(), items: [], featured: [], pulls: 0, source: 'api',
      open: after ? undefined : true, precision: x.exact ? undefined : 'approx',
      // "Special Pack" (SP1…) y las "Deluxe" (B4b…) salen entre dos grandes: secundarias.
      minor: /^SP|^[A-Z]\d+b$/.test(x.code) ? true : undefined,
    })
  })
  if (top.status === 'rejected') console.warn('[ptcgp] game8 (portada):', (top.reason as Error)?.message)
  if (g8.status === 'fulfilled') {
    const evs = game8PocketEvents(gameId, g8.value)
    await withSerebiiRewards(evs.filter(e => !e.minor || Date.parse(e.start) > now - 30 * DAY))
    events.push(...evs)
  } else console.warn('[ptcgp] game8 (eventos):', (g8.reason as Error)?.message)
  return { events, patches: [], codes: [] }
}
