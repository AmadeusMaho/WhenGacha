import type { Featured, GameEvent, Kind, RewardItem } from '../types'
import { viaProxy } from '../net'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * Cronología del servidor Global de Umamusume desde los recursos públicos de uma.moe.
 * No es una API documentada: el archivo puede cambiar de forma sin aviso.
 */
const BASE = 'https://uma.moe'
const DAY = 86_400_000

interface Raw {
  id: string
  title: string
  type: string
  description?: string
  image?: string
  image_path?: string
  global_release_date?: string
  estimated_end_date?: string
  is_confirmed?: boolean
  card_type?: string
  related_characters?: string[]
  related_support_card_names?: string[]
  pickup_card_ids?: number[]
}

const BANNERS = new Set(['paid_banner', 'character_banner', 'support_card_banner'])
const CHALLENGES = new Set(['champions_meeting', 'legend_race', 'league_of_heroes', 'masters_challenge', 'strongest_team', 'racing_carnival', 'trainer_skills_test'])

const kindOf = (t: string): Kind => (BANNERS.has(t) ? 'banner' : CHALLENGES.has(t) ? 'challenge' : 'event')

const imageOf = (r: Raw) => (r.image?.startsWith('http') ? r.image : r.image_path ? `${BASE}/${r.image_path}` : undefined)

/** Campañas pequeñas y repetitivas (recompensas por carrera, misiones sueltas). */
const MINOR = /(training|breeding) reward|celebration missions|missions,? part/i

const clean = (s?: string) => s?.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').trim() || undefined

