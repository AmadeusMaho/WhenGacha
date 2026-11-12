// Proxy con caché hacia las fuentes de datos de WhenGacha.
// Lo usan tanto el servidor de producción (server/index.mjs) como el servidor de desarrollo de Vite.
import { promisify } from 'node:util'
import { gzip as gzipCb } from 'node:zlib'
import https from 'node:https'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const gzip = promisify(gzipCb)
export const MAX_BYTES = (Number(process.env.CACHE_MB) || 64) * 1024 * 1024
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 600
const UA = 'WhenGacha/1.0 (+https://github.com/AmadeusMaho/WhenGacha)'
export const PROXY_UA = UA
/** gachafocus (Cloudflare) rechaza el UA identificado en algunos hosts: se prueba primero con un UA de navegador y, si falla, con el de siempre. */
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
/**
 * GACHAFOCUS_UA: User-Agent exacto para gachafocus (p. ej. uno que ellos hayan autorizado). Si está definido se usa siempre, sin alternar;
 * si no, se prueba el de navegador y, tras un fallo, el identificado.
 */
const GACHAFOCUS_UA = (process.env.GACHAFOCUS_UA ?? '').trim()
// Gachafocus está apagado salvo GACHAFOCUS_ENABLED=1 (prohíbe la recolección automatizada): sin eso, el proxy ni siquiera lo admite como fuente.
const GACHAFOCUS_ENABLED = (process.env.GACHAFOCUS_ENABLED ?? '').trim() === '1'
// Discord (ver docs/discord-bot.md): token del bot propio y canales permitidos ("stellasora:123,bluearchive:456"). Sin token, la fuente no existe.
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN ?? '').trim()
const DISCORD_CHANNEL_IDS = new Set((process.env.DISCORD_CHANNELS ?? '').split(',').map(x => x.split(':')[1]?.trim()).filter(Boolean))
const DISCORD_UA = 'DiscordBot (https://github.com/AmadeusMaho/WhenGacha, 1.0)'
const MAX_BODY = 8 * 1024 * 1024
const STALE_MAX = 7 * 24 * 3_600_000

const MIN = 60_000
const HOUR = 60 * MIN

/**
 * Arknights: lo que reparten los eventos de inicio de sesión del cliente (`dynActs`, `activity.CHECKIN_ONLY`/`LOGIN_ONLY`: `checkInList[].itemList` o
 * `itemList`), sumado por tipo y solo lo que sirve para tirar (el resto son materiales). Por actividad: [{ name, amount }]. Ver akdata.ts.
 */
const AK_REWARD = {
  DIAMOND_SHD: 'Orundum', DIAMOND: 'Originite Prime', TKT_GACHA: 'Headhunting Permit', TKT_GACHA_10: 'Ten-roll Headhunting Permit',
  LIMITED_TKT_GACHA_10: 'Ten-roll Headhunting Permit', CLASSIC_TKT_GACHA: 'Kernel Headhunting Permit',
}
function akCheckinRewards(j) {
  const out = {}
  const add = (id, list) => {
    for (const it of Array.isArray(list) ? list : []) {
      const name = AK_REWARD[it?.type] ?? (it?.type === 'VOUCHER_PICK' && /recruitR6/i.test(it.id ?? '') ? '6★ Operator Selection Voucher' : null)
      if (!name || !(it.count > 0)) continue
      const row = (out[id] ??= []).find(r => r.name === name)
      if (row) row.amount += it.count
      else out[id].push({ name, amount: it.count })
    }
  }
  for (const src of [j.dynActs, j.activity?.CHECKIN_ONLY, j.activity?.LOGIN_ONLY]) {
    for (const [id, v] of Object.entries(src ?? {})) {
      if (Array.isArray(v?.itemList)) add(id, v.itemList)
      for (const d of Object.values(v?.checkInList ?? {})) add(id, d?.itemList)
    }
  }
  return out
}

/**
 * Solo estas fuentes (y estas rutas) se pueden consultar a través del proxy: no es un relé abierto.
 * No se piden rutas que el robots.txt de cada sitio prohíbe (p. ej. /api/ o /img/ de gachafocus).
 */
