import { viaProxy } from '../net'
import type { Featured, GameEvent, PromoCode, RewardItem } from '../types'
import type { GameSync } from './ennead'

/**
 * MAke Drama: MAD (Wemade Connect; Corea desde el 4 jun 2026, global desde el 8 oct 2026). Juego para adultos (+18): en la app solo se usan retratos
 * de cara, los rótulos de los eventos y el fondo de la portada de su web oficial (mad.wemadeconnect.com); NUNCA las capturas de Steam (explícitas).
 * Un solo servicio con el mismo horario en todas las regiones (la salida global amplió las regiones del servidor coreano, con el mismo calendario:
 * el evento "Bloody Mary Go Round" y el banner de Isabel empezaron el 8 oct en todas partes). Horas en KST; sin selector de servidor.
 * Fuentes (revisadas el 19 nov 2026):
 *  - **MAD Viewer** (mad.altterisk.cc, base de datos de fans hecha con los datos del juego; robots.txt "Allow: /"; código AGPL en
 *    github.com/anyabot/MAD-Viewer). Dos JSON: `/data/events.json` (eventos con inicio y fin exactos en KST, fin de las fases, cartel, Partners
 *    destacados, tienda de canje, caja de premios y asistencia, con nombre e icono de cada objeto en `refs`) y `/data/gacha_banners.json` (banners
 *    "Rate-Up Summon (Yomi)" con su periodo, precio —120 Seeds— y kilometraje —200—).
 *  - **Códigos**: lootandwaifus ("MAke Drama: MAD free codes", tabla "Working codes"; actualizada en nov 2026). game.guide y gacha.gg dicen que no
 *    hay ninguno activo y el aviso de lootandwaifus sobre "solo Corea" es de antes de la salida global: se toma su lista tal cual.
 *  - **Modos con temporada** (MAD Viewer, `/data/rewards.json` y `/data/archive.json`): Arena y Total War (Nemesis), una semana cada 28 días, e
 *    Infinity Archive, 28 días; con sus recompensas en Seeds. Los datos del juego ya traen las temporadas programadas (Arena hasta feb 2027):
 *    son lo próximo con fecha exacta (`madModes`).
 *  - **Lo próximo** de eventos y banners: SIN fuente. El juego no publica avisos en Steam desde el prerregistro (solo en su Naver Cafe y X, sin
 *    página legible; NamuWiki rechaza las lecturas automáticas y las notas de LanceDEX se cargan por JavaScript) y MAD Viewer solo trae el banner
 *    que ya está en el juego. Los banners duran 14 días y cambian los jueves; sin nombre anunciado no se inventa el siguiente.
 * Iconos: MAD Viewer sirve los del juego (`/icons/char/Icon_CH0003.webp`, `/icons/item/<icono>.webp`, `/icons/banner/<cartel>.webp`).
 * 4 JSON de MAD Viewer y 1 página de lootandwaifus por ciclo (caché de 6 h en el proxy).
 */
const MADV = 'https://mad.altterisk.cc'
const LOOT_CODES = 'https://lootandwaifus.com/guides/make-drama-mad-codes/'
/** Seeds por invocación (precio de los banners Rate-Up en gacha_banners.json; "A single pull costs 120 gems", gacha.gg). */
export const MAD_SEEDS_PER_PULL = 120

type Lang = Record<string, string>
interface Amount { ref: string; amount: number[] }
interface Ref { name: Lang; icon?: string }
interface MadEvent {
  id: number; kind: string; name: Lang; desc?: Lang; start: string; end: string; stagesEnd?: string; banner?: string; pickups?: string[]
  exchange?: { kind: string; products?: { rewards: Amount[]; limit?: number }[]; rounds?: { round: number; items: { rewards: Amount[]; count: number }[] }[];
    milestones?: { draws: number; rewards: Amount[] }[] }[]
  attendance?: { days: { day: number; rewards: Amount[] }[] }[]
}
interface MadBanner { id: number; kind: string; name: Lang; pickups: string[]; open?: { start: string; end: string }; price?: number; mileage?: number }

const iso = (s: string) => {
  const t = Date.parse(s)
  // "04:59:59" → 05:00:00: el cierre real.
  return new Date(new Date(t).getUTCSeconds() === 59 ? t + 1000 : t).toISOString()
}
const charIcon = (code: string) => `${MADV}/icons/char/Icon_${code}.webp`
const itemIcon = (icon?: string) => (icon ? `${MADV}/icons/item/${icon}.webp` : undefined)

