import type { Featured, GameEvent, Kind, Patch, RewardItem } from '../types'
import { viaProxy } from '../net'
import { akAnnihilation, withClientData } from './akdata'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

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

/* ---------- Arknights (servidor Global) ---------- */
/** Los campos startTime/endTime de la wiki vienen en UTC (p. ej. fin "10:59:59" = 03:59:59 UTC-7). La hora de inicio de la wiki no siempre coincide con la de gachafocus: se marca como aproximada hasta que gachafocus la confirme. */
export async function syncArknights(gameId: string): Promise<GameSync> {
  const rows = await cargo('arknights.wiki.gg', {
    tables: 'EventServerDetails',
    fields: 'event,image,startTime,endTime',
    where: `server='global' AND endTime>'${sinceDate()}'`,
    order_by: 'startTime',
  })
  // Banners de reclutamiento (tabla Banners de la wiki): el servidor Global tiene sus propias columnas con hora UTC.
  const bannerRows = await cargo('arknights.wiki.gg', {
    tables: 'Banners',
    fields: 'name,bannerType,operators,startTimeGlobal,endTimeGlobal,image',
    where: `endTimeGlobal>'${sinceDate()}'`,
    order_by: 'startTimeGlobal',
  }).catch(() => [] as Row[])
  const files = await fileMap('arknights.wiki.gg', [...rows.map(r => r.image), ...bannerRows.map(r => r.image)])
  const banners = compact(bannerRows.map(r => {
    const ops = (r.operators ?? '').split(',').map(x => x.trim()).filter(Boolean)
    const title = r.name || ops.slice(0, 3).join(' / ')
    if (!title) return null
    return make(gameId, 'banner', title + r.startTimeGlobal, title, toIso(r.startTimeGlobal, 0), toIso(r.endTimeGlobal, 0), {
      image: r.image ? files.get(norm(r.image)) : undefined,
      featured: ops.slice(0, 3).map(name => ({ name, rarity: 6 })),
      description: ['⟦d.charBanner⟧', r.bannerType].filter(Boolean).join(' · '),
      precision: 'approx',
    })
  }))
  const events = compact(rows.map(r => {
    const rerun = /\/Rerun$/i.test(r.event)
    const title = rerun ? `${r.event.replace(/\/Rerun$/i, '')} (Rerun)` : r.event
    return make(gameId, 'event', r.event + r.startTime, title, toIso(r.startTime, 0), toIso(r.endTime, 0), {
      image: r.image ? files.get(norm(r.image)) : undefined,
      description: '⟦d.akServer⟧',
      precision: 'approx',
    })
  }))
  const base: GameSync = { events: [...events, ...banners], patches: [], codes: [] }
  const refined0 = await withClientData(gameId, base).catch(err => { console.warn('[arknights] datos del cliente:', err?.message ?? err); return base })
  const rotation = await withRotationArt(refined0).catch(() => refined0)
  // Rotatorio: el mapa de Annihilation en curso y el siguiente (datos del cliente).
  const annihilation = await akAnnihilation(gameId).catch(err => { console.warn('[arknights] annihilation:', err?.message ?? err); return [] as GameEvent[] })
  // Contingency Contract (temporadas de desafío, tipo CRISIS en el cliente) llega como evento: es un rotatorio.
  const refined = { ...rotation, events: [...rotation.events.map(e => /Contingency Contract|^CC#/i.test(e.title) && e.kind === 'event' ? { ...e, kind: 'challenge' as const } : e), ...annihilation] }
  // Sin imagen en la tabla: la wiki suele tener el banner del evento como "EN <evento> banner.png" (o el de China, que sale antes).
  const missing = refined.events.filter(e => !e.image && e.kind !== 'banner')
  const names = (e: GameEvent) => { const n = e.title.replace(/\s*\(Rerun\)$/i, ''); return [`EN ${n} Rerun banner.png`, `EN ${n} banner.png`, `CN ${n} banner.png`] }
  const guessed = missing.length ? await fileMap('arknights.wiki.gg', missing.flatMap(names)) : new Map<string, string>()
  return { ...refined, events: refined.events.map(e => {
    if (e.image || e.kind === 'banner') return e
    const cands = names(e).filter(n => /\(Rerun\)$/i.test(e.title) || !/ Rerun banner/.test(n))
    const image = cands.map(n => guessed.get(norm(n))).find(Boolean)
    return image ? { ...e, image } : e
  }) }
}

/**
 * Imagen de los reclutamientos rotativos (Standard / Kernel, que vienen de los datos del cliente): la wiki sube una por rotación ("EN Standard Pool 179 banner.png",
 * "EN Kernel 64 banner.png") el día antes de que empiece, así que se toma la última subida entre 10 días antes y 1 día después del inicio. 2 consultas pequeñas.
 */
async function withRotationArt(s: GameSync): Promise<GameSync> {
  const need = s.events.filter(e => e.kind === 'banner' && !e.image && /^(Standard|Kernel) Headhunting/.test(e.title))
  if (!need.length) return s
  const list = async (prefix: string) => {
    const qs = new URLSearchParams({ action: 'query', list: 'allimages', aiprefix: prefix, ailimit: '500', aiprop: 'timestamp', format: 'json', origin: '*' })
    const res = await fetch(viaProxy(`https://arknights.wiki.gg/api.php?${qs}`))
    const rows = ((await res.json())?.query?.allimages ?? []) as { name: string; timestamp: string }[]
    return rows.map(r => ({ name: norm(r.name), at: +new Date(r.timestamp) }))
  }
  const [std, ker] = await Promise.all([list('EN Standard Pool'), list('EN Kernel ')])
  const kernel = ker.filter(f => !/Locating/i.test(f.name))
  const pick = (files: { name: string; at: number }[], start: number) =>
    files.filter(f => f.at >= start - 10 * DAY && f.at <= start + DAY).sort((a, b) => b.at - a.at)[0]?.name
  const chosen = new Map(need.map(e => [e.id, pick(/^Kernel/.test(e.title) ? kernel : std, +new Date(e.start))]))
  const files = await fileMap('arknights.wiki.gg', [...chosen.values()])
  return { ...s, events: s.events.map(e => { const f = chosen.get(e.id); const image = f && files.get(f); return image ? { ...e, image } : e }) }
}

/* ---------- Arknights: Endfield (servidor AMEU) ---------- */
const EF = 'endfield.wiki.gg'
/** Los campos Ameu* de la wiki ya vienen en UTC: coinciden con las horas ISO de gachafocus (p. ej. 17:00Z). */
const AMEU = 0

/**
 * Horas del servidor de Asia (columnas Asia* de la misma tabla, también en UTC) para el selector de servidor (servers.ts). No son un simple
 * desplazamiento de las de AMEU: unos eventos empiezan a la vez y otros con un día de diferencia ("The Stars Are With Me", nov 2026).
 */
function asiaOf(r: Row): GameEvent['servers'] {
  const start = toIso(r.AsiaStartTime, AMEU), end = toIso(r.AsiaEndTime, AMEU)
  return start && end && +new Date(end) > +new Date(start) ? { asia: { start, end } } : undefined
}

/** Wikitexto → texto: {{I|Oroberyl|600}} → "Oroberyl ×600", [[a|b]] → b, sin plantillas ni etiquetas. */
function plain(w: string): string {
  return w
    .replace(/\{\{\s*(?:I|Item)\s*\|([^|}]+)(?:\|(\d[\d,]*))?[^}]*\}\}/gi, (_m, n: string, q?: string) => q ? `${n.trim()} ×${q}` : n.trim())
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\{\{\s*Color\s*\|([^|}]*)[^}]*\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}|<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ').trim()
}