const SOURCES = [
  { name: 'ennead', ttl: 10 * MIN, test: u => u.hostname === 'api.ennead.cc' && u.pathname.startsWith('/mihoyo/') },
  { name: 'uma.moe', ttl: 30 * MIN, test: u => u.hostname === 'uma.moe' && u.pathname.startsWith('/resources/') },
  // Umamusume: lista de personajes de umapyoi.net (API pública, robots.txt "Allow: /") para poner el retrato de cada destacado.
  // Una sola ruta y caché de un día: la lista apenas cambia.
  { name: 'umapyoi', ttl: 24 * HOUR, test: u => u.hostname === 'umapyoi.net' && u.pathname === '/api/v1/character/list' && !u.search },
  { name: 'gachafocus', ttl: HOUR, test: u => GACHAFOCUS_ENABLED && u.hostname === 'gachafocus.com.br' && /^\/en\/[a-z0-9-]+\/(events|banners)$/.test(u.pathname) },
  { name: 'prydwen', ttl: 2 * HOUR, test: u => u.hostname === 'www.prydwen.gg' && /^\/(wuthering-waves|neverness-to-everness|chaos-zero-nightmare|nikke)\/banners$/.test(u.pathname) },
  { name: 'game8', ttl: 6 * HOUR, test: u => u.hostname === 'game8.co' && /^\/games\/(Wuthering-Waves\/archives\/453473|Neverness-to-Everness\/archives\/592073|Chaos-Zero-Nightmare\/archives\/(559899|557967)|Arknights-Endfield\/archives\/571509|Duet-Night-Abyss\/archives\/(559948|554952|557781)|Monster-Hunter-Outlanders\/archives\/634765)$/.test(u.pathname) },
  // Monster Hunter Outlanders: guía de GameWith en inglés (eventos con recompensas, banners, temporada y códigos; robots.txt solo cierra /api/).
  { name: 'gamewith', ttl: 6 * HOUR, test: u => u.hostname === 'gamewith.ai' && /^\/monster-hunter-outlanders\/en\/(articles\/(event-list|current-banners|season-guide|redeem-codes)|items)$/.test(u.pathname) && !u.search },
  // Trickcal: avisos oficiales de su web (trickcal.biligames.com/news/en/ pide aquí la lista y cada aviso). Solo el servidor 113406 y estos parámetros.
  { name: 'biligames', ttl: 2 * HOUR, test: u => u.hostname === 'l11-web-api.biligames.com' && /^\/game\/news\/(page|detail)$/.test(u.pathname) && u.searchParams.get('game_base_id') === '113406'
    && [...u.searchParams.keys()].every(k => ['game_base_id', 'show_position', 'client_type', 'lang', 'type', 'page_num', 'page_size', 'news_id'].includes(k)) && Number(u.searchParams.get('page_size') ?? 0) <= 10 },
  // Monster Hunter Outlanders: avisos oficiales ("Update Notice", con sus "Event Preview") del servicio de noticias de Level Infinite que usa
  // monsterhunteroutlanders.com/en/news.html (POST con JSON y las cabeceras de juego de su web). Solo la sección Announcements (1653) y sus avisos.
  { name: 'playerinfinite', ttl: 3 * HOUR, post: true,
    headers: () => ({ 'x-gameid': '30075', 'x-areaid': 'global', 'x-language': 'en', 'x-source': 'pc_web' }),
    body: u => JSON.stringify(u.pathname.endsWith('/GetContentInfoById')
      ? { content_id: u.searchParams.get('content_id'), language: 'en', gameid: '30075' }
      : { language: ['en'], gameid: '30075', offset: 0, get_num: Number(u.searchParams.get('get_num')), primary_label_id: 1065, secondary_label_id: 1653 }),
    test: u => u.hostname === 'sg-community.playerinfinite.com' && (
      (u.pathname === '/api/gpts.information_feeds_svr.InformationFeedsSvr/GetContentByLabel' && /^\d{1,2}$/.test(u.searchParams.get('get_num') ?? '') && Number(u.searchParams.get('get_num')) <= 10 && [...u.searchParams.keys()].every(k => k === 'get_num'))
      || (u.pathname === '/api/gpts.information_feeds_svr.InformationFeedsSvr/GetContentInfoById' && /^[0-9a-f]{20,64}$/.test(u.searchParams.get('content_id') ?? '') && [...u.searchParams.keys()].every(k => k === 'content_id'))) },
  // GFL2: avisos oficiales de la web global (la lista de eventos, tipo 4, y cada aviso). Los avisos no cambian: caché larga.
  { name: 'sunborn', ttl: 6 * HOUR, test: u => u.hostname === 'gf2-web-us-api.sunborngame.com' && (/^\/website\/news\/\d{1,6}$/.test(u.pathname) && !u.search
    || u.pathname === '/website/news_list/4' && [...u.searchParams.keys()].every(k => ['page', 'limit'].includes(k)) && Number(u.searchParams.get('limit')) <= 10) },
  // BLEACH: Soul Resonance: lista de códigos de game.guide (robots.txt solo cierra /api/). Una sola página.
  { name: 'gameguide', ttl: 6 * HOUR, test: u => u.hostname === 'www.game.guide' && u.pathname === '/bleach-soul-resonance-codes' && !u.search },
  { name: 'stellasora', ttl: 3 * HOUR, test: u => u.hostname === 'stellasora.miraheze.org' && u.pathname === '/wiki/Stella_Sora_Wiki' },
  // Stella Sora: avisos oficiales de stellasora.global (su web pide la lista y cada aviso a /api/resource/news…, sin claves; sin robots.txt).
  { name: 'stellasoraweb', ttl: 3 * HOUR, test: u => u.hostname === 'stellasora.global' && (
    (u.pathname === '/api/resource/news' && [...u.searchParams.keys()].every(k => ['index', 'size', 'type'].includes(k)) && Number(u.searchParams.get('size')) <= 12)
    || (u.pathname === '/api/resource/news/detail' && /^\d{1,6}$/.test(u.searchParams.get('id') ?? '') && [...u.searchParams.keys()].every(k => k === 'id'))) },
  // Fondos de las skins (server/skin-live.mjs): qué vídeo e imagen de portada tiene AHORA la web oficial de cada juego (cambian con cada
  // versión). Solo para el servidor (`internal`), cada 12 h; el proxy guarda únicamente las URL que hacen falta (`shrinkText`/`shrink`), no las páginas.
  // Genshin y ZZZ (HoYoverse): la portada (HTML de ~5–11 KB) enlaza su script de configuración `config.<hash>.js`, que lista los recursos de la
  // página; el vídeo más reciente (la ruta lleva la fecha) es el de la versión actual.
  { name: 'hoyo-home', ttl: 12 * HOUR, internal: true, test: u => (u.hostname === 'genshin.hoyoverse.com' && u.pathname === '/en/' || u.hostname === 'zenless.hoyoverse.com' && u.pathname === '/en-us/') && !u.search,
    shrinkText: t => JSON.stringify({ config: /https:\/\/act\.hoyoverse\.com\/puzzle\/(?:hk4e|zzz)\/pz_[A-Za-z0-9]+\/config\.[a-f0-9]+\.js/.exec(t)?.[0] ?? null }) },
  { name: 'hoyo-config', ttl: 12 * HOUR, internal: true, test: u => u.hostname === 'act.hoyoverse.com' && /^\/puzzle\/(hk4e|zzz)\/pz_[A-Za-z0-9]+\/config\.[a-f0-9]+\.js$/.test(u.pathname) && !u.search,
    shrinkText: t => JSON.stringify({ videos: [...new Set(t.match(/https:\/\/act-webstatic\.hoyoverse\.com\/puzzle\/(?:hk4e|zzz)\/pz_[A-Za-z0-9]+\/resource\/puzzle\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9_]+\.mp4/g) ?? [])] }) },
  // WuWa: el JSON de la portada de su web (MainMenu.json, ~400 KB) trae `pcTopPicture` con `backgroundVideo` y `coverImage`. Va antes de "kuro".
  { name: 'kuro-home', ttl: 12 * HOUR, internal: true, test: u => u.hostname === 'hw-media-cdn-mingchao.kurogame.com' && u.pathname === '/akiwebsite/website2.0/json/G152/en/MainMenu.json' && !u.search,
    shrink: j => ({ pc: j.pcTopPicture && { video: j.pcTopPicture.backgroundVideo, image: j.pcTopPicture.coverImage, updated: Number(j.pcTopPicture.updateTime) || null } }) },
  // WuWa: noticias oficiales de Kuro (JSON estáticos de su CDN; términos y robots.txt no lo prohíben). Lista + la nota de parche en curso.
  { name: 'kuro', ttl: 3 * HOUR, test: u => (u.hostname === 'hw-media-cdn-mingchao.kurogame.com' && /^\/akiwebsite\/website2\.0\/json\/G152\/en\/(ArticleMenu|article\/\d+)\.json$/.test(u.pathname))
    // Punishing: Gray Raven (pgr.kurogame.net): mismo sistema de Kuro, otro CDN.
    || (u.hostname === 'media-cdn-zspms.kurogame.net' && /^\/pnswebsite\/website2\.0\/json\/G167\/(ArticleMenu|article\/\d+)\.json$/.test(u.pathname)) },
  // PGR: arte oficial reproducido por la wiki GRAY RAVENS (Miraheze, CC BY-SA). robots.txt permite /wiki/ pero no /w/, ?action= ni Special:.
  // Solo páginas de artículo (versión y personaje), sin parámetros ni espacios de nombres especiales.
  { name: 'grayravens', ttl: 12 * HOUR, test: u => u.hostname === 'grayravens.com' && /^\/wiki\/[^/]+$/.test(u.pathname) && !u.search
    && !/^\/wiki\/(Special|File|Talk|User|Category|Template|MediaWiki|Help|Module)(_talk)?:/i.test(u.pathname) },
  // Arknights: datos del cliente EN (repo público actualizado por GitHub Actions con arkprts; sin licencia: decisión del dueño, 6 nov 2026).
  // activity_table pesa ~18 MB: se descarga cada 6 h y el proxy guarda solo el calendario (`shrink`, unos KB), que es lo que reciben recolector y navegadores.
  { name: 'akgamedata', ttl: 6 * HOUR, maxBody: 48 * 1024 * 1024, test: u => u.hostname === 'raw.githubusercontent.com' && /^\/ArknightsAssets\/ArknightsGamedata\/master\/en\/gamedata\/excel\/(activity|gacha|character|campaign|stage)_table\.json$/.test(u.pathname),
    shrink: j => j.basicInfo
      ? { basicInfo: Object.fromEntries(Object.entries(j.basicInfo).map(([k, v]) => [k, { id: v.id, type: v.type, name: v.name, startTime: v.startTime, endTime: v.endTime, isReplicate: v.isReplicate }])),
          rewards: akCheckinRewards(j) }
      : j.gachaPoolClient
        ? { gachaPoolClient: j.gachaPoolClient.map(p => ({ gachaPoolId: p.gachaPoolId, gachaRuleType: p.gachaRuleType, gachaPoolName: p.gachaPoolName, openTime: p.openTime, endTime: p.endTime,
            dynMeta: p.dynMeta && { main6RarityCharId: p.dynMeta.main6RarityCharId, sub6RarityCharId: p.dynMeta.sub6RarityCharId, rare5CharList: p.dynMeta.rare5CharList } })) }
        // campaign_table (~600 KB) → rotación de Annihilation y Orundum de primera vez de cada mapa rotatorio.
        : j.campaignRotateStageOpenTimes
          ? { rotate: j.campaignRotateStageOpenTimes.map(r => ({ stageId: r.stageId, startTs: r.startTs, endTs: r.endTs })),
              orundum: Object.fromEntries(Object.entries(j.campaigns ?? {}).filter(([k]) => k.startsWith('camp_r_')).map(([k, c]) => [k,
                (c.breakLadders ?? []).flatMap(l => l.rewards ?? []).filter(r => r.type === 'DIAMOND_SHD').reduce((a, r) => a + (r.count ?? 0), 0)])) }
        // stage_table (~24 MB) → solo el nombre de los mapas de Annihilation.
        : j.stages
          ? Object.fromEntries(Object.entries(j.stages).filter(([k, v]) => k.startsWith('camp_') && v?.name).map(([k, v]) => [k, v.name]))
        // character_table (~20 MB) → solo "id → nombre" de los operadores.
        : Object.fromEntries(Object.entries(j).filter(([k, v]) => k.startsWith('char_') && v?.name).map(([k, v]) => [k, v.name])) },
  // Reverse: 1999: avisos oficiales de Bluepoch (la API que usa re1999.bluepoch.com/en/home; POST con JSON). Términos sin cláusula contra bots; sin robots.txt.
  { name: 'bluepoch', ttl: 3 * HOUR, post: true, test: u => u.hostname === 're1999.bluepoch.com' && u.pathname === '/activity/official/websites/information/query' && u.searchParams.get('gameId') === '60001' && [...u.searchParams.keys()].every(k => ['gameId', 'informationType', 'current', 'pageSize'].includes(k)) && Number(u.searchParams.get('pageSize')) <= 20 },
  // NIKKE y NTE: avisos oficiales reproducidos por nikke.gg y neverness.gg (red DotGG) (API pública de WordPress; robots.txt y Términos lo permiten). Solo posts.
  { name: 'nikkegg', ttl: 3 * HOUR, test: u => (u.hostname === 'nikke.gg' || u.hostname === 'neverness.gg') && /^\/wp-json\/wp\/v2\/posts(\/\d+)?$/.test(u.pathname) && [...u.searchParams.keys()].every(k => ['categories', 'per_page', '_fields'].includes(k)) },
  // Discord: mensajes de los canales de NUESTRO servidor que siguen los anuncios oficiales (Stella Sora, Blue Archive Global). Solo para el recolector
  // (`internal`: /proxy la rechaza) y solo con DISCORD_TOKEN; el token va en una cabecera que añade el servidor y nunca sale de él.
  { name: 'discord', ttl: 30 * MIN, internal: true, ua: DISCORD_UA, headers: () => ({ authorization: `Bot ${DISCORD_TOKEN}` }),
    test: u => !!DISCORD_TOKEN && u.hostname === 'discord.com' && DISCORD_CHANNEL_IDS.has(/^\/api\/v10\/channels\/(\d+)\/messages$/.exec(u.pathname)?.[1] ?? '') && [...u.searchParams.keys()].every(k => k === 'limit') },
  { name: 'reverie', ttl: 3 * HOUR, test: u => u.hostname === 'gachalife-production.up.railway.app' && /^\/events\/wuwa$/.test(u.pathname) },
  { name: 'snapshots', ttl: 15 * MIN, test: u => u.hostname === 'raw.githubusercontent.com' && /^\/AmadeusMaho\/WhenGacha\/data\/snapshots\/[a-z0-9]+\.json$/.test(u.pathname) },
  { name: 'limbus', ttl: 30 * MIN, test: u => u.hostname === 'limbus-assets.eldritchtools.com' && /^\/data\/(timers|identities_mini)\.json$/.test(u.pathname) },
  { name: 'atlasacademy', ttl: 30 * MIN, test: u => u.hostname === 'api.atlasacademy.io' && /^\/export\/NA\/(basic_event|nice_gacha|basic_servant)\.json$/.test(u.pathname) },
  // FGO: lo que viene a NA según JP (fgo.ts, fromJp): eventos JP de Atlas Academy y la lista de banners de GamePress (robots.txt solo cierra /admin/).
  { name: 'atlasacademy-jp', ttl: 12 * HOUR, test: u => u.hostname === 'api.atlasacademy.io' && u.pathname === '/export/JP/basic_event_lang_en.json' },
  { name: 'gamepress-fgo', ttl: 12 * HOUR, test: u => u.hostname === 'grandorder.gamepress.gg' && u.pathname === '/summon-banner-list' },
  // Ficha de un evento de FGO, solo para su arte (`banner`); hasta 6 por ciclo. El arte no cambia: caché larga.
  { name: 'atlasacademy-event', ttl: 24 * HOUR, test: u => u.hostname === 'api.atlasacademy.io' && /^\/nice\/NA\/event\/\d{4,6}$/.test(u.pathname) },
  { name: 'lootandwaifus', ttl: HOUR, test: u => u.hostname === 'lootandwaifus.com' && /^\/(nikke-banner-history|trickcal-chibi-go-banner-history|guides\/trickcal-revive-codes)\/$/.test(u.pathname) },
  // Epic Seven: calendario de banners (bannerhistory.app, su robots.txt permite /en/) y avisos oficiales de STOVE (tablones Events=988 y Game Maintenance=986).
  { name: 'bannerhistory', ttl: 6 * HOUR, test: u => u.hostname === 'bannerhistory.app' && u.pathname === '/en/e7-pickup-history' },
  { name: 'stove', ttl: 2 * HOUR, test: u => u.hostname === 'api.onstove.com' && (/^\/cwms\/v3\.0\/article_group\/BOARD\/(988|986|139238|139240|142421)\/article\/list$/.test(u.pathname) || (u.pathname === '/cwms/v3.0/article' && /^\d+$/.test(u.searchParams.get('article_id') ?? ''))) },
  // BrownDust2: avisos oficiales, la API de su propia web de noticias (browndust2.com/robots.txt: Allow /). Lista y aviso suelto, solo en inglés.
  { name: 'bd2', ttl: 3 * HOUR, test: u => u.hostname === 'webapi.browndust2.com' && /^\/api\/notices(\/[0-9A-Z]{26})?$/.test(u.pathname) && u.searchParams.get('locale') === 'en-us'
    && [...u.searchParams.keys()].every(k => ['locale', 'page', 'limit'].includes(k)) && Number(u.searchParams.get('limit') ?? 0) <= 50 },
  { name: 'wiki', ttl: 12 * HOUR, test: u => ((u.hostname.endsWith('.fandom.com') || u.hostname.endsWith('.wiki.gg')) && u.pathname === '/api.php') || (u.hostname === 'bluearchive.wiki' && u.pathname === '/w/api.php') || (u.hostname === 'iopwiki.com' && u.pathname === '/api.php') },
]

