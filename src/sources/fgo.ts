import { viaProxy } from '../net'
import type { Featured, GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * Fate/Grand Order (servidor NA) desde la API abierta de Atlas Academy (datos extraídos del propio juego).
 * Las horas son instantes exactos (epoch), sin suposiciones: los eventos del servidor NA cambian a las
 * 21:00 PDT / 20:00 PST, y eso ya viene en el dato.
 */
const BASE = 'https://api.atlasacademy.io/export/NA'
const DAY = 86_400_000

interface RawEvent { id: number; type: string; name: string; startedAt: number; endedAt: number }
interface RawGacha { id: number; name: string; type: string; openedAt: number; closedAt: number; featuredSvtIds?: number[]; imageId?: number }

/** Arte del banner de invocación (mismo CDN de Atlas Academy; comprobado el 9 nov 2026 con los banners vigentes). */
const summonArt = (imageId?: number) => imageId ? `https://static.atlasacademy.io/NA/SummonBanners/img_summon_${imageId}.png` : undefined
/** Máximo de fichas de evento que se piden por ciclo (solo para su arte). */
const MAX_EVENT_ART = 6

/**
 * Ficha de un evento (`/nice/<NA|JP>/event/<id>`): su arte (`banner`; las campañas y quests sueltas no tienen), sus guerras (las quests del evento)
 * y su tienda.
 */
interface EventShop { name: string; setNum: number; limitNum: number; payType?: string; targetIds?: number[]; cost?: { item?: { name?: string; icon?: string }; amount?: number } }
interface EventInfo { banner?: string; warIds?: number[]; shop?: EventShop[] }
async function eventInfo(region: 'NA' | 'JP', id: number): Promise<EventInfo | undefined> {
  const res = await fetch(viaProxy(`https://api.atlasacademy.io/nice/${region}/event/${id}`))
  return res.ok ? (await res.json()) as EventInfo : undefined
}
const artOf = (info?: EventInfo) => (typeof info?.banner === 'string' && info.banner.startsWith('https://static.atlasacademy.io/') ? info.banner : undefined)

/**
 * Recompensas de un evento (18 nov 2026), de los datos del propio juego en Atlas Academy:
 *  - Las de primera vez de cada quest de su guerra (`/nice/<región>/war/<id>`, `spots[].quests[].gifts`): ahí van los Saint Quartz, los Summon
 *    Ticket y las frutas de AP del evento (Mystery House Crafters: 20 SQ y 3 tickets = 9,7 tiradas), y el servant de regalo (`eventSvtJoin`).
 *  - De la tienda, lo que sí cuenta (Crystallized Lore, tickets, frutas…) con su límite; y los canjes de "un ★5 a elegir" (100 Million Downloads:
 *    un ticket para uno de 43 servants), como el propio ticket.
 * Solo los objetos de `GIFTS` (los ids son los mismos en NA y en JP, así que valen para lo que viene de JP); el resto (materiales, QP, CE de la
 * tienda) no se lista. No incluye los bonus de inicio de sesión ni las misiones maestras: Atlas no los da por evento.
 */
const ITEM_ICON = (n: number) => `https://static.atlasacademy.io/NA/Items/${n}.png`
const GIFTS: Record<number, { name: string; icon: string }> = {
  2: { name: 'Saint Quartz', icon: ITEM_ICON(6) },
  6: { name: 'Saint Quartz', icon: ITEM_ICON(6) },
  16: { name: 'Saint Quartz Fragment', icon: ITEM_ICON(16) },
  4001: { name: 'Summon Ticket', icon: ITEM_ICON(4001) },
  100: { name: 'Golden Fruit', icon: ITEM_ICON(100) },
  101: { name: 'Silver Fruit', icon: ITEM_ICON(101) },
  6999: { name: 'Crystallized Lore', icon: ITEM_ICON(6999) },
  7999: { name: 'Holy Grail', icon: ITEM_ICON(7999) },
  1000: { name: 'Lantern of Chaldea', icon: ITEM_ICON(1000) },
}
const MAX_REWARD_EVENTS = 6
interface WarGift { objectId: number; type: string; num: number }
async function eventRewards(region: 'NA' | 'JP', info: EventInfo, svt: Map<number, RawServant>): Promise<{ items: RewardItem[]; pulls: number }> {
  const sum = new Map<string, RewardItem>()
  const add = (name: string, icon: string | undefined, n: number) => { const x = sum.get(name); if (x) x.amount += n; else sum.set(name, { name, amount: n, icon }) }
  for (const war of (info.warIds ?? []).slice(0, 2)) {
    const res = await fetch(viaProxy(`https://api.atlasacademy.io/nice/${region}/war/${war}`))
    if (!res.ok) continue
    const w = (await res.json()) as { spots?: { quests?: { gifts?: WarGift[] }[] }[] }
    for (const g of (w.spots ?? []).flatMap(sp => sp.quests ?? []).flatMap(q => q.gifts ?? [])) {
      const known = g.type === 'item' ? GIFTS[g.objectId] : undefined
      if (known) add(known.name, known.icon, g.num)
      else if (g.type === 'eventSvtJoin' || g.type === 'servant') {
        const sv = svt.get(g.objectId)
        if (sv) add(sv.name, sv.face, 1)
      }
    }
  }
  const shop = info.shop ?? []
  for (const it of shop) {
    const known = Object.values(GIFTS).find(k => k.name === it.name)
    if (known && it.limitNum > 0) add(known.name, known.icon, it.setNum * it.limitNum)
  }
  // Canje de "un servant a elegir": muchas filas de un servant cada una, todas por 1 del mismo objeto del evento.
  const pick = shop.filter(it => it.cost?.amount === 1 && it.limitNum === 1 && (it.targetIds ?? []).some(id => svt.has(id)))
  const ticket = pick[0]?.cost?.item
  if (pick.length >= 5 && ticket?.name && pick.every(it => it.cost?.item?.name === ticket.name)) add(ticket.name, ticket.icon, 1)
  const items = [...sum.values()]
  // Saint Quartz y Summon Ticket → tiradas con las reglas de FGO (3 SQ = 1); los fragmentos, 7 por SQ.
  const frag = sum.get('Saint Quartz Fragment')?.amount ?? 0
  const sq = (sum.get('Saint Quartz')?.amount ?? 0) + Math.floor(frag / 7)
  const { pulls } = pullsIn('fgo', [`Saint Quartz x${sq}`, `Summon Ticket x${sum.get('Summon Ticket')?.amount ?? 0}`])
  return { items, pulls }
}
interface RawServant { id: number; name: string; rarity?: number; face?: string; className?: string }

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(viaProxy(`${BASE}/${file}.json`))
  if (!res.ok) throw new Error(`atlasacademy ${file} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Los eventos "permanentes" tienen un fin ficticio en 2030. */
const LIMIT = Date.UTC(2029, 0, 1) / 1000

/** Campañas de bonificación (AP, EXP, vínculo…): se ocultan por defecto. */
const CAMPAIGN = /campaign$/i

const clean = (s: string) => s.replace(/\[[0-9A-Fa-f]{6}\]|\[-\]/g, '').replace(/\s+/g, ' ').trim()
const iso = (s: number) => new Date(s * 1000).toISOString()

export async function syncFgo(gameId: string): Promise<GameSync> {
  const [evs, gachas, servants] = await Promise.all([
    getJson<RawEvent[]>('basic_event'),
    getJson<RawGacha[]>('nice_gacha'),
    getJson<RawServant[]>('basic_servant').catch(() => [] as RawServant[]),
  ])
  const from = Date.now() / 1000 - 3 * DAY / 1000, to = Date.now() / 1000 + 120 * DAY / 1000
  const inWindow = (s: number, e: number) => e > s && e < LIMIT && e > from && s < to
  const svt = new Map(servants.map(s => [s.id, s]))

  const seen = new Set<string>()
  const events: GameEvent[] = []
  for (const r of evs) {
    if (!inWindow(r.startedAt, r.endedAt)) continue
    const title = clean(r.name)
    if (!title) continue
    const key = `${title}|${r.startedAt}|${r.endedAt}`
    if (seen.has(key)) continue // el juego repite la misma campaña con varios ids
    seen.add(key)
    const campaign = CAMPAIGN.test(r.type)
    events.push({
      id: `${gameId}:event:${r.id}`, gameId, kind: 'event', title,
      start: iso(r.startedAt), end: iso(r.endedAt), items: [], featured: [], pulls: 0, source: 'api',
      minor: campaign || /^recollection quest$/i.test(title) ? true : undefined,
    })
  }

  for (const g of gachas) {
    if (g.type !== 'stone' || !g.featuredSvtIds?.length || !inWindow(g.openedAt, g.closedAt)) continue
    const featured: Featured[] = g.featuredSvtIds.slice(0, 3).map(id => {
      const s = svt.get(id)
      return { name: s?.name ?? `#${id}`, icon: s?.face, rarity: s?.rarity, tag: s?.className }
    })
    const named = featured.every(f => !f.name.startsWith('#'))
    events.push({
      id: `${gameId}:banner:${g.id}`, gameId, kind: 'banner',
      title: named ? featured.map(f => f.name).join(' / ') : clean(g.name),
      description: clean(g.name),
      image: summonArt(g.imageId),
      start: iso(g.openedAt), end: iso(g.closedAt), items: [], featured, pulls: 0, source: 'api',
    })
  }

  // Arte de los eventos principales (no las campañas), en serie y con tope; las campañas que nombran un evento entre comillas
  // ("\"Mystery House Crafters\" Related Servant Bond…") usan el arte de ese evento.
  const main = events.filter(e => e.kind === 'event' && !e.minor).slice(0, MAX_EVENT_ART)
  const infos = new Map<string, EventInfo | undefined>()
  for (const e of main) {
    const info = await eventInfo('NA', +e.id.split(':').pop()!).catch(() => undefined)
    infos.set(e.id, info)
    e.image = artOf(info)
  }
  for (const e of events) {
    if (e.kind !== 'event' || e.image) continue
    const quoted = /"([^"]{4,})"/.exec(e.title)?.[1]
    const parent = quoted && events.find(p => p.image && p.kind === 'event' && p.title.includes(quoted))
    if (parent) e.image = parent.image
  }
  const future = await fromJp(gameId, evs, svt).catch(err => { console.warn('[fgo] JP:', (err as Error)?.message ?? err); return [] as GameEvent[] })

  // Recompensas: primero los de NA con guerra propia, luego lo que viene de JP (los mismos ids de objeto), hasta MAX_REWARD_EVENTS por ciclo.
  const jpSvt = future.length
    ? await fetch(viaProxy('https://api.atlasacademy.io/export/JP/basic_servant_lang_en.json')).then(r => (r.ok ? (r.json() as Promise<RawServant[]>) : [])).catch(() => [] as RawServant[])
    : []
  const allSvt = new Map([...jpSvt.map(s => [s.id, s] as const), ...svt])
  let budget = MAX_REWARD_EVENTS
  for (const e of main) {
    const info = infos.get(e.id)
    if (!info?.warIds?.length && !info?.shop?.length) continue
    if (budget-- <= 0) break
    Object.assign(e, await eventRewards('NA', info, svt).catch(() => ({ items: [], pulls: 0 })))
  }
  for (const e of future.filter(f => f.kind === 'event' && !f.minor).sort((a, b) => a.start.localeCompare(b.start))) {
    if (budget-- <= 0) break
    const info = await eventInfo('JP', +e.id.split(':').pop()!).catch(() => undefined)
    if (!info) continue
    // JP: los nombres de su tienda van en japonés; solo cuentan las guerras (ids de objeto) y el canje por ticket se omite.
    const r = await eventRewards('JP', { warIds: info.warIds }, allSvt).catch(() => ({ items: [], pulls: 0 }))
    e.items = r.items
    e.pulls = r.pulls
  }
  return { events: [...events, ...future], patches: [], codes: [] }
}

