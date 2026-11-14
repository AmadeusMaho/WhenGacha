import { useSyncExternalStore } from 'react'
import { CATALOG } from './catalog'
import { viaProxy } from './net'
import { econOf } from './pullPlan'
import type { AppState, Featured, Game, GameEvent } from './types'

/**
 * Imágenes automáticas desde las wikis de cada juego (API de MediaWiki):
 *  - imagen del artículo de un evento cuando no trae una propia,
 *  - splash art de los personajes de los banners,
 *  - fondo (wallpaper) de cada juego, a partir de la imagen de su versión actual,
 *  - imagen representativa del juego.
 * Los resultados se guardan en localStorage para no repetir consultas.
 */
const KEY = 'whengacha:imgs:v2'
const MISS_RETRY = 3 * 86_400_000
const HIT_TTL = 60 * 86_400_000

interface Entry { u: string; at: number; v?: string }

function load(): Record<string, Entry> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

const mem = load()
// v2 → criterio nuevo de imágenes de evento (6 nov 2026): se olvidan las `e:` guardadas con la búsqueda antigua, que podía dar cruces.
const EV_RULES = 'whengacha:imgs:ev-rules'
try {
  if (localStorage.getItem(EV_RULES) !== '2') {
    for (const k of Object.keys(mem)) if (k.startsWith('e:')) delete mem[k]
    localStorage.setItem(KEY, JSON.stringify(mem))
    localStorage.setItem(EV_RULES, '2')
  }
} catch { /* sin localStorage */ }
const listeners = new Set<() => void>()
let version = 0
const queue: { key: string; v?: string; run: () => Promise<string> }[] = []
const seen = new Set<string>()
let running = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined

const emit = () => { version++; listeners.forEach(l => l()) }

function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(mem)) } catch { /* ignorar */ } }, 500)
}

function pump() {
  while (running < 3 && queue.length) {
    const job = queue.shift()!
    running++
    job.run()
      .then(u => { mem[job.key] = { u, at: Date.now(), v: job.v }; save(); if (u) emit() })
      .catch(() => { /* se reintenta en la próxima sesión */ })
      .finally(() => { running--; setTimeout(pump, 200) })
  }
}

function want(key: string, run: () => Promise<string>, v?: string) {
  const token = `${key}|${v ?? ''}`
  if (seen.has(token)) return
  const hit = mem[key]
  if (hit && hit.v === v && Date.now() - hit.at < (hit.u ? HIT_TTL : MISS_RETRY)) return
  seen.add(token)
  queue.push({ key, v, run })
}

/* ---------- consultas a MediaWiki ---------- */
const api = (host: string, params: Record<string, string>) =>
  !host ? Promise.reject(new Error('sin wiki')) : fetch(viaProxy(`https://${host}/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`)).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

type Thumb = { index?: number; title: string; thumbnail?: { source: string } }

/** Imagen principal del artículo que mejor coincide con la búsqueda. */
async function searchImage(host: string, q: string, size = 480): Promise<string> {
  const json = await api(host, { action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '4', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(size) })
  const pages = Object.values(json?.query?.pages ?? {}) as Thumb[]
  return pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).find(p => p.thumbnail)?.thumbnail?.source ?? ''
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4))

/**
 * Imagen de un evento (mismo criterio que el recolector, `withWikiImages` en collector.ts): archivo "<título>.png" o artículo con ese
 * título exacto; si no, la búsqueda, pero solo si el artículo encontrado comparte alguna palabra con el título (evita cruces
 * como la galería de un personaje o la página genérica "Events").
 */
