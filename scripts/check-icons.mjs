// Lista, por juego, las recompensas sin icono y los destacados de banner sin retrato de las copias del recolector (vigentes o próximos).
// Uso:  node scripts/check-icons.mjs [carpeta]   (por defecto .cache/snapshots; vale cualquier carpeta con <juego>.json, p. ej. la rama data)
//       node scripts/check-icons.mjs --data      (lee las copias publicadas en la rama data de GitHub)
// Regla del proyecto (CLAUDE.md): toda recompensa lleva icono y todo destacado su retrato; si alguno no tiene fuente, se documenta.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = process.env.SNAPSHOT_REPO || 'AmadeusMaho/WhenGacha'
const arg = process.argv[2]
const now = Date.now()

async function snapshots() {
  if (arg === '--data') {
    const list = (await import('../server/bundle/collector.mjs')).games().map(g => g.id)
    return Promise.all(list.map(async id => [id, await fetch(`https://raw.githubusercontent.com/${REPO}/data/snapshots/${id}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)]))
  }
  const dir = path.resolve(ROOT, arg || '.cache/snapshots')
  const files = (await readdir(dir)).filter(f => f.endsWith('.json') && !/^(index|upcoming|skin-live)\.json$/.test(f))
  return Promise.all(files.map(async f => [f.replace(/\.json$/, ''), JSON.parse(await readFile(path.join(dir, f), 'utf8'))]))
}

let bad = 0
for (const [id, snap] of (await snapshots()).sort((a, b) => a[0].localeCompare(b[0]))) {
  const live = (snap?.events ?? []).filter(e => Date.parse(e.end) > now)
  const items = [...new Set(live.flatMap(e => e.items.filter(i => !i.icon).map(i => i.name)))]
  const faces = [...new Set(live.filter(e => e.kind === 'banner').flatMap(e => e.featured.filter(f => !f.icon).map(f => f.name)))]
  if (!items.length && !faces.length) continue
  bad++
  console.log(`${id}`)
  if (items.length) console.log(`  recompensas sin icono (${items.length}): ${items.join(', ')}`)
  if (faces.length) console.log(`  destacados sin retrato (${faces.length}): ${faces.join(', ')}`)
}
console.log(bad ? `\n${bad} juegos con huecos.` : 'Todo con icono.')
