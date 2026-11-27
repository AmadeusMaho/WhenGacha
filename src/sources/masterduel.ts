import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * Yu-Gi-Oh! Master Duel (Konami; un solo servidor mundial). Fuente revisada el 27 nov 2026: la API pública de masterduelmeta.com (robots.txt solo
 * cierra /cdn-cgi/). Game8 dejó de actualizar el juego en dic 2025 y las noticias de Konami (konami.com) llevan desde octubre sin novedades.
 *  - /api/v1/sets?sort=-release: los packs (Selection, Secret, Bonus, Structure Deck) con su salida exacta en UTC (`release`), su caducidad si la
 *    tiene (`expires`) y su imagen. Son el "gacha" del juego: cada pack nuevo es un banner. Los Selection/Secret Pack se quedan en la tienda (sin fin):
 *    se dibujan hasta el pack siguiente del mismo tipo.
 *  - /api/v1/articles?sort=-date: las noticias. Los eventos ("Tryout Duel", "Festival", "Event", "Login Bonus", "Campaign") traen su duración en el
 *    texto ("Event Duration / Nov 26 ~ Dec 4", "Campaign Duration / Dec 31st 2026") y a veces la hora exacta (`countdownDate`, o escrita en el
 *    texto). Sin hora, la de Konami (13:00 JST el inicio, 12:59 JST el fin; ver `mdmEvent`).
 *  - Iconos: las Gems, de Yugipedia; los billetes de un pack, la imagen del pack.
 *  - Sin códigos de canje con fuente: Konami solo da códigos sueltos en campañas de otras marcas.
 * 2 peticiones por ciclo (caché de 3 h).
 */
const API = 'https://www.masterduelmeta.com/api/v1'
const IMG = 'https://s3.duellinksmeta.com'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

interface MdSet { _id: string; type: string; name: string; release?: string; expires?: string; bannerImage?: string; icon?: string; linkedArticle?: { url?: string; image?: string } }
interface Node { type: string; name?: string; content?: string; attrs?: Record<string, string>; children?: Node[] }
interface Article { _id: string; date: string; title: string; url: string; category: string; image?: string; countdownDate?: string; countdownLabel?: string; parsedMarkdown?: { htmlTree?: Node[] } }

const img = (p?: string) => (!p ? undefined : /^https?:/.test(p) ? p : `${IMG}${p.startsWith('/') ? '' : '/'}${p}`)

/** Texto de la noticia, una línea por párrafo/elemento de lista/título. */
export function mdmText(nodes: Node[] = []): string {
  const block = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'blockquote', 'td', 'th'])
  const walk = (ns: Node[]): string => ns.map(n => (n.type === 'text' ? n.content ?? '' : (block.has(n.name ?? '') ? '\n' : '') + walk(n.children ?? []) + (block.has(n.name ?? '') ? '\n' : ''))).join('')
  return walk(nodes).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

const ZONES: Record<string, number> = { UTC: 0, GMT: 0, JST: 9, EST: -5, EDT: -4, PST: -8, PDT: -7, PT: -8, CET: 1, CEST: 2 }

/**
 * "Nov 26" / "Dec 31st 2026" / "Oct 26 00:00" / "October 6th, 12:59 JST" → ms (UTC). Año: el de la noticia, o el siguiente si la fecha cae muy atrás.
 * Sin hora: `def` (horas UTC). `tz`: zona de la otra mitad del periodo ("Oct 26 00:00 to Nov 1 00:00 EST", la zona va al final).
 */
