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
  const pageOf = new Map(rows.map(r => [`${gameId}:event:${r.event + r.startTime}`, r.event]))
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
  const withArt = refined.events.map(e => {
    if (e.image || e.kind === 'banner') return e
    const cands = names(e).filter(n => /\(Rerun\)$/i.test(e.title) || !/ Rerun banner/.test(n))
    const image = cands.map(n => guessed.get(norm(n))).find(Boolean)
    return image ? { ...e, image } : e
  })
  // Recompensas de la página del evento en la wiki (los que el cliente no da): una sola consulta.
  const need = withArt.filter(e => e.kind !== 'banner' && !e.items.length && pageOf.has(e.id))
  const rewards = need.length ? await akPageRewards(need.map(e => pageOf.get(e.id)!)).catch(() => new Map<string, AkPage>()) : new Map<string, AkPage>()
  // El inicio de sesión de la página ("==Hunting Time Login Event==") es su propio evento si sale aparte (datos del cliente, que solo suman el
  // Orundum): entonces va a ese evento, completo (también los permisos), y no se repite en el principal.
  const loginOf = new Map<string, RewardItem[]>()
  for (const pg of rewards.values()) if (pg.login && withArt.some(e => e.title.toLowerCase() === pg.login!.name.toLowerCase())) loginOf.set(pg.login.name.toLowerCase(), pg.login.items)
  const withPulls = (e: GameEvent, items: RewardItem[]): GameEvent => {
    // Tiradas: Orundum (600) y permisos de reclutamiento (cualquier "… Headhunting Permit" = 1); el Originite Prime se cambia por 180 Orundum.
    const op = items.find(i => i.name === 'Originite Prime')?.amount ?? 0
    const lines = items.map(i => (/headhunting permit$/i.test(i.name) && !/ten-roll/i.test(i.name) ? `Headhunting Permit x${i.amount}` : `${i.name} x${i.amount}`))
    if (op) lines.push(`Orundum x${op * 180}`)
    return { ...e, items, pulls: pullsIn('arknights', lines).pulls }
  }
  return { ...refined, events: withArt.map(e => {
    const login = loginOf.get(e.title.toLowerCase())
    if (login && login.length > e.items.length) return withPulls(e, login)
    const pg = rewards.get(pageOf.get(e.id) ?? '')
    if (!pg || e.items.length) return e
    const items = [...pg.items, ...(pg.login && !loginOf.has(pg.login.name.toLowerCase()) ? pg.login.items : [])]
    return items.length ? withPulls(e, items) : e
  }) }
}

interface AkPage { items: RewardItem[]; login?: { name: string; items: RewardItem[] } }

/**
 * Recompensas de la página de cada evento en arknights.wiki.gg (18 nov 2026): el inicio de sesión del evento (`{{Login reward cell|day=2|item1=Orundum,200|…}}`)
 * y el Originite Prime de primera vez de sus misiones («All TD operations are worth {{Cur|Originite Prime|31}}»). Las tiendas de packs (de pago) no.
 * Las reediciones tienen su propia página ("A Flurry to the Flame/Rerun").
 */
async function akPageRewards(pages: string[]): Promise<Map<string, AkPage>> {
  const out = new Map<string, AkPage>()
  const titles = [...new Set(pages)].slice(0, 50)
  const qs = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.join('|'), format: 'json', formatversion: '2', origin: '*' })
  const res = await fetch(viaProxy(`https://arknights.wiki.gg/api.php?${qs}`))
  if (!res.ok) return out
  for (const p of ((await res.json())?.query?.pages ?? []) as { title: string; revisions?: { slots?: { main?: { content?: string } } }[] }[]) {
    const text = p.revisions?.[0]?.slots?.main?.content ?? ''
    const tally = () => {
      const sum = new Map<string, number>()
      const add = (name: string, n: number) => { if (name && n > 0) sum.set(name, (sum.get(name) ?? 0) + n) }
      // Lo que cuenta primero; el resto (materiales) detrás.
      const order = (n: string) => (/^orundum$|headhunting permit$|^originite prime$/i.test(n) ? 0 : 1)
      const list = () => [...sum].map(([name, amount]) => ({ name, amount })).sort((a, b) => order(a.name) - order(b.name))
      return { add, list }
    }
    const login = tally(), main = tally()
    for (const cell of text.matchAll(/\{\{\s*Login reward cell([^}]*)\}\}/gi))
      for (const m of cell[1].matchAll(/\|\s*item\d?\s*=\s*([^,|}]+?)\s*,\s*([\d,]+)/gi)) login.add(m[1].trim(), Number(m[2].replace(/,/g, '')))
    for (const m of text.matchAll(/operations are worth \{\{\s*Cur\s*\|\s*Originite Prime\s*\|\s*(\d+)/gi)) main.add('Originite Prime', Number(m[1]))
    // Hitos de los modos limitados ("Championship Trophies" de Positional Football Championship, 21 nov 2026): `{{Milestone cell|item = LMD, 10000}}`
    // sumados, y el traje de regalo (`|outfit = Bouncing Rhythms`) como 1.
    for (const cell of text.matchAll(/\{\{\s*Milestone cell([^}]*)\}\}/gi)) {
      for (const m of cell[1].matchAll(/\|\s*item\d?\s*=\s*([^,|}]+?)\s*,\s*([\d,]+)/gi)) main.add(m[1].trim(), Number(m[2].replace(/,/g, '')))
      const outfit = /\|\s*outfit\s*=\s*([^|}\n]+)/i.exec(cell[1])?.[1]?.trim()
      if (outfit) main.add(outfit, 1)
    }
    const loginName = /==\s*([^=\n]+?)\s+Login Event\s*==/i.exec(text)?.[1]
    const li = login.list()
    out.set(p.title, { items: main.list(), login: li.length ? { name: loginName ?? '', items: li } : undefined })
  }
  return out
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
    // Echoes of War: la recompensa de cada dificultad va al final de su plantilla ("|Oroberyl:100,T-Creds:25000").
    for (const m of w.matchAll(/^\|\s*((?:[A-Za-z][^:|{}\n=/]{1,50}:\s*\d[\d,]*\s*,?\s*)+)$/gm))
      for (const x of m[1].matchAll(/([A-Za-z][^:,]{1,50}?)\s*:\s*(\d[\d,]*)/g)) tot.set(x[1].trim(), (tot.get(x[1].trim()) ?? 0) + Number(x[2].replace(/,/g, '')))
    const items = [...tot].map(([name, amount]) => ({ name, amount })).sort((a, b) => Number(/oroberyl|permit/i.test(b.name)) - Number(/oroberyl|permit/i.test(a.name)) || b.amount - a.amount).slice(0, 10)
    out.set(p.title, { description, items })
  }
  return out
}

