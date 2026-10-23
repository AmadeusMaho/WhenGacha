import type { GameEvent, Kind } from '../types'
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

const clean = (s?: string) => s?.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').trim() || undefined

export async function syncUma(gameId: string): Promise<GameSync> {
  const res = await fetch(`${BASE}/resources/current/banner_timeline.json`)
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
    const label = kind === 'banner' ? `${r.card_type === 'support' ? 'Cartas de apoyo' : 'Uma'}` : undefined
    events.push({
      id: `${gameId}:${kind}:${r.id}`,
      gameId,
      kind,
      title: kind === 'banner' && uniq.length > 0 && uniq.length <= 3 ? uniq.join(' / ') : r.title,
      description: [clean(r.description), label && uniq.length ? `${label}: ${uniq.slice(0, 6).join(', ')}${uniq.length > 6 ? '…' : ''}` : undefined,
        r.is_confirmed === false ? 'Fecha estimada: aún no confirmada.' : undefined].filter(Boolean).join('\n') || undefined,
      image: imageOf(r),
      start: r.global_release_date,
      end: r.estimated_end_date,
      items: [],
      featured: kind === 'banner' ? uniq.slice(0, 3).map(name => ({ name, rarity: 3 })) : [],
      pulls: 0,
      source: 'api',
    })
  }
  return { events, patches: [], codes: [] }
}