/* ---------- caché en memoria ---------- */
const cache = new Map() // url -> { body, gz, type, at, ttl }
let cacheBytes = 0
const inflight = new Map()

function store(key, entry) {
  const old = cache.get(key)
  if (old) cacheBytes -= old.body.length + (old.gz?.length ?? 0)
  cache.delete(key)
  cache.set(key, entry)
  cacheBytes += entry.body.length
  for (const [k, v] of cache) { // expulsa lo más antiguo si se pasa del límite
    if (cacheBytes <= MAX_BYTES) break
    cache.delete(k)
    cacheBytes -= v.body.length + (v.gz?.length ?? 0)
  }
}

/**
 * Petición HTTPS simple (solo User-Agent y Accept), sin seguir redirecciones. Se usa en lugar de `fetch` porque algunas
 * fuentes (p. ej. Prydwen) rechazan las cabeceras extra que añade el `fetch` de Node pero aceptan este cliente
 * con el mismo User-Agent identificado. Devuelve una respuesta con la forma mínima de `Response`.
 */
function httpsRequest(url, ua, maxBody = MAX_BODY, body = null, extra = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'user-agent': ua, accept: 'application/json, text/html;q=0.9, */*;q=0.5', 'accept-encoding': 'identity', ...extra, ...(body ? { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) } : {}) },
      timeout: 45_000, // algunas páginas (p. ej. Game8, ~600 KB) tardan
    }, res => {
      const chunks = []
      let size = 0
      res.on('data', c => {
        size += c.length
        if (size > maxBody) { req.destroy(new Error('respuesta demasiado grande')); return }
        chunks.push(c)
      })
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        headers: { get: name => res.headers[name.toLowerCase()] ?? null },
        arrayBuffer: async () => Buffer.concat(chunks),
      }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('tiempo de espera agotado')))
    req.on('error', reject)
    req.end(body ?? undefined)
  })
}

