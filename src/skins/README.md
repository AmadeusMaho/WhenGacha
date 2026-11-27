# Skins del sitio (prototipo, 9 nov 2026)

Botón con un pincel en la cabecera, al lado del idioma: "Original" o una skin de gacha que cambia **todo** el aspecto
(cabecera, pestañas, botones, filtros, paneles, línea de tiempo, ventana del evento, tipografía, fondo y cursor).

- `skins.ts`: lista de skins (`SKINS`), guardado (`localStorage`, clave `whengacha:skin`) y `data-skin` en `<html>`.
- `SkinPicker.tsx` + `skins.css`: el botón y su menú.
- `SupporterBadge.tsx`: insignia dorada **"Premium"** junto al nombre de la web, solo con el desbloqueo de apoyo (mismo estado que las skins).
  En `App.tsx` va dentro de `.brand`, marcada con `{/* skins */}`.
- `wuwa.css` (2.ª versión, 10 nov 2026): la skin **Wuthering Waves**. Solo aplica con `<html data-skin="wuwa">`. La 1.ª era carbón y
  dorado con las piezas negras de la interfaz antigua; esta sigue la interfaz ACTUAL del juego (capturas del dueño: "Upgraded", formación
  de equipo, Cadena de Resonancia): fondo de noche azul petróleo con niebla dibujado en CSS (estrellas tenues, rombos fantasma y la línea
  de horizonte con brillo), paneles de pizarra translúcida con borde blanco fino, texto blanco y el dorado pálido solo en destellos
  (estrella de cuatro puntas con halo en títulos, pestaña activa, "hoy", eventos en curso y pie), títulos con separador punteado,
  cápsulas de cristal como botones (el principal sigue siendo `ui/btn-main.png`), chip activo blanco con texto oscuro, lo seleccionado
  con contorno blanco, barras de pizarra con el canto de su tipo (banner dorado, evento agua, desafío blanco) y retratos de destacados en
  **arco** como los huecos del equipo. El nombre "WhenGacha" va sin mayúsculas (se confundía con las pestañas). Ya no usa `ui/btn.png`,
  `chip*.png`, `row.png`, `title.png`, `emblem.png` ni `star.png` (se dejan en `public/` por si se vuelve atrás).
- `genshin.css` (prueba): la skin **Genshin Impact**, con el estilo de los menús del juego (barras pizarra, paneles y filas crema con texto
  gris azulado, tarjetas tipo objeto con fondo naranja y franja crema, contadores arena, botón principal amarillo). Fondo animado propio en
  CSS (motas de luz y brillo), sin vídeo. `public/skins/genshin/`: cursor, destello y fondo de ranura, de la carpeta de Drive "UI Assets" que
  aportó el dueño; sin arte de personajes. `bg.webp`: el fondo de los menús del juego (Backgrounds de skowt.cc, asset oficial
  "Non-commercial fan use only"; añadido el 10 nov 2026 por decisión del dueño), oscurecido bajo el brillo y las motas.
- `zzz.css` (prueba, 10 nov 2026): la skin **Zenless Zone Zero**, con el estilo "callejero" de los menús del juego (capturas del dueño):
  paneles negros con borde gris grueso, pestañas en cápsula con la activa amarilla y el borde inclinado, etiquetas oscuras con el texto
  de color (como INQUIRY / POST / INTEL), títulos blancos muy gruesos (".TÍTULO" fuera de los paneles, "- TÍTULO -" dentro), franjas
  diagonales amarillas en el fondo y el amarillo del juego **#FFDD00** (muestreado de sus imágenes).
  - **Fuente**: la del juego, 印品鸿蒙体 (inpin hongmengti, © 上海萌言文化创意有限公司 / 印品字库; de pago para uso comercial), con el
    archivo que aportó el dueño (10 nov 2026). `public/skins/zzz/zzz-font.woff2` es un recorte solo latino (8,9 KB; el original pesa 1,9 MB):
    en el original las tildes, la ñ, «…», «→» y «≈» tienen ancho completo como un carácter chino y se veían separadas («L í nea»), así que
    el recorte les pone el ancho de su letra base. Se regenera con `scripts/skin-font.py` (necesita `pip install fonttools brotli`).
    El chino y lo que no cubre caen en Rubik (Google Fonts). En móvil, la fuente es más ancha: hay un bloque `@media` al final de `zzz.css`.
  - `public/skins/zzz/`: `scene.webp` = viñeta de cómic Scene OVA00_03_03_01 de skowt.cc (fondo, oscurecida) y `live.webp` = IconEmoji01
    (carita en los eventos en curso), assets oficiales marcados "Non-commercial fan use only" (derechos de miHoYo); el dueño decidió usarlos.
    `cursor.png` (32 px) y `cursor@2x.png` (64 px) = el cursor del juego, recortado del `.cur` que aportó el dueño (traía 3×3 copias sobre fondo de cuadros: se tomó una, sin fondo y con contorno oscuro). Punta en (2, 2).
  - Las pegatinas chibi se probaron y se quitaron (no gustaron).
- `hsr.css` (3.ª versión, 10 nov 2026): la skin **Honkai: Star Rail**. La anterior (carbón y dorado) se parecía demasiado a WuWa; esta
  usa la paleta del arte del juego (índigo y violeta, lavanda y celeste de acento, dorado solo para lo destacado) y el motivo de la **vía**:
  galaxia dibujada en CSS como fondo (nebulosas + estrellas que titilan), paneles de cristal esmerilado azulado con marcas de esquina
  (en un `::after`, para no confundir a `skin-contrast.js`), títulos con estrella + vía hasta un nodo, filas como estaciones (punto a la
  izquierda), botón principal crema y dorado con anillo interior, pestaña activa con estrella dorada sobre una vía corta, barras de la
  línea de tiempo índigo con el color del tipo, y fichas de destacados con fondo de rareza dorado, haz diagonal y franja azul noche.
  `public/skins/hsr/`: `star.webp` (Star of Honor), asset oficial de skowt.cc (`bg.webp`, de 1024×442, ya no se usa y se borró)
  marcados "Non-commercial fan use only" (el dueño decidió usarlos); `cursor.png` = el cursor del juego, convertido del `.cur` que aportó el dueño (punta en 4, 4).
  Fuente: la del juego en inglés es **DIN Next** (Monotype, de pago): se usa si el visitante la tiene instalada; si no, **Barlow** (OFL).
