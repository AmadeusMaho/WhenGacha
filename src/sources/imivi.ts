import { viaProxy } from '../net'
import type { GameEvent, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * Arknights · calendario de recursos de la "Arknights Pulls Calculator" de imivi (imivi.github.io/arknights-pulls-calculator; código MIT,
 * github.com/imivi/arknights-pulls-calculator). Sus datos salen de una hoja de Google que su autor mantiene y van incrustados en el JS de la web:
 *  - eventos (`{event_id:[…],title:[…],event_ops:[…],is_limited:[…],is_rerun:[…],first_day:[…],duration_days:[…],date_confirmed:[…]…}`),
 *    también los de Global aún sin fecha, proyectados desde CN ("Date TBD" en la web, `date_confirmed: 0`);
 *  - qué evento corre cada día (`{day:[…],event_id:[…],day_of_event:[…]}`);
 *  - lo que se gana cada día (`JSON.parse('{"amount":[…],"day":[…],"resource":[…],"source":[…]}')`): recurso 1 = Orundum, 2 = Headhunting Permit,
 *    3 = Originite Prime, 4 = Distinction Certificate; fuente = misiones, Annihilation, tienda, pase mensual… o lo propio del evento.
 * Se usan solo las fuentes de cada evento (`EVENT_SOURCES`): las diarias, semanales, Annihilation y la tienda ya las cuenta el planificador
 * (pullPlan.ts) y el pase mensual es de pago. Con ellas:
 *  1. un evento de nuestras fuentes sin recompensas que empieza el mismo día (±2) que uno de imivi toma las de imivi;
 *  2. los eventos de imivi que aún no tenemos y empiezan en el futuro se añaden "estimados", con su banner si trae operadores.
 * Los nombres de las variables cambian en cada compilación de su web: las tablas se buscan por su contenido. 2 peticiones (HTML y JS, caché 12 h).
 */
const BASE = 'https://imivi.github.io/arknights-pulls-calculator/'
const DAY = 86_400_000
/** Fuentes propias de un evento (las demás son ingresos fijos que pullPlan.ts ya suma). */
const EVENT_SOURCES = new Set(['event_stages', 'event_shop', 'login', 'tokens', 'intel', 'fortune_strip', 'new_anni', 'free_monthly_card'])
const RESOURCE: Record<number, string> = { 1: 'Orundum', 2: 'Headhunting Permit', 3: 'Originite Prime', 4: 'Distinction Certificate' }
/** Iconos de arknights.wiki.gg (`{{I|…}}` → "<Nombre>.png" en /images/). */
const icon = (name: string) => `https://arknights.wiki.gg/images/${name.replace(/ /g, '_')}.png`

type Table = Record<string, (string | number)[]>

/** Objeto literal `{clave:[…],…}` (solo listas de números y cadenas) que empieza con `head` → tabla. */
function literal(js: string, head: string): Table | undefined {
  const at = js.indexOf(head)
  if (at < 0) return undefined
  const end = js.indexOf(']}', at)
  if (end < 0) return undefined
  const src = js.slice(at, end + 2).replace(/([{,])([a-z_]+):\[/g, '$1"$2":[').replace(/!0/g, '1').replace(/!1/g, '0')
  try { return JSON.parse(src) as Table } catch { return undefined }
}

/** `JSON.parse('{"amount":…}')` → tabla. */
function parsed(js: string): Table | undefined {
  const at = js.indexOf(`JSON.parse('{"amount":`)
  if (at < 0) return undefined
  const from = at + `JSON.parse('`.length
  const end = js.indexOf(`')`, from)
  try { return JSON.parse(js.slice(from, end).replace(/\\'/g, "'")) as Table } catch { return undefined }
}

export interface ImiviEvent {
  id: string
  title: string
  ops: string[]
  limited: boolean
  rerun: boolean
  confirmed: boolean
  start: number
  days: number
  items: RewardItem[]
}

/** Eventos de la calculadora con lo que dan (sumado por recurso). */
export async function imiviEvents(): Promise<ImiviEvent[]> {
  const html = await fetch(viaProxy(BASE)).then(r => (r.ok ? r.text() : ''))
  const script = /src="([^"]*assets\/index-[\w-]+\.js)"/.exec(html)?.[1]
  if (!script) throw new Error('imivi: sin script en la página')
  const js = await fetch(viaProxy(new URL(script, BASE).href)).then(r => (r.ok ? r.text() : ''))
  const ev = literal(js, '{event_id:[')
  // Hay dos tablas que empiezan por `{day:[`: la de días (day, weekday) y la de días por evento (day, event_id, day_of_event).
  let map: Table | undefined
  for (let i = js.indexOf('{day:["'); i >= 0 && !map?.event_id; i = js.indexOf('{day:["', i + 1)) map = literal(js.slice(i), '{day:["')
  const res = parsed(js)
  if (!ev?.event_id || !map || !res?.amount) throw new Error('imivi: no se encontraron las tablas')
  const eventOf = new Map<string, string>()
  map.day.forEach((d, i) => eventOf.set(String(d), String(map.event_id[i])))
  const sums = new Map<string, Map<string, number>>()
  res.amount.forEach((a, i) => {
    if (!EVENT_SOURCES.has(String(res.source[i]))) return
    const id = eventOf.get(String(res.day[i]))
    const name = RESOURCE[Number(res.resource[i])]
    if (!id || !name) return
    const m = sums.get(id) ?? new Map<string, number>()
    m.set(name, (m.get(name) ?? 0) + Number(a))
    sums.set(id, m)
  })
  return ev.event_id.map((id, i) => ({
    id: String(id),
    title: String(ev.title[i]),
    ops: String(ev.event_ops?.[i] ?? '').split(',').map(s => s.trim().replace(/_/g, ' ')).filter(Boolean),
    limited: !!Number(ev.is_limited?.[i]),
    rerun: !!Number(ev.is_rerun?.[i]),
    confirmed: !!Number(ev.date_confirmed?.[i]),
    // Hora habitual de inicio de los eventos de Global (17:00 UTC, la de nuestras fuentes para los reestrenos); el día es lo que da imivi.
    start: Date.parse(`${ev.first_day[i]}T17:00:00Z`),
    days: Number(ev.duration_days[i]) || 14,
    items: [...(sums.get(String(id)) ?? new Map()).entries()].map(([name, amount]) => ({ name, amount, icon: icon(name) })),
  })).filter(e => !Number.isNaN(e.start))
}

/** Como en wiki.ts: el Originite Prime cuenta como 180 Orundum. Los Distinction Certificates no (se cambian por permisos a ritmo variable). */
const pullsOf = (items: RewardItem[]) => {
  const op = items.find(i => i.name === 'Originite Prime')?.amount ?? 0
  return pullsIn('arknights', [...items.filter(i => i.name !== 'Originite Prime').map(i => `${i.name} x${i.amount}`), ...(op ? [`Orundum x${op * 180}`] : [])]).pulls
}

/** Une los eventos de imivi a los de nuestras fuentes (ver arriba). Si imivi falla, devuelve `s` tal cual. */
export async function withImivi(s: GameSync, gameId: string, now = Date.now()): Promise<GameSync> {
  const list = await imiviEvents().catch(err => { console.warn('[arknights] imivi:', (err as Error)?.message ?? err); return [] as ImiviEvent[] })
  if (!list.length) return s
  const ours = s.events.filter(e => e.kind === 'event' && !e.minor)
  const sameStart = (x: ImiviEvent) => ours.find(e => Math.abs(Date.parse(e.start) - x.start) <= 2 * DAY && Date.parse(e.end) - Date.parse(e.start) >= 7 * DAY)
  const filled = new Map<string, RewardItem[]>()
  const extra: GameEvent[] = []
  for (const x of list) {
    const end = x.start + x.days * DAY - 6 * 3_600_000 - 1000
    if (end < now) continue
    const match = sameStart(x)
    if (match) {
      if (!match.items.length && x.items.length) filled.set(match.id, x.items)
      continue
    }
    if (x.start <= now) continue
    const day = new Date(x.start).toISOString().slice(0, 10)
    extra.push({
      id: `${gameId}:event:imivi:${x.id}:${day}`, gameId, kind: 'event', title: x.rerun ? `${x.title.replace(/\s*Rerun$/i, '')} (Rerun)` : x.title,
      description: x.rerun ? '⟦d.rerun⟧' : undefined, start: new Date(x.start).toISOString(), end: new Date(end).toISOString(),
      items: x.items, featured: [], pulls: pullsOf(x.items), source: 'api', precision: x.confirmed ? 'approx' : 'estimated',
    })
    if (x.ops.length && !x.rerun) extra.push({
      id: `${gameId}:banner:imivi:${x.id}:${day}`, gameId, kind: 'banner', title: x.ops.join(' / '),
      start: new Date(x.start).toISOString(), end: new Date(end).toISOString(),
      items: [], featured: x.ops.map(name => ({ name })), pulls: 0, source: 'api', precision: x.confirmed ? 'approx' : 'estimated',
    })
  }
  const events = s.events.map(e => {
    const items = filled.get(e.id)
    return items ? { ...e, items, pulls: pullsOf(items) } : e
  })
  return { ...s, events: [...events, ...extra] }
}
