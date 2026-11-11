// Contador de visitas en el log del servidor (Botkeep → Logs, Render → Logs). Solo cuenta cargas de la página (index.html),
// no recursos, API ni /healthz, y descarta bots y monitores (UptimeRobot visita la raíz de Render cada 5 min).
//
// Privacidad: no se guarda ni se registra la IP ni el navegador. Para contar "visitantes únicos" se usa una huella SHA-256 de
// IP + navegador + día con una sal aleatoria que solo vive en memoria (cambia en cada arranque), y se olvida al cambiar el día.
//
// Cada servidor cuenta lo suyo: con el respaldo de Cloudflare, las visitas que atiende Render salen en el log de Render.
// Se reinicia con cada deploy. Para cifras de verdad (por días, países…): Cloudflare → whengacha.site → Analytics.
import { createHash, randomBytes } from 'node:crypto'

const BOT = /bot|crawl|spider|slurp|uptime|monitor|pingdom|statuscake|headless|lighthouse|preview|facebookexternalhit|embedly|curl|wget|python|go-http|node-fetch|axios/i
const SALT = randomBytes(16)

let day = ''
let views = 0
const visitors = new Set()

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: process.env.VISITS_TZ || 'Etc/GMT+3' }) // GMT-3 (Etc/ va con el signo al revés) // AAAA-MM-DD

function rollDay() {
  const d = today()
  if (d === day) return
  if (day && views) console.log(`[visitas] resumen del ${day}: ${views} visitas, ${visitors.size} visitantes únicos`)
  day = d; views = 0; visitors.clear()
}

/** Llamar al servir index.html. `ip` ya resuelta (x-forwarded-for). */
export function countVisit(req, ip) {
  const ua = String(req.headers['user-agent'] ?? '')
  if (!ua || BOT.test(ua)) return
  // Solo navegaciones de verdad: el service worker y los prefetch piden el HTML con otros Accept/Sec-Fetch-Mode.
  const mode = req.headers['sec-fetch-mode']
  if (mode && mode !== 'navigate') return
  if (!String(req.headers.accept ?? '').includes('text/html')) return
  rollDay()
  views++
  const h = createHash('sha256').update(SALT).update(ip).update('|').update(ua).update('|').update(day).digest('hex').slice(0, 16)
  const isNew = !visitors.has(h)
  if (isNew) visitors.add(h)
  if (visitors.size > 50_000) visitors.clear() // tope de memoria; no debería pasar
  const lang = String(req.headers['accept-language'] ?? '').slice(0, 2) || '?'
  const mobile = /Mobi|Android|iPhone/i.test(ua) ? 'móvil' : 'escritorio'
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`
  console.log(`[visitas] ${isNew ? 'nuevo visitante' : 'otra vez'} (${mobile}, ${lang}) · hoy: ${n(views, 'visita', 'visitas')}, ${n(visitors.size, 'único', 'únicos')}`)
}

// Resumen del día también cuando no entra nadie justo después de medianoche.
setInterval(rollDay, 10 * 60_000).unref()
