import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'
import { htmlText } from './discord'
import { pullsIn } from './pulls'

/**
 * Pokémon Masters EX (DeNA; un solo servidor mundial; reinicio diario a las 06:00 UTC). Fuentes revisadas el 27 nov 2026:
 *  - Avisos oficiales (pokemonmasters-game.com/en-US/announcements): 10 por página (`?cursor=` para la siguiente). Cada aviso lleva su tipo
 *    (Event, New = scout, Update, Notice), su imagen y "Date/Time November 24, 2026 at 10:00 p.m. - December 24, 2026 at 9:59 p.m." en hora del
 *    Pacífico (PT: PST en invierno, PDT en verano). El aviso suelto (solo los vigentes) da los destacados del scout ("5★ Sygna Suit Lear &
 *    Gholdengo") y las recompensas ("Gems ×1,000").
 *  - Serebii (serebii.net/pokemonmasters): la lista de eventos (imagen y "November 28th - December 31st 2026 06:00 UTC") y la de scouts
 *    ("Calem EX Master Fair", "November 30th 2026 - December 31st 2026"), que adelantan lo que el juego ya anuncia dentro antes que la web. Cada
 *    scout de Serebii da sus pares con retrato y probabilidad: los destacados son los de probabilidad más alta. Lo que solo trae Serebii toma la hora
 *    del juego: empieza a las 06:00 UTC (Serebii lo dice: "06:00 UTC") y acaba a las 05:59 UTC del último día, como todos los avisos oficiales
 *    ("10:00 p.m. – 9:59 p.m. (PT)", los 20 revisados el 27 nov 2026).
 *  - Sin códigos de canje: el juego no los tiene.
 * 2 páginas de avisos + hasta 6 avisos sueltos + 2 listas de Serebii + hasta 6 scouts por ciclo (caché de 3–6 h).
 */
const OFFICIAL = 'https://pokemonmasters-game.com'
const SEREBII = 'https://www.serebii.net/pokemonmasters'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Desfase de la hora del Pacífico ese día: PDT (UTC-7) del 2.º domingo de marzo al 1.er domingo de noviembre, PST (UTC-8) el resto. */
function ptOffset(y: number, m: number, d: number): number {
  const sunday = (month: number, nth: number) => { const first = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + 7 * (nth - 1) }
  const t = Date.UTC(y, m, d)
  return t >= Date.UTC(y, 2, sunday(2, 2)) && t < Date.UTC(y, 10, sunday(10, 1)) ? -7 : -8
}