/** Todo lo que da un evento: asistencia, tienda de canje (cada producto por su límite), caja de premios (primera ronda) y premios por tiradas. */
export function madItems(e: MadEvent, refs: Record<string, Ref>): RewardItem[] {
  const sum = new Map<string, number>()
  const add = (list: Amount[] | undefined, times = 1) => {
    for (const r of list ?? []) {
      // Las monedas del propio evento (goods:1011, "Scary Contract") no son recompensas: se gastan en su tienda.
      if (/^goods:(?:[1-9]\d{3})$/.test(r.ref) || /^deco:/.test(r.ref)) continue
      sum.set(r.ref, (sum.get(r.ref) ?? 0) + (r.amount[0] ?? 0) * times)
    }
  }
  for (const a of e.attendance ?? []) for (const d of a.days) add(d.rewards)
  for (const x of e.exchange ?? []) {
    for (const p of x.products ?? []) add(p.rewards, p.limit ?? 1)
    const first = x.rounds?.find(r => r.round === 1) ?? x.rounds?.[0]
    for (const it of first?.items ?? []) add(it.rewards, it.count)
    for (const m of x.milestones ?? []) add(m.rewards)
  }
  const items = [...sum].filter(([ref, n]) => n > 0 && refs[ref]).map(([ref, n]) => ({ name: refs[ref].name.en, amount: n, icon: itemIcon(refs[ref].icon) }))
  // Primero lo que vale tiradas (billetes Rate-Up, Seeds), después el resto.
  const rank = (n: string) => (/rate-up summon ticket/i.test(n) ? 0 : /^seeds?$/i.test(n) ? 1 : /summon ticket/i.test(n) ? 2 : 3)
  return items.sort((a, b) => rank(a.name) - rank(b.name)).slice(0, 10)
}

/** Tiradas: cada billete Rate-Up es 1; las Seeds, a 120 por tirada (los billetes normales son del banner permanente: no cuentan). */
export const madPulls = (items: RewardItem[]) =>
  Math.round(items.reduce((n, i) => n + (/rate-up summon ticket/i.test(i.name) ? i.amount : /^seeds?$/i.test(i.name) ? i.amount / MAD_SEEDS_PER_PULL : 0), 0) * 10) / 10

/** Nombre del Partner del título del banner: «Rate-Up Summon (Dan Xi (Halloween))» → «Dan Xi (Halloween)». */
const bannerName = (s: string) => /\((.+)\)\s*$/.exec(s)?.[1] ?? s
/** Código de Partner → nombre, de los banners Rate-Up («Rate-Up Summon (Yomi)», CH0003 → Yomi). */
const partnerNames = (ban: { banners: MadBanner[] }) =>
  new Map(ban.banners.filter(b => b.kind === 'pickup' && b.pickups.length === 1).map(b => [b.pickups[0], bannerName(b.name.en)] as [string, string]))

export function madEvents(gameId: string, ev: { events: MadEvent[]; refs: Record<string, Ref> }, ban: { banners: MadBanner[] }, now = Date.now()): GameEvent[] {
  const out: GameEvent[] = []
  const names = new Map<string, string>()
  for (const b of ban.banners) if (b.kind === 'pickup' && b.pickups.length === 1) names.set(b.pickups[0], bannerName(b.name.en))
  for (const e of ev.events) {
    const end = iso(e.end)
    if (+new Date(end) < now - 3 * 86_400_000) continue
    const items = madItems(e, ev.refs)
    const story = e.desc?.en?.replace(/\s+/g, ' ').trim()
    out.push({
      id: `${gameId}:event:madv:${e.id}`, gameId, kind: 'event', title: e.name.en, start: iso(e.start), end,
      image: e.banner ? `${MADV}/icons/banner/${e.banner}.webp` : undefined,
      description: [e.kind === 'luckyDraw' ? '⟦d.madLucky⟧' : e.stagesEnd ? '⟦d.madStages⟧' : '', story].filter(Boolean).join(' · ').slice(0, 320) || undefined,
      items, featured: (e.pickups ?? []).map(c => ({ name: names.get(c) ?? c, icon: charIcon(c), rarity: 3 })),
      pulls: madPulls(items), source: 'api', official: true,
    })
  }
  for (const b of ban.banners) {
    if (!b.open || !/^(pickup|selector)$/.test(b.kind)) continue
    const end = iso(b.open.end)
    if (+new Date(end) < now - 3 * 86_400_000) continue
    const featured: Featured[] = b.pickups.map(c => ({ name: names.get(c) ?? bannerName(b.name.en), icon: charIcon(c), rarity: 3 }))
    out.push({
      id: `${gameId}:banner:madv:${b.id}:${b.open.start.slice(0, 10)}`, gameId, kind: 'banner',
      title: b.kind === 'pickup' ? bannerName(b.name.en) : b.name.en, start: iso(b.open.start), end, items: [], featured, pulls: 0,
      description: b.kind === 'pickup' ? '⟦d.madPickup⟧' : '⟦d.madSelector⟧', source: 'api', official: true,
    })
  }
  return out
}

