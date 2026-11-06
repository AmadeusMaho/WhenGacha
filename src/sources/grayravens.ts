import { viaProxy } from '../net'
import type { GameEvent } from '../types'

/**
 * Imágenes para Punishing: Gray Raven desde GRAY RAVENS (grayravens.com, wiki de la comunidad en Miraheze, CC BY-SA 4.0).
 * Los eventos y horas siguen saliendo de la nota oficial de Kuro (kuro.ts); de aquí solo se toma el arte oficial que la wiki reproduce:
 *  - página de la versión (`/wiki/A_Comet's_Afterglow`): franja del parche (`Event-…-Banner.png`) y las imágenes de resumen
 *    (`Overview-…-1.png`: personaje nuevo, `-2.png`: arma y CUB nuevos);
 *  - página del personaje del banner (`/wiki/Leia:_Fortunaster`): retrato (`Character-…-Portrait.png`) e iconos de su arma y CUB.
 * robots.txt de Miraheze permite `/wiki/` (no `/w/` ni `?action=`): solo se piden esas dos páginas HTML, con caché de 12 h en el proxy.
 * Las imágenes se enlazan en static.wikitide.net (su robots.txt lo permite).
 */
const BASE = 'https://grayravens.com/wiki/'

const pageUrl = (title: string) => BASE + encodeURIComponent(title.trim().replace(/\s+/g, '_')).replace(/%3A/g, ':')

async function page(title: string): Promise<string> {
  const res = await fetch(viaProxy(pageUrl(title)))
  if (!res.ok) throw new Error(`grayravens ${title} → HTTP ${res.status}`)
  return res.text()
}

/** Todas las imágenes subidas que aparecen en la página: nombre de archivo → URL original (sin miniatura). */
function files(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of html.matchAll(/src="(?:https:)?\/\/static\.wikitide\.net\/pgrwiki\/(?:thumb\/)?([0-9a-f]\/[0-9a-f]{2})\/([^"/]+\.(?:png|jpe?g|webp))/gi)) {
    const name = decodeURIComponent(m[2])
    if (!out.has(name)) out.set(name, `https://static.wikitide.net/pgrwiki/${m[1]}/${m[2]}`)
  }
  return out
}

/** Miniatura de `px` de ancho (las imágenes de resumen pesan 3–4 MB a tamaño completo). */
const thumb = (url: string, px: number) => {
  const m = /^(https:\/\/static\.wikitide\.net\/pgrwiki\/)([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/.exec(url)
  return m ? `${m[1]}thumb/${m[2]}/${m[3]}/${px}px-${m[3]}` : url
}

const compact = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()

function find(all: Map<string, string>, re: RegExp): string | undefined {
  for (const [name, url] of all) if (re.test(name)) return url
  return undefined
}

/** Añade arte a los eventos y banners de PGR que no lo tengan. `version` = nombre de la versión ("A Comet's Afterglow"); `trials` = ids de las pruebas del personaje nuevo. */
export async function withGrayRavens(events: GameEvent[], version: string, trials = new Set<string>()): Promise<GameEvent[]> {
  const verFiles = files(await page(version))
  const overview = (n: number) => find(verFiles, new RegExp(`^Overview-.*-${n}\\.(png|jpe?g)$`, 'i'))
  const keyArt = overview(1)
  const gearArt = overview(2) ?? keyArt
  const strip = find(verFiles, /^Event-.*-Banner\.(png|jpe?g)$/i)

  // Personaje del banner principal: su página tiene el retrato y los iconos de su arma y CUB exclusivos.
  const charBanner = events.find(e => e.kind === 'banner' && e.featured.length && /:/.test(e.title))
  let charFiles = new Map<string, string>()
  if (charBanner) charFiles = await page(charBanner.title).then(files).catch(() => new Map<string, string>())
  const portrait = find(charFiles, /^Character-.*-Portrait\.(png|jpe?g)$/i)

  return events.map(e => {
    if (e.kind === 'banner') {
      if (e === charBanner) {
        return { ...e, image: e.image ?? (keyArt && thumb(keyArt, 1280)), featured: e.featured.map(f => ({ ...f, icon: f.icon ?? (portrait && thumb(portrait, 300)) })) }
      }
      // Banners de arma o CUB del mismo parche: "Weapon-EdgesoftheTwistedRibbon-Icon.png", "CUB-Vulpecula-Icon.png".
      const key = compact(e.title)
      const icon = [...charFiles, ...verFiles].find(([name]) => /^(Weapon|CUB)-/i.test(name) && compact(name.replace(/^(Weapon|CUB)-|-Icon\.\w+$/gi, '')) === key)?.[1]
      if (icon) return { ...e, image: e.image ?? (gearArt && thumb(gearArt, 1280)), featured: e.featured.length ? e.featured : [{ name: e.title, icon, rarity: 6 }] }
      return e
    }
    if (e.image) return e
    // Prueba del personaje nuevo: su arte; el resto de eventos del parche, la franja de la versión.
    if (trials.has(e.id) && keyArt) return { ...e, image: thumb(keyArt, 1280) }
    return strip ? { ...e, image: strip } : e
  })
}
