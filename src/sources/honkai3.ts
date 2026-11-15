import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Honkai Impact 3rd: eventos desde su wiki de Fandom (API de MediaWiki; robots.txt permite /api.php). Cada evento tiene
 * `{{Event Entry |start = 2026-10-29 04:00 |end = 2026-12-24 04:00 |version = 9.1}}`; se piden los 40 últimos añadidos a "Category:Events"
 * (una sola consulta con su texto y su imagen). La hora es la del servidor de América (UTC-5): la versión 9.1 empieza "2026-10-22 05:00", que es el
 * fin del mantenimiento "23:00, OCT 21 – 05:00, OCT 22 (UTC-5, Americas Server)" del aviso oficial y el `debut_NA` de la página "Version 9.1"
 * (hasta el 14 nov 2026 se leía como UTC+8 y todo salía 13 h antes). servers.ts desplaza a Europa/Asia.
 *
 * Gachapones ("Supply"), 14 nov 2026:
 *  - Los de trajes ("… Outfit Supply"): la wiki los tiene como eventos con fecha exacta → banner con la valquiria y su traje.
 *  - Los de la versión (Battlesuit, AstralOp y Equipment Supply): la wiki no los registra con fecha. Salen del aviso oficial "vX.Y … Update Announcement"
 *    de HoYoLAB (hoyolab.ts más abajo): empiezan con la versión y el aviso no da su cierre (rotan cada 14 días con reposiciones que solo se anuncian
 *    con imágenes), así que van como `open` (sin fin mostrado). El canal de Discord (#glb-current-supplies) los completa cuando publique.
 */
const API = 'https://honkaiimpact3.fandom.com/api.php'
const HOYOLAB = 'https://bbs-api-os.hoyolab.com/community/post/wapi'
const DAY = 86_400_000
/** Hora del servidor de América (UTC-5): la de la wiki y la de los avisos globales ("12:00, NOV 13"). */
const SERVER = -5

const at = (s: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] ? +m[4] : 0) - SERVER, m[5] ? +m[5] : 0) : NaN
}

/**
 * Las horas de la wiki son las oficiales del servidor ("12:00, NOV 13", "04:00, DEC 24"): exactas. Solo lo que empieza a las 05:00 (UTC-5) es "tras la
 * actualización": esa hora es el fin previsto del mantenimiento, que puede alargarse → "≈".
 */
const afterUpdate = (start: number): 'approx' | undefined => (new Date(start + SERVER * 3_600_000).getUTCHours() === 5 ? 'approx' : undefined)

/** Eventos de pago o de tienda: sus cifras son gasto o precios, no recompensas. */
const PAID = /Battle Pass|Spend Bonuses|Sale|Shop|Time Capsule|Supply|Pack\b|Top-?up|Starry Wishes/i
/** Campañas menores (ocultas por defecto): gasto, tienda, pase y recargas. */
const MINOR = /Sale|Spend Bonuses|Shop|Time Capsule|Battle Pass|Top-?up|Starry Wishes/i
/** Gachapón de traje de la wiki: "Within 10 Princess of Silver Snow and Dreams Outfit Supply drops, you are guaranteed…". */
const OUTFIT_SUPPLY = /Outfit Supply drops|Supply drops may (?:contain|offer)/i
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
    // Gachapón de traje: "{{currency|Ba-Dum! Fiery Wishing Star}}'s outfit {{currency|Wintery Wishes}} returns!" → banner con la valquiria y su traje.
    if (OUTFIT_SUPPLY.test(text)) {
      const o = /\{\{\s*currency\s*\|\s*([^|}]+?)\s*\}\}'s outfit \{\{\s*currency\s*\|\s*([^|}]+?)\s*\}\}/i.exec(text)
      out.push({
        id: `${gameId}:banner:hi3:${p.title}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title: `${title} (Outfit Supply)`,
        description: o ? `⟦d.hi3Outfit⟧ ${o[2]}` : '⟦d.hi3Outfit⟧', image: p.thumbnail?.source,
        start: new Date(start).toISOString(), end: new Date(end).toISOString(),
        items: [], featured: o ? [{ name: o[1], tag: o[2] }] : [], pulls: 0, source: 'api', precision: afterUpdate(start),
      })
      continue
    }
    const r = PAID.test(title) ? { items: [], pulls: 0 } : pageRewards(text)
    out.push({
      id: `${gameId}:event:hi3:${p.title}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'event', title,
      description: field('version') ? `v${field('version')}` : undefined,
      image: p.thumbnail?.source,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: r.items, featured: [], pulls: r.pulls, source: 'api', precision: afterUpdate(start),
      minor: MINOR.test(title) || undefined,
    })
  }
  if (!out.length) throw new Error('honkai3: sin eventos vigentes en la wiki')
  return { events: out, patches: [], codes: [] }
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const clean = (s: string) => s.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Gachapones de la versión desde el aviso oficial "v9.1 A New Page in Time Update Announcement" (HoYoLAB):
 *  - "Welcome to v9.1: A New Page in Time (OCT 22 ~ DEC 24)!" → periodo de la versión; empieza al acabar el mantenimiento global, 05:00 (UTC-5).
 *  - "Herrscher of Time Battlesuit Supply is available! The featured S-rank battlesuit Herrscher of Time is guaranteed within 90 drops…"
 *  - "AstralOp Supply is open for a limited time. You are guaranteed to pull AstralOp Senadina within 60 drops." (v9.0)
 *  - "Equipment Supply is available for a limited time! Recommended for Herrscher of Time: Drive core Key of Mirroring and Let Time Be Your Name stigma
 *    set have increased drop rates…" / "It offers Fenghuang of Vicissitude's recommended equipment Divine Key "Vermillion Liuli" and "Weeping
 *    Philosopher" stigma set at increased drop rates!" (v9.0).
 * Sin cierre en el aviso: `open` (la barra llega al fin de la versión, pero no se muestra como fecha). Los de trajes salen de la wiki (fecha exacta).
 */
