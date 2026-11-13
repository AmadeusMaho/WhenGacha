import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'
import { syncPocketGamerCodes } from './codes'
import { htmlText, parseNotices, type Message } from './discord'

/**
 * Sword of Convallaria (XD; servidor global, horas UTC-4). Fuentes revisadas el 13 nov 2026:
 *  - Avisos oficiales: la web soc.xd.com pide su lista de noticias a poster-api.starforce.tw (`/api/v1.0/form/articles/list`, bloque
 *    "ssrpg-website-news") y cada aviso a website.xdcdn.net (`/form/website/news/<id>/en.json`). Los de mantenimiento (uno al mes) traen
 *    cada evento con su hora exacta: "2. [Wildfire Within] Limited-time Summon Event is now available / Event period: / 12:00, Oct 23, 2026 -
 *    23:59, Nov 5, 2026 (UTC-4)". Los parches pequeños entre medias (p. ej. el de SP Agata, 11 nov) no tienen aviso en la web.
 *  - GameWith (gamewith.net/sword-of-convallaria; robots.txt sin restricciones), actualizado a diario:
 *    - "List of Available Banners" (68920): tabla "Current Banners" ("SP Agata Rate-Up | Until November 19th, 11:59 PM (UTC -4)") y la lista
 *      de todos los personajes con su icono (`/article_tools/sword-of-convallaria/gacha/c143.png`), que da el retrato de los destacados.
 *    - "List of All Available Events" (68934): "List of Ongoing Events", un `<h3>` por evento con "Event Period | Until November 20, 2026" y
 *      un párrafo de descripción.
 *    GameWith solo da la fecha de FIN. El inicio sale del aviso oficial si lo hay (mismo nombre, o banner que acaba a la misma hora); si no, se
 *    estima (14 días antes del fin, sin pasar de hoy) y se marca como estimado.
 *  - Recompensas: SIN fuente con cifras (ni avisos ni GameWith las detallan). Tiradas: 150 Hope Luxite / Secret Fate (pulls.ts).
 *  - Códigos: PocketGamer (`syncPocketGamerCodes`). Steam (app 2526380) dejó de publicar avisos en 2025.
 * 1 lista + hasta 2 avisos oficiales y 2 páginas de GameWith por ciclo (caché de 6 h), más 1 de PocketGamer.
 */
const GW = 'https://gamewith.net/sword-of-convallaria'
const NEWS = 'https://poster-api.starforce.tw/api/v1.0/form/articles/list'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const TZ = -4
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const text = (el: Element | null | undefined) => el?.textContent?.replace(/[\s ]+/g, ' ').trim() ?? ''

async function page(id: number): Promise<Document> {
  const res = await fetch(viaProxy(`${GW}/${id}`))
  if (!res.ok) throw new Error(`gamewith SoC ${id} → HTTP ${res.status}`)
  return new DOMParser().parseFromString(await res.text(), 'text/html')
}

/** "Until November 19th, 11:59 PM (UTC -4)", "Until November 20, 2026" → fin en ms (año: el más cercano a hoy). Sin hora, 23:59:59. */
export function socUntil(s: string, now = Date.now()): number | null {
  const m = /Until\s+([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?(?:,?\s*(\d{1,2}):(\d{2})\s*([AP]M)?)?/i.exec(s)
  const mo = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1
  if (!m || mo < 0) return null
  let h = m[4] ? +m[4] : 23
  if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0)
  const at = (y: number) => Date.UTC(y, mo, +m[2], h - TZ, m[5] ? +m[5] : 59, 59)
  if (m[3]) return at(+m[3])
  const y = new Date(now).getUTCFullYear()
  return [y - 1, y, y + 1].map(at).reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a))
}

/** Inicio estimado para lo que solo tiene fin: 14 días antes, sin pasar de hoy (a las 00:00 del servidor). */
const guessStart = (end: number, now: number) => {
  const t = Math.min(end - 14 * DAY, now)
  const d = new Date(t + TZ * HOUR)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TZ * HOUR
}

