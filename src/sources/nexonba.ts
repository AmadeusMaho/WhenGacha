import { viaProxy } from '../net'
import type { GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'
import { summarize } from './summary'

/**
 * Blue Archive (Global): el foro oficial de Nexon (forum.nexon.com/bluearchive-en), por la API pública que usa su propia web. Solo desde la tarea del
 * PC (OFFICIAL_SITES=1; decisión del dueño del 25 nov 2026, aunque los Términos de Nexon prohíben los robots: consulta pequeña). Aporta lo que la wiki
 * no trae y antes solo daba gachafocus:
 *  - Tablón "Events" (3218): campañas x2/x3 («November Update Triple Rewards Campaigns»: una tabla con cada campaña y su horario exacto, a veces
 *    varios), eventos de login con sus Pyroxenes («Login Event: 5-Year Anniversary Login Bonus!», «Pyroxene x200» por día), eventos web y regalos.
 *    «🔹 Event Period - 11/17 (Tue) 2:00 AM – 11/30 (Mon) 6:59 PM (UTC)»; «After Maintenance» = fin real del mantenimiento de ese día.
 *  - Tablón "Updates" (3217): avisos de mantenimiento («1. Date: 11/10 (Tue) 2:00 AM – 7:00 AM 9:00 AM (UTC)»: al alargarlo tachan la hora y añaden
 *    la nueva, así que vale la última antes de "(UTC)").
 * Los avisos de reclutamiento no: los banners ya llegan de la wiki con hora exacta. Por ciclo: 2 listas (caché 3 h) y los avisos de las últimas 5
 * semanas (como mucho 16, caché 24 h: solo se piden los nuevos).
 */
const API = 'https://forum.nexon.com/api/v1'
const ALIAS = 'bluearchive-en'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (t: number) => new Date(t).toISOString()
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

interface Thread { threadId: string; title: string; createDate: number; content?: string }

const lines = (html: string) => html.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\n@@IMG $1\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|td|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#39;|&rsquo;/g, "'")
  .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean)

/** "7:00 PM" → [19, 0]; "6:00" sin AM/PM (así va a veces el fin del mantenimiento) → [6, 0]. */
function hm(s: string): [number, number] | null {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(s)
  if (!m) return null
  let h = +m[1] % 12
  if (/PM/i.test(m[3] ?? '')) h += 12
  if (!m[3]) h = +m[1]
  return [h, +m[2]]
}

/** "11/9 (Mon)" en el año del aviso (si el mes queda muy atrás, el siguiente: avisos de diciembre con fechas de enero). */
function dayOf(md: string, ref: number): number {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(md)!
  const y = new Date(ref).getUTCFullYear()
  const t = Date.UTC(y, +m[1] - 1, +m[2])
  return t < ref - 200 * DAY ? Date.UTC(y + 1, +m[1] - 1, +m[2]) : t
}

/** Fin real de cada mantenimiento (día UTC → ms). */
export function baMaintenance(threads: Thread[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of threads) {
    if (!/maintenance notice/i.test(t.title) || !t.content) continue
    for (const l of lines(t.content)) {
      const m = /Date:\s*(\d{1,2}\/\d{1,2})\s*\([A-Za-z]{3}\)\s*(\d{1,2}:\d{2}\s*[AP]M)\s*[–~-]\s*(.+?)\(UTC\)/i.exec(l)
      if (!m) continue
      const day = dayOf(m[1], t.createDate * 1000)
      const start = hm(m[2]), times = [...m[3].matchAll(/\d{1,2}:\d{2}\s*(?:AM|PM)?/gi)]
      const last = times.length ? hm(times[times.length - 1][0]) : null
      if (!start || !last) continue
      let end = day + (last[0] * 60 + last[1]) * 60_000
      if (end <= day + (start[0] * 60 + start[1]) * 60_000) end += DAY
      out.set(iso(day).slice(0, 10), end)
      break
    }
  }
  return out
}

const RANGE = /(\d{1,2}\/\d{1,2})\s*\([A-Za-z]{3}\)\s*(After Maintenance|\d{1,2}:\d{2}\s*[AP]M)\s*[–~-]\s*(\d{1,2}\/\d{1,2})\s*\([A-Za-z]{3}\)\s*(\d{1,2}:\d{2}\s*[AP]M)\s*\(UTC\)/i

