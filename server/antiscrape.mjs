// Freno a la recolección automatizada de los datos de WhenGacha (pedido del dueño, 13 nov 2026: "que no permita el scraping automatizado").
// robots.txt (public/robots.txt) lo pide a los robots que lo respetan; esto lo aplica en el servidor a las rutas de datos (/data/*.json y /proxy):
//  - rechaza (403) los User-Agent de rastreadores de IA y SEO conocidos y de las herramientas típicas de scraping (python-requests, curl, Scrapy,
//    navegadores sin interfaz…) y las peticiones sin User-Agent;
//  - rechaza las que otra web hace desde el navegador de sus visitantes (`Sec-Fetch-Site: cross-site`), para que nadie monte su página sobre
//    nuestras copias.
// La app en el navegador no se ve afectada (manda un User-Agent de navegador y `same-origin`), ni el Worker de respaldo (reenvía la petición
// original). No es infalible: quien finja ser un navegador pasa, pero el límite por IP (proxy.mjs) lo frena. Las páginas no se tocan, para que los
// buscadores sigan indexando la web.
const BOTS = /\b(?:GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|Google-Extended|Applebot-Extended|PerplexityBot|Bytespider|Amazonbot|meta-externalagent|FacebookBot|cohere-ai|Diffbot|Omgilibot|ImagesiftBot|Timpibot|DataForSeoBot|AhrefsBot|SemrushBot|MJ12bot|PetalBot)\b/i
const TOOLS = /\b(?:python-requests|python-urllib|aiohttp|httpx|Scrapy|curl|Wget|Go-http-client|okhttp|Java\/|libwww-perl|node-fetch|undici|axios|got\b|HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|colly|http\.rb|Ruby|PostmanRuntime|insomnia)\b/i

/** Motivo por el que se rechaza la petición, o null si pasa. */
export function scraperReason(req) {
  const ua = String(req.headers['user-agent'] ?? '').trim()
  if (!ua) return 'sin User-Agent'
  if (BOTS.test(ua)) return 'rastreador'
  if (TOOLS.test(ua)) return 'herramienta de scraping'
  if (String(req.headers['sec-fetch-site'] ?? '') === 'cross-site') return 'desde otra web'
  return null
}
