# Skins del sitio (prototipo, 9 nov 2026)

Botón con un pincel en la cabecera, al lado del idioma: "Original" o una skin de gacha que cambia **todo** el aspecto
(cabecera, pestañas, botones, filtros, paneles, línea de tiempo, ventana del evento, tipografía, fondo y cursor).

- `skins.ts`: lista de skins (`SKINS`), guardado (`localStorage`, clave `whengacha:skin`) y `data-skin` en `<html>`.
- `SkinPicker.tsx` + `skins.css`: el botón y su menú.
- `wuwa.css`: la skin **Wuthering Waves**. Solo aplica con `<html data-skin="wuwa">`.
- `public/skins/wuwa/`: sus recursos. `btn.png`, `bg.jpg` y `glow.png` son de la web oficial (wutheringwaves.kurogames.com,
  arte de Kuro Games, copiados el 9 nov 2026). `cursor.png` (48 px) y `cursor@2x.png` (96 px) son el cursor del juego, del `Aki.zip`
  del cliente que aportó el dueño (`Content/Aki/Cursor/CursorNor*.png`; los estados Hi y Pre son la misma imagen). Punta en (3, 3).

- `LiveWallpaper.tsx`: fondo animado de la **línea de tiempo** (no sale en "Mis gachas" ni en "Parches"), si la skin tiene `live` en `SKINS`.
  WuWa usa el vídeo de la portada de su web oficial (`public/skins/wuwa/live.mp4`, arte de Kuro Games: sin bandas negras, 960 px, sin audio,
  24 MB → 2,3 MB) y un fotograma fijo (`live.jpg`) para móvil, "ahorro de datos" y "reducir movimiento". Se pausa con la pestaña oculta.
  Para quitar solo el vídeo: borra `live` de la entrada de WuWa en `skins.ts` y los dos archivos.
- En la skin, el color de cada juego (`--c`/`--c2`) se sustituye por el dorado y carbón de WuWa en tarjetas, carriles y barras.

Antes hubo temas ("Negro OLED", "Colores") y opciones de fondo/acento/cursor; se quitaron.

## Solo para quien apoya (códigos de apoyo)

Las skins están bloqueadas (🔒) hasta que se introduce un **código de apoyo** en el menú del pincel. "Original" siempre está disponible.

- **Generar un código** (cuando alguien dona): `npm run donor-code` (o `npm run donor-code -- 5` para cinco) y mandárselo, p. ej. al correo de su donación en PayPal.
- **Clave**: `SUPPORTER_SECRET`, una cadena larga al azar. Tiene que ser **la misma** en `.env.local` (para generar códigos) y en las variables
  del servidor en Botkeep (para comprobarlos). Si cambia, todos los códigos anteriores dejan de valer. Sin ella en el servidor, el desbloqueo responde
  "no se pudo comprobar". Crear una: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- **Anular un código**: su parte central (`WG-<id>-…`) en `SUPPORTER_REVOKED` del servidor (separados por comas).
- Cómo funciona: `server/supporter.mjs` (`POST /api/unlock`, 10 intentos cada 10 min por IP) comprueba la firma HMAC del código; no hay base de
  datos ni se guardan datos de nadie. El navegador recuerda el desbloqueo (`localStorage`, `whengacha:supporter`).
- Es un candado de cortesía: quien sepa de programación podría activar una skin a mano (el CSS y las imágenes de una web siempre se pueden
  descargar). Para un agradecimiento basta.

## Añadir otra skin

1. `public/skins/<id>/` con sus imágenes.
2. `src/skins/<id>.css` con todas las reglas bajo `html[data-skin="<id>"]` (usa `wuwa.css` de modelo) e impórtala en `SkinPicker.tsx`.
3. Una entrada en `SKINS` (`skins.ts`).

## Cómo quitarlas del todo

1. En `src/App.tsx`, borra las dos líneas marcadas con `// skins`: el `import SkinPicker …` y `<SkinPicker … />`.
2. Borra esta carpeta (`src/skins/`) y `public/skins/`.
3. Si también quitas los códigos de apoyo: `server/supporter.mjs` (+ `.d.mts`), `scripts/donor-code.mjs`, el script `donor-code` de `package.json`
   y las líneas de `/api/unlock` en `server/index.mjs` y `vite.config.ts`.
3. `npm run build:prod` y subir `dist/` como siempre.
