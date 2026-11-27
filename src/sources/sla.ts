import { viaProxy } from '../net'
import type { GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { syncPocketGamerCodes } from './codes'
import { htmlText } from './discord'
import { pullsIn } from './pulls'

/**
 * Solo Leveling: ARISE (Netmarble; servidor global, horas UTC+0). Fuentes revisadas el 27 nov 2026:
 *  - Eventos y banners: avisos oficiales del foro de Netmarble (forum.netmarble.com/sololv/groups/en, foro `slv_en`), la misma API pública que
 *    MONGIL (`/api/game/sololv/official/forum/slv_en/article/list?menuSeq=34` y `/article/<id>?menuSeq=34`). Tablón "Events" (34). Formatos vistos:
 *     · Banner: "📌 Hunter Draw Schedule … ✨ Thalia De Rossi ✨ / After maintenance on 11/19 (Thu) to 12/17 (Thu) 00:00" (uno por cazador; también los
 *       que empiezan más tarde, "✨Sian Halat✨ 12/03 (Thu) 00:00 to 12/17 (Thu) 00:00").
 *     · Tabla: "Event Name / Schedule(UTC+0)" y luego, por filas, nombre y periodo (una celda combinada deja una fila sin periodo: toma el de arriba).
 *     · Bloque: "📌 Event Period / - After maintenance on 11/19 (Thu) to 12/17 (Thu) 00:00" y debajo "1️⃣ <evento>", "2️⃣ <evento>"; sin numerados,
 *       el evento es el propio aviso ("Guild Item Trade-In Event Notice").
 *     · "📌 Key Rewards": nombres sin cifra por evento (la tabla pone el nombre del evento y debajo sus recompensas).
 *    La lista mezcla inglés y francés: solo se leen los avisos en inglés.
 *  - "After maintenance on 11/19": la hora real del fin del mantenimiento sale de su aviso en "Notices" (menú 32): "11/18 (Wed) 23:50 - 11/19 (Thu)
 *    08:30 (UTC+0)". Si no lo hay, las 08:00 UTC de ese día, marcado "≈".
 *  - Códigos: PocketGamer (`syncPocketGamerCodes`). El canje oficial (coupon.netmarble.com/sololv) no lista los códigos.
 *  - Retratos: su wiki de Fandom (solo-leveling-arise.fandom.com, imagen principal de la página del cazador) en el recolector (`withFeaturedIcons`).
 *  - Imágenes: el arte del aviso (cazador nuevo), el arte oficial de cada cazador y los artes principales de su web (`withSlaArt`).
 * Game8 (dejó de cubrir el juego en oct 2025) y DotGG (repite los mismos avisos) no se usan.
 * 2 listas + hasta 5 avisos por ciclo (caché de 3 h; los avisos no cambian).
 */
const FORUM = 'https://forum.netmarble.com/api/game/sololv/official/forum/slv_en'
const HOUR = 3_600_000
const DAY = 24 * HOUR

interface Article { id: number; title: string; regDate: number; content?: string; thumbnailUrl?: string; managerLanguageCds?: string[] }

/** Cada aviso dice para qué idiomas es (`managerLanguageCds`): el inglés va con los demás ("en_US", "zh_TW"…) y el francés aparte ("fr_FR"). */
const isEnglish = (a: Article) => (a.managerLanguageCds ? a.managerLanguageCds.includes('en_US') : !/&[a-z]+;/i.test(a.title.replace(/&(?:amp|#39|quot);/g, '')))
const clean = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|’/g, "'").replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()

/** "11/19 (Thu) 00:00" → ms en UTC (año: el del aviso, o el siguiente si la fecha queda muy atrás: "01/14" en un aviso de noviembre). */
function md(s: string, posted: number): { at: number; time: boolean } | null {
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:\([A-Za-z]{3,4}\))?\s*(?:(\d{1,2}):(\d{2}))?/.exec(s)
  if (!m) return null
  const y0 = m[3] ? +m[3] : new Date(posted).getUTCFullYear()
  const at = (y: number) => Date.UTC(y, +m[1] - 1, +m[2], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
  return { at: !m[3] && at(y0) < posted - 60 * DAY ? at(y0 + 1) : at(y0), time: !!m[4] }
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const PERIOD = /\d{1,2}\/\d{1,2}.*?\s(?:to|-|~)\s.*?\d{1,2}\/\d{1,2}/i

/** "After maintenance on 11/19 (Thu) to 12/17 (Thu) 00:00" → [inicio, fin, inicio aproximado]. `maint`: fin del mantenimiento por día (YYYY-MM-DD). */
export function slaPeriod(line: string, posted: number, maint: Map<string, number>): [number, number, boolean] | null {
  const parts = line.replace(/^[-•\s]+/, '').split(/\s+(?:to|-|~)\s+(?=\d)/i)
  if (parts.length < 2) return null
  const s = md(parts[0], posted), e = md(parts[1], posted)
  if (!s || !e) return null
  // Fin sin hora: el día entero (hasta las 23:59 UTC).
  const end = e.time ? e.at : e.at + DAY - 60_000
  if (/after\s+(?:the\s+)?maintenance/i.test(parts[0])) {
    const real = maint.get(dayOf(s.at))
    return [real ?? s.at + 8 * HOUR, end, !real]
  }
  return [s.at, end, !s.time]
}

/** Fin de cada mantenimiento ("- 11/18 (Wed) 23:50 - 11/19 (Thu) 08:30 (UTC+0)") por el día en que acaba. */
export function slaMaintenance(a: Article): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of htmlText(a.content ?? '').split('\n')) {
    if (!/\(UTC\+0\)/.test(l) || !PERIOD.test(l)) continue
    const parts = l.replace(/^[-•\s]+/, '').split(/\s+(?:to|-|~)\s+(?=\d)/i)
    const e = parts[1] && md(parts[1], a.regDate)
    if (e && e.time) out.set(dayOf(e.at), e.at)
  }
  return out
}

const NUMBERED = /^(?:[0-9]️?⃣|\d+[.)])\s*(.+)$/u
const SECTION = /^[📌📢]/u
const isPeriod = (l: string) => PERIOD.test(l) && /\d{1,2}\/\d{1,2}/.test(l)

interface Draft { title: string; period: [number, number, boolean]; banner?: boolean; description?: string }

/** Eventos y banners de un aviso del tablón "Events". */
export function slaNotice(gameId: string, a: Article, maint: Map<string, number>): GameEvent[] {
  const html = (a.content ?? '').replace(/<img[^>]*\bsrc="([^"]+)"[^>]*>/gi, '\n⟪img:$1⟫\n')
  const lines = htmlText(html).split('\n').map(clean).filter(Boolean)
  // Imágenes del aviso: la cabecera (.gif, genérica: "Events") y, al pie, la miniatura del tablón (genérica también) no ilustran nada. La única
  // propia es la del cuerpo ("_d.jpg" antes del "Thank you."): el arte del cazador nuevo en los avisos de banner.
  const tail = lines.findIndex(l => /^thank you/i.test(l))
  const art = lines.slice(0, tail > 0 ? tail : undefined).map(l => /^⟪img:(.+_d\.jpg)⟫$/.exec(l)?.[1]).find(Boolean)
  const text = lines.filter(l => !/^⟪img/.test(l))
  const drafts: Draft[] = []
  const per = (l: string) => slaPeriod(l, a.regDate, maint)
  const title = clean(a.title).replace(/\s*\((?:edited|updated)[^)]*\)\s*$/i, '')

  for (let i = 0; i < text.length; i++) {
    const l = text[i]
    // Banner: "✨ Thalia De Rossi ✨" + periodo (en la línea siguiente o en la misma).
    const star = /^✨\s*([^✨]+?)\s*✨\s*(.*)$/u.exec(l)
    if (star) {
      const p = isPeriod(star[2]) ? per(star[2]) : text[i + 1] && isPeriod(text[i + 1]) ? per(text[i + 1]) : null
      if (p) drafts.push({ title: star[1].trim(), period: p, banner: true })
      continue
    }
    // Tabla "Event Name / Schedule(UTC+0)": pares nombre-periodo hasta la siguiente sección.
    if (/^schedule\s*\(utc\+0\)$/i.test(l)) {
      let last: [number, number, boolean] | null = null
      for (let j = i + 1; j < text.length && !SECTION.test(text[j]); j++) {
        // La de los banners ("Hunter / Schedule (UTC+0)", filas "✨Nombre✨") la lee la regla de arriba.
        if (isPeriod(text[j]) || /^✨/u.test(text[j])) continue
        const p: [number, number, boolean] | null = text[j + 1] && isPeriod(text[j + 1]) ? per(text[j + 1]) : last
        if (p) { drafts.push({ title: text[j], period: p }); last = p }
      }
      continue
    }
    // Bloque "📌 Event Period / Event Schedule" + "- periodo", con los eventos numerados debajo (o el propio aviso).
    if (/^📌\s*event (?:period|schedule|duration)$/iu.test(l) && text[i + 1] && isPeriod(text[i + 1])) {
      const p = per(text[i + 1])
      if (!p) continue
      const subs: Draft[] = []
      for (let j = i + 2; j < text.length && !/^📢/u.test(text[j]); j++) {
        const n = NUMBERED.exec(text[j])
        if (n) subs.push({ title: n[1].replace(/^[^\p{L}\d]+/u, '').trim(), period: p, description: text.slice(j + 1).find(x => /^-\s/.test(x))?.replace(/^-\s*/, '') })
      }
      drafts.push(...(subs.length ? subs : [{ title: title.replace(/\s+(?:event\s+)?notice$/i, ''), period: p }]))
    }
  }

  // "📌 Key Rewards": una tabla con el nombre de cada evento en una fila y, en la de debajo y en la misma columna, sus recompensas (una por línea).
  // Sin tabla, la lista de debajo del título vale para todos los eventos del aviso.
  const rewards = new Map<string, string[]>()
  const names = new Set(drafts.map(d => d.title.toLowerCase()))
  const kr = (a.content ?? '').search(/Key Rewards/i)
  if (kr >= 0) {
    const after = (a.content ?? '').slice(kr)
    const table = /^[\s\S]{0,400}?<table[\s\S]*?<\/table>/i.exec(after)?.[0]
    const cellLines = (c: string) => htmlText(c.replace(/<\/p>\s*<p[^>]*>/gi, '\n')).split('\n').map(clean).filter(Boolean)
    if (table) {
      const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => cellLines(c[1])))
      rows.forEach((row, i) => {
        if (!row.length || !row.every(c => c.length === 1 && names.has(c[0].toLowerCase())) || !rows[i + 1]) return
        row.forEach((c, j) => rewards.set(c[0].toLowerCase(), rows[i + 1][j] ?? []))
      })
    } else {
      const k = text.findIndex(l => /^📌\s*key rewards/iu.test(l))
      for (const l of k >= 0 ? text.slice(k + 1) : []) {
        if (SECTION.test(l) || /^※/.test(l) || /^thank/i.test(l)) break
        if (!names.has(l.toLowerCase()) && l.length <= 60) rewards.set('', [...(rewards.get('') ?? []), l])
      }
    }
  }
  const itemsOf = (d: Draft): { items: RewardItem[]; pulls: number } => {
    const named = rewards.get(d.title.toLowerCase()) ?? rewards.get('') ?? []
    const useful = named.filter(n => !/^various /i.test(n))
    const r = pullsIn('sla', useful)
    // Nombre limpio para encontrar su icono en la wiki ("[Legendary] Skill Rune Chest" → "Legendary Skill Rune Chest", "Artifact Enhancement Reset
    // Ticket (Limited Time)" → "Artifact Enhancement Reset Ticket", "「Upgraded Wheel」 Event Tickets" → "Upgraded Wheel Event Tickets").
    const tidy = (n: string) => n.replace(/^\[([^\]]+)\]\s*/, '$1 ').replace(/\s*\((?:limited time|limited)\)\s*$/i, '').replace(/[「」『』]/g, '').replace(/\s+/g, ' ').trim()
    return r.items.length ? r : { items: useful.slice(0, 6).map(name => ({ name: tidy(name), amount: 0 })), pulls: 0 }
  }

  const now = Date.now()
  const seen = new Set<string>()
  const debut = drafts.find(d => d.banner && title.toLowerCase().includes(d.title.toLowerCase()))?.title
  return drafts.filter(d => d.title && d.period[1] > now - 3 * DAY && !seen.has(d.title) && seen.add(d.title)).map(d => {
    const [start, end, approx] = d.period
    const r = d.banner ? { items: [], pulls: 0 } : itemsOf(d)
    return {
      id: `${gameId}:${d.banner ? 'banner' : 'event'}:nm:${d.title}:${dayOf(start)}`, gameId, kind: d.banner ? 'banner' as const : 'event' as const,
      // El arte del aviso es del cazador que debuta (el del título del aviso: "Thalia De Rossi Debut Celebration!"); el resto lo pone `withArt`.
      // Los eventos de su debut ("Thalia De Rossi Advancement Event") también.
      title: d.banner ? `${d.title} Rate Up Draw` : d.title, image: art && debut && (d.banner ? d.title === debut : d.title.includes(debut)) ? art : undefined,
      description: d.description,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      items: r.items, pulls: r.pulls, featured: d.banner ? [{ name: d.title, rarity: 5, tag: 'SSR' }] : [],
      minor: /community|winners|quiz|guide event|fan ?art|which .* suits you/i.test(`${a.title} ${d.title}`) ? true : undefined,
      source: 'api' as const, official: true, precision: approx ? 'approx' as const : undefined,
    }
  })
}

