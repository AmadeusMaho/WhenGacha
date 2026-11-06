import { viaProxy } from '../net'
import type { GameEvent, Kind } from '../types'
import type { GameSync } from './ennead'

/**
 * Reverse: 1999 (servidor Global) desde las páginas "Events" y "Summons" de su wiki de Fandom (API de MediaWiki).
 * La wiki escribe cada periodo con su hora y zona ("November 5th, 05:00 - December 14th, 2026, 04:59 (UTC-5)"),
 * así que las horas son exactas; está editada por la comunidad y puede ir con algo de retraso.
 */
const WIKI = 'reverse1999.fandom.com'
const DAY = 86_400_000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** HTML de la wiki -> texto plano con "|" entre elementos (las celdas y enlaces quedan separados). */
const flat = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&').replace(/&#0?39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

const D = '([A-Z][a-z]+) (\\d{1,2})(?:st|nd|rd|th)?'
const RANGE = new RegExp(`${D}(?:, (\\d{4}))?, (\\d{1,2}):(\\d{2}) - ${D}, (\\d{4}), (\\d{1,2}):(\\d{2}) \\(UTC([+-]\\d+)\\)`, 'g')
const LABEL = /^(Duration:|Accompanying Event:|Time Period|Event|Version|Banner|Name)$/i

interface Row { name: string; start: number; end: number; extra?: string }

/** Cada "inicio - fin (UTC±n)" del texto, con el nombre que lo antecede (y el evento acompañante, si lo hay). */
function rows(text: string): Row[] {
  const out: Row[] = []
  for (const m of text.matchAll(RANGE)) {
    const before = text.slice(Math.max(0, m.index - 200), m.index).split('|').map(x => x.trim()).filter(x => x && !LABEL.test(x) && !x.startsWith('File:'))
    const name = before[before.length - 1]
    const [, sm, sd, sy, sh, smi, em, ed, ey, eh, emi, off] = m
    const sMonth = MONTHS.indexOf(sm.toLowerCase()), eMonth = MONTHS.indexOf(em.toLowerCase())
    if (sMonth < 0 || eMonth < 0 || !name) continue
    // Si el inicio no trae año, es el del fin (o el anterior cuando el mes de inicio es posterior al del fin).
    const startYear = sy ? +sy : sMonth > eMonth ? +ey - 1 : +ey
    const at = (y: number, mo: number, d: number, h: number, mi: number) => Date.UTC(y, mo, d, h, mi) - Number(off) * 3_600_000
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 160)
    out.push({
      name, start: at(startYear, sMonth, +sd, +sh, +smi), end: at(+ey, eMonth, +ed, +eh, +emi),
      extra: /Accompanying Event:[\s|]*([^|]+)/.exec(after)?.[1]?.trim(),
    })
  }
  return out
}

async function page(title: string): Promise<string> {
  const qs = new URLSearchParams({ action: 'parse', page: title, prop: 'text', format: 'json', origin: '*', disableeditsection: '1', disabletoc: '1' })
  const res = await fetch(viaProxy(`https://${WIKI}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${WIKI} → HTTP ${res.status}`)
  const html = (await res.json())?.parse?.text?.['*'] as string | undefined
  if (!html) throw new Error(`${WIKI}: página ${title} vacía`)
  return flat(html)
}

export async function syncReverse1999(gameId: string): Promise<GameSync> {
  const [events, summons] = await Promise.allSettled([page('Events'), page('Summons')])
  if (events.status === 'rejected' && summons.status === 'rejected') throw events.reason
  const from = Date.now() - 3 * DAY, to = Date.now() + 120 * DAY
  const seen = new Set<string>()
  const out: GameEvent[] = []

  const add = (kind: Kind, r: Row) => {
    if (r.end <= r.start || r.end < from || r.start > to || r.end - r.start > 120 * DAY) return
    const id = `${gameId}:${kind}:${r.name}:${new Date(r.start).toISOString()}`
    if (seen.has(id)) return
    seen.add(id)
    out.push({
      id, gameId, kind, title: r.name,
      description: kind === 'banner' ? ['⟦d.charBanner⟧', r.extra].filter(Boolean).join(' · ') : undefined,
      start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString(), items: [], featured: [], pulls: 0, source: 'api',
    })
  }
  if (events.status === 'fulfilled') rows(events.value).forEach(r => add('event', r))
  if (summons.status === 'fulfilled') rows(summons.value).forEach(r => add('banner', r))
  return { events: out, patches: [], codes: [] }
}
