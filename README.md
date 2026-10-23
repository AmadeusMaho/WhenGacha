# WhenGacha
Popular Gacha Tracker: línea de tiempo de eventos, banners y parches de tus gachas, con datos que se cargan solos.

Juegos con datos automáticos: Genshin Impact, Honkai: Star Rail, Zenless Zone Zero, Arknights, Arknights: Endfield, Umamusume y Chaos Zero Nightmare.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173 (consulta cada fuente directamente)
npm run build      # genera dist/
```

## Producción

El servidor (`server/index.mjs`, solo módulos de Node, sin dependencias) hace dos cosas:

- sirve la app compilada (`dist/`), con las cabeceras de caché correctas para el service worker y los archivos con hash;
- ofrece `/proxy?u=<url>`, un proxy **con caché** hacia las fuentes de datos. Todos los visitantes comparten la misma copia, así que las fuentes reciben unas pocas peticiones al mes en vez de una por visita. Si una fuente falla, sirve la última copia guardada (hasta 7 días).

El proxy solo acepta las fuentes de la tabla de abajo (no es un relé abierto) y limita las peticiones por IP.

Sin Docker:

```bash
npm ci
VITE_USE_PROXY=1 npm run build
npm start          # http://localhost:3000
```

Con Docker:

```bash
docker build -t whengacha .
docker run -d -p 3000:3000 --name whengacha whengacha
```

Variables opcionales: `PORT` (3000), `CACHE_MB` (64), `RATE_PER_MIN` (600 por IP). Comprobación de salud: `GET /healthz`.

### Coolify / Dokploy

1. Recurso nuevo desde este repositorio, rama `main`.
2. Método de build: **Dockerfile** (en la raíz). Puerto: **3000**.
3. Asigna el dominio con **HTTPS** (necesario para instalar la app y recibir notificaciones).

El proxy lee `X-Forwarded-For` para limitar por visitante, algo que los paneles con Traefik o Caddy ya envían.

## Fuentes de datos

| Juego | Fuente | Caché del proxy |
|---|---|---|
| Genshin, HSR, ZZZ | `api.ennead.cc` (eventos, banners, desafíos, códigos) | 10 min |
| Umamusume | `uma.moe` (recurso público `banner_timeline.json`, no documentado) | 30 min |
| Chaos Zero Nightmare | `czn.gg` (API REST de WordPress; las fechas se extraen del texto de cada aviso) | 15 min |
| Arknights, Endfield, historial de parches, imágenes | wikis de Fandom y wiki.gg (API de MediaWiki / Cargo) | 12 h |

Son datos de la comunidad y pueden ir con retraso. Si una fuente cambia su formato, ese juego deja de actualizarse hasta ajustar su adaptador en `src/sources/`.