/** Cliente HTTP usado para las fuentes; las pruebas lo sustituyen con `setTransport`. */
let request = httpsRequest
export function setTransport(fn) { request = fn ?? httpsRequest }

/**
 * Corta-circuito por sitio: si una fuente responde con error (p. ej. 403 de Cloudflare), no se le vuelve a pedir nada
 * durante la pausa (ver pauseFor); pasado ese tiempo se hace una sola prueba. Así un bloqueo no se agrava con cada visita.
 * gachafocus se prueba con el UA de navegador y, tras un fallo, la siguiente prueba usa el UA identificado (y así).
 */
/**
 * Espera tras un 403/429/202: 10 min, y el doble en cada fallo seguido (20 min…) hasta 2 h. Un éxito la reinicia.
 * Tras BLOCK_AFTER rechazos seguidos se trata como bloqueo persistente (p. ej. BrownDust2 y Game8 rechazan la IP del servidor con AWS WAF):
 * una sola prueba al día, en vez de una cada 2 h que se rechazaría igual. La fuente no se quita; si el sitio vuelve a responder, se reanuda.
 */
const BLOCK_AFTER = 3
const BLOCK_PAUSE = 24 * HOUR
const pauseFor = fails => (fails >= BLOCK_AFTER ? BLOCK_PAUSE : Math.min(10 * MIN * 2 ** Math.max(0, fails - 1), 2 * HOUR))

