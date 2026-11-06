import type { AppState, Game } from './types'

type Def = Omit<Game, 'wiki'> & { host: string; q: string }

const def = (id: string, name: string, short: string, publisher: string, color: string, color2: string, patchCycleDays: number,
  host: string, q: string, api?: Game['api'], logo?: string, wallpaper?: string): Game =>
  ({ id, name, short, publisher, color, color2, patchCycleDays, api, logo, wallpaper, soon: !api, wiki: { host, q } } satisfies Omit<Def, 'host' | 'q'> & { wiki: Game['wiki'] })

export const CATALOG: Game[] = [
  def('genshin', 'Genshin Impact', 'GI', 'HoYoverse', '#4fc3f7', '#1a3a6b', 42, 'genshin-impact.fandom.com', 'Genshin Impact', 'genshin', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/15/9e/b1/159eb1a7-fc58-2b43-b330-c5e619a77e2d/AppIcon-0-0-1x_U007epad-0-1-85-220.png/256x256bb.jpg'),
  def('hsr', 'Honkai: Star Rail', 'HSR', 'HoYoverse', '#b388ff', '#3b1f6e', 42, 'honkai-star-rail.fandom.com', 'Honkai: Star Rail', 'starrail', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/fd/65/dc/fd65dc18-c4b6-7b64-8266-a423f3f113e0/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('zzz', 'Zenless Zone Zero', 'ZZZ', 'HoYoverse', '#ffb74d', '#6b3a0f', 42, 'zenless-zone-zero.fandom.com', 'Zenless Zone Zero', 'zenless', 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/c8/ee/27/c8ee2769-fe15-e1ea-aeb7-2247a535767a/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('arknights', 'Arknights', 'AK', 'Hypergryph', '#90a4ae', '#2c3b44', 0, 'arknights.wiki.gg', 'Arknights', 'arknights', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/3f/73/04/3f73045c-331c-5c64-1fea-af3472329311/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/256x256bb.jpg', 'Wallpaper-Arknights.jpg'),
  def('endfield', 'Arknights: Endfield', 'EF', 'Hypergryph', '#aed581', '#355018', 42, 'endfield.wiki.gg', 'Endfield', 'endfield', 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/5e/a4/53/5ea453a8-f819-f42e-aae4-28f21b8c7166/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('uma', 'Umamusume: Pretty Derby', 'UMA', 'Cygames', '#ff8fb8', '#7a2a52', 0, 'umamusume.fandom.com', 'Umamusume Pretty Derby', 'uma', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/6f/34/5e/6f345e3d-0ed8-96bb-510f-bc96163537b7/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('czn', 'Chaos Zero Nightmare', 'CZN', 'Smilegate', '#c084fc', '#3b1a5a', 0, 'chaos-zero-nightmare.fandom.com', 'Chaos Zero Nightmare', 'czn', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/68/c8/8b/68c88b02-fc6a-0340-a219-11205cdad9dd/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/256x256bb.jpg'),
  def('wuwa', 'Wuthering Waves', 'WW', 'Kuro Games', '#4dd0e1', '#0f4a52', 42, 'wutheringwaves.fandom.com', 'Wuthering Waves', 'wuwa', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/cd/8a/a7/cd8aa70c-a4e4-e303-37e3-5d7e735f0834/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('nikke', 'Goddess of Victory: Nikke', 'NK', 'Shift Up', '#f06292', '#6b1f3a', 0, 'nikke-goddess-of-victory-international.fandom.com', 'Goddess of Victory: Nikke', 'nikke', 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/f3/76/62/f376627d-7f96-b269-c635-34ddb704ec48/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('nte', 'Neverness to Everness', 'NTE', 'Hotta Studio', '#e879f9', '#5a1f66', 0, 'neverness-to-everness.fandom.com', 'Neverness to Everness', 'nte', 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1a/c8/10/1ac810d0-d997-13f8-0f0e-adb3a9d961c8/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('bluearchive', 'Blue Archive', 'BA', 'Nexon', '#64b5f6', '#1b3f78', 0, 'bluearchive.fandom.com', 'Blue Archive', 'bluearchive', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/41/94/4a/41944af3-4f15-7599-0cdf-12ae5a303af1/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('fgo', 'Fate/Grand Order', 'FGO', 'Aniplex', '#ffd54f', '#6b5410', 0, 'fategrandorder.fandom.com', 'Fate/Grand Order', 'fgo', 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ea/6d/d5/ea6dd513-7d32-a13e-a82d-b626c326cb9d/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
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
