import type { Featured, GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'
import { viaProxy } from '../net'
import { syncPocketGamerCodes } from './codes'
import { pullsIn } from './pulls'
import { fileKey, fileUrls, wikitext } from './wikifiles'

/**
 * Path to Nowhere (Aisno Games; servidor global). Fuentes revisadas el 13 nov 2026:
 *  - Wiki de wiki.gg (pathtonowhere.wiki.gg, "DisPedia"; la de Fandom dejó de actualizar los eventos en 2024). Su portada se arma con la
 *    plantilla "MP/Middle", que el equipo de la wiki cambia en cada parche:
 *    - "Current Events" y "Current Arrests": `{{MPEvent|The Dying Echo|November 3rd, 14:00 - December 8th, 13:59 (Server Time)|Story}}` con
 *      hora exacta; el tercer campo es el tipo (Story/Event = evento, SO = Surveillance Order, el pase; EN/ML = modos de desafío;
 *      LA = Limited Arrest y EA = Event Arrest, los banners). Su imagen es "<nombre> Banner.png".
 *    - "New Sinners": `{{CharacterPortal|Requiem|S}}…`. Los Event Arrests traen una S nueva y una A nueva (página "Arrests/Info"); los Limited
 *      Arrests, una S limitada. La wiki no dice cuál es cuál: la S con "·" en el nombre (las variantes limitadas, como "Necresta·Hella") va al
 *      limitado y el resto al de evento. Retratos: "<nombre> Skin1 Icon.png".
 *    "Server Time" del servidor global de América: UTC-7 (la misma portada lo dice).
 *  - Recompensas de los eventos: SIN fuente con cifras (la wiki no tiene páginas de los eventos nuevos). Quedan sin tiradas.
 *  - Códigos: PocketGamer (`syncPocketGamerCodes`); su lista no detalla recompensas.
 * 2 consultas a la wiki por ciclo (plantilla e imágenes, caché de 12 h) y 1 página de PocketGamer.
 */
const HOST = 'pathtonowhere.wiki.gg'
const DAY = 86_400_000
const TZ = -7
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "November 3rd, 14:00" (año: el más cercano a `now`) → ms en UTC. */
function when(s: string, now: number, after?: number): number | null {
  const m = /([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(?:(\d{4}),?\s*)?(\d{1,2}):(\d{2})/.exec(s)
  const mo = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1
  if (!m || mo < 0) return null
  const at = (y: number) => Date.UTC(y, mo, +m[2], +m[4] - TZ, +m[5])
  if (m[3]) return at(+m[3])
  const y0 = new Date(after ?? now).getUTCFullYear()
  // Fin sin año: el primero posterior al inicio. Inicio sin año: el más cercano a hoy.
  if (after !== undefined) return [y0, y0 + 1].map(at).find(t => t > after) ?? null
  return [y0 - 1, y0, y0 + 1].map(at).reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a))
}

export function ptnRange(s: string, now = Date.now()): [number, number] | null {
  const [a, b] = s.split(/\s+[-–~]\s+/)
  const start = a ? when(a, now) : null
  const end = start !== null && b ? when(b, now, start) : null
  return start !== null && end !== null ? [start, end + 59_000] : null
}

const KIND: Record<string, Kind> = { LA: 'banner', EA: 'banner', EN: 'challenge', ML: 'challenge' }
const DESC: Record<string, string> = { LA: '⟦d.ptnLimited⟧', EA: '⟦d.ptnEventArrest⟧', SO: '⟦d.ptnPass⟧', Story: '⟦d.ptnStory⟧' }

export async function syncPtnWiki(gameId: string): Promise<GameSync> {
  const text = await wikitext(HOST, 'Template:MP/Middle')
  const now = Date.now()
  const items = [...text.matchAll(/\{\{MPEvent\|([^|}]+)\|([^|}]+)(?:\|([^|}=]+))?((?:\|[a-z]+=[^|}]*)*)\}\}/g)]
    .map(m => ({ name: m[1].trim(), date: m[2].trim(), type: (m[3] ?? 'Event').trim(), image: /\|image=([^|}]+)/.exec(m[4] ?? '')?.[1]?.trim() }))
  if (!items.length) throw new Error('ptn: no se encontraron eventos en la portada de la wiki')
  // Sinners nuevos de la versión: "{{CharacterPortal|Requiem|S}}" (solo en la columna "New Sinners", antes de "New Attires").
  const newRow = /\{\{CharacterPortal[\s\S]*?(?=\n\|\s*\{\{Item|\n\|\})/.exec(text.slice(text.indexOf('New Sinners')))?.[0] ?? ''
  const sinners = [...newRow.matchAll(/\{\{CharacterPortal\|([^|}]+)\|([SAB])/g)].map(m => ({ name: m[1].trim(), rank: m[2] }))
  const S = sinners.filter(s => s.rank === 'S'), A = sinners.filter(s => s.rank === 'A')
  const limited = S.filter(s => s.name.includes('·'))
  const featuredOf = (type: string): Featured[] => {
    const list = type === 'LA' ? (limited.length ? limited : S) : type === 'EA' ? [...S.filter(s => !limited.includes(s)), ...A] : []
    return list.map(s => ({ name: s.name, rarity: s.rank === 'S' ? 5 : 4 }))
  }
  const files = [...items.map(i => i.image ?? `${i.name} Banner.png`), ...sinners.map(s => `${s.name} Skin1 Icon.png`)]
  const urls = await fileUrls(HOST, files, 480).catch(() => new Map<string, string>())
  const events: GameEvent[] = []
  for (const it of items) {
    const r = ptnRange(it.date, now)
    if (!r || r[1] < now - 3 * DAY || r[1] <= r[0]) continue
    const kind = KIND[it.type] ?? 'event'
    events.push({
      id: `${gameId}:${kind}:wiki:${it.name}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind, title: it.name,
      description: DESC[it.type], image: urls.get(fileKey(it.image ?? `${it.name} Banner.png`)),
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items: [],
      featured: featuredOf(it.type).map(f => ({ ...f, icon: urls.get(fileKey(`${f.name} Skin1 Icon.png`)) })),
      pulls: 0, minor: it.type === 'SO' ? true : undefined, source: 'api',
    })
  }
  return { events, patches: [], codes: [] }
}

/**
 * Avisos oficiales de la web (ptn.aisnogames.com): su página pide la lista a `/api/news?offset=0&limit=N&locale=en-EN` y cada aviso es
 * `/en-EN/news/<id>` (Next.js; el texto va en `__NEXT_DATA__`, `item.content_html`). Sale uno grande por versión ("[The Dying Echo] 4th Anniversary
 * Celebration Event") con todos sus eventos numerados: "4. [Suspect Pursuit] Sinner Exclusive Trial Event / ■ Event Duration: November 3rd, 14:00 -
 * December 8th, 13:59 (Server Time)". Los arrestos no van ahí (los da la wiki y, con canal, Discord). Hora del servidor: UTC-7.
 */
const WEB = 'https://ptn.aisnogames.com'
const MINOR = /attire|top-?up|offer|drop rate|exchange|pack|login milestone/i

export function ptnNotice(gameId: string, html: string, now = Date.now()): GameEvent[] {
  const lines = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'")
    .split('\n').map(l => l.trim()).filter(Boolean)
  const heads = lines.map((l, i) => (/^\d{1,2}\.\s+\S/.test(l) ? i : -1)).filter(i => i >= 0)
  const out: GameEvent[] = []
  heads.forEach((h, k) => {
    const block = lines.slice(h, heads[k + 1] ?? lines.length)
    const head = block[0].replace(/^\d{1,2}\.\s+/, '')
    const title = /\[([^\]]{2,60})\]/.exec(head)?.[1]?.trim() ?? head
    // "After the maintenance on November 3rd - December 8th, 13:59": el mantenimiento acaba a las 14:00 (hora del servidor), como todos sus parches.
    const when = block.slice(1).map(l => /^■?\s*(?:Event Duration|Available From|Available Time|Duration)\s*:\s*(.+)$/i.exec(l)?.[1])
      .find(w => w && /\d{1,2}:\d{2}/.test(w))?.replace(/After the maintenance on ([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?)/i, '$1, 14:00')
    const r = when ? ptnRange(when, now) : null
    if (!r || r[1] < now - 3 * DAY || r[1] <= r[0]) return
    const desc = block.find(l => /^■?\s*Event Description\s*:/i.test(l))?.replace(/^■?\s*Event Description\s*:\s*/i, '')
    const rewards = pullsIn('ptn', block.slice(1))
    out.push({
      id: `${gameId}:event:web:${title}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind: 'event', title, description: desc,
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items: rewards.items, featured: [], pulls: rewards.pulls,
      minor: MINOR.test(head) ? true : undefined, source: 'api', official: true,
    })
  })
  return out
}

export async function syncPtnNews(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${WEB}/api/news?offset=0&limit=6&locale=en-EN`))
  if (!res.ok) throw new Error(`aisno PtN → HTTP ${res.status}`)
  const list = ((await res.json())?.data?.data ?? []) as { id: number; title: string; publish_time: number }[]
  const recent = list.filter(n => Date.now() - n.publish_time < 45 * DAY).slice(0, 2)
  const events: GameEvent[] = []
  for (const n of recent) {
    const html = await fetch(viaProxy(`${WEB}/en-EN/news/${n.id}`)).then(r => (r.ok ? r.text() : '')).catch(() => '')
    const raw = /__NEXT_DATA__" type="application\/json">([^<]+)/.exec(html)?.[1]
    const item = raw ? JSON.parse(raw)?.props?.pageProps?.item : null
    if (item?.content_html) events.push(...ptnNotice(gameId, item.content_html))
  }
  if (!list.length) throw new Error('aisno PtN: sin avisos')
  return { events, patches: [], codes: [] }
}

/** Wiki (arrestos, imágenes, retratos) + avisos oficiales de la web (horas exactas y todos los eventos del parche, mandan) + códigos. */
export async function syncPtn(gameId: string): Promise<GameSync> {
  const [w, n, c] = await Promise.allSettled([syncPtnWiki(gameId), syncPtnNews(gameId), syncPocketGamerCodes('path-to-nowhere')])
  if (w.status === 'rejected' && n.status === 'rejected' && c.status === 'rejected') throw w.reason
  for (const [what, r] of [['wiki', w], ['avisos', n], ['códigos', c]] as const) if (r.status === 'rejected') console.warn(`[ptn] ${what}:`, (r.reason as Error)?.message)
  const wiki = w.status === 'fulfilled' ? w.value.events : []
  const web = n.status === 'fulfilled' ? n.value.events : []
  // El mismo evento en la wiki y en el aviso ("The Dying Echo"): manda el aviso en horas y texto; la wiki aporta la imagen.
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const merged = web.map(e => { const x = wiki.find(v => v.kind === e.kind && key(v.title) === key(e.title)); return x ? { ...e, image: x.image, description: e.description ?? x.description } : e })
  const events = [...merged, ...wiki.filter(v => !web.some(e => e.kind === v.kind && key(v.title) === key(e.title)))]
  return { events, patches: [], codes: c.status === 'fulfilled' ? c.value : [] }
}