async function list(menu: number, start = 0): Promise<Article[]> {
  const res = await fetch(viaProxy(`${FORUM}/article/list?menuSeq=${menu}&start=${start}&rows=12`))
  if (!res.ok) throw new Error(`netmarble SLA ${menu} → HTTP ${res.status}`)
  return ((await res.json())?.articleList ?? []) as Article[]
}
const article = (id: number, menu: number) => fetch(viaProxy(`${FORUM}/article/${id}?menuSeq=${menu}`)).then(r => (r.ok ? r.json() : null)).then(d => (d?.article ?? null) as Article | null).catch(() => null)

export async function syncSlaNews(gameId: string): Promise<GameSync> {
  const [events, notices0] = await Promise.all([list(34), list(32).catch(() => [] as Article[])])
  // Los avisos de mantenimiento salen 1–2 días antes de la actualización y el tablón mezcla inglés y francés: si no hay ninguno, la página siguiente.
  const isMaint = (a: Article) => isEnglish(a) && /maintenance/i.test(a.title) && !/payment|xsolla/i.test(a.title)
  // Los eventos de hasta 45 días atrás empiezan "after maintenance" de su actualización: hacen falta los avisos de las 2 últimas (una al mes), que
  // pueden estar hasta en la 4.ª o 5.ª página del tablón (el del 22 oct 2026 salía en la 4.ª el 27 nov).
  const notices = [...notices0]
  for (let start = 12; start <= 48 && notices.filter(isMaint).length < 2; start += 12) notices.push(...await list(32, start).catch(() => [] as Article[]))
  // Fin de los mantenimientos recientes (los 2 últimos avisos de mantenimiento en inglés).
  const maint = new Map<string, number>()
  for (const a of notices.filter(isMaint).slice(0, 3)) {
    const d = await article(a.id, 32)
    if (d) for (const [k, v] of slaMaintenance(d)) maint.set(k, v)
  }
  const recent = events.filter(a => isEnglish(a) && Date.now() - a.regDate < 45 * DAY && !/winner/i.test(a.title)).slice(0, 4)
  const out: GameEvent[] = []
  for (const a of recent) {
    const d = await article(a.id, 34)
    if (d) out.push(...slaNotice(gameId, { ...d, thumbnailUrl: d.thumbnailUrl ?? a.thumbnailUrl }, maint))
  }
  if (!events.length) throw new Error('netmarble SLA: sin avisos')
  return { events: out, patches: [], codes: [] }
}

