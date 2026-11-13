import { viaProxy } from '../net'

/** Nombre de archivo normalizado para comparar ("File:Requiem_Skin1_Icon.png" → "requiem skin1 icon.png"). */
export const fileKey = (s: string) => s.replace(/^File:/i, '').replace(/_/g, ' ').trim().toLowerCase()

/**
 * URL (miniatura de `width` px) de cada archivo que exista en una wiki de MediaWiki (Fandom, wiki.gg), en lotes de 50 por consulta
 * (`prop=imageinfo`). Las wikis de wiki.gg no tienen PageImages, así que los iconos y las imágenes de eventos se piden por su nombre de
 * archivo. Devuelve nombre normalizado (`fileKey`) → URL; los que no existen no salen.
 */
export async function fileUrls(host: string, files: string[], width: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const list = [...new Set(files.filter(Boolean))]
  for (let i = 0; i < list.length; i += 50) {
    const qs = new URLSearchParams({ action: 'query', titles: list.slice(i, i + 50).map(f => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'url',
      iiurlwidth: String(width), format: 'json', formatversion: '2', origin: '*' })
    const res = await fetch(viaProxy(`https://${host}/api.php?${qs}`))
    if (!res.ok) throw new Error(`${host} imageinfo → HTTP ${res.status}`)
    const pages = ((await res.json())?.query?.pages ?? []) as { title: string; imageinfo?: { thumburl?: string; url: string }[] }[]
    for (const p of pages) {
      const info = p.imageinfo?.[0]
      if (info) out.set(fileKey(p.title), info.thumburl ?? info.url)
    }
  }
  return out
}

/** Texto (wikitext) de una página. */
export async function wikitext(host: string, page: string): Promise<string> {
  const qs = new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', redirects: '1', origin: '*' })
  const res = await fetch(viaProxy(`https://${host}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${host} ${page} → HTTP ${res.status}`)
  const j = await res.json()
  if (j?.error) throw new Error(`${host} ${page}: ${j.error.code}`)
  return j?.parse?.wikitext?.['*'] ?? ''
}
