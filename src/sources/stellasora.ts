import { viaProxy } from '../net'
import type { Featured, GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { htmlText, parseNotices, type Message } from './discord'
import { md5 } from './md5'

/**
 * Stella Sora (servidor Global): banners ("Current banners") de la portada de su wiki comunitaria (stellasora.miraheze.org).
 * Cada banner trae su inicio y fin como instantes ISO con zona (UTC-7), es decir, hora exacta. La portada de Miraheze se
 * pide por `/wiki/` (el robots.txt de Miraheze solo bloquea `/w/`, donde vive su API). Los eventos no están aquí.
 */
const PAGE = 'https://stellasora.miraheze.org/wiki/Stella_Sora_Wiki'
const DAY = 86_400_000

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

export async function syncStellaSora(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(PAGE))
  if (!res.ok) throw new Error(`stellasora wiki → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const from = Date.now() - 3 * DAY

  const out: GameEvent[] = []
  const seen = new Set<string>()
  doc.querySelectorAll('.stellasora-home-banner').forEach(card => {
    const name = text(card.querySelector('.stellasora-home-banner__name'))
    const timer = card.querySelector('.stellasora-countdown')
    const s = timer?.getAttribute('data-start-time'), e = timer?.getAttribute('data-end-time')
    if (!name || !s || !e || isNaN(+new Date(s)) || isNaN(+new Date(e))) return
    const start = new Date(s).toISOString(), end = new Date(e).toISOString()
    if (+new Date(end) < from || +new Date(end) <= +new Date(start)) return
    const id = `${gameId}:banner:${name}:${start}`
    if (seen.has(id)) return
    seen.add(id)
    const src = card.querySelector('img')?.getAttribute('src')
    out.push({
      id, gameId, kind: 'banner', title: name,
      image: src ? (src.startsWith('//') ? `https:${src}` : src) : undefined,
      start, end, items: [], featured: [{ name }], pulls: 0, source: 'api',
    })
  })
  if (!out.length) throw new Error('stellasora wiki: no se encontraron banners')
  return { events: out, patches: [], codes: [] }
}

/**
 * Avisos oficiales de la web global (stellasora.global/news; la página pide la lista y cada aviso a `/api/resource/news?index=1&size=…&type=` y
 * `/api/resource/news/detail?id=…`, sin claves). Las notas de cada versión ("Version 2.1 Preview", "11/12 Version 2.1 Update Maintenance") traen
 * todos los eventos con hora exacta en UTC-7 ("Period: Nov. 26, 2026 21:00 – Dec. 03, 2026 19:59 (UTC-7)"; "after maintenance" = fin del
 * mantenimiento del aviso). Discord solo reenvía algunos tuits (2 de ~12 en la 2.1, 12 nov 2026). Se leen con el lector de avisos (`parseNotices`).
 * 1 lista + hasta 4 avisos por ciclo (caché de 3 h en el proxy).
 */
const WEB = 'https://stellasora.global/api/resource/news'
export async function syncStellaSoraNews(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${WEB}?index=1&size=12&type=`))
  if (!res.ok) throw new Error(`stellasora.global → HTTP ${res.status}`)
  const list = ((await res.json())?.data?.rows ?? []) as { id: number; title: string; type: string; publishTime: number }[]
  // Notas de versión, mantenimientos y avisos de eventos/reclutamientos recientes (no las noticias de concursos ni las FAQ).
  const wanted = list.filter(n => Date.now() - n.publishTime < 40 * DAY && /version|maintenance|recruitment|event|rerun/i.test(n.title) && !/contest|faq/i.test(n.title))
    .sort((a, b) => b.publishTime - a.publishTime).slice(0, 6)
  const messages: Message[] = []
  const sections: Section[] = []
  const pools = new Map<string, Pool>()
  for (const n of wanted) {
    const d = await fetch(viaProxy(`${WEB}/detail?id=${n.id}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    const html: string = d?.data?.news?.content ?? ''
    if (html) { sections.push(...ssSections(html)); for (const [k, v] of recruitPools(html)) if (!pools.has(k)) pools.set(k, v) }
    if (html) messages.push({ id: String(n.id), content: `${n.title}\n${htmlText(html.replace(/&ndash;|&mdash;/g, '–').replace(/&times;/g, '×').replace(/&ge;/g, '≥'))}`, timestamp: new Date(n.publishTime).toISOString() })
  }
  if (!messages.length && !list.length) throw new Error('stellasora.global: sin avisos')
  const s = parseNotices(gameId, messages)
  const out: GameEvent[] = []
  for (const e0 of s.events) {
    // Cabeceras y sub-apartados que no son eventos: "Recruitment Period ✦", "Maintenance Period ✦", "Zone 2 – Enemy Vulnerability…",
    // la tienda del evento y cada pack de "Trekker's Picks".
    if (/✦|^zone \d|maintenance|bundle|\bset$|event shop/i.test(e0.title)) continue
    // "Limited Event: Map the Uncharted…" y "Map the Uncharted…" son el mismo.
    let e: GameEvent = { ...e0, title: e0.title.replace(/^Limited Event:\s*/i, '').trim() }
    // "Limited ★5 Trekker, Leafia" / "Limited ★5 Runic Disc, Beneath Billowing Sails": reclutamientos limitados.
    const rec = /^Limited ★\d\s+(Trekker|Runic Disc),\s*(.+)$/i.exec(e.title)
    if (rec) e = { ...e, kind: 'banner', title: rec[2].trim(), featured: [{ name: rec[2].trim() }] }
    // Aspectos de la tienda y la historia del evento (mismo periodo que el evento): menores.
    if (/appearance|style gallery|^limited event story/i.test(e.title)) e = { ...e, minor: true }
    if (out.some(o => o.kind === e.kind && o.title.toLowerCase() === e.title.toLowerCase() && o.start === e.start)) continue
    out.push(e)
  }
  last = { sections, pools }
  return { ...s, events: withSections(out, sections, pools) }
}

/* ---------- arte, recompensas y destacados de los avisos oficiales (14 nov 2026) ---------- */

const WIKI_IMG = 'https://static.wikitide.net/stellasorawiki'
/** Archivo de la wiki (stellasora.miraheze.org) en su ruta fija de MediaWiki (md5 del nombre): no se consulta la wiki (su robots.txt cierra /w/). */
const wikiFile = (file: string) => { const f = file.replace(/\s+/g, '_'); const h = md5(f); return `${WIKI_IMG}/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(f)}` }
/** Retrato: Trekkers "Leafia.png"; discos "Disc_icon_Beneath_Billowing_Sails.png" (comprobados el 14 nov 2026: Leafia, Ridge, Amber, Wraith y el disco). */
export const ssPortrait = (name: string, disc: boolean) => wikiFile(disc ? `Disc_icon_${name}.png` : `${name}.png`)

/**
 * Iconos de objetos de la wiki: sin regla fija ("Item_2.png" para Stellanite Dust, "Icon_dorra.png", "Defender-medal.png"), así que solo los
 * comprobados uno a uno en su página (14 nov 2026). Se aplican en index.ts (ITEM_ICONS).
 */
export const SS_ICONS = new Map<string, string>(Object.entries({
  'stellanite dust': '3/38/Item_2.png', 'cerulean ticket': '1/16/Item_502.png', 'drop of purity': '9/92/Item_Drop_of_Purity.png',
  'sprout ticket': '8/8c/Item_Sprout_Ticket.png', 'star emblem polisher': '6/65/Icon_Star_Emblem_Polisher.png', 'dorra': '3/35/Icon_dorra.png',
  "defender's medal": 'f/f7/Defender-medal.png', 'novice trekker promotion box': '7/75/Icon_Novice_Trekker_Promotion_Box.png',
  'chess piece of skill': '3/3b/Icon_chess_piece_of_skill.png',
}).map(([k, v]) => [k, `${WIKI_IMG}/${v}`]))

interface Section { title: string; image?: string; text: string }
interface Pool { featured: Featured[]; disc: boolean }

/** Apartados "■ Título" de un aviso, con la imagen que va debajo de su periodo y su texto. */
function ssSections(html: string): Section[] {
  const lines = html.replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi, '\n@@IMG $1\n').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&ndash;|&mdash;/g, '–').replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'")
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const out: Section[] = []
  let cur: Section | undefined
  for (const l of lines) {
    if (l.startsWith('■')) { cur = { title: l.slice(1).trim(), text: '' }; out.push(cur); continue }
    if (/^✦/.test(l)) { cur = undefined; continue }
    if (!cur) continue
    if (l.startsWith('@@IMG ')) { cur.image ??= l.slice(6).trim(); continue }
    cur.text += `${l}\n`
  }
  return out
}

/** "Limited recruitment event: Boundless Journey, Endless Romance … ★5 Trekker Leafia is boosted … ★4 Trekkers, Ridge and Amber" → destacados por banner. */
function recruitPools(html: string): Map<string, Pool> {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const out = new Map<string, Pool>()
  for (const m of t.matchAll(/Limited recruitment event:\s*(.+?)\s+will begin soon!(.+?)(?=Limited recruitment event:|$)/gi)) {
    const body = m[2]
    const disc = /★5 Disc/i.test(body)
    // "★5 Disc [Beneath Billowing Sails]" / "★5 Disc, [Stellar Destination]" / "★5 Trekker Leafia is boosted".
    const five = (disc ? /★5 Disc,?\s*\[([^\]]+)\]/i : /★5 Trekker ([A-Z][\w' ]+?) is boosted/i).exec(body)?.[1]?.trim()
    const fours = /★4 (?:Trekkers|Discs),\s*(.+?),?\s+(?:is|are) also boosted/i.exec(body)?.[1]?.split(/,\s*|\s+and\s+/).map(x => x.replace(/[[\]]/g, '').trim()).filter(Boolean) ?? []
    if (!five) continue
    out.set(m[1].trim().toLowerCase(), { disc, featured: [{ name: five, rarity: 5, icon: ssPortrait(five, disc) }, ...fours.map(n => ({ name: n, rarity: 4, icon: ssPortrait(n, disc) }))] })
  }
  return out
}

/** Recompensas que el texto nombra ("complete missions to get Compass, which can be used… to redeem ★5 Runic Disc: Emergency Evacuation, Stellanite Dust, …"). */
function sectionRewards(text: string): RewardItem[] {
  // Cada frase con "get/obtain/redeem…" ("…will grant extra rewards! … get Dorra, Chess Piece of Skill, and more!"): la primera que nombre objetos.
  for (const m of text.replace(/\n/g, ' ').matchAll(/(?:redeem|get|obtain|grant(?:s)?|receive)\s+(.+?)(?:,?\s+and more)?[!.](?:\s|$)/gi)) {
    const names = m[1].split(/,\s*|\s+and\s+/).map(x => x.trim().replace(/^★\d\s+Runic Disc:\s*/i, '').replace(/^(?:the|a|an)\s+/i, ''))
      .filter(x => x.length > 2 && x.split(' ').length <= 5 && /^[A-Z]/.test(x) && !/^Honor Title|^Trekker|tier-up materials|^Extra|^Vigor/i.test(x))
    if (names.length) return names.slice(0, 8).map(name => ({ name, amount: 0 }))
  }
  return []
}

/**
 * Completa lo que viene del lector de avisos (y de Discord) con cada apartado del aviso oficial: su imagen y las recompensas que nombra.
 * Banners: los destacados reales del aviso de reclutamiento (★5 y ★4, con retrato). La portada de la wiki ponía el nombre del banner
 * ("Stardust Rising in the Light") como si fuera el personaje.
 */
function withSections(events: GameEvent[], sections: Section[], pools: Map<string, Pool>): GameEvent[] {
  // "Limited Event: X" es el evento; "Limited Event Story: X" (su historia, sin recompensas) no se confunde con él.
  const norm = (x: string) => x.toLowerCase().replace(/^limited event:\s*/i, '').replace(/^limited ★\d\s+(?:trekker|runic disc),\s*/i, '').replace(/[^a-z0-9]+/g, '')
  const bySec = new Map<string, Section>()
  for (const x of sections) if (!/^limited event story/i.test(x.title) && !bySec.has(norm(x.title))) bySec.set(norm(x.title), x)
  const discs = new Set([...pools.values()].filter(p => p.disc).map(p => p.featured[0].name.toLowerCase()))
  for (const x of sections) { const d = /^Limited ★\d\s+Runic Disc,\s*(.+)$/i.exec(x.title)?.[1]; if (d) discs.add(d.trim().toLowerCase()) }
  const done = events.map(e => {
    const sec = bySec.get(norm(e.title)) ?? (e.kind === 'banner' ? bySec.get(norm(e.featured[0]?.name ?? '')) : undefined)
    let out: GameEvent = { ...e }
    if (sec?.image && !out.image) out.image = sec.image
    if (sec && !out.items.length && e.kind !== 'banner') out.items = sectionRewards(sec.text)
    if (e.kind === 'banner') {
      const pool = pools.get(e.title.toLowerCase()) ?? [...pools.values()].find(p => e.featured.some(f => f.name.toLowerCase() === p.featured[0].name.toLowerCase()))
      if (pool) out = { ...out, featured: pool.featured }
      else out.featured = out.featured.map(f => (f.icon ? f : { ...f, icon: ssPortrait(f.name, discs.has(f.name.toLowerCase())) }))
    }
    return out
  })
  // El mismo reclutamiento con dos nombres: el del banner (aviso, wiki) y el del personaje o disco (tuit "Limited ★5 Runic Disc, …").
  // Se queda el que lleva el nombre del banner, con la imagen de cualquiera; y sobra un "evento" que se llama como un banner del mismo periodo.
  const near = (a: GameEvent, b: GameEvent) => Math.abs(Date.parse(a.start) - Date.parse(b.start)) <= DAY
  const banners = done.filter(e => e.kind === 'banner')
  const keep = (e: GameEvent) => {
    if (e.kind !== 'banner') return !banners.some(b => near(b, e) && b.title.toLowerCase() === e.title.toLowerCase())
    const twin = banners.find(b => b !== e && near(b, e) && b.featured[0] && b.featured[0].name === e.featured[0]?.name)
    return !twin || (pools.has(e.title.toLowerCase()) ? true : !pools.has(twin.title.toLowerCase()) && banners.indexOf(e) < banners.indexOf(twin))
  }
  return done.filter(keep).map(e => {
    if (e.kind !== 'banner' || e.image) return e
    const twin = banners.find(b => b !== e && near(b, e) && b.featured[0]?.name === e.featured[0]?.name && b.image)
    return twin ? { ...e, image: twin.image } : e
  })
}

/** Lo leído en el último ciclo (el recolector va de juego en juego, uno a la vez). */
let last: { sections: Section[]; pools: Map<string, Pool> } = { sections: [], pools: new Map() }

/**
 * Último paso de Stella Sora (index.ts), sobre lo unido de Discord, la web y la wiki: los banners de la portada de la wiki y los tuits también
 * reciben los destacados reales, sus retratos y el arte/recompensas de su apartado en el aviso oficial.
 */
export function ssPolish(s: GameSync): GameSync { return { ...s, events: withSections(s.events, last.sections, last.pools) } }