interface Window { start: string; end: string }
interface ArenaSeason { id: number; order: number; open: Window; stage?: { name: Lang } }
interface NemesisSeason { id: number; name: Lang; tile?: string; open: Window }
interface ArchiveSeason { id: number; open: Window; scores?: { score: number; rewards: Amount[] }[] }
export interface MadModes {
  arena?: { seasons: ArenaSeason[] }
  nemesis?: { seasons: NemesisSeason[] }
  archive?: { seasons: ArchiveSeason[] }
}

/** Seeds por temporada según el puesto (rewards.json de MAD Viewer, temporadas 6–9 de Arena y Total War de nov 2026). */
export const MAD_ARENA_SEEDS = { silver: 30, gold: 90, platinum: 180, master: 900, top500: 1100, top300: 1300, top100: 1500 }
export const MAD_NEMESIS_SEEDS = { bronze: 700, silver: 900, gold: 1100, platinum: 1300, master: 1500 }

/**
 * Modos con temporada (rewards.json y archive.json de MAD Viewer, con horas exactas y también las temporadas ya programadas, que son lo próximo):
 *  - Arena (Secret Arena): una semana cada 28 días; Seeds por ascender de rango y al cerrar (Master: 300 + 600).
 *  - Total War (Nemesis): una semana cada 28 días, alternando dos jefes ("Marisquerade", "Umbra Dei"); Seeds por puntuación (300) y por rango.
 *  - Infinity Archive: temporadas de 28 días; 1200 Seeds por puntuación (las cuatro primeras metas).
 * Arena y Total War dependen del puesto: en la calculadora son una elección (`choices`), así que aquí van sin tiradas para no contarlas dos veces.
 */