/**
 * Lo que viene a NA según el servidor JP (pedido del dueño, 12 nov 2026). NA repite el calendario de JP con unos dos años de retraso, y el retraso
 * se mide con lo que ya salió en los dos (729 días con Mystery House Crafters: JP 6 nov 2024 → NA 5 nov 2026):
 *  - Eventos: `export/JP/basic_event_lang_en.json` de Atlas Academy (nombres en inglés de su traducción). Los ids son los mismos en JP y NA, así que
 *    lo que ya está en NA no se repite y el retraso sale de los eventos comunes. Los que no tienen nombre en inglés se omiten.
 *  - Banners: la "Summon Banner List" de GamePress (grandorder.gamepress.gg; su robots.txt solo cierra /admin/), que trae cada banner con nombre en
 *    inglés, servants, imagen y fechas de JP y de NA (vacías si aún no llegó). El retraso, de los que tienen las dos.
 * Todo sale marcado como estimado y con su explicación; las reediciones ("Revival") no cuentan para medir el retraso (NA las mueve).
 * grandorder.wiki, la otra referencia que se citaba ("Upcoming Summoning Campaigns (for EN reference)"), ya no existe (dominio en venta).
 * 2 consultas más por ciclo (caché de 12 h en el proxy).
 */
const JP_TEXT = /[぀-ヿ一-鿿]/
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN }

