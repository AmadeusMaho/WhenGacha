// Recolector de WhenGacha: cada pocas horas ejecuta las fuentes de datos de cada juego (las mismas de src/sources, empaquetadas
// en server/bundle/collector.mjs) y guarda el resultado ya normalizado en memoria y en disco. Los jugadores descargan esa copia
// (GET /data/<juego>.json) en vez de consultar ellos mismos a las fuentes. Si el bundle falta o falla, la app sigue funcionando
// como antes (cada navegador consulta las fuentes a través del proxy).
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceFetch } from './proxy.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.resolve(HERE, '../.cache')
const SNAP_DIR = path.join(DATA_DIR, 'snapshots')
const MIN = 60_000

/** Lo que se sirve a los jugadores; id -> { updated, events, patches, codes } */
const snapshots = new Map()
/** id -> { at, message } del último intento fallido (para el log y para no reintentar enseguida). */
const failures = new Map()
let mod = null
let games = []
let running = false

export const getSnapshot = id => snapshots.get(id)
export const knownGames = () => games.map(g => g.id)

async function loadFromDisk() {
  try {
    for (const f of await readdir(SNAP_DIR)) {
      if (!f.endsWith('.json')) continue
      try {
        const snap = JSON.parse(await readFile(path.join(SNAP_DIR, f), 'utf8'))
        if (snap?.id && Array.isArray(snap.events)) snapshots.set(snap.id, snap)
      } catch { /* copia ilegible: se vuelve a generar */ }
    }
  } catch { /* primera vez */ }
}

async function save(snap) {
  try {
    await mkdir(SNAP_DIR, { recursive: true })
    const file = path.join(SNAP_DIR, `${snap.id}.json`)
    await writeFile(`${file}.tmp`, JSON.stringify(snap))
    await rename(`${file}.tmp`, file)
  } catch (err) { console.error(`[collector] no se pudo guardar ${snap.id}: ${err.message}`) }
}

async function collectOne(g) {
  try {
    const snap = await mod.collect(g.id)
    // Una copia sin nada (p. ej. todas las fuentes caídas) no pisa una buena anterior.
    if (!snap.events.length && snapshots.get(g.id)?.events.length) throw new Error('sin datos nuevos')
    snapshots.set(g.id, snap)
    failures.delete(g.id)
    await save(snap)
    console.log(`[collector] ${g.id}: ${snap.events.length} elementos`)
  } catch (err) {
    failures.set(g.id, { at: Date.now(), message: err.message })
    console.error(`[collector] ${g.id}: ${err.message} (se conserva la copia anterior)`)
  }
}

/** Renueva los juegos cuya copia ya caducó, de uno en uno (el proxy además espaciará las peticiones a cada sitio). */
async function tick() {
  if (running || !mod) return
  running = true
  try {
    for (const g of games) {
      const snap = snapshots.get(g.id)
      const last = failures.get(g.id)
      const due = !snap || Date.now() - snap.updated >= g.every
      const cooled = !last || Date.now() - last.at >= 15 * MIN
      if (due && cooled) await collectOne(g)
    }
  } finally { running = false }
}

export async function startCollector() {
  try {
    mod = await import('./bundle/collector.mjs')
  } catch (err) {
    console.error(`[collector] desactivado (no se pudo cargar server/bundle/collector.mjs): ${err.message}`)
    return
  }
  mod.setup(sourceFetch)
  games = mod.games()
  await loadFromDisk()
  console.log(`[collector] ${games.length} juegos, ${snapshots.size} copias guardadas`)
  setTimeout(tick, 20_000).unref()
  setInterval(tick, 10 * MIN).unref()
}
