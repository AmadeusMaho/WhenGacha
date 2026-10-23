import { useSyncExternalStore } from 'react'
import { CATALOG } from './catalog'
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
  fetch(`https://${host}/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`).then(r => {
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
  return e.image || mem[`e:${e.id}`]?.u || e.items[0]?.icon || e.featured[0]?.icon || wallpaperOf(e.gameId) || gameImage(e.gameId) || undefined
}

/** Imagen representativa de un juego (artículo del juego en su wiki). */
export function gameImage(gameId: string): string | undefined {
  return mem[`g:${gameId}`]?.u || undefined
}

/** Splash art de un personaje (si se encontró). */
export function splashOf(gameId: string, f?: Featured): string | undefined {
  return f && SPLASH_GAMES.has(gameId) ? mem[`s:${gameId}:${f.name}`]?.u || undefined : undefined
}

/** Cara/retrato pequeño: el icono oficial o, si no hay, el splash art recortado por CSS. */
export function faceOf(gameId: string, f: Featured): string | undefined {
  return f.icon || splashOf(gameId, f)
}

/** Arte principal de un banner: splash del personaje destacado, o la imagen del propio banner. */
export function bannerArt(e: GameEvent): string | undefined {
  return splashOf(e.gameId, e.featured[0]) || e.image || mem[`e:${e.id}`]?.u || e.featured[0]?.icon || undefined
}

/** Fondo del juego. */
export function wallpaperOf(gameId: string): string | undefined {
  return mem[`w:${gameId}`]?.u || undefined
}

/* ---------- pedidos ---------- */
function currentPatch(state: AppState, gameId: string) {
  const now = Date.now()
  return state.patches.find(p => p.gameId === gameId && !p.estimated && +new Date(p.date) <= now && (!p.end || +new Date(p.end) > now))
}

/** Pide las imágenes que falten y devuelve un contador que cambia cuando llegan nuevas. */
export function useImages(state: AppState): number {
  const games = new Map<string, Game>(CATALOG.map(g => [g.id, g]))

  for (const g of CATALOG) {
    want(`g:${g.id}`, async () => (g.id === 'endfield' && (await firstFile(g.wiki.host, ['Launch key visual.jpg'], 800))) || searchImage(g.wiki.host, g.wiki.q))
  }

  for (const id of state.tracked) {
    const g = games.get(id)
    if (!g) continue
    const cur = currentPatch(state, id)
    const ver = cur?.version
    want(`w:${id}`, async () => {
      if (id === 'endfield') {
        // La wiki de Endfield guarda la imagen de cada versión como "<nombre de la versión> version.png".
        const u = await firstFile(g.wiki.host, [cur?.name ? `${cur.name} version.png` : '', 'Launch key visual.jpg'].filter(Boolean), 1600).catch(() => '')
        if (u) return u
      }
      if (ver) {
        const u = await pageImage(g.wiki.host, `Version ${ver}`, 1600).catch(() => '')
        if (u) return u
      }
      return searchImage(g.wiki.host, g.wiki.q, 1600)
    }, `${ver ?? ''}|${cur?.name ?? ''}`)
  }

  for (const e of state.events) {
    const g = games.get(e.gameId)
    if (!g || !state.tracked.includes(e.gameId)) continue
    if (!e.image && e.kind !== 'banner') want(`e:${e.id}`, () => searchImage(g.wiki.host, cleanTitle(e.title)))
    if (e.kind === 'banner') {
      for (const f of SPLASH_GAMES.has(e.gameId) ? e.featured.slice(0, 3) : []) {
        want(`s:${e.gameId}:${f.name}`, async () => (await firstFile(g.wiki.host, splashCandidates(e.gameId, f), 900)) || searchImage(g.wiki.host, f.name, 700))
      }
      if (!e.image && !e.featured.length) want(`e:${e.id}`, () => searchImage(g.wiki.host, cleanTitle(e.title)))
    }
  }

  pump()
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => version,
  )
}
