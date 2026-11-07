import { viaProxy } from '../net'
import type { GameEvent, PromoCode, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { cardList } from './challenges'
import { pullsIn } from './pulls'

/**
 * Infinity Nikki (Global) desde su wiki de Fandom (infinity-nikki.fandom.com, API de MediaWiki; robots.txt lo permite):
 *  - Eventos: los 50 últimos de "Category:Events" con `{{Event Infobox |time_start = 2026-09-23 20:00:00 |time_start_offset = UTC-7 |time_end … |type}}`;
 *    recompensas: los `{{Card List|Diamond*50}}` de la página, sumados.
 *  - Banners (Resonance): los 12 últimos de "Category:Resonances by Date Descending" (`{{Resonance Infobox |time_start |time_end |…offset}}`).
 *  - Códigos: página "Redeem Code", `{{Code Row|CÓDIGO|Diamond*200;Bling*20K|alta|caducidad}}`; se quedan los no caducados.
 * La wiki suele ir algo atrasada con la 2.ª fase de cada versión y con los banners: los anuncios oficiales llegan además por Discord
 * (canal "infinitynikki" de DISCORD_CHANNELS: #game-news y #redeem-codes del Discord oficial), que manda sobre la wiki.
 * La web oficial (chaos.infoldgames.com) firma sus peticiones con una clave: no se usa. 4 consultas por ciclo (caché de 12 h).
 */
const API = 'https://infinity-nikki.fandom.com/api.php'
const DAY = 86_400_000

interface Page { title: string; revisions?: { slots?: { main?: { content?: string } } }[]; thumbnail?: { source: string } }

async function query(params: Record<string, string>): Promise<{ query?: { pages?: Page[] }; parse?: { wikitext?: string | Record<string, string> } }> {
  const res = await fetch(viaProxy(`${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' })}`))
  if (!res.ok) throw new Error(`infinity-nikki wiki → HTTP ${res.status}`)
  return res.json()
}

const field = (text: string, name: string) => new RegExp(`\\|\\s*${name}\\s*=\\s*([^|\\n}]*)`).exec(text)?.[1]?.trim() ?? ''
const content = (p: Page) => p.revisions?.[0]?.slots?.main?.content ?? ''
/** "2026-09-23 20:00:00" + "UTC-7" → ms. */
function at(s: string, offset: string): number {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  const z = /UTC\s*([+-]\d{1,2})?/i.exec(offset)
  const off = z ? Number(z[1] ?? 0) : -7
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] ? +m[4] : 0) - off, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0) + (m[6] === '59' || (!m[6] && m[5] === '59') ? 999 : 0) : NaN
}

function rewards(text: string): { items: RewardItem[]; pulls: number } {
  const tot = new Map<string, number>()
  for (const m of text.matchAll(/\{\{\s*Card List\s*\|([^}]*)\}\}/gi))
    for (const it of cardList(m[1])) tot.set(it.name, (tot.get(it.name) ?? 0) + it.amount)
  const items = [...tot].sort((a, b) => Number(/^Diamonds?$/.test(b[0])) - Number(/^Diamonds?$/.test(a[0])) || b[1] - a[1]).map(([name, amount]) => ({ name, amount })).slice(0, 10)
  return { items, pulls: pullsIn('infinitynikki', items.map(i => `${i.name} x${i.amount}`)).pulls }
}

async function events(gameId: string): Promise<GameEvent[]> {
  const j = await query({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:Events', gcmsort: 'timestamp', gcmdir: 'desc', gcmlimit: '50',
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '480',
  })
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const out: GameEvent[] = []
  for (const p of j.query?.pages ?? []) {
    const text = content(p)
    if (!/\{\{\s*Event Infobox/i.test(text)) continue
    const s = at(field(text, 'time_start'), field(text, 'time_start_offset')), e = at(field(text, 'time_end'), field(text, 'time_end_offset'))
    if (isNaN(s) || isNaN(e) || e <= s || e < from || s > to || e - s > 150 * DAY) continue
    const name = field(text, 'title') || p.title.replace(/\s*\((Event)\)$/, '').replace(/\/\d{4}-\d\d-\d\d$/, '')
    const type = field(text, 'type')
    const r = rewards(text)
    out.push({
      id: `${gameId}:event:${p.title}`, gameId, kind: 'event', title: name, description: type || undefined, image: p.thumbnail?.source,
      start: new Date(s).toISOString(), end: new Date(e).toISOString(),
      items: r.items, featured: [], pulls: r.pulls, source: 'api',
      minor: /Check-in|Store|Web/i.test(type) || undefined,
    })
  }
  return out
}

async function banners(gameId: string): Promise<GameEvent[]> {
  const j = await query({
    action: 'query', generator: 'categorymembers', gcmtitle: 'Category:Resonances by Date Descending', gcmsort: 'timestamp', gcmdir: 'desc', gcmlimit: '12',
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'thumbnail', pithumbsize: '640',
  })
  const now = Date.now()
  const out: GameEvent[] = []
  for (const p of j.query?.pages ?? []) {
    const text = content(p)
    const s = at(field(text, 'time_start'), field(text, 'time_start_offset')), e = at(field(text, 'time_end'), field(text, 'time_end_offset'))
    if (isNaN(s) || isNaN(e) || e <= s || e < now - 3 * DAY || /^perm/i.test(field(text, 'duration'))) continue
    const name = p.title.replace(/\/\d{4}-\d\d-\d\d$/, '')
    out.push({
      id: `${gameId}:banner:${p.title}`, gameId, kind: 'banner', title: name, description: '⟦d.inResonance⟧', image: p.thumbnail?.source,
      start: new Date(s).toISOString(), end: new Date(e).toISOString(),
      items: [], featured: [{ name, rarity: 5 }], pulls: 0, source: 'api',
    })
  }
  return out
}

async function codes(): Promise<PromoCode[]> {
  const j = await query({ action: 'parse', page: 'Redeem Code', prop: 'wikitext' })
  // Con formatversion=2 el wikitext llega como texto; con la 1, como { '*': texto }.
  const w = j.parse?.wikitext
  const text = typeof w === 'string' ? w : w?.['*'] ?? ''
  const today = new Date().toISOString().slice(0, 10)
  const out: PromoCode[] = []
  for (const m of text.matchAll(/\{\{\s*Code Row\s*\|([^|}]+)\|([^|}]*)\|([^|}]*)\|([^|}]*)/g)) {
    const [code, rew, , exp] = [m[1], m[2], m[3], m[4]].map(x => x.trim())
    if (code === 'CODE' || !/^[A-Za-z0-9]{4,30}$/.test(code)) continue
    // Caducidad: fecha (AAAA-MM-DD), "indefinite"/"unknown" (vigente) o "exp" (caducado).
    if (/^exp/i.test(exp) || (/^\d{4}-\d\d-\d\d$/.test(exp) && exp < today)) continue
    const rewardsTxt = cardList(rew).map(r => `${r.name} ×${r.amount.toLocaleString('en-US')}`)
    if (!out.some(c => c.code.toUpperCase() === code.toUpperCase())) out.push({ code, rewards: rewardsTxt })
  }
  return out
}

export async function syncInfinityNikki(gameId: string): Promise<GameSync> {
  const [ev, bn, cd] = await Promise.allSettled([events(gameId), banners(gameId), codes()])
  if (ev.status === 'rejected' && bn.status === 'rejected') throw ev.reason
  return {
    events: [...(ev.status === 'fulfilled' ? ev.value : []), ...(bn.status === 'fulfilled' ? bn.value : [])],
    patches: [],
    codes: cd.status === 'fulfilled' ? cd.value : [],
  }
}