/**
 * Ficha de cada evento de Endfield desde su página de la wiki (una sola consulta para todos, máx. 50): la cita de presentación, los requisitos
 * ("Participation Requirements") y los detalles ("Event Details"), más las recompensas `{{I|Nombre|cantidad}}` sumadas (con sus tiradas).
 */
async function endfieldDetails(titles: string[]): Promise<Map<string, { description: string; items: RewardItem[] }>> {
  const out = new Map<string, { description: string; items: RewardItem[] }>()
  if (!titles.length) return out
  const qs = new URLSearchParams({ action: 'query', titles: titles.slice(0, 50).join('|'), prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', format: 'json', formatversion: '2', origin: '*' })
  const res = await fetch(viaProxy(`https://${EF}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${EF} → HTTP ${res.status}`)
  const json = await res.json() as { query?: { pages?: { title: string; revisions?: { slots?: { main?: { content?: string } } }[] }[] } }
  for (const p of json.query?.pages ?? []) {
    const w = p.revisions?.[0]?.slots?.main?.content
    if (!w) continue
    const quote = /\{\{\s*Quote\s*\|([^|}]+)/i.exec(w)?.[1]
    const section = (re: RegExp) => {
      const m = new RegExp(`^==\\s*(?:${re.source})\\s*==[ \\t]*$([\\s\\S]*?)(?=^==[^=]|$(?![\\s\\S]))`, 'im').exec(w)
      if (!m) return [] as string[]
      // Breve (pedido del dueño, 12 nov 2026): solo las viñetas principales (sin las "**"), sin tablas, notas "※", subapartados ni líneas con fechas
      // u horas (ya salen en la ficha) y sin "visita la página X". Las recompensas salen aparte, con su icono (`items`).
      return plain(m[1].replace(/\{\|[\s\S]*?\|\}/g, '')).split('\n').map(l => l.trim())
        .filter(l => l && !/^(※|\*\*|=)/.test(l) && !/\d{1,4}[/-]\d{1,2}[/-]\d{2,4}|\b\d{1,2}:\d{2}\b|\bvisit the\b.*\bpage\b|calendar:?$/i.test(l))
        .map(l => l.replace(/^\*\s*/, '').replace(/\[([^\]]+)\]\s*x\s?(\d[\d,]*)/g, '$1 ×$2').replace(/\[([^\]]+)\]/g, '$1').trim())
        // Sin rótulos sueltos ("Event Phase 1", cuyo contenido eran fechas): menos de 4 palabras no es una explicación.
        .filter(l => l.split(/\s+/).length >= 4 && !/:$/.test(l))
    }
    const req = section(/Participation Requirements?/)[0], det = section(/Event Details|Details/).slice(0, 2)
    const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s)
    const description = [quote && cut(plain(quote), 220), req && `⟦d.efReq|${cut(req, 160)}⟧`, ...det.map(d => `• ${cut(d, 220)}`)].filter(Boolean).join('\n')
    const tot = new Map<string, number>()
    // Con cantidad se suman; sin ella ("[{{Item|Mark of Perseverance|gv=no}}]") también se listan (cantidad 0), para que salgan con su icono.
    for (const m of w.matchAll(/\{\{\s*(?:I|Item)\s*\|([^|}]+)(?:\|(\d[\d,]*))?/gi)) {
      const n = m[1].trim()
      if (/=/.test(n)) continue
      tot.set(n, (tot.get(n) ?? 0) + (m[2] ? Number(m[2].replace(/,/g, '')) : 0))
    }
    // Total anunciado en el texto, con la cantidad fuera de la plantilla: "claim rewards including [{{Item|Oroberyl|gv=no}}]x1000" (Yuanyuan's
    // Blazing Stoves, 12 nov 2026). La tabla de tareas de esa página solo sumaba 600 (los hitos de la posada no salen en ella): si el texto
    // anuncia más, manda el texto.
    for (const m of w.matchAll(/\{\{\s*(?:I|Item)\s*\|([^|}]+)[^}]*\}\}\]?\s*[x×]\s?(\d[\d,]*)/gi)) {
      const n = m[1].trim(), v = Number(m[2].replace(/,/g, ''))
      if (!/=/.test(n) && v > (tot.get(n) ?? 0)) tot.set(n, v)
    }
    const items = [...tot].map(([name, amount]) => ({ name, amount })).sort((a, b) => Number(/oroberyl|permit/i.test(b.name)) - Number(/oroberyl|permit/i.test(a.name)) || b.amount - a.amount).slice(0, 10)
    out.set(p.title, { description, items })
  }
  return out
}

