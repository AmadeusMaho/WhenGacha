import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'
import { syncPocketGamerCodes } from './codes'
import { htmlText } from './discord'
import { syncPrydwen } from './prydwen'
import { pullsIn } from './pulls'

/**
 * MONGIL: STAR DIVE (Netmarble; servidor global, horas UTC). Fuentes revisadas el 13 nov 2026:
 *  - Eventos: avisos oficiales del foro de Netmarble (forum.netmarble.com/stardive_gl, tablón "Events", menú 6). La web los pide a su API pública
 *    (`/api/game/monster2/official/forum/stardive_gl/article/list?menuSeq=6` y `/article/<id>?menuSeq=6`, sin claves). Cada aviso trae varios
 *    eventos: "🌠 Event 3. M.A.D.'s 7-Day Gifts", su imagen, "Event Period: After the 11/10 (Tue) maintenance - 12/1 (Tue) 23:59 (UTC)",
 *    "How to Participate" y las recompensas ("Day 1 / Compass of Destiny x1"). La lista mezcla idiomas: solo se leen los avisos en inglés.
 *    "After the … maintenance": la hora de fin del mantenimiento no viene; se usa el inicio del banner de esa versión (Prydwen) o, si no, las 03:30
 *    UTC del día siguiente (la hora a la que abrió la 1.5), marcado "≈".
 *  - Banners: Prydwen (/other-games/mongil-star-dive/banners), con inicio y fin exactos (`syncPrydwen`).
 *  - Códigos: PocketGamer (`syncPocketGamerCodes`). El canje oficial (coupon.netmarble.com) no lista los códigos.
 *  - Retratos: mongil.wiki.gg ("<Nombre>Portrait.png"), en el recolector (`withFeaturedIcons`); la wiki va atrasada y los nuevos no lo tienen.
 * 1 lista + hasta 3 avisos del foro, 1 página de Prydwen (10 s de Crawl-delay) y 1 de PocketGamer por ciclo.
 */
const FORUM = 'https://forum.netmarble.com/api/game/monster2/official/forum/stardive_gl'
const HOUR = 3_600_000
const DAY = 24 * HOUR

interface Article { id: number; title: string; regDate: number; content?: string; thumbnailUrl?: string }

/** "11/10 (Tue) 23:59 (UTC)" → ms (año: el del aviso, o el siguiente si la fecha queda muy atrás). */
function md(s: string, posted: number): { at: number; time: boolean } | null {
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\s*\([A-Za-z]{3}\))?(?:\s+(\d{1,2}):(\d{2}))?/.exec(s)
  if (!m) return null
  const y0 = m[3] ? +m[3] : new Date(posted).getUTCFullYear()
  const at = (y: number) => Date.UTC(y, +m[1] - 1, +m[2], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59, m[4] ? 0 : 59)
  const t = !m[3] && at(y0) < posted - 60 * DAY ? at(y0 + 1) : at(y0)
  return { at: t, time: !!m[4] }
}

/** "After the 11/10 (Tue) maintenance - 12/1 (Tue) 23:59 (UTC)" → [inicio, fin, inicio aproximado]. */
export function mongilPeriod(line: string, posted: number, launch?: number): [number, number, boolean] | null {
  const [a, b] = line.split(/\s+[-–~]\s+(?=\d)/)
  if (!a || !b) return null
  const end = md(b, posted)
  if (!end) return null
  const after = /after/i.test(a)
  const s = md(a, posted)
  if (!s) return null
  // "Después del mantenimiento del 11/10": el inicio de la versión (banner) si cae entre ese día y el siguiente; si no, 03:30 UTC del día siguiente.
  const day = Date.UTC(new Date(s.at).getUTCFullYear(), new Date(s.at).getUTCMonth(), new Date(s.at).getUTCDate())
  const start = after ? (launch && launch >= day && launch <= day + 2 * DAY ? launch : day + DAY + 3.5 * HOUR) : s.time ? s.at : day
  return [start, end.at + (end.time ? 59_000 : 0), after && !(launch && launch >= day && launch <= day + 2 * DAY)]
}

const isEnglish = (t: string) => !/[฀-๿぀-ヿ㐀-鿿가-힯]/.test(t)

