import { viaProxy } from '../net'
import type { GameEvent, Kind, PromoCode } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * BrownDust2 (Global): avisos oficiales de browndust2.com, desde la API que usa su propia web (webapi.browndust2.com/api/notices,
 * la misma que llama `api-client.*.js` de la página de noticias). robots.txt de browndust2.com: "Allow: /". Revisado el 7 nov 2026.
 * Por ciclo: 1 lista (50 avisos ≈ 4 semanas) + hasta ~8 avisos completos, siempre por /proxy con caché.
 *
 * Cada actualización (cada 2 semanas, miércoles) trae varios avisos con el mismo formato:
 *  - "🔔Events after the November 4 (UTC) Update": secciones "1. Pickup Event Mission", "2. One Last Move Login Event"… con
 *    "Event Period: After the November 4 maintenance - before the November 18 maintenance." Las misiones de pickup = los banners.
 *  - "📢Contents Schedule after November 4 (UTC) Update": temporadas del Golden Colosseum y la Tower of Salvation ("Season 27: … - …").
 *  - "📢November 4 (UTC) Routine Maintenance and Update": horario del mantenimiento ("November 4, 11:50 PM (UTC) - November 5, 3:00 AM (UTC)")
 *    y el evento de temporada ("Event Period for "Blood Royale": …").
 *  - "Notice of Live Update on October 29 (UTC)": eventos menores con fechas explícitas.
 * "After the X maintenance" = fin de ese mantenimiento; "before the X maintenance" = su inicio (siempre 23:50 UTC si aún no hay aviso).
 */
const API = 'https://webapi.browndust2.com/api/notices'
const LOCALE = 'en-us'
const DAY = 86_400_000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** Los mantenimientos empiezan a las 23:50 UTC y duran unas 3 h: valores de apoyo cuando aún no hay aviso de ese mantenimiento. */
const MAINT_START = [23, 50]
const MAINT_END_NEXT_DAY = [3, 0]

interface Item { id: string; subject: string; category: string; publishedAt: string }
interface Notice extends Item { content: string; contentHtml?: string }

/** Avisos con periodos: los de cada actualización y los de regalos con plazo ("… Maintenance and Update Complete" = compensación, "Night Live Rewards"). */
const RELEVANT = /Events after the .+ Update|Contents Schedule after|Routine Maintenance and Update|Notice of Live Update|Rewards\b/i
/** Cupones de canje ("🎁 November 2026 Coupon", "🌝Full Moon Coupon"); no los descuentos de la tienda web. */
const COUPON = /Coupon/i
const NOT_COUPON = /Web ?Shop|Webstore|Web Store|Discount|Withdrawal|Collab|Restriction/i

const monthIdx = (s: string) => MONTHS.findIndex(m => m.startsWith(s.toLowerCase().slice(0, 3)))

/** Año de una fecha sin año ("November 18") a partir de la fecha del aviso: si cae >6 meses antes, es del año siguiente. */
function yearFor(mo: number, ref: Date): number {
  const y = ref.getUTCFullYear()
  return mo < ref.getUTCMonth() - 6 ? y + 1 : mo > ref.getUTCMonth() + 6 ? y - 1 : y
}

/** "November 4" → clave de día "2026-11-04" (sin hora). */
function dayKey(s: string, ref: Date): string | null {
  const m = /([A-Z][a-z]+)\.? (\d{1,2})/.exec(s)
  const mo = m ? monthIdx(m[1]) : -1
  if (!m || mo < 0) return null
  return new Date(Date.UTC(yearFor(mo, ref), mo, +m[2])).toISOString().slice(0, 10)
}

