import { viaProxy } from '../net'
import type { Featured, GameEvent, PromoCode } from '../types'
import type { GameSync } from './ennead'
import { parseNotices, rangeIn, type Message } from './discord'
import { pullsIn } from './pulls'

/**
 * Trickcal: Chibi Go (Epid Games; versión global, servidor único en UTC+9). Fuentes revisadas el 12 nov 2026:
 *  - Banners (rate-up de Apóstoles): "Banner history" de lootandwaifus.com (/trickcal-chibi-go-banner-history/), lista GLOBAL, mismo formato que la
 *    de NIKKE (`.bh-row`: nombre, "Nov 11, 2026 - Nov 19, 2026", iconos de rol/personalidad y la insignia ELDYNE). Las fechas son días UTC:
 *    el aviso oficial de Vivi/Rohne ("2026/11/12 04:00 - 2026/11/19 10:59 (UTC+9)") sale en la lista como "Nov 11 - Nov 19". Por eso el inicio va a
 *    las 19:00 UTC (04:00 UTC+9 del día siguiente) y el fin a las 01:59 UTC (10:59 UTC+9), marcados "≈" hasta que llega el aviso oficial.
 *  - Códigos: "Trickcal: Chibi Go free codes" de lootandwaifus (/guides/trickcal-revive-codes/, tabla "Active codes"; actualizada el 11 nov 2026).
 *  - Eventos y horas exactas: solo los tuits oficiales de @trickcal_en que llegan al canal de Discord "trickcal" (Readybot). No hay lista de eventos
 *    en ninguna web permitida (lootandwaifus no la tiene, Prydwen bloquea el `fetch`, la wiki de Fandom está abandonada). Sin canal, solo banners y códigos.
 *  - Rotatorios: ninguno con calendario fijo documentado (PvP y Yggdrasil Dig Site no publican su ciclo); los que se anuncien llegan por Discord.
 * 2 páginas de lootandwaifus por ciclo (caché de 1 h en el proxy, 3 s entre peticiones).
 */
const LOOT = 'https://lootandwaifus.com'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const monthOf = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase())
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

async function page(path: string): Promise<Document> {
  const res = await fetch(viaProxy(`${LOOT}${path}`))
  if (!res.ok) throw new Error(`lootandwaifus ${path} → HTTP ${res.status}`)
  return new DOMParser().parseFromString(await res.text(), 'text/html')
}

/** "Nov 11, 2026 - Nov 19, 2026" → [inicio 19:00 UTC, fin 01:59:59 UTC] (04:00 y 10:59 UTC+9, como los avisos oficiales). */
export function trickcalRange(s: string): [number, number] | null {
  const m = /([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})\s*[-–]\s*([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})/.exec(s)
  if (!m || monthOf(m[1]) < 0 || monthOf(m[4]) < 0) return null
  return [Date.UTC(+m[3], monthOf(m[1]), +m[2], 19), Date.UTC(+m[6], monthOf(m[4]), +m[5], 1, 59, 59)]
}

