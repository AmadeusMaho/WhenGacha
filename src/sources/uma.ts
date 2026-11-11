import type { GameEvent, Kind } from '../types'
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
 * Retrato oficial de cada Uma (las fichas de personaje de la web oficial), por nombre, desde la lista pública de umapyoi.net.
 * uma.moe solo da los nombres de los destacados; sin esto la ventana del banner mostraba solo texto. Si falla, se sigue sin retratos.
 */
async function portraits(): Promise<Map<string, string>> {
  try {
    const res = await fetch(viaProxy('https://umapyoi.net/api/v1/character/list'))
    if (!res.ok) return new Map()
    const list = (await res.json()) as { name_en?: string; thumb_img?: string }[]
    return new Map(list.filter(c => c.name_en && c.thumb_img?.startsWith('https://')).map(c => [nameKey(c.name_en!), c.thumb_img!]))
  } catch { return new Map() }
}

export async function syncUma(gameId: string): Promise<GameSync> {
  const [res, faces] = await Promise.all([fetch(viaProxy(`${BASE}/resources/current/banner_timeline.json`)), portraits()])
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
    const names = (r.card_type === 'support' ? r.related_support_card_names : r.related_characters) ?? []
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
      featured: kind === 'banner' ? uniq.slice(0, 3).map(name => ({ name, rarity: 3, icon: r.card_type === 'support' ? undefined : faces.get(nameKey(name)) })) : [],
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
