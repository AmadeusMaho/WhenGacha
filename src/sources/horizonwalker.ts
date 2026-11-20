import { viaProxy } from '../net'
import type { Featured, GameEvent, Patch, PromoCode, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { postLines, type SteamPost } from './aniimo'

/**
 * Horizon Walker (Gentlemaniac; Corea desde 2024, global en Steam, Google Play, App Store y Erolabs desde el 25 ago 2025). Juego para adultos: en la
 * app solo van el arte de cada evento, el del Vanguard nuevo y los retratos de carta; NUNCA las imágenes de trajes ni de los "Affection Events" que
 * traen los mismos avisos (regla del dueño, 19 nov 2026). Un solo servidor con el horario de Corea (KST, UTC+9); sin selector de servidor.
 * Fuentes (revisadas el 19 nov 2026):
 *  - **Notas de parche oficiales en Steam** (app 3279780, «《Horizon Walker》l Patch Note», cada dos jueves; mantenimiento 09:00–12:00 KST):
 *    cada apartado «◆ …» con su periodo exacto: «ㆍEvent Period: Nov 19, 2026 (Thu) after maintenance ~ Dec 3, 2026 (Thu) before maintenance»,
 *    «* Period: … ~ Dec 17, 2026 (Thu) 10:00 KST». "After maintenance" = 12:00 KST del día; "before maintenance" = 09:00 KST.
 *    - Eventos («◆ Event: Larina's Dopamine Channel!»; las "Part 1/2" de un mismo evento se unen), login de 7 días («A new 7-Day Login Event,
 *      [X], begins.») y eventos de crecimiento del Vanguard nuevo (bingo).
 *    - Banners: «◆ Special Search Schedule» («2 Special Searches begin: Caller of the Ancestors, Dorothea / Wail of the Vengeful Dead.»,
 *      «1 Rerun Search begins: …» + «* Period: …»). "Título, Nombre" = Vanguard; sin coma, un arma o el título de un Vanguard ya conocido
 *      («Intelligence Division's Wildcard» = Yui, sacado de «[Intelligence Division's Wildcard, Yui Pass]» de otras notas).
 *  - **gacha.gg** (robots.txt "Allow: /"): `/horizon-walker/events` (tienda de canje de cada evento, con icono y límite por evento: son sus
 *    recompensas), `/characters` (retrato de carta de cada Vanguard) y `/weapons` (icono de cada arma). Sus fechas van atrasadas: solo se usan
 *    para recompensas e iconos; las fechas son las de Steam.
 *  - **Códigos**: ucngame.com («Horizon Walker Codes», tabla con «Valid until November 30th, 2026»; se quitan los caducados). PocketGamer y
 *    lootandwaifus no tienen página; gacha.gg no lista ninguno.
 *  - **Lo próximo**: los avisos no anuncian lo siguiente con nombre (la hoja de ruta de sep–nov va en una imagen). Se deja la siguiente
 *    actualización estimada (cada 14 días, jueves) como versión estimada, sin inventar banners.
 *  - Rotatorios: los modos (Special Operation, Recovery Operations, Arena) no publican temporadas con fecha.
 * 1 consulta a Steam y 3 páginas de gacha.gg (caché de 12 h) y 1 de ucngame por ciclo.
 */
export const HW_STEAM_APP = 3279780
const STEAM = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${HW_STEAM_APP}&count=20&maxlength=0&format=json`
const GG = 'https://www.gacha.gg'
const CODES = 'https://ucngame.com/codes/horizon-walker-codes/'
const CLAN_IMG = 'https://clan.akamai.steamstatic.com/images'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const KST = 9
/** Fin del mantenimiento de los jueves (12:00 KST) y su inicio (09:00 KST). */
const AFTER = 12
const BEFORE = 9
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Iconos fijos (gacha.gg, lista de objetos) de lo que más sale; el resto, de las tiendas de evento de gacha.gg. Extercium no tiene imagen publicada. */
const GGI = `${GG}/img/horizon-walker/dm/items`
export const HW_ICONS = new Map<string, string>([
  ['fairynet special search ticket', `${GGI}/itemicon_rerollticket_rerollticketpickup.webp`],
  ['fairynet multi-search ticket', `${GGI}/itemicon_rerollticket_rerollticket.webp`],
  ['fairynet special search piece', `${GGI}/itemicon_none_rerollticketpickuppiece.webp`],
  ['fairynet multi-search piece', `${GGI}/itemicon_none_rerollticketpiece.webp`],
  ['ex rank contract ticket', `${GGI}/itemicon_instantcontract_instantcontract5.webp`],
  ['ex-rank contract ticket', `${GGI}/itemicon_instantcontract_instantcontract5.webp`],
  ['ss rank contract ticket', `${GGI}/itemicon_instantcontract_instantcontract4.webp`],
  ['ss-rank contract ticket', `${GGI}/itemicon_instantcontract_instantcontract4.webp`],
  ['soul shear', `${GGI}/itemicon_traitdelete_spiritscissors.webp`],
  ['soul stone', `${GGI}/itemicon_traittransfer_spiritstone.webp`],
  ['paint of alteration', `${GGI}/itemicon_others_etc_tarnishedpaint.webp`],
  ['brilliant gift box', `${GGI}/itemicon_favorabilitygorgeousbox.webp`],
])

const clean = (s: string) => s.replace(/[\s ]+/g, ' ').trim()
const iso = (t: number) => new Date(t).toISOString()
export const hwKey = (s: string) => s.toLowerCase().replace(/[‘’'"“”]/g, '').replace(/\s*[–—-]\s*part \d+\s*$/i, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Día KST («Nov 19, 2026», «November 5») → medianoche KST en ms (UTC). */
function dayOf(s: string, year: number): number | null {
  const m = /([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?/.exec(s)
  const mo = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1
  if (!m || mo < 0) return null
  return Date.UTC(m[3] ? +m[3] : year, mo, +m[2]) - KST * HOUR
}

/** Un extremo del periodo: «Nov 19, 2026 (Thu) after maintenance», «Dec 3, 2026 (Thu) before maintenance», «Dec 17, 2026 (Thu) 10:00 KST». */
function pointOf(s: string, year: number): number | null {
  const d = dayOf(s, year)
  if (d == null) return null
  const hm = /(\d{1,2}):(\d{2})/.exec(s.replace(/\(\w{3}\)/, ''))
  if (hm) return d + +hm[1] * HOUR + +hm[2] * 60_000
  if (/before maint/i.test(s)) return d + BEFORE * HOUR
  if (/after maint/i.test(s)) return d + AFTER * HOUR
  return d + AFTER * HOUR
}

export function periodOf(s: string, year: number): { start: number; end: number } | null {
  const [a, b] = s.split(/\s*~\s*/)
  if (!a || !b) return null
  const start = pointOf(a, year), end = pointOf(b, year)
  return start != null && end != null && end > start ? { start, end } : null
}

/** Líneas del aviso con cada imagen como línea propia («⟪IMG /45291709/abc.png⟫»): así se sabe qué imagen va tras cada rótulo. */
const IMG = /^⟪IMG (\S+)⟫$/
export function hwLines(bb: string): string[] {
  // Los rótulos en negrita llegan como "**◆ Event: …**": sin los asteriscos.
  return postLines(bb.replace(/\[img[^\]]*?src="\{STEAM_CLAN_IMAGE\}([^"]+)"[^\]]*\]\s*\[\/img\]/gi, '[/p][p]⟪IMG $1⟫[/p][p]'))
    // Dos negritas seguidas en el mismo párrafo («◆ Event: … – Part 2****ㆍEvent Period: …», 8 oct 2026): dos líneas.
    .flatMap(l => l.split(/\*{4,}/)).map(l => l.replace(/^\*\*\s*|\s*\*\*$/g, '').trim()).filter(Boolean)
}
const imgOf = (l: string | undefined) => { const m = IMG.exec(l ?? ''); return m ? `${CLAN_IMG}${m[1]}` : undefined }

export interface HwRaw { kind: 'event' | 'banner'; title: string; start: number; end: number; image?: string; description?: string; minor?: boolean
  /** Banner: nombres de la línea («Caller of the Ancestors, Dorothea»), uno por banner. */
  who?: string; rerun?: boolean }

/** Notas de un parche: eventos y banners con su periodo, imágenes de los Vanguards y armas nuevos, títulos "Título, Nombre" y fecha. */
export function hwPost(post: SteamPost): { raws: HwRaw[]; art: Map<string, string>; titles: Map<string, string>; update: number | null; headline?: string } {
  const lines = hwLines(post.contents)
  const year = new Date(post.date * 1000).getUTCFullYear()
  const raws: HwRaw[] = []
  const art = new Map<string, string>()
  const titles = new Map<string, string>()
  // «◈ November 19 Maintenance Patch Notes»: el día de la actualización (12:00 KST).
  const day = lines.map(l => /^◈\s*([A-Z][a-z]+ \d{1,2}) Maintenance/i.exec(l)?.[1]).find(Boolean)
  const d = day ? dayOf(day, year) : null
  const update = d != null ? d + AFTER * HOUR : null
  let headline: string | undefined
  // "Título, Nombre" en los pases y logins de cualquier aviso: «[Intelligence Division's Wildcard, Yui Pass]», «[The Ever-Reborn Phoenix, Garud]».
  // Los rótulos cortos llegan como 【…】 y los largos como […] (postLines solo convierte los de hasta 40 letras); también el del apartado
  // («◆ New Pass: Intelligence Division's Wildcard, Yui Pass»).
  for (const l of lines) {
    for (const m of l.matchAll(/[【[]([^】\],]{3,60}),\s*([A-Z][A-Za-z' -]{1,25}?)(?: Pass)?[】\]]/g)) titles.set(hwKey(m[1]), clean(m[2]))
    const p = /^◆\s*new pass:\s*([^,]{3,60}),\s*([A-Z][A-Za-z' -]{1,25}?) pass$/i.exec(l)
    if (p) titles.set(hwKey(p[1]), clean(p[2]))
  }

  let section = ''
  let sectionArt: string | undefined
  let pending: { who: string[]; rerun: boolean } | null = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const sec = /^◆\s*(.+)$/.exec(l)
    if (sec) {
      section = clean(sec[1].replace(/\*+/g, '').replace(/^:\s*/, ''))
      sectionArt = imgOf(lines[i + 1])
      pending = null
      // Arte de los Vanguards y armas nuevos (no de los trajes: esos van en "New Costumes" y no se usan).
      const nv = /^new (vanguard|weapon)\s*:\s*(.+)$/i.exec(section)
      if (nv && sectionArt) art.set(hwKey(nv[2]), sectionArt)
      continue
    }
    if (/special search/i.test(section)) {
      const b = /(\d+)\s+(special|rerun) search(?:es)? begins?\s*:\s*(.+?)\.?$/i.exec(l)
      if (b) { pending = { who: b[3].split(/\s+\/\s+/).map(clean).filter(Boolean), rerun: /rerun/i.test(b[2]) }; continue }
      const p = /^\*?\s*period\s*:\s*(.+)$/i.exec(l)
      if (p && pending) {
        const r = periodOf(p[1], year)
        if (r) for (const who of pending.who) raws.push({ kind: 'banner', title: who, who, ...r, rerun: pending.rerun })
        pending = null
      }
      continue
    }
    const pm = /^[ㆍ*·-]?\s*event period\s*:\s*(.+)$/i.exec(l)
    if (!pm || !section) continue
    const r = periodOf(pm[1], year)
    if (!r) continue
    const ev = /^event\s*:\s*(.+)$/i.exec(section)
    if (ev) {
      const title = clean(ev[1]).replace(/\s*[–—-]\s*part \d+\s*$/i, '')
      if (!headline) headline = title
      const body = lines.slice(i + 1, i + 14).filter(x => !IMG.test(x) && !/^◆/.test(x))
      const end = body.findIndex(x => /^◆/.test(x))
      raws.push({ kind: 'event', title, ...r, image: sectionArt, description: clean((end >= 0 ? body.slice(0, end) : body).join(' ')).slice(0, 320) || undefined })
      continue
    }
    // Login de 7 días: el nombre va en la línea anterior («A new 7-Day Login Event, [Caller of the Ancestors, Dorothea], begins.»).
    const login = lines.slice(Math.max(0, i - 3), i).map(x => /7-day login event,\s*【([^】]+)】/i.exec(x)?.[1]).find(Boolean)
    if (login) { raws.push({ kind: 'event', title: `7-Day Login: ${clean(login)}`, ...r, image: sectionArt, description: '⟦d.hwLogin⟧', minor: true }); continue }
    const growth = /^new vanguard growth support event\s*:\s*(.+)$/i.exec(section) ?? /^new vanguard:\s*(.+?) growth support event$/i.exec(section)
    if (growth) raws.push({ kind: 'event', title: `Growth Support: ${clean(growth[1])}`, ...r, description: '⟦d.hwGrowth⟧', minor: true })
  }
  return { raws, art, titles, update, headline }
}

/** gacha.gg: tienda de canje de cada evento («Night of Lies : Trick or Twin», «EX Rank Contract Ticket … 1 per event»), con icono. */
export function hwShops(doc: Document): { shops: Map<string, RewardItem[]>; icons: Map<string, string> } {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const src = (img: Element | null) => { const s = img?.getAttribute('src') ?? ''; const u = /url=([^&]+)/.exec(s)?.[1]; return u ? `${GG}${decodeURIComponent(u)}` : undefined }
  const shops = new Map<string, RewardItem[]>()
  const icons = new Map<string, string>()
  for (const sec of doc.querySelectorAll('section')) {
    const spans = sec.querySelector('div > span')?.children
    const name = text(spans?.[0])
    if (!name || !/shop open until|prices in/i.test(text(spans?.[1]))) continue
    const items: RewardItem[] = []
    for (const li of sec.querySelectorAll('li')) {
      const label = text(li.querySelector('span > span > span:last-child') ?? li.querySelector('span span'))
      // El límite va en su propio <span> («1 per event»); en el texto de todo el <li> se pega al precio («2001 per event»).
      const per = [...li.querySelectorAll('span')].map(s => /^(\d[\d,]*)\s*per event$/i.exec(text(s))?.[1]).filter(Boolean).pop()
      const m = /^(.+?)(?:\s*×\s*([\d,]+))?$/.exec(label)
      if (!m || !per) continue
      const icon = src(li.querySelector('img'))
      const n = clean(m[1])
      if (icon && !icons.has(n.toLowerCase())) icons.set(n.toLowerCase(), icon)
      const amount = Number((m[2] ?? '1').replace(/,/g, '')) * Number(per.replace(/,/g, ''))
      const prev = items.find(x => x.name === n)
      if (prev) prev.amount += amount
      else items.push({ name: n, amount, icon })
    }
    if (items.length && !shops.has(hwKey(name))) shops.set(hwKey(name), items)
  }
  return { shops, icons }
}

/** gacha.gg: retratos de carta (`/characters`, «Yui» → yui-card.webp) y armas (`/weapons`, el `<li>` con el nombre en color). */
export function hwPortraits(chars: Document | null, weapons: Document | null): { chars: Map<string, string>; weapons: Map<string, string> } {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const src = (img: Element) => { const u = /url=([^&]+)/.exec(img.getAttribute('src') ?? '')?.[1]; return u ? `${GG}${decodeURIComponent(u)}` : undefined }
  const c = new Map<string, string>()
  for (const img of chars?.querySelectorAll('img[src*="%2Fchars%2F"]') ?? []) {
    let el: Element | null = img.parentElement
    while (el && !text(el)) el = el.parentElement
    const url = src(img)
    const n = text(el)
    if (url && n && n.length < 40 && !c.has(hwKey(n))) c.set(hwKey(n), url)
  }
  const w = new Map<string, string>()
  for (const li of weapons?.querySelectorAll('li[id]') ?? []) {
    const img = li.querySelector('img[src*="%2Fweapons%2F"]')
    const n = text(li.querySelector('span[style*="color"]'))
    const url = img && src(img)
    if (url && n && !w.has(hwKey(n))) w.set(hwKey(n), url)
  }
  return { chars: c, weapons: w }
}

/** Códigos de ucngame: «26HAPPYHW | Redeem this gift code for FairyNet Multi-Search Ticket x3, … (Valid until November 30th, 2026)». */
export function hwCodes(doc: Document, now = Date.now()): PromoCode[] {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const out: PromoCode[] = []
  for (const tr of doc.querySelectorAll('table tbody tr')) {
    const tds = tr.querySelectorAll('td')
    const code = text(tds[0])
    const info = text(tds[1])
    if (!/^[A-Za-z0-9]{4,30}$/.test(code) || out.some(c => c.code.toUpperCase() === code.toUpperCase())) continue
    const until = /valid until ([A-Z][a-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})/i.exec(info)
    // Hasta el final de ese día en Corea.
    if (until && Date.parse(`${until[1]} ${until[2]}, ${until[3]} 23:59 GMT+0900`) < now) continue
    const list = /redeem this gift code for (.+?)(?:\s*\(|$)/i.exec(info)?.[1] ?? ''
    const rewards = /exclusive rewards/i.test(list) ? [] : list.split(/\s*,\s+/).map(r => r.replace(/\s+x\s?([\d,]+)$/i, ' ×$1')).filter(Boolean)
    out.push({ code, rewards: [...rewards.slice(0, 6), ...(until ? [`Until ${until[1]} ${until[2]}, ${until[3]}`] : [])] })
  }
  return out
}

/** Tiradas: 100 Extercium por Special Search (gacha.gg, "50 pulls cost 5,000 Extercium") y cada billete de Special Search es 1. */
export const hwPulls = (items: RewardItem[]) =>
  Math.round(items.reduce((n, i) => n + (/^fairynet special search tickets?$/i.test(i.name) ? i.amount : /^extercium$/i.test(i.name) ? i.amount / 100 : 0), 0) * 10) / 10

async function get(url: string): Promise<string> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.text()
}
const dom = (h: string) => new DOMParser().parseFromString(h, 'text/html')

export async function syncHorizonWalker(gameId: string, now = Date.now()): Promise<GameSync> {
  const [st, ev, ch, wp, cd] = await Promise.allSettled([get(STEAM), get(`${GG}/horizon-walker/events`), get(`${GG}/horizon-walker/characters`),
    get(`${GG}/horizon-walker/weapons`), get(CODES)])
  if (st.status === 'rejected') throw st.reason
  for (const [k, r] of [['gacha.gg eventos', ev], ['gacha.gg personajes', ch], ['gacha.gg armas', wp], ['códigos', cd]] as const)
    if (r.status === 'rejected') console.warn(`[horizonwalker] ${k}:`, (r.reason as Error)?.message)

  const posts = ((JSON.parse(st.value)?.appnews?.newsitems ?? []) as (SteamPost & { feedname: string })[])
    .filter(n => n.feedname === 'steam_community_announcements' && now - n.date * 1000 < 75 * DAY)
    .sort((a, b) => b.date - a.date)
  const { shops, icons } = ev.status === 'fulfilled' ? hwShops(dom(ev.value)) : { shops: new Map<string, RewardItem[]>(), icons: new Map<string, string>() }
  const pics = hwPortraits(ch.status === 'fulfilled' ? dom(ch.value) : null, wp.status === 'fulfilled' ? dom(wp.value) : null)

  const parsed = posts.map(p => ({ p, r: hwPost(p) }))
  const art = new Map<string, string>()
  const titles = new Map<string, string>()
  for (const { r } of parsed) {
    for (const [k, v] of r.art) if (!art.has(k)) art.set(k, v)
    for (const [k, v] of r.titles) if (!titles.has(k)) titles.set(k, v)
  }
  const iconOf = (n: string) => { const k = n.toLowerCase(); return icons.get(k) ?? HW_ICONS.get(k) ?? HW_ICONS.get(k.replace(/s$/, '')) }

  /** Destacado de un banner: Vanguard («Título, Nombre» o un título conocido) con su carta, o arma con su icono. */
  const featuredOf = (who: string): { title: string; f: Featured; weapon: boolean } => {
    const comma = /^(.+),\s*([^,]+)$/.exec(who)
    const name = comma ? clean(comma[2]) : titles.get(hwKey(who))
    if (name) return { title: name, weapon: false, f: { name, full: who, tag: 'EX', icon: pics.chars.get(hwKey(name)) ?? art.get(hwKey(name)) ?? art.get(hwKey(who)) } }
    const wIcon = pics.weapons.get(hwKey(who)) ?? art.get(hwKey(who))
    if (pics.weapons.has(hwKey(who)) || art.has(hwKey(who)) || !pics.chars.has(hwKey(who)))
      return { title: who, weapon: true, f: { name: who, tag: 'EX', icon: wIcon } }
    return { title: who, weapon: false, f: { name: who, tag: 'EX', icon: pics.chars.get(hwKey(who)) } }
  }

  const byKey = new Map<string, GameEvent>()
  const patches: Patch[] = []
  for (const { r } of parsed) {
    for (const x of r.raws) {
      const k = `${x.kind}:${hwKey(x.title)}:${iso(x.start).slice(0, 10)}`
      // Del aviso más reciente al más antiguo: manda el último (las "Part 2" repiten el periodo de la "Part 1").
      if (byKey.has(k)) continue
      if (x.kind === 'banner') {
        const { title, f, weapon } = featuredOf(x.who ?? x.title)
        byKey.set(k, { id: `${gameId}:banner:steam:${hwKey(title)}:${iso(x.start).slice(0, 10)}`, gameId, kind: 'banner', title, start: iso(x.start), end: iso(x.end),
          items: [], featured: [f], pulls: 0, source: 'api', official: true,
          description: `${weapon ? '⟦d.hwWeapon⟧' : '⟦d.hwSpecial⟧'}${x.rerun ? ' · Rerun' : ''}` })
        continue
      }
      const shop = shops.get(hwKey(x.title)) ?? [...shops].find(([n]) => n.length > 6 && (hwKey(x.title).includes(n) || n.includes(hwKey(x.title))))?.[1]
      const items = (shop ?? []).map(i => ({ ...i, icon: i.icon ?? iconOf(i.name) })).slice(0, 10)
      byKey.set(k, { id: `${gameId}:event:steam:${hwKey(x.title)}:${iso(x.start).slice(0, 10)}`, gameId, kind: 'event', title: x.title, start: iso(x.start), end: iso(x.end),
        image: x.image, description: shop ? [x.description, '⟦d.hwShop⟧'].filter(Boolean).join(' · ') : x.description,
        items, featured: [], pulls: hwPulls(items), source: 'api', official: true, ...(x.minor ? { minor: true } : {}) })
    }
    if (r.update != null && !patches.some(p => p.date === iso(r.update!)))
      patches.push({ id: `${gameId}:patch:${iso(r.update).slice(0, 10)}`, gameId, version: new Date(r.update + KST * HOUR).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        name: r.headline, date: iso(r.update), notes: '', source: 'api' })
  }
  const events = [...byKey.values()].filter(e => +new Date(e.end) > now - 3 * DAY)

  // Siguiente actualización estimada: las notas salen cada dos jueves.
  const list = patches.sort((a, b) => +new Date(a.date) - +new Date(b.date))
  const last = list[list.length - 1]
  if (last) {
    let t = +new Date(last.date) + 14 * DAY
    while (t < now) t += 14 * DAY
    list.push({ id: `${gameId}:patch:${iso(t).slice(0, 10)}`, gameId, version: new Date(t + KST * HOUR).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      date: iso(t), notes: '', source: 'api', estimated: true })
  }
  list.forEach((p, i) => { if (list[i + 1]) p.end = list[i + 1].date })

  const codes = cd.status === 'fulfilled' ? hwCodes(dom(cd.value), now) : []
  return { events, patches: list, codes }
}

/** Iconos de recompensas (ITEM_ICONS de index.ts): los fijos; las tiendas de gacha.gg ya ponen el suyo. */
export const HORIZONWALKER_ICONS = HW_ICONS
