import type { Featured, GameEvent } from '../types'
import type { GameSync } from './ennead'
import { fileKey, fileUrls, wikitext } from './wikifiles'

/**
 * Onmyoji (NetEase; servidor global/inglés). Fuentes revisadas el 13 nov 2026:
 *  - Wiki de Fandom (onmyoji.fandom.com, API de MediaWiki; robots.txt lo permite), página "Events/Global": una tabla por año con la imagen
 *    oficial de cada evento (`[[File:Silent Snowprayer.png|250px]]`) y su periodo ("November 11th - December 8th", "9th September - 22nd
 *    September", "August 3rd - April 2027"). El nombre del evento es el del archivo. La wiki la actualiza el mismo día de cada parche.
 *    Banners: las convocatorias con probabilidad aumentada ("Memory Scrolls <shikigami> & <shikigami>", "Starry Return - …"); el nombre de
 *    los shikigami sale del título y su retrato de su página en la wiki (recolector, `withFeaturedIcons`).
 *  - Recompensas: SIN fuente. Los eventos actuales no tienen página propia en la wiki (solo la imagen) y los avisos oficiales (web de NetEase,
 *    X) no se pueden leer: los eventos salen sin recompensas ni tiradas.
 *  - Códigos: SIN fuente. Onmyoji global no publica códigos de canje con regularidad y ninguna web (PocketGamer, Game8, la wiki) mantiene una lista.
 *  - Steam (app 551170): sus avisos se quedaron en 2022; no sirve.
 * Horas: la tabla solo da días. El servidor global va en EST, UTC-5 (reloj "Server Time" de la portada de la wiki, plantilla "Clock": "GL
 * _ -5:00 EST"; y el aviso de feb 2018 "Server time (EST) display function is added"). Un solo servidor global: sin selector de región
 * (servers.ts). No se sabe a qué hora acaba el mantenimiento: el día entero, 00:00 → 23:59 (EST), marcado "≈". 2 consultas por ciclo (la página y las imágenes, caché de 12 h en el proxy).
 */
const HOST = 'onmyoji.fandom.com'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const TZ = -5

/** Convocatorias (banners): "Memory Scrolls X & Y", "Starry Return - X", "… Summoning", "Rate Up". */
const BANNER = /memory scrolls|starry return|summon(?:ing)?\b|rate[- ]up/i
/** Tiendas, packs, pases y aspectos: se muestran como campaña menor (ocultos por defecto). */
const MINOR = /\b(?:pass|gift|shop|vault|skins?|makeover|pack|accessories|follow us|tailor)\b/i

/** Un lado del periodo ("November 11th", "9th September", "April 2027", "Augutst 19th") → mes, día y año (si lo dice). */
function side(s: string): { m: number; d: number; y?: number } | null {
  const t = s.toLowerCase().replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1')
  const mon = /([a-z]{3,})/.exec(t)?.[1]
  // Erratas de la tabla ("Augutst"): basta con las tres primeras letras.
  const m = mon ? MONTHS.indexOf(mon.slice(0, 3)) : -1
  if (m < 0) return null
  const year = /\b(20\d{2})\b/.exec(t)?.[1]
  const day = /\b(\d{1,2})\b/.exec(t.replace(/\b20\d{2}\b/, ''))?.[1]
  return { m, d: day ? +day : year ? 28 : 1, y: year ? +year : undefined }
}

/** "November 11th - December 8th" (año del apartado) → [inicio, fin] en ms. */
export function onmyojiRange(s: string, year: number): [number, number] | null {
  const parts = s.split(/\s+[-–~]\s+|\s+to\s+/i)
  if (parts.length < 2) return null
  const a = side(parts[0]), b = side(parts[1])
  if (!a || !b) return null
  const ay = a.y ?? year
  const by = b.y ?? (b.m < a.m ? ay + 1 : ay)
  return [Date.UTC(ay, a.m, a.d, 0 - TZ), Date.UTC(by, b.m, b.d, 23 - TZ, 59, 59)]
}

/** Shikigami del título de una convocatoria: "Memory Scrolls Iwanaga Hime & SP Hyakuwa Hououka" → ["Iwanaga Hime", "SP Hyakuwa Hououka"]. */
export function onmyojiFeatured(title: string): Featured[] {
  const m = /(?:memory scrolls|starry return)\s*[-–:]?\s*(.+)$/i.exec(title.replace(/["“”]/g, ''))
  if (!m) return []
  return m[1].split(/\s*&\s*|\s*,\s*|\s+and\s+/).map(n => n.trim()).filter(n => n.length > 1 && !/^(rerun|summon)$/i.test(n))
    // "SP Hyakuwa Hououka" tiene su página como "SP Hououka": el nombre corto sirve para buscar el retrato.
    .map(name => ({ name, rarity: 5, full: /^SP\s+\S+\s+\S+/.test(name) ? `SP ${name.split(/\s+/).pop()}` : undefined }))
}

export async function syncOnmyoji(gameId: string): Promise<GameSync> {
  const text = await wikitext(HOST, 'Events/Global')
  const now = Date.now(), from = now - 3 * DAY, to = now + 120 * DAY
  const rows: { file: string; title: string; r: [number, number] }[] = []
  // Un apartado por año ("== 2026 =="), con filas "|[[File:…]]" y "|<periodo>".
  for (const sec of text.split(/^==\s*(?=\d{4}\s*==)/m).slice(1)) {
    const year = +sec.slice(0, 4)
    if (year < new Date(now).getUTCFullYear() - 1) continue
    for (const row of sec.split(/\n\|-/)) {
      const file = /\[\[File:([^|\]]+\.(?:png|jpe?g|gif|webp))/i.exec(row)?.[1]?.trim()
      const when = row.split('\n').map(l => l.replace(/^\|\s*/, '').trim()).find(l => l && !/^\[\[|^!|^\{\|/.test(l) && /[a-z]{3,}/i.test(l))
      const r = file && when ? onmyojiRange(when, year) : null
      if (!file || !r || r[1] < from || r[0] > to || r[1] <= r[0]) continue
      rows.push({ file, title: file.replace(/\.(png|jpe?g|gif|webp)$/i, '').replace(/\s+/g, ' ').replace(/^"|"$/g, '').trim(), r })
    }
  }
  if (!rows.length && !/\{\|/.test(text)) throw new Error('onmyoji: no se encontró la tabla de eventos')
  const images = await fileUrls(HOST, rows.map(x => x.file), 480).catch(() => new Map<string, string>())
  const events: GameEvent[] = rows.map(({ file, title, r }) => {
    const banner = BANNER.test(title)
    const featured = banner ? onmyojiFeatured(title) : []
    return {
      id: `${gameId}:${banner ? 'banner' : 'event'}:wiki:${title}:${new Date(r[0]).toISOString().slice(0, 10)}`, gameId,
      kind: banner ? 'banner' as const : 'event' as const, title, image: images.get(fileKey(file)),
      description: banner ? (/starry return/i.test(title) ? '⟦d.onmyojiReturn⟧' : '⟦d.onmyojiScrolls⟧') : undefined,
      start: new Date(r[0]).toISOString(), end: new Date(r[1]).toISOString(), items: [], featured, pulls: 0,
      minor: !banner && MINOR.test(title) ? true : undefined, source: 'api' as const, precision: 'approx' as const,
    }
  })
  return { events, patches: [], codes: [] }
}