- `nikke.css` (prueba, 10 nov 2026, rehecha con capturas del juego: Squad, Outpost Defense, Nikkepedia, Reset Level, lobby): la skin
  **NIKKE**. Paneles y ventanas **claros** (gris muy claro / blanco, texto casi negro) sobre el fondo oscuro; cabeceras en degradado
  azul con el título en blanco ("Outpost Defense": cabecera de cada juego, ventana de apoyo, y el arte del evento se funde en azul bajo
  su título); títulos "| STAGE CLEAR COUNT" (mayúsculas con barra azul); botón principal azul lleno ("Claim") y secundario blanco con
  borde azul ("Wipe Out"); chips oscuros cuadrados con el activo en azul ("ALL / I / II / III"); fichas de destacados y retratos como
  las de Squad (marco azul, franja oscura con el nombre). Azules: `#1aa3f0` para adornos, `#0b72c4` y `#075aa0` donde va texto (≥ 4.5:1).
  Dentro de los paneles claros se redefinen `--text/--muted/--warn/--good/--bad`; las tarjetas de banner (`.bcard`, texto sobre el arte)
  los vuelven a poner claros con clase doble (la regla de paneles incluye `.plist li` y pesa más).
  - **Botones como los del juego** (rehechos el 10 nov 2026; antes eran paneles de cristal que giraban todos y se veían raros):
    pestañas (2.ª versión, 11 nov 2026; la 1.ª, en abanico 3D sobre negro, al dueño le pareció fea) como las de los menús del juego
    ("Reward / Mission" del pase): tira gris clara (`#e3e7eb`, texto `#3d4650`) con una línea azul debajo y la esquina superior derecha
    cortada; la activa, rellena de azul (`#0f77c2` → `#0b67ab`) con trama de puntos (en `::after`, para no aclarar el fondo del texto),
    texto blanco en negrita y su propia esquina cortada; retratos en cuadrado con esquinas cortadas, como las fichas. Botones de la barra = oscuros translúcidos con borde fino (los de
    recursos, correo y menú); Filtros y "Ver todos" = como "CAMPAIGN"; en las ventanas, planos: "Claim" en azul lleno (`#0f77c2`, el azul
    más claro que llega a 4.5:1 con texto blanco; el del juego, `#1fa3f2`, se queda en 2.8:1) y "Wipe Out" blanco con borde azul fino.
    Chips como "I / II / III": gris oscuro, el activo azul.
  - La **línea de tiempo** tiene el marco OSCURO y un poco transparente (62 %, para que se vea el live wallpaper detrás; con el marco claro se veía demasiado blanca) y los eventos como filas blancas; los
    paneles van en gris claro (`#e2e7ed`) con bordes más marcados para que contrasten con las tarjetas blancas.
  - **Fuente**: la del juego, **Futura Condensed Bold** (© Adobe 1987, marca de Neufville; licencia comercial), el `.otf` que aportó el
    dueño, pasado a `public/skins/nikke/nikke-font.woff2` sin recortar (12 KB, ya es solo latina). Lo que no cubre cae en Saira Semi Condensed.
    Sus contornos son CFF sin hinting y en Windows se ven borrosos a tamaño pequeño: desde el 10 nov 2026 va solo en títulos, pestañas,
    cabeceras y cifras; el resto del texto, en Saira Semi Condensed.
  - `public/skins/nikke/` (web oficial nikke-en.com, página Art, © SHIFT UP / Proxima Beta; el dueño decidió usarlos): `bg.webp` /
    `bg-m.webp` = wallpaper "KEEP OUT" (fondo fijo, versión de 960 px en móvil); `live-<n>.mp4` + `live-<n>.webp` = **siete live
    wallpapers** (Sin Editor, Coins in Rush, Phantom Thief vs Detective, Enter Heaven, Absolute, Unbreakable Sphere, Arcane Archive),
    sacados de sus .zip oficiales y pasados a 960 px, 24 fps, sin audio (20–25 MB → 0,2–1,2 MB cada uno; con el ffmpeg de `pip install
    imageio-ffmpeg`). Cada visita a la línea de tiempo muestra el siguiente (se recuerda en `whengacha:live:nikke`; ver `LiveWallpaper.tsx`).
    En desarrollo, el StrictMode de React avanza dos de golpe; en producción, uno.
  - **Retratos de NIKKE** del zip `goddess-of-victory-nikke-icons` que aportó el dueño (149 iconos `si-cXXX` del juego, los cuadrados
    de Squad): uno en cada pestaña con marco azul (`nav-timeline` = `si-c010`, Rapi; `nav-mine` = `si-c012`; `nav-patches` = `si-c013`)
    y el de Rapi junto al título de la ventana de apoyo. El zip solo trae retratos, no piezas de la interfaz.
  - Sin cursor propio (no hay archivo del juego). No se encontró ningún repo con la interfaz extraída del juego.
- `uma.css` (prueba, 10 nov 2026, ajustada con capturas del juego: Menu, Star Unlock, Training): la skin **Umamusume**. Tema **claro**
  con el fondo lila facetado del juego; paneles blancos redondeados con borde lila. Botones = rectángulos blancos con el "labio" gris de
  abajo y texto marrón (Inventory, Profile); principal verde y apoyo rosa con texto blanco; etiquetas de sección ("Trainer", "Other") =
  barra verde con el final en diagonal; cabeceras ("Menu", Parches, ventana de apoyo, menú de skins) = barra verde con texto blanco; lo
  urgente en cápsula rosa ("Closing in 5d"); × roja redonda del juego. El lima (`#7ecc08`) y el rosa (`#ff6194`) del juego no llegan a 4.5:1
  con texto blanco (en el juego lo salva un contorno): donde hay texto, el degradado empieza más oscuro (`#3b8200`, `#c8336c`).
  - **Pestañas como la barra inferior del juego**: baldosa blanca con labio, con la chica de cada una asomando por arriba
    (`nav-timeline` = `utx_ico_home_umamusume_03`, `nav-mine` = `utx_ico_home_umamusume_04` (Oguri Cap), `nav-patches` = `utx_ico_menu_28`
    (Tazuna)); la activa con su color (verde, rosa como "Enhance", azul como "Home"). Sincronizar lleva las flechas naranjas
    (`utx_ico_charachange_00`) y "Apoyar el proyecto" el apretón de manos rosa (`utx_ico_shop_103`).
  - `public/skins/uma/`: del zip "Umamusume UI sprites" que aportó el dueño (1631 PNG extraídos del cliente por un tercero, © Cygames;
    el dueño decidió usarlos): `bg.webp` = `vertical_bg_6001_00000`; `btn-rect` = `utx_btn_s_02_sl`; `btn-pink` = `utx_btn_s_04_sl`;
    `chip` = `utx_btn_toggle_00`; `close` = `utx_btn_close_00`; `hdr-fx` = el enrejado de rombos de `utx_frm_dialog_hdr_00` sacado como capa blanca translúcida (va encima del verde de las barras y cabeceras); `panel-bg` = `utx_frm_underwindow_listbase_00` (fondo de las filas) y los
    iconos de arriba. `cursor.png` (32 px) / `cursor@2x.png` (64 px) = el cursor del juego, convertido del `.cur` que aportó el dueño
    (24 bits con máscara AND; Pillow lo abría sin transparencia, así que se leyó a mano). Punta en (10, 6).
  - Sin fondo animado. Fuente: M PLUS Rounded 1c (Google Fonts, OFL); la del juego (FOT-Rodin) es de pago y no se aportó.
    Texto normal en peso 500 (en 700 se empastaba) y títulos de tarjeta con interlineado 1,34 (se cortaban la g y la y).
  - Las tarjetas de banner (`.bcard`) y la cabecera de "Mis gachas" (`.gcard-hero`) llevan el texto sobre el arte: ahí se vuelve a blanco.
