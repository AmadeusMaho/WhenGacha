import type { Featured, GameEvent, Kind, Patch } from '../types'
import { viaProxy } from '../net'
import type { GameSync } from './ennead'

/**
 * Fuentes basadas en las tablas Cargo de wikis wiki.gg (API de MediaWiki abierta, con CORS).
 * Los datos son editados por la comunidad: pueden retrasarse respecto al juego.
 */
const DAY = 86_400_000

interface Row { [k: string]: string }

async function cargo(wiki: string, params: Record<string, string>): Promise<Row[]> {
  const qs = new URLSearchParams({ action: 'cargoquery', format: 'json', origin: '*', limit: '500', ...params })
  const res = await fetch(viaProxy(`https://${wiki}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${wiki} → HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`${wiki}: ${json.error.info ?? json.error.code}`)
  return (json.cargoquery ?? []).map((r: { title: Row }) => r.title)
}

/** "2026-11-05 04:00:00" en la zona UTC±offset -> ISO UTC. */
function toIso(local: string, utcOffsetHours: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(local ?? '')
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - utcOffsetHours * 3_600_000).toISOString()
}

const norm = (name: string) => name.replace(/_/g, ' ').trim()

/**
 * Nombre de archivo -> URL directa de la imagen. Special:FilePath devuelve 403 desde otros sitios,
 * así que se pide la URL real (miniatura de 640 px) a la API de MediaWiki, en lotes.
 */
async function fileMap(host: string, names: (string | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(names.filter((n): n is string => !!n).map(norm))]
  const out = new Map<string, string>()
  for (let i = 0; i < uniq.length; i += 40) {
    const qs = new URLSearchParams({
      action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '640', format: 'json', origin: '*',
      titles: uniq.slice(i, i + 40).map(n => `File:${n}`).join('|'),
    })
    try {
      const res = await fetch(viaProxy(`https://${host}/api.php?${qs}`))
      const pages = Object.values((await res.json())?.query?.pages ?? {}) as { title: string; imageinfo?: { thumburl?: string; url: string }[] }[]
      for (const p of pages) {
        const info = p.imageinfo?.[0]
        if (info) out.set(norm(p.title.replace(/^File:/, '')), info.thumburl ?? info.url)
      }
    } catch { /* sin imágenes: se buscarán más tarde */ }
  }
  return out
}

const sinceDate = () => new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10)

function make(gameId: string, kind: Kind, id: string, title: string, start: string | null, end: string | null,
  extra: Partial<GameEvent> = {}): GameEvent | null {
  if (!start || !end || +new Date(end) <= +new Date(start)) return null
  return { id: `${gameId}:${kind}:${id}`, gameId, kind, title, start, end, items: [], featured: [], pulls: 0, source: 'api', ...extra }
}

const compact = (xs: (GameEvent | null)[]) => xs.filter((x): x is GameEvent => !!x)

/* ---------- Arknights (servidor Global, UTC-7) ---------- */
export async function syncArknights(gameId: string): Promise<GameSync> {
  const rows = await cargo('arknights.wiki.gg', {
    tables: 'EventServerDetails',
    fields: 'event,image,startTime,endTime',
    where: `server='global' AND endTime>'${sinceDate()}'`,
    order_by: 'startTime',
  })
  const files = await fileMap('arknights.wiki.gg', rows.map(r => r.image))
  const events = compact(rows.map(r => {
    const rerun = /\/Rerun$/i.test(r.event)
    const title = rerun ? `${r.event.replace(/\/Rerun$/i, '')} (Rerun)` : r.event
    return make(gameId, 'event', r.event + r.startTime, title, toIso(r.startTime, -7), toIso(r.endTime, -7), {
      image: r.image ? files.get(norm(r.image)) : undefined,
      description: 'Servidor Global. Horas aproximadas (zona UTC-7).',
    })
  }))
  return { events, patches: [], codes: [] }
}

/* ---------- Arknights: Endfield (servidor AMEU, UTC-5) ---------- */
const EF = 'endfield.wiki.gg'
const AMEU = -5

export async function syncEndfield(gameId: string): Promise<GameSync> {
  const since = sinceDate()
  const [events, banners, versions] = await Promise.all([
    cargo(EF, { tables: 'Events', fields: 'Event,Type,Image,AmeuStartTime,AmeuEndTime', where: `AmeuEndTime>'${since}'`, order_by: 'AmeuStartTime' }),
    cargo(EF, { tables: 'Banners', fields: 'Banner,Image,RateUpOperator,LimitedOperators,AmeuStartTime,AmeuEndTime', where: `AmeuEndTime>'${since}'`, order_by: 'AmeuStartTime' }),
    cargo(EF, { tables: 'Versions', fields: 'Version,VersionNumber,StartTime,EndTime', order_by: 'StartTime' }),
  ])

  const files = await fileMap(EF, [...events.map(r => r.Image), ...banners.map(r => r.Image)])
  const evs = compact(events.map(r => make(gameId, /challenge/i.test(r.Type) ? 'challenge' : 'event', r.Event + r.AmeuStartTime, r.Event,
    toIso(r.AmeuStartTime, AMEU), toIso(r.AmeuEndTime, AMEU), { image: r.Image ? files.get(norm(r.Image)) : undefined, description: r.Type ? `Tipo: ${r.Type}. Servidor AMEU.` : undefined })))

  const bns = compact(banners.map(r => {
    const names = (r.RateUpOperator || r.LimitedOperators || '').split(';').filter(Boolean)
    const featured: Featured[] = names.slice(0, 3).map(name => ({ name, rarity: 6 }))
    return make(gameId, 'banner', r.Banner + r.AmeuStartTime, names.length ? names.join(' / ') : r.Banner,
      toIso(r.AmeuStartTime, AMEU), toIso(r.AmeuEndTime, AMEU), {
        image: r.Image ? files.get(norm(r.Image)) : undefined, featured, description: `Banner «${r.Banner}»`,
      })
  }))

  const patches: Patch[] = versions
    .map(v => ({ v, date: toIso(v.StartTime, AMEU) }))
    .filter(x => x.date)
    .map(({ v, date }) => ({ id: `${gameId}:patch:${v.VersionNumber}`, gameId, version: v.VersionNumber, date: date!, name: v.Version, notes: '', source: 'api' as const }))
  const last = versions[versions.length - 1]
  const lastEnd = last && toIso(last.EndTime, AMEU)
  if (last && lastEnd && !isNaN(parseFloat(last.VersionNumber))) {
    const [maj, min] = last.VersionNumber.split('.').map(Number)
    const next = `${maj}.${min + 1}`
    if (!patches.some(p => p.version === next))
      patches.push({ id: `${gameId}:patch:${next}`, gameId, version: next, date: new Date(+new Date(lastEnd) + 1000).toISOString(), notes: 'Estimado: según el fin de la versión actual.', source: 'api', estimated: true })
  }
  return { events: [...evs, ...bns], patches, codes: [] }
}