/** Eventos de un aviso del tablón "Events". */
export function baForumEvents(gameId: string, t: Thread, maint: Map<string, number>, banner?: string): GameEvent[] {
  if (!t.content) return []
  const ls = lines(t.content)
  const ref = t.createDate * 1000
  // Título sin "(Updated on 11/13)", "Login Event:", "[Website Event]"; el tipo va en la descripción.
  const base = t.title.replace(/^\(updated[^)]*\)\s*/i, '').replace(/^\[([^\]]+)\]\s*/, '').replace(/^(?:login|webview|web) event\s*:\s*/i, '').replace(/[!！]+$/, '').trim()
  const image = ls.map(l => /^@@IMG (.+)$/.exec(l)?.[1]).find(u => u && u !== banner)
  const text = ls.filter(l => !l.startsWith('@@IMG'))
  const campaign = /campaign/i.test(t.title) && text.filter(l => RANGE.test(l)).length > 1
  const out: GameEvent[] = []
  let name = base
  for (const [i, l] of text.entries()) {
    const r = RANGE.exec(l)
    if (!r) continue
    // Tabla de campañas: el nombre es la línea anterior que no sea un número ni otro horario ("Bounty / Scrimmage Triple Rewards").
    if (campaign) for (let j = i - 1; j >= 0; j--) {
      if (RANGE.test(text[j])) { if (j === i - 1) continue; else break }
      if (/^\d{1,2}$/.test(text[j]) || /^(no\.?|campaign (details|schedule))$/i.test(text[j])) continue
      name = text[j]
      break
    }
    const sd = dayOf(r[1], ref)
    let start: number | undefined
    let exact = true
    if (/after maintenance/i.test(r[2])) {
      start = maint.get(iso(sd).slice(0, 10))
      if (start === undefined) { start = sd + 2 * HOUR; exact = false }
    } else { const h = hm(r[2])!; start = sd + (h[0] * 60 + h[1]) * 60_000 }
    const eh = hm(r[4])!
    let end = dayOf(r[3], ref) + (eh[0] * 60 + eh[1]) * 60_000 + (eh[1] === 59 ? 59_999 : 0)
    if (end <= start) end = Date.UTC(new Date(end).getUTCFullYear() + 1, new Date(end).getUTCMonth(), new Date(end).getUTCDate(), eh[0], eh[1], eh[1] === 59 ? 59 : 0)
    const kind: Kind = 'event'
    const id = `${gameId}:${kind}:nx:${key(name)}:${iso(start).slice(0, 10)}`
    if (out.some(e => e.id === id)) continue
    const sec = campaign ? [] : text.slice(i)
    const found0 = pullsIn('bluearchive', sec)
    // Títulos de perfil ("5-Year Anniversary Title" llegaba cortado como "Year Anniversary Title"): no son recompensas que interese listar.
    const found = { ...found0, items: found0.items.filter(x => !/\btitle$/i.test(x.name)) }
    out.push({
      id, gameId, kind, title: campaign ? name : base, image, start: iso(start), end: iso(end),
      items: found.items, pulls: found.pulls, featured: [], official: true, source: 'api', ...(exact ? {} : { precision: 'approx' as const }),
      description: campaign ? '⟦d.baCampaign⟧' : summarize(text.slice(0, i).filter(x => !/^📣|schale/i.test(x)), { title: base }),
      // Regalos de reserva o de tienda, Google Play Points: campañas menores.
      ...(/google play|pre-registration|on-time reward|my office|shop|pack/i.test(t.title) ? { minor: true } : {}),
    })
    if (!campaign) break // un aviso normal = un evento (el resto de horarios son de canje o de detalle)
  }
  return out
}

async function list(board: number): Promise<Thread[]> {
  const qs = new URLSearchParams({ alias: ALIAS, pageNo: '1', paginationType: 'PAGING', pageSize: '15', blockSize: '5', hideType: 'WEB' })
  const r = await fetch(viaProxy(`${API}/board/${board}/threads?${qs}`))
  if (!r.ok) throw new Error(`foro de Nexon ${board} → HTTP ${r.status}`)
  return ((await r.json())?.threads ?? []) as Thread[]
}

async function thread(id: string): Promise<Thread | null> {
  const r = await fetch(viaProxy(`${API}/thread/${id}?alias=${ALIAS}`)).catch(() => null)
  return r?.ok ? ((await r.json()) as Thread) : null
}

/** Eventos del foro (solo con OFFICIAL_SITES=1 en el proxy; si no, falla y Blue Archive sigue con la wiki y Discord). */
export async function syncBaForum(gameId: string, now = Date.now()): Promise<GameSync> {
  const [events, updates] = await Promise.all([list(3218), list(3217)])
  const recent = (t: Thread) => now - t.createDate * 1000 < 35 * DAY
  const wantUpd = updates.filter(t => recent(t) && /maintenance notice/i.test(t.title)).slice(0, 4)
  const wantEv = events.filter(t => recent(t) && !/recruitment notice|ending soon|community contest|coupon/i.test(t.title)).slice(0, 12)
  const full = async (ts: Thread[]) => (await Promise.all(ts.map(t => thread(t.threadId)))).filter((t): t is Thread => !!t)
  const maint = baMaintenance(await full(wantUpd))
  const posts = await full(wantEv)
  // La cabecera genérica de los avisos ("BA공지사항…일반공지.png") va en todos: no es el arte del evento.
  const firstImgs = posts.map(p => /<img[^>]*src="([^"]+)"/i.exec(p.content ?? '')?.[1]).filter(Boolean) as string[]
  const banner = firstImgs.find((u, i) => firstImgs.indexOf(u) !== i)
  const out = posts.flatMap(p => baForumEvents(gameId, p, maint, banner)).filter(e => Date.parse(e.end) > now - 3 * DAY)
  if (!out.length) throw new Error('foro de Nexon: sin eventos vigentes')
  return { events: out, patches: [], codes: [], pcOnly: true }
}