async function eventSearchImage(host: string, q: string): Promise<string> {
  const exact = await api(host, { action: 'query', titles: `File:${q}.png|${q}`, redirects: '1', prop: 'pageimages|imageinfo', piprop: 'thumbnail', pithumbsize: '480', iiprop: 'url', iiurlwidth: '480' })
  const ex = Object.values(exact?.query?.pages ?? {}) as (Thumb & { imageinfo?: { thumburl?: string; url: string }[] })[]
  const file = ex.find(p => p.imageinfo?.[0])?.imageinfo?.[0]
  const hit = file?.thumburl ?? file?.url ?? ex.find(p => p.thumbnail)?.thumbnail?.source
  if (hit) return hit
  const want = words(q)
  const json = await api(host, { action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '4', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '480' })
  const pages = Object.values(json?.query?.pages ?? {}) as Thumb[]
  return pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).find(p => p.thumbnail && [...words(p.title)].some(w => want.has(w)))?.thumbnail?.source ?? ''
}

/** Imagen principal de un artículo concreto (siguiendo redirecciones). */
async function pageImage(host: string, title: string, size: number): Promise<string> {
  const json = await api(host, { action: 'query', titles: title, redirects: '1', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(size) })
  const pages = Object.values(json?.query?.pages ?? {}) as Thumb[]
  return pages.find(p => p.thumbnail)?.thumbnail?.source ?? ''
}

/** Primer archivo existente de una lista de candidatos (en orden de preferencia). */
async function firstFile(host: string, titles: string[], width: number): Promise<string> {
  if (!titles.length) return ''
  const json = await api(host, { action: 'query', titles: titles.map(t => `File:${t}`).join('|'), prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(width) })
  const pages = Object.values(json?.query?.pages ?? {}) as { title: string; imageinfo?: { thumburl?: string; url: string }[] }[]
  const byTitle = new Map(pages.filter(p => p.imageinfo).map(p => [p.title.replace(/^File:/, '').replace(/_/g, ' '), p.imageinfo![0].thumburl ?? p.imageinfo![0].url]))
  for (const t of titles) { const u = byTitle.get(t.replace(/_/g, ' ')); if (u) return u }
  return ''
}

/** Juegos donde el banner se ilustra con el splash del personaje; en el resto se muestra la imagen real del banner. */
const SPLASH_GAMES = new Set(['genshin', 'hsr', 'zzz', 'endfield'])

/** Nombres de archivo con el arte de un personaje, según la convención de cada wiki. */
function splashCandidates(gameId: string, f: Featured): string[] {
  const n = f.name
  switch (gameId) {
    case 'genshin': return [`Character ${n} Full Wish.png`, `${n} Wish.png`]
    case 'hsr': return [`Character ${n} Splash Art.png`]
    case 'zzz': return [`Agent ${f.full ?? n} Portrait.png`, `Agent ${n} Portrait.png`]
    case 'endfield': return [`${n} Splash Art.png`]
    default: return []
  }
}

