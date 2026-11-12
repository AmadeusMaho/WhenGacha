import { viaProxy } from '../net'
import type { PromoCode } from '../types'
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
const PAGE = 'https://www.game.guide/bleach-soul-resonance-codes'
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

export async function syncBleachCodes(): Promise<PromoCode[]> {
  const res = await fetch(viaProxy(PAGE))
  if (!res.ok) throw new Error(`game.guide Bleach → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  // El bloque de activos es el que contiene el título "Active Codes"; el de caducados va aparte.
  const head = doc.querySelector('#active-codes')
  let box: Element | null = head?.parentElement ?? null
  while (box && !box.querySelector('.rcp-row')) box = box.parentElement
  if (!box || box.querySelector('#expired-codes')) throw new Error('game.guide Bleach: no se encontró la lista de códigos activos')
  const out: PromoCode[] = []
  for (const row of box.querySelectorAll('.rcp-row')) {
    const code = text(row.querySelector('.rcp-code'))
    if (!/^[A-Za-z0-9]{4,30}$/.test(code) || out.some(c => c.code.toUpperCase() === code.toUpperCase())) continue
    const cell = row.querySelector('.rcp-row-reward')?.cloneNode(true) as Element | undefined
    cell?.querySelectorAll('time').forEach(t => t.remove())
    // "100 Spiritual Jade, 2 Spiritual Power Nourishers" → "Spiritual Jade ×100"; "Free rewards" no dice nada.
    const rewards = text(cell).split(/\s*,\s*/).map(r => r.replace(/^(\d[\d,]*)\s+(.+)$/, '$2 ×$1')).filter(r => r && !/^free rewards?$/i.test(r))
    out.push({ code, rewards: rewards.slice(0, 6) })
  }
  return out
}

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
export async function syncBleach(): Promise<GameSync> {
  return { events: [], patches: [], codes: await syncBleachCodes() }
}