/**
 * Arte oficial de la web del juego (sololeveling.netmarble.com; la API de contenidos que usa su página, cms-api.netmarble.com/api/content/234):
 * categoría 1120, el arte de cada cazador (`ChImg`, 1130×750, fondo transparente; aún sin los últimos, p. ej. Thalia y Agnes el 27 nov 2026), y 1189,
 * los artes principales del juego (1920×1080). Una petición de ~60 KB (caché de 24 h).
 */
const CMS = 'https://cms-api.netmarble.com/api/content/234?categorySeqStr=1120,1189&languageCd=en'
async function officialArt(): Promise<{ hunters: Map<string, string>; key: string[] }> {
  const res = await fetch(viaProxy(CMS))
  if (!res.ok) throw new Error(`cms SLA → HTTP ${res.status}`)
  const d = (await res.json())?.resultData ?? {}
  const hunters = new Map<string, string>()
  for (const h of (d['1120']?.resultList ?? []) as { chNameTxt?: string; ChImg?: string; isShow?: boolean }[]) if (h.chNameTxt && h.ChImg && !hunters.has(h.chNameTxt.toLowerCase())) hunters.set(h.chNameTxt.toLowerCase(), h.ChImg)
  const key = ((d['1189']?.resultList ?? []) as { image?: string }[]).map(x => x.image).filter((u): u is string => !!u && /\.(jpe?g|png|webp)$/i.test(u))
  return { hunters, key }
}