interface GpBanner {
  id: string; name: string; jp_start_date?: string | null; jp_end_date?: string | null; na_start_date?: string | null; na_end_date?: string | null
  icon?: { url?: string } | null; servant_profile_future_banner?: { banner_servant?: { name?: string } | null }[] | null
}

/** La lista de banners va como JSON dentro de la página ("summonEventList":[…]). */
export function gamepressBanners(html: string): GpBanner[] {
  const i = html.indexOf('"summonEventList":')
  if (i < 0) return []
  const j = html.indexOf('[', i)
  let depth = 0, k = j, inStr = false
  for (; k < html.length; k++) {
    const c = html[k]
    if (inStr) { if (c === '\\') k++; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) break
  }
  try { return JSON.parse(html.slice(j, k + 1)) as GpBanner[] } catch { return [] }
}

/**
 * Nombres de GamePress que no coinciden con los de Atlas (NA): sus nombres sin spoiler (不夜城のアサシン = Wu Zetian, 不夜城のキャスター = Scheherazade)
 * y "Demon King Nobunaga (Oda Nobunaga)", que en Atlas es "Oda Nobunaga" a secas, igual que la Archer: se fija por id (la Avenger).
 */
const GP_ALIAS: Record<string, number> = {
  'assassin of the nightless city': 602700,
  'caster of the nightless city': 503000,
  'archer of shinjuku': 202300, // James Moriarty
  'avenger of shinjuku': 1100500, // Hessian Lobo  'demon king nobunaga (oda nobunaga)': 1100700,
  'demon king nobunaga': 1100700,
}
/** Clave de nombre: minúsculas, sin tildes ni guiones ("Edmond Dantès" = "Edmond Dantes", "Ono-no-Komachi" = "Ono no Komachi"). */
const svtKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
export function servantByGpName(name: string, byName: Map<string, RawServant>, svt: Map<number, RawServant>, all: RawServant[] = []): RawServant | undefined {
  const k = svtKey(name)
  const alias = GP_ALIAS[k]
  if (alias && svt.has(alias)) return svt.get(alias)
  const exact = byName.get(k)
  if (exact) return exact
  const m = /^(.+?)\s*\(([^)]+)\)$/.exec(k)
  if (!m) return undefined
  // "Medusa (Saber)", "Li Shuwen (Assassin)": Atlas los llama "Medusa" / "Li Shuwen" y los distingue por la clase.
  const byClass = all.find(s => svtKey(s.name) === m[1] && s.className?.toLowerCase() === m[2].replace(/\s/g, ''))
  // "Otro nombre (Nombre de NA)": el de dentro del paréntesis.
  return byClass ?? byName.get(m[2])
}

