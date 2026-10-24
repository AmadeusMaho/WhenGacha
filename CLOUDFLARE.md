# Despliegue en Cloudflare Pages

La app se sirve como sitio estático y `/proxy` pasa a ser una Pages Function (`functions/proxy.js`).
El servidor Node (`server/`) y el Dockerfile siguen funcionando para desarrollo local o para otro host.

## 1. Subir los cambios
Copia el contenido de este zip sobre tu proyecto (mismas rutas) y haz commit/push al repositorio.

## 2. Crear el proyecto en Cloudflare
Dashboard → Workers & Pages → Create → Pages → Connect to Git → elige el repositorio.

- Build command: `npm run build`
- Build output directory: `dist`
- Variables de entorno (Production): `VITE_USE_PROXY` = `1` y `NODE_VERSION` = `22`

## 3. Dominio propio
En el proyecto → Custom domains → Set up a domain. AdSense necesita un dominio tuyo, no `*.pages.dev`.

## 4. Comprobar el proxy
Abre en el navegador (con tu dominio):
`/proxy?u=https://api.ennead.cc/mihoyo/genshin/event`
Debe devolver JSON. Recarga y mira la cabecera `x-cache`: `MISS` la primera vez y `HIT` después.
Prueba también un juego de cada fuente (gachafocus, lootandwaifus, wikis): algunas webs tratan distinto las
peticiones que salen desde Cloudflare, y es mejor enterarse ahora. Si `HIT` nunca aparece, revisa que lo pruebes
en el dominio propio y no en `*.pages.dev`, donde la caché puede no persistir.

## 5. Límite de peticiones (opcional)
La función solo acepta las fuentes de la lista (no es un relé abierto). Si quieres limitar abusos por IP, crea una
regla de Rate limiting en Security → WAF para la ruta `/proxy`.

## 6. Activar AdSense (cuando tengas la cuenta)
1. En `src/ads.ts`, pon tu ID en `ADSENSE_CLIENT` (`'ca-pub-...'`). Mientras esté vacío no hay anuncios ni banner.
2. En `index.html`, descomenta la etiqueta `google-adsense-account` con tu ID.
3. En `public/ads.txt`, pon la línea que te da AdSense.
4. Haz push. Activa «Anuncios automáticos» en AdSense para el sitio.

### Consentimiento
- `CONSENT_MODE = 'own'` (por defecto): banner propio; el script de AdSense solo se carga si el visitante acepta.
  En el pie aparece «Cookies» para cambiar la decisión.
- `CONSENT_MODE = 'google'`: sin banner propio; configura el mensaje en AdSense → Privacidad y mensajes.
  Es la vía certificada por Google para anuncios personalizados en la UE, Reino Unido y Suiza. Con el banner
  propio, el tráfico de esas regiones puede recibir solo anuncios no personalizados o limitados.
No uses los dos a la vez: el visitante vería dos avisos.
