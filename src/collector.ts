import { DOMParser } from 'linkedom'
import { CATALOG } from './catalog'
import { staleMs, syncSource } from './sources'
import type { Game, GameEvent, Patch, PromoCode } from './types'

/**
 * Punto de entrada del recolector del servidor (se empaqueta con `npm run build:server` en server/bundle/collector.mjs).
 * Reutiliza las mismas fuentes que la app (src/sources): el servidor las ejecuta con un DOM de Node (linkedom) y su propio
 * proxy con caché, y guarda el resultado ya normalizado por juego para que los jugadores solo descarguen esa copia.
 */
export interface Snapshot {
  id: string
  /** Momento (ms) en que se generó la copia. */
  updated: number
  events: GameEvent[]
  patches: Patch[]
  codes: PromoCode[]
}

const DAY = 86_400_000
const tkey = (t: string) => t.toLowerCase().replace(/\(.*?\)|[^a-z0-9]/g, '')

/**
 * Cuando una fuente falla en un ciclo, sus eventos no desaparecen: se conservan los vigentes de la copia anterior que la nueva no tiene ni
 * tiene con otro nombre (mismo tipo, uno de los nombres contiene al otro y fin a ±2 días). Caso real (12 nov 2026): GitHub Actions publicó la
 * copia de DNA sin nada de Game8 (bloquea las IP de servidores) y desaparecieron sus banners, que solo da Game8.
 * Cada evento arrastrado guarda `seen` (cuándo lo dio una fuente por última vez); a las 24 h sin confirmarse se suelta.
 */
export function carryOver(prev: Snapshot | null | undefined, next: Snapshot, now = Date.now()): Snapshot {
  if (!prev?.events?.length) return next
  const matches = (o: GameEvent) => next.events.some(n => n.id === o.id || ((n.kind === 'banner') === (o.kind === 'banner')
    && (tkey(n.title) === tkey(o.title) || tkey(n.title).includes(tkey(o.title)) || tkey(o.title).includes(tkey(n.title)))
    && Math.abs(Date.parse(n.end) - Date.parse(o.end)) <= 2 * DAY))
  const kept = prev.events
    .filter(o => Date.parse(o.end) > now && now - (o.seen ?? prev.updated) < DAY && !matches(o))
    .map(o => ({ ...o, seen: o.seen ?? prev.updated }))
  if (kept.length) console.warn(`[collector] ${next.id}: ${kept.length} elementos de la copia anterior (su fuente no respondió): ${kept.map(e => e.title).slice(0, 5).join(', ')}`)
  return kept.length ? { ...next, events: [...next.events, ...kept] } : next
}

/** Trae la URL de una fuente (a través del proxy del servidor, con su caché y sus límites). */
export type Fetcher = (url: string) => Promise<Response>

/** Prepara el entorno de Node para ejecutar el código de las fuentes, pensado para el navegador. */
export function setup(fetcher: Fetcher): void {
  const g = globalThis as Record<string, unknown>
  g.DOMParser = DOMParser
  const store = new Map<string, string>()
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  g.fetch = (input: string | URL | Request) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const m = /^\/proxy\?u=(.+)$/.exec(raw) // si la app se empaquetó con VITE_USE_PROXY, las URLs vienen como /proxy?u=...
    return fetcher(m ? decodeURIComponent(m[1]) : raw)
  }
}

/** Juegos con fuente de datos y cada cuánto conviene renovarlos (ms). */
export const games = () => CATALOG.filter(g => g.api).map(g => ({ id: g.id, every: staleMs(g) }))

export async function collect(id: string): Promise<Snapshot> {
  const game = CATALOG.find(g => g.id === id && g.api)
  if (!game) throw new Error(`juego desconocido: ${id}`)
  const s = await syncSource(game)
  const withArt = await withWikiImages(game, s.events).catch(() => s.events)
  const withFaces = await withFeaturedIcons(game, withArt).catch(() => withArt)
  const events = await withItemIcons(game, withFaces).catch(() => withFaces)
  return { id, updated: Date.now(), events, patches: s.patches, codes: s.codes }
}

/**
 * Imagen para los eventos que su fuente no ilustra: la del artículo de la wiki del juego que mejor coincide con el título
 * (la misma búsqueda que hacía cada navegador en `images.ts`; hecha aquí, la copia ya sale con imagen y los visitantes no repiten
 * consultas). Como mucho MAX_LOOKUPS por juego y ciclo, de una en una, empezando por lo vigente; el proxy las guarda 12 h.
 */