async function fromJp(gameId: string, naEvents: RawEvent[], svt: Map<number, RawServant>): Promise<GameEvent[]> {
  const now = Date.now(), to = now + 120 * DAY
  const [jpRes, gpRes] = await Promise.allSettled([
    fetch(viaProxy('https://api.atlasacademy.io/export/JP/basic_event_lang_en.json')).then(r => { if (!r.ok) throw new Error(`atlas JP → HTTP ${r.status}`); return r.json() as Promise<RawEvent[]> }),
    fetch(viaProxy('https://grandorder.gamepress.gg/summon-banner-list')).then(r => { if (!r.ok) throw new Error(`gamepress → HTTP ${r.status}`); return r.text() }),
  ])
  const list = gpRes.status === 'fulfilled' ? gamepressBanners(gpRes.value) : []
  const jp = jpRes.status === 'fulfilled' ? jpRes.value : []
  const na = new Map(naEvents.map(e => [e.id, e]))
  /** Día (00:00 UTC) de una fecha "AAAA-MM-DD" de GamePress, o del instante `s` (segundos) en hora de Japón. */
  const day = (d?: string | null) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? Date.parse(`${d}T00:00:00Z`) : NaN)
  const jstDay = (s: number) => { const d = new Date(s * 1000 + 9 * 3_600_000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }
  const pstDay = (s: number) => { const d = new Date(s * 1000 - 8 * 3_600_000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }

  // Retraso en días, de lo más reciente que ya salió en los dos (banners de GamePress y eventos de Atlas; sin reediciones ni lo simultáneo).
  const pairs = [
    ...list.filter(b => !/^revival/i.test(b.name) && !isNaN(day(b.jp_start_date)) && !isNaN(day(b.na_start_date)))
      .map(b => ({ at: day(b.na_start_date), lag: day(b.na_start_date) - day(b.jp_start_date) })),
    ...jp.filter(e => e.type === 'eventQuest' && na.has(e.id) && !/revival|rerun|recollection/i.test(e.name))
      .map(e => ({ at: pstDay(na.get(e.id)!.startedAt), lag: pstDay(na.get(e.id)!.startedAt) - jstDay(e.startedAt) })),
  ].filter(p => p.lag > 300 * DAY).sort((a, b) => b.at - a.at)
    // Solo lo del último mes: NA cambia de ritmo a saltos (699 días hasta septiembre de 2026, 729 desde Mystery House Crafters). Con los 5 últimos
    // a secas, si GamePress no respondía quedaban campañas de julio y septiembre y lo que viene de JP salía un mes antes (18 nov 2026).
    .filter((p, _, all) => all[0].at - p.at <= 30 * DAY).slice(0, 5)
  const lag = median(pairs.map(p => p.lag))
  if (isNaN(lag)) return []
  const days = Math.round(lag / DAY)
  // Lo ya alcanzado por NA: el último día de JP que tiene pareja (lo anterior que no llegó, no llegará).
  const reached = Math.max(...pairs.map(p => p.at - p.lag))
  // NA cambia a las 20:00 (Pacífico) = 04:00 UTC del día siguiente, y cierra a las 03:59 UTC (Atlas Academy, todos sus eventos y banners de 2026).
  const open = (jpDay: number) => jpDay + lag + DAY + 4 * 3_600_000
  const close = (jpDay: number) => jpDay + lag + DAY + 4 * 3_600_000 - 60_000
  const out: GameEvent[] = []

  for (const e of jp) {
    if (e.type !== 'eventQuest' || na.has(e.id) || jstDay(e.startedAt) <= reached) continue
    const s = open(jstDay(e.startedAt)), en = close(jstDay(e.endedAt))
    const title = clean(e.name)
    // Sin permanentes ni Recollection Quest (NA publica las suyas cada mes, con otros ids). Los que solo tienen nombre japonés también salen
    // (pedido del dueño, 12 nov 2026): con el nombre de JP y, si GamePress tiene un banner que empezó el mismo día en JP, su nombre en inglés de pista.
    if (!title || /^recollection quest$/i.test(title) || en < now || s > to || en - s > 60 * DAY || en <= s) continue
    const jpOnly = JP_TEXT.test(title)
    // Las campañas de ataque ("期間限定で…攻撃威力…アップ") no tienen banner propio: sin pista. Tampoco valen de pista los Lucky Bag ni los Weekly.
    const boost = /攻撃威力|アップ！?$/.test(title)
    const hint = jpOnly && !boost ? list.find(b => day(b.jp_start_date) === jstDay(e.startedAt) && !/lucky bag|weekly/i.test(b.name))?.name.replace(/^\[JP\]\s*/, '').trim() : undefined
    out.push({
      id: `${gameId}:event:jp:${e.id}`, gameId, kind: 'event', title,
      description: [`⟦d.fgoJp|${days}⟧`, jpOnly ? `⟦d.fgoJpName⟧` : '', hint ? `⟦d.fgoJpHint|${hint}⟧` : ''].filter(Boolean).join(' '),
      // Los de nombre japonés suelen ser campañas y misiones sueltas: se ocultan como las demás campañas si no hay pista de un banner.
      minor: jpOnly && (!hint || boost) ? true : undefined,
      start: new Date(s).toISOString(), end: new Date(en).toISOString(), items: [], featured: [], pulls: 0, source: 'api', precision: 'estimated',
    })
  }

  // Servants de JP (nombre en inglés) para los que aún no están en NA; los de NA mandan si existen en los dos.
  const jpSvt = await fetch(viaProxy('https://api.atlasacademy.io/export/JP/basic_servant_lang_en.json'))
    .then(r => (r.ok ? (r.json() as Promise<RawServant[]>) : [])).catch(() => [] as RawServant[])
  const byName = new Map([...jpSvt, ...svt.values()].map(s => [svtKey(s.name), s]))
  for (const b of list) {
    const js = day(b.jp_start_date), je = day(b.jp_end_date)
    // Ya en NA, sin fecha, anterior a lo alcanzado o de pago (Lucky Bag).
    if (b.na_start_date || isNaN(js) || js <= reached || /lucky bag/i.test(b.name)) continue
    const s = open(js), en = close(isNaN(je) ? js + 14 * DAY : je)
    if (en < now || s > to || en <= s) continue
    const names = (b.servant_profile_future_banner ?? []).map(x => x?.banner_servant?.name?.trim()).filter((n): n is string => !!n)
    const featured: Featured[] = [...new Set(names)].slice(0, 3).map(name => { const sv = servantByGpName(name, byName, svt, [...svt.values(), ...jpSvt]); return { name, icon: sv?.face, rarity: sv?.rarity, tag: sv?.className } })
    const title = b.name.replace(/^\[JP\]\s*/, '').trim()
    out.push({
      id: `${gameId}:banner:gp:${b.id}`, gameId, kind: 'banner', title: featured.length ? featured.map(f => f.name).join(' / ') : title,
      description: `${title} · ⟦d.fgoJp|${days}⟧`,
      image: b.icon?.url ? encodeURI(b.icon.url) : undefined, start: new Date(s).toISOString(), end: new Date(en).toISOString(),
      items: [], featured, pulls: 0, source: 'api', precision: 'estimated',
    })
  }
  return out
}
