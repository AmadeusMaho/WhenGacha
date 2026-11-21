import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Limbus Company desde los datos públicos de Eldritch Tools (limbus.eldritchtools.com/timers):
 * `timers.json` con los eventos y banners actuales y próximos, e `identities_mini.json` para los nombres
 * de las identidades de cada banner. No es una API documentada; el formato puede cambiar sin aviso.
 * Las fechas son de calendario (hora de Corea). Hora real (14 nov 2026): los avisos oficiales (en imagen en Steam; citados en la wiki) dan siempre
 * "from April 20, 12:00 to May 4, 09:59 (KST)" (Hell's Chicken, Line 1, The Magic Hell Bus…): la actualización semanal es de 10:00 a 12:00 KST,
 * lo nuevo empieza a las 12:00 KST (03:00 UTC) y lo que acaba cierra a las 09:59 KST (00:59 UTC) del día de la actualización.
 * Retratos: los de Eldritch Tools (`identities/<id>_normal_profile.webp`, `egos/<id>_awaken_profile.webp`, ~20 KB). El id lleva el pecador:
 * 1|03|16 = identidad de Don Quixote; 2|06|11 = E.G.O de Hong Lu.
 */
const DATA = 'https://limbus-assets.eldritchtools.com/data'
const WIKI = 'https://limbuscompany.wiki.gg/api.php'
const ASSETS = 'https://limbus-assets.eldritchtools.com/assets/banners'
const DAY = 86_400_000
/** Días que se extiende la barra de un contenido sin fecha de fin, contados desde hoy. */
const OPEN_DAYS = 45

interface Timer { name: string; src?: string; startDate?: string; endDate?: string; catenc?: string; image?: string; bannerConds?: { ids?: string[]; sinnerId?: number } }
interface Timers {
  season?: { name: string; src?: string; endDate?: string }
  events?: { main?: Timer | null; others?: Timer[] }
  banners?: { main?: Timer | null; others?: Timer[] }
}
/** identities_mini / egos_mini: rango 1–3 en las identidades; en las E.G.O, su nivel de riesgo ("HE", "WAW"…). */
type Identities = Record<string, { name: string; rank: number | string }>

/** "2026-10-29" -> 03:00 UTC (12:00 KST, fin de la actualización) para un inicio, 00:59:59 UTC (09:59 KST) para un fin; sin fecha ("????-??-??", "Permanent") → NaN. */
function day(s: string | undefined, side: 'start' | 'end'): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '')
  return !m ? NaN : side === 'start' ? Date.UTC(+m[1], +m[2] - 1, +m[3], 3) : Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 59, 59)
}