/** "November 19, 02:59 PM (UTC)" / "October 29, 12:00 AM (UTC)" / "November 5, 3:00 AM" / "Sep 27, 2026, 14:59 (UTC)" → ms UTC. */
function explicit(s: string, ref: Date): number {
  const m = /([A-Z][a-z]+)\.? (\d{1,2}),?\s*(?:(\d{4}),?\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(s)
  const mo = m ? monthIdx(m[1]) : -1
  if (!m || mo < 0) return NaN
  let h = +m[4] % 12
  if (m[6]?.toUpperCase() === 'PM') h += 12
  if (!m[6]) h = +m[4]
  return Date.UTC(m[3] ? +m[3] : yearFor(mo, ref), mo, +m[2], h, +m[5]) + (m[5] === '59' ? 59_999 : 0)
}

/** Texto del aviso en líneas; las imágenes quedan como `@@IMG url` y los títulos <h2> como `@@H2 texto`. */
function lines(n: Notice): string[] {
  const html = n.contentHtml || n.content
  const marked = html
    .replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi, (_m, src: string) => `\n@@IMG ${src}\n`)
    .replace(/<h2[^>]*>/gi, '\n@@H2 ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|blockquote|tr)>/gi, '$&\n')
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${marked}</body></html>`, 'text/html')
  return (doc.body.textContent ?? '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

interface Maint { start: Map<string, number>; end: Map<string, number> }

/** Horarios de mantenimiento: "Maintenance Schedule: November 4, 11:50 PM (UTC) - November 5, 3:00 AM (UTC)" y "Update Schedule: October 29, 12:00 AM (UTC)". */
function readMaintenance(n: Notice, m: Maint) {
  const ref = new Date(n.publishedAt)
  const day = dayKey(/([A-Z][a-z]+ \d{1,2}) \(UTC\)/.exec(n.subject)?.[1] ?? '', ref)
  if (!day) return
  const sched = /Maintenance Schedule:\s*(.+?\(UTC\))\s*[-–]\s*(.+?\(UTC\))/i.exec(n.content)
  if (sched) {
    const a = explicit(sched[1], ref), b = explicit(sched[2], ref)
    if (!isNaN(a)) m.start.set(day, a)
    if (!isNaN(b)) m.end.set(day, b)
    return
  }
  const live = /Update Schedule:\s*(.+?\(UTC\))/i.exec(n.content)
  if (live) { const t = explicit(live[1], ref); if (!isNaN(t)) { m.start.set(day, t); m.end.set(day, t) } }
}

/** Un extremo de un periodo → [ms, aproximado]. */
function point(s: string, ref: Date, m: Maint, side: 'start' | 'end'): [number, boolean] {
  const rel = /(after|before) the ([A-Z][a-z]+ \d{1,2})(?: \(UTC\))? (?:maintenance|update)/i.exec(s)
  if (rel) {
    const day = dayKey(rel[2], ref)
    if (!day) return [NaN, true]
    const after = rel[1].toLowerCase() === 'after'
    const known = (after ? m.end : m.start).get(day)
    if (known !== undefined) return [known, false]
    const d = +new Date(day)
    return [after ? d + DAY + (MAINT_END_NEXT_DAY[0] * 60 + MAINT_END_NEXT_DAY[1]) * 60_000 : d + (MAINT_START[0] * 60 + MAINT_START[1]) * 60_000, after || side === 'start']
  }
  return [explicit(s, ref), false]
}

const cleanTitle = (s: string) => s
  .replace(/^@@H2\s*/, '').replace(/^\d+\.\s*/, '')
  .replace(/^Season Event\s*['‘"“](.+?)['’"”]\s*Update$/i, '$1')
  .replace(/\s+Update$/i, '').replace(/[.。]+$/, '').trim()

/**
 * Las imágenes pegadas desde el editor se llaman todas "image.png" y son tablas (recompensas, misiones, habilidades) o capturas de la interfaz;
 * el arte de verdad (banners, trajes) se sube con nombre propio ("5.png", "01_PC_1280x250_02EN.jpg"). Solo se usa el segundo.
 */
const isArt = (url: string) => !/\/image\.(png|jpe?g|webp|gif)$/i.test(url)

const MINOR = /Coupon|Survey|Attendance Check|Login Event/i
const CHALLENGE = /Colosseum|Tower of Salvation|Mirror War|Guild Raid|Arena/i

/** `art`: arte de cada traje ("1) Night of Betrayal Valze Costume: …" + su imagen), para los banners de pickup. */
function parseNotice(gameId: string, n: Notice, m: Maint, out: GameEvent[], seen: Set<string>, pickups: Map<string, GameEvent>, art: Map<string, string>) {
  const ref = new Date(n.publishedAt)
  const ls = lines(n)
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  let section = '', img: string | undefined, pickup = '', usedSection = false
  /** Evento de la sección actual: su imagen suele venir después del periodo. */
  let current: GameEvent | undefined
  /** Traje cuya ilustración viene en la siguiente imagen. */
  let costume = ''

  const push = (kind: Kind, title: string, a: string, b: string, extra: Partial<GameEvent> = {}) => {
    const [start, s1] = point(a, ref, m, 'start'), [end, e1] = point(b, ref, m, 'end')
    if (isNaN(start) || isNaN(end) || end <= start || end < from || start > to || end - start > 150 * DAY) return
    const id = `${gameId}:${kind}:${title.toLowerCase()}:${new Date(start).toISOString().slice(0, 10)}`
    if (seen.has(id)) return
    seen.add(id)
    const ev: GameEvent = {
      id, gameId, kind, title, image: kind === 'banner' ? undefined : img,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: [], pulls: 0, official: true, source: 'api',
      precision: s1 || e1 ? 'approx' : undefined, minor: MINOR.test(title) || undefined, ...extra,
    }
    out.push(ev)
    if (kind !== 'banner') current = ev
    if (kind === 'banner') pickups.set(ev.featured[0]?.name.toLowerCase() ?? title.toLowerCase(), ev)
  }

  /**
   * Recompensas que el texto detalla ("Main Rewards: Draw Ticket x20 + Ancient Crystal x20 + Dia x600"): se leen del bloque de la sección
   * al cerrarla. La mayoría de los avisos las ponen solo en una imagen (tabla); entonces el evento queda sin recompensas (= desconocido).
   */
  let block: string[] = []
  const flush = () => {
    if (current && !current.items.length && block.length) {
      const { pulls, items } = pullsIn('bd2', block)
      current.pulls = pulls
      current.items = items
    }
    block = []
  }
  /** Título del regalo con plazo: el último "[…]" del aviso ("[November 4 (UTC) Maintenance Compensation]") o el asunto sin emojis. */
  let bracket = ''
  const giftTitle = () => (bracket || n.subject).replace(/[^\p{L}\p{N}()&'.,:\- ]/gu, '').replace(/\(UTC\)/g, '').replace(/\s+/g, ' ').trim()

  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    if (!l.startsWith('@@')) block.push(l)
    const br = /^\[([^\]]+)\]$/.exec(l)
    if (br) bracket = br[1]
    // Regalos con plazo: "■ Claim Period: After the November 4 (UTC) maintenance – November 9, 2:59 PM (UTC)" / "📅 Claim Period: Until November 6, 2026, 14:59 (UTC)"
    const claim = /Claim Period:\s*(.+)$/i.exec(l)
    if (claim) {
      const until = /^Until\s+(.+)$/i.exec(claim[1].trim())
      const [a, b] = until ? [n.publishedAt, until[1]] : claim[1].split(/\s+[-–]\s+/)
      if (a && b) {
        const before = out.length
        // `push` con inicio ISO: `point` no lo entiende, así que el "Until" se resuelve aquí.
        if (until) {
          const end = explicit(b, ref)
          if (!isNaN(end) && end > from && end > +ref) {
            const id = `${gameId}:event:${giftTitle().toLowerCase()}:${n.publishedAt.slice(0, 10)}`
            if (!seen.has(id)) { seen.add(id); out.push({ id, gameId, kind: 'event', title: giftTitle(), start: n.publishedAt, end: new Date(end).toISOString(), items: [], featured: [], pulls: 0, official: true, source: 'api', minor: true }) }
          }
        } else push('event', giftTitle(), a, b, { minor: true })
        const ev = out.length > before ? out[out.length - 1] : undefined
        if (ev) {
          // "■ Compensation: 800 Free Dias (…)" / "🎁 Reward: Draw Ticket x 10" en las líneas siguientes.
          const next = ls.slice(i + 1, i + 4).map(x => x.replace(/^.*?(Compensation|Reward)s?:\s*/i, '').replace(/\b(\d[\d,]*) (?:Free )?Dias?\b/gi, 'Dia x$1'))
          const { pulls, items } = pullsIn('bd2', next)
          ev.pulls = pulls
          ev.items = items
        }
      }
      continue
    }
    if (l.startsWith('@@IMG ')) {
      const url = l.slice(6).trim()
      if (!isArt(url)) continue
      if (costume) { if (!art.has(costume)) art.set(costume, url); costume = ''; continue }
      if (!img) img = url
      if (current && !current.image) current.image = img
      continue
    }
    if (l.startsWith('@@H2 ') || /^\d+\.\s+\S/.test(l)) { flush(); section = cleanTitle(l); img = current = undefined; pickup = costume = ''; usedSection = false; continue }
    const co = /^\d+\)\s*(.+?)\s+Costume:/i.exec(l)
    if (co) { costume = co[1].trim().toLowerCase(); continue }
    // Misiones de pickup: "- Night of Betrayal Valze Pickup Event Mission will be held." / "- [RERUN] Maid Name R Liatris Pickup Event Mission…"
    const pk = /^-\s*(\[RERUN\]\s*)?(.+?)\s+Pickup Event Mission/i.exec(l)
    if (pk) { pickup = `${pk[1] ? '[RERUN] ' : ''}${pk[2].trim()}`; continue }
    const per = /^(?:-\s*)?(?:Event|Distribution)\s*Period(?: for [^:]+)?:\s*(.+?)\s+[-–]\s+(.+?)\.?$/i.exec(l)
    if (per) {
      if (pickup) {
        const rerun = pickup.startsWith('[RERUN] ')
        const name = pickup.replace('[RERUN] ', '')
        push('banner', name, per[1], per[2], { description: `⟦d.charBanner⟧${rerun ? ' · Rerun' : ''}`, featured: [{ name, rarity: 5 }] })
        pickup = ''
        continue
      }
      if (usedSection || !section) continue
      usedSection = true
      push(CHALLENGE.test(section) ? 'challenge' : 'event', section, per[1], per[2])
      continue
    }
    // Calendario de contenidos: "- Trial Season 49: After the November 4 maintenance - November 11, 02:59 PM (UTC)" / "- Season 27: …"
    const sch = /^-\s*((?:Trial\s+)?Season\s+\d+):\s*(.+?)\s+[-–]\s+(.+)$/i.exec(l)
    if (sch && section) push('challenge', `${section} · ${sch[1]}`, sch[2], sch[3])
  }
  flush()
}

/**
 * Cupones vigentes: "- Coupon Code : 2026BD2NOV" + "Coupon Redemption Period: October 31, 2026, 15:00 - November 30, 2026, 14:59 (UTC)" /
 * "Expiry Date : Until Sep 27, 2026, 14:59 (UTC)" / "Valid Until: August 31, 2026, 14:59 (UTC)" y, a veces, "Reward: 100,000 Refining Powder".
 * Casi siempre la recompensa va solo en la imagen del aviso: entonces se muestra hasta cuándo vale.
 */
function readCoupon(n: Notice): PromoCode | null {
  const ref = new Date(n.publishedAt)
  const text = lines(n).filter(l => !l.startsWith('@@')).join('\n')
  const code = /Coupon Code\s*:\s*([A-Z0-9]{4,30})/i.exec(text)?.[1]
  if (!code) return null
  const endTxt = /(?:Redemption Period|Expiry Date|Valid Until|Period)\s*:[^\n]*?(?:[-–]|Until)\s*([A-Z][a-z]+\.? \d{1,2},?\s*(?:\d{4},?\s*)?\d{1,2}:\d{2}(?:\s*[AP]M)?)/i.exec(text)?.[1]
  const end = endTxt ? explicit(endTxt, ref) : NaN
  // Sin fecha legible: los mensuales duran ~1 mes desde el aviso.
  if ((isNaN(end) ? +ref + 31 * DAY : end) < Date.now()) return null
  const reward = /Rewards?\s*:\s*([^\n]+)/i.exec(text)?.[1]?.trim()
  const until = isNaN(end) ? undefined : `Until ${new Date(end).toUTCString().slice(5, 16)} (UTC)`
  return { code, rewards: [reward, until].filter((x): x is string => !!x) }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`browndust2 → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

const notice = (id: string) => get<Notice>(`${API}/${id}?${new URLSearchParams({ locale: LOCALE })}`)

export async function syncBd2(gameId: string): Promise<GameSync> {
  const list = await get<{ items?: Item[] }>(`${API}?${new URLSearchParams({ locale: LOCALE, page: '0', limit: '50' })}`)
  const items = list.items ?? []
  if (!items.length) throw new Error('browndust2: lista de avisos vacía')
  // Los avisos de las 2 últimas actualizaciones (≈ 4 semanas): de ahí salen todos los periodos que siguen abiertos.
  const relevant = items.filter(i => RELEVANT.test(i.subject)).slice(0, 10)
  const notices = (await Promise.all(relevant.map(i => notice(i.id).catch(() => null)))).filter((n): n is Notice => !!n?.content)
  const maint: Maint = { start: new Map(), end: new Map() }
  for (const n of notices) if (/Maintenance and Update|Live Update/i.test(n.subject)) readMaintenance(n, maint)

  const out: GameEvent[] = []
  const seen = new Set<string>()
  const pickups = new Map<string, GameEvent>()
  const art = new Map<string, string>()
  // Del más antiguo al más reciente: si un periodo se repite, gana el primero (mismo id).
  for (const n of [...notices].reverse()) parseNotice(gameId, n, maint, out, seen, pickups, art)

  // Arte de los banners: el del traje en el aviso de mantenimiento ("Pickup and New Character Information") o, si no está,
  // el del aviso "New Pickup - <nombre>" cuando figura entre los recientes.
  for (const [name, ev] of pickups) {
    const own = art.get(name)
    if (own) { ev.image = own; continue }
    const it = items.find(i => /Pickup\s*-/i.test(i.subject) && i.subject.toLowerCase().includes(name))
    if (!it) continue
    const n = await notice(it.id).catch(() => null)
    const src = n ? [...(n.contentHtml ?? '').matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/gi)].map(x => x[1]).find(isArt) : undefined
    if (src) ev.image = src
  }
  // Cupones: los 3 avisos de cupón más recientes de la lista (el mensual y algún especial); se quedan los que siguen vigentes.
  const couponItems = items.filter(i => COUPON.test(i.subject) && !NOT_COUPON.test(i.subject)).slice(0, 3)
  const codes: PromoCode[] = []
  for (const it of couponItems) {
    const c = await notice(it.id).then(readCoupon, () => null)
    if (c && !codes.some(x => x.code === c.code)) codes.push(c)
  }
  if (!out.length) throw new Error('browndust2: sin eventos vigentes en los avisos')
  return { events: out, patches: [], codes }
}
