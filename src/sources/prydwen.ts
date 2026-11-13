import { viaProxy } from '../net'
import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * Banners desde la página de banners de Prydwen (prydwen.gg), que publica el inicio y el fin de cada uno
 * como instantes ISO exactos en atributos `data-start-<región>` / `data-end-<región>`.
 * Su robots.txt permite estas páginas con Crawl-delay de 10 s: el proxy las pide de una en una y las cachea 2 h.
 * Los eventos (que no son banners) no están en esta fuente.
 */
const SITE = 'https://www.prydwen.gg'
const DAY = 86_400_000

interface Config {
  slug: string
  /** Regiones en orden de preferencia (la primera que traiga fechas). */
  regions: string[]
  /** Ajusta el fin cuando la página no da la hora real de cierre; el resultado se marca como aproximado. */
  fixEnd?: (iso: string) => string
}

const HOUR = 3_600_000
/** NIKKE: los banners cierran a las 04:59:59 hora de Corea (UTC+9) del día de fin; Prydwen solo da un mediodía aproximado. */
const nikkeEnd = (iso: string) => {
  const kst = new Date(+new Date(iso) + 9 * HOUR)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 4, 59, 59) - 9 * HOUR).toISOString()
}

export const PRYDWEN: Record<string, Config> = {
  wuwa: { slug: 'wuthering-waves', regions: ['na', 'eu', 'asia'] },
  nte: { slug: 'neverness-to-everness', regions: ['na', 'eu', 'asia'] },
  czn: { slug: 'chaos-zero-nightmare', regions: ['global'] },
  nikke: { slug: 'nikke', regions: ['global'], fixEnd: nikkeEnd },
  // MONGIL: STAR DIVE (13 nov 2026): página bajo /other-games/, mismo formato; las tres regiones con las mismas horas.
  mongil: { slug: 'other-games/mongil-star-dive', regions: ['na', 'eu', 'asia'] },
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

/** Rareza máxima de la tarjeta ("5-star", "SSR", "S-Class"...) como número de estrellas. */
const stars = (s: string) => (/5|SSR|S-?class|S$/i.test(s) ? 5 : /4|SR|A-?class/i.test(s) ? 4 : undefined)

export async function syncPrydwen(gameId: string, key: keyof typeof PRYDWEN): Promise<GameSync> {
  const cfg = PRYDWEN[key]
  const res = await fetch(viaProxy(`${SITE}/${cfg.slug}/banners`))
  if (!res.ok) throw new Error(`prydwen ${cfg.slug} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const from = Date.now() - 3 * DAY

  const out: GameEvent[] = []
  const seen = new Set<string>()
  doc.querySelectorAll('article[data-banner-card]').forEach(card => {
    const timer = card.querySelector('[data-banner-timer]') as HTMLElement | null
    const name = text(card.querySelector('.banner-name'))
    if (!timer || !name) return
    const region = cfg.regions.find(r => timer.dataset[`start${cap(r)}`] && timer.dataset[`end${cap(r)}`])
    if (!region) return // fechas aún sin anunciar
    const start = new Date(timer.dataset[`start${cap(region)}`]!).toISOString()
    const end = cfg.fixEnd ? cfg.fixEnd(timer.dataset[`end${cap(region)}`]!) : new Date(timer.dataset[`end${cap(region)}`]!).toISOString()
    if (+new Date(end) < from || +new Date(end) <= +new Date(start)) return

    const weapon = card.getAttribute('data-category') === 'weapon'
    const phase = text(card.closest('[data-banner-block]')?.querySelector('.phase-summary h3'))
    const rank = stars(text(card.querySelector('.rarity')))
    const featured: Featured[] = weapon ? [] : [{ name, rarity: rank }]
    const id = `${gameId}:banner:${key}:${name}:${start}`
    if (seen.has(id)) return
    seen.add(id)
    out.push({
      id, gameId, kind: 'banner', title: name,
      description: [weapon ? '⟦d.weaponBanner⟧' : '⟦d.charBanner⟧', phase].filter(Boolean).join(' · '),
      image: card.querySelector('.banner-art img')?.getAttribute('src') ?? undefined,
      start, end, items: [], featured, pulls: 0, source: 'api',
      // Si la página marca la fecha como no anunciada, es una estimación.
      precision: timer.dataset[`unann${cap(region)}`] ? 'estimated' : cfg.fixEnd ? 'approx' : undefined,
    })
  })
  if (!out.length) throw new Error(`prydwen ${cfg.slug}: no se encontraron banners`)
  return { events: out, patches: [], codes: [] }
}

/** "na" -> "Na", para leer data-start-na con `dataset.startNa`. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