- `arknights.css` (3.ª versión, 13 nov 2026): la skin **Arknights**. El dueño la quiere más trabajada que ninguna y que cambie **todo**;
  la 2.ª (paneles claros) se parecía demasiado a NIKKE. Esta usa piezas REALES de la interfaz, de la extracción del cliente que aportó el
  dueño (`D:\descargas\OOT\Nueva carpeta\export_apk`, atlas `UI_HOME` y `UI_COMMON_DIALOG`; el alfa viene en un `_alpha.png` aparte):
  pestañas y botones = baldosas blancas del menú (`tile-small`) con el icono original de cada una de marca de agua (`ic-missions`,
  `ic-squads`, `ic-base`, `ic-recruit`) y un subtítulo en inglés (TIMELINE, SQUADS…); la activa en azul PRTS `#0a72a6`. Paneles = los
  diálogos del juego (`dlg-darkpanel`, cabeceras sobre `dlg-dark`, lo urgente sobre `dlg-red`, esquina `dlg-head` en la ventana del evento);
  logo dentro del anillo de nivel (`ring`), cinta de advertencia (`hazard`, rayas pasadas a blanco: en el atlas son negras), rótulo
  BREAKING NEWS (`news`) en "Termina en las próximas 72 h", emblema triangular de Rhodes Island (`ri-emblem`) en el margen derecho del
  fondo (oculto con menos de 1720 px, porque quedaba tapado por la línea de tiempo) y ficha de operador con `elite.webp` (de Aceship).
  La interfaz no usa arte de personajes (el atlas trae la silueta del Doctor: no se usa); los personajes van en los fondos (abajo).
  - Recortes del atlas: se limpian los restos de las piezas vecinas (componentes que tocan el borde del recorte y son finos o pequeños);
    sin eso salían líneas sueltas junto a los iconos.
  - **Fuentes del juego** (de la misma extracción, recortes solo latinos): Novecento Wide Bold/Medium (`ak-nove-*.woff2`, rótulos) y
    Bender (`ak-bender*.woff2`, cifras y etiquetas). El Bender grueso no trae tildes: su `@font-face` va con `unicode-range` ASCII.
  - **Efecto giroscopio** (`akTilt.ts`): cada botón/baldosa se inclina levemente según dónde esté el ratón sobre él (pone `--ak-tx/--ak-ty`
    en el propio elemento). `--ak-gyro` se declara en los elementos y no en `<html>`: una variable que usa otras se resuelve donde se declara.
    Solo con ratón, pantallas anchas y sin "reducir movimiento".
  - **Trampa**: las cabeceras de cada juego también son `<header class="gsec-head">` (sticky). Las reglas de la cabecera del sitio van
    con `.app > header`; con `header` a secas se volvían `position: relative` y bajaban 76 px encima del arte (pasó en Parches).
  - **Línea de tiempo** (3.ª vez, 13 nov 2026): sigue la lista de misiones del juego (atlas `UI_MISSION_2.0`): placas gris carbón lisas
    con una línea fina de color abajo (banner amarillo, evento azul, rotatorio gris claro) y la esquina inferior derecha apenas cortada;
    el arte del evento muy apagado y solo a la derecha; secciones solo con texto en Bender y un cuadradito del color del tipo; carriles
    lisos con canto blanco fino; rejilla casi invisible. Se descartaron: la textura de diálogo detrás de los juegos, los rótulos en bloque
    de color (destacaban demasiado), la luz que parpadeaba y las rayas animadas. Títulos de barra en Barlow (Novecento los recortaba).
  - Ronda del 13 nov 2026: sin la cinta de advertencia bajo la cabecera, en los títulos ni en el pie (separadores finos); la etiqueta
    "PRTS // RHODES ISLAND" va en el flujo del `h1` (absoluta se metía bajo la primera pestaña); en móvil el anillo dorado se sustituye por
    un borde amarillo en el propio logo (a 54 px fijos quedaba descentrado). Botones = placa clara con esquina cortada y filo oscuro (sombra
    en `filter`, porque `clip-path` recorta `box-shadow`). **Efecto 3D al pasar el ratón**: inclinación hacia el ratón, `scale(1.04)` y
    sombra al lado contrario (`--ak-drop`); también en las barras de la línea de tiempo (giran menos en Y) y en las tarjetas.
  - **Fondos con personajes** (13 nov 2026, el dueño cambió de idea: ahora SÍ lleva arte): 12 vídeos de MoeWalls en `FONDOS.arknights`
    (elegidos por el dueño; los ultrapanorámicos Mon3tr y Amiya Midnight Blue City, recortados al centro en 16:9 con `crop169` de la app
    de fondos). Como la pantalla principal del juego: el operador detrás, grande, y la interfaz encima en cristal. El vídeo se oscurece
    poco (brillo .68) y una capa fija (`body::after`, sobre el vídeo y bajo el contenido) apaga solo la izquierda, arriba y abajo, con la
    trama de líneas del HUD; la línea de tiempo es cristal oscuro (`rgba(16,17,20,.58)` + desenfoque 7 px) con las barras casi opacas y
    el eje/columna de juegos opacos. Lo que va suelto sobre el vídeo lleva sombra, y "Termina en las próximas 72 h" y el pie, una franja
    de cristal (sobre el fotograma blanco de Kal'tsit se perdían). Todo con `body:has(> .skin-live)`: sin vídeo, la skin sigue igual.
    Contraste revisado también simulando un fotograma claro (fondo del `body` a gris 125 durante la auditoría).
  - **4.ª ronda** (13 nov 2026): el fondo sale en **todas las pestañas** (`liveAllTabs: true` en skins.ts; SkinPicker lo monta siempre y el
    vídeo sigue al cambiar de pestaña). Paneles y tarjetas **sin la textura negra** de los diálogos: cristal carbón translúcido con
    desenfoque (`--ak-glass`), filo de 1 px y el canto blanco + azul; las ventanas, opacas (`--ak-solid`); dentro de un panel (versión
    actual / próxima de Parches) placas lisas sin segundo cristal. Títulos y textos sueltos sobre el vídeo, con franja de cristal. Sin el
    rótulo BREAKING NEWS. **Botones**: todos con la esquina cortada y una línea fina de color siguiendo el corte (`--ak-ln8` / `--ak-ln6`,
    degradado a 315° que empieza donde acaba el corte), filo de 1 px por dentro y foco de teclado por dentro (el `clip-path` se comía el
    contorno); variantes `ghost`/`soft` en cristal, `discord` morado; `.ztag` y `.fold` ya no son redondos.
  - **Giroscopio en móvil** (`akTilt.ts`): con pantalla táctil, `deviceorientation` inclina a la vez baldosas, botones y tarjetas (pone
    `--ak-tx/--ak-ty` y `data-ak-gyro` en `<html>`; CSS en `@media (hover: none)`; sin las barras de la línea de tiempo, por rendimiento).
    El centro es la postura con que se sujeta el móvil y se recalibra despacio. Se escucha siempre; en iPhone el permiso se pide con el
    primer `click` (no se espera la respuesta: Chrome trae `requestPermission` y en escritorio contesta "denied"). Probado con eventos
    simulados en la vista móvil; falta probarlo en un teléfono de verdad.
  - **Marca de sección**: el emblema de Rhodes Island (`ri-emblem`, invertido a blanco con halo azul) en vez del cuadradito blanco.
  - Sin cursor propio.
- **Vista previa de skins** (`SkinPicker.tsx`): cambia al MOVER el ratón por una fila y se quita al salir del menú entero. El menú tiene
  posición fija (medida al abrirlo) y las mismas medidas y fuente con cualquier skin (bloque final de `skins.css`): antes cambiaba de tamaño
  en cada vista previa y saltaba bajo el ratón (parpadeo con ZZZ). Una skin nueva NO debe tocar las medidas del menú, solo sus colores.
- **Fuentes de los juegos** (10 nov 2026, archivos aportados por el dueño; recortes solo latinos con `scripts/skin-font.py`, que también
  arregla los signos de ancho completo):
  - Genshin: **HYWenHei-85W** (`zhcn.ttf` del cliente, © Beijing Hanyi Keyin) → `public/skins/genshin/genshin-font.woff2` (16,7 KB).
  - ZZZ: **印品鸿蒙体** → `public/skins/zzz/zzz-font.woff2` (ver abajo).
  - WuWa: **Sora** (Google Fonts, licencia libre OFL), la más parecida a Cocogoose Pro tras compararlas una al lado de la otra.
    Cocogoose no se usa: el archivo aportado es la versión de prueba de Zetafonts, cuya licencia (dentro del .ttf) prohíbe usarla como
    fuente web, y además trae los números sustituidos por un bloque de relleno.
- `public/skins/wuwa/`: sus recursos. `btn.png`, `bg.jpg` y `glow.png` son de la web oficial (wutheringwaves.kurogames.com,
  arte de Kuro Games, copiados el 9 nov 2026). `cursor.png` (48 px) y `cursor@2x.png` (96 px) son el cursor del juego, del `Aki.zip`
  del cliente que aportó el dueño (`Content/Aki/Cursor/CursorNor*.png`; los estados Hi y Pre son la misma imagen). Punta en (3, 3).
- `public/skins/wuwa/ui/`: piezas de la interfaz del juego, del repo `TomyJan/WutheringWaves-UIResources` (rama 3.7, `UIResources/Common`;
  sin licencia, extraídas del juego por un tercero). `btn`/`btn-hold` = `T_BtnStyleA2Nor/Hold` (botones), `btn-main`/`btn-main-hold` =
  `T_BtnStyleA1Nor/Hold` (botón principal), `chip`/`chip-hold` = `T_BtnStyleCNor/Hold` (chips y filtros), `row` = `T_TogListNor` (filas de
  lista), `title` = `T_ShopTitleBg` (títulos), `star` = `Cursor/T_PcStarB` (destello) y `emblem` = recorte del emblema dorado de
  `Atlas/Button/T_TPI_Common_Button1_UIAtlas`. Se usan con `border-image` en el bloque "Piezas de la interfaz del juego" de `wuwa.css`
  (cortadas dejando una franja central: si se cortan justo por la mitad, el botón muestra una raya horizontal).

- `LiveWallpaper.tsx`: fondo animado de la **línea de tiempo** (no sale en "Mis gachas" ni en "Parches"), si la skin tiene `live` en `SKINS`
  (un vídeo, o una lista: entonces cada visita a la pestaña usa el siguiente).
  WuWa usa el vídeo de la portada de su web oficial (`public/skins/wuwa/live.mp4`, arte de Kuro Games: sin bandas negras, 960 px, sin audio,
  24 MB → 2,3 MB) y un fotograma fijo (`live.jpg`) para móvil, "ahorro de datos" y "reducir movimiento". Se pausa con la pestaña oculta.
  Para quitar solo el vídeo: borra `live` de la entrada de WuWa en `skins.ts` y los dos archivos.
- En la skin, el color de cada juego (`--c`/`--c2`) se sustituye por el dorado y carbón de WuWa en tarjetas, carriles y barras.

Antes hubo temas ("Negro OLED", "Colores") y opciones de fondo/acento/cursor; se quitaron.

## Fondos de la línea de tiempo (rotan en cada visita)

Todas las skins traen una lista de fondos en `live` (`skins.ts`); cada visita a la línea de tiempo muestra el siguiente (se recuerda en
`whengacha:live:<skin>`). Un fondo con `video` se reproduce en bucle; uno con solo `poster` (fondo fijo, `still-*.webp`) hace un
recorrido de cámara suave de 60 s (clase `kb`) y lleva encima la capa `.skin-live-fx` (motas de luz tenues que suben despacio, con el
color de la skin en `--live-fx`), todo en `skins.css`. Antes solo se acercaba un 7 % en 48 s y en producción parecía una imagen quieta
(10 nov 2026); solo NIKKE, con todo vídeos, se veía animada. Hubo también un haz de luz que cruzaba: se quitó por raro.
Con el fondo de la skin puesto se oculta el arte del juego de la vista Cuadrícula (`.wall`): con el fondo semitransparente de Uma se veía
a través (el arte de Lynae de WuWa detrás de Uma). En móvil, "ahorro de datos" o "reducir movimiento", fotograma fijo sin movimiento.
Los marcos de la línea de tiempo son algo transparentes para que se vea el fondo; el eje de meses y la columna de juegos siguen OPACOS
(se quedan fijos al hacer scroll y, transparentes, dejaban ver los eventos por debajo; pasó en NIKKE).

Origen (webs oficiales, 10 nov 2026; arte de cada estudio, el dueño decidió usarlo). Vídeos a 960 px, 24 fps, sin audio; fondos a 1600 px:
- **NIKKE**: 7 live wallpapers de la página Art (ver arriba).
- **WuWa**: `live.mp4` (portada de la web, ya estaba) + `still-kv` (ilustración de la versión) + `still-land` (paisaje) + `bg.jpg`.
  El "bg-wave" de la web es una franja de 1920×180 y no sirve.
- **Genshin**: `live-hour.mp4` (portada de la versión "Hour of Ruin", 3 s) + paisajes de las páginas de región: `still-mond`,
  `still-mond-dusk`, `still-liyue`, `still-inazuma`, `still-sumeru`.
- **ZZZ**: `live-v33.mp4` (portada de la versión 3.3, 13 s) + `still-agents`, `still-shards`, `still-sofa`, `still-party`.
- **HSR**: la portada no tiene vídeo; 4 fondos fijos de la web (`still-v46`, `still-pink`, `still-radio`, `still-pool`). Las tres últimas son imágenes de evento: se les recortó el marco beige que traían (22 px por lado). `still-mech` (el robot) se quitó a petición del dueño.
- **Umamusume**: sin vídeo; `still-kv`, `still-stadium`, `still-race` de umamusume.com. Como es una skin clara, el fondo va aclarado
  (`opacity: .45`) detrás del marco lila.
**Según la versión (automático):** el servidor mira cada 12 h el vídeo/imagen de portada de las webs de Genshin, ZZZ y WuWa
(`server/skin-live.mjs`, `GET /data/skin-live.json`) y `liveFeed.ts` lo pone el primero de la lista si es nuevo (si coincide con uno de
los fondos de la skin, por su campo `official`, no se repite). El vídeo se reproduce desde el CDN oficial y solo si pesa ≤ 12 MB; si no
(WuWa, 23 MB), se usa su imagen de portada como fondo fijo. Si ese fondo falla (el vídeo da error o no arranca en 10 s, o su imagen no carga), `LiveWallpaper.tsx` lo cambia por uno de los de la skin (un vídeo si lo hay). Sin servidor propio no hay fondo de versión. Detalles: `docs/fuentes-y-proxy.md`.
Cuando salga una versión nueva y se quiera su vídeo comprimido en la skin (más ligero), se convierte y se añade a la lista con su `official`.

### Fondos en R2 (11 nov 2026)

**App de fondos (lo más cómodo; solo en el equipo del dueño, no se sube a GitHub: `scripts/fondos/` está en `.git/info/exclude`):**
doble clic en `scripts/fondos/abrir.cmd`, o `node scripts/fondos/server.mjs` → http://localhost:5199 (solo en este
equipo). Muestra los fondos de cada skin (pasando el ratón se ve el vídeo), deja reordenarlos (el orden es el de la rotación) y quitarlos,
y añade uno nuevo en tres pasos: el vídeo (post de MoeWalls, que rellena solo el título y el autor de Steam; archivo del PC; o enlace
directo), convertir (con vista previa y peso) y publicar (sube a R2, copia el póster, lo añade a `FONDOS` y su crédito a `acerca.html`).
"Subir a la web" compila, hace commit de esas rutas y push. Código: `scripts/fondos/server.mjs` (Node, sin dependencias; usa el ffmpeg
de `imageio-ffmpeg` y `npx wrangler`) e `index.html`. Edita solo el bloque `// <fondos>` de `skins.ts` y las líneas `<li data-fondo="…">`
de los créditos; si se tocan a mano, hay que mantener ese formato.

