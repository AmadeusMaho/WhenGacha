import { pocketGamerExpired, syncGameGuideCodes } from './codes'
import type { GameEvent } from '../types'
import type { GameSync } from './ennead'

/**
 * BLEACH: Soul Resonance (Nuverse; versión global de Crunchyroll / A PLUS JAPAN desde el 21 nov 2025). Fuentes revisadas el 12 nov 2026:
 *  - Códigos: "BLEACH: Soul Resonance Codes" de game.guide (/bleach-soul-resonance-codes; robots.txt solo cierra /api/). Comprueba la lista
 *    a diario y separa activos y caducados: `#active-codes` → `.rcp-row` con el código en `.rcp-code` y las recompensas en `.rcp-row-reward`.
 *  - Eventos y banners: SIN fuente web permitida. La web oficial (bleach-soulresonance.com) es la de Asia y carga sus noticias por JS desde
 *    otra API; su wiki de Fandom está abandonada (25 páginas, sin eventos); no hay página de eventos en Game8, GameWith, Prydwen ni
 *    lootandwaifus; las guías de banners (ldshop, BitTopup) son artículos sueltos sin fechas fiables. Llegan por Discord (canal "bleach" de
 *    DISCORD_CHANNELS, los anuncios oficiales seguidos en nuestro servidor); sin canal, solo hay códigos y el juego sale "En construcción".
 *  - Rotatorios: ninguno con calendario publicado.
 * 1 página de game.guide por ciclo (caché de 6 h en el proxy).
 */
export const syncBleachCodes = () => syncGameGuideCodes('bleach-soul-resonance-codes')

/**
 * Iconos de las recompensas: no hay wiki ni lista de objetos. Los únicos oficiales son los de las recompensas de prerregistro de la web global
 * (playbleachsr.com, `reg_0.png`…`reg_2.png` en el CDN de A PLUS JAPAN; CORS abierto). "Jades" (códigos) es el mismo Spiritual Jade.
 */
const CDN = 'https://game-cdn.aplusjapan-game.com/bleach_web/web'
export const BLEACH_ICONS = new Map<string, string>([
  ['spiritual jade', `${CDN}/reg_0.png`], ['jade', `${CDN}/reg_0.png`], ['jades', `${CDN}/reg_0.png`],
  ['kan', `${CDN}/reg_1.png`],
  ['sr character recruit letter', `${CDN}/reg_2.png`],
])

/** Sin eventos web (ver arriba): con canal de Discord, `syncSource` los añade y manda; aquí solo los códigos. */
/**
 * Banners con fecha que el canal de Discord no trajo (21 nov 2026): el aviso del aniversario anunció a Ichigo (Full Hollowfication) sin fecha y salía
 * "estimado" desde el 18 nov; PocketGamer (resumen del aviso oficial, 20 nov) da su llegada el 25 nov y una repesca de todos los SSR limitados desde
 * el 20 nov. Horas: las del resto de avisos de BLEACH (11:00 UTC). Fin sin anunciar: barra abierta. Cada semilla se apaga sola a los `maxDays`.
 * El estimado de Discord sobra en cuanto hay uno con fecha (dropAnnounced, ANNOUNCED_GUESS en index.ts) y le pasa su retrato.
 */
const SEEDS: { title: string; start: string; featured: string[]; description: string; maxDays: number }[] = [
  { title: 'Ichigo Kurosaki - Full Hollowfication', start: '2026-11-25T11:00:00.000Z', featured: ['Ichigo Kurosaki - Full Hollowfication'], description: '⟦d.charBanner⟧ · 1st Anniversary', maxDays: 21 },
  { title: 'Limited SSR Rerun', start: '2026-11-20T11:00:00.000Z', featured: [], description: '⟦d.charBanner⟧ · 1st Anniversary · all limited-time SSR characters', maxDays: 21 },
]

function seededBanners(now = Date.now()): GameEvent[] {
  const DAY = 86_400_000
  return SEEDS.filter(s => now < +new Date(s.start) + s.maxDays * DAY).map(s => ({
    id: `bleach:banner:seed:${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${s.start.slice(0, 10)}`, gameId: 'bleach', kind: 'banner' as const,
    title: s.title, description: s.description, start: s.start, end: new Date(Math.max(+new Date(s.start) + 14 * DAY, now + 7 * DAY)).toISOString(),
    items: [], featured: s.featured.map(name => ({ name, rarity: 5 })), pulls: 0, source: 'api' as const, official: true, open: true,
  }))
}

export async function syncBleach(): Promise<GameSync> {
  // game.guide tarda en mover los caducados: se quitan los que PocketGamer ya da por caducados (si responde).
  const [codes, expired] = await Promise.all([syncBleachCodes(), pocketGamerExpired('bleach-soul-resonance').catch(() => new Set<string>())])
  return { events: seededBanners(), patches: [], codes: codes.filter(c => !expired.has(c.code.toUpperCase())) }
}