/** Peticiones a gachafocus de una en una y con esta separación, para no hacer ráfagas (sus reglas de Cloudflare no son públicas). */
const GAP = { 'bannerhistory.app': 5000, 'api.atlasacademy.io': 1000, 'grandorder.gamepress.gg': 5000, 'api.onstove.com': 3000, 'webapi.browndust2.com': 2000, 'gachafocus.com.br': 2000,  'gachalife-production.up.railway.app': 3000, 'hw-media-cdn-mingchao.kurogame.com': 3000, 'media-cdn-zspms.kurogame.net': 3000, 're1999.bluepoch.com': 3000, 'nikke.gg': 5000, 'neverness.gg': 5000, 'discord.com': 1500, 'game8.co': 5000, 'grayravens.com': 3000, 'lootandwaifus.com': 3000, 'iopwiki.com': 2000, 'gamewith.ai': 3000, 'www.game.guide': 3000, 'l11-web-api.biligames.com': 3000, 'gf2-web-us-api.sunborngame.com': 2000, 'sg-community.playerinfinite.com': 3000, 'stellasora.global': 3000, 'www.prydwen.gg': 10_000 /* Crawl-delay de su robots.txt */ }
const gates = new Map() // host -> promesa de la última petición en cola
function throttle(host) {
  const gap = GAP[host]
  if (!gap) return Promise.resolve()
  const prev = gates.get(host) ?? Promise.resolve()
  const mine = prev.then(() => new Promise(r => setTimeout(r, gap)))
  gates.set(host, mine)
  return prev
}
const hostState = new Map() // host -> { until, flip }