El despliegue tiene un **límite de 20 MB**, así que **ningún vídeo de fondo va en `public/`**: todos se sirven desde **Cloudflare R2**,
bucket `whengacha-fondos` de la cuenta del dueño, servido desde su **dominio propio `https://fondos.whengacha.site`** (`LIVE_CDN` en `skins.ts`, sin `/`
al final; conectado el 27 nov 2026 en R2 → bucket → Configuración → Dominios personalizados, registro CNAME `fondos` creado por Cloudflare). La lista de
qué vídeo va en cada skin es `FONDOS`, en el mismo archivo. Antes se usaba la URL pública `r2.dev`, que tiene un límite de velocidad, no pasa por la
caché y Cloudflare la presenta como algo para pruebas: sigue activa (no la uses en código nuevo). Con el dominio propio los vídeos se cachean en
Cloudflare (`cf-cache-status: HIT`) y no hay coste: R2 no cobra la salida.
- **Copia local de lo que hay en el bucket**: `../fondos-skins/r2/<skin>/live-<n>.mp4` (65 vídeos, ~128 MB). El bucket tiene las mismas
  rutas (`<skin>/live-<n>.mp4`). Los `.webp` (fotograma fijo, ~45 KB) están en `public/skins/<skin>/`, que es de donde se leen
  (póster, fondo con "ahorro de datos" o "reducir movimiento", y reserva si R2 falla; desde el 13 nov 2026 el móvil reproduce el vídeo).
- **Subir un vídeo** (con `npx wrangler login` hecho en este equipo):
  `npx wrangler r2 object put whengacha-fondos/<skin>/live-<n>.mp4 --file <ruta> --content-type video/mp4 --cache-control "public, max-age=31536000, immutable" --remote`
  (sin `--remote`, wrangler 4 lo guarda en local). Como la caché es de un año, un vídeo que cambie lleva **nombre nuevo**.
- **Calidad** (11 nov 2026, el dueño los vio "low res" a 960 px / CRF 29): H.264, 24 fps, sin audio, `-tune animation`, `+faststart`,
  con el ffmpeg de `imageio-ffmpeg`. **NIKKE y ZZZ `live-v33`**, desde los originales (1080p–4K): **1920 px, CRF 26** (~2–5 MB;
  `goninjathief` a CRF 29 por su movimiento). **MoeWalls**: su vista previa ya es de 1280×720, así que **1280 px, CRF 27** (~1–4 MB).
  Más no se puede sin la descarga completa, que pasa por anuncios. Script: `../fondos-skins/trabajo/conv-hq.sh <entrada> <salida-sin-ext> <ancho> <crf>`.
  Los de 960 px quedan en `../fondos-skins/r2-960/`. Los pósters `.webp` siguen a 960 px (se ven poco y cuentan en el límite del deploy). Índice de MoeWalls con su número, título y vista previa: `../fondos-skins/trabajo/moe-indice.json`.
- Qué hay (elegido por el dueño):
  - **NIKKE**: los 24 live wallpapers oficiales de nikke-en.com/art.html.
  - **WuWa** (9), **Genshin** (11), **HSR** (11), **ZZZ** (9): de **MoeWalls** (arte de fans, casi nada oficial; se descartaron los
    que parecían hechos con IA, salvo los que el dueño quiso). Se usa la **vista previa** del post (webm 1280×720, ~15 s, enlace directo
    `/wp-content/uploads/preview/<año>/<slug>-preview.webm`); la descarga a resolución completa pasa por anuncios y no hace falta.
    Al repetirse el bucle puede notarse un pequeño salto.
  - ZZZ conserva `live-v33` (portada oficial de la 3.3, ahora también en R2) y `still-sofa`. **Uma** sigue con sus fondos fijos (el dueño busca vídeos).
  - Los fondos anteriores (paisajes y fijos de WuWa, Genshin, HSR y ZZZ) se quitaron de `public/` y se guardan en `../fondos-skins/antiguos/`.
- **Créditos** (petición del dueño): sección "Créditos de los fondos de las skins" al final de `public/acerca.html` (es/en/zh).
  Salen de `../fondos-skins/trabajo/creditos.json`: el enlace "Source" de cada post de MoeWalls (base64, casi siempre una ficha del
  Steam Workshop) → `GetPublishedFileDetails` de la API de Steam → nombre del creador. Si la descripción nombra al ilustrador
  original, se añade. Sin fuente (Astral Express de HSR, Sumeru de Genshin): "autor no indicado" con enlace a MoeWalls.
  **Todo fondo nuevo de fans lleva su línea ahí.** Ojo: "Bride Furina" (Genshin) lo hizo su autor con ayuda de IA (lo dice en Steam).