/** "November 24, 2026 at 10:00 p.m." (PT) → ms. */
export function ptTime(s: string): number | null {
  const m = /([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i.exec(s.replace(/&nbsp;| /g, ' '))
  if (!m) return null
  const mo = MONTHS.indexOf(m[1].toLowerCase())
  if (mo < 0) return null
  const h = (+m[4] % 12) + (/p/i.test(m[6]) ? 12 : 0)
  return Date.UTC(+m[3], mo, +m[2], h, +m[5]) - ptOffset(+m[3], mo, +m[2]) * HOUR
}

/** "November 28th - December 31st 2026" / "November 25th 2026 - November 26th 2026" (Serebii, días en UTC) → [inicio 06:00, fin 05:59]. */
export function serebiiRange(s: string): [number, number] | null {
  const parts = s.replace(/\s+/g, ' ').split(/\s+-\s+/)
  if (parts.length < 2) return null
  const re = /([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/
  const a = re.exec(parts[0]), b = re.exec(parts[1])
  if (!a || !b || !b[3]) return null
  const ma = MONTHS.indexOf(a[1].toLowerCase()), mb = MONTHS.indexOf(b[1].toLowerCase())
  if (ma < 0 || mb < 0) return null
  const yb = +b[3]
  // Serebii a veces pone mal el año del inicio ("October 30th 2026 - November 13th 2025"): manda el del fin, y el inicio es el anterior a él.
  let ya = a[3] ? +a[3] : yb
  // y "November 21st 2025 - December 5th 2026" (21 nov 2026): ningún evento dura más de unos meses.
  if (ya > yb || Date.UTC(ya, ma, +a[2]) > Date.UTC(yb, mb, +b[2]) || Date.UTC(ya, ma, +a[2]) < Date.UTC(yb, mb, +b[2]) - 200 * DAY) ya = ma > mb ? yb - 1 : yb
  return [Date.UTC(ya, ma, +a[2], 6), Date.UTC(yb, mb, +b[2], 5, 59)]
}

interface Item { href: string; kind: string; title: string; image?: string; start: number; end: number }

/** Lista de avisos oficiales: tipo, título, imagen y "Date/Time" (solo los que lo traen). */
export function pmexList(html: string): { items: Item[]; cursor?: string } {
  const items: Item[] = []
  for (const m of html.matchAll(/<li class="announcements-item">([\s\S]*?)<\/a><\/li>/g)) {
    const b = m[1]
    const href = /href="([^"]+)"/.exec(b)?.[1]
    const kind = /c-tag[^>]*>([^<]+)</.exec(b)?.[1]?.trim() ?? ''
    const inner = b.slice(b.indexOf('>', b.indexOf('announcements-item-inner')) + 1)
    const text = htmlText(inner.replace(/<div class="(?:x+-)?small[^"]*">/g, '\n')).split('\n').map(l => l.trim()).filter(Boolean)
    const dt = text.findIndex(l => /^Date\/Time$/i.test(l))
    if (!href || dt < 0) continue
    const [s, e] = (text[dt + 1] ?? '').split(/\s+-\s+(?=[A-Z])/)
    const start = s && ptTime(s), end = e && ptTime(e)
    if (!start || !end) continue
    const title = text.slice(0, dt).join(' ').replace(/^(?:\S+\s+)?\d{1,2},\s*\d{4}.*?\(PT\)\s*/, '').replace(/\s+/g, ' ').trim()
    items.push({ href, kind, title, image: /<img[^>]*src="([^"]+)"[^>]*class="banner"/.exec(b)?.[1], start, end })
  }
  return { items, cursor: /[?&]cursor=([a-z0-9]{8,32})/.exec(html)?.[1] }
}

/** Destacados de un aviso de scout: "5★ Sygna Suit Lear & Gholdengo" (pares 5★ del primer párrafo). */
export function pmexFeatured(text: string): Featured[] {
  // La primera línea con "5★ Nombre & Pokémon" (la de los Variety Scout dice "5★ Sync Pairs have a 100% chance…": no es un destacado).
  const first = text.split('\n').find(l => /5★\s*[A-Z][^&]{1,40}&/.test(l)) ?? ''
  const out: Featured[] = []
  for (const m of first.matchAll(/5★\s*(.+?)(?=,?\s*(?:and\s+)?5★|\s+(?:Return|Arrive|Are|Is|Join|Debut)s?\b|!|$)/g)) {
    const name = m[1].replace(/,\s*$/, '').trim()
    if (name && name.includes('&') && !out.some(f => f.name === name)) out.push({ name, rarity: 5, full: name.split(/\s*&\s*/)[0] })
  }
  return out
}

const abs = (u: string, base: string) => (/^https?:/.test(u) ? u : new URL(u, base).toString())

/** Pares de un scout de Serebii con su retrato; destacados = los de probabilidad más alta. */
export function serebiiScout(page: string, url: string): Featured[] {
  const rows: { name: string; icon: string; rate: number }[] = []
  // Solo la tabla de los 5★ (la de los 4★/3★, con probabilidades más altas, va debajo con su propia cabecera "4 Star - %").
  const a = page.search(/<td colspan="3" class="fooevo">5 Star/), b = a >= 0 ? page.indexOf('<td colspan="3" class="fooevo">', a + 10) : -1
  const html = a >= 0 ? page.slice(a, b > a ? b : undefined) : page
  // <img src="../syncpairs/icons/paxton.png" alt="Paxton"> … <td class="fooinfo"><a …><u>Paxton</u></a></td><td class="cen">2%</td>
  for (const m of html.matchAll(/<img[^>]*src="([^"]*syncpairs\/icons\/[^"]+)"[^>]*>[\s\S]{0,300}?<td class="fooinfo">[\s\S]*?<u>([^<]{2,60})<\/u>[\s\S]{0,40}?<td class="cen">([\d.]+)%/g)) {
    rows.push({ icon: abs(m[1], url), name: m[2].replace(/&amp;/g, '&').trim(), rate: +m[3] })
  }
  const top = Math.max(0, ...rows.map(r => r.rate))
  return rows.filter(r => r.rate === top && top > 0).slice(0, 6).map(r => ({ name: r.name, icon: r.icon, rarity: 5 }))
}

// Serebii añade el mes ("Eevee Tales November 2026") y el aviso oficial un prefijo de campaña ("Eevee Day Celebration! Eevee Tales").
const norm = (s: string) => s.toLowerCase().replace(/\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/, '')
  .replace(/pok[eé]mon/g, 'pokemon').replace(/[^a-z0-9]/g, '')
const get = async (url: string) => { const r = await fetch(viaProxy(url)); if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`); return r.text() }

export async function syncPmex(gameId: string): Promise<GameSync> {
  const now = Date.now()
  const events: GameEvent[] = []
  // 1) Avisos oficiales (2 páginas).
  const official: Item[] = []
  let ok = false
  try {
    const p1 = pmexList(await get(`${OFFICIAL}/en-US/announcements`))
    ok = true
    official.push(...p1.items)
    if (p1.cursor) official.push(...pmexList(await get(`${OFFICIAL}/en-US/announcements?cursor=${p1.cursor}`)).items)
  } catch (err) { console.warn('[pmex] avisos:', (err as Error).message) }
  let details = 0
  for (const it of official.filter(i => i.end > now - DAY)) {
    // Los scouts son los avisos "BSearch_…" (etiqueta "New"); "Voted Attraction Event Academy Fair…" es un evento.
    const kind = /\/BSearch_/.test(it.href) ? 'banner' : 'event'
    let featured: Featured[] = [], items = [] as GameEvent['items'], pulls = 0
    // El aviso suelto (destacados del scout, recompensas del evento): solo los vigentes o próximos, como mucho 6.
    if (details < 6 && /^\/en-US\/announcements\/(Event|BSearch|Campaign)_/.test(it.href)) {
      details++
      const t = await get(`${OFFICIAL}${it.href}`).then(h => htmlText(h.slice(h.indexOf('content-wrap')))).catch(() => '')
      if (kind === 'banner') featured = pmexFeatured(t)
      // "Gems ×1,000", "Eevee Celebration Ticket ×1": palabras en mayúscula justo antes del ×.
      else ({ items, pulls } = pullsIn('pmex', t.split('\n').flatMap(l => l.match(/\b[A-Z][\w'’.-]*(?: [A-Z][\w'’.-]*){0,4}\s*×\s*[\d,]+/g) ?? []).map(x => x.replace(/\s*×\s*/, ' x'))))
    }
    events.push({
      id: `${gameId}:${kind}:${it.href.split('/').pop()}`, gameId, kind, title: it.title, image: it.image,
      start: new Date(it.start).toISOString(), end: new Date(it.end + 59_000).toISOString(),
      items, featured, pulls, source: 'api', official: true,
    })
  }
  // 2) Serebii: lo que la web aún no publica (los próximos), y retratos para los scouts oficiales.
  const known = (title: string, start: number) => events.find(e => Math.abs(Date.parse(e.start) - start) < 2 * DAY && (norm(e.title).includes(norm(title)) || norm(title).includes(norm(e.title))))
  try {
    const ev = await get(`${SEREBII}/events.shtml`)
    for (const m of ev.matchAll(/<tr><td class="fooinfo"><a href="([^"]+)"><img src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<\/td><td class="fooinfo">[\s\S]*?<\/td><td class="fooinfo">([^<]+)<\/td>/g)) {
      const r = serebiiRange(m[4].replace(/\s*\d{2}:\d{2}\s*UTC/i, ''))
      if (!r || r[1] < now - DAY || r[0] > now + 30 * DAY) continue
      const title = m[3].replace(/&amp;/g, '&').trim()
      const o = known(title, r[0])
      if (o) { o.image = o.image ?? abs(m[2], `${SEREBII}/`); continue }
      events.push({ id: `${gameId}:event:serebii:${m[1].split('/').pop()?.replace('.shtml', '')}`, gameId, kind: 'event', title, image: abs(m[2], `${SEREBII}/`),
        start: new Date(r[0]).toISOString(), end: new Date(r[1] + 59_000).toISOString(), items: [], featured: [], pulls: 0, source: 'api' })
    }
    const sc = await get(`${SEREBII}/syncpairscout.shtml`)
    let pages = 0
    for (const m of sc.matchAll(/<td class="fooinfo"><a href="(scout\/[^"]+)"><u>([^<]+)<\/u><\/a><\/td>\s*<td class="fooinfo"><a[^>]*>([^<]+)<\/a>/g)) {
      const r = serebiiRange(m[3])
      if (!r || r[1] < now || r[0] > now + 30 * DAY) continue
      const title = m[2].replace(/&amp;/g, '&').trim()
      const o = known(title, r[0])
      // Monthly / Poké Fair: los permanentes de cada mes no son un banner a seguir.
      if (!o && /monthly|pok[eé] fair scout$/i.test(title)) continue
      if ((!o || o.featured.every(f => !f.icon)) && pages < 6) {
        pages++
        const url = `${SEREBII}/${m[1]}`
        const pairs = await get(url).then(h => serebiiScout(h, url)).catch(() => [] as Featured[])
        if (o) {
          // Retrato de Serebii para los destacados del aviso oficial (mismo entrenador).
          o.featured = o.featured.length ? o.featured.map(f => ({ ...f, icon: f.icon ?? pairs.find(p => norm(f.name).includes(norm(p.name)))?.icon })) : pairs
        } else {
          events.push({ id: `${gameId}:banner:serebii:${m[1].replace(/^scout\/|\.shtml$/g, '')}`, gameId, kind: 'banner', title,
            start: new Date(r[0]).toISOString(), end: new Date(r[1] + 59_000).toISOString(), items: [], featured: pairs, pulls: 0, source: 'api', image: pairs[0]?.icon })
        }
      }
    }
    ok = true
  } catch (err) { console.warn('[pmex] serebii:', (err as Error).message) }
  if (!ok) throw new Error('pmex: sin fuentes')
  // "Dendra EX Fair", "Calem EX Master Fair": el destacado es el del título cuando ni el aviso ni Serebii lo dieron; su retrato, el de Serebii
  // (syncpairs/icons/<nombre>.png, el mismo archivo que enlaza cada scout).
  for (const e of events) {
    const m = e.kind === 'banner' && !e.featured.length ? /^(.+?)\s+EX\s+(?:Master\s+)?Fair/i.exec(e.title) : null
    if (m) e.featured = [{ name: m[1], rarity: 5, icon: `${SEREBII}/syncpairs/icons/${m[1].toLowerCase().replace(/[^a-z0-9]/g, '')}.png` }]
    // Pares del aviso sin retrato en el scout de Serebii ("Lucas & Flareon": Serebii lo guarda con el nombre del traje): el icono del entrenador.
    e.featured = e.featured.map(f => {
      const trainer = /^([A-Z][a-z]+)\s*&/.exec(f.name)?.[1]
      return f.icon || !trainer ? f : { ...f, icon: `${SEREBII}/syncpairs/icons/${trainer.toLowerCase()}.png` }
    })
    // Los scouts que solo trae Serebii no tienen imagen propia (su página no la lleva): el retrato del destacado.
    if (!e.image && e.featured[0]?.icon) e.image = e.featured[0].icon
  }
  return { events, patches: [], codes: [] }
}
