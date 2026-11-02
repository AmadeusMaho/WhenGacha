import type { AppState, Game } from './types'

type Def = Omit<Game, 'wiki'> & { host: string; q: string }

const def = (id: string, name: string, short: string, publisher: string, color: string, color2: string, patchCycleDays: number,
  host: string, q: string, api?: Game['api'], logo?: string, wallpaper?: string): Game =>
  ({ id, name, short, publisher, color, color2, patchCycleDays, api, logo, wallpaper, soon: !api, wiki: { host, q } } satisfies Omit<Def, 'host' | 'q'> & { wiki: Game['wiki'] })

export const CATALOG: Game[] = [
  def('genshin', 'Genshin Impact', 'GI', 'HoYoverse', '#4fc3f7', '#1a3a6b', 42, 'genshin-impact.fandom.com', 'Genshin Impact', 'genshin'),
  def('hsr', 'Honkai: Star Rail', 'HSR', 'HoYoverse', '#b388ff', '#3b1f6e', 42, 'honkai-star-rail.fandom.com', 'Honkai: Star Rail', 'starrail'),
  def('zzz', 'Zenless Zone Zero', 'ZZZ', 'HoYoverse', '#ffb74d', '#6b3a0f', 42, 'zenless-zone-zero.fandom.com', 'Zenless Zone Zero', 'zenless'),
  def('arknights', 'Arknights', 'AK', 'Hypergryph', '#90a4ae', '#2c3b44', 0, 'arknights.wiki.gg', 'Arknights', 'arknights', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/3f/73/04/3f73045c-331c-5c64-1fea-af3472329311/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/256x256bb.jpg', 'Wallpaper-Arknights.jpg'),
  def('endfield', 'Arknights: Endfield', 'EF', 'Hypergryph', '#aed581', '#355018', 42, 'endfield.wiki.gg', 'Endfield', 'endfield'),
  def('uma', 'Umamusume: Pretty Derby', 'UMA', 'Cygames', '#ff8fb8', '#7a2a52', 0, 'umamusume.fandom.com', 'Umamusume Pretty Derby', 'uma'),
  def('czn', 'Chaos Zero Nightmare', 'CZN', 'Smilegate', '#c084fc', '#3b1a5a', 0, 'chaos-zero-nightmare.fandom.com', 'Chaos Zero Nightmare', 'czn'),
  def('wuwa', 'Wuthering Waves', 'WW', 'Kuro Games', '#4dd0e1', '#0f4a52', 42, 'wutheringwaves.fandom.com', 'Wuthering Waves', 'wuwa'),
  def('nikke', 'Goddess of Victory: Nikke', 'NK', 'Shift Up', '#f06292', '#6b1f3a', 0, 'nikke-goddess-of-victory-international.fandom.com', 'Goddess of Victory: Nikke', 'nikke'),
  def('nte', 'Neverness to Everness', 'NTE', 'Hotta Studio', '#e879f9', '#5a1f66', 0, 'neverness-to-everness.fandom.com', 'Neverness to Everness', 'nte'),
  def('bluearchive', 'Blue Archive', 'BA', 'Nexon', '#64b5f6', '#1b3f78', 0, 'bluearchive.fandom.com', 'Blue Archive', 'bluearchive'),
  def('fgo', 'Fate/Grand Order', 'FGO', 'Aniplex', '#ffd54f', '#6b5410', 0, 'fategrandorder.fandom.com', 'Fate/Grand Order', 'fgo'),
  def('limbus', 'Limbus Company', 'LC', 'Project Moon', '#ef5350', '#6b1a1a', 0, 'limbuscompany.wiki.gg', 'Limbus Company', 'limbus',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a2/da/69/a2da69d5-b519-3e85-9d42-748d267afa87/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('epic7', 'Epic Seven', 'E7', 'Smilegate', '#ffb74d', '#5c3a0e', 0, 'epic-seven.fandom.com', 'Epic Seven', 'epic7',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/d5/a1/dd/d5a1dde1-7ebd-cb28-a1ae-1e6e5badd323/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('stellasora', 'Stella Sora', 'SS', 'Yostar', '#7986cb', '#252a5c', 0, '', 'Stella Sora', 'stellasora',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/43/cc/98/43cc9858-4e32-dc8a-3190-f1f5d03f4431/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('reverse1999', 'Reverse: 1999', 'R99', 'Bluepoch', '#80cbc4', '#1f4743', 0, 'reverse1999.fandom.com', 'Reverse: 1999', 'reverse1999',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1c/61/94/1c619430-4d7c-80cd-c7b4-feaec9d113ff/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/256x256bb.jpg'),
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
