import type { AppState, Game } from './types'

type Def = Omit<Game, 'wiki'> & { host: string; q: string }

const def = (id: string, name: string, short: string, publisher: string, color: string, color2: string, patchCycleDays: number,
  host: string, q: string, api?: Game['api']): Game =>
  ({ id, name, short, publisher, color, color2, patchCycleDays, api, soon: !api, wiki: { host, q } } satisfies Omit<Def, 'host' | 'q'> & { wiki: Game['wiki'] })

export const CATALOG: Game[] = [
  def('genshin', 'Genshin Impact', 'GI', 'HoYoverse', '#4fc3f7', '#1a3a6b', 42, 'genshin-impact.fandom.com', 'Genshin Impact', 'genshin'),
  def('hsr', 'Honkai: Star Rail', 'HSR', 'HoYoverse', '#b388ff', '#3b1f6e', 42, 'honkai-star-rail.fandom.com', 'Honkai: Star Rail', 'starrail'),
  def('zzz', 'Zenless Zone Zero', 'ZZZ', 'HoYoverse', '#ffb74d', '#6b3a0f', 42, 'zenless-zone-zero.fandom.com', 'Zenless Zone Zero', 'zenless'),
  def('arknights', 'Arknights', 'AK', 'Hypergryph', '#90a4ae', '#2c3b44', 0, 'arknights.wiki.gg', 'Arknights', 'arknights'),
  def('endfield', 'Arknights: Endfield', 'EF', 'Hypergryph', '#aed581', '#355018', 42, 'endfield.wiki.gg', 'Endfield', 'endfield'),
  def('uma', 'Umamusume: Pretty Derby', 'UMA', 'Cygames', '#ff8fb8', '#7a2a52', 0, 'umamusume.fandom.com', 'Umamusume Pretty Derby', 'uma'),
  def('czn', 'Chaos Zero Nightmare', 'CZN', 'Smilegate', '#c084fc', '#3b1a5a', 0, 'chaos-zero-nightmare.fandom.com', 'Chaos Zero Nightmare', 'czn'),
  // Sin fuente de datos abierta y estable todavía:
  def('wuwa', 'Wuthering Waves', 'WW', 'Kuro Games', '#4dd0e1', '#0f4a52', 42, 'wutheringwaves.fandom.com', 'Wuthering Waves'),
  def('nikke', 'Goddess of Victory: Nikke', 'NK', 'Shift Up', '#f06292', '#6b1f3a', 0, 'nikke-goddess-of-victory-international.fandom.com', 'Goddess of Victory: Nikke'),
  def('bluearchive', 'Blue Archive', 'BA', 'Nexon', '#64b5f6', '#1b3f78', 0, 'bluearchive.fandom.com', 'Blue Archive'),
  def('fgo', 'Fate/Grand Order', 'FGO', 'Aniplex', '#ffd54f', '#6b5410', 0, 'fategrandorder.fandom.com', 'Fate/Grand Order'),
]

export const initialState = (): AppState => ({
  tracked: [],
  customGames: [],
  events: [],
  patches: [],
  tasks: [],
  codes: {},
  done: {},
  synced: {},
  notify: false,
  leadHours: 24,
})