export function madModes(gameId: string, m: MadModes, now = Date.now()): GameEvent[] {
  const out: GameEvent[] = []
  const live = (w: Window) => +new Date(iso(w.end)) > now - 3 * 86_400_000 && !w.start.startsWith('2099')
  const seed = (n: number) => [{ name: 'Seed', amount: n, icon: itemIcon('Icon_Goods_gem_free') }]
  for (const s of m.arena?.seasons ?? []) if (live(s.open)) out.push({
    id: `${gameId}:challenge:madv:arena:${s.id}`, gameId, kind: 'challenge', title: `Arena Season ${s.order}`, start: iso(s.open.start), end: iso(s.open.end),
    image: `${MADV}/icons/tile/Action_Btn_Bg_Arena.webp`, description: ['⟦d.madArena⟧', s.stage?.name.en].filter(Boolean).join(' · '),
    items: seed(MAD_ARENA_SEEDS.master), featured: [], pulls: 0, source: 'api', official: true })
  for (const s of m.nemesis?.seasons ?? []) if (live(s.open)) out.push({
    id: `${gameId}:challenge:madv:nemesis:${s.id}`, gameId, kind: 'challenge', title: `Total War: ${s.name.en}`, start: iso(s.open.start), end: iso(s.open.end),
    image: s.tile ? `${MADV}/icons/tile/${s.tile}.webp` : undefined, description: '⟦d.madNemesis⟧',
    items: seed(MAD_NEMESIS_SEEDS.master), featured: [], pulls: 0, source: 'api', official: true })
  for (const s of m.archive?.seasons ?? []) {
    if (!live(s.open)) continue
    const seeds = (s.scores ?? []).flatMap(x => x.rewards).filter(r => r.ref === 'goods:2').reduce((n, r) => n + (r.amount[0] ?? 0), 0)
    const items = seeds ? seed(seeds) : []
    out.push({ id: `${gameId}:challenge:madv:archive:${s.id}`, gameId, kind: 'challenge', title: `Infinity Archive Season ${s.id}`, start: iso(s.open.start), end: iso(s.open.end),
      image: `${MADV}/icons/banner/Thumbnail_PastStory_Content_ArchiveAscent.webp`, description: '⟦d.madArchive⟧',
      items, featured: [], pulls: madPulls(items), source: 'api', official: true })
  }
  // Siguiente temporada estimada (28 días después de la última que traen los datos) de Infinity Archive y Total War, si aún no está programada.
  // Total War alterna sus dos jefes ("Umbra Dei" ↔ "Marisquerade").
  const DAY = 86_400_000
  const tiles = new Map((m.nemesis?.seasons ?? []).map(s => [`Total War: ${s.name.en}`, s.tile]))
  const next = (list: GameEvent[], title: (last: GameEvent) => string) => {
    const last = list.sort((a, b) => +new Date(a.start) - +new Date(b.start)).at(-1)
    if (!last || +new Date(last.end) > now + 21 * DAY) return
    const s = +new Date(last.start) + 28 * DAY, e = +new Date(last.end) + 28 * DAY
    const t = title(last)
    const tile = tiles.get(t)
    out.push({ ...last, id: `${last.id}:next`, title: t, start: new Date(s).toISOString(), end: new Date(e).toISOString(), precision: 'estimated', official: false,
      ...(tile ? { image: `${MADV}/icons/tile/${tile}.webp` } : {}) })
  }
  next(out.filter(e => e.title.startsWith('Infinity Archive')), l => `Infinity Archive Season ${Number(/\d+$/.exec(l.title)?.[0] ?? 0) + 1}`)
  const bosses = [...new Set((m.nemesis?.seasons ?? []).filter(s => !s.open.start.startsWith('2099')).map(s => s.name.en))]
  next(out.filter(e => e.title.startsWith('Total War')), l => {
    const cur = l.title.replace(/^Total War:\s*/, '')
    const other = bosses.find(b => b !== cur)
    return other ? `Total War: ${other}` : l.title
  })
  return out
}

interface Quest { desc?: Lang; levels?: { rewards?: string }[] }
interface Mission { id: number; type?: string; name?: Lang; pickup?: string; open?: Window; reset?: string
  point?: { name?: Lang; steps: { need: number; rewards: string }[] }; groups?: { quests: Quest[] }[] }
export interface MadRewards { missions?: Mission[]; rewardGroups?: Record<string, Amount[]>; refs?: Record<string, Ref> }

/**
 * Eventos de misiones (rewards.json de MAD Viewer, `missions` de tipo "event_hub" con fecha de fin): los de puntos que se reinician cada día
 * («Tied Together by Fate»: misiones diarias que suman puntos y premios por 4, 8, 12… puntos) y las misiones de cada banner («Sparkling Signal,
 * New Encounter!»: billetes Rate-Up por conseguir y subir de estrellas a la destacada). Sin cartel: las pestañas del juego son ilustraciones
 * subidas de tono; el de cada banner lleva el retrato de su Partner.
 * Tiradas: solo las de puntos; las del banner devuelven billetes por tirar en él (cuentan solo si la consigues), así que van sin tiradas.
 */