/** Clave para emparejar nombres: sin variantes "(…)", espacios, puntos ni apóstrofos ("K.S. Miracle" = "K.S.Miracle"). */
const nameKey = (s: string) => s.replace(/\s*\(.*?\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Datos de umapyoi.net (API pública, robots.txt "Allow: /"; 3 consultas con caché de un día) para saber QUÉ carta sale en cada banner.
 * uma.moe da `pickup_card_ids`, que identifican la carta exacta, pero sus nombres no bastan:
 *  - Personajes: id de 6 cifras = personaje (4) + traje (2). "105202" es Haru Urara con su traje alternativo [First Urara ♪ Saku Sakura]; antes
 *    salía como "Haru Urara" con el retrato del traje básico. Ahora: nombre del personaje, el traje como etiqueta y la imagen de ESE traje.
 *  - Cartas de apoyo: id de 5 cifras, la primera es la rareza (3 = SSR, 2 = SR, 1 = R). uma.moe a veces da el título de la carta
 *    ("Heirs to the Throne") como si fuera un personaje. Ahora: nombre del personaje, "SSR · <título>" como etiqueta y la imagen de la carta.
 * Si umapyoi falla, se vuelve a lo de antes (nombres de uma.moe).
 */
interface Lookups { chars: Map<number, { name: string; thumb?: string }>; outfits: Map<number, string>; supports: Map<number, { chara: number; title: string }> }
async function lookups(): Promise<Lookups> {
  const get = async <T,>(path: string): Promise<T[]> => {
    try { const r = await fetch(viaProxy(`https://umapyoi.net/api/v1/${path}`)); return r.ok ? ((await r.json()) as T[]) : [] } catch { return [] }
  }
  const [cl, ol, sl] = await Promise.all([
    get<{ game_id?: number; name_en?: string; thumb_img?: string }>('character/list'),
    get<{ id?: number; title?: string }>('outfit'),
    get<{ id?: number; chara_id?: number; title_en?: string }>('support'),
  ])
  const bare = (t?: string) => t?.replace(/^\[|\]$/g, '').trim() ?? ''
  return {
    chars: new Map(cl.filter(c => c.game_id && c.name_en).map(c => [c.game_id!, { name: c.name_en!, thumb: c.thumb_img?.startsWith('https://') ? c.thumb_img : undefined }])),
    outfits: new Map(ol.filter(o => o.id && o.title).map(o => [o.id!, bare(o.title)])),
    supports: new Map(sl.filter(s => s.id && s.title_en).map(s => [s.id!, { chara: s.chara_id ?? 0, title: bare(s.title_en) }])),
  }
}

const RARITY = ['', 'R', 'SR', 'SSR']
/** Imágenes: la de cada carta de apoyo, de uma.moe (la misma fuente de la cronología); la de cada traje, de GameTora (/images, permitido en su robots.txt). */
const supportImg = (id: number) => `${BASE}/assets/images/support_card/half/support_card_s_${id}.png`
const outfitImg = (id: number) => `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${Math.floor(id / 100)}_${id}.png`

/** Destacados de un banner a partir de sus ids. `null` si no se reconoce ninguno (entonces se usan los nombres de uma.moe). */
export function featuredFromIds(ids: number[], support: boolean, lk: Lookups): Featured[] | null {
  const out: Featured[] = []
  for (const id of ids) {
    if (support) {
      const s = lk.supports.get(id)
      if (!s) continue
      const name = lk.chars.get(s.chara)?.name ?? s.title
      if (out.some(f => f.name === name)) continue // la misma carta en SSR y SR (o R): se queda la primera, que es la de más rareza
      out.push({ name, rarity: Math.floor(id / 10000), tag: [RARITY[Math.floor(id / 10000)], name !== s.title ? s.title : ''].filter(Boolean).join(' · '), icon: supportImg(id) })
    } else {
      const c = lk.chars.get(Math.floor(id / 100))
      if (!c) continue
      if (out.some(f => f.name === c.name)) continue
      // El traje básico (…01) puede usar la ficha oficial; los alternativos, la imagen de su traje.
      out.push({ name: c.name, rarity: 3, tag: lk.outfits.get(id), icon: id % 100 === 1 ? (c.thumb ?? outfitImg(id)) : outfitImg(id) })
    }
  }
  return out.length ? out : null
}

/**
 * Recompensas de los eventos de historia (18 nov 2026), de GameTora (gametora.com; su robots.txt solo cierra /patron-zone, /loc/ y poco más):
 *  - /umamusume/events/story-events: la lista con el nombre en inglés de Global (`name_en`, y el de antes `name_en_old`: "Sweet Memories ♥ Tea Time",
 *    el que usa uma.moe) y su página (`url_name`).
 *  - /umamusume/events/story-event-<n>: `eventRewardsData.rewards`, las recompensas por puntos del evento ({item_id, item_num, points}), con las
 *    cifras de Global (Sweet Memories: 1500 Carats, 2 + 2 Scout Tickets…). Los datos van en el JSON de Next.js de la página (`__NEXT_DATA__`).
 * Solo los objetos de `GT_ITEMS` (nombres de Global de su `items.json`) y la carta de apoyo del evento (id de 5 cifras); el resto (Monies, puntos
 * de amistad, materiales) no se lista. Iconos: los de GameTora (/images). Las campañas, carreras y misiones no tienen fuente de recompensas.
 * 1 página de lista y hasta 4 de evento por ciclo (caché de 24 h en el proxy).
 */
const GT = 'https://gametora.com'
const GT_ITEMS: [number, string][] = [
  [43, 'Carats'], [41, 'Trainee Scout Ticket'], [111, 'Support Card Scout Ticket'], [44, 'Dream Glimmer'], [160, 'Book of Hints'], [161, 'Textbook of Hints'], [95, 'Alarm Clock'],
]
const gtIcon = (id: number) => `${GT}/images/umamusume/items/item_icon_${String(id).padStart(5, '0')}.png`
const nextData = (html: string) => { try { return JSON.parse(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? 'null')?.props?.pageProps } catch { return undefined } }
interface GtStory { url_name: string; name_en?: string; name_en_old?: string }
const MAX_STORY_PAGES = 4

async function withStoryRewards(events: GameEvent[], lk: Lookups): Promise<void> {
  const now = Date.now()
  const want = events.filter(e => e.kind === 'event' && !e.minor && +new Date(e.end) > now).sort((a, b) => a.start.localeCompare(b.start))
  if (!want.length) return
  const list = await fetch(viaProxy(`${GT}/umamusume/events/story-events`)).then(r => (r.ok ? r.text() : '')).catch(() => '')
  const stories = (nextData(list)?.storyEventData ?? []) as GtStory[]
  let pages = MAX_STORY_PAGES
  for (const e of want) {
    const k = nameKey(e.title)
    const st = stories.find(x => [x.name_en, x.name_en_old].some(n => n && nameKey(n) === k))
    if (!st || !/^story-event-\d+$/.test(st.url_name) || pages-- <= 0) continue
    const html = await fetch(viaProxy(`${GT}/umamusume/events/${st.url_name}`)).then(r => (r.ok ? r.text() : '')).catch(() => '')
    const rewards = (nextData(html)?.eventRewardsData?.rewards ?? []) as { item_id: number; item_num: number }[]
    const sum = new Map<number, number>()
    for (const r of rewards) sum.set(r.item_id, (sum.get(r.item_id) ?? 0) + r.item_num)
    const items: RewardItem[] = GT_ITEMS.filter(([id]) => sum.has(id)).map(([id, name]) => ({ name, amount: sum.get(+id)!, icon: gtIcon(+id) }))
    // La carta de apoyo del evento (SSR que se gana con puntos): id de 5 cifras.
    for (const [id, n] of sum) {
      const sc = id >= 10000 && id < 40000 ? lk.supports.get(id) : undefined
      if (sc) items.push({ name: `${RARITY[Math.floor(id / 10000)]} ${lk.chars.get(sc.chara)?.name ?? sc.title}`, amount: n, icon: supportImg(id) })
    }
    if (!items.length) continue
    e.items = items
    e.pulls = pullsIn('uma', items.map(i => `${i.name} x${i.amount}`)).pulls
  }
}

export async function syncUma(gameId: string): Promise<GameSync> {
  const [res, lk] = await Promise.all([fetch(viaProxy(`${BASE}/resources/current/banner_timeline.json`)), lookups()])
  const faces = new Map([...lk.chars.values()].filter(c => c.thumb).map(c => [nameKey(c.name), c.thumb!]))
  if (!res.ok) throw new Error(`uma.moe → HTTP ${res.status}`)
  const json = (await res.json()) as { events?: Raw[] }
  const from = Date.now() - 3 * DAY
  const to = Date.now() + 120 * DAY

  const events: GameEvent[] = []
  for (const r of json.events ?? []) {
    if (!r.global_release_date || !r.estimated_end_date) continue
    const s = +new Date(r.global_release_date), e = +new Date(r.estimated_end_date)
    if (!(e > s) || e < from || s > to) continue
    const kind = kindOf(r.type)
    const support = r.card_type === 'support'
    const byId = kind === 'banner' ? featuredFromIds(r.pickup_card_ids ?? [], support, lk) : null
    const names = byId?.map(f => f.name) ?? (support ? r.related_support_card_names : r.related_characters) ?? []
    const uniq = [...new Set(names)]
    const label = kind === 'banner' ? (r.card_type === 'support' ? '⟦d.supportCards⟧' : '⟦d.umas⟧') : undefined
    events.push({
      id: `${gameId}:${kind}:${r.id}`,
      gameId,
      kind,
      title: kind === 'banner' && uniq.length > 0 && uniq.length <= 3 ? uniq.join(' / ') : r.title,
      description: [clean(r.description), label && uniq.length ? `${label}: ${uniq.slice(0, 6).join(', ')}${uniq.length > 6 ? '…' : ''}` : undefined].filter(Boolean).join('\n') || undefined,
      image: imageOf(r),
      start: r.global_release_date,
      end: r.estimated_end_date,
      items: [],
      // Cartas de apoyo: los nombres son títulos de carta, no personajes; esos no llevan retrato.
      featured: kind !== 'banner' ? [] : byId ? byId.slice(0, 3)
        : uniq.slice(0, 3).map(name => ({ name, rarity: 3, icon: support ? undefined : faces.get(nameKey(name)) })),
      pulls: 0,
      source: 'api',
      minor: kind === 'event' && MINOR.test(r.title) ? true : undefined,
      precision: r.is_confirmed === false ? 'estimated' : undefined,
    })
  }
  await withStoryRewards(events, lk).catch(err => console.warn('[uma] GameTora:', (err as Error)?.message ?? err))
  return { events: withPvpCaps(withRaceNames(events)), patches: [], codes: [] }
}

/**
 * Tope de premios de los modos PvP (umacaratcalculator.com, tablas de rango de su calculadora; leídas a mano el 26 nov 2026: sus condiciones
 * prohíben la descarga automatizada, así que no es una fuente del recolector y las cifras se revisan a mano):
 *  - Champions Meeting, "Champion" (1.º de la final del Grupo A): 3300 Carats, 5 Trainee y 5 Support Card Scout Tickets; desde su CM 30, 3800 Carats.
 *    Su numeración va una por delante de la de uma.moe (Aquarius Cup: CM 22 allí, `champions-meeting-21` aquí).
 *  - League of Heroes, "Platinum 4+": 2550 Carats en la 1.ª edición, 3550 desde la 2.ª, 4000 desde la 6.ª y 4900 desde la 14.ª, con 2 + 2 Scout
 *    Tickets. En Global aún no se ha celebrado ninguna (la 1.ª, hacia el 25 ene 2027) y uma.moe no las numera: se da la de la 2.ª a la 5.ª (3550).
 */
function withPvpCaps(events: GameEvent[]): GameEvent[] {
  const caps = (carats: number, tickets: number): RewardItem[] => [
    { name: 'Carats', amount: carats, icon: gtIcon(43) },
    { name: 'Trainee Scout Ticket', amount: tickets, icon: gtIcon(41) },
    { name: 'Support Card Scout Ticket', amount: tickets, icon: gtIcon(111) },
  ]
  return events.map(e => {
    if (e.kind !== 'challenge' || e.items.length) return e
    const cm = /:champions-meeting-(\d+)$/.exec(e.id)
    const items = cm ? caps(+cm[1] + 1 >= 30 ? 3800 : 3300, 5) : /league-of-heroes/i.test(e.id) ? caps(3550, 2) : undefined
    if (!items) return e
    return { ...e, items, pulls: pullsIn('uma', items.map(i => `${i.name} x${i.amount}`)).pulls,
      description: [e.description, `⟦d.upTo|${items[0].amount} Carats⟧`].filter(Boolean).join('\n') }
  })
}

/** Carrera de una campaña: 'In conjunction with the G1 race "Osaka Cup"…' o 'To celebrate the Arima Kinen G1 race…'. */
const raceOf = (d?: string) => (d && (/race,?\s*["“]([^"”]+?)[,.]?["”]/i.exec(d)?.[1] ?? /celebrate the (.+?) (?:G[123]|Jpn ?(?:I|1)) race/i.exec(d)?.[1]))?.trim()

/**
 * Las campañas por carrera se llaman todas igual ('Campaign to add "Training Reward" piece', 'Bonus Star Piece rewards in Career!') y se
 * solapan (una por cada G1): en la línea de tiempo parecían el mismo evento repetido. Si un título se repite, se le añade su carrera.
 */
function withRaceNames(events: GameEvent[]): GameEvent[] {
  const count = new Map<string, number>()
  for (const e of events) if (e.kind === 'event') count.set(e.title, (count.get(e.title) ?? 0) + 1)
  return events.map(e => {
    const race = e.kind === 'event' && (count.get(e.title) ?? 0) > 1 ? raceOf(e.description) : undefined
    return race ? { ...e, title: `${e.title} · ${race}` } : e
  })
}
