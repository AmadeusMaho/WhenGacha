# WhenGacha Premium: configuración

Premium desbloquea las skins y la insignia "Premium". Se consigue apoyando con PayPal y se entra con el correo
(enlace de un solo uso). No hay códigos que se puedan publicar. Código: `server/supporter.mjs` + `server/support/`
(servidor) y `src/skins/premium.ts`, `SupportDialog.tsx`, `SkinPicker.tsx` (navegador).

## Cómo funciona

1. En el pincel, **Apoyar y desbloquear** abre la ventana de apoyo: importe (mínimo `SUPPORT_MIN`) y botón de PayPal.
2. El servidor crea el pedido, lo cobra y comprueba con PayPal que está `COMPLETED` y que el importe y la moneda son correctos.
3. La persona da su correo (rellenado con el de PayPal). Se añade a la lista **solo la huella** del correo (HMAC con
   `SUPPORTER_SECRET`) y el id del pedido. Un pedido no puede dar acceso dos veces.
4. Ese navegador queda desbloqueado al momento y le llega un correo con el enlace para entrar desde otros dispositivos.
5. En otro dispositivo, escribe su correo en el pincel y le llega un enlace (30 min, un solo uso). La respuesta es la
   misma sea o no donante, así que nadie puede averiguar quién apoyó.
6. La sesión dura 60 días y se renueva sola cada vez que la persona entra (revalidación cada 12 h): quien visite al menos una vez
   cada dos meses no vuelve a pedir el enlace. Si anulas a alguien, pierde el acceso en ≤ 12 h.

Si se cierra la ventana después de pagar y antes de dar el correo, el pago pendiente queda guardado en el navegador
y el pincel ofrece **Terminar de activar Premium**.

## Lo que tienes que crear

### 1. PayPal (cobros)
1. Entra en https://developer.paypal.com → **Apps & Credentials**.
2. Primero en **Sandbox**: crea una app y copia su *Client ID* y *Secret*. Con eso pruebas sin dinero real
   (PayPal da cuentas de comprador de prueba en **Sandbox accounts**).
3. Cuando funcione, haz lo mismo en **Live** y pon `PAYPAL_ENV=live`.

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
| `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | de la app de PayPal | Cobros. |
| `PAYPAL_ENV` | `sandbox` o `live` | Cualquier valor que no sea `live` es de pruebas. |
| `SUPPORT_MIN` / `SUPPORT_CURRENCY` | `2` / `USD` | Importe mínimo para Premium y moneda. |
| `DONORS_REPO` / `DONORS_TOKEN` | `tuusuario/whengacha-donantes` / el token | Lista de donantes. |
| `DONORS_PATH` / `DONORS_BRANCH` | `donors.json` / (vacío) | Opcionales. |
| `RESEND_API_KEY` / `MAIL_FROM` | la clave / `WhenGacha <no-reply@tudominio>` | Envío de correos. |
| `PUBLIC_URL` | `https://tudominio` (sin barra final) | Base del enlace del correo. Obligatoria: no se usa la cabecera Host. |

Mientras falte alguna, el pincel dice que el apoyo con Premium todavía no está activo y ofrece donar igualmente.

## Gestión

```bash
npm run premium -- add correo@ejemplo.com      # dar Premium a mano (regalo, donación por otra vía) y mandarle el enlace
npm run premium -- revoke correo@ejemplo.com   # quitarlo (reembolso, abuso): lo pierde en ≤ 12 h
npm run premium -- check correo@ejemplo.com    # ver si lo tiene
```

## Pendiente / a tener en cuenta

- **Reembolsos y disputas de PayPal**: por ahora se anulan a mano con `npm run premium -- revoke`. Se puede automatizar con un
  webhook de PayPal (`PAYMENT.CAPTURE.REFUNDED`).
- El botón **Apoyar el proyecto** del pie sigue siendo la donación de PayPal de siempre, **sin** Premium. Para Premium hay que
  usar el pincel.
- Con ventajas a cambio, PayPal lo trata como venta, no como donación. Por eso se usa el botón de pago normal y no el de "Donar".
- Los códigos `WG-…` anteriores ya no sirven; `server/supporter.mjs` los sustituye.
