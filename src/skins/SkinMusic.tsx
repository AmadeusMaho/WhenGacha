import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
/** `first` (opcional): la canción con la que empieza la vista previa (sin Premium) si no conviene la más vista; luego sigue `top` en orden. */
/** `game` (opcional, 18 nov 2026): tercer modo con las más vistas SOLO del juego, cuando `top` mezcla otras obras de la franquicia (FGO: `top`
 *  es toda la saga Fate). Con `game`, `top` se llama "Todo Fate" (`topName`) y el selector muestra tres opciones. */
type Music = { top: string[]; all: Source; first?: string; game?: string[]; topName?: Record<Lang, [short: string, long: string]> }
const MUSIC: Record<string, Music> = {
  genshin: {
    // Populares (15 nov 2026, vistas de YouTube con yt-dlp): solo canciones sueltas (fuera álbumes y conciertos de una hora, tráilers y cortos).
    // La vaguelette (16.5 M), Nod-Krai Main Theme Live Performance (16 M), Flares of the Blazing Sun (10.1 M), Rex Incognito (7.3 M), Polumnia Omnia
    // (6.7 M), Passing Memories (6.7 M), Duel in the Mist (6.2 M), Se mettre sur son trente-et-un ! (5.3 M), Fontaine (5.1 M), Termination of Desires
    // (4.7 M), Absolutio Absoluta Absolutissime (4.3 M), Rage Beneath the Mountains (4.3 M), Elogia Cinerosa (4.3 M), Lullaby of the New Moon (3.9 M),
    // EP: The Divine Stone Sees the World (3.6 M). Del canal oficial y de las pistas de HOYO-MiX / Yu-peng Chen.
    top: ['lm3t3myPspk', 'RuXa_yxZMGI', 'o4ne1Xzp8m8', 'SBfoWTB-T_U', 'NLEqRNhv6gs', 'j3661mhHfvY', 'FYP2dM8RTFM', 'Arhwh0knLe4', 'tiulg9ySfR8', 'uAte-2ZptaQ', '0ZNqBF3M7-8', 'tIq41I2WT70', 'yFrH9y_cpLg', 'rX8kBUIT5dE', 'gE1BVoq2x8s'],
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
    // Populares (15 nov 2026, vistas de YouTube con yt-dlp): ZENLESS – Tiësto x Zenless Zone Zero (20.3 M), Come Alive (11.7 M), Burning Desires
    // (10.0 M), Lucia EP "DAMIDAMI" (6.5 M), Zhao EP "Tiny Giant" (6.5 M), Caesar EP "pinKing" (6.2 M), Phoenix EP "1% Battery Girl" (5.9 M),
    // "ReDreaming Angel" (5.7 M), Ellen EP "Shark's Gotta Bite" (4.2 M), Billy EP "Billy Mode" (4.0 M), Claret EP "Link Up" (3.6 M), Lighter EP
    // "Fearless" (3.5 M), Norma EP "chaos.exe" (3.2 M), Ju Fufu EP (3.1 M), Yuzuha EP "Wonderland Trickery" (2.9 M). Se quitó "モエチャッカファイア"
    // (108 M): es una canción de 弌誠 en su propio canal, no música de ZZZ.
    top: ['GkgtQOlJp0Y', 'R3tZmmiKi0o', 'LCo0KdbVIJM', 'NCzUV95VIEI', 'TU5Bt8MLPjk', 'FaxI5oNATLE', 'AkWvzeXDUxY', '7wMz8mDyHgM', 'cK1ABiGuiG0', 'JNfm_nR4OWo', 'Ln0ilmPqXU0', 't_Ng_b28uxM', 'QBGEahKfeco', 'ftIfHp2h7eg', 'fFU7rj7IoLo'],
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
    // Populares (15 nov 2026, vistas de YouTube con yt-dlp): solo pistas oficiales ("- Topic" del sello). めにしゅき♡ラッシュっしゅ！ (9.8 M),
    // うまぴょい伝説 (8.0 M), BRIGHTEST HEART (8.0 M), Legend-Changer (4.9 M), ∞ (4.6 M), GIRLS' LEGEND U (3.9 M), U.M.A. NEW WORLD!! (3.9 M),
    // トレセン音頭 (3.1 M), 走れウマ娘 (3.0 M), STARTING FORCE (2.9 M), VOLTAGE (2.6 M), ユメヲカケル！ (2.5 M), ウマすぎ！グルメパレード (2.4 M),
    // Glorious Moment！ (2.3 M), LADY G DONNA (2.3 M). Antes la mitad eran vídeos cortos del Winning Concert con 12–96 mil vistas.
    top: ['8ULbYqRtlMQ', 'VFOg6mHtZcA', 'YExL2ilCMLs', 'Kpf2mmyzuMM', 'kuMQureM-kA', 'G7RmGsHxv-Q', 'dPj1yTKbWuM', 'K2MLBGo_su8', '8Rw5tbl5Wfc', '5qFDboChguw', 'ff8cVl9JBLM', 'vIo3GWaAbw8', 'c2EerlVb7Js', 'O44r1_NZ8ZY', 'JF8WNheLQzQ'],
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
    // Populares (15 nov 2026, vistas de YouTube con yt-dlp, canal oficial): fuera versiones de otros artistas, remixes y "BGM Playlist". Target for
    // love (5.6 M), Usagi Flap (1.2 M; solo existe oficial en bucle de 1 h), Echoes of Longing (0.7 M), Unwelcome School Piano Jazz con Mitsukiyo, su
    // compositor (0.7 M), Burning Love (0.6 M, bucle de 1 h), Sparkle Express (0.5 M), Protocol SUPERNOVA (0.4 M), KAGEROU (0.3 M), SUGAR RUSH (0.3 M),
    // The Promise at Sunset (0.2 M), Following Petals (0.2 M), Twinkle☆Magic (0.2 M), To the Shining MiLie (0.1 M), Flower, Wind and You (0.1 M),
    // Unending Moderato (0.1 M).
    top: ['aTU-osotD8k', 'wFvj8P3c9T0', 'AgcbWyKM-Tc', 'iWKXKcGVjxA', '0hPOvejAD0s', 'sOwnhE0Easg', 'Pm4KSlf19pI', 'aQiNBLWvynk', 'xQcjgqtxDuA', 'PxmdydKnvS8', '4Rki7khVcZ0', 'zTX1HSo9JUE', 'F0fRnHg39Ko', '8jP2b6FOuVE', '4iKfJNx-bK4'],
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
  pgr: {
    // Populares (15 nov 2026, vistas de YouTube con yt-dlp): las 50 más vistas de PGR del canal de Vanguard Sound Studio (el estudio de sonido
    // de Kuro), sin las de otros juegos ni tráileres. Antes eran las 15 más recientes, sin mirar vistas. De más a menos vistas:
    // NARWHAL (7.7 M), HIKARI (6.8 M), LAMIA (4.9 M), Last Resort .feat Kinoko蘑菇 (3.4 M), Revelation .feat Kinoko蘑菇 (2.7 M), Under Dimension feat.
    // Kinoko蘑菇 (2.3 M), Dust (2.2 M), Exorcism (1.4 M), In My Memory (1.3 M), Moonlit Occultation (1.2 M), Sie liebten sich beide (1.2 M), 傀儡 曲
    // (1.2 M), To The Limit (1.1 M), Lamia -Another Mode- (1.0 M), Dream With You! (1.0 M), 月 Full Version feat. Mira.Z (972 k), To Our Destiny
    // (901 k), 月 feat. ルナ（CV 釘宮理恵） (888 k), Infinite Gallery ft. Kinoko蘑菇 (812 k), Crossing Eternities (811 k), Evans Gambit (788 k), Endless Path
    // (744 k), 暮日战歌 (684 k), Wraith (669 k), By My Blade (599 k), Interstice Oath (581 k), 风的视线 / 風の視線 (562 k), Industrial Strike (479 k), C.O.R.E
    // (467 k), 【Rabbit J】Dancing tonight feat. 夏铜子【パニシング:グレイレイヴン】Official Lyric Video (421 k), Unknown Territory (407 k), The Last Witness (382
    // k), Abyssal Circuit (349 k), Flame of Hope (349 k), Dreaming to the Glowing Place (321 k), Edenis Full Ver. (321 k), Adversity (291 k),
    // Crank! (275 k), 逆流 (249 k), Paradox (232 k), Echoes from the Abyss (228 k), Stellarira (225 k), Shattered Doll (194 k), 萤灯谣-合唱版 (188 k),
    // NANAMI IKIMASU (174 k), Echo of Fated Petals (167 k), 碧落幽山寺 (162 k), One More Hand (158 k), Cryosphere (114 k), Pieces Of My Past (73 k)
    top: [
      'q2DBeby7ni8', '6wDr3SmdKKs', 'J9IwRWu70NQ', '7GrDuo4bSZ0', '1W6B60hoa_Y', 'fzlQmQ1Eesk', 'ZwZC4vlZTbI', 'J7xiQcrHYGU',
      'b1ivKEyoeQw', 'YCIG3RaPnwA', 'cuOae6-GA-g', 'RHu804DrBZc', 'a545Gv3jGzg', 'hMstZbdlh5g', 'y_uq2jtiqCQ', 'zZFqdB8d_lE',
      'rccBbVZva1A', 'lQnCbzwSMd8', 'jm3UN5B_uwI', 'eTExXK6Je0I', '2rqhqYfgK0w', 'ECNVDsBv3uc', 'EMUgvaWBek4', 'WrBpauaSO8g',
      'PfFYDUTrL30', '5p75uRVuGKI', 'CyhzV00R69w', '2O3nFoVu5cA', 'ktf_HPqTOXM', '-A1BCv-A0xg', 'TlrLzcj8z2c', 'ZqcQrDCg-dw',
      'ReS36EOD71Y', 'HyHNEGNNpAc', 'BNOe9s-nHd4', 'h8F4FEoNAKA', '2y9kpHVTbBA', 'nZgg4-e-pSY', 'iWjjtXdeFhQ', 'k6wm2UDOmUs',
      'SAtnzxtqSmU', 'TeKtgYlvsZM', 'vmSocuyuVhQ', 'bSfF2jxTH8o', 'h8B8_NroMyc', 'nkeVQFaUE38', 'oTqMnZF_LjI', 'eyfwH7LrZho',
      'lMeqPH19iaY', 'I6BSk9_FC5w',
    ],
    // Toda la banda sonora (15 nov 2026): la lista oficial de Vanguard Sound Studio y las recopilaciones más grandes (sin álbumes "- Topic" por
    // lista en YouTube). Todas comprobadas con oEmbed (200). Hay pistas repetidas entre ellas.
    all: { lists: [
      ['PLDW8QP19---Xz0ibnIHw7KUMzlnr6RLh_', 60], // Vanguard Sound Studio (oficial)
      ['PLFrvV0fDHzHYfO34mXwu4G1YdZ3mHWdW2', 287], // OST by Patch Release, crispy_querem
      ['PLFrvV0fDHzHbrKel1wzjC7PrKpYm81bZD', 12], // Original Soundtrack Vol. 3, crispy_querem
      ['PLtkCgVOmjtI-DBwlq2A7HVXQzuCiKUY5a', 182], // OST Playlist, Tamachi
      ['PLtkCgVOmjtI8AuLloQMJUU6uzVxC2znJC', 85], // Battle OST, Tamachi
      ['PLR6PU4jLjdp8jiQPxZaWXZtfYwk9vwaIu', 228], // OST, SG33
      ['PLdhollli_iHSRbYdbCEid026jyjR_ayLQ', 257], // OST, finn .mov
      ['PLzge8wPnyV9AudQgfSo-JGP8fybXo049-', 108], // Soundtrack Collection
    ] },
  },
  fgo: {
    // Vista previa: empieza con 坂本真綾「色彩」, el tema principal del juego (dueño, 16 nov 2026: Prover, la más vista, es de la serie de anime).
    first: 'YqgculuTh2I',
    // Populares (16 nov 2026, vistas de YouTube; dueño: "lo de las series también"): las 50 canciones oficiales de Fate más vistas, de FGO
    // (juego, anime y películas) y de las otras series (UBW, Heaven's Feel, Zero, Apocrypha, Prisma Illya, strange Fake, El-Melloi, EXTRA,
    // Samurai Remnant, stay night 2006), de los canales oficiales de cada artista, del juego, Aniplex/Lantis/NBCUniversal y pistas "- Topic".
    // Sin las de milet (Prover, Tell me): al dueño no le gustan para aquí; siguen en "Todas" (lista de Babylonia). Sin versiones TV, cortos,
    // covers ni AMV. Todas con oEmbed 200. De más a menos vistas:
    // I beg you (37.8 M), oath sign (33.9 M), Last Stardust (33.4 M), 春はゆく (21.7 M), FAKEit (21.0 M), to the beginning (15.3 M), Brave Shine (10.1 M),
    // PROVANT (9.8 M), 英雄 運命の詩 (9.7 M), starlog (7.7 M), 逆光 (7.0 M), MEMORIA (5.8 M), Phantom Joke (5.7 M), 独白 (5.7 M), ideal white (4.5 M),
    // Wonderer (4.3 M), 色彩 (4.3 M), 躍動 (4.2 M), 潜在的なアイ (3.7 M), Désir (3.6 M), kaleidoscope (3.4 M), A stain (3.0 M), 残夜幻想 (2.8 M), 雲雀 (2.6 M),
    // 花の唄 (2.6 M), believe (2.3 M), Echoes (2.1 M), 伍越同舟 (2.1 M), 君が見た夢の物語 (1.8 M), Beyond the Gray Sky (1.7 M), 七星神威 (1.6 M),
    // moving soul (1.6 M), ring your bell (1.6 M), 陸劫輪廻 (1.5 M), disillusion (1.2 M), 時計 (1.1 M), Zettai Majyuu Sensen (1.0 M), ASH (902 k), KOE (814 k),
    // Iron Rose (764 k), 色彩 Solomon Version (658 k), Eiyuu no Shimei (651 k), GRAND BATTLE 3 (647 k), 連星 (575 k), The End (564 k), Proof (525 k),
    // Torrid (504 k), Nisha Senitsu (498 k), Eternity Blue (493 k), Bright Burning Shout (484 k)
    top: [
      'pCC6qbAnX00', 'GJ4yehnerHQ', 'ngm99aJh7ig', 'ekP7VLeXnqY', 'a_iU8YeH944', 'b1bXu0XZDlU', 'VQ2D8rZljwU', '1nyaV4WFddM', 'eaQpo6ogFlc', 'CGz2I_5ikI4',
      'Blb9WbuiazE', 'LnMA-BrpDCg', '3KGjAw0fGX0', 'jECVRY6yS1s', '-P_B2AC5WJM', 'zlbIfu8Ydww', 'YqgculuTh2I', 'xJwrxGy_CpE', 'LeK0WZqC-As', 'JQAl_bQVOBs',
      '-EbdeXPhi6o', 'PizlZiPE8Go', 'QontNYkPRBA', '7L1M7HLcpMw', 'JR8F-Eov418', '-su426eFStM', '2vgTi0Uyldc', '_2fJ8po1mpA', 'Wtzbt4QMuZg', '1vOXcmdahbg',
      'ard8YBNXNkc', 'rwj7GVmMkh0', 'v6vwADf_qzQ', '7XmUcG7kfFw', 'bYZ5w1Cn-mE', 'fpjE6ZZWKTM', '2K0s2jtLroI', 'onIQMPIaS7E', 'Ptoc7mV_AYk', 'nynE3bJbiA4',
      'TUr5tul2SQ4', 'J3QmNkp9s4k', 'pZurW2M2EKg', '8ro7-IZxl7s', '2eQsHib9BjI', '1K_b00mdsws', 'NsrzHogw-7c', '0AxvGrUtKlU', 'Te_FCn4tc5I', 'Teb_7bSNwI0',
    ],
    // Con el tercer botón (18 nov 2026, dueño): "Populares" = solo el juego FGO; la lista de arriba pasa a llamarse "Todo Fate".
    topName: { es: ['Todo Fate', 'Las más vistas de toda la saga Fate'], en: ['All Fate', 'The most viewed songs of the whole Fate series'],
      zh: ['全部Fate', '整个Fate系列观看次数最多的歌曲'] },
    // Solo el juego (18 nov 2026, dueño: "todas ordenadas de mayor a menor vistas, exclusivas del juego"): las 416 pistas oficiales de
    // Fate/Grand Order el JUEGO que hay en YouTube, de más a menos vistas: toda la "Fate/Grand Order Original Soundtrack I–VI" (álbumes oficiales
    // en "Haga Keita - Topic"), los singles de eventos ("Fate/Grand Order - Topic"), las canciones de los anuncios de eventos y capítulos (lista
    // MUSIC del canal 【公式】Fate/Grand Order: solo Lyric/Music Video, sin directos, avances ni anuncios de álbum) y los temas del juego de 坂本真綾
    // (逆光, 色彩, 躍動, 時計). Cada álbum comprobado por su descripción. Fuera el anime y las películas (独白, Phantom Joke y los álbumes de
    // Babylonia/Solomon, Camelot y First Order, aunque salgan en "Fate/Grand Order - Topic"), 残夜幻想 (Fate/Samurai Remnant) y Waltz in the
    // MOONLIGHT/LOSTROOM (otro juego). Sin repetidas: de una canción con vídeo oficial, single y pista de álbum queda la más vista. Las
    // Original Soundtrack VII y VIII no están en YouTube (solo sus avances). Todas con oEmbed 200.
    // Empieza por 逆光 (7.0 M), Wonderer (4.3 M), 色彩 (4.3 M), 躍動 (4.2 M), A stain (3.0 M), Echoes (2.1 M), 伍越同舟 (2.0 M), Beyond the Gray Sky (1.7 M), 七星神威 (1.6 M), 陸劫輪廻 (1.4 M), 時計 (1.1 M), Seirennaru Heretics (818 k)… y acaba en Save Amazones.com! Shop Theme Song (309).
    game: [
      'Blb9WbuiazE', 'zlbIfu8Ydww', 'YqgculuTh2I', 'xJwrxGy_CpE', 'PizlZiPE8Go', '2vgTi0Uyldc', '_2fJ8po1mpA', '1vOXcmdahbg', 'ard8YBNXNkc', '7XmUcG7kfFw',
      'fpjE6ZZWKTM', 'dUM3XwVWbIk', 'nynE3bJbiA4', 'TwVH1vAX8Uw', 'pZurW2M2EKg', '8ro7-IZxl7s', 'snyi_9uwZT0', '2eQsHib9BjI', '1K_b00mdsws', 'NsrzHogw-7c',
      '0AxvGrUtKlU', 'Te_FCn4tc5I', '7TMPpTG5tzU', '6c2NBEoE3m4', 'krblmpF10to', 'YMA1nxTnaLg', 'vsbZbSUM1gA', 's23wpqVvDRw', 'oZ_0rDvP56M', 'z7c3EMbpoRE',
      '9GK8sgVuE48', 'HA6mZSCawus', 'A0yiA5apC6w', '7vyjubFHS18', '8vlDI9j9iNs', '50MIlCFTxKA', 'sHSBseNBs4I', 'x4VL-QvOOO8', 'qP8c3vG88Rg', 'whuNOHBQTTE',
      'LPXSWK4xNww', 'BQMEBl095qM', 'TKnl-uuNxGw', 'Pz05RlmsT5o', 'qXLRKSulqNk', 'vDvCQZ9RDeM', 'ypbaurVSxwQ', 'VdIoEfLRfzw', 'yhRE3U4j1B4', 'xxnaS14ofWU',
      'BUV7YtWs6bU', 'roqqjzUDz6M', '79WCmnBvPbk', 'rDbAD0-a1M0', 'mBgCTeCCvUg', 'ZD2n6msi0D0', 'v06VYmoeC-g', 'ax7-vQXT2qY', 'WkQgvieevZI', 'sJyWTNq_U84',
      't3X23PcA3yA', 'vd-rsahq_5k', 'YyYq_8cXtNE', '3xB7Fw96NQI', 'tbXgLE2fA78', 'HbgbBvzeY6s', 'wzb7URXtuIo', 'xRSY4LuqM7U', 'IyG9R6qLIUs', 'DblkSTiXKy0',
      'hCHWk9ik4c4', 'H3eVjTMxees', 'wxeIslLuBZw', 'VihtFH6HaRg', 'EZx8RO-vXzM', 'moagdej073g', 'RynkE3-Rwvw', '-s4q8ZvO_sE', 'BPcm2Xw_nWw', 'mtOFy9cpzSs',
      'UGxOn12D724', 'iaR9ZQVX3ec', 'JbxE8es_LuI', '7EhYWkonRkk', 'tL-HuqEhCJQ', 'zhCyoOlnPBU', 'vX63NEudjIE', 'KAilkuCMafk', 'zADTfLsW3Yc', 'lsxXMmFFYGM',
      '0g4tnxpvkXo', 'j66x9AS7oe4', 'hDxQUDbkLEE', 'oScj9I0jlWA', 'KTkv8xtuMeQ', 'oCmzOWoNeAI', 'iCFDMVj6asE', 'v1CmIGfIZpo', 'RUv24gnsRng', 'ijKzGiqfHek',
      '6ekcmgfFZGU', 'QQlFQmDbv4Y', 'c_JQbA383zc', '1TdwdL_BRCk', '2CMmz6Yr3pw', 'Dkz-5ovzjl4', 'NqWfXNmtxnc', 'ir5fJiV3eTI', '1kPmWvwQ-bI', 'vimbjQILiPQ',
      'dyIt4dDCoWM', 'M1rfFUCho2o', 'Pjc1fdO7ilI', '9R7PYkeUAR4', 'IS8WW1UAjp8', 'D75Uyj5U5zU', '-rhmD2JO_8E', 'cgqlYiNt5Qc', 'mYaKTg_LqYM', 'CcKpmUDQBW0',
      'NktROXN49Wk', 'z1V6o8YVFIE', 'QhJDnne1YpU', 'ftV2qcgvzmk', 'pJvSaxBYOkw', 'M75luWPeEZY', 'N8zqMgUFO_s', 'jUAoY6dX7GI', '7xQr3WZ056k', 'CGQOga07plE',
      'FoWjQMzqCwc', 'u9J8XthlVvA', '2F54SPGOKhs', '16diM8GLRzg', 'jb5NVd4o6sE', '9Dt3O5jzpR0', '_vQ22GjSI6k', 'jA8x5gcxiuE', 'qU9I3tTI2dk', 'J2Y9XN8quys',
      'rWmJVnTDtxI', '_pLXpBpUNYk', 'wAqKmRM4t-Q', 'e-_lsovMyes', 'LtgMVXrt4s8', 'KilxNCJm_mI', 'YPEaUWT6gPw', 'I3sS0TRpu-U', '4VTk7z83Hqo', '8krTM4cMPM4',
      '0jz6cw7Wrjs', 'maiYw2ZazK4', '6RkDEZ1V3Uo', 'xTTDcG7T5fI', 'RNxEwvBLEvc', 'AF7BjCmxYyw', '7kY8xc67XYI', 'Kxc792bOyyk', 'dOKLQp5jfMc', 'CXkVYw5Nntc',
      'SS0qYOTabxQ', 'yzno3RzRNtI', 'lNw9aD0LRKA', 'b85ud4UFu5A', 'GntJKNAi_BI', '9zjG3gdhksE', '2h-dUWymq74', 'mqm0WDgnRVE', 'esLwqrFmib0', 'e_r8cVqWU6M',
      'LfFMo8WVpO8', '1sLHCbGfi8Y', '8xg3t40PhJs', 'eCSQUhVp3C0', 'YvCruEpHC7M', 'Bw_8sPmlFs0', 'gw8g1KwIfc8', 'VVSJYu97ZT8', 'J1XH9ilbInk', 'dBrsDZ36X4I',
      'jxAFV9mprGQ', '0zBj6BpB-uI', 'mVO2Hur2RqY', 'UN_Dz2dJm2o', 'uMZHJKYEhGM', '5WhEdBGkqqM', 'wBhDqjWyONc', 'Q7Ejd2ScWSo', 'IujuADXHmPs', 'tREzNv4k8zE',
      'f5zTdwfU8Ac', 'DYok59V1HZ4', 'WB73rXaxSs4', 'lGZhVc78FW0', 'FivIHhaOP8Q', '3we32rc0Vq4', 'CzKNXcm0KQc', 'oiG6a1YHUQQ', 'VDknJFFY8Hc', 'sLwlkSQLsQs',
      '4e_2fQHJpBM', 'Nj0movNHLf0', 'sKq2QkiGcAo', '2EySvww-ypA', '5Uw-Rv-iMag', 'PPtVWtJ7hpk', 'dj_GZSW4llE', '3ps0UshFUjE', 'E6qJEgd0hwk', 'tsmmnxy33NU',
      'zLh8acuE5O8', 'JRdyYVuuzBM', 'dPLx7eVICog', 'IG6Kx9SSGjQ', 'nKc8OJKyRJ0', 'PFHuFTvifMw', '7DYpdKRcCYU', 'szPO6PdIlVc', 'ZoFvkvEQXwc', 'YcA6BvOiA0Y',
      '5MfvYfqhJYg', 'jtBSLKgM0U4', 'Juz3wJPn6mo', '-C-PDCtdnuc', 'QUu1F2wLN1E', 'BU8LxyM_E7I', '8zdSY_qQUX0', 'Lu3Bv2J9--s', 'KGobgEtN37E', 'CiAUHWqXKcE',
      'a6m_q-QNYZw', 'xc_hRGoVuzQ', 'GuNl_YbMZiI', '5C-qoD3c4t0', 'u-NQITaUAXg', 'XjUKKHEbjqc', 'VzChiZh96Kc', 'F-_DOn2t3gs', '-SNncJlMtbs', 'm0ADPvJIe44',
      '2_KvOAEmKy0', 'RKtyt2d44ik', 'hgE42J4u1Fw', 'NKNWUTxDzUg', 'XhotRVmZqgM', 'uGVqACSDsiY', 'Bnoi-lpCXPk', 'DbnSUmSa2NQ', 'RBk3o2DqEhY', 'vFptmaa5bmg',
      'IBfSARR0XQY', 'oVbWcFgfucY', '-MgXZd43Jhw', 'EUidCvN4tck', '9swW1zLxntU', 'VAksHkmzJLM', 'eSIlQ4GFcHA', 'zBHeSG3EQcU', '4Ue3-hbhs6g', '3KC3mweWiKs',
      'gxvr9Ae07es', '6JtYyS3Gtl0', 'aCXBR5RaWYQ', 'AqcpBm8CixA', 'O310bKh_xX4', 'Gtk9mlRmM6I', 'VC9FWeDCA4w', 'Ps-VyCZj4u4', 'PXIyXQFSy5Y', 'TNyJb2wRBOI',
      'MM6sSimT7r4', '3YtKd-n4Cco', 'Ju4lE_0xJko', 'pITn1CIjjKg', 'vSM05c28EWQ', 'YUMT1ziO_Xg', 'JyiEKjDIm-I', 'FHvRslejJQg', 'JCN0jB-SqrE', '30MYfZn2R3A',
      'K1qdtWNAIYc', 'ElSveQmh6gE', 'sa5VxthXRpc', '5Ak_iWt4DIs', 'bpa6XaU1sfM', 'N4FeTabnnn4', 'jiTrk470hzY', '2o7SnDk7QUw', 'N5UjMchl96Q', 'eDjR_Fw3GsQ',
      'z7MlskVKunY', '4LNZTLncb3g', 'H5rSzyswMDw', '3s6ASuSeiUM', 'k_N2y5hwO-k', 'iEZB5fKVO4A', '5Kn4jmFWJl4', '8LVZzysscJ0', 'vfB4ecR108k', 'EQc_idhI6nU',
      'Ctz-nkt7Ym8', 'MOnu2Z3MuXk', '0rCmjlwBxN4', 'S6LGqgEyW_I', 'IO_7t4obWLc', 'YczqI8HixDM', 'LI45Jr-iAwc', 'RHWgh5otYE4', 'N0WJkrPX-58', '_P1GkYvC_io',
      't21P25FC56c', 'O-Gv305ZcAo', 'Dc_pIu6Dj28', 'gl8-Zy4NO_E', 'Stg3JVfiiVc', 'I-5ha6iTXao', 'AKT4IG02Z0w', 'QmlZ84UN3I8', 'RO4cIa9WBh4', 'Cb43LmHWf7k',
      'SU1yJKLs5oA', 'WlpePwGbWVg', 'ZutOjSOOXGk', 'FqGnFlw8vUI', '93W3rVdrApk', 'Y8S1n_GmWPo', 'gI_s6Ufjt28', 'wy-U3rWnqok', 'Sz5ZRm_Bb4w', 'wqt2sjjVtRo',
      'UsWkhBfedRc', '6wK1sfxAIMo', 'y75VupiHtAk', 'r3rwFLoo5jE', 'NbasKgGWupI', 'nhzJ7Q5J-q8', 'RUjmdc8v_7U', 'YerpPdO7ado', 'pTVZ5huv9tY', '4qkYtWX7PIo',
      'Hm-dHVv0A84', '6j2m2L-ac88', '-ZZfRQZZbqU', 'Ce_6aBVg_Tk', 'm9TFOgam9hE', 'FaSdR6dlROs', 'seZ10vufz-k', 'o4vUhseehIc', 'T6B2BLBoPBc', 'CnIMFrClSe4',
      '7KJ__-LSQBg', 'oPkiYqDUWoY', 'iEX04WQn3fg', '__BZrYdaiqE', 'QxnwESkCOnA', '8El2ycGj1AE', 'uGd4dURXq8I', 'jBpzmJF_YIw', 'ogXEoANvy6A', '6qXpjkfftLU',
      'qqPup6lzmo0', 'UVRdS7xltmg', 'WOi50ALs6MI', 'wilg48yXEhU', 'lGI-6osX3Yc', 'WU0n95p4wD0', 'Qy9ORDy7W1g', 'wAzqiRsOztg', 'Euy6SZxqOag', 'zpojmuPnonk',
      'fJZeTdZ-UTg', 'Q91GQiTfOuw', '-uVquaQ2KXM', 'oMfB8oXPC04', 'QcU2CXkzEB0', 'dJHmYWb_Lhs', 'GVHQLPIEz2w', 'u5dhy8HI_sg', 'Lt1YIVGIRLI', 'K5g5IRP3_zM',
      'nuZUR5KjM78', 'TiUYEF3M74A', 'wf2MGSaWBes', 'ao3sxb79PXc', 'I_MRWCxhP1U', 'Q_pSOoEpucs', 'mKml7LozIj8', 'L3nlzYzkSMQ', 's_O-LjQCz_4', 'SD7DDA-Dgf0',
      'v0yN9W8ozgc', 'aKLF0obiBnc', '9-lDwP9WDzc', '23Ih6nIZu5M', 'RWMEgoU6Cnw', 'sPU5RXqYxJ8', '1Fzpiwg83fQ', 'UiKd1daq8bA', 'UlxyZ_gSInw', 'JED3bNU2rNs',
      'GzFDIzFyyp0', 'b70JzxH5MIY', '1N1liGdRnc8', 'xGyr7lNdeDo', 'G1nKkaZ7l2I', 'IVOgkeRwU34', 'O8Sftm4YXk8', 'qmctRQ_MJ6M', 'OFDW1LPKLHY', 'sCH5rxh92kw',
      '8AnxPgdkuCs', '9wqNpUUEheo', 'PeakoXsRV28', 'OIqcaUsuCBQ', 'qti5m5DVF_g', 'nNzdMHKgI4U',
    ],
    // Toda la banda sonora (16 nov 2026): los Original Soundtrack I–III oficiales (SonySoundtracksVEVO), los álbumes de las películas y de
    // MOONLIGHT/LOSTROOM y las recopilaciones más grandes (AsK_0, RRahkshi, R2乗). Sin las de BGM "extendida" de 30–60 min. Todas con oEmbed 200.
    // R2乗 (subidas de fans): algunas las reclama Sony Music (SME) y no se dejan ver insertadas ("Video no disponible"); el reproductor salta
    // a otra al dar error. En youtube.com sí se ven (dueño, 16 nov 2026), así que se queda.
    all: { lists: [
      ['PLRW80bBvVD3Xcun1Rakn0g92fvpVOpX8v', 84], // Original Soundtrack I (oficial)
      ['PLRW80bBvVD3US84xtUS5myIrgKz5sSoxm', 61], // Original Soundtrack II (oficial)
      ['PLRW80bBvVD3Xk2E5ShFVI903ItbipPGf0', 54], // Original Soundtrack III (oficial)
      ['PLRW80bBvVD3WPASyNejtAnu57-2LjrphW', 20], // Orchestra Concert Live Album (oficial)
      ['PLdR7m7PFLzQ7Yb6xmmuqEl6FjWTcwhlh_', 596], // OST (Mobile Game), AsK_0
      ['PLdR7m7PFLzQ6rSCVUJIPbrQiZ5jliKvCO', 32], // First Order, AsK_0
      ['PLdR7m7PFLzQ5BDwTBee8GdQGpSTfr9MdG', 61], // Camelot, AsK_0
      ['PLdR7m7PFLzQ6O95Q5xd_B46ActZZPAgUV', 76], // Babylonia, AsK_0
      ['PLdR7m7PFLzQ4hzMcRcgSC-Zye3Jj-HrDE', 33], // Solomon, AsK_0
      ['PLdR7m7PFLzQ4U4GHNAoLya-Yv9MimZv7k', 37], // MOONLIGHT/LOSTROOM, AsK_0
      ['PLFB2DBGahG4G8lJ02rUF5qHmKJWWnwqw-', 308], // Soundtrack, RRahkshi
      ['PLs6wb9uuzu5F2FcpLs0H_pZjfYyrPFLLx', 298], // bgm, R2乗
      // Las otras series de Fate (16 nov 2026, petición del dueño): una lista por obra, oficial (SonySoundtracksVEVO) cuando la hay.
      ['PLBO2h-GzDvIYUuJgpz1pg3JT_4vb-MsiA', 40], // Fate/stay night (anime 2006), NightBunny8
      ['PLr8oeV3cmlKm1pBlnXBN_3nvsg6ZDlSKR', 66], // Fate/stay night (novela visual)
      ['PLdR7m7PFLzQ5-wuAjLy7jRUSDikdUb1pv', 59], // Fate/hollow ataraxia, AsK_0
      ['PLRW80bBvVD3Vwg6Kly83cHCcpDdnDdWqo', 79], // Fate/stay night [Unlimited Blade Works] (oficial)
      ['PLBO2h-GzDvIbNFvxdqkuwh7gEILaYXtcX', 102], // Fate/stay night [Heaven's Feel], NightBunny8
      ['PLRW80bBvVD3XUbLDydHUuQVLs_IhYf_xW', 70], // Fate/Zero (oficial)
      ['PLyHlOhRmggqXhuFPe6v70OZr6E59eQCl_', 62], // Fate/Apocrypha
      ['PLdR7m7PFLzQ5zFwaBQihN2mGTEuKOsU0W', 272], // Fate/kaleid liner Prisma Illya, AsK_0
      ['PLdR7m7PFLzQ4M42FiebXfb6id4R_wXtHl', 34], // Fate/EXTRA, AsK_0
      ['PLRW80bBvVD3Vwt0BGylvTkAEaDq3d5IbP', 54], // Fate/EXTRA CCC (oficial)
      ['PLRW80bBvVD3W4TWY9f_bhvvYu3pMu7emU', 34], // Fate/EXTELLA (oficial)
      ['PLdR7m7PFLzQ4t9zQB2yVaELDbsTImMlo4', 53], // Fate/EXTRA Last Encore, AsK_0
      ['PLRW80bBvVD3W05AkHKQyrqg8556ZBZ5fc', 44], // Lord El-Melloi II's Case Files (oficial)
      ['PLPtvflpTqTN2j7F4jn0xXfuSdLDjFgZpb', 96], // Fate/Samurai Remnant
      ['PLBO2h-GzDvIb_sEfsgTjrzq7_dW34cOrj', 49], // Fate/strange Fake, NightBunny8
    ] },
  },
  persona5x: {
    // Vista previa: empieza con «Ambitions and Visions», el tema de apertura de P5X (también es su canción más vista).
    first: 'djfP0FKXhqw',
    // "Todo P5" (27 nov 2026, dueño: como FGO, una lista del juego y otra de toda la saga): las canciones oficiales más vistas de TODO Persona 5
    // (P5, Royal, Scramble/Strikers, Tactica, Dancing in Starlight y The Phantom X), de "Lyn - Topic" y "ATLUS Sound Team - Topic" (el audio de la
    // distribuidora) y los vídeos de atlustube. Todas con oEmbed 200. De más a menos vistas:
    // Last Surprise (36.5 M), Rivers In the Desert (20.9 M), Take Over (18.7 M), I believe (13.5 M), Wake Up, Get Up, Get Out There (11.1 M),
    // Colors Flying High (10.9 M), The Whims of Fate (7.1 M), Last Surprise -Scramble- (6.3 M), Daredevil (6.2 M), Throw Away Your Mask (5.4 M),
    // No More What Ifs (5.3 M), Ambitions and Visions (4.4 M), Beneath the Mask -rain- (4.0 M), Blooming Villain (3.5 M), Axe to Grind (3.4 M),
    // Will Power (3.2 M), What you wish for (2.2 M), Beneath the Mask -instrumental- (2.2 M), OP de P5X × P3P (1.9 M), Show Stealer (1.6 M), Price (1.6 M),
    // OP de P5X (1.6 M), Life Goes On (1.3 M), Jaldabaoth (1.1 M), Keeper of Lust (931 k), Swear to My Bones (899 k), Our Beginning (899 k), Life Will Change (305 k)
    top: [
      'ZNGqBDRJgvo', 'lvuHvXsZPrk', 'lk8BMgl9vp0', 'LkuyO0cU3tQ', 'azNG-AU0eGg', '5iksTXMTh-8', '69Km895ntNc', 'cS_CPy7YcaA', 'RZB8WMuf2aQ', 'k8z07I1fzbQ',
      'GOTDmQ_gGwI', 'djfP0FKXhqw', 'U2Qd9TRY1Ro', '6aShp3H7xiU', '6XhQfVjlEBY', 'Msq4a0d9rCk', '_g7lIAnLYKI', 'w7Cm74nDhac', 'Pz3Q-DlzGGA', 'AvXAaRMNqww',
      'yG-_Zn648fw', 'rdwRWnYHiNU', 'CgxbVc4SiI4', 'oP-sMzxQbyA', 'QKunUv9-p6U', 'IVOUYIr1V5I', 'C4_GRMYF9HI', '2AWc3DRmj1U',
    ],
    topName: { es: ['Todo P5', 'Las más vistas de toda la saga Persona 5'], en: ['All P5', 'The most viewed songs of the whole Persona 5 series'],
      zh: ['全部P5', '整个女神异闻录5系列观看次数最多的歌曲'] },
    // Solo el juego ("Populares"): P5X casi no tiene pistas oficiales sueltas en YouTube (el tema de apertura, Show Stealer, las tres películas de
    // apertura de atlustube y dos remixes del canal oficial de Occidente). Van ellas y la banda sonora del juego que sube "P5X Archives" (sus listas
    // Original Soundtrack 1–4, sin repetir Ambitions and Visions ni Show Stealer), todo junto de más a menos vistas. Todas con oEmbed 200 (27 nov 2026):
    // Ambitions and Visions (4.4 M), OP de la colaboración con P3P (1.9 M), Show Stealer (1.6 M), OP (1.6 M), OP (Show Stealer ver.) (508 k), Wake Up Your Hero (179 k), Desire Surrender (135 k), Fatal Desire (128 k), Shadow Loop (117 k), Last Strike (116 k), Gone With The Storm (74 k), Wiping All Out -P5X Remix- (65 k), Star Shine (60 k), Colorful Life (56 k), Blooming Villain -X- (53 k), Duel for Real (46 k), Rage Education (43 k), It's Going Down Now -P5X Remix- (40 k), Last Surprise -new year- Extended Ver. (38 k), Crimson Spotlight (23 k), Break the Dawn (17 k), Apertura (14 k), L'Inesorabile (13 k), The Concrete Hive (9 k), 一歩踏み出すうたうたい [A Singer Who Steps Forward] (7 k), The Weight of Blue (7 k), Cerulean Echoes (6 k), Distorsione (5 k), Pheromone Cocoons (5 k), Last Surprise -spring festival- (5 k), Mind Control (5 k), Distorsione -night version- (5 k), Wonder Light (4 k), Fight what I Fear (4 k), Salt Water Youth (4 k), Sandy Shuffle (4 k), The Day We Reel In (3 k), Overtaking!! (3 k), The Last Dambuster (3 k), Ravenbill Requiem (3 k), Étoile en Embrasse (3 k), Narumi Nashimoto - わたし色アイドル [My Color Idol] (3 k), Pheromone Cocoons -intro- (3 k), Frostbloom Vow (3 k), Aria of Soul -remix- (3 k), Self Disguise (3 k), Deep Zone (3 k), Harmonious pulse (3 k), Rule Breaker (3 k), Phantom Dash (3 k), The Grand Finale Unmasked (3 k), Written in the Sea (2 k), Wake Up Your Hero -instrumental version- (2 k), Endless Explore (2 k), Melted Motive (2 k), The Choker's Promise (2 k), Fake Idol (2 k), Blue Ripples (2 k), Broken Arrow (2 k), Shadow Loop -instrumental version- (2 k), Sweet Remedy (2 k), Seize The Light (2 k), Snowlight Serenade (2 k), Whispers of Winter Chimes (2 k), Paradisum (2 k), Action (2 k), Galactic Showdown (2 k), Last Strike -instrumental version- (2 k), Power Glide (2 k), わたし色アイドル [My Color Idol] -instrumental- (2 k), Broken Arrow -another version- (1 k), Fight! Oh! (1 k), Seeker (1 k), Alright -new year- (1 k), Pastorale Poems (1 k), Tipsy Night (1 k), Action -intro- (1 k), Intricate Common (1 k), Dream Angel (1 k), Wonder Light -instrumental version- (1 k), Seize The Light -acoustic version- (1 k), Pastorale Poems -hidden version- (1 k)
    game: [
      'djfP0FKXhqw', 'Pz3Q-DlzGGA', 'AvXAaRMNqww', 'rdwRWnYHiNU', '3jZqqvdpyjs', 'cYv6SimYrlI', 'taS8fKBAZ-c', 'OoMJXFomKDo', 'J_juCCvvYbg', 'oIqu3dq9pUM',
      'thEwurDYrQk', 'an90Uh-VKkc', 'L6-dUimTZlY', '3t6qnmzXkAM', 'm6Co8zZ9S8c', '_Fqkd07i97k', 'v9_-EDcrwQU', 'nLIniuzcdG4', 'WTSz6HqqYf0', 'RtsEGmkkbw0',
      'dwR_XLiHJOI', 'Wvc0LzVy_SQ', 'N2wvmgeB4uA', 'QD2_x2fLXS8', '-bPX6zqS7Vk', '91Ox9q-1OS8', '727KJNwkHjI', 'Ggqw4AghPlI', 'VtHfBq_RrUY', 'FBtJn2AY8Mk',
      'Da1vVgzfC4g', 'zXeq5cWpduk', 'IPSsgYVTj5k', 'v-7WuIRl8uI', '5_3ZD3ON8Cw', 'rylXwBKlFdk', 'ASIPTN6QmqM', 'nyl95Exo4EU', 'sRPXnGukzMw', 'YBBEXhlpOq0',
      'QTEzVd9ulKU', 'OGm0SaqOXAU', '8pRYApnVm-I', 'gpQDJC3d8QI', 'QotiiSUxsqM', 'M0RntbRQGWw', 'K3_zt8D_Rl4', 'v_gCBizLsuE', '8irjxyCggQM', 'JOp9A9U1Nus',
      'wJUJK2ltJv8', 'k1u5CtwqCmU', 'EZpeKAYfvWA', 'eeMu44GsSHs', '0k7n3akNxgc', 'o2dLedPI5gg', 'wkyNtwU3jgA', 'RtAxjlWKoYg', '9zfVjytVkyw', 'uMj2cQR5IcQ',
      'zQzP5GpLZew', 'JTrHRQJVhfI', 'Z5l-zobcPk0', 'dKPQWYUlta8', 'hle2iPttH7g', 'kxEbrFbtGuY', '35m4ciKXtS0', 'y1k4cZuN3-I', '4Zm81QnbJSM', 'RM61QkRIp-o',
      'OeIwyqjBS2E', '_I3BitdPb4k', 'VwJR6csQuTg', 'qrY0P2Mfcbg', 'ldbtkjfSJvY', 'ihl6l9gdgOo', 'fRZe6n5kO4c', 'xqnJJuffEC4', '5l7YrHrw-Zk', 'cImpj9lOcLM',
      'MNWWgNFQ68k', 'MBqY_fumX4o',
    ],
    // Toda la banda sonora (27 nov 2026): P5X (las cuatro Original Soundtrack de "P5X Archives" y la de PSC), Persona 5, Royal (y el álbum de Lyn),
    // Strikers, Tactica y Dancing in Starlight; las recopilaciones más completas de cada uno (sin las de BGM "extendida"). Todas con oEmbed 200.
    all: { lists: [
      ['PL2jG_QMflHmhfTQepaQ60cauMpYNRz3bK', 21], // P5X Original Soundtrack 1, P5X Archives
      ['PL2jG_QMflHmh4nQYHqSJZ_UDxJ71JaZ3e', 16], // P5X Original Soundtrack 2
      ['PL2jG_QMflHmhXvaWU8zwde4tj57XX_hZa', 14], // P5X Original Soundtrack 3
      ['PL2jG_QMflHmgOehY-cuzEEbcOngOxRTmC', 27], // P5X Original Soundtrack 4
      ['PLKnNtzNfg7jf74LoY_5_omAjXcxZh1TiJ', 50], // Persona 5: The Phantom X, PSC
      ['PLvp_vWH_ksPJHslszRcHghgtuTooXP1QX', 113], // Persona 5 OST, Bfr's OST
      ['PLZuZrScKjWOMAEEBEGTmAGtmmlg6QY7bC', 181], // P5, P5R & P5S OST, MCshawarmaUpload
      ['PLdi1k-fvyUmyYF6et3USlTdEb7IaiGccz', 140], // Persona 5 Royal Full OST, Justin
      ['PLlk3cLMic-feskSLcWbE-iW9b2sKmHjXl', 33], // Lyn, Persona 5 Royal: Original Soundtrack (álbum)
      ['PL1Ujbrns4Hh5K3Sv3Oxg_bsCJnEyKASA4', 54], // Persona 5 Strikers OST
      ['PL1Lw0Mpxj4BfckV1s5WRnbMgWbsv_qVz9', 105], // Persona 5 Tactica Original Soundtrack (álbum)
      ['PLKnNtzNfg7je4gaCGnTA-mD4vq7jHoP6W', 23], // Persona 5 Dancing in Starlight, PSC
    ] },
  },
}

/** Skins con reproductor temático compacto (además de ZZZ, que tiene la tele): HSR funda de vinilo, Genshin pergamino, NIKKE el teléfono del
 *  comandante, WuWa el sintonizador de Frecuencia, Arknights ficha de PRTS, Uma entrada del Winning Live, Blue Archive una conversación de MomoTalk,
 *  PGR el reproductor de CD del juego (caja, disco girando y brazo), FGO CHALDEAS (el globo en la esfera armilar, sobre su
 *  plataforma holográfica), Persona 5X el móvil del Ladrón Fantasma (chat de bocadillos recortados). Las que no estén aquí usan la ventanita sencilla. */
const MINI = new Set(['hsr', 'genshin', 'nikke', 'wuwa', 'arknights', 'uma', 'bluearchive', 'pgr', 'fgo', 'persona5x'])

/** Capas de cada aro de CHALDEAS (FGO): más capas = más grosor de canto. */
const FGO_LAYERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

type Mode = 'all' | 'top' | 'game'
const TXT: Record<Lang, { open: string; close: string; title: string; side: string; next: string; all: string; top: string; allShort: string; topShort: string; mode: string }> = {
  es: { open: 'Música oficial del juego', close: 'Cerrar (para la música)', title: 'Banda sonora', side: 'Cambiar de esquina', next: 'Otra canción',
    all: 'Toda la banda sonora, en orden aleatorio', top: 'Las canciones oficiales más vistas', allShort: 'Todas', topShort: 'Populares', mode: 'Qué música suena' },
  en: { open: "Game's official music", close: 'Close (stops the music)', title: 'Soundtrack', side: 'Switch corner', next: 'Another song',
    all: 'The whole soundtrack, shuffled', top: 'The most viewed official songs', allShort: 'All', topShort: 'Popular', mode: 'What plays' },
  zh: { open: '游戏官方音乐', close: '关闭（停止音乐）', title: '原声', side: '切换角落', next: '换一首',
    all: '全部原声，随机播放', top: '观看次数最多的官方歌曲', allShort: '全部原声', topShort: '热门', mode: '播放内容' },
}

/** Iconos del selector (trazo en `currentColor`: toman el color de cada skin). */
const SHUFFLE = <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21" /><path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4C15.1 7.5 16.1 7 17.5 7H21" /><path d="m18 4 3 3-3 3M18 14l3 3-3 3" />
</svg>
/** Saltar a otra canción (▶|). */
const NEXT = <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden><path fill="currentColor" d="M5 5.5v13l9.5-6.5zM16.5 5.5h2.5v13h-2.5z" /></svg>

/** "Todo Fate" (toda la franquicia): dos estrellas. */
const STARS = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path fill="currentColor" d="m8.5 3 1.9 4 4.3.5-3.2 2.9.9 4.3-3.9-2.2-3.9 2.2.9-4.3L2.3 7.5l4.3-.5zM17 11l1.4 2.9 3.1.4-2.3 2.1.6 3.1-2.8-1.6-2.8 1.6.6-3.1-2.3-2.1 3.1-.4z" /></svg>
const STAR = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path fill="currentColor" d="m12 3.2 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z" /></svg>

const SIDE_KEY = 'whengacha:music-side'
const MODE_KEY = 'whengacha:music-mode'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* solo esta visita */ } }