export function hi3Supplies(gameId: string, subject: string, html: string, posted: Date): GameEvent[] {
  const text = html.replace(/<\/p>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const per = /\((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\s*~\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\)/i.exec(text)
  if (!per) return []
  const y = posted.getUTCFullYear()
  const m1 = MONTHS.indexOf(per[1].toUpperCase()), m2 = MONTHS.indexOf(per[3].toUpperCase())
  // Si el aviso salió en diciembre y la versión empieza en enero, o la versión cruza el año.
  const y1 = m1 < posted.getUTCMonth() - 6 ? y + 1 : y
  const start = Date.UTC(y1, m1, +per[2], 5 - SERVER)
  const end = Date.UTC(m2 < m1 ? y1 + 1 : y1, m2, +per[4], 4 - SERVER)
  if (!(end > start) || end < Date.now()) return []
  const version = /\bv(\d+\.\d+)/i.exec(subject)?.[1]
  const image = /<img[^>]+src="(https:\/\/upload-os-bbs\.hoyolab\.com\/[^"]+)"/.exec(html)?.[1]
  const out: GameEvent[] = []
  const add = (title: string, featured: Featured[], desc: string) => {
    if (out.some(o => o.title === title)) return
    out.push({ id: `${gameId}:banner:hoyolab:${title}:${new Date(start).toISOString().slice(0, 10)}`, gameId, kind: 'banner', title,
      description: `${desc}${version ? ` · v${version}` : ''}`, image, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured, pulls: 0, source: 'api', official: true, precision: 'approx', open: true })
  }
  for (const m of text.matchAll(/(?:^|[\n.!]\s*|\d\.\s*)([A-Z][^.!\n]{2,60}?) Battlesuit Supply is (?:available|open)/g)) {
    const who = clean(m[1])
    if (!/^(?:the|a|new)\b/i.test(who)) add(`${who} Battlesuit Supply`, [{ name: who, rarity: 5, tag: 'S' }], '⟦d.hi3Supply⟧')
  }
  for (const m of text.matchAll(/AstralOp Supply is (?:available|open)[^.!]*[.!][^.!]*?AstralOp ([A-Z][\w'· -]{1,40}?) within \d+ drops/g))
    add(`AstralOp Supply: ${clean(m[1])}`, [{ name: clean(m[1]), rarity: 5, tag: 'AstralOp' }], '⟦d.hi3Supply⟧')
  // Equipment Supply: el arma y el set de estigmas destacados (sin el tipo: "Drive core", "Divine Key", "stigma set").
  const eq = /Equipment Supply is (?:available|open)[^.!]*[.!]\s*(?:Recommended for [^:]+:\s*|It offers [^']+'s recommended equipment\s*)?(.+?)\s+(?:have|at) increased drop rates/i.exec(text)
  if (eq) {
    const gear = eq[1].split(/\s+and\s+|,\s*/).map(g => clean(g.replace(/^(?:drive core|divine key|weapon|stigmata?|stigma set)\s+/i, '').replace(/\s+(?:stigma set|stigmata|set)$/i, ''))).filter(g => g.length > 2)
    if (gear.length) add(`Equipment Supply: ${gear[0]}`, gear.map(name => ({ name })), '⟦d.hi3Equipment⟧')
  }
  return out
}

/** Último "Update Announcement" de la cuenta oficial de HI3 en HoYoLAB ("Notices", gids=1, type=1): 2 consultas por ciclo (caché de 6 h). */
export async function syncHi3Official(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${HOYOLAB}/getNewsList?gids=1&page_size=10&type=1`))
  if (!res.ok) throw new Error(`hoyolab HI3 → HTTP ${res.status}`)
  const list = ((await res.json())?.data?.list ?? []) as { post: { post_id: string; subject: string; created_at: number } }[]
  const ann = list.map(x => x.post).find(p => /^v\d+\.\d+\b.*Update Announcement$/i.test(p.subject.trim()))
  if (!ann) return { events: [], patches: [], codes: [] }
  const full = await fetch(viaProxy(`${HOYOLAB}/getPostFull?post_id=${ann.post_id}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
  const html = full?.data?.post?.post?.content as string | undefined
  if (!html) return { events: [], patches: [], codes: [] }
  return { events: hi3Supplies(gameId, ann.subject, html, new Date(ann.created_at * 1000)), patches: [], codes: [] }
}
