import { viaProxy } from '../net'
import type { Featured, GameEvent, PromoCode } from '../types'
import type { GameSync } from './ennead'

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

export async function syncTrickcal(gameId: string): Promise<GameSync> {
  const [bn, cd] = await Promise.allSettled([banners(gameId), syncTrickcalCodes()])
  if (bn.status === 'rejected' && cd.status === 'rejected') throw bn.reason
  return {
    events: bn.status === 'fulfilled' ? bn.value : [],
    patches: [],
    codes: cd.status === 'fulfilled' ? cd.value : [],
  }
}