const MAX_LOOKUPS = 15
const cleanTitle = (s: string) => s.replace(/\(.*?\)|\/Rerun|\bRerun\b|[“”"]/gi, ' ').replace(/\s+/g, ' ').trim()

type WikiPage = { title: string; index?: number; thumbnail?: { source: string }; imageinfo?: { thumburl?: string; url: string }[] }

async function wikiQuery(host: string, params: Record<string, string>): Promise<WikiPage[]> {
  const qs = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params })
  try {
    const res = await fetch(`https://${host}/${host === 'bluearchive.wiki' ? 'w/' : ''}api.php?${qs}`)
    return Object.values(res.ok ? (await res.json())?.query?.pages ?? {} : {}) as WikiPage[]
  } catch { return [] }
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4))

/** Archivo con el nombre del evento (p. ej. "Tower of Adversity.png") o imagen principal de su artículo. */
async function exactThumb(host: string, q: string): Promise<string> {
  const pages = await wikiQuery(host, { titles: `File:${q}.png|${q}`, redirects: '1', prop: 'pageimages|imageinfo', piprop: 'thumbnail', pithumbsize: '480', iiprop: 'url', iiurlwidth: '480' })
  const file = pages.find(p => p.imageinfo?.[0])?.imageinfo?.[0]
  return file?.thumburl ?? file?.url ?? pages.find(p => p.thumbnail)?.thumbnail?.source ?? ''
}

/** Imagen del primer resultado con imagen; con `mustMatch`, solo si el título del artículo comparte alguna palabra con él. */
async function pageThumb(host: string, params: Record<string, string>, mustMatch?: string): Promise<string> {
  const want = mustMatch ? words(mustMatch) : null
  const pages = await wikiQuery(host, { prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '480', ...params })
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .find(p => p.thumbnail && (!want || [...words(p.title)].some(w => want.has(w))))?.thumbnail?.source ?? ''
}

async function withWikiImages(game: Game, events: GameEvent[]): Promise<GameEvent[]> {
  const host = game.wiki?.host
  if (!host) return events
  const now = Date.now()
  const todo = events
    .filter(e => !e.image && (e.kind !== 'banner' || !e.featured.length) && +new Date(e.end) > now)
    .sort((a, b) => Math.max(+new Date(a.start), now) - Math.max(+new Date(b.start), now))
  const found = new Map<string, string>() // título limpio -> imagen ('' = sin resultado)
  for (const e of todo) {
    const q = cleanTitle(e.title)
    if (!q || found.has(q)) continue
    if (found.size >= MAX_LOOKUPS) break
    // 1) archivo "<título>.png" o artículo con ese título exacto (una sola consulta); 2) la búsqueda, si comparte alguna palabra con el título.
    found.set(q, (await exactThumb(host, q)) || (await pageThumb(host, { generator: 'search', gsrsearch: q, gsrlimit: '4' }, q)))
  }
  return events.map(e => (e.image ? e : { ...e, image: found.get(cleanTitle(e.title)) || undefined }))
}

/**
 * Retratos de los destacados de los banners que su fuente no trae (13 nov 2026: faltaban en 15 juegos). Antes solo los buscaba cada navegador
 * con la imagen principal de la página del personaje (`images.ts`, PageImages), que las wikis de wiki.gg (Arknights, Endfield, Limbus, Path
 * to Nowhere, MONGIL) no tienen. Aquí se prueba, en este orden y en lotes de 50 archivos por consulta:
 *  1. El archivo de icono según la convención de la wiki (`ICON_FILES`, comprobadas una a una) y los genéricos "<nombre> icon.png"/"Icon.png"
 *     (Arknights, Endfield, Reverse: 1999, NTE).
 *  2. La imagen principal de la página del personaje (PageImages; solo Fandom e iopwiki), con el nombre completo (`full`) si lo hay.
 * Solo banners vigentes o próximos, como mucho 40 nombres por juego y ciclo; el proxy guarda las consultas 12 h. La copia ya sale con el
 * retrato y los navegadores no repiten la búsqueda (`faceOf` usa `icon` primero).
 */
