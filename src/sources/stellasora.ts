import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'
import { htmlText, parseNotices, type Message } from './discord'

/**
 * Stella Sora (servidor Global): banners ("Current banners") de la portada de su wiki comunitaria (stellasora.miraheze.org).
 * Cada banner trae su inicio y fin como instantes ISO con zona (UTC-7), es decir, hora exacta. La portada de Miraheze se
 * pide por `/wiki/` (el robots.txt de Miraheze solo bloquea `/w/`, donde vive su API). Los eventos no están aquí.
 */
const PAGE = 'https://stellasora.miraheze.org/wiki/Stella_Sora_Wiki'
const DAY = 86_400_000

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

export async function syncStellaSora(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(PAGE))
  if (!res.ok) throw new Error(`stellasora wiki → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const from = Date.now() - 3 * DAY

  const out: GameEvent[] = []
  const seen = new Set<string>()
  doc.querySelectorAll('.stellasora-home-banner').forEach(card => {
    const name = text(card.querySelector('.stellasora-home-banner__name'))
    const timer = card.querySelector('.stellasora-countdown')
    const s = timer?.getAttribute('data-start-time'), e = timer?.getAttribute('data-end-time')
    if (!name || !s || !e || isNaN(+new Date(s)) || isNaN(+new Date(e))) return
    const start = new Date(s).toISOString(), end = new Date(e).toISOString()
    if (+new Date(end) < from || +new Date(end) <= +new Date(start)) return
    const id = `${gameId}:banner:${name}:${start}`
    if (seen.has(id)) return
    seen.add(id)
    const src = card.querySelector('img')?.getAttribute('src')
    out.push({
      id, gameId, kind: 'banner', title: name,
      image: src ? (src.startsWith('//') ? `https:${src}` : src) : undefined,
      start, end, items: [], featured: [{ name }], pulls: 0, source: 'api',
    })
  })
  if (!out.length) throw new Error('stellasora wiki: no se encontraron banners')
  return { events: out, patches: [], codes: [] }
}

/**
 * Avisos oficiales de la web global (stellasora.global/news; la página pide la lista y cada aviso a `/api/resource/news?index=1&size=…&type=` y
 * `/api/resource/news/detail?id=…`, sin claves). Las notas de cada versión ("Version 2.1 Preview", "11/12 Version 2.1 Update Maintenance") traen
 * todos los eventos con hora exacta en UTC-7 ("Period: Nov. 26, 2026 21:00 – Dec. 03, 2026 19:59 (UTC-7)"; "after maintenance" = fin del
 * mantenimiento del aviso). Discord solo reenvía algunos tuits (2 de ~12 en la 2.1, 12 nov 2026). Se leen con el lector de avisos (`parseNotices`).
 * 1 lista + hasta 4 avisos por ciclo (caché de 3 h en el proxy).
 */
const WEB = 'https://stellasora.global/api/resource/news'
export async function syncStellaSoraNews(gameId: string): Promise<GameSync> {
  const res = await fetch(viaProxy(`${WEB}?index=1&size=12&type=`))
  if (!res.ok) throw new Error(`stellasora.global → HTTP ${res.status}`)
  const list = ((await res.json())?.data?.rows ?? []) as { id: number; title: string; type: string; publishTime: number }[]
  // Notas de versión, mantenimientos y avisos de eventos/reclutamientos recientes (no las noticias de concursos ni las FAQ).
  const wanted = list.filter(n => Date.now() - n.publishTime < 40 * DAY && /version|maintenance|recruitment|event|rerun/i.test(n.title) && !/contest|faq/i.test(n.title))
    .sort((a, b) => b.publishTime - a.publishTime).slice(0, 4)
  const messages: Message[] = []
  for (const n of wanted) {
    const d = await fetch(viaProxy(`${WEB}/detail?id=${n.id}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    const html: string = d?.data?.news?.content ?? ''
    if (html) messages.push({ id: String(n.id), content: `${n.title}\n${htmlText(html.replace(/&ndash;|&mdash;/g, '–').replace(/&times;/g, '×').replace(/&ge;/g, '≥'))}`, timestamp: new Date(n.publishTime).toISOString() })
  }
  if (!messages.length && !list.length) throw new Error('stellasora.global: sin avisos')
  const s = parseNotices(gameId, messages)
  const out: GameEvent[] = []
  for (const e0 of s.events) {
    // Cabeceras y sub-apartados que no son eventos: "Recruitment Period ✦", "Maintenance Period ✦", "Zone 2 – Enemy Vulnerability…",
    // la tienda del evento y cada pack de "Trekker's Picks".
    if (/✦|^zone \d|maintenance|bundle|\bset$|event shop/i.test(e0.title)) continue
    // "Limited Event: Map the Uncharted…" y "Map the Uncharted…" son el mismo.
    let e: GameEvent = { ...e0, title: e0.title.replace(/^Limited Event:\s*/i, '').trim() }
    // "Limited ★5 Trekker, Leafia" / "Limited ★5 Runic Disc, Beneath Billowing Sails": reclutamientos limitados.
    const rec = /^Limited ★\d\s+(Trekker|Runic Disc),\s*(.+)$/i.exec(e.title)
    if (rec) e = { ...e, kind: 'banner', title: rec[2].trim(), featured: [{ name: rec[2].trim() }] }
    // Aspectos de la tienda y la historia del evento (mismo periodo que el evento): menores.
    if (/appearance|style gallery|^limited event story/i.test(e.title)) e = { ...e, minor: true }
    if (out.some(o => o.kind === e.kind && o.title.toLowerCase() === e.title.toLowerCase() && o.start === e.start)) continue
    out.push(e)
  }
  return { ...s, events: out }
}