/**
 * Imagen de cada banner y evento: la del aviso si la tiene; si no, el arte oficial del cazador (banners y eventos con su nombre: "Thalia De Rossi
 * Advancement Event") o, para los que no son de ningún cazador, uno de los artes principales del juego (siempre el mismo para el mismo evento). Los
 * avisos no ilustran cada evento: solo traen la cabecera genérica "Events". Los cazadores sin arte en la web (los más nuevos) se quedan sin imagen y
 * la app muestra su retrato de la wiki (bannerArt).
 */
export function withSlaArt(events: GameEvent[], art: { hunters: Map<string, string>; key: string[] }): GameEvent[] {
  const names = [...art.hunters.keys()].sort((a, b) => b.length - a.length)
  const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return events.map(e => {
    if (e.image) return e
    const who = e.featured[0]?.name.toLowerCase() ?? names.find(n => e.title.toLowerCase().includes(n))
    const own = who ? art.hunters.get(who) : undefined
    if (own) return { ...e, image: own }
    if (e.kind === 'banner' || (who && !own) || !art.key.length) return e
    return { ...e, image: art.key[hash(e.title) % art.key.length] }
  })
}

export async function syncSla(gameId: string): Promise<GameSync> {
  const [n, c, art] = await Promise.allSettled([syncSlaNews(gameId), syncPocketGamerCodes('solo-leveling-arise'), officialArt()])
  if (n.status === 'rejected' && c.status === 'rejected') throw n.reason
  if (n.status === 'rejected') console.warn('[sla] foro:', (n.reason as Error)?.message)
  if (c.status === 'rejected') console.warn('[sla] códigos:', (c.reason as Error)?.message)
  if (art.status === 'rejected') console.warn('[sla] arte:', (art.reason as Error)?.message)
  const events = n.status === 'fulfilled' ? n.value.events : []
  return { events: art.status === 'fulfilled' ? withSlaArt(events, art.value) : events, patches: [], codes: c.status === 'fulfilled' ? c.value : [] }
}
