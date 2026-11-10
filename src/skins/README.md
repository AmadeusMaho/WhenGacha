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
    pestañas como la barra inferior del lobby (NIKKE · SQUAD · HALL…): sin caja, mayúsculas claras separadas por una línea fina, y la
    activa en blanco con la línea brillante arriba y un resplandor, como "HALL"; los retratos de las inactivas van apagados. Es lo único
    que gira en 3D, muy suave (`perspective(600px)`, 8°, en abanico). Botones de la barra = oscuros translúcidos con borde fino (los de
    recursos, correo y menú); Filtros y "Ver todos" = como "CAMPAIGN"; en las ventanas, planos: "Claim" en azul lleno (`#0f77c2`, el azul
    más claro que llega a 4.5:1 con texto blanco; el del juego, `#1fa3f2`, se queda en 2.8:1) y "Wipe Out" blanco con borde azul fino.
    Chips como "I / II / III": gris oscuro, el activo azul.
  - La **línea de tiempo** tiene el marco OSCURO y un poco transparente (62 %, para que se vea el live wallpaper detrás; con el marco claro se veía demasiado blanca) y los eventos como filas blancas; los
    paneles van en gris claro (`#e2e7ed`) con bordes más marcados para que contrasten con las tarjetas blancas.
  - **Fuente**: la del juego, **Futura Condensed Bold** (© Adobe 1987, marca de Neufville; licencia comercial), el `.otf` que aportó el
    dueño, pasado a `public/skins/nikke/nikke-font.woff2` sin recortar (12 KB, ya es solo latina). Lo que no cubre cae en Saira Semi Condensed.
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
  - Las tarjetas de banner (`.bcard`) y la cabecera de "Mis gachas" (`.gcard-hero`) llevan el texto sobre el arte: ahí se vuelve a blanco.
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

## Pestaña "Tiradas" (calculadora, `src/Planner.tsx` + `src/pullPlan.ts`, 10 nov 2026)

Usa las clases de siempre (`.psec`, `.gsec-head`, `.stats`, `.list`, `.progress`, `.seg`, `.pull-list`), así que cada skin la pinta sola.
Lo que hubo que tocar por skin, en un bloque "Pestaña Tiradas" al final de su CSS:
- **Genshin**: total, "~N✦" y "¡Llegas!" en colores oscuros (en el crema no se leían) y el segmento "Que empiece / Que termine" sobre
  la barra pizarra (su texto es blanco).
- **NIKKE** y **Uma**: el total en su color de texto (azul / verde oscuro).
- **Pestaña nueva en la barra**: NIKKE lleva una gema blanca dibujada (el zip de retratos ya no está en el equipo); Uma, el sticker
  `nav-pulls.webp` = `utx_ico_home_umamusume_06` del zip "Umamusume UI sprites" (la chica con la Carat), activa en naranja.
- En móvil, "Línea de tiempo" se acorta a "Línea" (`.tab-short`, App.css) para que quepan las cuatro pestañas con cualquier skin.

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