const ICON_FILES: Partial<Record<string, (n: string) => string[]>> = {
  ptn: n => [`${n} Skin1 Icon.png`],
  mongil: n => [`${n.replace(/\s+/g, '')}Portrait.png`],
  gfl2: n => [`${n} Covenant Avatar.png`],
  wuwa: n => [`Resonator ${n}.png`],
}
const MAX_FACES = 40

async function withFeaturedIcons(game: Game, events: GameEvent[]): Promise<GameEvent[]> {
  const host = game.wiki?.host
  if (!host) return events
  const now = Date.now()
  const names = [...new Set(events.filter(e => e.kind === 'banner' && +new Date(e.end) > now).flatMap(e => e.featured.filter(f => !f.icon).map(f => f.full ?? f.name)))]
    .filter(n => n.length > 1 && !/[{}[\]|#<>]/.test(n)).slice(0, MAX_FACES)
  if (!names.length) return events
  const own = ICON_FILES[game.id]
  // Los archivos de icono llevan el nombre corto: "Groza (GFL2)" (página) → "Groza Covenant Avatar.png".
  const candidates = (full: string) => [...new Set([full, full.replace(/\s*\((?:GFL2|character)\)$/i, '')])].flatMap(n => [...(own ? own(n) : []), `${n} icon.png`, `${n} Icon.png`])
  const api = `https://${host}/${host === 'bluearchive.wiki' ? 'w/' : ''}api.php`
  const found = new Map<string, string>() // nombre → URL
  // 1) archivos de icono.
  // Con su capitalización: MediaWiki solo ignora la de la primera letra ("Resonator Lily.png" ≠ "Resonator lily.png").
  const list = [...new Set(names.flatMap(candidates))]
  const urlOf = new Map<string, string>()
  for (let i = 0; i < list.length; i += 50) {
    const qs = new URLSearchParams({ action: 'query', titles: list.slice(i, i + 50).map(f => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'url', iiurlwidth: '160', format: 'json', formatversion: '2', origin: '*' })
    try {
      const res = await fetch(`${api}?${qs}`)
      const pages = (res.ok ? (await res.json())?.query?.pages ?? [] : []) as { title: string; imageinfo?: { thumburl?: string; url: string }[] }[]
      for (const p of pages) { const info = p.imageinfo?.[0]; if (info) urlOf.set(p.title.replace(/^File:/, '').replace(/_/g, ' ').toLowerCase(), info.thumburl ?? info.url) }
    } catch { /* sin iconos de este lote */ }
  }
  for (const n of names) { const u = candidates(n).map(f => urlOf.get(f.toLowerCase())).find(Boolean); if (u) found.set(n, u) }
  // 2) imagen principal de la página (si la wiki tiene PageImages; en wiki.gg la consulta solo devuelve un aviso).
  const rest = names.filter(n => !found.has(n))
  for (let i = 0; i < rest.length; i += 50) {
    const qs = new URLSearchParams({ action: 'query', titles: rest.slice(i, i + 50).join('|'), redirects: '1', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '160', format: 'json', formatversion: '2', origin: '*' })
    try {
      const res = await fetch(`${api}?${qs}`)
      const j = res.ok ? await res.json() : null
      const back = new Map<string, string>() // título final → pedido (redirecciones y normalización)
      for (const r of [...(j?.query?.normalized ?? []), ...(j?.query?.redirects ?? [])] as { from: string; to: string }[]) back.set(r.to, back.get(r.from) ?? r.from)
      for (const p of (j?.query?.pages ?? []) as { title: string; thumbnail?: { source: string } }[]) {
        const asked = back.get(p.title) ?? p.title
        // Un logo o la imagen genérica de la wiki no es un retrato.
        if (p.thumbnail && !/logo|wiki[-_ ]?(?:icon|wordmark)/i.test(p.thumbnail.source)) found.set(asked, p.thumbnail.source)
      }
    } catch { /* sin retratos de este lote */ }
  }
  if (!found.size) return events
  return events.map(e => (e.kind === 'banner' && e.featured.some(f => !f.icon && found.has(f.full ?? f.name))
    ? { ...e, featured: e.featured.map(f => (f.icon ? f : { ...f, icon: found.get(f.full ?? f.name) ?? f.icon })) } : e))
}

/**
 * Iconos de las recompensas que no los traen (todas salvo las de ennead): el archivo del objeto en la wiki del juego, probando sus convenciones
 * ("Item Primogem.png" en HoYoverse y WuWa, "Unilog.png" en R:1999, "Black Card.png" en PGR…). En lotes de 45 archivos por consulta;
 * el proxy las guarda 12 h. Si un objeto no tiene icono en la wiki, se queda sin él (la ficha muestra solo el nombre).
 */
async function withItemIcons(game: Game, events: GameEvent[]): Promise<GameEvent[]> {
  const host = game.wiki?.host
  if (!host) return events
  const names = [...new Set(events.flatMap(e => e.items.filter(i => !i.icon).map(i => i.name)))].slice(0, 60)
  if (!names.length) return events
  // También en singular ("Vouchers" → "Voucher") y sin "Exclusive" (NIKKE: "Item Selective Recruitment Voucher.png").
  // Y con el número romano final en Unicode (Endfield: "Advanced Progression Selection Crate II" → "… Crate Ⅱ.png").
  const ROMAN: Record<string, string> = { I: 'Ⅰ', II: 'Ⅱ', III: 'Ⅲ', IV: 'Ⅳ', V: 'Ⅴ', VI: 'Ⅵ' }
  const roman = (n: string) => n.replace(/ (I{1,3}|IV|VI?)$/, (_m, r: string) => ` ${ROMAN[r]}`)
  const bases = (n: string) => { const one = n.replace(/ies$/, 'y').replace(/(?<!s)s$/, ''); return [...new Set([n, one, one.replace(/\bExclusive\s+/i, ''), roman(n)])] }
  const variants = (n: string) => bases(n).flatMap(b => [`Item ${b}.png`, `${b}.png`, `${b} Icon.png`, `Icon ${b}.png`])
  const found = new Map<string, string>() // nombre de archivo (normalizado) → URL
  const files = names.flatMap(variants)
  for (let i = 0; i < files.length; i += 45) {
    const qs = new URLSearchParams({ action: 'query', titles: files.slice(i, i + 45).map(f => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'url', iiurlwidth: '64', format: 'json', formatversion: '2', origin: '*' })
    try {
      const res = await fetch(`https://${host}/${host === 'bluearchive.wiki' ? 'w/' : ''}api.php?${qs}`)
      const pages = (res.ok ? (await res.json())?.query?.pages ?? [] : []) as { title: string; imageinfo?: { thumburl?: string; url: string }[] }[]
      for (const p of pages) {
        const info = p.imageinfo?.[0]
        if (info) found.set(p.title.replace(/^File:/, '').replace(/_/g, ' ').toLowerCase(), info.thumburl ?? info.url)
      }
    } catch { /* sin iconos de este lote */ }
  }
  const byFile = (n: string) => variants(n).map(v => found.get(v.toLowerCase())).find(Boolean)
  // 2) Los que no tienen archivo de icono (aspectos, trajes, estigmas, objetos con nombre propio): la imagen principal de la página del objeto
  //    (PageImages; Fandom e iopwiki, en wiki.gg no existe), como hace `withFeaturedIcons` con los retratos. Lotes de 50, redirecciones incluidas.
  const pageIcon = new Map<string, string>()
  const rest = names.filter(n => !byFile(n) && !/^(?:various|free)\b/i.test(n))
  for (let i = 0; i < rest.length; i += 50) {
    const qs = new URLSearchParams({ action: 'query', titles: rest.slice(i, i + 50).join('|'), redirects: '1', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '64', format: 'json', formatversion: '2', origin: '*' })
    try {
      const res = await fetch(`https://${host}/${host === 'bluearchive.wiki' ? 'w/' : ''}api.php?${qs}`)
      const j = res.ok ? await res.json() : null
      const back = new Map<string, string>()
      for (const r of [...(j?.query?.normalized ?? []), ...(j?.query?.redirects ?? [])] as { from: string; to: string }[]) back.set(r.to, back.get(r.from) ?? r.from)
      for (const p of (j?.query?.pages ?? []) as { title: string; thumbnail?: { source: string } }[])
        if (p.thumbnail && !/logo|wiki[-_ ]?(?:icon|wordmark)/i.test(p.thumbnail.source)) pageIcon.set((back.get(p.title) ?? p.title).toLowerCase(), p.thumbnail.source)
    } catch { /* sin iconos de este lote */ }
  }
  const icon = (n: string) => byFile(n) ?? pageIcon.get(n.toLowerCase())
  return events.map(e => (e.items.some(i => !i.icon) ? { ...e, items: e.items.map(i => (i.icon ? i : { ...i, icon: icon(i.name) })) } : e))
}
