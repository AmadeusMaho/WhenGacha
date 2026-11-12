import { viaProxy } from '../net'
import type { GameSync } from './ennead'
import { parseNotices, type Message } from './discord'

/**
 * Avisos oficiales publicados en Steam (API pública `ISteamNews/GetNewsForApp`, sin clave; la misma que usa la página de noticias de cada juego).
 * Solo los anuncios de la propia página del juego (`feedname: steam_community_announcements`), no los artículos de prensa que Steam agrega.
 * Traen el texto completo de los avisos de versión y de eventos ("From 12:00, OCT 29 to 12:00, NOV 19", "Event Period: …"), con su hora y zona,
 * y se leen con el lector de avisos (`parseNotices`), como los de Discord. Revisado el 12 nov 2026.
 * 1 consulta por juego y ciclo (caché de 3 h en el proxy).
 */
export const STEAM_APPS: Partial<Record<string, number>> = {
  // DNA: notas de versión con el periodo de cada evento ("October 29, 2026, 10:00 – November 16, 2026, 17:00 (server time)"). Corrige a Game8.
  dna: 3950020,
  // Infinity Nikki: avisos de versión con sus eventos y banners (2.11, 12 nov 2026), aunque la wiki vaya atrasada.
  infinitynikki: 3164330,
  // Probados y descartados (12 nov 2026): Epic Seven (5019180; repite los avisos de STOVE, que ya se leen, con HTML suelto), Honkai 3rd (1671200;
  // "From 12:00, OCT 29 to 12:00, NOV 19", formato que el lector aún no entiende), Limbus (1973530), Blue Archive (3557620) y Uma (3224770):
  // sus avisos de Steam no traen periodos legibles. BLEACH y MHO no están en Steam.
}

/**
 * Zona de "(server time)" por juego. El lector usa una sola zona por aviso y los de DNA mezclan "(UTC+8)" (mantenimiento) con "(server time)"
 * (eventos): sin esto, los eventos salían en hora de Asia. DNA va en hora de América (UTC-5), como dna.ts y el selector de servidor.
 */
const SERVER_TIME: Partial<Record<string, string>> = { dna: 'UTC-5' }

const API = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/'
const DAY = 86_400_000
/** Las imágenes de los avisos van como "{STEAM_CLAN_IMAGE}/123/abc.png". */
const CLAN_IMG = 'https://clan.akamai.steamstatic.com/images'

/** BBCode de Steam → texto por líneas; las cabeceras ([h1]–[h3], [b] en su propia línea) pasan a "**…**", que el lector toma como título. */
export function steamText(bb: string): string {
  return bb
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, '')
    .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[previewyoutube[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, '')
    .replace(/\[h[1-3]\]([\s\S]*?)\[\/h[1-3]\]/gi, (_m, t: string) => `\n**${t.replace(/\[[^\]]+\]/g, '').trim()}**\n`)
    .replace(/^\s*\[b\]([^\n]{1,90}?)\[\/b\]\s*$/gim, (_m, t: string) => `**${t.trim()}**`)
    .replace(/\[\*\]/g, '\n• ')
    // Resto de etiquetas BBCode, también con atributos ("[p align=\"center\"]", "[url=…]") y el HTML que algunos avisos pegan.
    .replace(/\[\/?[a-z][a-z0-9]*(?:[= ][^\]]*)?\]/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\\[/g, '[').replace(/\\\]/g, ']')
    .replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ')
    .split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n')
}

interface NewsItem { gid: string; title: string; contents: string; date: number; feedname: string }

export async function syncSteamNews(gameId: string): Promise<GameSync> {
  const app = STEAM_APPS[gameId]
  if (!app) return { events: [], patches: [], codes: [] }
  const res = await fetch(viaProxy(`${API}?appid=${app}&count=15&maxlength=0&format=json`))
  if (!res.ok) throw new Error(`steam ${gameId} → HTTP ${res.status}`)
  const items = ((await res.json())?.appnews?.newsitems ?? []) as NewsItem[]
  const messages: Message[] = items
    .filter(n => n.feedname === 'steam_community_announcements' && Date.now() - n.date * 1000 < 45 * DAY)
    .map(n => {
      const img = /\{STEAM_CLAN_IMAGE\}(\S+?\.(?:png|jpe?g|gif|webp))/i.exec(n.contents)?.[1]
      return {
        id: n.gid, timestamp: new Date(n.date * 1000).toISOString(),
        // "After the October 20, 2026 update (UTC+8) – December 1, 2026, 05:00 (server time)": la zona de la actualización no es la del cierre;
        // se quita para que la línea use la del servidor.
        content: SERVER_TIME[gameId]
          ? `**${n.title}**\n${steamText(n.contents)}`.replace(/((?:update|maintenance))\s*\(UTC[+-]\d{1,2}\)(?=[^\n]*\(server time\))/gi, '$1')
            .replace(/\(server time\)/gi, `(${SERVER_TIME[gameId]})`)
          : `**${n.title}**\n${steamText(n.contents)}`,
        attachments: img ? [{ url: `${CLAN_IMG}${img}`, content_type: 'image/png' }] : undefined,
      }
    })
  const s = parseNotices(gameId, messages)
  // Títulos sin el "◆" de las cabeceras de DNA; fuera los rótulos que no son eventos ("Phase Ⅱ", "[Bard's Tome" sin cerrar).
  const events = s.events.map(e => ({ ...e, title: e.title.replace(/[\s◆◇■□✦]+$/u, '').trim() }))
    .filter(e => e.title.length > 2 && !/^phase\b/i.test(e.title) && e.title.split('[').length === e.title.split(']').length)
  return { ...s, events }
}