async function fetchUpstream(url, ttl) {
  const host = new URL(url).hostname
  await throttle(host)
  const st = hostState.get(host) ?? { until: 0, flip: false, fails: 0 }
  if (Date.now() < st.until) throw new Error(`upstream en pausa (bloqueo reciente)`)
  const isGf = host === 'gachafocus.com.br'
  const twoUas = isGf && !GACHAFOCUS_UA
  const ua = isGf && GACHAFOCUS_UA ? GACHAFOCUS_UA : twoUas && !st.flip ? BROWSER_UA : UA
  const uaName = ua === BROWSER_UA ? 'UA de navegador' : ua === UA ? 'UA propio' : 'UA de GACHAFOCUS_UA'
  // Algunas fuentes (ver `maxBody`/`shrink` en SOURCES) admiten respuestas mayores porque se recortan antes de guardarlas.
  const src = SOURCES.find(s => s.test(new URL(url)))
  const limit = src?.maxBody ?? MAX_BODY
  // Fuentes con `post`: la URL (con sus parámetros) es la clave de caché; se pide como POST con esos parámetros en JSON.
  // `body(u)`: la fuente arma su propio JSON (tipos que no son texto, p. ej. listas y números de Level Infinite).
  const post = src?.post ? (() => { const u = new URL(url); const body = src.body ? src.body(u) : JSON.stringify(Object.fromEntries(u.searchParams)); u.search = ''; return { url: u.toString(), body } })() : null
  const res = await request(post ? post.url : url, src?.ua ?? ua, limit, post?.body ?? null, src?.headers?.() ?? {})
  if (res.status !== 200) {
    // 202 = desafío de AWS WAF (CloudFront devuelve una prueba en JavaScript en vez de la página): es un bloqueo, no se intenta resolver.
    if (res.status === 403 || res.status === 429 || res.status === 202) {
      const fails = st.fails + 1
      hostState.set(host, { until: Date.now() + pauseFor(fails), flip: twoUas ? !st.flip : false, fails })
      saveHosts()
      console.error(`[proxy] ${host} respondió ${res.status} (${uaName}): sin nuevas peticiones durante ${pauseFor(fails) / MIN} min${fails >= BLOCK_AFTER ? ` (bloqueo persistente: ${fails} rechazos seguidos)` : ''}`)
    }
    throw new Error(`upstream ${res.status}`)
  }
  if (st.fails) { hostState.set(host, { until: 0, flip: st.flip, fails: 0 }); saveHosts(); console.log(`[proxy] ${host} vuelve a responder`) }
  else hostState.set(host, { until: 0, flip: st.flip, fails: 0 }) // se recuerda qué UA funcionó
  if (Number(res.headers.get('content-length')) > limit) throw new Error('respuesta demasiado grande')
  let body = Buffer.from(await res.arrayBuffer())
  if (body.length > limit) throw new Error('respuesta demasiado grande')
  if (src?.shrink) body = Buffer.from(JSON.stringify(src.shrink(JSON.parse(body.toString('utf8')))))
  // `shrinkText`: para páginas y scripts (no JSON): se guarda solo lo que devuelve (un JSON pequeño con las URL que hacen falta).
  if (src?.shrinkText) body = Buffer.from(src.shrinkText(body.toString('utf8')))
  if (body.length > MAX_BODY) throw new Error('respuesta demasiado grande')
  const entry = { body, gz: null, type: res.headers.get('content-type') ?? 'application/json', at: Date.now(), ttl }
  store(url, entry)
  return entry
}