/** Eventos de un aviso: un bloque por "🌠 Event N. <nombre>". */
export function mongilNotice(gameId: string, a: Article, launch?: number): GameEvent[] {
  const html = (a.content ?? '').replace(/<img[^>]*\bsrc="([^"]+)"[^>]*>/gi, '\n⟪img:$1⟫\n')
  const lines = htmlText(html).split('\n').map(l => l.replace(/&#39;/g, "'").trim()).filter(Boolean)
  const out: GameEvent[] = []
  const heads = lines.map((l, i) => (/^🌠?\s*Event\s+\d+\.\s*\S/u.test(l) ? i : -1)).filter(i => i >= 0)
  heads.forEach((h, k) => {
    const block = lines.slice(h, heads[k + 1] ?? lines.length)
    const title = block[0].replace(/^🌠?\s*Event\s+\d+\.\s*/u, '').trim()
    const periodLine = block.find(l => /\(UTC\)/i.test(l) && /\d{1,2}\/\d{1,2}/.test(l))
    const r = periodLine && mongilPeriod(periodLine.replace(/^-\s*/, '').replace(/^[^:]*Available Period:\s*/i, ''), a.regDate, launch)
    if (!title || !r || r[1] < Date.now() - 3 * DAY) return
    const image = block.map(l => /^⟪img:(.+)⟫$/.exec(l)?.[1]).find(Boolean)
    const how = block.findIndex(l => /how to participate/i.test(l))
    const description = how >= 0 ? block.slice(how + 1).filter(l => /^-/.test(l)).slice(0, 2).map(l => l.replace(/^-\s*/, '')).join(' ') || undefined : undefined
    // Recompensas con cantidad ("Compass of Destiny x1"); los "Key Rewards" sin cifra se listan aparte, sin cantidad.
    // Fuera las líneas de misión ("Craft 5★ Equipment x1", "Power up one 5★ Equipment to Lv. 18"): son requisitos, no recompensas.
    const rewards = pullsIn('mongil', block.filter(l => !/^⟪img/.test(l) && !/^(?:craft|power up|complete|clear|reach|obtain|use|log in)\b/i.test(l)))
    const named = rewards.items.length ? [] : block.slice(block.findIndex(l => /key rewards|rewards$/i.test(l)) + 1)
      .filter(l => !/^⟪img|^-|^※|rewards$|^✨/i.test(l) && /^[A-Z]/.test(l) && l.length < 60).flatMap(l => l.split(/\s*\/\s*/)).slice(0, 6)
    // Icono de cada recompensa: en los avisos, la imagen va justo antes del nombre ("⟪img⟫ / Compass of Destiny x1").
    const icons = new Map<string, string>()
    block.forEach((l, j) => {
      const src = /^⟪img:(.+)⟫$/.exec(l)?.[1]
      const next = block[j + 1]
      if (src && next && !/^⟪img/.test(next)) for (const n of next.replace(/\s*[x×]\s*[\d,]+$/i, '').split(/\s*\/\s*/)) icons.set(n.trim().toLowerCase(), src)
    })
    const withIcon = (i: { name: string; amount: number }) => ({ ...i, icon: icons.get(i.name.toLowerCase()) })
    out.push({
      id: `${gameId}:event:nm:${title}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId, kind: 'event', title, image, description,
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(),
      items: (rewards.items.length ? rewards.items : named.map(name => ({ name, amount: 0 }))).map(withIcon), featured: [], pulls: rewards.pulls,
      minor: /community|fan ?art|discord|sns|share/i.test(`${a.title} ${title}`) ? true : undefined,
      source: 'api', official: true, precision: r[2] ? 'approx' : undefined,
    })
  })
  return out
}

export async function syncMongilNews(gameId: string, launch?: number): Promise<GameSync> {
  const res = await fetch(viaProxy(`${FORUM}/article/list?menuSeq=6&start=1&rows=12`))
  if (!res.ok) throw new Error(`netmarble MONGIL → HTTP ${res.status}`)
  const list = ((await res.json())?.articleList ?? []) as Article[]
  const recent = list.filter(a => isEnglish(a.title) && Date.now() - a.regDate < 45 * DAY).slice(0, 3)
  const events: GameEvent[] = []
  for (const a of recent) {
    const d = await fetch(viaProxy(`${FORUM}/article/${a.id}?menuSeq=6`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    if (d?.article) events.push(...mongilNotice(gameId, d.article as Article, launch))
  }
  if (!list.length) throw new Error('netmarble MONGIL: sin avisos')
  return { events, patches: [], codes: [] }
}

/**
 * Personajes anunciados sin fecha (Prydwen, tarjetas `data-section="teased"`: "Lou is the upcoming new limited 5-stars of Version 1.5"). Van a
 * continuación del banner de personaje en curso, con su misma duración, como estimados. Es la misma página que lee `syncPrydwen` (caché del proxy).
 */
async function teased(gameId: string, current: GameEvent | undefined): Promise<GameEvent[]> {
  if (!current) return []
  const res = await fetch(viaProxy('https://www.prydwen.gg/other-games/mongil-star-dive/banners'))
  if (!res.ok) return []
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const len = Date.parse(current.end) - Date.parse(current.start)
  return [...doc.querySelectorAll('article[data-banner-card][data-section="teased"][data-category="character"]')].map(card => {
    const name = card.querySelector('.banner-name')?.textContent?.trim() ?? ''
    const start = Date.parse(current.end) + 1000
    return {
      id: `${gameId}:banner:prydwen:teased:${name}`, gameId, kind: 'banner' as const, title: name, description: '⟦d.mongilTeased⟧',
      image: card.querySelector('img')?.getAttribute('src') ?? undefined, start: new Date(start).toISOString(), end: new Date(start + len).toISOString(),
      items: [], featured: [{ name, rarity: 5 }], pulls: 0, source: 'api' as const, precision: 'estimated' as const,
    }
  }).filter(e => e.title)
}

export async function syncMongil(gameId: string): Promise<GameSync> {
  const [b, c] = await Promise.allSettled([syncPrydwen(gameId, 'mongil'), syncPocketGamerCodes('mongil-star-dive')])
  // Inicio de la versión en curso: el del banner de personaje más reciente que ya empezó.
  const dated = b.status === 'fulfilled' ? b.value.events : []
  const current = dated.filter(e => e.featured.length).sort((x, y) => Date.parse(y.end) - Date.parse(x.end))[0]
  const banners = [...dated, ...await teased(gameId, current).catch(() => [] as GameEvent[])]
  const launch = banners.filter(e => Date.parse(e.start) <= Date.now()).map(e => Date.parse(e.start)).sort((x, y) => y - x)[0]
  const n = await syncMongilNews(gameId, launch).then(v => ({ ok: true as const, v }), (err: Error) => ({ ok: false as const, err }))
  if (b.status === 'rejected' && c.status === 'rejected' && !n.ok) throw b.reason
  if (b.status === 'rejected') console.warn('[mongil] prydwen:', (b.reason as Error)?.message)
  if (c.status === 'rejected') console.warn('[mongil] códigos:', (c.reason as Error)?.message)
  if (!n.ok) console.warn('[mongil] foro:', n.err?.message)
  return { events: [...banners, ...(n.ok ? n.v.events : [])], patches: [], codes: c.status === 'fulfilled' ? c.value : [] }
}
