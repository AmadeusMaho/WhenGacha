import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Lang } from '../i18n'

/**
 * Música de cada skin (13 nov 2026): un botón junto al pincel (solo con una skin puesta) abre un mini-reproductor de YouTube flotante con la
 * banda sonora OFICIAL del juego. Empieza cerrado (sin sonido); al cerrarlo, la música para.
 *
 * Por qué así (normas de la API de YouTube para desarrolladores): el reproductor tiene que verse mientras suena (mínimo 200×200 px, y se usa
 * justo ese tamaño), no se puede ocultar ni separar el audio del vídeo, así que nunca queda sonando "de fondo" sin la ventana. Solo canales
 * oficiales (el del estudio, los "- Topic" que YouTube genera de su distribuidora, el compositor oficial o el sello), comprobados con oEmbed
 * (un vídeo o una lista con la inserción desactivada responde 401). `youtube-nocookie.com`: sin cookies hasta que se reproduce.
 *
 * Dos modos (botón ★/🔀 de la ventanita; se recuerda):
 *  - "Toda la banda sonora" (por defecto, 14 nov 2026): TODA la música del juego, en orden aleatorio. Mezcla la lista oficial del estudio con
 *    las recopilaciones completas más grandes (casi siempre de pistas "- Topic", el audio que YouTube genera de la distribuidora; Blue Archive
 *    no tiene "- Topic" y usa la de MO2). Cada pista sale con la misma probabilidad (ver `pickTrack`).
 *  - "Populares": las 15 subidas oficiales más vistas del juego (las de su lista oficial y los MV de otros canales oficiales), de más a menos vistas.
 * Para cambiar la música de una skin basta con tocar su entrada de `MUSIC`: `top` (vídeos sueltos) y `all.lists` ([id "PL…", nº de vídeos]).
 */
/** `lists`: listas de YouTube con su número de vídeos. La ventana de YouTube solo carga las 200 primeras de cada lista (comprobado: pedirle la
 *  posición 1500 vuelve a la primera), así que la banda sonora se reparte en listas por álbum/versión y las de más de 200 cuentan como 200. */
