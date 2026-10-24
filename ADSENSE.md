# Cambios para AdSense (sin Cloudflare)

La app sigue funcionando igual que antes: servidor Node (`npm start`) con su proxy. Estos archivos solo agregan
páginas legales, botón de donaciones, banner de consentimiento y los archivos que pide AdSense.

## Archivos
- `public/privacidad.html`, `public/acerca.html`: páginas legales (es/en/zh).
- `public/ads.txt`: pendiente de completar con tu línea de AdSense.
- `src/ads.ts`, `src/ConsentBanner.tsx`: carga de AdSense y banner de consentimiento.
- `src/App.tsx`, `src/App.css`, `src/locales.ts`, `index.html`: pie de página, botón de donaciones, textos y estilos.

## Pasos
1. Copia estos archivos sobre tu proyecto (mismas rutas).
2. Compila: `npm run build:prod` (genera `dist/`; tu README pide subirlo también).
3. Haz commit y push. Tu host debe ejecutar `npm start`, como hasta ahora.

## Cuando tengas la cuenta de AdSense
AdSense necesita un dominio propio (no sirve un subdominio de un host gratuito). Apunta tu dominio a tu host
si este permite dominios personalizados.
1. En `src/ads.ts`, pon tu ID en `ADSENSE_CLIENT` (`'ca-pub-...'`). Mientras esté vacío no hay anuncios ni banner.
2. En `index.html`, descomenta la etiqueta `google-adsense-account` con tu ID.
3. En `public/ads.txt`, pon la línea que te da AdSense.
4. Vuelve a compilar (`npm run build:prod`), commit y push. Activa «Anuncios automáticos» en AdSense.

## Consentimiento
- `CONSENT_MODE = 'own'` (por defecto): banner propio; el script de AdSense solo se carga si el visitante acepta.
  En el pie aparece «Cookies» para cambiar la decisión.
- `CONSENT_MODE = 'google'`: sin banner propio; configura el mensaje en AdSense → Privacidad y mensajes.
  Es la vía certificada por Google para anuncios personalizados en la UE, Reino Unido y Suiza.
No uses los dos a la vez: el visitante vería dos avisos.
