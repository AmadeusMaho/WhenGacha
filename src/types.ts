export type Cadence = 'daily' | 'weekly' | 'once'
export type ApiKey = 'genshin' | 'starrail' | 'zenless' | 'arknights' | 'endfield' | 'uma' | 'czn' | 'wuwa' | 'nikke' | 'nte'
export type Kind = 'event' | 'banner' | 'challenge'

export interface Game {
  id: string
  name: string
  short: string
  publisher: string
  color: string
  color2: string
  /** Días entre parches; 0 = sin ciclo fijo conocido. */
  patchCycleDays: number
  /** Si existe, el juego se sincroniza automáticamente. */
  api?: ApiKey
  /** Wiki usada para buscar imágenes automáticamente. */
  wiki: { host: string; q: string }
  /** Sin fuente de datos abierta todavía. */
  soon?: boolean
}

export interface RewardItem {
  name: string
  icon?: string
  amount: number
}

export interface Featured {
  name: string
  icon?: string
  rarity?: number
  tag?: string
  /** Nombre completo (para buscar su arte en la wiki). */
  full?: string
}

/** Elemento de la línea de tiempo: evento, banner (gacha) o desafío. */
export interface GameEvent {
  id: string
  gameId: string
  kind: Kind
  title: string
  description?: string
  image?: string
  start: string
  end: string
  items: RewardItem[]
  featured: Featured[]
  /** Tiradas aproximadas que otorga. */
  pulls: number
  /** Horas estimadas (opcional, para el veredicto). */
  hours?: number
  /** Campaña menor (p. ej. recompensas de entrenamiento): se oculta por defecto. */
  minor?: boolean
  /** estimated = fecha aún no confirmada; approx = fechas reales pero con horas aproximadas. */
  precision?: 'estimated' | 'approx'
  source: 'api' | 'manual' | 'feed'
}

export interface Patch {
  id: string
  gameId: string
  version: string
  name?: string
  date: string
  /** Fin de la versión (inicio de la siguiente). */
  end?: string
  notes: string
  /** 'api' = deducida de datos oficiales; 'manual' = la añadiste tú. */
  source: 'api' | 'manual' | 'feed'
  estimated?: boolean
}

export interface Task {
  id: string
  gameId: string
  title: string
  cadence: Cadence
  doneAt?: string
}

export interface PromoCode {
  code: string
  rewards: string[]
}

export interface AppState {
  tracked: string[]
  customGames: Game[]
  events: GameEvent[]
  patches: Patch[]
  tasks: Task[]
  codes: Record<string, PromoCode[]>
  /** ids de eventos que ya completaste */
  done: Record<string, boolean>
  /** última sincronización por juego (ms) */
  synced: Record<string, number>
  notify: boolean
  /** horas antes del fin del evento para avisar */
  leadHours: number
}
