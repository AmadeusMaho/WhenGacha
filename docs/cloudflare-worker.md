# Respaldo automático: Worker de Cloudflare (Botkeep principal, Render respaldo)

Botkeep tarda horas en redesplegar y la web queda apagada mientras tanto. El Worker (`cloudflare/failover/`) se pone delante del
dominio: cada visita va a **Botkeep** y, si no contesta en 8 s o da un error 5xx, la misma petición se repite en **Render**.
Cuando Botkeep vuelve, el tráfico regresa solo. Gratis (plan Workers Free: 100 000 peticiones al día).

```
visitante → tudominio.com (Cloudflare) → Worker ─┬─ 1.º Botkeep (principal)
                                                 └─ 2.º Render  (si el 1.º falla)
```

## Qué hace cada servidor

| | Botkeep (principal) | Render (respaldo) |
|---|---|---|
| Recolector | Sí | No (`COLLECTOR_ENABLED=0`): adopta las copias de la rama `data`, que GitHub Actions publica cada 3 h |
| Donaciones | Sí | Sí, igual: lista de donantes en GitHub, sesiones firmadas con la misma `SUPPORTER_SECRET`, correos por Resend |
| Cabecera `x-served-by` | `whengacha` (o su `SERVER_NAME`) | `render` |

Si alguien paga mientras Botkeep está caído, el aviso de Ko-fi llega a Render (el Worker guarda el cuerpo y lo reenvía entero), que da
de alta al donante en GitHub. Un pago no da acceso dos veces aunque lo procesen los dos.

## 1. Requisitos (una vez)

1. El dominio tiene que usar el DNS de **Cloudflare** (plan Free). Si no lo usa: Cloudflare → *Add a site* y cambia los nameservers en tu registrador.
2. En Cloudflare → **DNS**, los registros `@` y `www` siguen apuntando a Botkeep, pero en **Proxied** (nube naranja). El Worker solo
   intercepta tráfico que pasa por Cloudflare.
3. Apunta la **dirección propia de Botkeep** (la que da su panel, no tu dominio): es `PRIMARY`. Si Botkeep solo funciona con tu
   dominio, el Worker no puede llegar a él sin pasar por sí mismo; en ese caso pregunta a Botkeep por una dirección propia.
4. En Render → **Environment**: `PUBLIC_URL` = `https://tudominio.com` (así los enlaces de los correos llevan al dominio),
   `COLLECTOR_ENABLED` = `0` y `SERVER_NAME` = `render`. Si el servicio se creó con el Blueprint y tiene la sincronización activada,
   las dos últimas llegan solas desde `render.yaml`; compruébalo igualmente.

## 2. Crear el Worker

**Opción A, desde el panel** (sin instalar nada):
1. Cloudflare → **Workers & Pages** → *Create* → *Create Worker* → nombre `whengacha-failover` → *Deploy*.
2. *Edit code*: borra lo que hay, pega el contenido de `cloudflare/failover/worker.js` y *Deploy*.
3. *Settings* → **Variables and Secrets**: añade `PRIMARY`, `BACKUP` (`https://whengacha.onrender.com`), `TIMEOUT_MS` (`8000`) y
   `REQUIRE_MARKER` (`0`).
4. *Settings* → **Domains & Routes** → *Add* → *Route*: `tudominio.com/*` y otra `www.tudominio.com/*` (zona: tu dominio).

**Opción B, con Wrangler**: edita `cloudflare/failover/wrangler.toml` (dominio y `PRIMARY`) y, desde esa carpeta, `npx wrangler deploy`.

## 3. Comprobar

- `https://tudominio.com/healthz` → `ok`. En las cabeceras de respuesta (F12 → Red) debe salir `x-whengacha-via: primary`.
- Prueba del respaldo: en las variables del Worker cambia `PRIMARY` por una dirección que no exista (p. ej. `https://no-existe.invalid`),
  recarga: debe salir `x-whengacha-via: backup`. Vuelve a poner la buena.