type Source = { lists: [string, number][] }
const MUSIC: Record<string, { top: string[]; all: Source }> = {
  genshin: {
    // Las 15 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): La vaguelette (16.5 M), Nod-Krai Main Theme Live Performance (16.5 M),
    // Flares of the Blazing Sun (10.1 M), Genshin Impact Main Theme (1.8 M), 【原神】「輝く星々 The Stellar Moments」 (1.7 M), 【原神】「輝く星々Vol.2 The Stellar
    // Moments Vol (1.1 M), 【原神】「寂々たる無妄の国」Disc 1 - 稲光と雷櫻の大地 (1.1 M), 【原神】「輝く星々Vol. 3」 (0.8 M), 【原神】「渦巻、落星と雪山 Vortex of Legends」 (0.8 M),
    // 【原神】「ジュニャーナとヴィディヤーの森」Disc 1 - 緑に囲まれた住処 (0.8 M), 【原神】ドラゴンスパインOSTイメージ楽曲MV「雪深き山頂の記憶」 (0.8 M), 【原神】「白露澄明の泉」Disc 1 - 律令の頌歌 (0.8 M), 【原神】ストーリーOST
    // selection「さざ波」MV (0.7 M), 【原神】「輝く星々Vol. 4」 (0.6 M), 【原神】「流星の軌跡Vol. 2」 (0.5 M)
    top: ['lm3t3myPspk', 'RuXa_yxZMGI', 'o4ne1Xzp8m8', 'EEYMlUVKmyE', 'VkbOdPoMlZ8', '9RGH1j_PIrE', '_CnLbWsxAfA', 'UOh6nvmFc2o', 'iYs8Fv7hrzA', 'y2qPVXmwSiQ', 'h_wb3LfOMw4', 'rxIB4nXIpmg', 'RT7aKhGnsjk', 'y9Rqa8arWo8', 'kPxh-Vx7jhI'],
    // Toda la banda sonora (14 nov 2026): Álbumes de NightBunny8 (pistas de "HOYO-MiX - Topic"/"Yu-Peng Chen - Topic"), uno por lista: ~1900 pistas en total.
    all: { lists: [
      ['PLBO2h-GzDvIa-IIu_3Z8u3L8OO_1Bkv9X', 63], // City of Winds and Idylls
      ['PLBO2h-GzDvIaksoTXyaNZSIvDSGukJzm8', 17], // Vortex of Legends
      ['PLBO2h-GzDvIaUwdnnOgGWAIOvGO37FQKT', 69], // Jade Moon Upon a Sea of Clouds
      ['PLBO2h-GzDvIYyeJMNuK4UheIu05279JDn', 40], // Millelith's Watch
      ['PLBO2h-GzDvIb8WEpnVA-d7-b28HrcyS2D', 62], // Realm of Tranquil Eternity
      ['PLBO2h-GzDvIbe69g9lTSnVEoCZVlEPcL1', 60], // Islands of the Lost and Forgotten
      ['PLBO2h-GzDvIbNgPDEzBXzE2QaXCqAPJqJ', 100], // Forest of Jnana and Vidya
      ['PLBO2h-GzDvIb7asBEuQjxrVQ7ymzAA-0I', 108], // The Unfathomable Sand Dunes
      ['PLBO2h-GzDvIZBfngjFJifDLEJfFxXRCKX', 96], // Fountain of Belleau
      ['PLBO2h-GzDvIZZMTB7ywJ3qs5BDxrlv8a-', 39], // Cantus Aeternus
      ['PLBO2h-GzDvIb6npc1beJOHOc_WeOxe80a', 54], // Jadeite Redolence
      ['PLBO2h-GzDvIapeb4_ASTQQ0cfX-q5RLZ6', 78], // Land of Tleyaoyotl
      ['PLBO2h-GzDvIYjz7i4fSJLQsYGPfQzw6qC', 58], // Radiance Aflame
      ['PLBO2h-GzDvIaNpbHdLerSwD29p6gajySB', 53], // Eternal Sun, Eternal Want
      ['PLBO2h-GzDvIb1xlwyKLDg8YGX0jUyjp3w', 73], // Where Roads Are Pledged to Cross
      ['PLYpsbxhmcBU0', 102], // Where Mercy Endures
      ['PLBO2h-GzDvIax8-TDxcvLSbjVOdaRSCXI', 97], // Outside It Is Growing Dark
      ['PLBO2h-GzDvIbM6YwHsNDqej8s7o8y0vXe', 68], // The Shimmering Voyage
      ['PLBO2h-GzDvIbvlVqT_N3jGl-EOAkL4ZKA', 57], // The Shimmering Voyage Vol. 2
      ['PLBO2h-GzDvIZmNZwJEWkIBLMbfn3ssFwf', 68], // Vol. 3
      ['PLBO2h-GzDvIZjV40UBmYzWnlcQxVDg-un', 67], // Vol. 4
      ['PLBO2h-GzDvIYFnAe_lyGV14bXDVIhJdDx', 59], // Vol. 5
      ['PLBO2h-GzDvIb99g8YQS7g_L9og2kPjtoz', 92], // Vol. 6
      ['PLBO2h-GzDvIYg-la_b-ddTp4T0wkcQ7D1', 152], // The Stellar Moments Vol. 1-6
      ['PLBO2h-GzDvIZYGaXqYrXjs02wvSJtSTaA', 38], // The Stellar Moments Vol. 7
      ['PLBO2h-GzDvIYafddfclGzPd7ep2z5SWE5', 53], // Footprints of the Traveler Vol. 1-6
      ['PLBO2h-GzDvIZFiYeeYsmKcjJzzrdgqwpJ', 15], // The Wind and the Star Traveler
      ['PLBO2h-GzDvIbxkgy4XKzF9KZz-pH1QobZ', 208], // Realm Music (Serenitea Pot)
      ['PLdni05PnuscvEM17RtWoy1jraPhumpdjV', 110], // 原神OST (canal oficial japonés)
    ] },
  },
  hsr: {
    // Las 15 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): Version 2.0 Music Video — "WHITE NIGHT (31.6 M), Wildfire (21.7 M), Hope
    // Is the Thing With Feathers (19.3 M), Sway to My Beat in Cosmos (14.5 M), Honkai: Star Rail EP: Proi Proi (11.6 M), EP: Hope Is the Thing With
    // Feathers (8.0 M), EP: Samudrartha (6.7 M), EP: If I Can Stop One Heart From Break (5.3 M), Honkai: Star Rail EP: Beyond This Stat (4.0 M), EP:
    // Of Snow and Ember (1.4 M), Honkai: Star Rail EP: Allegory of the  (1.2 M), EP: Out of Control (1.0 M), Honkai: Star Rail EP: Ex Nihilo (0.6 M),
    // EP: The Flapper Sinthome (Part 1) (0.3 M), EP: The Flapper Sinthome (Part 2) (0.3 M)
    top: ['U7W8QR9fsFw', 'SxlW79tDhCA', 'aPyt41nnM0k', 'npyiiInMA0w', 'loWA5o1RdTY', 'l8-v7ZnNB_c', 'qWXPNyt6oTE', 'xFHNWJVsjmY', '2wIubFgXlyk', 'J9wcfTVUZNE', 'fao9fjeAGEI', 'sQT8kCDOz_U', 'C8DuPjxUaAk', 'J-cn3BPK2cw', '7-Q3ieKKgKA'],
    // Toda la banda sonora (14 nov 2026): Álbumes de NightBunny8 (pistas de "HOYO-MiX - Topic") + la lista "EP" del canal oficial.
    all: { lists: [
      ['PLBO2h-GzDvIY12MyZ77fK0sqL0bxyN6dL', 143], // Experience the Paths Vol. 1-6
      ['PLBO2h-GzDvIZMt27ykD8Qhy4ZkiR51ewd', 31], // Of Snow and Ember
      ['PLBO2h-GzDvIZba2z0gPlRj0xP9_6sI4lG', 18], // Out of Control
      ['PLBO2h-GzDvIaGazCHjEIlzOKESPZsJMWV', 33], // Svah Sanishyu
      ['PLBO2h-GzDvIaR5qkqdaT-rSLGYDBQ_PHZ', 85], // Astral Theater Vol. 1-3
      ['PLBO2h-GzDvIa9xQkBLdEZ0MDAOa6PAbYR', 32], // The Flapper Sinthome (Part 1)
      ['PLBO2h-GzDvIYrWagCZJfbEQjZ7k8pnTDN', 33], // The Flapper Sinthome (Part 2)
      ['PLBO2h-GzDvIYGN7D9UXbvriUWupe_s6Su', 44], // Let There Be Laughter (Part 1)
      ['PLXapL0j-KHP8', 62], // Let There Be Laughter (Part 2)
      ['PLfVC3NhFKXcw', 48], // Let There Be Laughter (Part 3)
      ['PLBO2h-GzDvIYShujpcK6F8Lt9hKt0kFEg', 32], // Allegory of the Cave (Part 1)
      ['PLBO2h-GzDvIY0gsNAm0VwmclB2lTtrsmp', 51], // Part 2
      ['PLBO2h-GzDvIb7N0Jj1ydDW6z-BW0AIBUk', 52], // Part 3
      ['PLBO2h-GzDvIYmVa6xEGv6rvBAcFzOVmLY', 250], // Phonograph
      ['PLBO2h-GzDvIYNa6fLfSPeHnPAOD8Gyf8r', 20], // Honkai: Star Rail EP
      ['PLi18Roijwy3PjC4rvb6W8fq5HFFvhPV_8', 11], // EP (canal oficial)
    ] },
  },
  zzz: {
    // Las 14 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): モエチャッカファイア / 弌誠：MUSIC VIDEO (108.6 M), ZENLESS – Tiësto x Zenless Zone
    // Zero (20.3 M), Come Alive (11.7 M), Burning Desires (10.0 M), Lucia EP - "DAMIDAMI" (6.6 M), Zhao EP - "Tiny Giant" (6.6 M), Caesar EP -
    // "pinKing" (6.2 M), Phoenix EP - "1% Battery Girl" (5.8 M), "ReDreaming Angel" - Angels of Delusio (5.7 M), Ellen EP - "Shark's Gotta Bite" (4.3
    // M), Starlight - Billy EP - "Billy Mode" (4.0 M), Claret EP - "Link Up" (3.6 M), Lighter EP - "Fearless" (3.5 M), Norma EP - "chaos.exe" (3.2 M)
    top: ['wZlv3qDPfjk', 'GkgtQOlJp0Y', 'R3tZmmiKi0o', 'LCo0KdbVIJM', 'NCzUV95VIEI', 'TU5Bt8MLPjk', 'FaxI5oNATLE', 'AkWvzeXDUxY', '7wMz8mDyHgM', 'cK1ABiGuiG0', 'JNfm_nR4OWo', 'Ln0ilmPqXU0', 't_Ng_b28uxM', 'QBGEahKfeco'],
    // Toda la banda sonora (14 nov 2026): Álbumes de NightBunny8 (pistas de "Sān-Z - Topic"), versiones 3.x de Finding Purposes y la lista "MV" del canal oficial.
    all: { lists: [
      ['PLBO2h-GzDvIa5lcXOhFpl-trjDsa8VuKU', 198], // Hyper Commission
      ['PLBO2h-GzDvIbuu267Yvkvykq9ziT2bBdf', 109], // Hyper Commission 2.0
      ['PLBO2h-GzDvIaUBaxBBSgzqvwxbIGC7GlG', 63], // Character Teaser Soundtrack Collection 1.0 + 2.0
      ['PLBO2h-GzDvIY6vTEQLwUY8Km4kH5fnpc6', 33], // Teaser Soundtrack
      ['PLBO2h-GzDvIaTSq1OmIpeC0L7Rop9eeKp', 9], // Stars of Lyra +
      ['PLem-gGr8ouJY', 56], // 3.0 OST (Finding Purposes)
      ['PLP5FVQrjoIQE', 53], // 3.1 OST
      ['PLF3YpUYIcXls', 32], // 3.2 OST
      ['PL_DB7Cdpj4lLd9yDVGlLpMf6-VGIvKFJf', 30], // MV (canal oficial)
    ] },
  },
  wuwa: {
    // Las 15 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): With Glory I Shall Fall (11.1 M), Against the Tide (Original Game Soundt
    // (8.7 M), Voyaging Star's Farewell (7.5 M), Ode to the Nameless Martyr (4.2 M), Heart of Lahai-Roi (4.1 M), Dancing Through Fantasies (4.0 M),
    // Chasing Daylight (3.7 M), Running For Your Life (3.5 M), A Small Miracle (3.2 M), Saving Light（Original Game Soundtrack） (3.1 M), Catch Me If
    // You Can (2.7 M), Reveries in the Crimson Beyond (2.5 M), Chains of Oath, Echoes of Promise (2.4 M), Vernal Days Dreamed by the Star (2.3 M),
    // Homecoming Star from the Unbound (2.3 M)
    top: ['4ZKgq7Aw34s', 'Yr1RlcoqXTg', '0HrdRGuF2Y8', 'AuMcCiwNazo', 'Gp0Jbhu0FWA', '0hC73MsFBv8', 'Vd_zk_wj9b0', 'mWxP-sQmNMU', 'bPS8Ii6Ef14', 'nl_vdjf-jM0', 'Lixpftlm0Eo', 'Se95CIbDWLc', 'eyb1h5LVHhg', '0gSyy50n6vc', '7nwzaBOmiYc'],
    // Toda la banda sonora (14 nov 2026): Sin álbumes por lista en YouTube: "Complete Audio Only" de Omen Cat (pistas de "Wuthering Waves - Topic"; la ventana solo alcanza sus 200 primeras), las de Gud (Topic, 1.0-3.0), las de yuriwaves por versión y los EP oficiales.
    all: { lists: [
      ['PLyVm5L-oRpT5Vb1vvwTX45qrDY2t5UtFX', 1023], // Official OST (Complete Audio Only)
      ['PLJfR2UqVGenqXtL83pAoVeJm-ugIsPYaK', 115], // OST (1.0-3.0), Gud
      ['PLP-vPRZjMykjDeCZqcnvUNNtFloSn63f3', 48], // ALL EP
      ['PLJYjhgBBSY0qlqvMZE2-AK9opzo5KnPyQ', 96], // V2.0 All Silent Souls Can Sing
      ['PLJYjhgBBSY0pfqaGsEl0EwtlTb-JQqeWF', 124], // Chapter 3: Lahai-Roi
      ['PLJYjhgBBSY0rNUIKur7UvsbOreV9f2PCg', 40], // Boss Themes
      ['PLJYjhgBBSY0rDLxCG5cTLbgQpVCwulrqp', 37], // V1.4 When The Night Knocks
      ['PLJYjhgBBSY0q-r1DwWvMKynTDeDDPyVoI', 20], // V1.3 Into The Depths
      ['PLJYjhgBBSY0oYeBUnUkNR4R_-GcK3Xt9c', 16], // Stars Intertwined Vol. 1
      ['PLJYjhgBBSY0rN5-RCInZXfWvU9cyKfVzI', 22], // V2.4 Lightly We Toss the Crown
      ['PLJYjhgBBSY0q2OlGh-jGlhQGEoavd_GGj', 15], // V2.8 To the City Set in Amber
      ['PLJYjhgBBSY0oy1Y2cbJo794AvUoupcJp_', 23], // V3.0 We Who See the Stars
      ['PLJYjhgBBSY0rxQAtdiCqNgAJm7SaDsQvw', 18], // V3.1 For You Who Walk in Snow
      ['PLJYjhgBBSY0ovEMN1yoUJj33YjAbM2ZSK', 11], // V1.4 Ego
    ] },
  },
  nikke: {
    // Las 15 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): THE REDHOOD (3.3 M), Stronghold Land Eater (3.3 M), Goddess of Victory
    // (3.2 M), Inferno of Nihilist / Burn it All (3.2 M), Crystal Chamber Boss - We're Never Giv (2.5 M), The Harvester (2.5 M), WE RISE (Full
    // Length) (2.2 M), RE DASH : THE REDHOOD (2.0 M), A.C.P.U.! FREEZE! (1.8 M), Last Kingdom Main Theme OST : The Clar (1.7 M), Ominous Cross (1.6
    // M), REDASH : Daybreak (ULTRA) (1.6 M), Indivillia Boss 2nd Phase : Absolute M (1.6 M), EEEEEEEEE-ntertainment (1.5 M), Lovely Lonely Cat (1.4
    // M)
    top: ['rErd6UAXgBU', 'lSt_6SiAUwo', 'hK_6T-LzdbE', 'MTogyN87-L4', 'OcNZMW03318', 'jdZ5DEnSanw', 'LKAs-FqqCmo', 'RB7i6JnIdlE', '7b0esAbfcGc', 'W1DALeSLLus', 'UWu-GTEajok', 'y6VXdT8m4dM', 'DxfHZHgmvl4', '5VX6i6PKtlk', 'S-bOBwuBRdU'],
    // Toda la banda sonora (14 nov 2026): NightBunny8 (completa, 888: la ventana alcanza 200), Cosmograph (sello oficial) por álbum, los álbumes de LEVEL NINE ("- Topic") y dos recopilaciones grandes.
    all: { lists: [
      ['PLBO2h-GzDvIYV8CaJk7S0kjtnotzyUzXw', 888], // FULL ORIGINAL GAME SOUNDTRACK
      ['PLBO2h-GzDvIaP07vTOMak0mQhGOw8Kbmo', 49], // ORIGINAL GAME SOUNDTRACK
      ['PL1KsHejR9xB-a1PMEvlBlXbALTpF-Wwtv', 307], // Cosmograph [GODDESS OF VICTORY: NIKKE]
      ['PL1KsHejR9xB-6CfmKdEHWIDNslb5uMrAb', 30], // GODDESS FALL
      ['PLRFfF8iU2JKo', 16], // Maria-n 1
      ['PLcktSWrRIOKI', 9], // Maria-n 2
      ['PL1KsHejR9xB_2GQXNVgdQ8OfxZK-M5-Na', 54], // At Last
      ['PL1KsHejR9xB-m_g1wATU5tjeRRbYqMq-Z', 39], // NIKKE Works
      ['PL1KsHejR9xB9Ixp6LqFVLMu5AJBGwTEET', 17], // STAR ANIS
      ['PLMuuXxO8FXP4', 11], // Wave to You
      ['PL1KsHejR9xB911TJZE5RNtOWramuaM57u', 8], // ARK RANGER
      ['PLQvZO82pZCFU', 10], // Coin Rush SHOW DOWN
      ['PLClRxgLUIZ-4', 9], // PERSONA ON FRONTLINE
      ['PLCoMBN-7O01A', 7], // PROJECT MATIS
      ['PL1KsHejR9xB9tleD4arSDqUaMA4Jv_WUp', 8], // Stellar Blade X NIKKE
      ['PLTaL5v9XgWB3_77aqI-5TLZvKLYHPdP7o', 16], // LEVEL NINE - White Snow
      ['PLIHYeSKCjrI2573BTtFEMwBLmS5IdMEzD', 23], // Over Zone
      ['PLoVhXNGmyzIE1h-1lpF4HzpzaAHOxADjg', 12], // Trace
      ['PLoVhXNGmyzIHEZxtr2bzAvBhz2330tcU1', 13], // Wandering Soul
      ['PL4A1-Mu6K-S4zwHch8Lzdi4Vyz8n6VLnL', 30], // Folk Tale
      ['PLI_3Ui9KGEqfVJO5rdhUJJqNXNysbV17u', 15], // Living Land
      ['PL4ZOb7ZMIGG5T1kWhYLqaZLmfJh26C6h3', 12], // Unknown
      ['PLBzEbkbZun4EzgFYmwgbQURpY6r7plDAq', 21], // Invasion
      ['PLSOL8GQbX9U8amykj28qiUbhgG7kPwvsQ', 8], // ユニバーサル・スパイス！！！
      ['PLMn5m70q1QSKIY8pPCfygluAy8f8hRmDK', 21], // Unbreakable Sphere
      ['PLj7tctwFIo27vWZqMtEEg-cQG6XNGFtMe', 8], // Sand Storm
      ['PL5jBjkei2aH4MGzD5eUG3c-yeGCOl0RzV', 16], // NEVERLAND
      ['PLZ-SQNHH3v6hMUTkjW6Xbdr-gnlUox4vp', 15], // Eternal Scar
      ['PL3d8Q5v1ZtW8N-ZawWJIi9wWI62hGw7oe', 12], // After World
      ['PL9MUbGGib1jFjL-2oXz27pEIt262Prbfq', 11], // Hand On Hand
      ['PLMpbJrT3jaB7Ad_dz6qY6GaJb_PyCHK4A', 9], // Red Eye, Smile
      ['PLXx2Lh-AWWZ-2FKMKryb7iMQxsctbvTHt', 11], // From the Sky, From the Land II
      ['PLNcB9VLMoxAoWiCE2gne91aXS6y1nVTFn', 104], // FIGHT SONGS (Doro)
      ['PLPf0cGeXAenDjU_yctekn_0k4ZRlFCQtM', 175], // DexterousPotato
    ] },
  },
  uma: {
    // Las 14 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): めにしゅき♡ラッシュっしゅ！ (9.8 M), BRIGHTEST HEART (8.0 M), うまぴょい伝説 (8.0 M), GIRLS'
    // LEGEND U (3.9 M), Umamusume: Pretty Derby – Umapyoi Lege (1.7 M), Winning Concert Video Short Version: " (96 k), Winning Concert Video Short
    // Version: " (44 k), Winning Concert Video Short Version: " (22 k), Winning Concert Medley Promotional Vid (22 k), Winning Concert Video Short
    // Version: " (18 k), Winning Concert Video Short Version: " (13 k), Winning Concert Medley Promotional Vid (13 k), Winning Concert Video Short
    // Version: " (13 k), Winning Concert Video Short Version: " (12 k)
    top: ['8ULbYqRtlMQ', 'YExL2ilCMLs', 'VFOg6mHtZcA', 'G7RmGsHxv-Q', 'eAkxxgEHEmg', 'h4kgHAp-HLo', 'hDy2ww5MVh8', '60qtuyy7xjs', '2R1IoTrfRJU', '1vsGxmIX6Co', 'LVfT8sU48Pg', 'TL75-qmY1Eo', '2jlTePl8xjU', '7e7rUU7k7gc'],
    // Toda la banda sonora (14 nov 2026): Sin álbumes por lista: las de 荻風 (pistas "- Topic" del sello; 702 y 347, la ventana alcanza 200 de cada una), recopilaciones de canciones y de música del juego, y "Winning Concert Video" oficial.
    all: { lists: [
      ['PLXQE_C7He7f_XHyR-qrqV8maID8emw3Xb', 702], // OST ALL (荻風)
      ['PLXQE_C7He7f9MKGP11OpI8jw187fOgg_3', 347], // キャラソン 全曲 (荻風)
      ['PLmzm3LDmpBsqBlM1daQ86YPwPWJwSc449', 240], // 全曲収録 (Schneewolzer)
      ['PLoN0DgNaU8QdpgfXQuPn6YOkcQ4T_BZQE', 198], // All Songs in Release Order (Polecat)
      ['PLZGtjAl-fznrHM5bwcyp3CNFL4vmncymq', 302], // Game OST (A dumb horse)
      ['PLZGtjAl-fznqpg-ZYuBKkxgq7_jjU83zP', 36], // Race BGM
      ['PLZGtjAl-fznoMzwlXJiGxzkP2yTSJgVQ-', 37], // Campaign BGM
      ['PLomu3EIYxS8NWNZYyvvLkVo0E15Jj9ZpG', 120], // Career/Event/Scenario (LegibleSolid)
      ['PLbRq7_wpPI8nZHTi9t6Hd5nAQN_gdIY4S', 22], // Winning Concert Video (oficial)
    ] },
  },
  bluearchive: {
    // Las 15 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): Main OST 'Target for love' Full ver. (5.7 M), Usagi Flap | Rabbit of
    // Caerbannog! RAB (1.3 M), X DJ TAK BGM REMIX_2021 Ver. (1.0 M), Echoes of Longing MV | Ex. Decagrammat (0.7 M), Unwelcome School_Piano Jazz Ver.
    // (Feat (0.7 M), Highlander Railroad Academy Special OS (0.5 M), Main OST 'Target for love' Covered by  (0.5 M), Aris \u0026 Kei - Protocol
    // SUPERNOVA M (0.4 M), KAGEROU (Full Version) | OST (0.3 M), SUGAR RUSH - Kokoro Gradation (JP Ver. (0.3 M), BGM Playlist _Theme l Winter ❄ l
    // (0.3 M), BGM Playlist _Theme l Dreamer🚀 l (0.3 M), Kisaki - Following Petals (Japanese Ve (0.2 M), Main OST Piano ver. l Coverd by FONZI  (0.2
    // M), Sakurako – Twinkle☆Magic MV (0.2 M)
    top: ['aTU-osotD8k', 'wFvj8P3c9T0', 'iWy_8f1LmTU', 'AgcbWyKM-Tc', 'iWKXKcGVjxA', 'sOwnhE0Easg', '8Q4rflTedwQ', 'Pm4KSlf19pI', 'aQiNBLWvynk', 'xQcjgqtxDuA', 'hskgnjHp4uI', 'fO3VPOEQXNM', '4Rki7khVcZ0', 'ExYvqpziqgg', 'zTX1HSo9JUE'],
    // Toda la banda sonora (14 nov 2026): Su música no está en canales "- Topic": las listas de MO2 (por volumen, género y evento), los aniversarios de NightBunny8 y "MUSIC" del canal oficial.
    all: { lists: [
      ['PLh6Ws4FpphfoQhmpxR__Drt6t2LSS_p6Z', 39], // Vol.1
      ['PLh6Ws4FpphfqY9lXLh8eRPYeTGbhULqhY', 21], // Vol.2
      ['PLh6Ws4FpphfoYgeVLR5-SGafUtHADKrQT', 26], // Vol.3
      ['PLh6Ws4FpphfqKKC8M9R_UJdxJDT8JmVaZ', 27], // Vol.4
      ['PLh6Ws4FpphfqQnu244UDkHAHPDFcGrUts', 27], // Vol.5
      ['PLh6Ws4FpphfoPBKsiA2S0Xb8CFIKK5a39', 28], // Vol.6
      ['PLh6Ws4FpphfqRun0F3XCUU95AJcThtgTU', 28], // Vol.7
      ['PLh6Ws4FpphfrCcPWz3-5ufQvy96mMQT6q', 28], // Vol.8
      ['PLh6Ws4FpphfoIPTJW3RSYTQvuylI939MV', 53], // Event Theme
      ['PLh6Ws4FpphfqfbXHcEiGNzK18Pzm780QE', 14], // By Story: Hyakkiyako
      ['PLh6Ws4Fpphfr9iEOhSHgtUGrZs-CYFHXd', 22], // Genre: Future Bass
      ['PLh6Ws4FpphfqzZQF9bxXtRSv_KUyaDknc', 96], // Genre: Uplifting
      ['PLh6Ws4Fpphfrt04P9qnjSTkZDRZ26Doz7', 84], // Genre: Chillout
      ['PLh6Ws4Fpphfq6IQa4OAoFOz1kIJTm_pQ1', 71], // Genre: Hard
      ['PLh6Ws4Fpphfqr7VL72Q6HK5Ole9YI54hv', 342], // Blue Archive OST (MO2)
      ['PLBO2h-GzDvIZgVonPgDN2GlxeX1y9tMEM', 197], // Anniversary (NightBunny8)
      ['PLJQeatpi7jHiFWx2YUj_jD_WjSVOFbR22', 54], // MUSIC (canal oficial)
    ] },
  },
  arknights: {
    // Las 15 subidas oficiales más vistas (13 nov 2026, vistas de YouTube): Radiant (7.7 M), DJ OKAWARI feat. 二宮愛 「Speed of Light」 (6.7 M), Operation
    // Pyrite (5.7 M), Operation Blade (5.3 M), Arknights EP - Dormant Craving (2.2 M), Arknights EP - Mystic Light Quest (1.1 M), Arknights EP -
    // Ständchen (1.1 M), Arknights EP - All hail Savior! (0.8 M), Arknights EP - Stainless Heart (0.8 M), Arknights EP   Morning Dew (0.7 M),
    // Arknights EP - Ensheath (0.7 M), Arknights EP - Sentenced (0.7 M), Arknights EP - Echoism (0.7 M), Arknights EP - Thorns In You (0.6 M),
    // Arknights EP - Here in Vernal Terrene (0.6 M)
    top: ['eImNc6AIViQ', 'L2LB12IxLDU', 'saOnB_CRG9Y', 'hpI5vMxYJ_k', 'geHKKSHzk00', '7AtD9EjJXKo', '6BL_kNVBZGs', 'Y8x5KSy74Ck', 'ZJbt47PhAf4', 'iU9qCC1dP4Q', 'TG1VhmtmdOc', '5lHsnpajCds', 'n--yUlyoQPk', '1x9E38IfDm0', '4IfAU5DcZJ4'],
    // Toda la banda sonora (14 nov 2026): "Monster Siren Records - Topic" (recopilación de Lud_Reficur y de Maidniac; la primera alcanza 200 de 684), los EP oficiales de Yostar, los volúmenes de NightBunny8 y recopilaciones de la música del juego.
    all: { lists: [
      ['PLFxi1xOJXheF2zXThZTQnInoWZb1JfPf5', 684], // Monster Siren Records (Lud_Reficur)
      ['PLGddMBlDb5ofTtzPJQTJ3NjK_skmKE5lS', 177], // Monster Siren Records (Maidniac)
      ['PLbuSQ8SJFnFEHL4_T9S0whD-TevceJIsl', 156], // Arknights Official EP
      ['PLBO2h-GzDvIaDoPmsZaZgK63YfKynE71J', 83], // アークナイツ Vol. 1-5 (NightBunny8)
      ['PL41qV29zcSqu7Jt7vDT2FWbI-du1fMOr_', 158], // Official Character Themes (PSImiss)
      ['PLqCB11O5zGBLRRxYXQYmsaH4iExHyeBl6', 122], // MSR Battle/Lobby
      ['PLqCB11O5zGBKpGJ54gRRkCna9EU6AoKim', 52], // MSR CC
      ['PLih_zMjUgynEbeSEAVt2NjtVPQT9xYkOV', 574], // Arknights OST (NoireSama)
      ['PLsdxE1--Wa_rNtgNwI19t1J5tjAxHQ-g5', 147], // Arknights OST (Kazdel Team)
    ] },
  },
}