- Los vídeos de R2 son "de fuera" para `LiveWallpaper.tsx`: si uno da error o no arranca en 10 s, se queda su póster local como
  fondo fijo que se mueve. Para reproducirlos no hace falta CORS (un `<video>` normal).

## Pestaña "Tiradas" (calculadora, `src/Planner.tsx` + `src/pullPlan.ts`, 10 nov 2026)

Usa las clases de siempre (`.psec`, `.gsec-head`, `.stats`, `.list`, `.progress`, `.seg`, `.pull-list`), así que cada skin la pinta sola.
Lo que hubo que tocar por skin, en un bloque "Pestaña Tiradas" al final de su CSS:
- **Genshin**: total, "~N✦" y "¡Llegas!" en colores oscuros (en el crema no se leían) y el segmento "Que empiece / Que termine" sobre
  la barra pizarra (su texto es blanco).
- **NIKKE** y **Uma**: el total en su color de texto (azul / verde oscuro).
- **Pestaña nueva en la barra**: NIKKE lleva el **Advanced Recruit Voucher** del juego (`nikke/nav-pulls.webp`, icono `5200` de
  static.dotgg.gg, recortado a 96 px; antes, una gema dibujada); Uma, el sticker
  `nav-pulls.webp` = `utx_ico_home_umamusume_06` del zip "Umamusume UI sprites" (la chica con la Carat), activa en naranja.
- En móvil, "Línea de tiempo" se acorta a "Línea" (`.tab-short`, App.css) para que quepan las cuatro pestañas con cualquier skin.

## Chip de servidor en "Mis gachas" (12 nov 2026)

El selector de servidor de cada juego (`ServerChip` en `Views.tsx`, `src/servers.ts`) va al pie de su tarjeta, junto al de códigos, y usa
sus mismas clases (`codes-chip`, `cc-ico`, `cc-txt`, `cc-chev`) más `srv-chip`: así cada skin lo pinta como su chip de códigos sin reglas nuevas.
Es un `<select>` nativo transparente encima del chip (menú del sistema, también en móvil); sus opciones van siempre oscuras sobre blanco.
El chip solo dice el nombre ("Servidor · America"); la zona va en la lista y en el título. Revisado con `skin-contrast.js` en las 7 skins,
escritorio y 375 px: sin avisos. **ZZZ**: con su letra ancha no cabía junto al de códigos; en esa skin el pie es algo más compacto y el
servidor elegido va en amarillo. En móvil, en las skins de letra ancha, los dos chips se apilan.

## Solo para WhenGacha Premium

Las skins (y la insignia) son de **WhenGacha Premium**: se consigue apoyando en Ko-fi (enlazado desde el pincel) y se entra con el correo
(enlace de un solo uso), así que no hay nada que se pueda publicar. "Original" siempre está disponible. Configuración, variables y
gestión (`npm run premium -- add|revoke|check correo`): **`docs/premium.md`**.

- `premium.ts`: sesión (token firmado por el servidor, `whengacha:session`, revalidada cada 12 h), enlace del correo (`?acceso=…`) y configuración del apoyo.
- `SupportDialog.tsx`: ventana de apoyo (pasos y enlace a Ko-fi; el pago y el alta los hace el webhook de Ko-fi).
- Sigue siendo posible activar una skin a mano tocando el código de la web (el CSS y las imágenes siempre se pueden descargar); lo que
  ya no se puede es compartir un acceso.
- Los códigos `WG-…` anteriores ya no existen.

## Añadir otra skin

1. `public/skins/<id>/` con sus imágenes.
2. `src/skins/<id>.css` con todas las reglas bajo `html[data-skin="<id>"]` (usa `wuwa.css` de modelo) e impórtala en `SkinPicker.tsx`.
3. Una entrada en `SKINS` (`skins.ts`).
4. **Revisión de legibilidad (obligatoria antes de subirla)**: ver abajo.

## Regla: toda skin se revisa campo por campo antes de subirla

La hoja base (`App.css`) fija muchos colores claros pensados para el fondo oscuro (`#fff`, `#ddd`, `#ccd`, `#fcd34d`…: nombres de
parches, "Caduca…", `.desc`, `.prec`, `.stars`, `.cur-name`, texto de las barras…). Si la skin pone paneles claros, esos textos
desaparecen aunque se cambien `--text`/`--muted`. Pasó con Genshin (10 nov 2026). Por eso, con la skin puesta:

1. En la consola (con `npm run dev`):
   `eval(await (await fetch('/@fs/C:/Users/PC/Documents/Whengacha/app/scripts/skin-contrast.js')).text()); __skinAudit()`
   (o pega `scripts/skin-contrast.js` en la consola). Devuelve cada texto visible por debajo de **4.5:1** (3:1 si es grande).
2. Pásalo en **todas** las pantallas: Línea de tiempo (vista Líneas y Cuadrícula), Mis gachas (con los códigos desplegados),
   Parches, ventana de un evento, Filtros, menú de idioma, menú de skins, ventana de apoyo; en escritorio **y** en móvil (375 px).
3. El resultado debe quedar vacío, salvo falsos positivos que se revisan a ojo: texto sobre degradado o imagen (marcado `IMG:`,
   p. ej. el botón de donar) y adornos (estrellas, ✦).
4. Además, captura de pantalla de cada vista: el script no ve texto encima del arte (barras de la línea de tiempo, títulos sobre
   imágenes), ni campos/botones del mismo color que su panel (un input crema en un panel crema "no se ve" aunque su texto pase).
5. Nada de `opacity` para apagar texto (barras pasadas, etiquetas): baja el contraste por debajo del mínimo; usa colores o `filter`.

## Regla: los destacados de un banner se ven como en el juego

Cada skin da su propio estilo a los retratos de la ventana del evento (`.featured .portrait`: imagen, nombre y `small` opcional) y a las
cabeceras de sección dentro de los paneles (`.modal-body h3`, etc.), en lugar del círculo y la barra rectangular de la base:

- **Genshin**: ficha de objeto del inventario (fondo naranja de rareza + franja crema con el nombre); la cabecera pizarra se difumina a la derecha.
- **ZZZ**: ficha de agente (borde gris grueso, brillo amarillo, nombre en blanco grueso sobre línea amarilla); la cabecera no lleva bloque: texto centrado entre guiones ("- DESTACADOS -"), como en el juego.
- **WuWa**: ficha de resonador (tarjeta oscura con esquina cortada, brillo dorado desde abajo, franja con línea dorada); la cabecera usa `title.png`, que ya se desvanece.

Una skin nueva debe traer su versión de ambos (bloque "Destacados" de su CSS) y probarse con un banner que tenga retratos
(p. ej. uno de Uma, que desde el 10 nov 2026 los trae de umapyoi.net, o de Genshin/HSR/ZZZ).

## Cómo quitarlas del todo

1. En `src/App.tsx`, borra lo marcado con `// skins` o `{/* skins */}`: los `import` de `SkinPicker` y `SupporterBadge`, `<SkinPicker … />` y `<SupporterBadge />`.
2. Borra esta carpeta (`src/skins/`) y `public/skins/`.
3. Si también quitas Premium: `server/supporter.mjs` (+ `.d.mts`), `server/support/`, `scripts/premium.mjs`, el script `premium` de
   `package.json`, las líneas de `/api/` en `server/index.mjs` y `vite.config.ts`, `docs/premium.md` y el apartado de Premium de `public/privacidad.html`.
4. `npm run build:prod` y subir `dist/` como siempre.

## Música de cada skin (`SkinMusic.tsx`, 13 nov 2026)

Botón 🎵 a la izquierda del pincel (mismo tamaño y línea), solo con una skin puesta. Abre un mini-reproductor flotante de YouTube
(`youtube-nocookie.com`) del mínimo que permite YouTube, 200×200; empieza cerrado y al cerrarlo la música para. Normas de YouTube que obligan a
este diseño: el reproductor tiene que verse mientras suena y no se puede ocultar ni quedarse solo con el audio.

Dos modos (selector "Todas | Populares" bajo el título, con iconos propios en el color de cada skin; se recuerda):