function when(s: string, posted: number, def: number, tz?: string): { at: number; time: boolean } | null {
  const m = /([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?(?:,?\s*(?:at\s+)?(\d{1,2}):(\d{2})\s*(?:\(?\s*([A-Z]{2,4})\)?)?)?/.exec(s)
  if (!m) return null
  const mo = MONTHS.indexOf(m[1].toLowerCase())
  if (mo < 0) return null
  const y = m[3] ? +m[3] : new Date(posted).getUTCFullYear()
  const zone = ZONES[(m[6] ?? tz ?? 'UTC').toUpperCase()] ?? 0
  const at = (yy: number) => (m[4] ? Date.UTC(yy, mo, +m[2], +m[4], +m[5]) - zone * HOUR : Date.UTC(yy, mo, +m[2], def, def === 3 ? 59 : 0))
  return { at: !m[3] && at(y) < posted - 60 * DAY ? at(y + 1) : at(y), time: !!m[4] }
}

const EVENTY = /tryout|festival|event|login|campaign|duel ?pass|limited time|solo gate|ranked|planet run|duelist cup/i
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !/^(event|duel|tryout|advance|notice|announcement|master|top|decks?)$/.test(w))

/**
 * Un evento de una noticia: su duración ("X Duration" + "Nov 26 ~ Dec 4"), sus recompensas ("1000 Gems") y su imagen. Horas, en este orden:
 *  1. las del propio texto ("Oct 26 00:00 to Nov 1 00:00 EST", "through October 6th, 12:59 JST");
 *  2. la cuenta atrás de la noticia (`countdownDate`, el inicio: "Event Has Started") y, para el fin, la de otra noticia del mismo evento cuyo
 *     contador caiga ese día ("Top Decks! Planet Run", 24 nov 03:59 UTC = fin de "Planet Run Announcement");
 *  3. la hora de Konami: abre a las 13:00 JST (04:00 UTC) y cierra a las 12:59 JST (03:59 UTC). Comprobado el 27 nov 2026 en masterduelmeta: Planet
 *     Run 12 nov 04:00 → 24 nov 03:59 UTC, Duelist Cup hasta el 26 oct 03:59, campaña Nijisanji "through October 6th, 12:59 JST" y la caducidad de los
 *     Selection Pack (8 ene 2027 03:59 UTC).
 */
export function mdmEvent(gameId: string, a: Article, all: Article[] = [], packs: MdSet[] = []): GameEvent | null {
  if (a.category !== 'quick-news' && a.category !== 'news') return null
  if (!EVENTY.test(a.title) || /forbidden|limited list|maintenance|secret pack updates|shop update|top decks/i.test(a.title)) return null
  const lines = mdmText(a.parsedMarkdown?.htmlTree).split('\n')
  const k = lines.findIndex(l => /duration|period|schedule/i.test(l) && l.length < 40)
  const posted = Date.parse(a.date)
  // El periodo: la línea tras "… Duration", o una frase "from … to …" / "through …" del texto.
  const line = (k >= 0 ? lines[k + 1] : undefined) ?? lines.find(l => /\b(?:from|until|through)\b.*\d/.test(l)) ?? ''
  const tz = /\b(UTC|GMT|JST|EST|EDT|PST|PDT|CET|CEST)\b/.exec(line)?.[1]
  const parts = line.replace(/^.*?\b(?:from|will be)\s+/i, '').split(/\s*(?:~|–|\bto\b|\buntil\b|\bthrough\b|\s-\s)\s*/i).filter(x => /[A-Z][a-z]{2}/.test(x))
  const s = parts.length > 1 ? when(parts[0], posted, 4, tz) : null
  const e = when(parts[parts.length - 1] ?? '', posted, 3, tz)
  if (!e) return null
  let start = s?.at ?? null
  let end = e.at
  const cd = a.countdownDate ? Date.parse(a.countdownDate) : NaN
  if (Number.isFinite(cd) && (!start || (!s?.time && Math.abs(cd - start) < 2 * DAY))) start = cd
  // "Post-Maintenance": el fin del mantenimiento es la salida de los packs de ese día.
  if (start && !s?.time && /post-?maintenance|after (?:the )?maintenance/i.test(line)) {
    const rel = packs.map(p => Date.parse(p.release ?? '')).find(t => Math.abs(t - start!) < 18 * HOUR)
    if (rel) start = rel
  }
  if (!e.time) {
    const key = words(a.title)
    const other = all.find(o => o !== a && o.countdownDate && Math.abs(Date.parse(o.countdownDate) - end) < DAY && words(o.title).some(w => key.includes(w)))
    if (other) end = Date.parse(other.countdownDate!)
  }
  // Sin inicio ("Campaign Duration / Dec 31st 2026", publicado tras el mantenimiento): empieza con el fin del mantenimiento de ese día (la salida de
  // los packs, unas horas antes de la noticia); si no hubo, con la noticia.
  if (!start) start = packs.map(p => Date.parse(p.release ?? '')).filter(t => t <= posted && posted - t < 12 * HOUR).sort((x, y) => x - y)[0] ?? posted
  if (end < Date.now() - DAY) return null
  // "Rewards / 1000 Gems / 3x Secret Pack: … Pack Tickets": cada objeto con su nombre entero, su cantidad y su icono.
  const rw = lines.findIndex(l => /^rewards?$/i.test(l))
  const items = (rw >= 0 ? lines.slice(rw + 1, rw + 8) : []).map(l => /^(\d[\d,]*)x?\s+(.+)$/i.exec(l)).filter((m): m is RegExpExecArray => !!m)
    .map(m => ({ name: m[2].trim(), amount: Number(m[1].replace(/,/g, '')), icon: itemIcon(m[2], packs) }))
  const pulls = pullsIn('masterduel', items.map(i => `${/pack tickets?$/i.test(i.name) ? 'Pack Tickets' : i.name} x${i.amount}`)).pulls
  const image = img(a.image) ?? findImg(a.parsedMarkdown?.htmlTree)
  return {
    id: `${gameId}:event:mdm:${a._id}`, gameId, kind: 'event',
    // "Advance Notice: Tryout Duel  - Tryout Duel / N/R Rarity" → "Tryout Duel / N/R Rarity" (el nombre del modo se repite tras el guion).
    title: a.title.replace(/^(?:advance notice|new event|event)\s*:\s*/i, '').replace(/^(.+?)\s+-\s+(?=\1)/i, '').replace(/\s+-\s+/, ' – ').replace(/\s+announcement$/i, '').replace(/\s+/g, ' ').trim(),
    image, start: new Date(start).toISOString(), end: new Date(end).toISOString(), items, pulls, featured: [],
    minor: /login|campaign/i.test(a.title) ? true : undefined, source: 'api',
  }
}

/** Gems: el icono de Yugipedia ("Gem-Master Duel.png"). Billetes de un pack ("Secret Pack: Tales of the Witch Pack Tickets"): la imagen del pack. */
const GEM = 'https://img.yugipedia.com/5/5d/Gem-Master_Duel.png'
function itemIcon(name: string, packs: MdSet[]): string | undefined {
  if (/^gems?$/i.test(name.trim())) return GEM
  const pack = /^(?:(?:selection|secret|bonus) pack:\s*)?(.+?)\s+(?:selection |secret )?pack tickets?$/i.exec(name.trim())?.[1]?.toLowerCase()
  const p = pack ? packs.find(x => x.name.toLowerCase() === pack) : undefined
  return p ? img(p.bannerImage ?? p.icon) : /pack tickets?$/i.test(name) ? img('/mdm_img/content/packs/master-pack.webp') : undefined
}

function findImg(nodes: Node[] = []): string | undefined {
  for (const n of nodes) {
    if (n.name === 'img' && n.attrs?.src) return img(n.attrs.src)
    const c = findImg(n.children)
    if (c) return c
  }
  return undefined
}

/** Packs nuevos como banners: de su salida a su caducidad o, si no tiene, al pack siguiente del mismo tipo (abierto). */
export function mdmSets(gameId: string, sets: MdSet[]): GameEvent[] {
  const now = Date.now()
  const dated = sets.filter(s => s.release && /selection|secret|bonus|structure/i.test(s.type)).sort((a, b) => Date.parse(a.release!) - Date.parse(b.release!))
  return dated.flatMap((s, i) => {
    const start = Date.parse(s.release!)
    const next = dated.slice(i + 1).find(x => x.type === s.type && Date.parse(x.release!) > start + HOUR)
    const end = s.expires ? Date.parse(s.expires) : next ? Date.parse(next.release!) : start + 30 * DAY
    if (end < now - DAY || start < now - 60 * DAY || start > now + 30 * DAY) return []
    return [{
      id: `${gameId}:banner:mdm:${s._id}`, gameId, kind: 'banner' as const, title: `${s.type}: ${s.name}`, image: img(s.bannerImage ?? s.linkedArticle?.image ?? s.icon),
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), items: [], featured: [], pulls: 0, source: 'api' as const,
      open: !s.expires && !next ? true : undefined,
      // Los Secret Pack salen de 3 en 3 con cada Selection Pack: secundarios.
      minor: /secret|structure/i.test(s.type) ? true : undefined,
    }]
  })
}

export async function syncMasterDuel(gameId: string): Promise<GameSync> {
  const [s, a] = await Promise.allSettled([
    fetch(viaProxy(`${API}/sets?sort=-release&limit=20`)).then(r => { if (!r.ok) throw new Error(`mdm sets → HTTP ${r.status}`); return r.json() as Promise<MdSet[]> }),
    fetch(viaProxy(`${API}/articles?sort=-date&limit=30`)).then(r => { if (!r.ok) throw new Error(`mdm articles → HTTP ${r.status}`); return r.json() as Promise<Article[]> }),
  ])
  if (s.status === 'rejected' && a.status === 'rejected') throw s.reason
  const events = [
    ...(s.status === 'fulfilled' ? mdmSets(gameId, s.value) : []),
    ...(a.status === 'fulfilled' ? a.value.map(x => mdmEvent(gameId, x, a.value, s.status === 'fulfilled' ? s.value : [])).filter((e): e is GameEvent => !!e) : []),
  ]
  return { events, patches: [], codes: [] }
}
