import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

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

/** Arte de un evento: el campo `banner` de su ficha (`/nice/NA/event/<id>`); las campañas y quests sueltas no tienen. */
async function eventArt(id: number): Promise<string | undefined> {
  const res = await fetch(viaProxy(`https://api.atlasacademy.io/nice/NA/event/${id}`))
  if (!res.ok) return undefined
  const banner = ((await res.json()) as { banner?: string }).banner
  return typeof banner === 'string' && banner.startsWith('https://static.atlasacademy.io/') ? banner : undefined
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
  for (const e of main) e.image = await eventArt(+e.id.split(':').pop()!).catch(() => undefined)
  for (const e of events) {
    if (e.kind !== 'event' || e.image) continue
    const quoted = /"([^"]{4,})"/.exec(e.title)?.[1]
    const parent = quoted && events.find(p => p.image && p.kind === 'event' && p.title.includes(quoted))
    if (parent) e.image = parent.image
  }
  const future = await fromJp(gameId, evs, svt).catch(err => { console.warn('[fgo] JP:', (err as Error)?.message ?? err); return [] as GameEvent[] })
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
  ].filter(p => p.lag > 300 * DAY).sort((a, b) => b.at - a.at).slice(0, 5)
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

  const byName = new Map([...svt.values()].map(s => [s.name.toLowerCase(), s]))
  for (const b of list) {
    const js = day(b.jp_start_date), je = day(b.jp_end_date)
    // Ya en NA, sin fecha, anterior a lo alcanzado o de pago (Lucky Bag).
    if (b.na_start_date || isNaN(js) || js <= reached || /lucky bag/i.test(b.name)) continue
    const s = open(js), en = close(isNaN(je) ? js + 14 * DAY : je)
    if (en < now || s > to || en <= s) continue
    const names = (b.servant_profile_future_banner ?? []).map(x => x?.banner_servant?.name?.trim()).filter((n): n is string => !!n)
    const featured: Featured[] = [...new Set(names)].slice(0, 3).map(name => { const sv = byName.get(name.toLowerCase()); return { name, icon: sv?.face, rarity: sv?.rarity, tag: sv?.className } })
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
