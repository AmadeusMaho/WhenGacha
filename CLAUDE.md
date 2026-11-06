# WhenGacha: reglas del proyecto

## `dist/` se versiona: recompílalo y súbelo en cada entrega

El host (Botkeep) ejecuta `npm start` **sin compilar**, así que sirve lo que haya en `dist/` del repositorio.
Si haces push solo del código de `src/`, el deploy sigue mostrando la versión anterior.

Antes de cada commit/push que cambie código, estilos, `public/` o `server/`:

```bash
npm run build:prod   # tsc -b && vite build -> regenera dist/
git add -A           # incluye dist/ (assets con hash nuevo, index.html, sw.js)
```

Comprueba que `git status` muestre cambios en `dist/` antes de hacer push. Si no hay, no se compiló.

## Otros detalles útiles

- Los finales de línea dan avisos "LF will be replaced by CRLF": es ruido de Windows, no hay cambios de contenido.
- `public/sw.js`: el HTML va "red primero" para que un deploy se vea en la primera carga; los `/assets/` con hash van desde caché.
  Si cambias la estrategia de caché, sube también el nombre de la caché (`whengacha-shell-vN`).
- El proxy (`server/proxy.mjs`) solo permite las fuentes de su lista: una fuente nueva necesita su entrada ahí.
