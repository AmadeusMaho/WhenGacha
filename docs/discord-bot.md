# Bot de Discord: anuncios oficiales de Stella Sora y Blue Archive Global

Las webs de Yostar (Stella Sora) y Nexon (Blue Archive) prohíben los robots. Sus anuncios también se publican en los canales de anuncios de sus servidores
oficiales de Discord, y Discord permite **"Seguir"** un canal de anuncios: cada mensaje oficial se copia solo en un canal de tu propio servidor. Un bot
nuestro lee ese canal. Es lo que hace gachafocus (sus enlaces "source" apuntan a su servidor de Discord).

El código ya está hecho (`src/sources/discord.ts`, fuente `discord` en `server/proxy.mjs`) y **no hace nada** hasta que existan las dos variables de abajo.

## Configuración única (la hace una persona; ~10 min)

Discord no deja que un bot entre en servidores ajenos ni que pulse "Seguir": esta parte necesita una cuenta de Discord.

1. **Servidor propio**: en Discord, "+" → "Crear mi propio servidor" (p. ej. *WhenGacha feeds*). Crea un canal de texto por juego: `#stellasora` y `#bluearchive`.
2. **Seguir los anuncios oficiales**: entra en el servidor oficial de cada juego (Stella Sora: el enlace de Discord de stellasora.global; Blue Archive Global:
   discord.com/invite/bluearchiveglobal), abre su canal de anuncios (el icono de megáfono) y pulsa **"Seguir"** → elige tu servidor y el canal del juego.
   Si hay varios canales de anuncios (noticias, eventos, mantenimiento), síguelos todos hacia el mismo canal.
3. **Bot**: en https://discord.com/developers/applications → "New Application" → pestaña **Bot** → "Reset Token" y copia el token.
   En la misma pestaña activa **Message Content Intent** (sin él, los mensajes llegan vacíos).
4. **Invitar el bot a tu servidor**: pestaña **OAuth2 → URL Generator** → scope `bot` → permisos *View Channels* y *Read Message History* → abre la URL y elige tu servidor.
5. **IDs de canal**: en Discord, Ajustes → Avanzado → *Modo desarrollador*. Clic derecho en cada canal → "Copiar ID del canal".
6. **Variables del servidor** (en Botkeep, y en el equipo que ejecute `snapshot:publish` si quieres que también las use; **nunca** en el repositorio):
   ```
   DISCORD_TOKEN=<token del paso 3>
   DISCORD_CHANNELS=stellasora:<id del canal>,bluearchive:<id del canal>
   ```
   Para GitHub Actions: Settings → Secrets → `DISCORD_TOKEN` y `DISCORD_CHANNELS`, y pásalos como `env` en `.github/workflows/snapshots.yml`.

Desde ahí todo es automático: el recolector lee los últimos 100 mensajes de cada canal (el máximo de Discord) cada 30 min como mucho (caché del proxy) y los combina con la wiki
(`officialFirst`: los anuncios oficiales mandan).

## Más juegos

Canales configurados (7 nov 2026): stellasora, bluearchive, limbus, arknights, honkai3, azurlane e **infinitynikki** (`1568519866464600217`: #game-news y #redeem-codes).
Los mensajes con códigos de canje también se leen (`codesFrom` en `discord.ts`).

Sirve para **cualquier juego**: sigue su canal de anuncios oficial hacia un canal nuevo de tu servidor y añade `<id del juego>:<id del canal>` a `DISCORD_CHANNELS`
(sin tocar código; `syncSource` lo aplica a todo juego con canal). Ids: `genshin`, `hsr`, `zzz`, `arknights`, `endfield`, `uma`, `czn`, `wuwa`, `nikke`, `nte`,
`bluearchive`, `fgo`, `limbus`, `epic7`, `stellasora`, `reverse1999`. Donde más aporta (6 nov 2026):
- **arknights**: los eventos futuros salen de la wiki con inicio fijo 17:00 UTC ("≈") hasta que entran en los datos del cliente; los anuncios dan la hora real antes.
- **limbus**: Eldritch Tools da solo fechas (hora supuesta, "≈").
- **uma**: uma.moe marca muchos elementos sin confirmar ("≈").
El resto ya tiene avisos oficiales con hora exacta (Kuro, Bluepoch, STOVE, notas de NIKKE/NTE, HoYoverse, Atlas Academy).

## Cómo funciona

- El token solo existe en el servidor: el proxy añade `Authorization: Bot …` y la fuente es **interna** (`/proxy` la rechaza con 403), así que ningún navegador puede usarla.
- Solo se aceptan `GET https://discord.com/api/v10/channels/<id>/messages?limit=N` de los canales listados en `DISCORD_CHANNELS`. User-Agent `DiscordBot (…, 1.0)`, como pide Discord.
- El lector (`syncDiscord`) busca rangos de fechas en el texto, los embeds y sus campos: "Period: Oct. 19, 2026 after maintenance – Nov. 09, 2026 19:59 (UTC-7)",
  "11/9 (Mon) 19:00 ~ 11/16 (Mon) 18:59 (UTC)", "2026/11/03 04:00 - 2026/11/10 02:59". El nombre es el de la misma línea ("Bounty / Scrimmage Triple Rewards: …") o el
  último título en negrita/■/【】. "After maintenance" toma la hora real del aviso de mantenimiento del canal; si no lo hay, queda "≈". Imagen: la adjunta o la del embed.
- Desde el 11 nov 2026 también entiende, para cualquier juego: inicio y fin en líneas separadas ("Start: …" / "End: …"), cualquier saludo
  ("Dear Tyrant,", "Hello Sensei!"), rótulos como "▌ Event Period" (no son nombres), el nombre dentro de una frase ("Limited event: X is coming soon"),
  prefijos de tipo en cabeceras ("Limited Headhunting: X" → banner "X") y destacados "★5 Trekker, Leafia".
- Probado (6 nov 2026) con mensajes de ejemplo en esos formatos: da las mismas horas que gachafocus (Urgent Bounty, One Starlit Year, Menace Arena, campañas de BA).
  **Con los mensajes reales puede hacer falta ajustar el lector** (cada juego escribe distinto): tras configurarlo, revisar `/data/stellasora.json` y `/data/bluearchive.json`.
