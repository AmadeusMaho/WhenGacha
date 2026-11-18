import type { Featured, GameEvent, Kind } from '../types'
import { viaProxy } from '../net'
import type { GameSync } from './ennead'

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
  return { events: withRaceNames(events), patches: [], codes: [] }
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
