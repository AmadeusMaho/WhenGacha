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

/**
 * Juegos sin página de códigos en su wiki: la lista "Redeem Codes" de Game8 (robots.txt no restringe a bots genéricos; ya se usa para eventos).
 * Cada fila de la tabla de activos: el código en `input.a-clipboard__textInput`, "Duration: November 3 - November 17" o "Expires TBA" y las
 * recompensas ("Lumina Lens x5", "T-Creds x8,000"). Se para en el primer apartado "Expired". 1 página por juego, caché de 6 h en el proxy.
 * Revisado el 9 nov 2026: Game8 no tiene páginas de NIKKE, AFK Journey, PGR, Arknights, Blue Archive, Limbus ni Azur Lane; la de Umamusume dice
 * que aún no hay códigos públicos (Global); Epic Seven y FGO no tienen página de códigos.
 */
const GAME8_CODES: Record<string, string> = {
  czn: 'Chaos-Zero-Nightmare/archives/557967',
  endfield: 'Arknights-Endfield/archives/571509',
}

export const hasWikiCodes = (api: string) => api in PAGES || api in GAME8_CODES

export async function syncGame8Codes(api: string): Promise<PromoCode[]> {
  const path = GAME8_CODES[api]
  if (!path) return []
  const res = await fetch(viaProxy(`https://game8.co/games/${path}`))
  if (!res.ok) throw new Error(`game8 códigos ${api} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const out: PromoCode[] = []
  // Las tablas de códigos van en orden: activos, después caducados (precedidos por un h2/h3 "Expired").
  for (const el of doc.querySelectorAll('h2, h3, table')) {
    if (el.tagName !== 'TABLE') { if (/expired|inactive/i.test(text(el))) break; continue }
    for (const row of el.querySelectorAll('tr')) {
      const cells = row.querySelectorAll('td')
      const code = cells[0]?.querySelector('input')?.getAttribute('value')?.trim()
      if (!code || !/^[A-Za-z0-9]{4,30}$/.test(code) || out.some(c => c.code.toUpperCase() === code.toUpperCase())) continue
      const info = text(cells[0])
      if (/expired/i.test(info)) continue
      const rewards = [...text(cells[1]).matchAll(/(?:•\s*)?([A-Z][A-Za-z0-9'():\- ]{1,50}?)\s*x\s?(\d[\d,]*)/g)].map(m => `${m[1].trim()} ×${m[2]}`)
      // "Duration: October 20 - November 19" → caducidad; "Only for PC Users" se conserva como aviso.
      const until = /Duration:.*?[-–]\s*([A-Z][a-z]+ \d{1,2}(?:, \d{4})?)/.exec(info)?.[1]
      const pc = /only for pc/i.test(info) ? ['PC only'] : []
      out.push({ code, rewards: [...rewards.slice(0, 6), ...pc, ...(until ? [`Until ${until}`] : [])] })
    }
  }
  return out
}

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
  if (!cfg) return syncGame8Codes(api)
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
