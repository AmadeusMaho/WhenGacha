// Genera las copias normalizadas de los juegos (las mismas que el recolector del servidor) desde ESTE equipo y, con --publish, las sube a la rama
// `data` del repositorio. El servidor de producción las recoge de ahí (server/collector.mjs, pullRemote). Sirve cuando una fuente (p. ej. gachafocus)
// bloquea la IP del servidor pero no la de este equipo. No toca `main` ni provoca despliegues.
//
//   npm run snapshot            genera en .cache/snapshot-out/
//   npm run snapshot:publish    genera y publica en la rama `data` (esto es lo que ejecuta la tarea programada)
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.SNAPSHOT_OUT || path.join(ROOT, '.cache', 'snapshot-out')
const BRANCH = process.env.SNAPSHOT_BRANCH || 'data'
const PUBLISH = process.argv.includes('--publish')
// Caché del proxy propia de este script (no se mezcla con la del servidor local).
process.env.DATA_DIR ??= path.join(ROOT, '.cache', 'snapshot-proxy')

// Token y canales de Discord del equipo del dueño (`.env.local`, que nunca se sube): sin ellos, las copias que publica este script saldrían sin los
// anuncios de Discord y, al ser más recientes, el servidor podría adoptarlas en lugar de las suyas (que sí los tienen). Las variables ya definidas
// (p. ej. los secretos de GitHub Actions) mandan. Se carga antes de importar el proxy, que lee DISCORD_* al arrancar.
try {
  for (const line of (await readFile(path.join(ROOT, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const m = /^\s*(DISCORD_TOKEN|DISCORD_CHANNELS)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch { /* sin .env.local: Discord queda desactivado, como antes */ }

const proxy = await import('../server/proxy.mjs')
const mod = await import('../server/bundle/collector.mjs')
mod.setup(proxy.sourceFetch)

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a)
const dir = path.join(OUT, 'snapshots')
await mkdir(dir, { recursive: true })

/** Copia anterior (local o, si este equipo no tiene, la ya publicada en la rama), para no sustituir una buena por una peor. */
const REPO = process.env.SNAPSHOT_REPO || 'AmadeusMaho/WhenGacha'
async function previous(id) {
  try { return JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8')) } catch { /* sigue */ }
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/snapshots/${id}.json`, { signal: AbortSignal.timeout(15_000) })
    return res.ok ? await res.json() : null
  } catch { return null }
}

const summary = {}
for (const g of mod.games()) {
  try {
    const old = await previous(g.id)
    // Si una fuente falló en este ciclo, sus eventos vigentes de la copia anterior se conservan (carryOver, src/collector.ts).
    const snap = mod.carryOver(old, await mod.collect(g.id))
    // Sin datos y sin copia anterior (p. ej. Azur Lane, que solo tiene Discord y a veces ningún anuncio con fechas): se publica igualmente la copia
    // vacía, para que el servidor no reciba un 404 cada 20 min. No pisa nada: pullRemote no adopta una copia vacía si la suya tiene elementos.
    if (!snap.events.length && !old) {
      await writeFile(path.join(dir, `${g.id}.json`), JSON.stringify(snap))
      summary[g.id] = { updated: snap.updated, count: 0 }
      log(`${g.id}: 0 elementos (se publica vacía)`)
      continue
    }
    if (!snap.events.length) throw new Error('sin datos')
    if (old && old.events.length > snap.events.length * 1.4 && Date.now() - old.updated < 12 * 3_600_000) {
      log(`${g.id}: ${snap.events.length} elementos (menos que los ${old.events.length} de la copia anterior): se conserva la anterior`)
      await writeFile(path.join(dir, `${g.id}.json`), JSON.stringify(old)) // en un equipo sin copia local, la anterior vendría de la rama publicada
      summary[g.id] = { updated: old.updated, count: old.events.length }
      continue
    }
    await writeFile(path.join(dir, `${g.id}.json`), JSON.stringify(snap))
    summary[g.id] = { updated: snap.updated, count: snap.events.length }
    log(`${g.id}: ${snap.events.length} elementos`)
  } catch (err) {
    const old = await previous(g.id)
    if (old) {
      await writeFile(path.join(dir, `${g.id}.json`), JSON.stringify(old))
      summary[g.id] = { updated: old.updated, count: old.events.length }
    }
    log(`${g.id}: ERROR ${String(err.message ?? err).slice(0, 100)}${old ? ' (se conserva la copia anterior)' : ''}`)
  }
}
// Próximos gachas (server/upcoming-live.mjs): se publica la lista acumulada para que un deploy del servidor (que borra .cache/) no la pierda.
try {
  const up = await import('../server/upcoming-live.mjs')
  const old = await previous('upcoming')
  const list = await up.refreshUpcomingLive({ seed: Array.isArray(old?.items) ? old.items : [], log })
  await writeFile(path.join(dir, 'upcoming.json'), JSON.stringify(list))
  log(`upcoming: ${list.items.length} juegos`)
} catch (err) { log(`upcoming: ERROR ${String(err.message ?? err).slice(0, 100)}`) }
await writeFile(path.join(dir, 'index.json'), JSON.stringify({ generatedAt: Date.now(), games: summary }))

if (!PUBLISH) { log(`copias en ${dir}`); process.exit(0) }

// Publicación: un repositorio temporal con un único commit, empujado (forzado) a la rama `data`: sin historial acumulado.
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
const remote = process.env.SNAPSHOT_REMOTE || git(ROOT, 'remote', 'get-url', 'origin')
const tmp = await mkdtemp(path.join(os.tmpdir(), 'wg-data-'))
try {
  await cp(dir, path.join(tmp, 'snapshots'), { recursive: true })
  await writeFile(path.join(tmp, 'README.md'), 'Copias normalizadas de los eventos de WhenGacha, generadas automáticamente por scripts/snapshot.mjs. No editar.\n')
  git(tmp, 'init', '-q', '-b', BRANCH)
  const conf = key => { try { return git(ROOT, 'config', key) } catch { return '' } }
  git(tmp, 'config', 'user.name', conf('user.name') || 'WhenGacha snapshots')
  git(tmp, 'config', 'user.email', conf('user.email') || 'snapshots@whengacha.invalid')
  git(tmp, 'add', '-A')
  git(tmp, 'commit', '-q', '-m', `Copias ${new Date().toISOString().slice(0, 16)}Z`)
  git(tmp, 'push', '-q', '--force', remote, `${BRANCH}:${BRANCH}`)
  log(`publicadas en la rama ${BRANCH}`)
} finally {
  await rm(tmp, { recursive: true, force: true })
}
process.exit(0)