/* ---------- refresco en segundo plano ---------- */
// Cada URL pedida se recuerda; el servidor la vuelve a consultar solo cuando caduca (sin esperar a una visita) y
// mientras tanto sirve lo último guardado. Así la carga hacia cada fuente no depende de cuántos visitantes haya.
const seen = new Map() // url -> { last, ttl }   (`last`: última vez que alguien la pidió)
const retryAt = new Map() // url -> ms antes de los cuales no se reintenta un refresco fallido
const FORGET = 7 * 24 * HOUR

function refresh(url, ttl) {
  let p = inflight.get(url)
  if (!p) {
    p = fetchUpstream(url, ttl)
      .then(entry => { retryAt.delete(url); dirty = true; return entry })
      .catch(err => { retryAt.set(url, Date.now() + Math.min(ttl / 4, 15 * MIN)); throw err })
      .finally(() => inflight.delete(url))
    inflight.set(url, p)
  }
  return p
}

/** Devuelve { entry, state } con state = HIT | MISS | STALE. Junta peticiones idénticas simultáneas. */
async function getCached(url, ttl) {
  const now = Date.now()
  seen.set(url, { last: now, ttl })
  const hit = cache.get(url)
  if (hit && now - hit.at < hit.ttl) return { entry: hit, state: 'HIT' }
  if (hit && now - hit.at < STALE_MAX) { // caducado: se sirve lo guardado y se renueva en segundo plano
    if (now >= (retryAt.get(url) ?? 0)) refresh(url, ttl).catch(() => {})
    return { entry: hit, state: 'STALE' }
  }
  return { entry: await refresh(url, ttl), state: 'MISS' }
}

let refreshing = false
async function refreshDue() {
  if (refreshing) return
  refreshing = true
  try {
    const now = Date.now()
    for (const [url, info] of [...seen]) {
      // Una URL que ya no es fuente permitida (p. ej. gachafocus apagado) se olvida en vez de renovarse.
      if (now - info.last > FORGET || !allowed(url)) { seen.delete(url); cache.delete(url); continue }
      const hit = cache.get(url)
      if (hit && now - hit.at < info.ttl) continue
      if (now < (retryAt.get(url) ?? 0)) continue
      await refresh(url, info.ttl).catch(() => {})
    }
  } finally { refreshing = false }
}

/* ---------- caché en disco: sobrevive a los reinicios ---------- */
const DATA_DIR = process.env.DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.cache')
const SNAPSHOT = path.join(DATA_DIR, 'proxy-cache.json')
const TEXTUAL = /^(text\/|application\/(json|javascript))/
let dirty = false

async function saveSnapshot() {
  if (!dirty) return
  dirty = false
  try {
    const entries = {}
    for (const [url, e] of cache) {
      if (!TEXTUAL.test(e.type)) continue
      entries[url] = { type: e.type, at: e.at, ttl: e.ttl, body: e.body.toString('utf8'), seen: seen.get(url) }
    }
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(`${SNAPSHOT}.tmp`, JSON.stringify(entries))
    await rename(`${SNAPSHOT}.tmp`, SNAPSHOT)
  } catch (err) { console.error(`[proxy] no se pudo guardar la caché: ${err.message}`) }
}

/** ¿La URL sigue siendo de una fuente permitida? (la caché en disco puede traer URLs de fuentes ya retiradas) */
function allowed(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && SOURCES.some(s => s.test(u)) } catch { return false }
}

async function loadSnapshot() {
  try {
    const entries = JSON.parse(await readFile(SNAPSHOT, 'utf8'))
    let n = 0
    for (const [url, e] of Object.entries(entries)) {
      if (Date.now() - e.at > STALE_MAX || !allowed(url)) continue
      store(url, { body: Buffer.from(e.body, 'utf8'), gz: null, type: e.type, at: e.at, ttl: e.ttl })
      if (e.seen) seen.set(url, e.seen)
      n++
    }
    if (n) console.log(`[proxy] caché restaurada: ${n} fuentes`)
  } catch { /* primera vez o archivo ilegible: se empieza vacía */ }
}

