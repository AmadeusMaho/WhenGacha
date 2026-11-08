import type { GameEvent } from '../types'
import { viaProxy } from '../net'
import type { GameSync } from './ennead'

/**
 * Fuentes que se leen del HTML ya renderizado de una wiki MediaWiki (API `action=parse`):
 * Blue Archive (Global). Las páginas las edita la comunidad, así que el
 * formato puede cambiar y las fechas pueden retrasarse respecto al juego.
 */
const DAY = 86_400_000

async function parsePage(base: string, page: string): Promise<Document> {
  const qs = new URLSearchParams({ action: 'parse', page, prop: 'text', format: 'json', origin: '*', disableeditsection: '1', disabletoc: '1' })
  const res = await fetch(viaProxy(`${base}?${qs}`))
  if (!res.ok) throw new Error(`${new URL(base).hostname} → HTTP ${res.status}`)
  const json = await res.json()
  const html: string | undefined = json?.parse?.text?.['*']
  if (!html) throw new Error(`${new URL(base).hostname}: ${json?.error?.info ?? 'respuesta vacía'}`)
  return new DOMParser().parseFromString(html, 'text/html')
}

const inWindow = (s: number, e: number) => e > s && e > Date.now() - 3 * DAY && s < Date.now() + 120 * DAY

/* ---------- Blue Archive (servidor Global) ---------- */
const wikiImg = (src: string | null | undefined, from: string, to: string) => (src ? `https:${src.replace(from, to)}` : undefined)

/** Banners de reclutamiento del servidor Global: los de un mismo periodo se agrupan en una sola barra. */
async function blueArchiveBanners(gameId: string): Promise<GameEvent[]> {
  const doc = await parsePage('https://bluearchive.wiki/w/api.php', 'Banner_List_(Global)')
  const groups = new Map<string, { s: number; e: number; names: string[]; tags: (string | undefined)[]; img?: string; rerun: boolean }>()
  for (const row of doc.querySelectorAll('tr[data-server="gl"]')) {
    const dates = [...row.querySelectorAll('.datetime')].map(d => +new Date(d.getAttribute('data-datetime') ?? ''))
    if (dates.length < 2 || dates.some(isNaN) || !inWindow(dates[0], dates[1]) || dates[1] - dates[0] > 120 * DAY) continue
    const name = row.querySelector('td:nth-child(2) a')?.textContent?.trim()
    if (!name) continue
    const key = `${dates[0]}-${dates[1]}`
    const g = groups.get(key) ?? { s: dates[0], e: dates[1], names: [], tags: [], img: undefined, rerun: true }
    g.names.push(name)
    g.tags.push(/fes/i.test(row.getAttribute('data-type') ?? '') ? 'Fes' : undefined)
    g.img ??= wikiImg(row.querySelector('td.image img')?.getAttribute('src'), '/300px-', '/600px-')
    if (row.getAttribute('data-release') !== 'rerun') g.rerun = false
    groups.set(key, g)
  }
  return [...groups.entries()].map(([key, g]) => ({
    id: `${gameId}:banner:${key}`,
    gameId,
    kind: 'banner' as const,
    title: g.names.slice(0, 3).join(' / ') + (g.names.length > 3 ? ` +${g.names.length - 3}` : ''),
    description: [g.rerun ? '⟦d.rerun⟧' : '', g.names.length > 3 ? g.names.join(', ') : ''].filter(Boolean).join('\n') || undefined,
    image: g.img,
    start: new Date(g.s).toISOString(),
    end: new Date(g.e).toISOString(),
    items: [],
    featured: g.names.slice(0, 3).map((name, i) => ({ name, rarity: 3, tag: g.tags[i] })),
    pulls: 0,
    source: 'api' as const,
  }))
}

/* ---------- Blue Archive: datos estructurados de la wiki (extensión Bucket) ---------- */
const BA_API = 'https://bluearchive.wiki/w/api.php'

type BucketRow = Record<string, string | number | undefined>

