import { t } from './i18n'
import type { GameEvent, Task } from './types'

const DAY = 86_400_000
const HOUR = 3_600_000

export const uid = () => Math.random().toString(36).slice(2, 10)

export function countdown(ms: number): string {
  if (ms <= 0) return t('time.ended')
  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / HOUR)
  const m = Math.floor((ms % HOUR) / 60_000)
  const [ud, uh, um] = [t('unit.d'), t('unit.h'), t('unit.m')]
  return d > 0 ? `${d}${ud} ${h}${uh}` : h > 0 ? `${h}${uh} ${m}${um}` : `${m}${um}`
}

export type Status = 'upcoming' | 'active' | 'ended'

export function eventStatus(e: GameEvent, now: number): Status {
  if (now < +new Date(e.start)) return 'upcoming'
  if (now > +new Date(e.end)) return 'ended'
  return 'active'
}

export type Tone = 'great' | 'good' | 'mid' | 'bad' | 'off'

export function verdict(e: GameEvent, now: number): { label: string; tone: Tone } {
  if (eventStatus(e, now) === 'ended') return { label: t('v.ended'), tone: 'off' }
  if (e.kind === 'banner') return { label: t('v.banner'), tone: 'mid' }
  const p = e.pulls
  if (e.hours) {
    const rate = p / Math.max(e.hours, 0.25)
    if (rate >= 6) return { label: t('v.worth'), tone: 'good' }
    if (rate >= 2) return { label: t('v.optional'), tone: 'mid' }
    return { label: p ? t('v.poor') : t('v.noPulls'), tone: 'bad' }
  }
  if (p >= 10) return { label: t('v.must'), tone: 'great' }
  if (p >= 3) return { label: t('v.worth'), tone: 'good' }
  if (p > 0) return { label: t('v.optional'), tone: 'mid' }
  return { label: e.kind === 'challenge' ? t('v.challenge') : t('v.noPulls'), tone: 'off' }
}

function startOfWeek(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return +x
}

export function isTaskDone(task: Task, now: number): boolean {
  if (!task.doneAt) return false
  const done = new Date(task.doneAt)
  const n = new Date(now)
  if (task.cadence === 'once') return true
  if (task.cadence === 'daily') return done.toDateString() === n.toDateString()
  return startOfWeek(done) === startOfWeek(n)
}

/** Reparte los elementos en filas para que no se solapen en la línea de tiempo. */
export function packRows(items: GameEvent[]): { item: GameEvent; row: number }[] {
  const sorted = [...items].sort((a, b) => +new Date(a.start) - +new Date(b.start))
  const rowEnds: number[] = []
  return sorted.map(item => {
    const s = +new Date(item.start)
    let row = rowEnds.findIndex(end => end <= s)
    if (row === -1) { row = rowEnds.length; rowEnds.push(0) }
    rowEnds[row] = +new Date(item.end)
    return { item, row }
  })
}

/** Nombre del tipo (singular) en el idioma actual. */
export const KIND_LABEL = {
  get event() { return t('kind1.event') },
  get banner() { return t('kind1.banner') },
  get challenge() { return t('kind1.challenge') },
} as Record<GameEvent['kind'], string>