- **Toda la banda sonora** (por defecto; ampliada el 14 nov 2026). `all.lists` de cada skin: listas de YouTube con su número de vídeos, una por
  álbum o versión. Al abrir, y cada vez que acaba una canción (o falla, o se pulsa "siguiente"), suena otra pista al azar de entre todas
  (`pickTrack`: cada pista pesa lo mismo). Si es de la misma lista, `playVideoAt`; si es de otra, se recarga la ventana con esa lista y luego
  `playVideoAt`. **`loadPlaylist` con otra lista no sirve**: la ventana se queda en la primera lista y solo mueve la posición (era el fallo de
  "en HSR solo suenan EP", 14 nov 2026). Al acabar una canción la lista pasa sola a la siguiente sin avisar de "terminado": se detecta por el
  cambio de `playlistIndex`.
  - **Canciones nuevas**: el número de cada lista en `MUSIC` solo vale hasta que se carga; luego manda el tamaño real que da la ventana
    (`learnSize`, guardado en `whengacha:music-sizes`). Así lo que se añada a una lista de menos de 200 entra solo. Los álbumes nuevos que se
    suban como lista aparte hay que añadirlos a mano.
  - **Límite de YouTube**: la ventana solo carga las **200 primeras** de cada lista (comprobado: pedirle la posición 1500 o poner `index=` en la URL
    vuelve a la primera). Por eso la música va repartida en listas pequeñas (las de más de 200 cuentan como 200).
  - Fuentes, por orden de preferencia: listas oficiales del estudio, álbumes de pistas "- Topic" (el audio que YouTube genera de la distribuidora;
    NightBunny8 sube cada álbum como lista: Genshin, HSR, ZZZ, NIKKE, Arknights, aniversarios de Blue Archive), y si no hay, recopilaciones de
    canales alternativos (WuWa: Omen Cat, Gud, yuriwaves; Uma: 荻風 y otras; Blue Archive: MO2, porque su música no está en "- Topic").
  - Pistas alcanzables (suma de las listas, con algunas repetidas entre ellas): Genshin 2148, Arknights 1295, Uma 1213, NIKKE 1199,
    Blue Archive 1015, HSR 895, WuWa 785, ZZZ 583.
  - Para buscar más: `youtube.com/results?search_query=…&sp=EgIQAw%3D%3D` (solo listas). Comprobar que la lista se puede insertar con
    `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=…` (200; 401 = inserción desactivada).
- **Populares**: las 15 subidas oficiales más vistas (13 nov 2026), en `top`.
- **Botón "Otra canción"** (▶|, `.tv-next`, 14 nov 2026): fuera del vídeo, junto al título o a los demás botones según la silueta (área `nx` de
  cada rejilla; lleva también `.tv-eject`, así toma el estilo de botón de cada skin). En "Todas" salta a otra pista al azar de toda la banda
  sonora (también desde la última pista cargada, donde el "siguiente" de YouTube no hace nada); en "Populares", `nextVideo`.
  En Genshin y HSR el título lleva `contain: inline-size` para no ensanchar el aparato (si no, el vídeo quedaba descentrado).

## Fondos animados: en movimiento o estáticos, y bucle sin saltos (13 nov 2026)

- **Selector "Fondos animados: Auto | Siempre | Estáticos"** en el menú de skins (solo con una skin que tenga fondos; `liveMode.ts`, se guarda en
  `whengacha:live-mode`). **Auto** (por defecto) mira la conexión (Network Information API): estáticos con ahorro de datos, datos móviles
  (`type: cellular`) o conexión lenta (2g/3g); si el navegador no informa (Safari/iPhone, Firefox), estáticos en móvil y en movimiento en
  escritorio. "Reducir movimiento" los deja siempre estáticos. Estático = solo el póster (~45 KB), sin descargar el vídeo. Cambia al momento.
- **Bucle con fundido** (`LiveWallpaper.tsx`): muchos fondos no cierran el bucle limpio y al volver a empezar se veía un salto. Hay dos `<video>`
  con el mismo archivo (el segundo sale de la caché) dentro de UN contenedor `.skin-live` (el que atenúa cada skin: con la opacidad en cada vídeo se sumaban las dos capas y el tono cambiaba en cada vuelta); 0,8 s antes del final el otro arranca desde 0 y se funde (máscara `--live-b` en
  `skins.css`, no `opacity`, que ya usa cada skin). Medido: el vídeo estaba entero en memoria y la parada al reiniciar era de 2 ms, así que el
  salto era el corte del propio vídeo, no la red.
- La comprobación "el vídeo de fuera no arranca en 10 s → cambiarlo" se hace una sola vez y solo si nunca llegó a reproducirse (antes se
  reiniciaba en cada redibujado y podía cambiar el fondo por su imagen fija a media reproducción).

## Ronda del 15 nov 2026: PGR, NIKKE, reproductor de WuWa y fondos por pestaña

- **Fondos en todas las pestañas, en todas las skins** (antes solo Arknights y Blue Archive): `SkinPicker` monta `LiveWallpaper` siempre, con la
  pestaña en la `key`, así cada pestaña muestra el siguiente fondo de la lista. Se quitó `liveAllTabs`. Revisado con `skin-contrast.js` en las
  cuatro pestañas: solo quedan avisos de texto sobre imagen (los de siempre). Los fondos nuevos los sube el dueño con Wallpaureka.
- **`pgr.css`** (skin **Punishing: Gray Raven**): carbón y blanco, el rojo de "Punishing" de acento (`#e0303c` en adornos, `#ff6b72` en texto,
  `#c4202c` en botones con texto blanco) y el cian de los escenarios. Pestañas en paralelogramo con un retrato de Gray Raven (Lucia, Lee, Liv,
  Karenina; `rolehead*1` del juego), la activa blanca con la barra roja; títulos con barra roja y el rótulo "// GRAY RAVEN"; paneles de cristal
  carbón con marcas de visor (blanca arriba a la izquierda, roja abajo a la derecha); botones con dos esquinas cortadas, el principal rojo con "›";
  barras de la línea de tiempo con el canto de su tipo (banner rojo, evento cian, desafío blanco); "fallo de señal" rojo/cian al pasar por el nombre.
  - **Recursos** (`public/skins/pgr/`): del explorador público de **assets.huaxu.app** (`/browse/glb/image/…`, la base de datos de Huaxu, ya
    extraída hasta la 4.9). La herramienta que la genera, `pgr-assets` (`huaxu-app/pgr-assets`, la sugirió el dueño), está instalada en
    `../herramientas/pgr-venv` (Python 3.13; su dependencia `pycricodecsex` ya no está en PyPI y se instaló del wheel con el hash de su
    `uv.lock`). Desde la 4.9.1 falla: el `XBuildConfig` trae un texto nuevo ("Release"), arreglado en `../herramientas/pgr.py`, y el índice de
    parches del CDN de Kuro da 404 con la ruta que conoce; hasta que la actualicen, se usa el explorador.
    `barcode.webp` = `logo/commonlogo`; `nav-*.webp` = retratos recortados a 96 px; `bg.webp`/`bg-m.webp` = `bgui/bgfightloading60`;
    `still-login.webp` = `uiloginbg/loginbg` (fondo de las pestañas mientras `FONDOS.pgr` esté vacío).
  - **Reproductor**: el terminal de comunicaciones de Gray Raven (código de barras, "BABYLONIA // COMMS" con un punto que parpadea, medidor de
    señal de LED rojos en la columna derecha). **Música**: lista oficial de Vanguard Sound Studio + recopilaciones grandes (oEmbed 200).
- **NIKKE, pulido**: línea de luz azul bajo la barra superior y en el pie, paneles con canto azul arriba, trama diagonal en la esquina y
  muesca azul abajo a la derecha, cabeceras azules con el rayado de "Claim" (en `::after`), botón principal con destello al pasar, barras con
  relieve y el brillo que corre en las que están en curso, eje de meses azul noche, viñeta sobre el fondo. **Armas** (las miras del juego,
  `icn_weapon_*` de static.dotgg.gg, en `ret-*.webp`): cursor con la mira del AR (la del SR sobre lo que se pulsa), cada clic deja un **impacto
  de bala** que se desvanece en 2,6 s (`nikkeShots.ts`, capa `.nk-shots`), la mira del SR se fija sobre los retratos al pasar el ratón, y los
  títulos de la línea de tiempo llevan la mira de un arma (banners RL, eventos AR, desafíos SR).
- **WuWa, reproductor nuevo**: el sintonizador de **Frecuencia** (`UiFrequency` del repo de TomyJan): placa del carrete de fondo
  (`ui/freq-console.webp`), silueta biselada con una pestaña arriba y el emblema dorado, y la **cinta de frecuencia** (`ui/freq.svg`): nueve
  hebras doradas (#ffe670 del atlas) que ondulan, como el hilo de luz de la frecuencia del Vagabundo en la cinemática de inicio (referencia del
  dueño). El SVG se generó con un script de Node (por hebra, suma de dos ondas viajeras; 12 fotogramas; curvas Catmull-Rom): si se rehace, el
  bucle debe avanzar la fase 2π exactas para que no salte. El dueño pidió que no se salga del aparato.
