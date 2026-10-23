import type { ApiKey, Featured, GameEvent, Kind, Patch, PromoCode, RewardItem } from '../types'
import { viaProxy } from '../net'

const BASE = 'https://api.ennead.cc/mihoyo'

/** Moneda premium -> tiradas (160 por tirada en los tres juegos). */
const PER_PULL = 160
const PULL_ITEM = /intertwined fate|acquaint fate|tracks of destiny|special pass|master tape|encrypted/i
const PREMIUM = /primogem|stellar jade|polychrome|oneiric/i

interface RawReward { name: string; icon?: string; amount: number }
interface RawChar { name: string; full_name?: string; icon?: string; rarity?: number | string; element?: string; profession?: string }
interface Raw {
  id: number | string
  name: string
  description?: string
  image_url?: string | null
  type_name?: string
  start_time?: number
  end_time?: number
  version?: string
  banner_type?: string
  rewards?: RawReward[]
  special_reward?: RawReward | null
  polychrome?: number
  characters?: RawChar[]
  agents?: RawChar[]
  weapons?: RawChar[]
  light_cones?: RawChar[]
  w_engines?: RawChar[]
}

const iso = (s: number) => new Date(s * 1000).toISOString()
const valid = (r: Raw) => !!r.start_time && !!r.end_time && r.start_time > 86_400 && r.end_time > r.start_time

function pullsOf(r: Raw): number {
  let pulls = 0
  const all = [...(r.rewards ?? []), ...(r.special_reward ? [r.special_reward] : [])]
  for (const x of all) {
    if (PREMIUM.test(x.name)) pulls += x.amount / PER_PULL
    else if (PULL_ITEM.test(x.name)) pulls += x.amount
  }
  if (r.polychrome) pulls += r.polychrome / PER_PULL
  return Math.round(pulls * 10) / 10
}

function itemsOf(r: Raw): RewardItem[] {
  const all = [...(r.special_reward ? [r.special_reward] : []), ...(r.rewards ?? [])]
  return all.filter(x => x.amount > 0).map(x => ({ name: x.name.replace(/<[^>]+>/g, ''), icon: x.icon, amount: x.amount }))
}

const star = (c: RawChar) => (typeof c.rarity === 'string' ? (c.rarity === 'S' ? 5 : c.rarity === 'A' ? 4 : Number(c.rarity)) : c.rarity)

function mapEvent(gameId: string, kind: Kind, r: Raw, suffix = ''): GameEvent {
  return {
    id: `${gameId}:${kind}:${r.id}${suffix}`,
    gameId,
    kind,
    title: r.name,
    description: r.description || undefined,
    image: r.image_url || undefined,
    start: iso(r.start_time!),
    end: iso(r.end_time!),
    items: itemsOf(r),
    featured: [],
    pulls: pullsOf(r),
    source: 'api',
  }
}

function mapBanner(gameId: string, r: Raw, idx: number): GameEvent {
  const chars = [...(r.characters ?? []), ...(r.agents ?? [])]
  const gear = [...(r.weapons ?? []), ...(r.light_cones ?? []), ...(r.w_engines ?? [])]
  const top = chars.filter(c => star(c) === 5)
  const featured: Featured[] = (top.length ? top : chars.slice(0, 1)).map(c => ({ name: c.name, icon: c.icon, rarity: star(c), tag: c.element ?? c.profession, full: c.full_name }))
  const gearTop = gear.filter(c => star(c) === 5).slice(0, 2)
  const weaponBanner = /weapon|engine|light/i.test(`${r.name} ${r.banner_type ?? ''}`) && !chars.length
  const label = weaponBanner || (!chars.length && gear.length) ? '⟦d.weaponBanner⟧' : '⟦d.charBanner⟧'
  const names = featured.map(f => f.name).join(' / ') || gearTop.map(c => c.name).join(' / ')
  return {
    id: `${gameId}:banner:${r.id ?? r.banner_type}:${r.version}:${idx}:${r.start_time}`,
    gameId,
    kind: 'banner',
    title: names || r.name || `v${r.version}`,
    description: `${label} · v${r.version}${gearTop.length ? ` · ${gearTop.map(c => c.name).join(', ')}` : ''}`,
    start: iso(r.start_time!),
    end: iso(r.end_time!),
    items: [],
    featured: featured.length ? featured : gearTop.map(c => ({ name: c.name, icon: c.icon, rarity: star(c) })),
    pulls: 0,
    source: 'api',
  }
}

export interface GameSync {
  events: GameEvent[]
  patches: Patch[]
  codes: PromoCode[]
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Deduce parches a partir de las versiones de los banners oficiales. */
function patchesFrom(gameId: string, banners: Raw[]): Patch[] {
  const byVersion = new Map<string, { start: number; end: number }>()
  for (const b of banners.filter(valid)) {
    if (!b.version) continue
    const cur = byVersion.get(b.version) ?? { start: Infinity, end: 0 }
    cur.start = Math.min(cur.start, b.start_time!)
    cur.end = Math.max(cur.end, b.end_time!)
    byVersion.set(b.version, cur)
  }
  const out: Patch[] = []
  for (const [v, { start, end }] of byVersion) {
    out.push({ id: `${gameId}:patch:${v}`, gameId, version: v, date: iso(start), notes: 'Inicio de la versión (según banners oficiales)', source: 'api' })
    const [maj, min] = v.split('.').map(Number)
    if (Number.isFinite(maj) && Number.isFinite(min)) {
      const next = `${maj}.${min + 1}`
      if (!byVersion.has(next))
        out.push({ id: `${gameId}:patch:${next}`, gameId, version: next, date: iso(end + 1), notes: 'Estimado: se calcula con el fin de los banners actuales (puede cambiar de número mayor).', source: 'api', estimated: true })
    }
  }
  return out
}

export async function syncGame(gameId: string, api: ApiKey): Promise<GameSync> {
  if (api !== 'genshin' && api !== 'starrail' && api !== 'zenless') throw new Error('Fuente no soportada por ennead')
  const [cal, codes] = await Promise.all([
    getJson<{ events?: Raw[]; banners?: Raw[]; challenges?: Raw[] }>(`${BASE}/${api}/calendar`),
    getJson<{ active?: PromoCode[] }>(`${BASE}/${api}/codes`).catch(() => ({ active: [] as PromoCode[] })),
  ])
  const events = (cal.events ?? []).filter(valid).map(r => mapEvent(gameId, 'event', r))
  const challenges = (cal.challenges ?? []).filter(valid).map(r => mapEvent(gameId, 'challenge', r, `:${r.name}`))
  const banners = (cal.banners ?? []).filter(valid).map((r, i) => mapBanner(gameId, r, i))
  return {
    events: [...events, ...challenges, ...banners],
    patches: patchesFrom(gameId, cal.banners ?? []),
    codes: codes.active ?? [],
  }
}