const cleanTitle = (s: string) => s.replace(/\(.*?\)|\/Rerun|\bRerun\b|[“”"]/gi, ' ').replace(/\s+/g, ' ').trim()

/* ---------- lectura (síncrona, desde caché) ---------- */
/** Imagen de un evento: la propia, la buscada en la wiki, o un icono de recompensa/personaje. */
export function eventImage(e: GameEvent): string | undefined {
  return e.image || mem[`e:${e.id}`]?.u || e.items[0]?.icon || e.featured[0]?.icon || wallpaperOf(e.gameId) || officialArt(e.gameId) || gameImage(e.gameId) || undefined
}

/** Un logo o icono de la wiki no sirve de portada ni de fondo ("Site-logo.png" de NIKKE, "RE1999_icon.png"…). */
const LOGO = /logo|[_\s-]icon[_.\s]|wordmark/i
const realArt = (u?: string) => (u && !LOGO.test(decodeURIComponent(u)) ? u : undefined)

/** Arte oficial del juego (captura promocional de la App Store, en el catálogo). */
export function officialArt(gameId: string): string | undefined {
  return CATALOG.find(g => g.id === gameId)?.art
}

/** Imagen representativa de un juego (artículo del juego en su wiki). */
export function gameImage(gameId: string): string | undefined {
  return realArt(mem[`g:${gameId}`]?.u)
}

/** Icono oficial de la app del juego, si el catálogo indica uno. */
export function logoOf(gameId: string): string | undefined {
  return CATALOG.find(g => g.id === gameId)?.logo
}

/** Splash art de un personaje (si se encontró). */
export function splashOf(gameId: string, f?: Featured): string | undefined {
  return f && SPLASH_GAMES.has(gameId) ? mem[`s:${gameId}:${f.name}`]?.u || undefined : undefined
}

/** Cara/retrato pequeño: el icono oficial; si no hay, el splash art recortado por CSS; si tampoco, la imagen de su página en la wiki. */
export function faceOf(gameId: string, f: Featured): string | undefined {
  return f.icon || splashOf(gameId, f) || mem[`f:${gameId}:${f.name}`]?.u || undefined
}

/** Arte principal de un banner: splash del personaje destacado, o la imagen del propio banner. */
export function bannerArt(e: GameEvent): string | undefined {
  // Sin arte propio (p. ej. los banners de PGR, que sus notas no ilustran): el arte de la versión actual del juego o, si no, su arte oficial.
  return splashOf(e.gameId, e.featured[0]) || e.image || mem[`e:${e.id}`]?.u || e.featured[0]?.icon || wallpaperOf(e.gameId) || officialArt(e.gameId) || undefined
}

/** Fondo del juego. */
export function wallpaperOf(gameId: string): string | undefined {
  return realArt(mem[`w:${gameId}`]?.u)
}

/* ---------- pedidos ---------- */
function currentPatch(state: AppState, gameId: string) {
  const now = Date.now()
  return state.patches.find(p => p.gameId === gameId && !p.estimated && +new Date(p.date) <= now && (!p.end || +new Date(p.end) > now))
}

/**
 * Juegos cuyo fondo NO se busca en la wiki: la búsqueda devuelve una imagen que no sirve (FGO: "FGOver.png", una captura de una página de
 * descarga del APK). Se quedan con su arte oficial de la tienda (`officialArt`).
 */
const NO_WALL_SEARCH = new Set(['fgo'])

/** Pide las imágenes que falten y devuelve un contador que cambia cuando llegan nuevas. */
export function useImages(state: AppState): number {
  const games = new Map<string, Game>(CATALOG.map(g => [g.id, g]))

  for (const g of CATALOG) {
    want(`g:${g.id}`, async () => (g.wallpaper && (await firstFile(g.wiki.host, [g.wallpaper], 800))) || (g.id === 'endfield' && (await firstFile(g.wiki.host, ['Launch key visual.jpg'], 800))) || searchImage(g.wiki.host, g.wiki.q), g.wallpaper)
  }

  for (const id of state.tracked) {
    const g = games.get(id)
    if (!g) continue
    const cur = currentPatch(state, id)
    const ver = cur?.version
    want(`w:${id}`, async () => {
      if (g.wallpaper) {
        const u = await firstFile(g.wiki.host, [g.wallpaper], 1600).catch(() => '')
        if (u) return u
      }
      if (id === 'endfield') {
        // La wiki de Endfield guarda la imagen de cada versión como "<nombre de la versión> version.png".
        const u = await firstFile(g.wiki.host, [cur?.name ? `${cur.name} version.png` : '', 'Launch key visual.jpg'].filter(Boolean), 1600).catch(() => '')
        if (u) return u
      }
      if (ver) {
        const u = await pageImage(g.wiki.host, `Version ${ver}`, 1600).catch(() => '')
        if (u) return u
      }
      // Sin versión ni fondo propio, se busca en la wiki; en los juegos de NO_WALL_SEARCH esa búsqueda da basura y se usa el arte oficial.
      if (NO_WALL_SEARCH.has(id)) return ''
      return searchImage(g.wiki.host, g.wiki.q, 1600)
    }, `${ver ?? ''}|${cur?.name ?? ''}|${g.wallpaper ?? ''}${NO_WALL_SEARCH.has(id) ? '|oficial' : ''}`) // si cambia el fondo del catálogo, se vuelve a buscar
  }

  // Iconos de la moneda y del billete promocional de cada juego para la calculadora de tiradas (Planner.tsx): la imagen de su página en la
  // wiki, solo si ningún evento trae ya el icono oficial (itemIcon). Una consulta por moneda y juego, guardada como las demás.
  for (const id of state.tracked) {
    const g = games.get(id)
    if (!g?.wiki.host) continue
    const econ = econOf(g)
    for (const name of [econ.icon, econ.ticket]) {
      if (!name) continue
      // Página de la moneda; si no tiene imagen, el archivo "Item <nombre>.png" (la convención de Fandom) o variantes en singular.
      const one = name.replace(/s$/, '')
      if (!eventItemIcon(state, id, name)) want(`c:${id}:${name}`, async () => (await pageImage(g.wiki.host, name, 64).catch(() => ''))
        || firstFile(g.wiki.host, [...new Set([`Item ${name}.png`, `Item ${one}.png`, `${name}.png`, `${one}.png`, `${name} icon.png`, `${name} Icon.png`, `Icon ${name}.png`])], 64), '3')
    }
  }

  for (const e of state.events) {
    const g = games.get(e.gameId)
    if (!g || !state.tracked.includes(e.gameId)) continue
    if (!e.image && e.kind !== 'banner') want(`e:${e.id}`, () => eventSearchImage(g.wiki.host, cleanTitle(e.title)))
    if (e.kind === 'banner') {
      for (const f of SPLASH_GAMES.has(e.gameId) ? e.featured.slice(0, 3) : []) {
        want(`s:${e.gameId}:${f.name}`, async () => (await firstFile(g.wiki.host, splashCandidates(e.gameId, f), 900)) || searchImage(g.wiki.host, f.name, 700))
      }
      // Resto de juegos: si la fuente no trae el icono del destacado, la imagen principal de SU página en la wiki (título exacto, sin
      // búsqueda, para no traer a otro personaje). Así la ventana del banner muestra a quién trae en vez de solo el nombre (10 nov 2026).
      // Sale en Arknights, NIKKE, NTE, Reverse: 1999, WuWa y PGR; CZN, Epic Seven, Limbus e Infinity Nikki no tienen esas páginas.
      if (!SPLASH_GAMES.has(e.gameId) && g.wiki.host) {
        for (const f of e.featured.slice(0, 3)) if (!f.icon) want(`f:${e.gameId}:${f.name}`, () => pageImage(g.wiki.host, f.full ?? f.name, 300))
      }
      if (!e.image && !e.featured.length) want(`e:${e.id}`, () => eventSearchImage(g.wiki.host, cleanTitle(e.title)))
    }
  }

  pump()
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => version,
  )
}

/** Icono oficial de una recompensa ("Primogem", "Stellar Jade"…) si algún evento del juego lo trae. Admite el plural ("Astrites"). */
function eventItemIcon(state: AppState, gameId: string, name: string): string | undefined {
  const n = name.toLowerCase()
  for (const e of state.events) {
    if (e.gameId !== gameId) continue
    // "Unique Remains: Clearwater Princess Knight" (Daphne) también vale para "Unique Remains".
    const it = e.items.find(i => i.icon && (i.name.toLowerCase() === n || i.name.toLowerCase() === `${n}s` || i.name.toLowerCase().startsWith(`${n}:`)))
    if (it) return it.icon
  }
  return undefined
}

/** Icono de una moneda o billete para la calculadora: el oficial de los eventos o el de su página en la wiki (vacío si no hay). */
export function itemIcon(state: AppState, gameId: string, name?: string): string | undefined {
  if (!name) return undefined
  return eventItemIcon(state, gameId, name) || mem[`c:${gameId}:${name}`]?.u || undefined
}