const SINNERS = ['Yi Sang', 'Faust', 'Don Quixote', 'Ryōshū', 'Meursault', 'Hong Lu', 'Heathcliff', 'Ishmael', 'Rodion', 'Sinclair', 'Outis', 'Gregor']
const ASSET = 'https://limbus-assets.eldritchtools.com/assets'
/** Identidad o E.G.O de un banner, con su pecador y su retrato. */
function featuredOf(id: string, ids: Identities): Featured | null {
  const sinner = SINNERS[parseInt(id.slice(1, 3), 10) - 1]
  const ego = id.startsWith('2')
  const name = ids[id]?.name
  if (!sinner || (!ego && !name)) return null
  const rank = ids[id]?.rank
  return { name: name ? `${name} ${sinner}` : `E.G.O ${sinner}`, rarity: typeof rank === 'number' ? rank : undefined,
    tag: ego ? (rank ? `E.G.O · ${rank}` : 'E.G.O') : undefined,
    icon: ego ? `${ASSET}/egos/${id}_awaken_profile.webp` : `${ASSET}/identities/${id}_normal_profile.webp` }
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(viaProxy(`${DATA}/${file}.json`))
  if (!res.ok) throw new Error(`limbus ${file} → HTTP ${res.status}`)
  return res.json()
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "September 17, 2026" o "October 15th, 2026" -> "2026-09-17". */
function isoDay(text: string): string | undefined {
  const m = /([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?, (\d{4})/.exec(text)
  const mi = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
  return m && mi >= 0 ? `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : undefined
}

/** Texto plano de una página de la wiki de Limbus. */
async function wikiText(page: string): Promise<string> {
  const qs = new URLSearchParams({ action: 'parse', page, prop: 'text', format: 'json', origin: '*' })
  const res = await fetch(viaProxy(`${WIKI}?${qs}`))
  if (!res.ok) throw new Error(`limbus wiki ${page} → HTTP ${res.status}`)
  const html: string | undefined = (await res.json())?.parse?.text?.['*']
  if (!html) throw new Error(`limbus wiki ${page}: respuesta vacía`)
  // Documento completo: con un fragmento suelto, linkedom (el recolector) deja `body` vacío y la temporada y el Mirror Dungeon nunca salían en el servidor.
  // Y un espacio entre etiquetas: textContent pega las celdas ("StartSeptember 17, 2026EndTBA").
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html.replace(/></g, '> <')}</body></html>`, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ') ?? ''
}

/** URL de una miniatura de un archivo de la wiki (si existe). */
async function wikiFile(name: string): Promise<string | undefined> {
  const qs = new URLSearchParams({ action: 'query', titles: `File:${name}`, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '640', format: 'json', origin: '*' })
  const res = await fetch(viaProxy(`${WIKI}?${qs}`))
  const pages = Object.values((await res.json())?.query?.pages ?? {}) as { imageinfo?: { thumburl?: string; url: string }[] }[]
  const info = pages[0]?.imageinfo?.[0]
  return info?.thumburl ?? info?.url
}

/** La temporada y el Mirror Dungeon no traen fechas en timers.json: el inicio se lee de la wiki (el fin casi nunca se anuncia). */
async function wikiTimers(timers: Timers): Promise<Timer[]> {
  const out: Timer[] = []
  const season = timers.season
  const num = /(\d+)/.exec(season?.src ?? '')?.[1]
  const [seasonText, mdText] = await Promise.allSettled([
    season && num ? wikiText(`Season ${num}: ${season.name.toUpperCase()}`) : Promise.reject(new Error('sin temporada')),
    wikiText('Mirror Dungeon'),
  ])
  if (seasonText.status === 'fulfilled') {
    const m = /Start ([A-Za-z]+ \d{1,2}, \d{4}) End (TBA|[A-Za-z]+ \d{1,2}, \d{4})/.exec(seasonText.value)
    const startDate = m && isoDay(m[1])
    if (startDate) out.push({ name: `Season ${num}: ${season!.name}`, src: season!.src, startDate, endDate: isoDay(m[2]) ?? '????-??-??' })
  }
  if (mdText.status === 'fulfilled') {
    const m = /Mirror of ([A-Za-z ]+?) ([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?, \d{4}) - Present/.exec(mdText.value)
    const startDate = m && isoDay(m[2])
    // La wiki guarda la puerta de cada Mirror Dungeon como "Mirror of <nombre> Door.png".
    const image = startDate ? await wikiFile(`Mirror of ${m![1]} Door.png`).catch(() => undefined) : undefined
    if (startDate) out.push({ name: `Mirror Dungeon: Mirror of ${m![1]}`, startDate, endDate: '????-??-??', catenc: 'wiki', image })
  }
  return out
}

export async function syncLimbus(gameId: string): Promise<GameSync> {
  const [timers, identities, egos] = await Promise.all([
    getJson<Timers>('timers'),
    getJson<Identities>('identities_mini').catch((): Identities => ({})),
    getJson<Identities>('egos_mini').catch((): Identities => ({})),
  ])
  const extra = await wikiTimers(timers).catch((): Timer[] => [])
  const events: GameEvent[] = []
  const from = Date.now() - 3 * DAY

  const add = (t: Timer | null | undefined, kind: 'event' | 'banner') => {
    if (!t?.name) return
    const s = day(t.startDate, 'start')
    let e = day(t.endDate, 'end')
    // Sin fecha de fin ("Permanent" o "????-??-??"): se muestra desde su inicio con una barra estimada.
    const open = isNaN(e) && !isNaN(s) && !!t.endDate
    if (open) e = Math.max(s + 30 * DAY, Date.now() + OPEN_DAYS * DAY)
    if (isNaN(s) || isNaN(e) || e <= s || e < from || (open && s > Date.now() + 120 * DAY)) return
    const featured: Featured[] = (t.bannerConds?.ids ?? []).map(id => featuredOf(id, id.startsWith('2') ? egos : identities)).filter((f): f is Featured => !!f).slice(0, 6)
    events.push({
      id: `${gameId}:${kind}:${t.src ?? t.name}:${s}`,
      gameId,
      // Reflectrial y Refraction Railway son contenido con tabla de clasificación, no eventos puntuales.
      kind: kind === 'event' && t.catenc ? 'challenge' : kind,
      title: t.name.replace(/\s*\n\s*/g, ' '),
      description: open ? (/permanent/i.test(t.endDate!) ? '⟦d.permanent⟧' : '⟦d.noEnd⟧') : undefined,
      image: t.image ?? (t.src ? `${ASSETS}/${t.src}.webp` : undefined),
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      items: [],
      featured,
      pulls: 0,
      open: open || undefined,
      source: 'api',
      // Hora real según la regla de los avisos (arriba); solo el contenido sin fin anunciado queda abierto.
    })
  }

  add(timers.events?.main, 'event')
  timers.events?.others?.forEach(t => add(t, 'event'))
  extra.forEach(t => add(t, 'event'))
  add(timers.banners?.main, 'banner')
  timers.banners?.others?.forEach(t => add(t, 'banner'))
  return { events: await withAnnounced(events), patches: [], codes: [] }
}

/**
 * Banners anunciados que Eldritch Tools aún lista sin identidades (21 nov 2026: "B2F Skein Nest & B3F Drying Room", del 26 nov): la wiki los
 * nombra en "==Upcoming Banners==" de Extraction/Banner_History ("* November 26th:" y debajo "**{{Icons|IDNumber3}} 3-Star Haute Couture::Le Rouge
 * B2F Skein Nest Gregor Identity"). Una consulta, solo si hace falta. Sin retrato hasta que Eldritch Tools publique sus ids.
 */
async function withAnnounced(events: GameEvent[]): Promise<GameEvent[]> {
  const need = events.filter(e => e.kind === 'banner' && !e.featured.length && +new Date(e.start) > Date.now() - DAY)
  if (!need.length) return events
  const qs = new URLSearchParams({ action: 'parse', page: 'Extraction/Banner_History', prop: 'wikitext', format: 'json', origin: '*' })
  const text: string = await fetch(viaProxy(`${WIKI}?${qs}`)).then(r => (r.ok ? r.json() : null)).then(j => j?.parse?.wikitext?.['*'] ?? '').catch(() => '')
  const at = text.search(/==\s*Upcoming Banners\s*==/i)
  if (at < 0) return events
  const block = text.slice(at, at + 4000).split(/\n==[^=]/)[0]
  const byDay = new Map<string, Featured[]>() // "11-26" → destacados
  let cur = ''
  for (const line of block.split('\n')) {
    const d = /^\*\s*([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?\s*:/.exec(line)
    if (d) { const mi = MONTHS.indexOf(d[1].toLowerCase()); cur = mi >= 0 ? `${String(mi + 1).padStart(2, '0')}-${d[2].padStart(2, '0')}` : ''; continue }
    if (/^\*[^*]/.test(line)) { cur = ''; continue }
    const m = /^\*\*.*?(\d)-Star (.+?) (Yi Sang|Faust|Don Quixote|Ry[oō]sh[uū]|Meursault|Hong Lu|Heathcliff|Ishmael|Rodion|Sinclair|Outis|Gregor) (Identity|E\.G\.O)/i.exec(line)
    if (!cur || !m) continue
    const f: Featured = m[4].toLowerCase() === 'identity' ? { name: `${m[2].trim()} ${m[3]}`, rarity: +m[1] } : { name: `E.G.O ${m[3]}`, tag: 'E.G.O' }
    byDay.set(cur, [...(byDay.get(cur) ?? []), f])
  }
  // El banner empieza a las 12:00 KST (03:00 UTC): su día en UTC es el del aviso.
  return events.map(e => (need.includes(e) && byDay.has(e.start.slice(5, 10)) ? { ...e, featured: byDay.get(e.start.slice(5, 10))!.slice(0, 6) } : e))
}
