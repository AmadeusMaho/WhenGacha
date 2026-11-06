import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Arknights (Global): horas exactas desde los datos del cliente EN, que el repositorio público
 * `ArknightsAssets/ArknightsGamedata` actualiza solo (GitHub Actions + arkprts). Sin licencia y extraídos del juego: se usan por
 * decisión del dueño (6 nov 2026). El proxy recorta `activity_table.json` (~18 MB) a su calendario (`basicInfo`) y `gacha_table.json`
 * a sus periodos de reclutamiento (`shrink` en server/proxy.mjs).
 *
 * Solo trae lo que ya está en el cliente (lo vigente y lo inminente); los eventos futuros siguen saliendo de la wiki, con "≈".
 * La wiki da bien el fin (10:59:59 UTC) pero su inicio es un valor fijo (17:00 UTC) que no coincide con el real (11:00, 12:00 o 15:00).
 */
const BASE = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel'
const DAY = 86_400_000

interface Act { id: string; type: string; name: string; startTime: number; endTime: number; isReplicate?: boolean }
interface Pool { gachaPoolId: string; gachaRuleType: string; gachaPoolName: string; openTime: number; endTime: number; dynMeta?: { main6RarityCharId?: string; sub6RarityCharId?: string; rare5CharList?: string[] } | null }

/** Tipos que no son eventos para el jugador o que solo duplican otro (la entrada genérica "Exclusive Event"). */
const SKIP_TYPES = new Set(['CHECKIN_ACCESS', 'SWITCH_ONLY', 'DEFAULT', 'MAIN_BUFF'])
/** Reclutamientos permanentes o rotativos: no se comparan con los banners de la wiki. */
const STANDARD_POOLS = new Set(['NORMAL', 'DOUBLE', 'CLASSIC', 'CLASSIC_DOUBLE', '11'])

const key = (s: string) => s.toLowerCase().replace(/\s*[-(]\s*rerun\)?\s*$/i, '').replace(/[^a-z0-9]/g, '')
const iso = (sec: number) => new Date(sec * 1000).toISOString()

async function get<T>(file: string): Promise<T> {
  const res = await fetch(viaProxy(`${BASE}/${file}`))
  if (!res.ok) throw new Error(`akgamedata ${file} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Corrige las horas de la wiki con las del cliente y añade lo que la wiki no lista (logins…). */
export async function withClientData(gameId: string, wiki: GameSync): Promise<GameSync> {
  const [acts, gacha, names] = await Promise.all([
    get<{ basicInfo?: Record<string, Act> }>('activity_table.json'),
    get<{ gachaPoolClient?: Pool[] }>('gacha_table.json').catch(() => ({ gachaPoolClient: [] as Pool[] })),
    get<Record<string, string>>('character_table.json').catch(() => ({} as Record<string, string>)),
  ])
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const events = wiki.events.map(e => ({ ...e }))
  const used = new Set<number>()
  const extra: GameEvent[] = []

  for (const a of Object.values(acts.basicInfo ?? {})) {
    const s = a.startTime * 1000, e = a.endTime * 1000
    if (SKIP_TYPES.has(a.type) || !a.name || !(e > s) || e < from || s > to || e - s > 150 * DAY) continue
    const k = key(a.name)
    const i = events.findIndex((w, j) => !used.has(j) && w.kind === 'event' && key(w.title) === k && Math.abs(+new Date(w.start) - s) <= 3 * DAY)
    if (i >= 0) {
      used.add(i)
      events[i] = { ...events[i], start: iso(a.startTime), end: iso(a.endTime), precision: undefined, official: true }
      continue
    }
    const rerun = a.isReplicate || /-\s*rerun$/i.test(a.name)
    extra.push({
      id: `${gameId}:event:ak:${a.id}`, gameId, kind: 'event',
      title: rerun ? `${a.name.replace(/\s*-\s*rerun$/i, '')} (Rerun)` : a.name,
      description: '⟦d.akServer⟧',
      start: iso(a.startTime), end: iso(a.endTime),
      items: [], featured: [], pulls: 0, official: true, source: 'api',
    })
  }

  // Banners de la wiki: mismo periodo (±1 día) que un reclutamiento no estándar del cliente → horas exactas.
  const pools = (gacha.gachaPoolClient ?? []).filter(p => !STANDARD_POOLS.has(p.gachaRuleType))
  for (let i = 0; i < events.length; i++) {
    const b = events[i]
    if (b.kind !== 'banner') continue
    const p = pools.find(p => Math.abs(p.openTime * 1000 - +new Date(b.start)) <= DAY && Math.abs(p.endTime * 1000 - +new Date(b.end)) <= DAY)
    if (p) events[i] = { ...b, start: iso(p.openTime), end: iso(p.endTime), precision: undefined, official: true }
  }
  // Reclutamientos estándar rotativos (la wiki dejó de registrarlos para Global en 2020): el estándar y el de Kernel, cada 2 semanas.
  for (const p of gacha.gachaPoolClient ?? []) {
    const label = p.gachaRuleType === 'DOUBLE' ? 'Standard Headhunting' : p.gachaRuleType === 'CLASSIC_DOUBLE' ? 'Kernel Headhunting' : null
    const s = p.openTime * 1000, e = p.endTime * 1000
    if (!label || !(e > s) || e < from || s > to || e - s > 60 * DAY) continue
    const m = p.dynMeta
    const featured = [
      ...[m?.main6RarityCharId, m?.sub6RarityCharId].filter((x): x is string => !!x).map(id => ({ name: names[id] ?? id, rarity: 6 })),
      ...(m?.rare5CharList ?? []).map(id => ({ name: names[id] ?? id, rarity: 5 })),
    ].filter(f => !f.name.startsWith('char_'))
    extra.push({
      id: `${gameId}:banner:ak:${p.gachaPoolId}`, gameId, kind: 'banner',
      title: featured.length ? `${label}: ${featured.slice(0, 2).map(f => f.name).join(' / ')}` : label,
      description: [p.gachaPoolName, featured.length > 2 ? featured.map(f => f.name).join(', ') : ''].filter(Boolean).join('\n'),
      start: iso(p.openTime), end: iso(p.endTime),
      items: [], featured: featured.slice(0, 3), pulls: 0, official: true, source: 'api',
    })
  }
  return { ...wiki, events: [...events, ...extra] }
}