/** Skins con reproductor temático compacto (además de ZZZ, que tiene la tele): HSR funda de vinilo, Genshin pergamino, NIKKE el teléfono del
 *  comandante, WuWa panel holográfico, Arknights ficha de PRTS, Uma entrada del Winning Live, Blue Archive una conversación de MomoTalk. Las que no estén aquí usan la ventanita sencilla. */
const MINI = new Set(['hsr', 'genshin', 'nikke', 'wuwa', 'arknights', 'uma', 'bluearchive'])

type Mode = 'all' | 'top'
const TXT: Record<Lang, { open: string; close: string; title: string; side: string; all: string; top: string; allShort: string; topShort: string; mode: string }> = {
  es: { open: 'Música oficial del juego', close: 'Cerrar (para la música)', title: 'Banda sonora', side: 'Cambiar de esquina',
    all: 'Toda la banda sonora, en orden aleatorio', top: 'Las canciones oficiales más vistas', allShort: 'Todas', topShort: 'Populares', mode: 'Qué música suena' },
  en: { open: "Game's official music", close: 'Close (stops the music)', title: 'Soundtrack', side: 'Switch corner',
    all: 'The whole soundtrack, shuffled', top: 'The most viewed official songs', allShort: 'All', topShort: 'Popular', mode: 'What plays' },
  zh: { open: '游戏官方音乐', close: '关闭（停止音乐）', title: '原声', side: '切换角落',
    all: '全部原声，随机播放', top: '观看次数最多的官方歌曲', allShort: '全部原声', topShort: '热门', mode: '播放内容' },
}