- **PGR, 2.ª capa** (mismo día, "usa más assets"): Black Card en la pestaña Tiradas (`nav-pulls.webp`, iconcurrency/iconconsumegem; también es
  ahora el icono de la moneda de PGR en la calculadora, `public/icons/pgr-black-card.webp`, en todas las skins); el triángulo "GR" de Gray Raven
  (`gr-emblem.webp`, common/commontaskmbdc sin la barra central) en los títulos y de marca de agua en la cabecera de cada juego; la etiqueta
  "▲ In Event" del juego (`inevent.webp`, common/uibrawbg) en las barras en curso; el destello naranja del reclutamiento (`flare.webp`,
  uichouka/uichoukaguang1) en el botón principal y bajo el título de la ventana del evento; el código de barras en la esquina del arte; el logo
  del Gobierno Mundial (`wg-logo.webp`, uitask/taskicon en blanco) en el pie; franja de código de barras en la esquina de los paneles; "salto de
  señal" del retrato al elegir pestaña y barrido de escaneo rojo al cambiar de pestaña; la línea de "ahora" en rojo.
  La **Jaula del Dolor Fantasma** lleva arte propio en todas las skins: tres tarjetas de jefe del juego (`public/icons/pgr-pain-cage.webp`,
  uifubenbosssingle/bosssingletab53, 54 y 34), solo de ambiente: los jefes de cada semana no se conocen.
- **PGR, 3.ª ronda**: **21 fondos animados** elegidos por el dueño (MoeWalls, WallpaperWaifu, DesktopHut y MotionBGs), publicados con la cola de
  Wallpaureka (`/api/queue/add`, `kind: 'whengacha'`, nombres limpios sin el nombre del juego); los de DesktopHut/MotionBGs desde el original
  4K a 1920 px. Tres pesan 6–8,5 MB (selena-lunar-elegance, bianca, nirvatia): si hace falta, recodificarlos a CRF 28–29 con nombre nuevo.
  **Tarjetas con forma de ficha de PGR** (Mis gachas, cuadrícula, "Termina pronto", próximos, retratos): dos esquinas cortadas (`--pg-cut`),
  filo blanco en el corte de arriba y rojo en el de abajo, franja de rango roja, destello al pasar, cabecera de arte con rayado rojo y código de
  serie. **Cursor**: el `.cur` que aportó el dueño (el cliente no trae cursor), redibujado en vectorial y renderizado a 32/48/64 px.
  **Fuente "Punishing Virus Language"** (aportada por el dueño, `pgr-virus.woff2`): es el alfabeto cifrado del juego, ilegible a propósito; solo
  en rótulos de adorno ("// GRAY RAVEN", código de serie, cabecera del reproductor, inscripción del pie). El texto real sigue en Rajdhani/Barlow
  (la fuente de la interfaz del juego no está en el explorador de Huaxu: `pgr-assets` no extrae fuentes). "Salto de señal" rehecho por fases.
- **PGR, 4.ª capa** ("se parece a las otras skins cuadradas"; capturas del menú principal y de Research que aportó el dueño): pestañas como tiles de
  DOS líneas (título en Barlow Condensed + subtítulo SCHEDULE / MEMBERS / NEWS / RESEARCH, la elegida blanca con subrayado rojo); botones de la
  cabecera como los cuadrados azules "+" de la barra de recursos, inclinados como ella (`skewY(-4deg)`); sincronizar = el reloj con batería; lo
  elegido en blanco con punta de flecha ("Arrival Construct"); botón principal como "Research x1" (losa negra, triángulos grises, filo rojo y
  punta de flecha); texto fantasma gigante "PUNISHING" sobre el fondo. **Descartado**: girar la barra de pestañas en perspectiva como el HUD del
  juego (doblada se veía rara) y la etiqueta azul de coste en el botón principal (quedaba básica).
- **PGR, marco de la línea de tiempo** (solo el marco, no las barras): ventana de operación con dos esquinas cortadas, filo rojo arriba,
  esquina roja abajo, regla de marcas en el borde derecho, rejilla de puntos de HUD y el triángulo GR de marca de agua (`tl-watermark.webp`,
  ya con 13 % de opacidad en el archivo: un fondo no admite opacidad por capa); todo en el fondo del propio `.tl`, que con scroll se queda quieto.
  Placa "SCHEDULE / OPS // GRAY RAVEN" en `.tl-corner` (en móvil, solo el triángulo); meses en Barlow Condensed con corchete y "//" rojos,
  regla de marcas bajo el eje; columna de juegos como fichas de miembro numeradas (número fantasma 01, 02…) con el marco de mira del juego en el
  avatar (`tl-target.webp`, uiareawarstagekuang08); rejilla discontinua, línea de mes roja, rótulos de sección en placa con corte.
- **PGR, reproductor (2.ª versión)**: el reproductor de música del juego (cdplayer/uimusicplayer): la caja del CD (`pl-case.webp`) con el vídeo en
  la bandeja, el disco con la portada de "Crossing Eternities" (`pl-cd.webp`) que sale por la derecha y gira, el brazo del tocadiscos
  (`pl-arm.webp`) que baja y se mece, y el dial en arco (`pl-dial.webp`) con aguja roja. Animaciones con curvas suaves, sin `steps()`.
  Sustituye al terminal con medidor de LED.
  El disco lleva la **miniatura del vídeo que suena** (`--tv-thumb`, de `SkinMusic.tsx`: la ventana de YouTube manda `videoData.video_id` en sus
  mensajes; `i.ytimg.com/vi/<id>/hqdefault.jpg`) con el aro del CD encima (`pl-cd-ring.webp`); si no hay, la portada de "Crossing Eternities".
  El dial ya no tiene aguja (oscilando parecía un metrónomo): sus marcas se encienden en rojo en una franja que lo recorre (máscara con el dial).
  Parte de abajo: compacta, una fila de mandos sobre la base curva (`pl-base.webp`). El dial en arco se quitó a petición del dueño (alargaba el
  reproductor y con los modos redondos al lado parecía una carita feliz); `pl-dial.webp` sigue en public/ por si se recupera.
  Después: modos redondos en la fila de mandos y, en lugar del dial, un pulso rojo que recorre la parte de abajo (línea brillante en el borde
  y halo detrás de los mandos; con la base como máscara no se veía).
- **Fondo propio por pestaña** (`tabLive` en `SkinDef`; `fixed` en `LiveClip` = sin recorrido de cámara ni motas): PGR usa en "Mis gachas" el arte
  de la pantalla de inicio de sesión del juego (`still-login.webp`), quieto; las demás pestañas siguen rotando sus vídeos.
  "Mis gachas" no lleva fondo animado en ninguna skin (`NO_LIVE_TABS` en SkinPicker): se ve el fondo propio de cada una; PGR, su `tabLive`.

## Skin Fate/Grand Order (16 nov 2026)

- **`fgo.css`**: paneles azul noche de cristal facetado con filete dorado y rombos en las esquinas, cabeceras de la ventana del evento como la
  barra blanca con el laurel de Chaldea (`crest-r.webp`, ya desvanecido por la izquierda en el archivo: con la cabecera entera se veía el corte
  donde empezaba la imagen), botones de perla ("決定"), pestañas hexagonales con los rombos del menú principal (編成, マイルーム, 強化, 召喚),
  barras de la línea de tiempo con el dibujo de su carta de comando (banner = Buster, evento = Arts, desafío = Quick, con el logotipo en el
  rótulo de sección), retratos de destacados como carta de servant (marco dorado `frame.webp` con border-image y placa negra con el nombre en
  dorado) y el círculo de invocación girando de marca de agua. Fuentes Cinzel y Noto Sans JP.
- **Recursos** (`public/skins/fgo/`): del Drive de assets de FGO que aportó el dueño (carpetas "User Interface", "Servant Cards" y
  "Background/Chaldea"). `HS.png` de ese Drive es de Hearthstone: no se usa.
- **Fondos**: 22 animados elegidos por el dueño (16 nov 2026; MoeWalls y WallpaperWaifu a 1280 px porque solo dan la vista previa, DesktopHut y
  MotionBGs a 1920), publicados con Wallpaureka. Si `FONDOS.fgo` se vaciara, quedan los fijos de Chaldea (CHALDEAS, Rayshift, pasillo, taller
  de Da Vinci, exterior). "Mis gachas": My Room quieta (`tabLive`). La vista previa empieza con 「色彩」 (`first` en `MUSIC.fgo`).