export async function syncEndfield(gameId: string): Promise<GameSync> {
  const since = sinceDate()
  // Banners de arma ("Issues" del Arsenal Exchange): otra tabla Cargo (21 nov 2026: Lunar Calling, Jade Vessel y Umbra of Frigid Eventide no salían).
  // Los permanentes (IsPermanent) no se listan. Si la consulta falla, salen solo los de operadores, como antes.
  const issues = cargo(EF, { tables: 'Issues', fields: 'Issue,Image,RateUpWeapon,IsPermanent,AmeuStartTime,AmeuEndTime,AsiaStartTime,AsiaEndTime', where: `AmeuEndTime>'${since}'`, order_by: 'AmeuStartTime' })
    .then(rows => rows.filter(r => r.IsPermanent !== '1' && r.RateUpWeapon))
    .catch(err => { console.warn('[endfield] Issues:', (err as Error)?.message ?? err); return [] as Row[] })
  const [events, banners, versions, weapons] = await Promise.all([
    cargo(EF, { tables: 'Events', fields: 'Event,Type,Image,AmeuStartTime,AmeuEndTime,AsiaStartTime,AsiaEndTime', where: `AmeuEndTime>'${since}'`, order_by: 'AmeuStartTime' }),
    cargo(EF, { tables: 'Banners', fields: 'Banner,Image,RateUpOperator,LimitedOperators,AmeuStartTime,AmeuEndTime,AsiaStartTime,AsiaEndTime', where: `AmeuEndTime>'${since}'`, order_by: 'AmeuStartTime' }),
    cargo(EF, { tables: 'Versions', fields: 'Version,VersionNumber,StartTime,EndTime', order_by: 'StartTime' }),
    issues,
  ])

  // Día de versión nueva: todos los servidores abren a la vez (nota oficial de la 1.7: Asia 25 nov 06:00–12:00 UTC+8 y América/Europa 24 nov
  // 17:00–23:00 UTC-5, las dos terminan a las 04:00 UTC). La wiki a veces da a América/Europa las 17:00 UTC de ese día, la hora de las fases de
  // mitad de versión (25 nov 2026: Kay, los banners de arma y la propia 1.7 salían 13 h tarde). Lo de ese día que en Asia empieza a las 04:00 y en
  // AMEU a las 17:00 toma las 04:00. Las fases de mitad de versión (5 nov, 16 dic) no son días de versión y se quedan como están.
  const versionDays = new Set(versions.map(v => (v.StartTime ?? '').slice(0, 10)).filter(Boolean))
  const launch = (r: Row) => {
    const d = (r.AmeuStartTime ?? '').slice(0, 10)
    if (versionDays.has(d) && r.AmeuStartTime === `${d} 17:00:00` && r.AsiaStartTime === `${d} 04:00:00`) r.AmeuStartTime = r.AsiaStartTime
  }
  for (const r of [...events, ...banners, ...weapons]) launch(r)
  for (const v of versions) {
    const d = (v.StartTime ?? '').slice(0, 10)
    if (v.StartTime === `${d} 17:00:00` && [...events, ...banners, ...weapons].some(r => r.AsiaStartTime === `${d} 04:00:00`)) v.StartTime = `${d} 04:00:00`
  }

  const [files, details] = await Promise.all([fileMap(EF, [...events.map(r => r.Image), ...banners.map(r => r.Image), ...weapons.map(r => r.Image)]),
    // "Season of Fervor" (la temporada de Echoes of War) tiene su página como "Echoes of War: Season of Fervor".
    endfieldDetails(events.flatMap(r => (/^Season of /i.test(r.Event) ? [r.Event, `Echoes of War: ${r.Event}`] : [r.Event]))).then(d => {
      for (const r of events) if (!d.get(r.Event)?.items.length && d.has(`Echoes of War: ${r.Event}`)) d.set(r.Event, d.get(`Echoes of War: ${r.Event}`)!)
      return d
    }).catch(err => { console.warn('[endfield] fichas:', (err as Error)?.message ?? err); return new Map<string, { description: string; items: RewardItem[] }>() })])
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

  const wps = compact(weapons.map(r => make(gameId, 'banner', `issue:${r.Issue}${r.AmeuStartTime}`, r.RateUpWeapon,
    toIso(r.AmeuStartTime, AMEU), toIso(r.AmeuEndTime, AMEU), {
      image: r.Image ? files.get(norm(r.Image)) : undefined, featured: [{ name: r.RateUpWeapon, rarity: 6 }],
      description: `⟦d.weaponBanner⟧ · ${r.Issue}`, servers: asiaOf(r),
    })))

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
  return { events: [...evs, ...bns, ...wps], patches, codes: [] }
}
