// Fondos de las skins que cambian con cada versión del juego (ver src/skins/README.md, "Fondos de la línea de tiempo").
// Cada 12 h mira qué vídeo e imagen de portada tiene AHORA la web oficial de cada juego y lo deja en GET /data/skin-live.json.
// No descarga los vídeos: el navegador los reproduce desde el CDN oficial (como el arte de los eventos), y solo si pesan ≤ MAX_VIDEO
// (si no, usa la imagen de portada como fondo fijo). Para saber el peso hace una petición HEAD, una sola vez por vídeo nuevo.
// Todas las consultas pasan por el proxy (sourceFetch: lista cerrada, caché de 12 h, cola y pausas tras un bloqueo).
import https from 'node:https'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROXY_UA, sourceFetch } from './proxy.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.resolve(HERE, '../.cache')
const FILE = path.join(DATA_DIR, 'skin-live.json')
const HOUR = 3_600_000
/** Peso máximo de un vídeo oficial para reproducirlo de fondo (los de 1080p sin comprimir pueden pasar de 20 MB). */
export const MAX_VIDEO = 12 * 1024 * 1024

/** skin -> { video?, size?, poster, updated, checked } */
let feed = {}
const sizes = new Map() // url del vídeo -> bytes (o null si no se pudo saber)

export const getSkinLive = () => feed

/** Peso de un vídeo con una petición HEAD (sin descargarlo). null si no responde o no lo dice. */
function headSize(url) {
  return new Promise(resolve => {
    const req = https.request(url, { method: 'HEAD', headers: { 'user-agent': PROXY_UA }, timeout: 15_000 }, res => {
      res.resume()
      const n = Number(res.headers['content-length'])
      resolve(res.statusCode === 200 && n > 0 ? n : null)
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
    req.end()
  })
}

async function json(url) {
  const res = await sourceFetch(url)
  if (!res.ok) throw new Error(`${new URL(url).hostname}: ${res.status}`)
  return res.json()
}

/** Genshin y ZZZ: portada → config.<hash>.js → el vídeo con la fecha más reciente en su ruta. Póster: la captura que ofrece su CDN. */
async function hoyo(home) {
  const { config } = await json(home)
  if (!config) throw new Error('sin script de configuración en la portada')
  const { videos } = await json(config)
  const date = v => /\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(v)?.slice(1).join('') ?? ''
  const video = [...(videos ?? [])].sort((a, b) => date(b).localeCompare(date(a)))[0]
  if (!video) throw new Error('sin vídeo en la configuración')
  return { video, poster: `${video}?x-oss-process=video/snapshot,t_1,f_jpg,m_fast` }
}

/** WuWa: MainMenu.json → pcTopPicture (vídeo de portada e imagen). */
async function kuro() {
  const { pc } = await json('https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en/MainMenu.json')
  if (!pc?.video && !pc?.image) throw new Error('sin portada')
  return { video: pc.video || undefined, poster: pc.image }
}

const GAMES = {
  genshin: () => hoyo('https://genshin.hoyoverse.com/en/'),
  zzz: () => hoyo('https://zenless.hoyoverse.com/en-us/'),
  wuwa: kuro,
}

async function save() {
  try {
    await mkdir(DATA_DIR, { recursive: true })
    const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(feed))
    await rename(tmp, FILE)
  } catch (err) { console.error(`[skin-live] no se pudo guardar: ${err.message}`) }
}

export async function refreshSkinLive() {
  let changed = false
  for (const [id, get] of Object.entries(GAMES)) {
    try {
      const { video, poster } = await get()
      const cur = feed[id]
      let size = video ? sizes.get(video) : undefined
      if (video && size === undefined) { size = cur?.video === video ? cur.size ?? null : await headSize(video); sizes.set(video, size) }
      const usable = video && size != null && size <= MAX_VIDEO
      const next = { video: usable ? video : undefined, size: video ? size : undefined, poster, updated: cur?.video === video && cur?.poster === poster ? cur.updated : Date.now(), checked: Date.now() }
      if (!cur || cur.video !== next.video || cur.poster !== next.poster) {
        console.log(`[skin-live] ${id}: ${usable ? `vídeo ${(size / 1048576).toFixed(1)} MB` : video ? `vídeo de ${size ? (size / 1048576).toFixed(1) + ' MB' : 'peso desconocido'}: se usa la imagen` : 'solo imagen'}`)
        changed = true
      }
      feed = { ...feed, [id]: next }
    } catch (err) {
      console.error(`[skin-live] ${id}: ${err.message} (se conserva lo anterior)`)
    }
  }
  if (changed) await save()
}

export async function startSkinLive() {
  try { feed = JSON.parse(await readFile(FILE, 'utf8')) ?? {} } catch { feed = {} }
  setTimeout(() => refreshSkinLive().catch(() => {}), 60_000).unref()
  setInterval(() => refreshSkinLive().catch(() => {}), 12 * HOUR).unref()
}