- El planeta del reproductor gira despacio (`.tv-side::before`, 90 s, solo transform). Aros con volumen: 11 capas 3D por aro (5 en móvil, menos memoria gráfica).
- **Reproductor** (`.tv-fgo` en skins.css; 2.ª versión, la 1.ª era una carta de Craft Essence y "se veía muy rara"): CHALDEAS, redondo y
  siempre azul. El aparato es el globo (esfera azul con meridianos y paralelos de luz) con el vídeo inscrito como ventana cuadrada: no se
  recorta en círculo (YouTube no deja tapar ni recortar el vídeo), por eso el globo mide su diagonal (`--g`: 290 px, 284 en móvil). Alrededor,
  tres anillos gruesos de metal (bandas de 11–13 px con brillo metálico y, detrás, su canto oscuro desfasado para que de canto tengan grosor)
  giran DETRÁS del vídeo; debajo, un pedestal pequeño con el título y los mandos de cristal holográfico (22×20 px) (el modo elegido se enciende en cian). Se probaron y se quitaron, porque no gustaron: el modo rojo con
  "Populares", una animación de invocación al empezar cada canción y una cúpula con las paredes de franjas de la sala detrás. Música (17 nov 2026): "Populares" son las 50 canciones oficiales más vistas de TODO Fate (FGO juego/anime/películas y las otras
  series: UBW, Heaven's Feel, Zero, Apocrypha, Prisma Illya, strange Fake, El-Melloi…), sin las dos de milet (al dueño no le gustan ahí; siguen
  en "Todas"). "Todas": la banda sonora de FGO (OST I–III, orquesta, recopilaciones) y una lista por cada otra serie de Fate.
- Revisada con `skin-contrast.js` en las cuatro pestañas, Cuadrícula, ventana del evento y menú de skins, escritorio y 375 px: sin avisos
  (salvo los juegos "wip" desactivados de la base y la cabecera blanca, que el script marca como imagen).

## Skin Persona 5: The Phantom X (27 nov 2026)

- **`persona5x.css`**: el estilo de los menús de Persona 5. Rojo puro, negro y blanco (rojo de adorno `#e5202e`, `#d41420` con texto blanco = 5,4:1,
  `#ff4d58` como texto sobre negro = 6,4:1). Pestañas y botones como bloques inclinados (`skewX(-9deg)`) con filo blanco; lo elegido, rojo con la
  sombra negra desplazada y un poco girado; paneles negros con filo blanco y la sombra ROJA desplazada; títulos en Anton con una estrella roja y
  un tajo rojo; el nombre de la web con la primera letra recortada (`::first-letter`); la insignia Premium como un recorte blanco girado (solo
  color y giro: en móvil no se tocan sus medidas ni las de la marca, que `sobrio.css` deja en una fila de 94 px). Fuentes Anton y Archivo (OFL).
- **Destacados**: retrato en un estallido recortado (clip-path de 16 puntas) sobre rojo con trama de semitono, con un filo blanco detrás y el
  nombre en un recorte blanco girado; cada ficha se inclina a un lado. **Cabeceras de la ventana del evento**: cinta roja inclinada con sombra negra.
- **Recursos** (`public/skins/persona5x/`): de la web oficial persona5x.com y su **Fan Kit** (fondo de estrellas, placa roja rasgada, iconos
  redondos de personajes, seis fondos de pantalla como fondos fijos de las pestañas mientras `FONDOS.persona5x` esté vacío; el dueño decidió
  usarlos). Spriters Resource tiene la interfaz extraída de P5 pero pide verificación anti-bots: no se usó. Los rótulos en letras recortadas
  (`rn-*.webp`: TAKE YOUR TIME, SCHEDULE, STEAL YOUR HEART) son propios, hechos con un script de Pillow y fuentes de Windows (cada letra en su
  recorte, con otra fuente, girada y con sombra).
- **Reproductor** (`.tv-persona5x` en skins.css; 2.ª versión el mismo día, con capturas de P5 del dueño): la app de mensajería **IM** del juego
  sujeta por una mano. Móvil inclinado de pantalla roja con marco blanco grueso, logo IM (CSS), el título como mensaje recibido (bocadillo negro
  con el avatar de Lufel en su recuadro amarillo), el vídeo recto y sin nada encima, y los modos como la respuesta (tira blanca con la opción
  elegida en rojo). La mano (`hand-l.webp`, el pulgar por el canto izquierdo) está recortada de la captura del dueño, con la punta en pico; los dedos de la
  derecha se probaron y se quitaron (no combinaban). Medido: ni la mano ni su filo blanco tocan el vídeo (escritorio y 375 px). En móvil, todo lo de alrededor más pequeño.
  **Música**: como FGO, tres modos: Todas (banda sonora de P5X, P5, Royal, Strikers, Tactica y Dancing), Populares (solo P5X: sus pocas pistas
  oficiales sueltas y la OST que sube "P5X Archives", de más a menos vistas) y "Todo P5" (lo más visto de toda la saga, de los "- Topic" oficiales).
- **CHALDEAS en móvil** (mismo día, "un poco grande"): el globo no puede bajar de 284 px (la diagonal del vídeo), así que el título sube al
  casquete inferior del globo, los mandos quedan pegados debajo y el aro ecuatorial sobresale menos: ~40 px menos de alto.
- Revisada con `skin-contrast.js` en las cuatro pestañas (Línea y Cuadrícula), ventana del evento, menú de skins, reproductor, escritorio y 375 px:
  sin avisos. **Pendiente del dueño**: los fondos animados (Wallpaureka ya tiene el id `persona5x`).

## Título de la canción en los reproductores (27 nov 2026)

- Todos los reproductores muestran en su título la **canción que suena** en vez del nombre del juego: la ventana de YouTube la manda en sus
  mensajes (`infoDelivery` → `videoData.title`, junto al `video_id` que ya se usaba). Mientras no llega, sale el nombre de la skin (o su `short`).
- Si no cabe, el texto **va y vuelve despacio** (`Marquee` en `SkinMusic.tsx`, ~22 px/s con pausa en cada extremo; `.mq` en `skins.css`); con
  "reducir movimiento" se queda quieto con puntos suspensivos. Va en `<bdi>`, no en `<span>`: las reglas de cada skin para `.tv-slot span`
  (prefijos como "CHALDEAS · ", inclinaciones, recortes) no deben alcanzarlo. `.tv-slot` lleva `contain: inline-size` para que un título largo no
  ensanche el aparato (pasó: el de Persona llegó a 359 px).

## Nombre de la web e insignia Premium por skin (27 nov 2026)

Cada skin le da a "WhenGacha" un rasgo del logo de su juego y a la insignia Premium la forma de una pieza de su interfaz (bloque final de cada
CSS, "Nombre de la web e insignia Premium"). Los adornos van en `::before`/`::after` con posición absoluta y no ocupan sitio: en móvil no se
tocan tamaños ni rellenos (la cabecera sigue en una fila; comprobado en las 11 skins a 375 px).
- WuWa: degradado blanco a dorado y la **frecuencia** bajo el nombre (la cinta dorada animada del reproductor, `ui/freq.svg`); insignia de cristal con filo dorado y puntas.
- Genshin: degradado crema a dorado con contorno oscuro y el destello de cuatro puntas sobre la W; insignia crema con filete dorado.
- ZZZ: inclinado, con sombra amarilla y la cinta de rayas amarillas y negras debajo; insignia amarilla inclinada.
- HSR: degradado blanco, lavanda y dorado y el **Expreso Astral** sobre la vía bajo el nombre (SVG propio con su silueta: locomotora aerodinámica
  negra azulada con remates dorados, foco con haz, proa en punta y aletas; vuela, sin ruedas); insignia azul noche con filete dorado.
- NIKKE: en cursiva, con la raya azul y la mira del AR sobre la W; insignia azul "Claim" con la esquina cortada.
- Uma: rosa con contorno blanco y sombra verde, como su logo; insignia en cápsula rosa.
- Arknights: ya tenía el anillo y "PRTS // RHODES ISLAND"; insignia amarilla de PRTS.
- Blue Archive: degradado azul en cursiva con el halo flotando encima; insignia azul inclinada.
- PGR: separación roja y cian tenue y "// WHENGACHA" en la lengua del Punishing (solo escritorio); insignia carbón con franja roja.
- FGO: dorado en Cinzel con el doble filete y el rombo de Chaldea; insignia azul noche con filete dorado.
- Persona 5X: Anton con la primera letra recortada (nota de rescate); insignia como recorte blanco girado.
`skin-contrast.js` entiende ahora el texto con degradado (`background-clip: text`): mide el tono del degradado con menos contraste contra el
fondo real (antes tomaba el degradado como fondo y daba 1:1).