/* Pausas por sitio en disco: un reinicio del proceso no vuelve a mandar peticiones a un sitio que nos tiene bloqueados.
   (Un redeploy en Botkeep borra .cache/: entonces bastan BLOCK_AFTER rechazos para volver a la pausa larga.) */
const HOSTS_FILE = path.join(DATA_DIR, 'proxy-hosts.json')
function saveHosts() {
  const out = {}
  for (const [host, st] of hostState) if (st.fails) out[host] = { until: st.until, fails: st.fails }
  mkdir(DATA_DIR, { recursive: true })
    .then(() => writeFile(`${HOSTS_FILE}.tmp`, JSON.stringify(out)))
    .then(() => rename(`${HOSTS_FILE}.tmp`, HOSTS_FILE))
    .catch(err => console.error(`[proxy] no se pudieron guardar las pausas: ${err.message}`))
}
async function loadHosts() {
  try {
    const saved = JSON.parse(await readFile(HOSTS_FILE, 'utf8'))
    for (const [host, st] of Object.entries(saved)) {
      if (!hostState.has(host)) hostState.set(host, { until: Number(st.until) || 0, flip: false, fails: Number(st.fails) || 0 })
      if (Number(st.until) > Date.now()) console.log(`[proxy] ${host} sigue en pausa hasta ${new Date(Number(st.until)).toISOString()} (${st.fails} rechazos seguidos)`)
    }
  } catch { /* sin pausas guardadas */ }
}

loadSnapshot()
loadHosts()
setInterval(() => { refreshDue(); saveSnapshot() }, 5 * MIN).unref()
setTimeout(refreshDue, 30_000).unref() // tras un reinicio, renueva lo que ya caducó
/** Guarda la caché en disco (se llama al apagar el servidor). */
export const flushCache = saveSnapshot

/** Para el recolector del servidor: trae una fuente permitida con la misma caché, pausas y límites que el proxy HTTP. */
export async function sourceFetch(url) {
  let target
  try { target = new URL(url) } catch { return new Response('URL inválida', { status: 400 }) }
  const source = target.protocol === 'https:' && !target.username && SOURCES.find(s => s.test(target))
  if (!source) return new Response('Fuente no permitida', { status: 403 })
  try {
    const { entry } = await getCached(target.toString(), source.ttl)
    return new Response(entry.body, { status: 200, headers: { 'content-type': entry.type } })
  } catch (err) {
    // Igual que en /proxy: el motivo real (p. ej. "upstream 403", "upstream 503", un error de red) queda en el log; el recolector solo ve el 502.
    if (!/en pausa/.test(String(err.message))) console.error(`[proxy] ${source.name} ${target.pathname}: ${err.message ?? err}`)
    return new Response(String(err.message ?? err), { status: 502 })
  }
}

/* ---------- límite de peticiones por IP ---------- */
const buckets = new Map()
function limited(ip) {
  const now = Date.now()
  let b = buckets.get(ip)
  if (!b || now > b.reset) { b = { n: 0, reset: now + MIN }; buckets.set(ip, b) }
  b.n++
  return b.n > RATE_PER_MIN
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k) }, MIN).unref()

const clientIp = req => (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || req.socket.remoteAddress || 'unknown'

/* ---------- respuesta ---------- */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/

function send(res, status, headers, body) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers })
  res.end(body)
}

const acceptsGzip = req => /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')

/** Atiende GET /proxy?u=<url>. `url` es la URL de la petición ya interpretada. */
export async function handleProxy(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { allow: 'GET, HEAD' }, 'Método no permitido')
  if (limited(clientIp(req))) return send(res, 429, { 'retry-after': '60' }, 'Demasiadas peticiones')
  let target
  try { target = new URL(url.searchParams.get('u') ?? '') } catch { return send(res, 400, {}, 'URL inválida') }
  const source = target.protocol === 'https:' && !target.username && SOURCES.find(s => s.test(target))
  // Las fuentes internas (Discord, con el token del servidor) solo las usa el recolector.
  if (!source || source.internal) return send(res, 403, {}, 'Fuente no permitida')

  try {
    const { entry, state } = await getCached(target.toString(), source.ttl)
    const headers = {
      'content-type': entry.type,
      'cache-control': 'public, max-age=60',
      'x-cache': state,
      vary: 'accept-encoding',
    }
    let body = entry.body
    if (acceptsGzip(req) && COMPRESSIBLE.test(entry.type)) {
      entry.gz ??= await gzip(entry.body)
      body = entry.gz
      headers['content-encoding'] = 'gzip'
    }
    send(res, 200, headers, req.method === 'HEAD' ? undefined : body)
  } catch (err) {
    if (!/en pausa/.test(err.message)) console.error(`[proxy] ${source.name} ${target.pathname}: ${err.message}`)
    send(res, 502, { 'cache-control': 'no-store' }, 'La fuente no responde')
  }
}