export function madMissions(gameId: string, r: MadRewards, names: Map<string, string>, now = Date.now()): GameEvent[] {
  const out: GameEvent[] = []
  const refs = r.refs ?? {}
  const groups = r.rewardGroups ?? {}
  for (const m of r.missions ?? []) {
    if (m.type !== 'event_hub' || !m.open || m.open.end.startsWith('2099')) continue
    const end = iso(m.open.end)
    if (+new Date(end) < now - 3 * 86_400_000) continue
    const days = Math.max(1, Math.round((Date.parse(m.open.end) - Date.parse(m.open.start)) / 86_400_000))
    const sum = new Map<string, number>()
    const add = (id: string | undefined, times = 1) => { for (const a of groups[id ?? ''] ?? []) sum.set(a.ref, (sum.get(a.ref) ?? 0) + (a.amount[0] ?? 0) * times) }
    for (const s of m.point?.steps ?? []) add(s.rewards)
    // Las misiones que se reinician cada día pagan una vez por día del periodo.
    for (const g of m.groups ?? []) for (const q of g.quests) for (const l of q.levels ?? []) add(l.rewards, m.reset === 'daily' ? days : 1)
    const items = [...sum].filter(([ref, n]) => n > 0 && refs[ref] && !/^goods:(?:[1-9]\d{3})$/.test(ref) && !/^deco:/.test(ref))
      .map(([ref, n]) => ({ name: refs[ref].name.en, amount: n, icon: itemIcon(refs[ref].icon) }))
    const rank = (n: string) => (/rate-up summon ticket/i.test(n) ? 0 : /^seeds?$/i.test(n) ? 1 : /summon ticket/i.test(n) ? 2 : 3)
    items.sort((a, b) => rank(a.name) - rank(b.name))
    const who = m.pickup ? names.get(m.pickup) ?? m.pickup : undefined
    out.push({
      id: `${gameId}:event:madv:mission:${m.id}`, gameId, kind: 'event', title: who ? `${m.name?.en ?? 'Missions'}: ${who}` : m.name?.en ?? `Missions ${m.id}`,
      start: iso(m.open.start), end, items: items.slice(0, 10),
      featured: m.pickup ? [{ name: who!, icon: charIcon(m.pickup), rarity: 3 }] : [],
      pulls: m.pickup ? 0 : madPulls(items), description: m.pickup ? '⟦d.madPickupMissions⟧' : '⟦d.madMissions⟧',
      source: 'api', official: true, ...(m.pickup ? { minor: true } : {}),
    })
  }
  return out
}

/** Tabla "Working codes" de lootandwaifus (rejilla `.modular-table`, varios códigos por fila y sin recompensas); se para en "Expired codes". */
export function madCodes(doc: Document): PromoCode[] {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const head = [...doc.querySelectorAll('h2')].find(h => /working codes|active codes/i.test(text(h)))
  if (!head) throw new Error('lootandwaifus MAD: no se encontró la lista de códigos')
  const out: PromoCode[] = []
  for (let n = head.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
    for (const cell of n.querySelectorAll('.modular-table-cell')) {
      if (cell.classList.contains('modular-table-header-cell')) continue
      const code = cell.getAttribute('data-copy-text')?.trim() || text(cell)
      if (/^[A-Za-z0-9]{4,30}$/.test(code) && !out.some(c => c.code.toUpperCase() === code.toUpperCase())) out.push({ code, rewards: [] })
    }
  }
  return out
}

async function get(url: string): Promise<Response> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res
}

export async function syncMakeDrama(gameId: string, now = Date.now()): Promise<GameSync> {
  const [ev, ban, codes, rw, ar] = await Promise.allSettled([
    get(`${MADV}/data/events.json`).then(r => r.json()),
    get(`${MADV}/data/gacha_banners.json`).then(r => r.json()),
    get(LOOT_CODES).then(r => r.text()).then(h => madCodes(new DOMParser().parseFromString(h, 'text/html'))),
    get(`${MADV}/data/rewards.json`).then(r => r.json()),
    get(`${MADV}/data/archive.json`).then(r => r.json()),
  ])
  if (ev.status === 'rejected' && ban.status === 'rejected') throw ev.reason
  for (const [k, r] of [['códigos', codes], ['modos', rw], ['Infinity Archive', ar]] as const)
    if (r.status === 'rejected') console.warn(`[makedrama] ${k}:`, (r.reason as Error)?.message)
  const modes: MadModes = {
    ...(rw.status === 'fulfilled' ? { arena: rw.value.arena, nemesis: rw.value.nemesis } : {}),
    ...(ar.status === 'fulfilled' ? { archive: ar.value } : {}),
  }
  const events = [...madEvents(gameId, ev.status === 'fulfilled' ? ev.value : { events: [], refs: {} }, ban.status === 'fulfilled' ? ban.value : { banners: [] }, now),
    ...madModes(gameId, modes, now),
    ...(rw.status === 'fulfilled' ? madMissions(gameId, rw.value, partnerNames(ban.status === 'fulfilled' ? ban.value : { banners: [] }), now) : [])]
  return { events, patches: [], codes: codes.status === 'fulfilled' ? codes.value : [] }
}
