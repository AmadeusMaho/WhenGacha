export type ApiKey = 'genshin' | 'starrail' | 'zenless' | 'arknights' | 'endfield' | 'uma' | 'czn' | 'wuwa' | 'nikke' | 'nte' | 'fgo' | 'bluearchive' | 'limbus' | 'reverse1999' | 'epic7' | 'stellasora' | 'pgr' | 'honkai3' | 'azurlane' | 'bd2' | 'afkjourney' | 'infinitynikki'
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
  /** URL del icono oficial de la app del juego; se usa como avatar en lugar de una imagen de la wiki. */
  logo?: string
  /** Arte oficial del juego (captura promocional de su ficha en la App Store): portada cuando la wiki no da un arte de verdad. */
  art?: string
  /** Archivo de la wiki con el arte oficial del juego, usado como fondo en vez de la búsqueda automática. */
  wallpaper?: string
  /** Wiki usada para buscar imágenes automáticamente (host vacío = sin wiki utilizable). */
  wiki: { host: string; q: string }
  /** Sin fuente de datos abierta todavía. */
  soon?: boolean
  /** En construcción: tiene fuente, pero mientras no traiga eventos vigentes el catálogo lo muestra desactivado ("En construcción"). */
  wip?: boolean
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
  /** Sin fecha de fin anunciada: `end` es solo un valor de apoyo para dibujar la barra y nunca se muestra. */
  open?: boolean
  /** estimated = fecha aún no confirmada; approx = fechas reales pero con horas aproximadas. */
  precision?: 'estimated' | 'approx'
  /** Sale de un aviso oficial del juego (Kuro, STOVE…): sus horas mandan sobre las de cualquier agregador (gachafocus incluido). */
  official?: boolean
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

export interface PromoCode {
  code: string
  rewards: string[]
}

/** Ajustes de un juego en la pestaña "Tiradas" (pullPlan.ts). La moneda va en la unidad del juego (Astrite, Primogems…). */
export interface PlanCfg {
  /** Moneda premium que tienes ahora. */
  cur: number
  /** Billetes de tirada que tienes ahora (cada uno = 1). */
  tickets: number
  /** Moneda por día de las misiones diarias. */
  daily: number
  /** Pase mensual activo, y cuánto da al día. */
  pass: boolean
  passDaily: number
  /** Moneda extra por semana (modos de fin de semana, tienda semanal…). */
  weekly: number
  /** Moneda que cuesta una tirada. */
  per: number
  /** Meta de tiradas (el pity del juego, por defecto). 0 = sin meta. */
  goal: number
  /** Banner objetivo (id) o 'date' para una fecha propia; vacío = el próximo. */
  target?: string
  /** Fecha propia (YYYY-MM-DD), si `target` es 'date'. */
  date?: string
  /** Contar hasta que empieza el banner o hasta que termina. */
  at: 'start' | 'end'
  /** Sumar las tiradas de los eventos pendientes. */
  events: boolean
  /** Contar los modos de dificultad (Abismo, Shiyu, Torre…) al máximo. */
  endgame: boolean
  /** Puesto elegido en los modos que pagan según tu rango (pullPlan.ts, `choices`): id → índice de la opción (0 = no participo). */
  ranks?: Record<string, number>
}

export interface AppState {
  tracked: string[]
  customGames: Game[]
  events: GameEvent[]
  patches: Patch[]
  codes: Record<string, PromoCode[]>
  /** ids de eventos que ya completaste */
  done: Record<string, boolean>
  /** códigos que ya copiaste ("<juego>:<CÓDIGO>") */
  copied: Record<string, boolean>
  /** cuándo apareció cada código por primera vez ("<juego>:<CÓDIGO>" → ms; 0 = ya estaba al empezar a seguir el juego) */
  codeSeen: Record<string, number>
  /** última sincronización por juego (ms) */
  synced: Record<string, number>
  notify: boolean
  /** horas antes del fin del evento para avisar */
  leadHours: number
  /** Pestaña "Tiradas": ajustes por juego (id → solo lo que cambiaste; el resto sale de pullPlan.ts). */
  planner: Record<string, Partial<PlanCfg>>
}