/** Iconos del selector (trazo en `currentColor`: toman el color de cada skin). */
const SHUFFLE = <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21" /><path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4C15.1 7.5 16.1 7 17.5 7H21" /><path d="m18 4 3 3-3 3M18 14l3 3-3 3" />
</svg>
const STAR = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path fill="currentColor" d="m12 3.2 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z" /></svg>

const SIDE_KEY = 'whengacha:music-side'
const MODE_KEY = 'whengacha:music-mode'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* solo esta visita */ } }

const BASE = 'https://www.youtube-nocookie.com/embed/'
const COMMON = 'autoplay=1&rel=0&playsinline=1&loop=1'

/** Una pista al azar de toda la banda sonora: lista según su tamaño y posición dentro de ella (cada pista pesa lo mismo). */
function pickTrack(lists: [string, number][]): { list: string; index: number } {
  const size = (n: number) => Math.min(n, 200)
  let r = Math.floor(Math.random() * lists.reduce((t, [, n]) => t + size(n), 0))
  for (const [list, n] of lists) { if (r < size(n)) return { list, index: r }; r -= size(n) }
  return { list: lists[0][0], index: 0 }
}

/** URL del reproductor. "Todas": con la API de la ventana (`enablejsapi`) para saltar a una pista al azar (ver el efecto de `SkinMusic`). */
function srcOf(m: { top: string[]; all: Source }, mode: Mode): string {
  if (mode === 'top') return `${BASE}${m.top[0]}?${COMMON}&playlist=${m.top.join(',')}`
  const { list } = pickTrack(m.all.lists) // la posición la pone el efecto al estar lista (YouTube ignora `index` en la URL)
  return `${BASE}videoseries?list=${list}&${COMMON}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
}

export default function SkinMusic({ skin, name, lang }: { skin: string; name: string; lang: Lang }) {
  const s = TXT[lang] ?? TXT.es
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'left' | 'right'>(() => (read(SIDE_KEY) === 'left' ? 'left' : 'right'))
  const [mode, setMode] = useState<Mode>(() => (read(MODE_KEY) === 'top' ? 'top' : 'all'))
  const frame = useRef<HTMLIFrameElement>(null)
  const m = MUSIC[skin]
  // Fijo mientras la ventana sigue abierta con el mismo modo (barajar en cada render recargaría el vídeo); al reabrir, otro orden.
  const src = useMemo(() => (m && open ? srcOf(m, mode) : ''), [m, mode, open])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])
  // "Todas" (14 nov 2026): al estar lista la ventana, al acabar cada canción (o si una no se puede reproducir, o se pulsa "siguiente") se
  // carga otra pista al azar de entre TODAS las listas de la skin (`loadPlaylist` con su posición; solo llega a las 200 primeras de cada lista).
  useEffect(() => {
    if (!open || mode !== 'all' || !m) return
    let started = false
    let last = 0
    let cur: number | undefined // posición en la lista que suena ahora (la que nosotros pedimos)
    const send = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
    const jump = () => {
      const now = Date.now()
      if (now - last < 1500) return // un solo salto por fin de canción (YouTube avisa varias veces)
      last = now
      cur = undefined
      const { list, index } = pickTrack(m.all.lists)
      send('loadPlaylist', [{ list, listType: 'playlist', index }])
    }
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let d: { event?: string; info?: unknown } | null = null
      try { d = JSON.parse(e.data) } catch { return }
      if (!d) return
      const info = d.info as { playerState?: number; playlistIndex?: number } | number | null | undefined
      const state = d.event === 'onStateChange' ? info : typeof info === 'object' ? info?.playerState : undefined
      const idx = typeof info === 'object' ? info?.playlistIndex : undefined
      if (!started && (d.event === 'onReady' || state === 1)) { started = true; last = 0; jump(); return } // primera pista al azar
      // Al acabar una canción, la lista pasa sola a la siguiente (sin avisar de "terminado"): se nota en el cambio de posición.
      if (typeof idx === 'number' && Date.now() - last > 1500) { if (cur !== undefined && idx !== cur) { jump(); return } cur = idx }
      if (state === 0 || d.event === 'onError') jump()
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [open, mode, m])
  if (!m) return null
  const flip = () => { const n = side === 'right' ? 'left' : 'right'; setSide(n); write(SIDE_KEY, n) }
  const pick = (n: Mode) => { if (n !== mode) { setMode(n); write(MODE_KEY, n) } }
  // La ventana de YouTube pide que le digamos que escuchamos sus eventos para mandar "onReady".
  const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  const player = <iframe key={`${skin}:${mode}`} ref={frame} className="music-frame" src={src} title={`${s.title} · ${name}`} width="200" height="200" onLoad={listen}
    allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
  return (
    <>
      <button className={`btn sm lang-btn music-btn ${open ? 'on' : ''}`} onClick={() => setOpen(o => !o)} aria-pressed={open} title={s.open} aria-label={s.open}>
        {/* Nota centrada en su caja (x 6–18, y 3–21) y del tamaño del pincel (18 px), para que los dos botones midan lo mismo. */}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
      </button>
      {open && (skin === 'zzz' || MINI.has(skin)) && createPortal(
        /* ZZZ (13 nov 2026): el reproductor es la tele CRT de la pantalla de inicio del juego, dibujada solo con CSS. El vídeo va dentro
           de la pantalla a su tamaño (200×200) y sin nada encima (YouTube no deja taparlo): el cristal curvo y el brillo van en el marco.
           A la derecha, las dos ruedas son el selector de modo; abajo, el vídeo (VHS): encendido = cerrar, pantallita = título, ⇄ = esquina.
           Las demás skins de MINI reutilizan este HTML con otra silueta, compacta y sin mueble de tele (skins.css, "Temas compactos"):
           la primera versión les ponía a todas el mismo mueble y acababan pareciendo teles (13 nov 2026). */
        <div className={`music-dock tv ${skin === 'zzz' ? '' : 'tv-mini '}tv-${skin} ${side}`} role="region" aria-label={`${s.title} · ${name}`}>
          {skin !== 'zzz' && <span className="tv-deco" aria-hidden />}
          <div className="tv-set">
            <div className="tv-bezel"><div className="tv-screen">{player}</div></div>
            <div className="tv-side">
              <div className="tv-knobs" role="radiogroup" aria-label={s.mode}>
                {(['all', 'top'] as const).map(k => (
                  <button key={k} role="radio" aria-checked={mode === k} className={`tv-knob ${mode === k ? 'on' : ''}`} onClick={() => pick(k)} title={k === 'all' ? s.all : s.top}>
                    <i aria-hidden />{k === 'all' ? SHUFFLE : STAR}<span>{k === 'all' ? s.allShort : s.topShort}</span>
                  </button>
                ))}
              </div>
              <div className="tv-grille" aria-hidden />
            </div>
          </div>
          <div className="tv-deck">
            <button className="tv-power" onClick={() => setOpen(false)} title={s.close} aria-label={s.close}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 3v8" /><path d="M6.4 6.6a8 8 0 1 0 11.2 0" /></svg>
            </button>
            <div className="tv-slot" title={`${s.title} · ${name}`}><span>{name}</span></div>
            <button className="tv-eject" onClick={flip} title={s.side} aria-label={s.side}>⇄</button>
          </div>
        </div>,
        document.body,
      )}
      {open && skin !== 'zzz' && !MINI.has(skin) && createPortal(
        <div className={`music-dock ${side}`} role="region" aria-label={`${s.title} · ${name}`}>
          <div className="music-head">
            <span className="music-title" title={`${s.title} · ${name}`}><b>♪ {name}</b></span>
            <button className="music-ctl" onClick={flip} title={s.side} aria-label={s.side}>⇄</button>
            <button className="music-ctl" onClick={() => setOpen(false)} title={s.close} aria-label={s.close}>✕</button>
          </div>
          {/* Selector de modo: dos opciones con texto e icono propio (en el color de la skin), en vez de un solo botón con emoji. */}
          <div className="music-modes" role="radiogroup" aria-label={s.mode}>
            {(['all', 'top'] as const).map(k => (
              <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => pick(k)} title={k === 'all' ? s.all : s.top}>
                {k === 'all' ? SHUFFLE : STAR}<span>{k === 'all' ? s.allShort : s.topShort}</span>
              </button>
            ))}
          </div>
          {player}
        </div>,
        document.body,
      )}
    </>
  )
}