async function banners(gameId: string): Promise<GameEvent[]> {
  const doc = await page('/trickcal-chibi-go-banner-history/')
  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY
  const out: GameEvent[] = []
  doc.querySelectorAll('.bh-list[data-server="GLOBAL"] .bh-row').forEach(row => {
    const name = text(row.querySelector('h3'))
    const r = trickcalRange(text(row.querySelector('.bh-dates')))
    if (!name || !r) return
    const [start, end] = r
    if (end < from || start > to || end <= start) return
    const src = row.querySelector('img.bh-portrait')?.getAttribute('src')
    const icon = src ? (src.startsWith('http') ? src : `${LOOT}${src}`) : undefined
    const badges = [...row.querySelectorAll('.bh-badge')].map(text)
    const eldyne = badges.some(b => /eldyne/i.test(b))
    const rerun = badges.some(b => /re-?run/i.test(b))
    const traits = [...row.querySelectorAll('.bh-icon')].map(i => i.getAttribute('title')).filter(Boolean) as string[]
    const tags = [...(eldyne ? ['Eldyne'] : []), ...traits.slice(0, 3)]
    const featured: Featured[] = [{ name, icon, rarity: 3, tag: tags.join(' · ') || undefined }]
    out.push({
      id: `${gameId}:banner:lw:${name}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title: name,
      description: `⟦d.charBanner⟧${eldyne ? ' · Eldyne' : ''}${rerun ? ' · Rerun' : ''}`,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured, pulls: 0, source: 'api', precision: 'approx',
    })
  })
  if (!out.length && !doc.querySelector('.bh-row')) throw new Error('lootandwaifus Trickcal: no se encontró el historial de banners')
  return out
}

/** Tabla "Active codes": código en `data-copy-text`; recompensas "Candy x1000, Star Candy x1000" (sin las fichas emergentes de cada objeto). */
export async function syncTrickcalCodes(): Promise<PromoCode[]> {
  const doc = await page('/guides/trickcal-revive-codes/')
  const head = doc.querySelector('#active-codes') ?? [...doc.querySelectorAll('h2')].find(h => /active codes/i.test(text(h)))
  const out: PromoCode[] = []
  for (let n = head?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
    for (const row of n.querySelectorAll('.modular-table-row')) {
      if (row.classList.contains('modular-table-header')) continue
      const cells = [...row.children].filter(c => c.classList.contains('modular-table-cell'))
      const code = cells[0]?.getAttribute('data-copy-text')?.trim() || text(cells[0])
      if (!code || !/^[A-Za-z0-9]{4,30}$/.test(code) || out.some(c => c.code.toUpperCase() === code.toUpperCase())) continue
      const cell = cells[1]?.cloneNode(true) as Element | undefined
      cell?.querySelectorAll('.tooltip-content').forEach(t => t.remove())
      const raw = text(cell)
      // "Crystal Leaf x1111 and some food", "Candy x1000, Star Candy x1000", "Crystal Leaf 1,151".
      const rewards = raw.split(/\s*,\s+(?=[A-Za-z])|\s+and\s+/).map(r => r.trim().replace(/\s*x\s?(\d[\d,]*)$/i, ' ×$1')).filter(Boolean)
      out.push({ code, rewards: rewards.slice(0, 6) })
    }
  }
  return out
}

/**
 * Avisos oficiales de la web de Bilibili (trickcal.biligames.com/news/en/, 12 nov 2026): la propia web pide su lista y cada aviso a
 * `l11-web-api.biligames.com/game/news/page|detail` (responde sin la firma `sign/nonce/ts` que añade el navegador). La lista en inglés es la del
 * servidor 港澳台 (`game_base_id=113406`); sus "Event Notice" cuadran con el global (Vivi/Rohne: "2026/11/12 04:00 - 2026/11/19 10:59 (UTC+9)", igual que
 * lootandwaifus y @trickcal_en). La del global (111435) dejó de publicarse en mayo de 2026. Cada aviso trae todos los eventos y banners de la
 * actualización con hora exacta ("Event Period: 2026/11/05 (after maintenance) – 2026/11/19 10:59 (UTC+9)") y se lee con el mismo lector que
 * los anuncios de Discord (`parseNotices`). 1 lista + hasta 3 avisos por ciclo (caché de 2 h en el proxy).
 */
const BILI = 'https://l11-web-api.biligames.com/game/news'
const BILI_Q = 'game_base_id=113406&show_position=1&client_type=1&lang=en'

/** HTML del aviso → texto con una línea por párrafo. */
export function htmlText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n')
}

export async function syncTrickcalNews(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${BILI}/page?${BILI_Q}&type=&page_num=1&page_size=10`))
  if (!res.ok) throw new Error(`biligames Trickcal → HTTP ${res.status}`)
  const list = ((await res.json())?.data?.list ?? []) as { news_id: string; title: string; publish_time: string }[]
  // Hora de publicación en UTC+8 (la de Bilibili): solo sirve de referencia para el año y la antigüedad.
  const at = (s: string) => Date.parse(`${s.replace(' ', 'T')}+08:00`)
  const wanted = list.filter(n => /event notice|update|maintenance/i.test(n.title) && Date.now() - at(n.publish_time) < 40 * DAY).slice(0, 3)
  const messages: Message[] = []
  for (const n of wanted) {
    const d = await fetch(viaProxy(`${BILI}/detail?${BILI_Q}&news_id=${n.news_id}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    const html: string = d?.data?.content ?? ''
    if (html) messages.push({ id: n.news_id, content: `${n.title}\n${htmlText(html)}`, timestamp: new Date(at(n.publish_time)).toISOString() })
  }
  if (!messages.length && !list.length) throw new Error('biligames Trickcal: sin avisos')
  const events = messages.flatMap(m => trickcalNotice(gameId, m.content, +new Date(m.timestamp)))
  // Códigos que traiga algún aviso: los mismos que busca el lector de Discord.
  return { events: events.filter((e, i) => events.findIndex(o => o.id === e.id) === i), patches: [], codes: parseNotices(gameId, messages).codes }
}

/** Nombre de un apartado: "1. Themed Theater [Between Usurpation and Deviation]" → "Between Usurpation and Deviation"; "Recruit Pick Up Apostle
 *  [A Noble from Dragon Royalty] Vivi" → "Vivi" (el corchete es el título del Apóstol); "6. Weekend Event [WWElias!]" → "WWElias!". */
function noticeName(raw: string): string {
  const s = raw.replace(/^\s*(?:\d{1,2}\.|[①-⑳])\s*/, '').trim()
  const after = /\]\s*([A-Z][\w' -]{1,30})$/.exec(s)?.[1]?.trim()
  if (after && !/rate up|limited|available/i.test(after)) return after
  const br = /\[([^\]]{2,60})\]/.exec(s)?.[1]
  return (br ?? s).replace(/\s*Limited-Time Rate Up$/i, '').trim()
}

/**
 * "Event Notice" de la web de Bilibili: apartados numerados ("1. Themed Theater [X]", "8. Dimension Clash") con subapartados (①, ②…) y su
 * "Event Period: 2026/11/05 (after maintenance) – 2026/11/19 10:59 (UTC+9)". Un periodo del apartado vale para sus Apóstoles sin periodo propio
 * ("3. Other Featured Apostle Recruitment …" → Vivi y Rohne). "After maintenance" empieza a la hora del mantenimiento del aviso ("will undergo
 * maintenance on 2026/11/05 11:00 (UTC+9)"; su fin no se anuncia: "≈"). Se omiten las gachas de cartas, la tienda y los plazos de canje o votación.
 */
export function trickcalNotice(gameId: string, text: string, posted: number): GameEvent[] {
  const year = new Date(posted).getUTCFullYear()
  const mt = /maintenance on (\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})\s*\(UTC([+-]\d{1,2})\)/i.exec(text)
  const maint = mt ? Date.UTC(+mt[1], +mt[2] - 1, +mt[3], +mt[4] - +mt[6], +mt[5]) : undefined
  type Part = { name: string; raw: string; lines: string[]; r?: NonNullable<ReturnType<typeof rangeIn>>; sec?: Part; subs: Part[] }
  const parts: Part[] = []
  let sec: Part | undefined, cur: Part | undefined
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^\d{1,2}\.\s+\S/.test(line) && line.length <= 100) { sec = cur = { name: noticeName(line), raw: line, lines: [], subs: [] }; parts.push(sec); continue }
    if (/^[①-⑳]\s*\S/.test(line) && sec) { cur = { name: noticeName(line), raw: line, lines: [], sec, subs: [] }; sec.subs.push(cur); parts.push(cur); continue }
    cur?.lines.push(line)
    if (!cur || cur.r || !/^event period\s*:/i.test(line)) continue
    const r = rangeIn(line, year, 9)
    if (r) cur.r = r
  }
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  for (const p of parts) {
    const apostle = /apostle|recruit/i.test(p.raw) && !/card|selection/i.test(p.raw)
    // Sin periodo propio: el del apartado, solo para los Apóstoles (los muebles o mascotas del apartado no son eventos).
    const r = p.r ?? (apostle && p.sec?.r ? p.sec.r : undefined)
    if (!r || /card gacha|furniture|poster|figure|pets?\b/i.test(p.raw)) continue
    // Apartado cuyo periodo es solo el de sus Apóstoles ("Other Featured Apostle Recruitment and Featured Card Gacha"): no es un evento.
    if (!p.sec && p.subs.some(s => !s.r && /apostle|recruit/i.test(s.raw))) continue
    const approx = !!r.afterMaint
    const start = r.afterMaint && maint ? maint : r.start
    if (!(r.end > start) || r.end < from || start > to) continue
    const kind = apostle || /pick up apostle selection/i.test(p.raw) ? 'banner' as const : 'event' as const
    // "① Event Story" es la historia del evento del apartado: se nombra con él.
    // "9. Pass" → el nombre completo que dé su texto ("Civvies Pass", "Trickcal Pass").
    const title = p.sec && /^event story$/i.test(p.name) ? `${p.sec.name}: Event Story`
      : /^pass$/i.test(p.name) ? (p.lines.join(' ').match(/\b([A-Z][\w']+ Pass)\b/)?.[1] ?? 'Trickcal Pass') : p.name
    const found = kind === 'event' ? pullsIn('trickcal', p.lines) : { pulls: 0, items: [] }
    out.push({
      id: `${gameId}:${kind}:bili:${title}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind, title,
      start: new Date(start).toISOString(), end: new Date(r.end).toISOString(), items: found.items, pulls: found.pulls,
      featured: kind === 'banner' && apostle ? [{ name: title, rarity: 3 }] : [], official: true, source: 'api', precision: approx ? 'approx' : undefined,
      minor: /pet errands|^pass$|civvies/i.test(title) || undefined,
    })
  }
  return out
}

export async function syncTrickcal(gameId: string): Promise<GameSync> {
  const [bn, cd] = await Promise.allSettled([banners(gameId), syncTrickcalCodes()])
  if (bn.status === 'rejected' && cd.status === 'rejected') throw bn.reason
  return {
    events: bn.status === 'fulfilled' ? bn.value : [],
    patches: [],
    codes: cd.status === 'fulfilled' ? cd.value : [],
  }
}
