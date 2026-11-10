# WhenGacha Premium: configuración

Premium desbloquea las skins y la insignia "Premium". Se consigue apoyando en **Ko-fi** y se entra con el correo
(enlace de un solo uso). No hay códigos que se puedan publicar. Código: `server/supporter.mjs` + `server/support/`
(servidor) y `src/skins/premium.ts`, `SupportDialog.tsx`, `SkinPicker.tsx` (navegador).

## Cómo funciona

1. En el pincel, **Apoyar y desbloquear** abre la ventana de apoyo: pasos y botón **Apoyar en Ko-fi** (abre tu página de Ko-fi).
2. La persona paga en Ko-fi (PayPal o tarjeta). Ko-fi avisa al servidor con un webhook (`POST /api/support/kofi`) con el correo,
   el importe, la moneda, el id de la transacción y el *Verification Token* secreto. Sin ese token, el aviso se rechaza.
3. Si el importe llega a `SUPPORT_MIN` en la moneda `SUPPORT_CURRENCY`, se añade a la lista **solo la huella** del correo (HMAC con
   `SUPPORTER_SECRET`) y el id de la transacción (`kofi:<id>`). Una transacción no puede dar acceso dos veces (Ko-fi puede repetir avisos).
   Las suscripciones mensuales de Ko-fi mandan un aviso cada mes: cada uno se apunta como otro apoyo.
4. Le llega un correo (al que usó en Ko-fi) con el enlace para activar Premium en su navegador.
5. En otro dispositivo, o si el correo se perdió, escribe ese correo en el pincel y le llega un enlace (30 min, un solo uso). La
   respuesta es la misma sea o no donante, así que nadie puede averiguar quién apoyó.
   Cada correo trae también un **código de 6 cifras**. Premium se guarda en el navegador que abre el enlace, y en el móvil Gmail
   suele abrirlo en su navegador interno. Con el código, la persona entra desde su navegador de verdad: pincel → "¿Ya apoyaste?" →
   correo + código (`POST /api/login/code`). Vale de 30 a 60 min, máximo 5 intentos por correo cada 30 min (`tokens.mjs`, `loginCode`).
6. La sesión dura 60 días y se renueva sola cada vez que la persona entra (revalidación cada 12 h): quien visite al menos una vez
   cada dos meses no vuelve a pedir el enlace. Si anulas a alguien, pierde el acceso en ≤ 12 h.

Los avisos que no dan Premium (importe bajo, otra moneda, sin correo, el botón de prueba de Ko-fi) se responden con 200 y se
apuntan en el registro del servidor con el prefijo `[kofi]`. Si alguien pagó y no le llegó nada, búscalo ahí y, si hace falta,
dale el acceso a mano con `npm run premium -- add correo`.

## Lo que tienes que crear

### 1. Ko-fi (cobros)
1. Crea tu página en https://ko-fi.com y conecta tu PayPal (vale una cuenta **personal**) o Stripe en *Settings → Payments*.
   Con PayPal personal, quien apoya ve tu nombre legal en el recibo de PayPal.
2. Pon en Ko-fi la misma moneda que `SUPPORT_CURRENCY`.
3. *More → API → Webhooks*: en **Webhook URL** pon `https://tudominio/api/support/kofi` (el mismo dominio que `PUBLIC_URL`).
4. En *Advanced* copia el **Verification Token**: va en `KOFI_TOKEN`.
5. Con el servidor ya configurado, pulsa **Send Test**: en el registro del servidor debe salir
   `[kofi] aviso 00000000-… sin Premium: prueba` (el aviso de prueba se reconoce y no da de alta a nadie).
6. Antes de anunciarlo, haz un apoyo real pequeño con tu propio correo y comprueba que te llega el enlace.

### 2. Resend (correos)
1. Crea una cuenta en https://resend.com (el plan gratuito sobra).
2. **Domains** → añade tu dominio y crea los registros DNS que te indique (SPF/DKIM). Sin dominio verificado los correos no salen
   o caen en spam.
3. **API Keys** → crea una con permiso de envío.

### 3. GitHub (lista de donantes)
1. Crea un repositorio **privado** vacío, por ejemplo `whengacha-donantes`.
2. https://github.com/settings/personal-access-tokens → **Fine-grained token**: *Repository access* → solo ese repositorio;
   *Permissions* → **Contents: Read and write**. Nada más.
3. El archivo `donors.json` se crea solo con el primer donante.

### 4. Variables (en Botkeep y en `.env.local` para probar en local)

| Variable | Ejemplo | Para qué |
|---|---|---|
| `SUPPORTER_SECRET` | (ya está en tu `.env.local`) | Firma sesiones y enlaces, y la huella de los correos. **La misma en todos lados**; si cambia, se pierden todas las sesiones y las huellas dejan de coincidir. |
| `KOFI_TOKEN` | el *Verification Token* de Ko-fi | Comprueba que los avisos del webhook son de Ko-fi. Secreto. |
| `KOFI_URL` | `https://ko-fi.com/tuusuario` | Tu página de Ko-fi (botón de la ventana de apoyo y botón de donar del pie). |
| `SUPPORT_MIN` / `SUPPORT_CURRENCY` | `2` / `USD` | Importe mínimo para Premium y moneda (la misma que en Ko-fi). |
| `DONORS_REPO` / `DONORS_TOKEN` | `tuusuario/whengacha-donantes` / el token | Lista de donantes. |
| `DONORS_PATH` / `DONORS_BRANCH` | `donors.json` / (vacío) | Opcionales. |
| `RESEND_API_KEY` / `MAIL_FROM` | la clave / `WhenGacha <no-reply@tudominio>` | Envío de correos. |
| `PUBLIC_URL` | `https://tudominio` (sin barra final) | Base del enlace del correo. Obligatoria: no se usa la cabecera Host. |

Mientras falte alguna (salvo las opcionales), el pincel dice que el apoyo con Premium todavía no está activo y ofrece donar igualmente.

## Gestión

```bash
npm run premium -- add correo@ejemplo.com      # dar Premium a mano (regalo, donación por otra vía) y mandarle el enlace
npm run premium -- revoke correo@ejemplo.com   # quitarlo (reembolso, abuso): lo pierde en ≤ 12 h
npm run premium -- check correo@ejemplo.com    # ver si lo tiene
```

## Pendiente / a tener en cuenta

- **Reembolsos y disputas**: Ko-fi no avisa de ellos por el webhook; se anulan a mano con `npm run premium -- revoke`.
- El botón **Apoyar el proyecto** del pie también lleva a Ko-fi (sale de `KOFI_URL`; con `KOFI_URL` pero sin el resto, ya enlaza a
  Ko-fi aunque Premium no esté activo). Un apoyo desde ahí da Premium igual que desde el pincel si llega al mínimo. Si el servidor
  no tiene `KOFI_URL`, el botón vuelve a la donación de PayPal de `DONATE_URL` en `src/App.tsx`.
- Si alguien paga en Ko-fi con un correo distinto del que luego escribe en el pincel, no le llegará el enlace: tiene que usar
  el de Ko-fi (o darle el acceso a mano con el otro correo).
- Los códigos `WG-…` y el cobro directo con la API de PayPal (`server/support/paypal.mjs`) ya no existen; las variables `PAYPAL_*`
  se pueden borrar de Botkeep.
