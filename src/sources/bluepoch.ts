import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'
import { pullsIn, segments } from './pulls'
import { summarize } from './summary'

/**
 * Reverse: 1999 (Global): avisos oficiales de Bluepoch, los mismos que muestra re1999.bluepoch.com/en/home.
 * API: POST https://re1999.bluepoch.com/activity/official/websites/information/query {gameId: 60001, current, pageSize};
 * el proxy la pide como POST a partir de la URL con esos parámetros (fuente `bluepoch`). La lista ya trae el HTML de cada aviso.
 * Términos de Bluepoch (re1999.bluepoch.com/en/bluepoch/terms.html, leídos el 6 nov 2026): sin cláusula contra bots; sin robots.txt.
 *
 * Cada versión publica un "Ver. X.Y [...] Preview" con un bloque por evento: imagen, nombre, subtítulo y
 *   [Duration]: After the version update on 2026-11-05 - 2026-12-14 04:59 (UTC-5)
 * "After the version update" = fin del mantenimiento, que da su "Version Update Maintenance Notice"
 * ("[Update Maintenance Duration] 2026-11-05 05:00 - 2026-11-05 10:00 (UTC-5)").
 * Los banners ("Time-Limited … Banner") traen los personajes con RATE UP. Los paquetes y trajes de pago se omiten.
 */
const API = 'https://re1999.bluepoch.com/activity/official/websites/information/query'
const HOUR = 3_600_000
const DAY = 24 * HOUR

interface Notice { id: number; title: string; content: string | null; onlineTime?: string }

const DATE = '(\\d{4}-\\d{2}-\\d{2})'
const RANGE = new RegExp(`(?:After the version update on ${DATE}|${DATE} (\\d{1,2}):(\\d{2}))\\s*-\\s*${DATE} (\\d{1,2}):(\\d{2})\\s*\\(UTC([+-]\\d+)\\)`, 'i')
const MAINT = new RegExp(`${DATE} (\\d{1,2}):(\\d{2})\\s*-\\s*${DATE} (\\d{1,2}):(\\d{2})\\s*\\(UTC([+-]\\d+)\\)`)

const at = (d: string, h: number, mi: number, off: number) => {
  const [y, mo, da] = d.split('-').map(Number)
  return Date.UTC(y, mo - 1, da, h - off, mi)
}

