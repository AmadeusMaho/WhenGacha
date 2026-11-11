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
    // Nombre temporal único: la copia propia y la adoptada de GitHub pueden guardarse a la vez (antes chocaban en el mismo .tmp → ENOENT).
    const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    await writeFile(tmp, JSON.stringify(snap))
    await rename(tmp, file)
  } catch (err) { console.error(`[collector] no se pudo guardar ${snap.id}: ${err.message}`) }
}

async function collectOne(g) {
  try {
    const snap = await mod.collect(g.id)
    // Una copia sin nada (p. ej. todas las fuentes caídas) no pisa una buena anterior.
    const cur = snapshots.get(g.id)
    if (!snap.events.length && cur?.events.length) throw new Error('sin datos nuevos')
    // Tampoco una mucho más pobre que otra reciente (p. ej. gachafocus bloqueado aquí pero la copia publicada desde otro equipo lo traía).
    if (cur && Date.now() - cur.updated < 12 * 3_600_000 && snap.events.length < cur.events.length * 0.7)
      throw new Error(`solo ${snap.events.length} elementos frente a los ${cur.events.length} de la copia reciente`)
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

/* ---------- copias publicadas desde otro equipo ---------- */
// scripts/snapshot.mjs genera las copias en un equipo cuya IP no esté bloqueada por alguna fuente y las publica en la rama `data` del repositorio.
// El servidor las lee de ahí (sin claves ni despliegues) y las adopta si son más completas o más recientes que las suyas.
const REPO = process.env.SNAPSHOT_REPO || 'AmadeusMaho/WhenGacha'
const BRANCH = process.env.SNAPSHOT_BRANCH || 'data'
const REMOTE_MAX_AGE = 48 * 3_600_000

async function pullRemote() {
  if (!mod) return
  for (const g of games) {
    try {
      const res = await sourceFetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/snapshots/${g.id}.json`)
      if (!res.ok) continue
      const snap = await res.json()
      if (snap?.id !== g.id || !Array.isArray(snap.events) || typeof snap.updated !== 'number' || snap.updated > Date.now() + 5 * MIN) continue
      if (Date.now() - snap.updated > REMOTE_MAX_AGE) continue
      const cur = snapshots.get(g.id)
      const newer = !cur || snap.updated > cur.updated
      // "Más completa" solo cuenta si no es mucho más vieja: una copia de hace un día (p. ej. de cuando se usaba gachafocus) no debe pisar una recién hecha.
      const richer = !!cur && snap.events.length > cur.events.length && snap.updated > cur.updated - 6 * 3_600_000
      if (!(newer && (!cur || snap.events.length >= cur.events.length * 0.7)) && !richer) continue
      snapshots.set(g.id, snap)
      await save(snap)
      console.log(`[collector] ${g.id}: copia adoptada de ${REPO}@${BRANCH} (${snap.events.length} elementos, de hace ${Math.round((Date.now() - snap.updated) / 60_000)} min)`)
    } catch { /* sin copia remota o ilegible: se sigue con la propia */ }
  }
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
  setTimeout(pullRemote, 5_000).unref() // primero lo ya publicado: así hay datos desde el arranque aunque una fuente bloquee a este servidor
  setInterval(pullRemote, 20 * MIN).unref()
  // COLLECTOR_ENABLED=0: servidor de respaldo (Render detrás del Worker de Cloudflare). Solo adopta las copias de la rama `data`
  // y no consulta las fuentes por su cuenta, para no duplicar las peticiones que ya hace el servidor principal.
  if (process.env.COLLECTOR_ENABLED === '0') return void console.log('[collector] recolección propia desactivada (COLLECTOR_ENABLED=0): solo copias de GitHub')
  setTimeout(tick, 20_000).unref()
  setInterval(tick, 10 * MIN).unref()
}
