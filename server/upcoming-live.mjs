// Próximos gachas automáticos (complementa la lista curada de src/upcoming.ts; ver docs/fuentes-y-proxy.md, "Próximos gachas").
// Cada 3 h (el RSS de Gematsu solo guarda unas 8 h de titulares): lee los titulares RSS de tres webs de noticias (Gematsu, GamingonPhone y Siliconera), saca el nombre del juego de los que hablan de un
// anuncio, prerregistro, beta o fecha, y lo busca en la App Store (API pública de Apple). Solo se añade si tiene ficha de JUEGO en reserva
// (fecha de salida futura): eso filtra el ruido y da fecha, icono y editor. Las entradas guardadas se revisan por su id en cada ciclo y
// se quitan 14 días después de salir. Resultado en GET /data/upcoming.json.
// Todo pasa por el proxy (sourceFetch: lista cerrada, caché, cola por sitio). De las noticias solo se guarda el titular y su enlace.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceFetch } from './proxy.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.resolve(HERE, '../.cache')
const FILE = path.join(DATA_DIR, 'upcoming.json')
const HOUR = 3_600_000
const DAY = 24 * HOUR
const REPO = process.env.SNAPSHOT_REPO || 'AmadeusMaho/WhenGacha'
const BRANCH = process.env.SNAPSHOT_BRANCH || 'data'

const FEEDS = [
  { site: 'Gematsu', url: 'https://www.gematsu.com/feed' },
  { site: 'GamingonPhone', url: 'https://gamingonphone.com/feed/' },
  // Siliconera: su robots.txt permite el feed, pero Cloudflare corta las IP de servidores (403 en Botkeep, 13 nov 2026). Solo desde el PC
  // del dueño y Actions (scripts/snapshot.mjs, `allFeeds`); el servidor no lo pide para no acumular rechazos.
  { site: 'Siliconera', url: 'https://www.siliconera.com/feed/', notServer: true },
]
/** Máximo de búsquedas nuevas en la App Store por ciclo (la API admite ~20/min; el proxy las espacia 3,5 s). */
const MAX_SEARCHES = 25

/** Titulares que anuncian un juego por salir. */
const NEWS = /pre-?regist|release date|launch(es|ing)?\b|global (release|launch|version)|closed beta|open beta|\bbeta test|\bCBT\b|announced|announces|reveal|coming (to|in|soon)|arrives|sets .*(date|launch)|smartphone|mobile/i
/** Donde acaba el nombre del juego en el titular. */
const CUT = /\s+(?:launches|launching|launch|gets|sets|opens|opening|is|are|will|now|coming|arrives|arriving|announced|announces|reveals|revealed|confirms|confirmed|begins|starts|kicks|adds|hits|surpasses|passes|reaches|crosses|teases|shows|details|unveils|drops|enters|heads|lands|goes|receives|celebrates|pre-registrations?|pre-register|closed|open|global|release|first|official|prologue|test|beta|cbt|playtest|trailer|gameplay|version|update|for|with|x)\b|\s+[–—|-]\s+/i
/** "Juego: frase…" — los dos puntos solo cortan si sigue una minúscula ("Honkai: Nexus Anima" se queda entero). Sin /i a propósito. */
const COLON = /:\s+(?=[a-z])/
/** Palabras sueltas al final del nombre que no son parte de él ("Medabots S Game" → "Medabots S"). */
const TAIL = /\s+(game|mobile|app|rpg|gacha)$/i
/** Juegos de pago único o sin gacha que la App Store también tiene en reserva: no interesan. */
const NOT_GACHA = /\b(remaster|remake|port|edition|collection|bundle|soundtrack|dlc)\b/i
const GACHA_GENRES = /adventure|simulation|action|casual/i
const GACHA_TEXT = /gacha|summon|recruit|collect|characters|heroes|companions|anime|pre-?regist|banners?|squad|team/i

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')