/** HTML del aviso → líneas de texto, con "@@IMG <url>" donde había una imagen. */
function lines(html: string): string[] {
  const marked = html
    .replace(/<img[^>]*\ssrc="([^"]+)"[^>]*>/gi, (_, src) => `\n@@IMG ${src}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|td)>/gi, '$&\n')
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${marked}</body></html>`, 'text/html')
  return (doc.body.textContent ?? '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** ¿Es el nombre (o subtítulo) de un bloque? Sin ":" fuera de los corchetes, corto y sin punto final. */
const isTitle = (l: string) => !l.startsWith('@@IMG') && !l.startsWith('※') && l.length <= 90 && !/[.]$/.test(l)
  && !/^\d/.test(l) && !l.replace(/\[[^\]]*\]/g, 'X').includes(':')
/** "[A Series of Dusks · Chamber of Sounds]" → sin corchetes; "New Arrivals in [Roar Jukebox: …]" → lo de dentro. */
const cleanName = (l: string) => (/\[([^\]]+)\]/.exec(l)?.[1] ?? l).trim()

export async function syncBluepoch(gameId: string): Promise<GameSync> {
  const qs = new URLSearchParams({ gameId: '60001', informationType: '', current: '1', pageSize: '10' })
  const res = await fetch(viaProxy(`${API}?${qs}`))
  if (!res.ok) throw new Error(`bluepoch → HTTP ${res.status}`)
  const json = await res.json()
  const notices: Notice[] = json?.data?.pageData
  if (!Array.isArray(notices)) throw new Error(`bluepoch: ${json?.msg ?? 'respuesta inesperada'}`)

  // Fin real de cada mantenimiento de versión, por la fecha en que empieza ("2026-11-05" → ms).
  const maintEnd = new Map<string, number>()
  for (const n of notices) {
    if (!/Maintenance Notice/i.test(n.title) || !n.content) continue
    const m = MAINT.exec(lines(n.content).join('\n'))
    if (m) maintEnd.set(m[1], at(m[4], +m[5], +m[6], +m[7]))
  }

  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  const seen = new Set<string>()
  for (const n of notices) {
    if (!/Preview/i.test(n.title) || !n.content) continue
    const ls = lines(n.content)
    let img: string | undefined, title: string | null = null, sub: string | null = null, titleImg: string | undefined, titleAt = -1
    const titles: number[] = [], marks: { ev: GameEvent; title: number; dur: number }[] = []
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i]
      if (l.startsWith('@@IMG ')) { img = l.slice(6).trim(); continue }
      if (isTitle(l)) {
        if (isTitle(ls[i - 1] ?? '') && title && !sub) sub = l // segunda línea de la cabecera = subtítulo
        else { title = cleanName(l); sub = null; titleImg = img; titleAt = i; titles.push(i) }
        continue
      }
      const m = RANGE.exec(l)
      if (!m || !title) continue
      const name = title, subtitle = sub
      title = null
      const off = +m[8]
      let start: number, approx = false
      if (m[1]) {
        const end = maintEnd.get(m[1])
        start = end ?? at(m[1], 10, 0, off) // sin aviso de mantenimiento: 5 h después de las 05:00 habituales, aproximado
        approx = end === undefined
      } else start = at(m[2], +m[3], +m[4], off)
      const end = at(m[5], +m[6], +m[7], off) + 59_000
      const near = ls.slice(i + 1, i + 6).join(' ')
      // Trajes y paquetes de pago no son eventos.
      if (/Garment|Pack$/i.test(subtitle ?? '') || /^New Packs$/i.test(name) || /Price:/.test(near)) continue
      if (!(end > start) || end < from || start > to || end - start > 150 * DAY) continue
      const banner = /Banner/i.test(subtitle ?? '')
      const id = `${gameId}:${banner ? 'banner' : 'event'}:bp:${name}:${new Date(start).toISOString().slice(0, 10)}`
      if (seen.has(id)) continue
      seen.add(id)
      let featured: Featured[] = []
      if (banner) {
        const rate = (ls.slice(i + 1, i + 4).find(x => /RATE UP/i.test(x)) ?? '').split(/RATE UP:?/i)[1] ?? ''
        featured = [...rate.matchAll(/(\d)-star \[([^\]]+?)(?:\s*\([^)]*\))?\]|\[([^\]]+?)(?:\s*\([^)]*\))?\]/g)]
          .map(x => ({ name: (x[2] ?? x[3]).trim() })).slice(0, 3)
        let rarity = 6
        for (const x of rate.matchAll(/(\d)-star \[([^\]]+?)(?:\s*\([^)]*\))?\]/g)) {
          rarity = +x[1]
          const f = featured.find(f => f.name === x[2].trim())
          if (f) f.rarity = rarity
        }
      }
      const ev: GameEvent = {
        id, gameId, kind: banner ? 'banner' : 'event', title: name,
        description: subtitle ?? undefined,
        image: titleImg,
        start: new Date(start).toISOString(), end: new Date(end).toISOString(),
        items: [], featured, pulls: 0, official: true, source: 'api',
        precision: approx ? 'approx' : undefined,
        minor: /Theme Pack|Jukebox/i.test(`${subtitle ?? ''} ${name}`) || undefined,
      }
      out.push(ev)
      marks.push({ ev, title: titleAt, dur: i })
    }
    // Tiradas: recompensas del bloque de cada evento ("[Main Rewards]: Clear Drop x400", "Unilog x14 in total").
    segments(ls.length, titles, marks).forEach(([a, b], k) => {
      if (marks[k].ev.kind === 'banner') return
      const { pulls, items } = pullsIn('reverse1999', ls.slice(a, b))
      marks[k].ev.pulls = pulls
      marks[k].ev.items = items
      // Resumen desde el título del propio evento (segments alarga el tramo hacia atrás para las recompensas).
      marks[k].ev.description ??= summarize(ls.slice(Math.max(a, marks[k].title) + 1, b), { title: marks[k].ev.title })
    })
  }
  if (!out.length) throw new Error('bluepoch: sin eventos vigentes en los avisos')
  return { events: out, patches: [], codes: [] }
}
