import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Honkai Impact 3rd: eventos desde su wiki de Fandom (API de MediaWiki; robots.txt permite /api.php). Cada evento tiene
 * `{{Event Entry |start = 2026-10-29 04:00 |end = 2026-12-24 04:00 |version = 9.1}}`; se piden los 40 últimos añadidos a "Category:Events"
 * (una sola consulta con su texto y su imagen). La hora es la del servidor y la wiki no dice cuál: se toma UTC+8 (servidor de Asia) y se marca "≈".
 * Los gachapones ("Supply") la wiki ya no los registra: para ellos haría falta el Discord oficial (docs/discord-bot.md).
 */
const API = 'https://honkaiimpact3.fandom.com/api.php'
const DAY = 86_400_000
const SERVER = 8

const at = (s: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] ? +m[4] : 0) - SERVER, m[5] ? +m[5] : 0) : NaN
}

/** Eventos de pago o de tienda: sus cifras son gasto o precios, no recompensas. */
const PAID = /Battle Pass|Spend Bonuses|Sale|Shop|Time Capsule|Supply|Pack\b/i
/** Líneas de gasto o de precio ("spend 30,000 Crystals in Supply", "costs 10 Crystals", "15% off", "original price"). */
const PAID_LINE = /spend|spent|cost|purchas|discount|\d\s*%|original|price|top-?up|consum/i

/** "{{currency|Crystals|1,540}}", "{{item|Asterite|size=70|rarity=4|quantity=888}}" → nombre y cantidad (sin cantidad no cuentan). */
/** Tiradas por unidad: 280 Crystals = 1; cada Supply Card = 1 (pulls.ts). */
const perPull = (name: string) => /^crystals?$/i.test(name) ? 1 / 280 : /^(expansion|focused|equipment|battlesuit|astralop) supply cards?$/i.test(name) ? 1 : 0

function rewardsIn(lines: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of lines) {
    if (PAID_LINE.test(l)) continue
    const found: { name: string; n: number }[] = []
    for (const m of l.matchAll(/\{\{\s*(currency|item)\s*\|([^}]*)\}\}/gi)) {
      const parts = m[2].split('|').map(x => x.trim())
      const name = /^crystal$/i.test(parts[0]) ? 'Crystals' : parts[0]
      const qty = m[1].toLowerCase() === 'item' ? /^quantity\s*=\s*([\d,]+)$/i.exec(parts.find(p => /^quantity\s*=/i.test(p)) ?? '')?.[1] : parts.find((p, i) => i > 0 && /^[\d,]+$/.test(p))
      const n = qty ? Number(qty.replace(/,/g, '')) : 0
      if (name && n > 0) found.push({ name, n })
    }
    // "Log in for 3/5/7 days: Choose one of the following: A, B, or C" → solo una opción (la que más tiradas vale), tantas veces como días se citan.
    const pick = /choose one|select one|one of the following/i.test(l)
    const times = pick ? (/(\d+(?:\/\d+)+)\s*days?/i.exec(l)?.[1].split('/').length ?? 1) : 1
    const take = pick && found.length ? [found.reduce((a, b) => (perPull(b.name) * b.n > perPull(a.name) * a.n ? b : a))] : found
    for (const { name, n } of take) out.set(name, (out.get(name) ?? 0) + n * times)
  }
  return out
}

/**
 * Recompensas de la página de un evento de la wiki. Muchas dan el total en el texto de arriba ("log in for 7 days to claim Equipment Supply Card ×10")
 * y luego el desglose día a día: sumar los dos duplicaría. Por objeto se toma el MAYOR entre el resumen y la suma del desglose (Dream-Gathering:
 * 10 y 10 → 10; Proof of Dreamseeking: 2 Supply Cards solo en el resumen → 2). No cuentan las notas de Ai-chan ("Use X to obtain…": lo que da usar
 * un objeto ya recibido) ni las líneas de gasto o precio. Tiradas según pulls.ts (280 Crystals, Supply Card = 1).
 */
function pageRewards(text: string): { items: { name: string; amount: number }[]; pulls: number } {
  const body = text.replace(/\{\{\s*Event Entry[\s\S]*?\}\}/i, '')
  const first = body.search(/^==/m)
  const intro = (first >= 0 ? body.slice(0, first) : body).split('\n')
  const rest = first >= 0 ? body.slice(first).split(/^(?===)/m).filter(s => !/^==+\s*(Ai-chan|Reminder|Notes?|Gallery|Trivia|Contents|Drops?|Rates?|Pool|Probabilit)/i.test(s)).join('\n').split('\n') : []
  const a = rewardsIn(intro), b = rewardsIn(rest)
  const items = [...new Set([...a.keys(), ...b.keys()])].map(name => ({ name, amount: Math.max(a.get(name) ?? 0, b.get(name) ?? 0) }))
  const per = perPull
  const pulls = Math.round(items.reduce((n, i) => n + i.amount * per(i.name), 0) * 10) / 10
  // Primero lo que sirve para tirar; después el resto (máx. 10).
  items.sort((x, y) => per(y.name) - per(x.name))
  return { items: items.slice(0, 10), pulls }
}

export async function syncHonkai3(gameId: string): Promise<GameSync> {
  const qs = new URLSearchParams({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:Events', gcmsort: 'timestamp', gcmdir: 'desc', gcmlimit: '40',
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '480', format: 'json', formatversion: '2', origin: '*',
  })
  const res = await fetch(viaProxy(`${API}?${qs}`))
  if (!res.ok) throw new Error(`honkaiimpact3.fandom.com → HTTP ${res.status}`)
  const pages = ((await res.json())?.query?.pages ?? []) as { title: string; revisions?: { slots?: { main?: { content?: string } } }[]; thumbnail?: { source: string } }[]
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  for (const p of pages) {
    const text = p.revisions?.[0]?.slots?.main?.content ?? ''
    const entry = /\{\{\s*Event Entry([\s\S]*?)\}\}/i.exec(text)?.[1]
    if (!entry) continue
    const field = (k: string) => new RegExp(`\\|\\s*${k}\\s*=\\s*([^|\\n}]+)`, 'i').exec(entry)?.[1]?.trim() ?? ''
    const start = at(field('start')), end = at(field('end'))
    if (isNaN(start) || isNaN(end) || !(end > start) || end < from || start > to || end - start > 150 * DAY) continue
    const title = p.title.replace(/\s*\((v[\d.]+|event)\)$/i, '').trim()
    const r = PAID.test(title) ? { items: [], pulls: 0 } : pageRewards(text)
    out.push({
      id: `${gameId}:event:hi3:${p.title}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'event', title,
      description: field('version') ? `v${field('version')}` : undefined,
      image: p.thumbnail?.source,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: r.items, featured: [], pulls: r.pulls, source: 'api', precision: 'approx',
      minor: /Sale|Spend Bonuses|Shop/i.test(title) || undefined,
    })
  }
  if (!out.length) throw new Error('honkai3: sin eventos vigentes en la wiki')
  return { events: out, patches: [], codes: [] }
}
