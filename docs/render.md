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