const BASE = 'https://www.youtube-nocookie.com/embed/'
const COMMON = 'autoplay=1&rel=0&playsinline=1&loop=1'

/** Una pista al azar de toda la banda sonora: lista según su tamaño y posición dentro de ella (cada pista pesa lo mismo). */
/** Tamaño real de cada lista, según lo que dice la ventana de YouTube al cargarla (hasta 200). Así las canciones que se añadan a una lista
 *  entran solas, sin tocar los números de `MUSIC` (que solo sirven hasta que se ha cargado la lista una vez). Se recuerda entre visitas. */
const SIZES_KEY = 'whengacha:music-sizes'
const sizes: Record<string, number> = (() => { try { return JSON.parse(read(SIZES_KEY) ?? '{}') ?? {} } catch { return {} } })()
function learnSize(list: string, n: number) {
  if (n > 0 && sizes[list] !== n) { sizes[list] = Math.min(n, 200); write(SIZES_KEY, JSON.stringify(sizes)) }
}

function pickTrack(lists: [string, number][]): { list: string; index: number } {
  const size = (list: string, n: number) => sizes[list] ?? Math.min(n, 200)
  let r = Math.floor(Math.random() * lists.reduce((t, [l, n]) => t + size(l, n), 0))
  for (const [list, n] of lists) { const k = size(list, n); if (r < k) return { list, index: r }; r -= k }
  return { list: lists[0][0], index: 0 }
}

