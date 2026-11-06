import { viaProxy } from '../net'

/**
 * Avisos oficiales de STOVE (Smilegate): la comunidad de Epic Seven y la de Chaos Zero Nightmare usan la misma API, la que usa su propia web
 * (api.onstove.com/cwms). No está documentada; se consulta con poca frecuencia y siempre por /proxy (ver SOURCES en server/proxy.mjs).
 */
export interface Article { article_id: string; title: string; summary?: string; create_datetime: number; media_thumbnail_url?: string }

/** Últimos `size` avisos de un tablón (el resumen trae unos 1000 caracteres del cuerpo). */
export async function articles(board: number, size: number): Promise<Article[]> {
  const url = `https://api.onstove.com/cwms/v3.0/article_group/BOARD/${board}/article/list?interaction_type_code=VIEW&content_yn=Y&summary_yn=Y&sort_type_code=LATEST&translation_yn=N&page=1&size=${size}`
  const res = await fetch(viaProxy(url))
  if (!res.ok) throw new Error(`stove ${board} → HTTP ${res.status}`)
  const json = await res.json() as { value?: { list?: Article[] } }
  return json.value?.list ?? []
}

const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/[ \t]+/g, ' ')

/**
 * Cuerpo completo de un aviso, una línea de texto por entrada. Las imágenes quedan como líneas `@@IMG https://...` en su sitio,
 * para poder asociar cada sección con su imagen.
 */
export async function bodyLines(id: string): Promise<string[]> {
  const res = await fetch(viaProxy(`https://api.onstove.com/cwms/v3.0/article?article_id=${id}&translation_yn=N`))
  if (!res.ok) throw new Error(`stove aviso ${id} → HTTP ${res.status}`)
  const html = ((await res.json()) as { value?: { content?: string } }).value?.content ?? ''
  return html
    .replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi, (_m, src: string) => `\n@@IMG ${sized(src.startsWith('//') ? `https:${src}` : src)}\n`)
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .split('\n').map(l => clean(l).trim()).filter(Boolean)
}

/** Cuerpo completo como un solo texto (sin las marcas de imagen). */
export async function bodyText(id: string): Promise<string> {
  return (await bodyLines(id)).filter(l => !l.startsWith('@@IMG ')).join('\n')
}

/** Las imágenes de STOVE pesan MB: su servicio de redimensionado las sirve a 850 px en WebP (~60 KB). */
export function sized(url: string | undefined): string | undefined {
  const m = url && /^https?:\/\/(d2x8kymwjom7h7\.cloudfront\.net\/.+)$/.exec(url)
  return m ? `https://image.onstove.com/850x0//${m[1]}/webp` : url
}

export const thumb = (a: Article): string | undefined => sized(a.media_thumbnail_url ? (a.media_thumbnail_url.startsWith('//') ? `https:${a.media_thumbnail_url}` : a.media_thumbnail_url) : undefined)