/** Icono de cada personaje (la lista de la cabecera de las páginas de GameWith): nombre → URL. */
function characterIcons(doc: Document): Map<string, string> {
  const out = new Map<string, string>()
  for (const td of doc.querySelectorAll('td')) {
    const img = td.querySelector('img')
    const src = img?.getAttribute('data-original') || img?.getAttribute('src') || ''
    const name = text(td)
    if (/\/sword-of-convallaria\/gacha\/c\d+\.png$/.test(src) && name && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), src)
  }
  return out
}

/** Iconos de personaje de la última lectura de la página de banners (para los banners que solo trae un aviso). */
let lastIcons = new Map<string, string>()

async function gwBanners(gameId: string, now: number): Promise<GameEvent[]> {
  const doc = await page(68920)
  const icons = characterIcons(doc)
  lastIcons = icons
  const head = [...doc.querySelectorAll('h3')].find(h => /current banners/i.test(text(h)))
  let table: Element | null = null
  for (let n = head?.nextElementSibling; n && !/^H[23]$/.test(n.tagName); n = n.nextElementSibling) if (n.tagName === 'TABLE' || n.querySelector('table')) { table = n.tagName === 'TABLE' ? n : n.querySelector('table'); break }
  if (!table) throw new Error('gamewith SoC: no se encontró la tabla de banners')
  const out: GameEvent[] = []
  for (const tr of table.querySelectorAll('tr')) {
    const cells = [...tr.children].filter(c => c.tagName === 'TD')
    if (cells.length < 2) continue
    const name = text(cells[0]), end = socUntil(text(cells[1]), now)
    if (!name || !end || end < now - 3 * DAY) continue
    const gear = /gear|astral imprint|weapon/i.test(name)
    const who = gear ? '' : name.replace(/\s*(?:Rate[- ]?Up|Rerun|Debut|Chance Up|Banner|Summon)\b.*$/i, '').trim()
    const icon = icons.get(who.toLowerCase())
    const img = cells[0].querySelector('img')
    out.push({
      id: `${gameId}:banner:gw:${name}:${new Date(end).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title: name,
      description: gear ? '⟦d.weaponBanner⟧' : /rerun/i.test(name) ? '⟦d.socRerun⟧' : '⟦d.charBanner⟧',
      image: img?.getAttribute('data-original') || img?.getAttribute('src') || undefined,
      start: new Date(guessStart(end, now)).toISOString(), end: new Date(end).toISOString(), items: [],
      featured: who ? [{ name: who, rarity: 5, icon, tag: /rerun/i.test(name) ? 'Rerun' : undefined }] : [], pulls: 0, source: 'api', precision: 'estimated',
    })
  }
  return out
}

/**
 * Próximo personaje ("List of Upcoming and New Characters", 70901: el primer `<h3>` de "Upcoming Characters", p. ej. "Arman?"). GameWith no da
 * fecha; los banners nuevos salen cada 2 semanas ("a new character banner is introduced to the Global server every other Friday"), así que se
 * pone a continuación del banner de personaje en curso, 14 días, como estimado. Retrato: el de la tabla de personajes no publicados.
 */
async function gwUpcoming(gameId: string, after: GameEvent | undefined): Promise<GameEvent[]> {
  if (!after) return []
  const doc = await page(70901)
  const head = [...doc.querySelectorAll('h2')].find(h => /^upcoming characters$/i.test(text(h)))
  let name = ''
  for (let n = head?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) if (n.tagName === 'H3') { name = text(n).replace(/[?？]+$/, '').trim(); break }
  if (!name || /every|server|ahead|release/i.test(name)) return []
  // La primera celda puede ser `<th>`; la imagen va en carga diferida (la URL buena está en el `<noscript>`), así que se busca en el HTML de la celda.
  const cell = [...doc.querySelectorAll('tr > th, tr > td')].find(c => text(c).toLowerCase() === name.toLowerCase())
  const icon = /https:\/\/img\.gamewith\.net\/[^'"\s]+\.(?:png|jpe?g|webp)/.exec(cell?.innerHTML ?? '')?.[0]
  const start = Date.parse(after.end) + 1000
  return [{
    id: `${gameId}:banner:gw:upcoming:${name}`, gameId, kind: 'banner', title: name, description: '⟦d.socUpcoming⟧', image: icon,
    start: new Date(start).toISOString(), end: new Date(start + 14 * DAY - 1000).toISOString(), items: [],
    featured: [{ name, rarity: 5, icon }], pulls: 0, source: 'api', precision: 'estimated',
  }]
}

async function gwEvents(gameId: string, now: number): Promise<GameEvent[]> {
  const doc = await page(68934)
  const list = [...doc.querySelectorAll('h2')].find(h => /ongoing events/i.test(text(h)))
  const out: GameEvent[] = []
  for (let n = list?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
    if (n.tagName !== 'H3') continue
    const title = text(n)
    let end: number | null = null, description: string | undefined, image: string | undefined
    for (let s = n.nextElementSibling; s && !/^H[23]$/.test(s.tagName); s = s.nextElementSibling) {
      const t = text(s)
      end ??= /event period/i.test(t) ? socUntil(t, now) : null
      if (!description && s.tagName === 'P' && t.length > 40) description = t
      const src = (s.tagName === 'IMG' ? s : s.querySelector('img'))?.getAttribute('data-original') || undefined
      if (!image && src && !/\/gacha\/c\d+\.png$/.test(src)) image = src
    }
    if (!title || !end || end < now - 3 * DAY) continue
    out.push({
      id: `${gameId}:event:gw:${title}:${new Date(end).toISOString().slice(0, 10)}`, gameId, kind: /season/i.test(title) ? 'challenge' : 'event', title,
      description, image, start: new Date(guessStart(end, now)).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: [], pulls: 0, source: 'api', precision: 'estimated',
    })
  }
  if (!list) throw new Error('gamewith SoC: no se encontró la lista de eventos')
  return out
}

/** "12:00, Oct 23, 2026 - 23:59, Nov 5, 2026 (UTC-4)" → [inicio, fin]; null si es permanente o no se entiende. */
export function socPeriod(s: string): [number, number] | null {
  const zone = /\(UTC\s*([+-]\d{1,2})\)/i.exec(s)
  if (!zone || /permanent/i.test(s)) return null
  const at = [...s.matchAll(/(\d{1,2}):(\d{2}),\s*([A-Za-z]{3,})\.?\s+(\d{1,2}),\s*(\d{4})/g)]
    .map(m => Date.UTC(+m[5], MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()), +m[4], +m[1] - +zone[1], +m[2]))
  return at.length >= 2 && at.every(t => !isNaN(t)) ? [at[0], at[1] + 59_000] : null
}

/** Eventos de los avisos de mantenimiento oficiales (últimos 40 días). */
export async function syncSocOfficial(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${NEWS}?block_code=ssrpg-website-news&language=en&page=1&page_size=6`))
  if (!res.ok) throw new Error(`starforce SoC → HTTP ${res.status}`)
  const list = ((await res.json())?.data?.list ?? []) as { article_id: string; title: string; category: string; content_url: string; time: string }[]
  const recent = list.filter(a => a.category === 'update' && Date.now() - Date.parse(a.time) < 40 * DAY && /^https:\/\/website\.xdcdn\.net\//.test(a.content_url)).slice(0, 2)
  const events: GameEvent[] = []
  for (const a of recent) {
    const j = await fetch(viaProxy(a.content_url)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    const lines = htmlText(j?.content ?? '').split('\n').map(l => l.trim()).filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      const head = /^\d+\.\s*\[([^\]]+)\]\s*(.*)$/.exec(lines[i])
      if (!head) continue
      // La línea con la hora en UTC-4 (la siguiente es la misma en hora del Pacífico).
      const line = lines.slice(i + 1, i + 4).find(l => /\(UTC\s*-4\)/i.test(l)) ?? ''
      const r = socPeriod(line)
      if (!r || r[1] < Date.now() - 3 * DAY) continue
      const summon = /summon event/i.test(head[2])
      const title = head[1].trim()
      events.push({
        id: `${gameId}:${summon ? 'banner' : 'event'}:xd:${title}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind: summon ? 'banner' : 'event', title,
        description: head[2].replace(/\s*is now available\.?$/i, '').trim() || undefined,
        start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items: [], featured: [], pulls: 0,
        minor: /skin event/i.test(head[2]) ? true : undefined, source: 'api', official: true,
      })
    }
  }
  if (!list.length) throw new Error('starforce SoC: sin avisos')
  return { events, patches: [], codes: [] }
}

/**
 * Tuits oficiales de @SwordofConva publicados ANTES de conectar el canal de Discord "soc" (13 nov 2026), copiados del canal por el dueño:
 * dan el inicio exacto de lo que ya estaba en curso (GameWith solo da el fin). Se leen con el mismo lector que Discord y cada uno deja de
 * contar solo cuando su evento termina. Lo nuevo llega por el canal; no hace falta añadir más aquí.
 */
const TWEETS: { at: string; text: string }[] = [
  { at: '2026-10-29T12:00:00Z', text: `Upcoming Limited-Time Summon Event: Get Together\n\nFor a limited time, the probability of summoning "Selina" and "Taair" will be significantly increased!\n\n⏰ Event Duration\n12:00, Oct 30, 2026 - 23:59, Nov 12, 2026 (UTC-4)` },
  { at: '2026-10-29T12:00:00Z', text: `Dear Voyager,\n\nThe "Voyage of Discovery" event is back!\n\n⏰ Event Period\n12:00, Oct 30, 2026 – 23:59, Nov 20, 2026 (UTC-4)` },
  { at: '2026-11-05T12:00:00Z', text: `🌟 Upcoming Limited-Time "Debut" Summon Event: Polaris of Winter\n\nFor a limited time, the probability of summoning new character "Agata - Polaris of Winter" will be significantly increased!\n\n⏰ Event Duration\n12:00, Nov 6, 2026 – 23:59, Nov 19, 2026 (UTC-4)` },
  { at: '2026-11-05T12:00:00Z', text: `RERUN｜🐺 Upcoming Limited-Time "Debut" Summon Event: Silver wolf Queen\n\nFor a limited time, the probability of summoning character "Agata" will be significantly increased!\n\n⏰ Event Duration\n12:00, Nov 6, 2026 – 23:59, Nov 19, 2026 (UTC-4)` },
  { at: '2026-11-05T12:00:00Z', text: `Dear Voyager,\n\nAgata - Polaris of Winter's Live Skin "After the Midnight Snow" event will be available!\n\n⏰ Event Period\n12:00, Nov 6, 2026 – 23:59, Dec 3, 2026 (UTC-4)\n\n📜 Event Details\n● During the event, you can spend Wish Coupons to draw rewards.` },
  { at: '2026-11-12T12:00:00Z', text: `Dear Voyager,\n\nA new event, The Frontier Line, will be available soon for a limited time!\n\n⏰ Event Period\n12:00, Nov 13, 2026 – 23:59, Dec 3, 2026 (UTC-4)\n\n📜 Event Details\n● Frontier Line centers on exploring regions, capturing Resource Zones, gathering resources.` },
  { at: '2026-11-12T12:00:00Z', text: `Upcoming Limited-Time Summon Event: Get Together\n\nFor a limited time, the probability of summoning "Lukamar" and "Pooch Runrun" will be significantly increased!\n\n⏰ Event Duration\n12:00, Nov 13, 2026 - 23:59, Nov 26, 2026 (UTC-4)` },
]
const socTweets = (gameId: string) => parseNotices(gameId, TWEETS.map((t, i): Message => ({ id: `tw${i}`, timestamp: t.at, content: t.text })))
  .events.filter(e => Date.parse(e.end) > Date.now() - 3 * DAY)

/** Mismo personaje en un aviso y en GameWith: "Agata - Polaris of Winter" (variante, en los tuits) = "SP Agata" (GameWith); "Agata" = "Agata". */
const who = (n: string, tweet: boolean) => {
  const sp = tweet ? /\s[-–]\s/.test(n) : /^sp\s/i.test(n)
  return `${sp ? 'sp:' : ''}${n.replace(/^sp\s+/i, '').split(/\s[-–]\s/)[0].trim().toLowerCase()}`
}

/**
 * GameWith + avisos oficiales. Los banners del aviso no dicen a quién traen y los de GameWith no dicen cuándo empiezan: si un banner oficial
 * acaba a la misma hora (±1 h) que uno de GameWith, el de GameWith toma su inicio y se quita el oficial (si varios acaban igual, el primero
 * con nombre parecido o, si no, el primero sin usar). Eventos: mismo nombre → la hora oficial manda.
 */
export async function syncSoc(gameId: string): Promise<GameSync> {
  const now = Date.now()
  const [b, e, o, c] = await Promise.allSettled([gwBanners(gameId, now), gwEvents(gameId, now), syncSocOfficial(gameId), syncPocketGamerCodes('sword-of-convallaria')])
  for (const [what, r] of [['banners', b], ['eventos', e], ['avisos', o], ['códigos', c]] as const)
    if (r.status === 'rejected') console.warn(`[soc] ${what}:`, (r.reason as Error)?.message)
  if (b.status === 'rejected' && e.status === 'rejected' && o.status === 'rejected') throw b.reason
  const official = [...(o.status === 'fulfilled' ? o.value.events : []), ...socTweets(gameId)]
  const used = new Set<GameEvent>()
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const fix = (g: GameEvent): GameEvent => {
    const same = official.filter(x => !used.has(x) && x.kind === g.kind && Math.abs(Date.parse(x.end) - Date.parse(g.end)) <= HOUR)
    // Banners: por el personaje destacado (el aviso llama al banner "Polaris of Winter"; GameWith, "SP Agata Rate-Up"). Si ninguno de los
    // dos trae personaje (banners de equipo), el primero que acabe a la misma hora y tampoco lo traiga.
    const g0 = g.featured[0]?.name
    const hit = same.find(x => key(x.title) === key(g.title) || key(g.title).includes(key(x.title)) || key(x.title).includes(key(g.title)))
      ?? (g.kind !== 'banner' ? undefined
        : g0 ? same.find(x => x.featured.some(f => who(f.name, true) === who(g0, false)))
        : same.find(x => !x.featured.length))
    if (!hit) return g
    used.add(hit)
    return { ...g, start: hit.start, end: hit.end, precision: undefined, official: true, description: g.description ?? hit.description }
  }
  const gw = [...(b.status === 'fulfilled' ? b.value : []), ...(e.status === 'fulfilled' ? e.value : [])].map(fix)
  // El próximo, tras el banner de personaje nuevo en curso (no la reposición ni el de equipo).
  const current = gw.filter(x => x.kind === 'banner' && x.featured.length && !/rerun/i.test(x.title)).sort((x, y) => Date.parse(y.end) - Date.parse(x.end))[0]
  const next = await gwUpcoming(gameId, current).catch(err => { console.warn('[soc] próximos:', (err as Error)?.message); return [] as GameEvent[] })
  // Si ya está en los banners en curso (GameWith actualizó la lista), no se repite.
  const fresh = next.filter(n => !gw.some(g => g.featured.some(f => f.name.toLowerCase() === n.title.toLowerCase())))
  // Banners que solo trae un aviso ("Get Together" de Lukamar y Pooch Runrun): retrato de la lista de personajes de GameWith.
  const withFaces = (x: GameEvent) => (x.kind === 'banner' && x.featured.some(f => !f.icon)
    ? { ...x, featured: x.featured.map(f => (f.icon ? f : { ...f, icon: lastIcons.get(f.name.toLowerCase()) ?? lastIcons.get(f.name.toLowerCase().replace(/s+/g, '')) })) } : x)
  return { events: [...gw, ...official.filter(x => !used.has(x)).map(withFaces), ...fresh], patches: [], codes: c.status === 'fulfilled' ? c.value : [] }
}
