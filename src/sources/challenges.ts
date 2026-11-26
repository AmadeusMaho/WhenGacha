import { viaProxy } from '../net'
import type { GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { pullsIn, type PullGame } from './pulls'

/**
 * Recompensas de los desafíos rotatorios desde la wiki del juego (Fandom / wiki.gg, API de MediaWiki; robots.txt lo permite, el proxy cachea 12 h).
 * Las wikis publican en la página de cada desafío una tabla "Total Rewards" cuyo primer `{{Card List|Polychrome*780;Denny*350,000}}` es el máximo
 * de un ciclo (todas las estrellas/rangos). Ese total se pone en cada aparición del desafío, con sus tiradas según `RULES` de pulls.ts.
 * Solo se rellenan los desafíos que aún no tienen recompensas (la fuente principal manda).
 */
export interface ChallengePage {
  /** El título del desafío en la app (p. ej. /^Shiyu Defense/). */
  match: RegExp
  /** Página de la wiki con la tabla de totales. */
  page: string
  /** Sección que contiene el total (por defecto "Total Rewards"). */
  section?: RegExp
  /**
   * Páginas sin tabla de totales que listan por temporada cada misión con su `{{Card List}}` (ZZZ, "Annihilation Simulacrum/Rewards"):
   * cabecera de temporada; se suman todas las listas de la última (la vigente).
   */
  sumLast?: RegExp
}

/** "350,000" → 350000; "20K" / "28.8K" → 20000 / 28800. */
const num = (s: string) => { const t = s.replace(/[,\s]/g, ''); return /k$/i.test(t) ? Math.round(Number(t.slice(0, -1)) * 1000) : Number(t) }

/** "Polychrome*780; Tempered Crown*1; Title*1" → items (sin cantidad = 1). */
export function cardList(body: string): RewardItem[] {
  return body.split('|').filter(p => !/^\s*\w+\s*=/.test(p)).join('|').split(/[;,](?![\d])/)
    .map(part => part.split('*').map(x => x.trim()))
    .filter(([name]) => !!name && !/^\d/.test(name))
    .map(([name, qty]) => ({ name, amount: qty && /^[\d,.\s]+[kK]?$/.test(qty) ? num(qty) : 1 }))
}

async function wikitext(host: string, page: string): Promise<string> {
  const qs = new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', origin: '*', redirects: '1' })
  const res = await fetch(viaProxy(`https://${host}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${host} → HTTP ${res.status}`)
  return ((await res.json()) as { parse?: { wikitext?: Record<string, string> } }).parse?.wikitext?.['*'] ?? ''
}

/** Primer Card List de la sección de totales de una página. */
export async function totalRewards(host: string, page: string, section = /=+\s*Total Rewards\s*=+/i): Promise<RewardItem[]> {
  const text = await wikitext(host, page)
  const at = text.search(section)
  if (at < 0) return []
  const m = /\{\{\s*Card List\s*\|([^}]*)\}\}/i.exec(text.slice(at))
  return m ? cardList(m[1]) : []
}

/** Suma por nombre todas las `{{Card List}}` de la última sección que empieza con `heading` (la temporada vigente). */
export async function lastSectionTotal(host: string, page: string, heading: RegExp): Promise<RewardItem[]> {
  const text = await wikitext(host, page)
  const g = new RegExp(heading.source, heading.flags.includes('g') ? heading.flags : heading.flags + 'g')
  const starts = [...text.matchAll(g)].map(m => m.index ?? 0)
  if (!starts.length) return []
  const sum = new Map<string, number>()
  for (const m of text.slice(starts[starts.length - 1]).matchAll(/\{\{\s*Card List\s*\|([^}]*)\}\}/gi))
    for (const i of cardList(m[1])) sum.set(i.name, (sum.get(i.name) ?? 0) + i.amount)
  return [...sum].map(([name, amount]) => ({ name, amount }))
}

/** Rellena las recompensas de los desafíos de `s` según `pages`. Si la wiki falla, devuelve `s` tal cual. */
export async function withChallengeRewards(s: GameSync, host: string, game: PullGame, pages: ChallengePage[]): Promise<GameSync> {
  const need = pages.filter(p => s.events.some(e => e.kind === 'challenge' && !e.items.length && p.match.test(e.title)))
  if (!need.length) return s
  const found = await Promise.all(need.map(p => (p.sumLast ? lastSectionTotal(host, p.page, p.sumLast) : totalRewards(host, p.page, p.section)).catch(err => {
    console.warn(`[challenges] ${host} ${p.page}:`, (err as Error)?.message ?? err)
    return [] as RewardItem[]
  })))
  const by = new Map(need.map((p, i) => [p, found[i]]))
  const events: GameEvent[] = s.events.map(e => {
    if (e.kind !== 'challenge' || e.items.length) return e
    const p = need.find(x => x.match.test(e.title))
    const items = p && by.get(p)
    if (!items?.length) return e
    return { ...e, items, pulls: pullsIn(game, items.map(i => `${i.name} x${i.amount}`)).pulls }
  })
  return { ...s, events }
}
