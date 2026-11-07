import { viaProxy } from '../net'
import type { Featured, GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'
import { pullsIn, segments } from './pulls'

/**
 * NIKKE (Global): notas de parche oficiales, tal como las reproduce nikke.gg (red DotGG) en su API pública de WordPress.
 * La web oficial (nikke-en.com) solo publica avisos técnicos y blablalink usa una API firmada, así que la copia de nikke.gg es la vía.
 * Revisado el 6 nov 2026: robots.txt permite a agentes genéricos (solo veta bots de IA y su buscador `?s=`) y sus Términos (nikke.gg/terms)
 * no prohíben el acceso automatizado. 1 lista + hasta 2 avisos por ciclo, caché de 3 h.
 *
 * Cada post "… Patch Notes" lleva primero un resumen de nikke.gg y después el aviso oficial ("Major Updates:"), con secciones
 * "5.7 Trail Marker Event" + imagen + "* Event duration: From the end of the October 29, 2026 maintenance to 4:59:59, November 19, 2026 (UTC+9)".
 * "the end of the … maintenance" = "Expected maintenance duration: October 29, 2026, 00:00:00 – 7:00:00 (UTC+9)" del mismo aviso.
 */
const API = 'https://nikke.gg/wp-json/wp/v2/posts'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

interface Post { id: number; date: string; title: { rendered: string }; content?: { rendered: string } }

/** "4:59:59, November 19, 2026" / "November 6, 2026, 12:00:00" / "5:00:00 November 5, 2026" (UTC+off) → ms. */
function when(s: string, off: number): number {
  const d = /([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(s)
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s.replace(d?.[0] ?? '', ''))
  const mo = d ? MONTHS.indexOf(d[1].toLowerCase()) : -1
  if (!d || mo < 0) return NaN
  return Date.UTC(+d[3], mo, +d[2], (t ? +t[1] : 0) - off, t ? +t[2] : 0, t?.[3] ? +t[3] : 0)
}

function lines(html: string): string[] {
  const marked = html
    .replace(/<img[^>]*?\ssrc="([^"]+)"[^>]*>/gi, (_, src) => `\n@@IMG ${src}\n`)
    .replace(/<h2[^>]*>/gi, '\n@@H2 ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|td|figure)>/gi, '$&\n')
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${marked}</body></html>`, 'text/html')
  return (doc.body.textContent ?? '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** Secciones que no son eventos (ventas de trajes, paquetes) o que no tienen periodo. */
const SKIP_SECTION = /Costume|Commodit|Package|Content & Features|Optimi|Champion Arena|Outpost/i
const CHALLENGE_SECTION = /Union Raid|Solo Raid|Coordinated Operation/i
/** Qué da cada raid según las notas oficiales ("collect Union Chips", "Gems … according to the ranking", "Broken Cores to exchange for Gems"). */
const RAID_DESC: [RegExp, string][] = [
  [/Union Raid/i, '⟦d.nkUnion⟧'],
  [/Solo Raid/i, '⟦d.nkSolo⟧'],
  [/Coordinated Operation/i, '⟦d.nkCoop⟧'],
]

function parseNotes(gameId: string, html: string, out: GameEvent[], seen: Set<string>) {
  const ls = lines(html)
  const startAt = ls.findIndex(l => /^Major Updates/i.test(l))
  if (startAt < 0) return
  const maint = ls.map(l => /Expected maintenance duration:\s*([A-Z][a-z]+ \d{1,2}, \d{4}),\s*[\d:]+\s*[–-]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\(UTC([+-]\d+)\)/i.exec(l)).find(Boolean)
  const maintEnd = maint ? when(`${maint[1]}, ${maint[2]}`, +maint[3]) : NaN

  let section = '', title = '', img: string | undefined, sectionImg: string | undefined, used = false
  const selective: { title: string; start: number; end: number; names: string[]; img?: string }[] = []
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY

  const titles: number[] = [], marks: { ev: GameEvent; title: number; dur: number }[] = []
  let titleAt = -1
  for (let i = startAt; i < ls.length; i++) {
    const l = ls[i]
    if (l.startsWith('@@H2 ') || /^\d+\.\d+\s+/.test(l)) { titleAt = i; titles.push(i) }
    if (l.startsWith('@@H2 ')) { section = l.slice(5).replace(/^\d+\.\s*/, ''); title = section; img = sectionImg = undefined; used = false; continue }
    if (l.startsWith('@@IMG ')) { if (!img) img = l.slice(6).trim(); if (!sectionImg) sectionImg = img; continue }
    const sub = /^\d+\.\d+\s+(.+)$/.exec(l)
    if (sub) { title = sub[1].replace(/^(New Fully Voiced Story Event|SSR)\s*:?\s*/i, '').trim(); img = undefined; used = false; continue }
    const m = /(Event|Special Recruit|Selective Recruitment|Skill Reset)?\s*duration:\s*From (.+?) (?:to|until) (.+?)\s*\(UTC([+-]\d+)\)/i.exec(l)
    if (!m || used || SKIP_SECTION.test(section) || /^Sale duration/i.test(l.replace(/^\*\s*/, ''))) continue
    used = true
    const off = +m[4]
    const start = /end of (the )?.*maintenance/i.test(m[2]) ? maintEnd : when(m[2], off)
    const end = when(m[3], off) + (/:\d{2}:59/.test(m[3]) ? 999 : 0)
    if (isNaN(start) || isNaN(end) || !(end > start) || end < from || start > to || end - start > 150 * DAY) continue
    if (/Selective Recruitment/i.test(section)) {
      const g = selective.find(s => s.start === start && s.end === end) ?? (selective.push({ title: section, start, end, names: [], img: sectionImg }), selective[selective.length - 1])
      g.names.push(title)
      continue
    }
    const banner = /Special Recruit/i.test(m[1] ?? '')
    const kind: Kind = banner ? 'banner' : CHALLENGE_SECTION.test(section) ? 'challenge' : 'event'
    const name = banner ? title : CHALLENGE_SECTION.test(section) && title === section ? section : title
    const id = `${gameId}:${kind}:ngg:${name}:${new Date(start).toISOString().slice(0, 10)}`
    if (seen.has(id)) continue
    seen.add(id)
    const ev: GameEvent = {
      id, gameId, kind, title: name, image: img,
      // Las recompensas de los raids dependen del ranking (las notas no dan cantidades): se describe qué se gana en vez de inventar cifras.
      description: kind === 'challenge' ? RAID_DESC.find(([re]) => re.test(name))?.[1] : undefined,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: banner ? [{ name, rarity: 3 } as Featured] : [], pulls: 0, official: true, source: 'api',
      minor: /AFFECTION TRAIL|Skill Reset|Welcome Back/i.test(name) || undefined,
    }
    out.push(ev)
    marks.push({ ev, title: titleAt, dur: i })
  }
  // Tiradas: "Log in … to get SSR Rapunzel, 10 Advanced Recruit Vouchers, …" en el bloque de cada evento.
  segments(ls.length, titles, marks).forEach(([a, b], k) => {
    if (marks[k].ev.kind === 'banner') return
    const { pulls, items } = pullsIn('nikke', ls.slice(a, b))
    marks[k].ev.pulls = pulls
    marks[k].ev.items = items
  })
  for (const g of selective) {
    const id = `${gameId}:banner:ngg:${g.names.join('/')}:${new Date(g.start).toISOString().slice(0, 10)}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id, gameId, kind: 'banner', title: g.names.join(' / '), description: g.title, image: g.img,
      start: new Date(g.start).toISOString(), end: new Date(g.end).toISOString(),
      items: [], featured: g.names.slice(0, 3).map(name => ({ name, rarity: 3 })), pulls: 0, official: true, source: 'api',
    })
  }
}

export async function syncNikkeGg(gameId: string): Promise<GameSync> {
  const qs = new URLSearchParams({ categories: '1', per_page: '20', _fields: 'id,date,title' })
  const res = await fetch(viaProxy(`${API}?${qs}`))
  if (!res.ok) throw new Error(`nikke.gg → HTTP ${res.status}`)
  const list = (await res.json()) as Post[]
  if (!Array.isArray(list)) throw new Error('nikke.gg: lista inesperada')
  // Los dos avisos de actualización más recientes (la versión en curso y, a veces, una actualización a mitad).
  const notes = list.filter(p => /patch ?notes|update notice|update$/i.test(p.title.rendered)).slice(0, 2)
  const out: GameEvent[] = []
  const seen = new Set<string>()
  for (const p of notes) {
    const r = await fetch(viaProxy(`${API}/${p.id}?${new URLSearchParams({ _fields: 'id,date,title,content' })}`))
    if (!r.ok) continue
    const post = (await r.json()) as Post
    if (post.content?.rendered) parseNotes(gameId, post.content.rendered, out, seen)
  }
  if (!out.length) throw new Error('nikke.gg: sin eventos vigentes en las notas de parche')
  return { events: out, patches: [], codes: [] }
}
