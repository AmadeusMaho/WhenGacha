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
bucket `whengacha-fondos` de la cuenta del dueño, con su URL pública `r2.dev` (`LIVE_CDN` en `skins.ts`, sin `/` al final). La lista de qué vídeo va en cada skin es `FONDOS`, en el mismo archivo.
`r2.dev` tiene un límite de velocidad y Cloudflare lo presenta como algo para pruebas; si hace falta, se conecta un dominio propio al bucket
(exige pasar los DNS del dominio de Namecheap a Cloudflare) y solo cambia `LIVE_CDN`.
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

Dos modos (selector "Todas | Populares" bajo el título, con iconos propios en el color de cada skin; se recuerda): **toda la banda sonora** (por defecto), una lista OFICIAL del juego barajada al abrir
(la API de la ventana: `setShuffle` + `playVideoAt` al azar), que mantiene el propio estudio, así que lo nuevo entra solo; y **populares**, las 15
subidas oficiales más vistas (13 nov 2026; antes eran 4). Wuthering Waves no tiene lista oficial: usa sus 20 pistas más vistas de "Wuthering Waves - Topic".
Para cambiar la música de una skin, su entrada de `MUSIC`: `list` (id "PL…" de una lista oficial) o `ids` (vídeos sueltos). Comprobación de
que es oficial y se puede incrustar: `https://www.youtube.com/oembed?url=…` (200 con el canal; 401 si la inserción está desactivada).
