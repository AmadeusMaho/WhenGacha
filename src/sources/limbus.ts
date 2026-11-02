import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Limbus Company desde los datos públicos de Eldritch Tools (limbus.eldritchtools.com/timers):
 * `timers.json` con los eventos y banners actuales y próximos, e `identities_mini.json` para los nombres
 * de las identidades de cada banner. No es una API documentada; el formato puede cambiar sin aviso.
 * Las fechas son de calendario (hora de Corea) y el juego cambia a las 10:00 KST = 01:00 UTC.
 */
const DATA = 'https://limbus-assets.eldritchtools.com/data'
const ASSETS = 'https://limbus-assets.eldritchtools.com/assets/banners'
const DAY = 86_400_000
/** Días que se extiende la barra de un contenido sin fecha de fin, contados desde hoy. */
const OPEN_DAYS = 45

interface Timer { name: string; src?: string; startDate?: string; endDate?: string; catenc?: string; bannerConds?: { ids?: string[]; sinnerId?: number } }
interface Timers {
  events?: { main?: Timer | null; others?: Timer[] }
  banners?: { main?: Timer | null; others?: Timer[] }
}
type Identities = Record<string, { name: string; rank: number }>

/** "2026-10-29" -> 01:00 UTC de ese día; las fechas sin definir ("????-??-??", "Permanent") se descartan. */
function day(s?: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '')
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 1) : NaN
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(viaProxy(`${DATA}/${file}.json`))
  if (!res.ok) throw new Error(`limbus ${file} → HTTP ${res.status}`)
  return res.json()
}

export async function syncLimbus(gameId: string): Promise<GameSync> {
  const [timers, identities] = await Promise.all([
    getJson<Timers>('timers'),
    getJson<Identities>('identities_mini').catch((): Identities => ({})),
  ])
  const events: GameEvent[] = []
  const from = Date.now() - 3 * DAY

  const add = (t: Timer | null | undefined, kind: 'event' | 'banner') => {
    if (!t?.name) return
    const s = day(t.startDate)
    let e = day(t.endDate)
    // Sin fecha de fin ("Permanent" o "????-??-??"): se muestra desde su inicio con una barra estimada.
    const open = isNaN(e) && !isNaN(s) && !!t.endDate
    if (open) e = Math.max(s + 30 * DAY, Date.now() + OPEN_DAYS * DAY)
    if (isNaN(s) || isNaN(e) || e <= s || e < from || (open && s > Date.now() + 120 * DAY)) return
    const featured: Featured[] = (t.bannerConds?.ids ?? []).map(id => identities[id]).filter(Boolean)
      .slice(0, 3).map(i => ({ name: i.name, rarity: i.rank }))
    events.push({
      id: `${gameId}:${kind}:${t.src ?? t.name}:${s}`,
      gameId,
      // Reflectrial y Refraction Railway son contenido con tabla de clasificación, no eventos puntuales.
      kind: kind === 'event' && t.catenc ? 'challenge' : kind,
      title: t.name.replace(/\s*\n\s*/g, ' '),
      description: open ? (/permanent/i.test(t.endDate!) ? '⟦d.permanent⟧' : '⟦d.noEnd⟧') : undefined,
      image: t.src ? `${ASSETS}/${t.src}.webp` : undefined,
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      items: [],
      featured,
      pulls: 0,
      precision: open ? 'estimated' : undefined,
      source: 'api',
    })
  }

  add(timers.events?.main, 'event')
  timers.events?.others?.forEach(t => add(t, 'event'))
  add(timers.banners?.main, 'banner')
  timers.banners?.others?.forEach(t => add(t, 'banner'))
  return { events, patches: [], codes: [] }
}