/** Consulta una tabla Bucket (`Bucket:<tabla>` en la wiki). `query` es el código Lua del API (`bucket('x').select(...)...run()`). */
async function bucket(query: string): Promise<BucketRow[]> {
  const qs = new URLSearchParams({ action: 'bucket', query, format: 'json', origin: '*' })
  const res = await fetch(viaProxy(`${BA_API}?${qs}`))
  if (!res.ok) throw new Error(`bluearchive.wiki bucket → HTTP ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json?.bucket)) throw new Error(`bluearchive.wiki bucket: ${json?.error ?? 'respuesta vacía'}`)
  return json.bucket
}

/** URLs de miniatura de varios archivos (`File:…`) en una sola petición. */
async function fileThumbs(files: string[], width: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(files)].slice(0, 50)
  if (!uniq.length) return out
  const qs = new URLSearchParams({ action: 'query', titles: uniq.join('|'), prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(width), format: 'json', formatversion: '2', origin: '*' })
  const res = await fetch(viaProxy(`${BA_API}?${qs}`))
  if (!res.ok) return out
  const json = await res.json()
  // La API normaliza los títulos ("File:A_b" → "File:A b"); se guardan ambos nombres.
  const alias = new Map<string, string>()
  for (const n of json?.query?.normalized ?? []) alias.set(n.to, n.from)
  for (const p of json?.query?.pages ?? []) {
    const url = p?.imageinfo?.[0]?.thumburl ?? p?.imageinfo?.[0]?.url
    if (!url) continue
    out.set(p.title, url)
    const from = alias.get(p.title)
    if (from) out.set(from, url)
  }
  return out
}

const RAID_LABEL: Record<string, string> = { Raid: 'Total Assault', Elimination: 'Grand Assault', 'Limit Break': 'Final Restriction Release' }
/** Qué da cada raid: las recompensas dependen del rango y la dificultad, así que se describen sin cifras. */
const RAID_DESC: Record<string, string> = { Raid: '⟦d.baRaid⟧', Elimination: '⟦d.baGrand⟧', 'Limit Break': '⟦d.baFrr⟧' }
/** "Decagrammaton: Hod (Grand Assault)" → "Hod". */
const raidBoss = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').split(': ').pop()!.trim()

/** Fecha (AAAA-MM-DD) de hace 3 días: filtro de las consultas; cambia una vez al día para que la caché del proxy sirva. */
const sinceDay = () => new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10)

/**
 * Eventos, ejercicios conjuntos y raids (Total Assault, Grand Assault, Final Restriction Release) del servidor Global
 * desde las tablas Bucket `events` y `raids` de bluearchive.wiki (horas exactas con zona). 3 peticiones.
 */
async function blueArchiveBucket(gameId: string): Promise<GameEvent[]> {
  const since = sinceDay()
  const [evs, raids] = await Promise.all([
    bucket(`bucket('events').select('id','original_id','category','name_en','start_date','end_date','promo','banner').where('server','GL').where('end_date','>','${since}').limit(200).run()`),
    bucket(`bucket('raids').select('type','name','season','start_date','end_date','image').where('server','GL').where('end_date','>','${since}').limit(100).run()`).catch(() => [] as BucketRow[]),
  ])
  const skip = new Set(['PermanentEvent', 'Guide mission'])
  const rows: { id: string; title: string; s: number; e: number; file?: string; rerun?: boolean; minor?: boolean; challenge?: string }[] = []
  for (const r of evs) {
    const s = +new Date(String(r.start_date ?? '')), e = +new Date(String(r.end_date ?? ''))
    const title = String(r.name_en ?? '').trim()
    if (!title || isNaN(s) || isNaN(e) || skip.has(String(r.category)) || !inWindow(s, e) || e - s > 120 * DAY) continue
    const id = Number(r.id), orig = Number(r.original_id)
    rows.push({
      id: `${gameId}:event:${r.id ?? title}:${s}`,
      title, s, e,
      file: (r.promo ?? r.banner) as string | undefined,
      // Los reestrenos tienen id = 10000 + id original (p. ej. 10846 → 846).
      rerun: id > 10000 && orig > 0 && id !== orig && id % 10000 === orig % 10000,
      // Ejercicio conjunto (Joint Firing Drill): rotatorio, no evento.
      challenge: r.category === 'Joint Firepower Exercise' ? '⟦d.baDrill⟧' : undefined,
    })
  }
  for (const r of raids) {
    const s = +new Date(String(r.start_date ?? '')), e = +new Date(String(r.end_date ?? ''))
    const label = RAID_LABEL[String(r.type)]
    const name = String(r.name ?? '')
    if (!name || isNaN(s) || isNaN(e) || !inWindow(s, e)) continue
    rows.push({
      id: `${gameId}:raid:${r.type}:${r.season ?? name}:${s}`,
      title: label ? `${label}: ${raidBoss(name)}` : name,
      s, e,
      file: r.image as string | undefined,
      challenge: RAID_DESC[String(r.type)] ?? '⟦d.baRaid⟧',
    })
  }
  const thumbs = await fileThumbs(rows.map(r => r.file).filter((f): f is string => !!f), 320).catch(() => new Map<string, string>())
  return rows.map(r => ({
    id: r.id,
    gameId,
    kind: r.challenge ? 'challenge' as const : 'event' as const,
    title: r.title,
    description: r.challenge ?? (r.rerun ? '⟦d.rerun⟧' : undefined),
    image: r.file ? thumbs.get(r.file) : undefined,
    start: new Date(r.s).toISOString(),
    end: new Date(r.e).toISOString(),
    items: [],
    featured: [],
    pulls: 0,
    minor: r.minor || undefined,
    source: 'api' as const,
  }))
}

/**
 * Cupones de Blue Archive Global puestos a mano: el aviso oficial (#game-news de Discord) trae el código solo dentro de la imagen,
 * así que discord.ts no puede leerlo. Cada uno desaparece solo al caducar (`until`).
 */
const BA_CODES: { code: string; rewards: string[]; until: string }[] = [
  // 5-Year Anniversary Celebration Coupon (aviso del 8 nov 2026): hasta el 24/11 14:59 UTC, una vez por cuenta.
  { code: '5YEARSWITHSENSEI', rewards: ['Pyroxene ×600', 'Beautiful Bouquet ×5'], until: '2026-11-24T14:59:00Z' },
]

const baCodes = () => BA_CODES.filter(c => +new Date(c.until) > Date.now())
  .map(c => ({ code: c.code, rewards: [...c.rewards, `Until ${new Date(c.until).toUTCString().slice(5, 16)} (UTC)`] }))

export async function syncBlueArchive(gameId: string): Promise<GameSync> {
  const s = await syncBlueArchiveWiki(gameId)
  return { ...s, codes: [...s.codes, ...baCodes()] }
}

async function syncBlueArchiveWiki(gameId: string): Promise<GameSync> {
  const [fromBucket, banners] = await Promise.all([
    blueArchiveBucket(gameId).catch(err => { console.warn('[bluearchive] bucket:', err?.message ?? err); return null }),
    blueArchiveBanners(gameId).catch(() => []),
  ])
  if (fromBucket) return { events: [...banners, ...fromBucket], patches: [], codes: [] }
  // Respaldo: tabla HTML de la página "Events" (solo eventos de historia).
  const doc = await parsePage(BA_API, 'Events')
  const events: GameEvent[] = [...banners]
  for (const row of doc.querySelectorAll('#eventtable tr[data-event-id]')) {
    // Solo cuentan los eventos con periodo (inicio y fin) ya anunciado para el servidor Global.
    const dates = [...row.querySelectorAll('td.event-region-gl .datetime')].map(d => +new Date(d.getAttribute('data-datetime') ?? ''))
    if (dates.length < 2 || dates.some(isNaN)) continue
    const [s, e] = dates
    if (!inWindow(s, e)) continue
    const title = (row.querySelector('.event-region-gl .event-title') ?? row.querySelector('.event-title'))?.textContent?.trim()
    if (!title) continue
    const src = row.querySelector('.event-promo img')?.getAttribute('src')
    const release = row.getAttribute('data-release')
    events.push({
      id: `${gameId}:event:${row.getAttribute('data-event-id')}:${s}`,
      gameId,
      kind: 'event',
      title,
      description: release === 'rerun' ? '⟦d.rerun⟧' : undefined,
      image: wikiImg(src, '/160px-', '/320px-'),
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      items: [],
      featured: [],
      pulls: 0,
      source: 'api',
    })
  }
  return { events, patches: [], codes: [] }
}
