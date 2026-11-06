import { viaProxy } from '../net'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

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