- Los cambios al respaldo quedan en el panel del Worker → **Logs** (`[failover] … → respaldo (motivo)`).

## 4. UptimeRobot (gratis)

Tres monitores HTTP(s) cada 5 min (`/healthz` responde `ok` sin trabajo extra):

| Monitor | URL | Para qué |
|---|---|---|
| Render | `https://whengacha.onrender.com/healthz` | **Imprescindible**: que el plan gratis no se duerma (si no, el respaldo tardaría ~1 min en despertar) |
| Botkeep | `https://<dirección de Botkeep>/healthz` | Saber cuándo cae o vuelve el principal |
| Dominio | `https://tudominio.com/healthz` | Lo que ven los visitantes (si cae este, han caído los dos) |

## 5. `REQUIRE_MARKER` (página de "desplegando" del host)

Si durante el redeploy Botkeep enseña su propia página con código 200 en vez de un error, el Worker la daría por buena.
Para evitarlo, el servidor pone la cabecera `x-served-by` en todas sus respuestas y, con `REQUIRE_MARKER=1`, una respuesta sin
ella cuenta como caída. **Actívalo solo cuando Botkeep ya tenga desplegada esta versión del servidor**; antes, todo iría a Render.
Comprobación: `https://<dirección de Botkeep>/healthz` debe traer `x-served-by` en las cabeceras.

## Estado (2026-11-11)

- Montado y probado: `@` y `www` en *Proxied*, Worker `whengacha-failover` con rutas en los dos. Con `PRIMARY` roto a propósito,
  todo (web, `/data`, `/api/support/config`, POST `/api/session`, `www`) salió por Render (`x-whengacha-via: backup`).
- DNS en Cloudflare (nameservers `jerome`/`sue`); se copió a mano el CNAME `send` → `send.forge.rmta.net` que el escaneo no vio.
- **Render no recibe los push solo** (los deploys salen como "Manual"). Tras un push que deba llegar a Render:
  Render → Blueprints → WhenGacha → **Manual sync** → *Approve*, o el servicio → *Manual Deploy* → *Deploy latest commit*.
- `REQUIRE_MARKER=1` activo desde el 2026-11-11, cuando Botkeep ya tenía `8444b00`. Comprobado: `@` y `www` salen por `primary`.

## Límites

- El respaldo puede ir hasta ~3 h por detrás en eventos (usa las copias publicadas, no recolecta).
- Mientras Botkeep no responde, cada visita espera hasta `TIMEOUT_MS` antes de ir a Render si Botkeep "se cuelga" en vez de rechazar.
  Si se nota, baja `TIMEOUT_MS` (p. ej. `4000`).
- Límites en memoria por servidor (intentos por IP, enlaces de acceso de un solo uso, caché de 10 min de la lista de donantes): al
  cambiar de servidor pueden desfasarse unos minutos. No afecta a pagos ni a sesiones.

## HTTPS obligatorio (13 nov 2026)

El dominio ya tenía certificado (Cloudflare, Let's Encrypt, `*.whengacha.site`), pero el Worker también atendía las visitas por `http://`
sin redirigirlas: quien escribía `whengacha.site` a secas o venía de un enlace antiguo veía el sitio como "No seguro". Ahora `worker.js`
redirige `http` → `https` (301 en GET/HEAD; 308 en el resto, que conserva el método y el cuerpo, p. ej. el aviso de Ko-fi) y pone
`Strict-Transport-Security: max-age=15552000` (6 meses, sin `includeSubDomains` ni `preload`). Hay que desplegarlo con `npx wrangler deploy`.
Refuerzo opcional sin código: Cloudflare → SSL/TLS → Edge Certificates → **Always Use HTTPS** (hace lo mismo antes de llegar al Worker).
Comprobación: `http://whengacha.site/` debe responder 301 con `location: https://whengacha.site/`.
