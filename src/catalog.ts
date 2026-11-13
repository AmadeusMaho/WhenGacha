import type { AppState, Game } from './types'

type Def = Omit<Game, 'wiki'> & { host: string; q: string }

/**
 * Arte oficial de cada juego: la primera captura promocional de su ficha en la App Store (API pública de iTunes, 6 nov 2026; el mismo CDN de Apple que los iconos).
 * Es la portada de "Mis gachas" y el fondo cuando la wiki no da un arte de verdad (en NIKKE daba su logo, "Site-logo.png"). El arte del parche, si lo hay, manda.
 */
const ART: Record<string, string> = {
  genshin: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/8e/55/72/8e557205-b1b4-5862-07a8-ee6c2108d4db/EN-1.jpg/1280x1280bb.jpg',
  hsr: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/61/61/96/616196cd-2cf5-19bd-120b-2bbeec236934/EN-2688_U00d71242-0-4.6KV.jpg/1280x1280bb.jpg',
  zzz: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/3d/92/dc/3d92dca8-5c01-b088-0f22-b7d9c1611aa0/EN-2688-KV.jpg/1280x1280bb.jpg',
  arknights: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/1e/a7/c3/1ea7c3d9-ec9d-5340-cf82-45d5db6c4913/2208-x-1242-1.jpg/1280x1280bb.jpg',
  endfield: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/5b/60/7a/5b607af4-ce8e-a6d6-c696-5a1798ab6171/1-EN.jpg/1280x1280bb.jpg',
  uma: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/3c/07/d9/3c07d9d8-db6c-0ce4-58a0-3f7dc140cdbf/img_55_1.jpg/1280x1280bb.jpg',
  czn: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/ef/ec/2f/efec2ff5-3995-3140-2934-6d597d5f41ff/1_Uc8fc_Ub144__Ud3ec_Uc2a4_Ud130_2556x1179_EN.jpg/1280x1280bb.jpg',
  wuwa: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/39/f8/7a/39f87a03-3782-8f7a-c16a-ad46934d7834/_U82f1_U6587.jpg/1280x1280bb.jpg',
  nikke: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/80/ac/cd/80accdc5-3346-fad7-e931-7acffef7bb68/EN-1206_U22602622.jpg/1280x1280bb.jpg',
  nte: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/74/97/47/7497470d-9893-7c94-1dcd-30ddaf642f16/2208x1242-01.jpg/1280x1280bb.jpg',
  bluearchive: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/ea/92/af/ea92af08-00d5-9c6b-7200-57e010220126/BA__Ub9c8_Ucf13_Uc2a4_Ud06c_Ub9b0_Uc0f701_EN_2208x1242.png/1280x1280bb.jpg',
  fgo: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/b6/dc/aa/b6dcaac0-2c9c-3a9c-c9b5-7f83d30d25a0/Title_iPhone5.5in_nonlabel.png.png/1280x1280bb.jpg',
  limbus: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/7a/8f/f6/7a8ff643-1823-98be-4acd-ff05550ce773/bf4a04d3-aa23-48da-8f74-a1bdce18ab41_EN_2208x1242_px_01.png/1280x1280bb.jpg',
  epic7: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/5f/97/6c/5f976c96-8a73-aa99-b1fa-d7b6ccd4aa05/iOS_EP_2208x1242_EN2.jpg/1280x1280bb.jpg',
  stellasora: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/87/09/6a/87096a4c-18d7-2c82-fc90-3697ef16bf09/_U7248_U672cKV.jpg/1280x1280bb.jpg',
  reverse1999: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/d5/1e/fd/d51efdc0-0d48-66b8-b7df-142c008c2238/1.2868x1320.jpg/1280x1280bb.jpg',
  pgr: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/d0/08/45/d00845a7-d0b0-f0b4-0052-bb8eef86b995/KV1.jpg/1280x1280bb.jpg',
  honkai3: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/a3/a4/90/a3a4909d-781f-dfb9-573b-7cf3d11601ba/EN-2208x1242-1.jpg/1280x1280bb.jpg',
  infinitynikki: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/64/97/17/6497173f-1a90-2150-0bd5-b9f02b3fee6e/2688x1242_Uff08iPhone_U7aef_Uff09.png/1280x1280bb.jpg',
  afkjourney: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/29/ff/d3/29ffd3cb-74af-7408-abf5-2938160186b7/EN_iOS__U6a2a_2688x1242.jpg/1280x1280bb.jpg',
  bd2: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/87/88/56/87885688-e7ce-96f5-af56-f678d5da8b65/250909_BD2__Uc2a4_Ud06c_Ub9b0_Uc0f701_EN_2208x1242.jpg/1280x1280bb.jpg',
  // DNA: sus capturas de la App Store son verticales; key visual oficial horizontal (3840×2160) de su Fandom, "Version CBT1 Full Wallpaper 1".
  dna: 'https://static.wikia.nocookie.net/duetnightabyss/images/9/96/Version_CBT1_Full_Wallpaper_1.jpg/revision/latest/scale-to-width-down/1280',
  // Trickcal: la captura principal de la App Store ("主图", 2868×1320, horizontal).
  trickcal: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/7c/ed/42/7ced4226-f461-0b48-2e65-4eac9cad37da/_U4e3b_U56fe2868-1320-EN.jpg/1280x1280bb.jpg',
  // GFL2, MHO y Bleach (12 nov 2026): primera captura de la App Store (2778×1284, horizontal).
  gfl2: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/2e/99/76/2e99765a-2026-3376-86b1-61104ddf414d/01_U9996_U56fe-ios2778x1284.jpg/1280x1280bb.jpg',
  mho: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/21/e2/80/21e28030-9552-d59e-b2ed-f263a2f46af1/_U5356_U70b9_U56fe-_U4e3bKV-2778x1284-_U82f1_U6587.jpg/1280x1280bb.jpg',
  bleach: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/48/48/0d/48480dda-ba1c-c1f6-3994-16c5d83dcdf5/2778-1284-1.jpg/1280x1280bb.jpg',
  // Onmyoji, Path to Nowhere, Sword of Convallaria y Mongil (13 nov 2026): primera captura de la App Store (horizontal).
  onmyoji: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/b3/96/57/b396579a-d564-7809-8515-ea20d4782ff6/1_U56fe2688x1242.jpg/1280x1280bb.jpg',
  ptn: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/70/12/5a/70125a2c-ba9f-eb90-7fdf-836943e6e21d/a875fcb0-4b3d-44f5-8134-07fae21e2e33_2-_U6a2a_U677f2208x1242.jpg/1280x1280bb.jpg',
  soc: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/21/68/e8/2168e8de-386c-ca73-5793-2c5b8a10d84f/35-_U843d_U7248-_U82f9_U679c-2868x1230.jpg/1280x1280bb.jpg',
  mongil: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/bb/6c/a7/bb6ca74c-24c9-b87f-e4e6-0d47558723be/260901__Ubaac_Uae38_00__Ud0a4_Uc544_Ud2b8_2796x1290_EN.jpg/1280x1280bb.jpg',
  // Suikoden STAR LEAP (13 nov 2026): la ilustración principal de su web oficial (konami.com, "mainv_pc"), sin texto. Sus capturas de la
  // App Store son pantallas de juego con interfaz y como portada se veían raras.
  suikoden: 'https://img.konami.com/games/suikoden/star_leap/s/images/mainv_pc.jpg',
  azurlane: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/c8/35/66/c83566fd-b5ec-310d-8879-45b2db6e286f/111.jpg/1280x1280bb.jpg',
}