/** Elementos <item> de un RSS: titular, enlace y resumen. */
export function parseFeed(xml) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].map(([it]) => {
    const tag = t => decode(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`).exec(it)?.[1] ?? '')
    return { title: tag('title'), link: tag('link'), text: tag('description').slice(0, 400) }
  }).filter(i => i.title)
}

/** Nombre del juego de un titular ("Silver Palace gets December release date" → "Silver Palace"). null si no parece un nombre. */
export function nameOf(title) {
  let t = title.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  t = t.replace(/(\S)\s*"[^"]*"/g, '$1') // subtítulos entre comillas ("Sea of Remnants “Dawnbreaker” closed beta")
  t = t.replace(/^(?:(?:[A-Z][\w.&-]*\s?){1,3}'s\s+)(?=[A-Z0-9])/, '') // "NetEase's Ananta…", "HoYoverse's Petit Planet…"
  t = t.replace(/^(?:report|rumou?r|update|exclusive|interview|preview|review|tgs \d{4}|gamescom( \d{4})?|g-star( \d{4})?)\s*[:\-–]\s*/i, '')
  // Los dos puntos forman parte de muchos nombres ("Honkai: Nexus Anima"): solo se corta en ": " si lo que sigue empieza en minúscula o es una frase.
  const cuts = [CUT.exec(t), COLON.exec(t)].filter(Boolean).map(m => m.index)
  let name = (cuts.length ? t.slice(0, Math.min(...cuts)) : t).trim().replace(TAIL, '')
  name = name.replace(/["']/g, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[\s,.!?]+$/, '').replace(/'s$/, '').trim()
  if (name.length < 3 || name.length > 48 || name.split(/\s+/).length > 7 || !/[A-Za-z0-9]/.test(name) || !/^[A-Z0-9"']/.test(name)) return null
  return name
}

const icon256 = u => u?.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/256x256bb.jpg')
const cleanSeller = s => (s ?? '').replace(/\b(pte\.?|ltd\.?|limited|inc\.?|co\.?,?|corp(oration)?\.?|llc|gmbh|s\.?a\.?|interactive entertainment|entertainment|games?|network|technology)\b\.?/gi, '').replace(/[,.]+/g, ' ').replace(/\s+/g, ' ').trim() || s
const isUpcomingGame = r => r && (r.primaryGenreName === 'Games' || (r.genres ?? []).includes('Games')) && +new Date(r.releaseDate) > Date.now()
/** No de pago (los gachas son free-to-play; en reserva Apple no da precio) y de un género típico; si no es RPG/estrategia/cartas, que su descripción lo delate. */
const looksGacha = r => !(r.price > 0) &&!NOT_GACHA.test(r.trackName ?? '') &&
  (/roleplaying|role playing|strategy|card/i.test((r.genres ?? []).join(' ')) || GACHA_GENRES.test((r.genres ?? []).join(' ')) && GACHA_TEXT.test(r.description ?? ''))

async function json(url) {
  const res = await sourceFetch(url)
  if (!res.ok) throw new Error(`${new URL(url).hostname}: ${res.status}`)
  return res.json()
}

/** Ficha de la App Store (EE. UU.) de un juego en reserva con pinta de gacha cuyo nombre coincide; null si no la hay. */
export async function findApp(name) {
  const q = new URLSearchParams({ term: name, entity: 'software', country: 'us', limit: '5' })
  const { results = [] } = await json(`https://itunes.apple.com/search?${q}`)
  const n = norm(name)
  const r = results.find(r => isUpcomingGame(r) && (norm(r.trackName).includes(n) || n.includes(norm(r.trackName))))
  return r && looksGacha(r) ? r : null
}

function entryOf(r, news) {
  return {
    id: `as${r.trackId}`, appId: r.trackId, name: r.trackName, publisher: cleanSeller(r.sellerName), date: r.releaseDate,
    icon: icon256(r.artworkUrl512 || r.artworkUrl100), url: `https://apps.apple.com/us/app/id${r.trackId}`,
    news, found: Date.now(), checked: Date.now(),
  }
}

/** { updated, items: [...] } */
let feed = { updated: 0, items: [] }
export const getUpcomingLive = () => feed

/** Une dos listas por id (gana la revisada más tarde). */
function union(a, b) {
  const map = new Map()
  for (const it of [...a, ...b]) { const cur = map.get(it.id); if (!cur || it.checked > cur.checked) map.set(it.id, { ...it, found: Math.min(it.found, cur?.found ?? Infinity) }) }
  return [...map.values()]
}

/**
 * Un ciclo: revisa las guardadas y busca nuevas. `seed` = lista anterior (p. ej. la publicada en la rama `data`).
 * Devuelve la lista nueva; no lanza (cada paso que falla conserva lo anterior).
 */
export async function refreshUpcomingLive({ seed = [], log = console.log, allFeeds = false } = {}) {
  let items = union(feed.items, seed)
  const now = Date.now()
  // 1) Las que ya conocemos: fecha al día y fuera las que salieron hace más de 14 días (o la App Store ya no tiene).
  if (items.length) {
    try {
      const ids = items.map(i => i.appId).join(',')
      const { results = [] } = await json(`https://itunes.apple.com/lookup?id=${ids}&country=us&entity=software`)
      const byId = new Map(results.map(r => [r.trackId, r]))
      items = items.flatMap(i => {
        const r = byId.get(i.appId)
        if (!r) return now - i.checked > 7 * DAY ? [] : [i] // fuera de la tienda una semana: se quita
        const next = { ...i, name: r.trackName, date: r.releaseDate, icon: icon256(r.artworkUrl512 || r.artworkUrl100) || i.icon, checked: now }
        return +new Date(next.date) + 14 * DAY < now ? [] : [next]
      })
    } catch (err) { log(`[upcoming] revisión: ${err.message} (se conserva lo anterior)`) }
  }
  // 2) Titulares nuevos → nombre → App Store.
  const known = new Set(items.map(i => norm(i.name)))
  const tried = new Set()
  let searches = 0
  for (const f of FEEDS.filter(x => allFeeds || !x.notServer)) {
    let news = []
    try {
      const res = await sourceFetch(f.url)
      if (!res.ok) throw new Error(`${res.status}`)
      news = parseFeed(await res.text())
    } catch (err) { log(`[upcoming] ${f.site}: ${err.message}`); continue }
    for (const n of news) {
      if (!NEWS.test(n.title)) continue
      const name = nameOf(n.title)
      if (!name || tried.has(norm(name)) || [...known].some(k => k.includes(norm(name)) || norm(name).includes(k))) continue
      tried.add(norm(name))
      if (searches++ >= MAX_SEARCHES) break
      try {
        const r = await findApp(name)
        if (!r) continue
        const it = entryOf(r, { site: f.site, title: n.title, link: n.link })
        items.push(it)
        known.add(norm(it.name))
        log(`[upcoming] nuevo: ${it.name} (${it.date.slice(0, 10)}) por "${n.title.slice(0, 70)}" (${f.site})`)
      } catch (err) { log(`[upcoming] App Store "${name}": ${err.message}`) }
    }
  }
  feed = { updated: Date.now(), items: items.sort((a, b) => +new Date(a.date) - +new Date(b.date)) }
  return feed
}

async function save() {
  try {
    await mkdir(DATA_DIR, { recursive: true })
    const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(feed))
    await rename(tmp, FILE)
  } catch (err) { console.error(`[upcoming] no se pudo guardar: ${err.message}`) }
}

/** La lista publicada en la rama `data` (scripts/snapshot.mjs): así un deploy (que borra .cache/) no pierde lo ya descubierto. */
async function remote() {
  try {
    const res = await sourceFetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/snapshots/upcoming.json`)
    if (!res.ok) return []
    const j = await res.json()
    return Array.isArray(j?.items) ? j.items.filter(i => i && typeof i.appId === 'number' && typeof i.name === 'string') : []
  } catch { return [] }
}

/** Servidor de respaldo (COLLECTOR_ENABLED=0, Render): no consulta noticias ni la App Store, solo adopta la lista publicada. */
const PASSIVE = (process.env.COLLECTOR_ENABLED ?? '').trim() === '0'

async function cycle() {
  if (PASSIVE) {
    const items = await remote()
    if (items.length) { feed = { updated: Date.now(), items: union(feed.items, items).sort((a, b) => +new Date(a.date) - +new Date(b.date)) }; await save() }
    return
  }
  await refreshUpcomingLive({ seed: await remote() })
  await save()
}

export async function startUpcomingLive() {
  try { const j = JSON.parse(await readFile(FILE, 'utf8')); if (Array.isArray(j?.items)) feed = j } catch { /* primera vez */ }
  setTimeout(() => cycle().catch(err => console.error('[upcoming]', err)), 90_000).unref()
  setInterval(() => cycle().catch(err => console.error('[upcoming]', err)), 3 * HOUR).unref()
}