const API = () => `&${COMMON}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
/** URL del reproductor. "Todas": una lista concreta con la API de la ventana (`enablejsapi`); la posición la pone `playVideoAt` al estar
 *  lista (YouTube ignora `index` en la URL). */
/** Vídeos de "Populares" (o de la lista del juego), con `first` delante en la vista previa. */
function idsOf(m: Music, mode: Mode, preview: boolean): string[] {
  const base = mode === 'game' && m.game ? m.game : m.top
  return preview && m.first ? [m.first, ...base.filter(v => v !== m.first)] : base
}
/** La ventana de YouTube solo carga 200 vídeos de `playlist` (comprobado 18 nov 2026: de 416 dice 200). Las listas más largas (FGO, solo el
 *  juego) se reparten en bloques de 200 y, al acabar uno, se carga el siguiente (ver el efecto de "Populares"). */
const CHUNK = 200
function srcOf(m: Music, mode: Mode, list: string | undefined, preview = false, chunk = 0): string {
  if (mode !== 'all') {
    const ids = idsOf(m, mode, preview).slice(chunk * CHUNK, (chunk + 1) * CHUNK)
    return `${BASE}${ids[0]}?playlist=${ids.join(',')}${API()}`
  }
  return list ? `${BASE}videoseries?list=${list}${API()}` : ''
}

/**
 * `preview` (15 nov 2026): vista previa de la skin sin Premium (menú del pincel). El reproductor sale ya abierto y suena la canción más
 * popular ("Populares"), sin el botón ♪ de la cabecera y sin guardar el modo elegido. Suena porque el menú se abrió con un clic.
 */
/**
 * Título que se desplaza (27 nov 2026, dueño): si el texto no cabe en su caja, va y vuelve despacio para leerlo entero (unos 22 px/s, con una
 * pausa en cada extremo). Si cabe, o con "reducir movimiento", se queda quieto (recortado con puntos suspensivos). Se vuelve a medir al
 * cambiar el texto y el tamaño de la caja.
 */
function Marquee({ text }: { text: string }) {
  const box = useRef<HTMLElement>(null)
  const inner = useRef<HTMLElement>(null)
  const [d, setD] = useState(0)
  useLayoutEffect(() => {
    const b = box.current, i = inner.current
    if (!b || !i) return
    const measure = () => setD(Math.max(0, Math.ceil(i.getBoundingClientRect().width - b.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure); ro.observe(b)
    return () => ro.disconnect()
  }, [text])
  const style = d > 2 ? { '--mq': `${-d}px`, '--mq-t': `${(d / 22 + 3).toFixed(1)}s` } as React.CSSProperties : undefined
  // <bdi> y no <span>: las reglas de cada skin para ".tv-slot span" (prefijo, inclinación, recorte) no deben alcanzar al texto que se
  // desplaza; además aísla bien los títulos en japonés o chino.
  return <bdi ref={box} className={`mq${d > 2 ? ' on' : ''}`} style={style}><bdi ref={inner} className="mq-in">{text}</bdi></bdi>
}

export default function SkinMusic({ skin, name, lang, preview = false }: { skin: string; name: string; lang: Lang; preview?: boolean }) {
  const s = TXT[lang] ?? TXT.es
  const [open, setOpen] = useState(preview)
  const [side, setSide] = useState<'left' | 'right'>(() => (read(SIDE_KEY) === 'left' ? 'left' : 'right'))
  const m = MUSIC[skin]
  // Modo guardado (compartido entre skins): "game" solo existe en las que tienen `game`; en las demás, "Populares" (top).
  // La vista previa empieza en "Populares" (la del juego si la hay) y deja cambiar de modo sin guardarlo.
  const [saved, setSaved] = useState<Mode>(() => { if (preview) return 'game'; const r = read(MODE_KEY); return r === 'top' || r === 'game' ? r : 'all' })
  const mode: Mode = saved === 'game' && !m?.game ? 'top' : saved
  const frame = useRef<HTMLIFrameElement>(null)
  // "Todas": la lista que tiene cargada la ventana (cambiarla recarga la ventana) y la pista que se le pide dentro de ella.
  const [list, setList] = useState<string>()
  // Vídeo que suena (15 nov 2026): la ventana de YouTube lo dice en sus mensajes (infoDelivery → videoData.video_id) al empezar cada uno.
  // Lo usa el reproductor de PGR para poner la miniatura del vídeo en el disco que gira (variable --tv-thumb; ver skins.css).
  // También la usa la cinta VHS de ZZZ, que entra una vez por canción. Se acepta un vídeo solo cuando lleva 900 ms sin cambiar: al cargar una
  // lista, YouTube dice primero el vídeo con que empieza la lista y enseguida el que se le pidió (playVideoAt), y eso metía la cinta dos
  // veces y cargaba dos miniaturas seguidas en el disco de PGR (16 nov 2026).
  const [vid, setVid] = useState<string>()
  const [titles, setTitles] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!open) { setVid(undefined); return }
    let pending: string | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let d: { info?: { videoData?: { video_id?: string; title?: string } } } | null = null
      try { d = JSON.parse(e.data) } catch { return }
      const id = d?.info?.videoData?.video_id
      // Título de la canción (27 nov 2026): llega en el mismo videoData, a veces en un mensaje posterior al del id.
      const t = d?.info?.videoData?.title?.trim()
      if (id && t) setTitles(o => (o[id] === t ? o : { ...o, [id]: t }))
      if (!id || !/^[\w-]{11}$/.test(id) || id === pending) return
      pending = id
      clearTimeout(timer)
      timer = setTimeout(() => setVid(id), 900)
    }
    window.addEventListener('message', onMsg)
    return () => { clearTimeout(timer); window.removeEventListener('message', onMsg) }
  }, [open])
  // Bloque de 200 que tiene cargado la ventana en "Populares" (solo cambia en listas de más de 200; ver CHUNK). Vuelve al primero al cambiar de modo.
  const [chunk, setChunk] = useState(0)
  useEffect(() => setChunk(0), [mode, skin])
  const chunks = m && mode !== 'all' ? Math.ceil(idsOf(m, mode, preview).length / CHUNK) : 1
  // "Populares": si una canción no se puede reproducir (bloqueada en el país, retirada…), pasa a la siguiente en vez de quedarse en el error.
  // Con varios bloques: al acabar el último vídeo del bloque, la ventana vuelve sola al primero (loop=1); se nota en que la posición pasa
  // del último al 0, y entonces se carga el bloque siguiente (tras el último, otra vez el primero).
  useEffect(() => {
    if (!open || mode === 'all') return
    let prev: number | undefined
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let d: { event?: string; info?: { playlistIndex?: number; playlist?: string[] } | null } | null = null
      try { d = JSON.parse(e.data) } catch { return }
      if (d?.event === 'onError') frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'nextVideo', args: [] }), '*')
      const idx = typeof d?.info === 'object' ? d?.info?.playlistIndex : undefined
      const len = typeof d?.info === 'object' ? d?.info?.playlist?.length : undefined
      if (chunks > 1 && typeof idx === 'number') {
        if (idx === 0 && prev !== undefined && len && prev === len - 1) setChunk(c => (c + 1) % chunks)
        prev = idx
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [open, mode, chunks])
  const want = useRef(0)
  const skip = useRef<() => void>(undefined) // "Otra canción" en "Todas" (lo pone el efecto de abajo)
  useEffect(() => {
    if (!open || mode !== 'all' || !m) { setList(undefined); return }
    const t = pickTrack(m.all.lists)
    want.current = t.index
    setList(t.list)
  }, [open, mode, m])
  const src = m && open ? srcOf(m, mode, list, preview, chunk) : ''
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])
  // "Todas" (14 nov 2026): al estar lista la ventana, al acabar cada canción (o si una no se puede reproducir, o se pulsa "siguiente") se
  // salta a otra pista al azar de entre TODAS las listas de la skin. Si es de la misma lista, `playVideoAt`; si es de otra, se recarga la
  // ventana con esa lista (`loadPlaylist` con otra lista NO cambia de lista: se queda en la primera y solo mueve la posición; comprobado).
  useEffect(() => {
    if (!open || mode !== 'all' || !m || !list) return
    let started = false
    let last = 0
    let cur: number | undefined // posición que suena ahora (la que pedimos)
    const send = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
    const play = (index: number) => { last = Date.now(); cur = undefined; want.current = index; send('playVideoAt', [index]) }
    const jump = () => {
      if (Date.now() - last < 1500) return // un solo salto por fin de canción (YouTube avisa varias veces)
      const t = pickTrack(m.all.lists)
      if (t.list === list) play(t.index)
      else { last = Date.now(); want.current = t.index; setList(t.list) }
    }
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let d: { event?: string; info?: unknown } | null = null
      try { d = JSON.parse(e.data) } catch { return }
      if (!d) return
      const info = d.info as { playerState?: number; playlistIndex?: number; playlist?: string[] } | number | null | undefined
      // Tamaño real de la lista (la ventana es solo de esta lista): las canciones que se le añadan entran solas en el sorteo.
      const got = typeof info === 'object' ? info?.playlist?.length : undefined
      if (got) { learnSize(list, got); if (want.current >= got) { last = 0; jump(); return } } // la lista encogió: otra pista
      const state = d.event === 'onStateChange' ? info : typeof info === 'object' ? info?.playerState : undefined
      const idx = typeof info === 'object' ? info?.playlistIndex : undefined
      if (!started && (d.event === 'onReady' || state === 1)) { started = true; play(want.current); return }
      // Al acabar una canción, la lista pasa sola a la siguiente (sin avisar de "terminado"): se nota en el cambio de posición.
      if (typeof idx === 'number' && Date.now() - last > 1500) { if (cur !== undefined && idx !== cur) { jump(); return } cur = idx }
      if (state === 0 || d.event === 'onError') jump()
    }
    skip.current = () => { last = 0; jump() }
    window.addEventListener('message', onMsg)
    return () => { skip.current = undefined; window.removeEventListener('message', onMsg) }
  }, [open, mode, m, list])
  if (!m) return null
  // "Otra canción": en "Todas", otra al azar de toda la banda sonora (también desde la última pista cargada, donde el "siguiente" de YouTube
  // no hace nada); en "Populares", la siguiente de la lista.
  const next = () => {
    if (mode === 'all') skip.current?.()
    else frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'nextVideo', args: [] }), '*')
  }
  const flip = () => { const n = side === 'right' ? 'left' : 'right'; setSide(n); write(SIDE_KEY, n) }
  const pick = (n: Mode) => { if (n !== mode) { setSaved(n); if (!preview) write(MODE_KEY, n) } }
  // Opciones del selector: con `game` (FGO) son tres, "Populares" del juego y "Todo Fate" (`top`).
  const modes: Mode[] = m.game ? ['all', 'game', 'top'] : ['all', 'top']
  const icon = (k: Mode) => (k === 'all' ? SHUFFLE : k === 'top' && m.game ? STARS : STAR)
  const label = (k: Mode): [string, string] => k === 'all' ? [s.allShort, s.all]
    : k === 'top' && m.topName ? (m.topName[lang] ?? m.topName.es) : [s.topShort, s.top]
  // La ventana de YouTube pide que le digamos que escuchamos sus eventos para mandar "onReady".
  const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  // Lo que pone el título del aparato: la canción que suena (si YouTube ya la dijo); si no, el nombre del juego.
  const song = (vid && titles[vid]) || name
  const player = <iframe key={`${skin}:${mode}:${mode === 'all' ? list : chunk}`} ref={frame} className="music-frame" src={src} title={`${s.title} · ${name}`} width="200" height="200" onLoad={listen}
    allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
  return (
    <>
      {!preview && <button className={`btn sm lang-btn music-btn ${open ? 'on' : ''}`} onClick={() => setOpen(o => !o)} aria-pressed={open} title={s.open} aria-label={s.open}>
        {/* Nota centrada en su caja (x 6–18, y 3–21) y del tamaño del pincel (18 px), para que los dos botones midan lo mismo. */}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
      </button>}
      {open && (skin === 'zzz' || MINI.has(skin)) && createPortal(
        /* ZZZ (13 nov 2026): el reproductor es la tele CRT de la pantalla de inicio del juego, dibujada solo con CSS. El vídeo va dentro
           de la pantalla a su tamaño (200×200) y sin nada encima (YouTube no deja taparlo): el cristal curvo y el brillo van en el marco.
           A la derecha, las dos ruedas son el selector de modo; abajo, el vídeo (VHS): encendido = cerrar, pantallita = título, ⇄ = esquina.
           Las demás skins de MINI reutilizan este HTML con otra silueta, compacta y sin mueble de tele (skins.css, "Temas compactos"):
           la primera versión les ponía a todas el mismo mueble y acababan pareciendo teles (13 nov 2026). */
        <div className={`music-dock tv ${skin === 'zzz' ? '' : 'tv-mini '}tv-${skin} ${side}${preview ? ' preview' : ''}`} role="region" aria-label={`${s.title} · ${name}`}
          style={vid ? { '--tv-thumb': `url(https://i.ytimg.com/vi/${vid}/hqdefault.jpg)` } as React.CSSProperties : undefined}>
          {skin !== 'zzz' && <span className="tv-deco" aria-hidden />}
          {/* FGO (16 nov 2026): los aros de la esfera armilar de CHALDEAS, con VOLUMEN: cada aro es una pila de capas separadas en
              profundidad (preserve-3d); de frente coinciden y de canto forman una banda gruesa, no una hoja de papel. Solo gira el aro
              (transform), sin repintar. Van detrás del vídeo (skins.css, "Fate/Grand Order"). */}
          {skin === 'fgo' && <i className="fgo-armillary" aria-hidden>
            {[0, 1, 2].map(r => <b key={r} className={`fgo-ring r${r}`}>{FGO_LAYERS.map(k => <s key={k} style={{ '--k': k } as React.CSSProperties} />)}</b>)}
          </i>}
          <div className="tv-set">
            <div className="tv-bezel"><div className="tv-screen">{player}</div></div>
            <div className="tv-side">
              <div className="tv-knobs" role="radiogroup" aria-label={s.mode}>
                {modes.map(k => (
                  <button key={k} role="radio" aria-checked={mode === k} className={`tv-knob ${mode === k ? 'on' : ''}`} onClick={() => pick(k)} title={label(k)[1]}>
                    <i aria-hidden />{icon(k)}<span>{label(k)[0]}</span>
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
            {/* ZZZ (15 nov 2026): al empezar cada canción entra una cinta VHS en la ranura del vídeo y después se enciende el título (la `key`
                con el vídeo que suena repite la animación). Va en el aparato de debajo, nunca encima de la pantalla (YouTube no deja taparla). */}
            <div className="tv-slot" title={`${s.title} · ${song}`}>
              {skin === 'zzz' && vid && <i className="tv-vhs" key={`t:${vid}`} aria-hidden><b className="tv-vhs-top"><b className="tv-vhs-front" /></b></i>}
              <span key={skin === 'zzz' ? `n:${vid ?? ''}` : undefined}><Marquee text={song} /></span>
            </div>
            <button className="tv-eject tv-next" onClick={next} title={s.next} aria-label={s.next}>{NEXT}</button>
            <button className="tv-eject" onClick={flip} title={s.side} aria-label={s.side}>⇄</button>
          </div>
        </div>,
        document.body,
      )}
      {open && skin !== 'zzz' && !MINI.has(skin) && createPortal(
        <div className={`music-dock ${side}${preview ? ' preview' : ''}`} role="region" aria-label={`${s.title} · ${name}`}>
          <div className="music-head">
            <span className="music-title" title={`${s.title} · ${song}`}><b>♪ <Marquee text={song} /></b></span>
            <button className="music-ctl" onClick={next} title={s.next} aria-label={s.next}>{NEXT}</button>
            <button className="music-ctl" onClick={flip} title={s.side} aria-label={s.side}>⇄</button>
            <button className="music-ctl" onClick={() => setOpen(false)} title={s.close} aria-label={s.close}>✕</button>
          </div>
          {/* Selector de modo: dos opciones con texto e icono propio (en el color de la skin), en vez de un solo botón con emoji. */}
          <div className="music-modes" role="radiogroup" aria-label={s.mode}>
            {modes.map(k => (
              <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => pick(k)} title={label(k)[1]}>
                {icon(k)}<span>{label(k)[0]}</span>
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