const def = (id: string, name: string, short: string, publisher: string, color: string, color2: string, patchCycleDays: number,
  host: string, q: string, api?: Game['api'], logo?: string, wallpaper?: string): Game =>
  ({ id, name, short, publisher, color, color2, patchCycleDays, api, logo, wallpaper, art: ART[id], soon: !api, wiki: { host, q } } satisfies Omit<Def, 'host' | 'q'> & { wiki: Game['wiki'] })

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
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a2/da/69/a2da69d5-b519-3e85-9d42-748d267afa87/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg',
    // Sus capturas de la App Store son todas de interfaz: de fondo, el banner oficial del 3.er aniversario (wiki.gg).
    'Limbus Company 3rd Anniversary Banner.png'),
  def('epic7', 'Epic Seven', 'E7', 'Smilegate', '#ffb74d', '#5c3a0e', 0, 'epic-seven.fandom.com', 'Epic Seven', 'epic7',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/d5/a1/dd/d5a1dde1-7ebd-cb28-a1ae-1e6e5badd323/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('stellasora', 'Stella Sora', 'SS', 'Yostar', '#7986cb', '#252a5c', 0, '', 'Stella Sora', 'stellasora',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/43/cc/98/43cc9858-4e32-dc8a-3190-f1f5d03f4431/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  def('reverse1999', 'Reverse: 1999', 'R99', 'Bluepoch', '#80cbc4', '#1f4743', 0, 'reverse1999.fandom.com', 'Reverse: 1999', 'reverse1999',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1c/61/94/1c619430-4d7c-80cd-c7b4-feaec9d113ff/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/256x256bb.jpg'),
  def('pgr', 'Punishing: Gray Raven', 'PGR', 'Kuro Games', '#e57373', '#5c1f24', 42, 'punishing-gray-raven.fandom.com', 'Punishing: Gray Raven', 'pgr',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f2/db/86/f2db8629-a697-d3a8-345c-16e1cc9c6f89/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/256x256bb.jpg'),
  def('honkai3', 'Honkai Impact 3rd', 'HI3', 'HoYoverse', '#f48fb1', '#5e2340', 0, 'honkaiimpact3.fandom.com', 'Honkai Impact 3rd', 'honkai3',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/20/4b/e7/204be75d-5108-d55b-eac2-3dac080e7f3e/AppIcon-1x_U007emarketing-0-10-0-85-220-0.png/256x256bb.jpg'),
  // BrownDust2: avisos oficiales de browndust2.com (src/sources/bd2.ts). Actualiza cada 2 semanas (miércoles).
  def('bd2', 'BrownDust2', 'BD2', 'Neowiz', '#d4a373', '#4a2c17', 14, '', 'BrownDust2', 'bd2',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/11/b3/f8/11b3f84d-1f7e-67a7-7b85-916916f5743d/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  // Azur Lane: avisos de mantenimiento de su web oficial (src/sources/azurlane.ts) + tuits oficiales por Discord. Su wiki pone una barrera anti-bots.
  // AFK Journey: su wiki de Fandom (src/sources/afkjourney.ts). Sin códigos: la wiki no mantiene una lista fiable.
  def('afkjourney', 'AFK Journey', 'AFKJ', 'Farlight', '#e9c46a', '#3d3215', 0, 'afk-journey.fandom.com', 'AFK Journey', 'afkjourney',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/21/90/d2/2190d26d-73b6-74eb-9986-0eec5d7371bd/AppIcon-Global-1x_U007emarketing-0-8-0-85-220-0.png/256x256bb.jpg'),
  // Infinity Nikki: wiki de Fandom + anuncios oficiales por Discord (src/sources/infinitynikki.ts).
  def('infinitynikki', 'Infinity Nikki', 'IN', 'Infold Games', '#f8a5c2', '#5e2a44', 0, 'infinity-nikki.fandom.com', 'Infinity Nikki', 'infinitynikki',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/9f/db/73/9fdb7374-823a-a5e8-a9fd-2bd7cee2dd34/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  // Duet Night Abyss: Game8 (eventos, banners Myriad, códigos) + anuncios oficiales por Discord (src/sources/dna.ts). Wiki de Fandom solo para iconos.
  def('dna', 'Duet Night Abyss', 'DNA', 'Pan Studio', '#9fa8da', '#232a4d', 42, 'duetnightabyss.fandom.com', 'Duet Night Abyss', 'dna',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/3e/81/2f/3e812f32-2d87-8a2e-813e-d43b4e5bf1b4/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg', 'Version CBT1 Full Wallpaper 1.jpg'),
  // Trickcal: Chibi Go: banners y códigos de lootandwaifus + tuits oficiales de @trickcal_en por Discord (eventos y horas exactas; src/sources/trickcal.ts).
  def('trickcal', 'Trickcal: Chibi Go', 'TC', 'Epid Games', '#ffcc80', '#5a3a1a', 0, '', 'Trickcal: Chibi Go', 'trickcal',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c4/dc/00/c4dc00ed-ef86-686b-0446-bbd6da0239b9/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  // Girls' Frontline 2: Exilium: IOP Wiki (eventos con hora exacta y recompensas, banners; también para retratos e iconos). Códigos por Discord (src/sources/gfl2.ts).
  def('gfl2', "Girls' Frontline 2: Exilium", 'GFL2', 'Sunborn', '#ffca28', '#3d3214', 0, 'iopwiki.com', "Girls' Frontline 2", 'gfl2',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e2/e9/42/e2e942a6-474b-de24-3e8c-87e6f9d10525/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/256x256bb.jpg'),
  // Monster Hunter Outlanders: GameWith (eventos, banners, temporada, códigos) + códigos de Game8 (src/sources/mho.ts).
  def('mho', 'Monster Hunter Outlanders', 'MHO', 'Capcom · TiMi', '#9ccc65', '#2c3d17', 0, '', 'Monster Hunter Outlanders', 'mho',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/00/73/e0/0073e0c8-a9e4-1956-8966-f83a136ee71e/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  // Onmyoji: "Events/Global" de su wiki de Fandom (src/sources/onmyoji.ts). Sin códigos ni recompensas (sin fuente).
  def('onmyoji', 'Onmyoji', 'ONM', 'NetEase', '#e57373', '#3d1214', 0, 'onmyoji.fandom.com', 'Onmyoji', 'onmyoji',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/43/0c/51/430c51e8-47b8-7fe1-97cb-efe0b895c33a/AppIcon-1x_U007emarketing-0-7-0-85-220.png/256x256bb.jpg'),
  // Path to Nowhere: portada de su wiki.gg (eventos, arrestos, Sinners nuevos) + códigos de PocketGamer (src/sources/ptn.ts).
  def('ptn', 'Path to Nowhere', 'PtN', 'Aisno Games', '#ef9a9a', '#3a1518', 0, 'pathtonowhere.wiki.gg', 'Path to Nowhere', 'ptn',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/7b/fa/92/7bfa928f-7101-b5f3-812d-94c66bf4741c/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  // Sword of Convallaria: GameWith + avisos oficiales de XD + códigos de PocketGamer (src/sources/soc.ts). Su wiki.gg apenas tiene contenido.
  def('soc', 'Sword of Convallaria', 'SoC', 'XD', '#d4b26a', '#30260f', 0, 'swordofconvallaria.wiki.gg', 'Sword of Convallaria', 'soc',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1d/d3/47/1dd34725-b946-1b9c-15ef-8b2600bf82ff/AppIcon-1x_U007emarketing-0-11-0-85-220-0.png/256x256bb.jpg'),
  // MONGIL: STAR DIVE: banners de Prydwen + códigos de PocketGamer; eventos por Discord (src/sources/mongil.ts). Wiki.gg para los retratos.
  def('mongil', 'MONGIL: STAR DIVE', 'MSD', 'Netmarble', '#80deea', '#143840', 0, 'mongil.wiki.gg', 'MONGIL: STAR DIVE', 'mongil',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/5f/7f/cd/5f7fcd25-7377-4c5e-b9d3-31da50600807/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  // Suikoden STAR LEAP (solo Japón, JST): banners, Event RPG con recompensas, regalos y Transient Chamber de Kaiden.gg (src/sources/suikoden.ts).
  // Sin códigos: el juego no tiene canje. Retratos desde la propia fuente (sin wiki).
  def('suikoden', 'Suikoden STAR LEAP', 'SSL', 'Konami', '#e0b45a', '#3a2a10', 0, '', 'Suikoden STAR LEAP', 'suikoden',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/47/c6/9a/47c69aa8-4c29-c992-cf98-6bb165472253/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'),
  // `wip`: mientras su copia no tenga eventos vigentes, sale como "En construcción" y no se puede seguir.
  // BLEACH: Soul Resonance: códigos de game.guide; eventos y banners solo por Discord (canal "bleach"; src/sources/bleach.ts).
  { ...def('bleach', 'BLEACH: Soul Resonance', 'BSR', 'Nuverse', '#ff8a65', '#3e1c12', 0, '', 'BLEACH: Soul Resonance', 'bleach',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1c/63/de/1c63de28-b001-b1c3-ecb6-7fb9895ae0c1/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'), wip: true },
  { ...def('azurlane', 'Azur Lane', 'AL', 'Yostar', '#90caf9', '#1d3a5f', 0, '', 'Azur Lane', 'azurlane',
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/7d/73/87/7d738738-3260-25a4-89f5-e8d1ddd36054/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg'), wip: true },
]

export const initialState = (): AppState => ({
  tracked: [],
  customGames: [],
  events: [],
  patches: [],
  codes: {},
  done: {},
  copied: {},
  codeSeen: {},
  synced: {},
  notify: false,
  leadHours: 24,
  planner: {},
  servers: {},
})
