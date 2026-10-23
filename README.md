# WhenGacha
Popular Gacha Tracker: línea de tiempo de eventos, banners y parches de tus gachas, con datos que se cargan solos.

Juegos con datos automáticos: Genshin Impact, Honkai: Star Rail, Zenless Zone Zero, Arknights, Arknights: Endfield, Umamusume y Chaos Zero Nightmare.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

## Despliegue (Docker)

La app es 100 % estática: el navegador consulta directamente las fuentes de datos, así que no necesita backend ni variables de entorno.

```bash
docker build -t whengacha .
docker run -d -p 8080:80 --name whengacha whengacha
```

### Coolify / Dokploy

1. Crea un recurso nuevo desde este repositorio (rama `main`).
2. Método de build: **Dockerfile** (en la raíz del repo). Puerto interno: **80**.
3. Asigna el dominio. Necesita **HTTPS** para poder instalarse como app y mostrar notificaciones (el panel suele emitir el certificado solo).

## Fuentes de datos

| Juego | Fuente |
|---|---|
| Genshin, HSR, ZZZ | `api.ennead.cc` (eventos, banners, desafíos, códigos) y wikis de Fandom (historial de parches) |
| Arknights, Endfield | tablas Cargo de `arknights.wiki.gg` y `endfield.wiki.gg` |
| Umamusume | `uma.moe` (recurso público `banner_timeline.json`, no documentado) |
| Chaos Zero Nightmare | `czn.gg` (API REST de WordPress; las fechas se extraen del texto de cada aviso) |

Son datos de la comunidad y pueden ir con retraso. Si una fuente cambia su formato, ese juego deja de actualizarse hasta ajustar su adaptador en `src/sources/`.
