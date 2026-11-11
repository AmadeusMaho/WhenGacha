# Despliegue en Render (y mantenerlo despierto con UptimeRobot)

Render es una alternativa a Botkeep que **se actualiza sola con cada push a `main`**, sin importaciones ni permisos a mano.
Las dos pueden convivir: Botkeep sirve el `dist/` del repositorio y Render compila el suyo (`render.yaml`).
Por eso la regla de `CLAUDE.md` sigue en pie mientras uses Botkeep: recompila y sube `dist/` en cada entrega.

## 1. Crear el servicio (una sola vez)

1. Entra en https://render.com y regístrate con **GitHub**.
2. *New* → **Blueprint** → elige el repositorio `WhenGacha`. Render lee `render.yaml` y propone el servicio `whengacha` (plan *Free*).
3. Te pedirá los valores de las variables marcadas como secretas. Cópialos de tu `.env.local` o del panel de Botkeep:

   | Variable | De dónde sale |
   |---|---|
   | `DISCORD_TOKEN`, `DISCORD_CHANNELS` | `.env.local` / Botkeep (docs/discord-bot.md) |
   | `SUPPORTER_SECRET` | `.env.local`. **Tiene que ser la misma que en Botkeep**, o las sesiones Premium y las huellas de correo no coinciden. |
   | `DONORS_REPO`, `DONORS_TOKEN` | `.env.local` (la lista de donantes está en GitHub, así que la comparten los dos servidores) |
   | `KOFI_TOKEN`, `KOFI_URL`, `SUPPORT_MIN`, `SUPPORT_CURRENCY` | Botkeep / docs/premium.md |
   | `RESEND_API_KEY`, `MAIL_FROM` | Botkeep / docs/premium.md |
   | `PUBLIC_URL` | La dirección de Render, p. ej. `https://whengacha.onrender.com` (sin barra final). Si aún no la sabes, déjala vacía y ponla en *Environment* cuando el servicio exista. |

   Las que no uses se pueden dejar vacías: cada función se desactiva sola si le falta su variable.
4. *Apply*. La primera compilación tarda unos minutos. Cuando acabe, abre `https://<tu-servicio>.onrender.com/healthz`: debe decir `ok`.

A partir de aquí, cada `git push` a `main` vuelve a compilar y desplegar solo.

### Ko-fi solo puede avisar a un servidor

El webhook de Ko-fi tiene una única URL. Déjalo apuntando a Botkeep mientras siga siendo la web principal. Si te pasas del todo a Render,
cámbialo en Ko-fi a `https://<tu-servicio>.onrender.com/api/support/kofi` y pon esa misma dirección en `PUBLIC_URL`.

### Qué cambia respecto a Botkeep

- El disco del plan gratis se borra en cada despliegue o reinicio (igual que `.cache/` en Botkeep). Las copias de eventos se rehacen
  solas y, mientras tanto, el servidor lee las de la rama `data` de GitHub.
- La IP es otra: puede que BD2/Game8 no la bloqueen (o sí).

## 2. Mantenerlo despierto: UptimeRobot (gratis)

El plan gratis de Render **se duerme tras ~15 min sin visitas** y tarda alrededor de un minuto en despertar. Mientras duerme tampoco
corren el recolector ni los fondos de las skins. UptimeRobot lo visita cada 5 min para que no llegue a dormirse, y además te avisa
por correo si la web se cae.

1. Regístrate en https://uptimerobot.com (plan *Free*).
2. *New monitor* → tipo **HTTP(s)**.
3. URL: `https://<tu-servicio>.onrender.com/healthz` (responde `ok` sin compilar páginas ni consultar fuentes).
4. Intervalo: **5 minutos**. Alerta: tu correo.
5. Guarda. En unos minutos debería salir en verde (*Up*).

Render da 750 horas gratis al mes y un mes tiene como mucho 744, así que **un** servicio siempre despierto entra justo; un segundo
servicio gratis ya no cabría. Los planes gratuitos cambian de vez en cuando: revisa las condiciones actuales de ambos al registrarte.

También puedes vigilar Botkeep con un segundo monitor en UptimeRobot (`https://<dominio de Botkeep>/healthz`).

## 3. Estado actual

> **Plan vigente:** Botkeep principal y Render como respaldo automático detrás de un Worker de Cloudflare
> (guía en `docs/cloudflare-worker.md`). En Render: `COLLECTOR_ENABLED=0`, `SERVER_NAME=render` y `PUBLIC_URL` = el dominio propio.
> El apartado 4 (pasar el dominio entero a Render) solo aplica si un día se deja Botkeep.

- Servicio creado y funcionando: https://whengacha.onrender.com (comprobado `/healthz`, eventos, fondos y skins).
- Es el **respaldo**: Botkeep sigue siendo la web principal con el dominio propio y Ko-fi le avisa a él.
- Render se actualiza solo con cada push. Si se duerme, tarda ~1 min en despertar y ya está al día.
- En Render, `PUBLIC_URL` = `https://whengacha.onrender.com` mientras sea respaldo.

## 4. Cambio completo a Render con el dominio propio (checklist)

Un dominio solo apunta a un servidor: al pasarlo a Render, **Render es la web principal** y Botkeep se queda sin dominio.
Hazlo en este orden y no apagues Botkeep hasta el final, así la web no se cae en ningún momento.

### 4.1 Añadir el dominio en Render
1. Render → servicio **whengacha** → **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Escribe tu dominio (`tudominio.com`). Render suele añadir también `www.tudominio.com`.
3. Render muestra los registros DNS a crear. **Usa exactamente los que muestre.** Lo normal:
   - `tudominio.com` (`@`): registro **A** → la IP que da Render.
   - `www.tudominio.com`: registro **CNAME** → `whengacha.onrender.com`.

### 4.2 Cambiar el DNS (donde compraste el dominio)
1. Panel del registrador (Namecheap, GoDaddy, Cloudflare, Hostinger…) → **DNS**.
2. **Borra o edita los registros que apuntan a Botkeep** (`@` y `www`). Si se quedan, habrá dos destinos y fallará.
3. Crea los registros que dio Render.
4. Con **Cloudflare**: ponlos en *DNS only* (nube gris) hasta que Render los verifique.
5. En Render pulsa **Verify**. Tarda de minutos a unas horas; luego Render pone el HTTPS solo.
6. Comprueba `https://tudominio.com/healthz` → `ok`.

### 4.3 Ajustes después del cambio
- **`PUBLIC_URL`** en Render → **Environment**: `https://tudominio.com` (sin barra final).
- **Ko-fi** (*More → API → Webhooks*): si el webhook ya era `https://tudominio.com/api/support/kofi`, no hay que tocarlo (ahora llega a
  Render). Si usaba la dirección de Botkeep, cámbialo a esa. Pulsa **Send test** y mira en Render → **Logs** que sale una línea `[kofi]`.
- **UptimeRobot**: ahora sí hace falta (apartado 2), con `https://tudominio.com/healthz` cada 5 min.
- Quien tenga la web guardada o instalada sigue entrando igual (el dominio no cambia), y las sesiones Premium siguen valiendo
  porque `SUPPORTER_SECRET` es la misma.

### 4.4 Apagar Botkeep
Tras un día o dos con todo bien en Render, para el servidor de Botkeep o borra el proyecto.
Después ya no hace falta subir `dist/` en cada push (Render compila solo): se puede quitar del repo y actualizar `CLAUDE.md`.

**No hay que tocar:** el bot de Discord, la lista de donantes en GitHub, Resend (correos) y las copias de eventos de GitHub Actions.