export async function syncEndfield(gameId: string): Promise<GameSync> {
  const since = sinceDate()
  const [events, banners, versions] = await Promise.all([
    cargo(EF, { tables: 'Events', fields: 'Event,Type,Image,AmeuStartTime,AmeuEndTime,AsiaStartTime,AsiaEndTime', where: `AmeuEndTime>'${since}'`, order_by: 'AmeuStartTime' }),
    cargo(EF, { tables: 'Banners', fields: 'Banner,Image,RateUpOperator,LimitedOperators,AmeuStartTime,AmeuEndTime,AsiaStartTime,AsiaEndTime', where: `AmeuEndTime>'${since}'`, order_by: 'AmeuStartTime' }),
    cargo(EF, { tables: 'Versions', fields: 'Version,VersionNumber,StartTime,EndTime', order_by: 'StartTime' }),
  ])

  const [files, details] = await Promise.all([fileMap(EF, [...events.map(r => r.Image), ...banners.map(r => r.Image)]),
    endfieldDetails(events.map(r => r.Event)).catch(err => { console.warn('[endfield] fichas:', (err as Error)?.message ?? err); return new Map<string, { description: string; items: RewardItem[] }>() })])
  const evs = compact(events.map(r => make(gameId, /challenge/i.test(r.Type) ? 'challenge' : 'event', r.Event + r.AmeuStartTime, r.Event,
    toIso(r.AmeuStartTime, AMEU), toIso(r.AmeuEndTime, AMEU), { image: r.Image ? files.get(norm(r.Image)) : undefined, description: [r.Type ? `⟦d.efType|${r.Type}⟧` : '', details.get(r.Event)?.description ?? ''].filter(Boolean).join('\n') || undefined, servers: asiaOf(r),
    items: details.get(r.Event)?.items ?? [], pulls: pullsIn('endfield', (details.get(r.Event)?.items ?? []).map(i => `${i.name} x${i.amount}`)).pulls })))

  const bns = compact(banners.map(r => {
    const names = (r.RateUpOperator || r.LimitedOperators || '').split(';').filter(Boolean)
    const featured: Featured[] = names.slice(0, 3).map(name => ({ name, rarity: 6 }))
    return make(gameId, 'banner', r.Banner + r.AmeuStartTime, names.length ? names.join(' / ') : r.Banner,
      toIso(r.AmeuStartTime, AMEU), toIso(r.AmeuEndTime, AMEU), {
        image: r.Image ? files.get(norm(r.Image)) : undefined, featured, description: `⟦d.efBanner|${r.Banner}⟧`, servers: asiaOf(r),
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
