import { viaProxy } from '../net'
import type { PromoCode } from '../types'

/**
 * Códigos de canje activos de juegos que no son de HoYoverse (los de HoYoverse, incluido Honkai Impact 3rd, vienen de ennead), desde la página de
 * códigos de su wiki de Fandom (API de MediaWiki; robots.txt lo permite). Solo la sección de códigos activos: desde el principio de la lista hasta el
 * primer apartado "Expired"/"Inactive". Formatos que entiende:
 *  - código: `<code>WUTHERINGGIFT</code>`, `'''NTEGIFT'''` o el texto de la primera celda;
 *  - recompensas: `{{Card List|Astrite*50;Shell Credit*10000|delim=;}}` (o con comas) y `{{Item Box|50|Clear Drop|6}}`.
 * 1 consulta por juego (caché de 12 h en el proxy).
 */
const PAGES: Record<string, { host: string; page: string }> = {
  wuwa: { host: 'wutheringwaves.fandom.com', page: 'Redemption Code' },
  reverse1999: { host: 'reverse1999.fandom.com', page: 'Promotional Code' },
  nte: { host: 'neverness-to-everness.fandom.com', page: 'Redemption Codes' },
}

export const hasWikiCodes = (api: string) => api in PAGES

const num = (s: string) => Number(s.replace(/[,.\s]/g, ''))

function rewardsOf(cell: string): string[] {
  const out: string[] = []
  for (const m of cell.matchAll(/\{\{\s*Card List\s*\|([^}]*)\}\}/gi)) {
    const body = m[1].split('|').filter(p => !/^\s*\w+\s*=/.test(p)).join('|')
    for (const part of body.split(/[;,]/)) {
      const [name, qty] = part.split('*').map(s => s.trim())
      if (name) out.push(qty && /^[\d,.]+$/.test(qty) ? `${name} ×${num(qty).toLocaleString('en-US')}` : name)
    }
  }
  for (const m of cell.matchAll(/\{\{\s*Item Box\s*\|\s*([\d,.]+)\s*\|\s*([^|}]+)/gi)) out.push(`${m[2].trim()} ×${num(m[1]).toLocaleString('en-US')}`)
  return out
}

export async function syncWikiCodes(api: string): Promise<PromoCode[]> {
  const cfg = PAGES[api]
  if (!cfg) return []
  const qs = new URLSearchParams({ action: 'parse', page: cfg.page, prop: 'wikitext', format: 'json', origin: '*' })
  const res = await fetch(viaProxy(`https://${cfg.host}/api.php?${qs}`))
  if (!res.ok) throw new Error(`${cfg.host} → HTTP ${res.status}`)
  const text: string = (await res.json())?.parse?.wikitext?.['*'] ?? ''
  // Solo hasta el primer apartado de caducados.
  const cut = text.search(/^=+\s*(Expired|Inactive|Past)\b/im)
  const active = cut > 0 ? text.slice(0, cut) : text
  const out: PromoCode[] = []
  const seen = new Set<string>()
  for (const row of active.split(/\n\|-/)) {
    const cells = row.split(/\n\||\|\|/).map(c => c.trim()).filter(Boolean)
    if (cells.length < 2 || /^!/.test(cells[0])) continue
    const raw = cells[0].replace(/<!--[\s\S]*?-->/g, '')
    const code = (/<code>\s*([^<]+?)\s*<\/code>/i.exec(raw)?.[1] ?? /'''\s*([^']+?)\s*'''/.exec(raw)?.[1] ?? raw.replace(/<[^>]*>|[{}|]/g, '')).trim()
    // Un código: una palabra sin espacios, letras y números.
    if (!/^[A-Za-z0-9]{4,30}$/.test(code) || seen.has(code.toUpperCase())) continue
    // NTE marca los caducados en una columna "Expired?".
    if (cells.some(c => /^\s*Yes\s*$/i.test(c))) continue
    const rewards = rewardsOf(cells.slice(1).join(' '))
    if (!rewards.length) continue
    seen.add(code.toUpperCase())
    out.push({ code, rewards })
  }
  return out
}
