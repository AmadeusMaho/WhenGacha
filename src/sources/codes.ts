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
  // Duet Night Abyss (12 nov 2026): "Phoxene x 450", "Coin x 300k".
  dna: 'Duet-Night-Abyss/archives/557781',
  // Monster Hunter Outlanders (12 nov 2026): segunda lista, junto a la de GameWith (mho.ts).
  mho: 'Monster-Hunter-Outlanders/archives/634765',
  aniimo: 'Aniimo/archives/619365',
}

/**
 * Listas de game.guide (/<juego>-codes; robots.txt solo cierra /api/): las revisa a diario y separa activos y caducados. `#active-codes` →
 * `.rcp-row` con el código en `.rcp-code` y las recompensas en `.rcp-row-reward` ("100 Spiritual Jade, 2 Spiritual Power Nourishers").
 * BLEACH (12 nov 2026) y NTE (26 nov 2026: la wiki de Fandom seguía con DREAMWALK0603, TOMATO100 y RACENOLIMIT, que Game8 da por caducados el
 * 1 nov, y no tenía CALLELYMS ni NTENIGHT1021). 1 página por juego, caché de 6 h en el proxy.
 */
export async function syncGameGuideCodes(page: string): Promise<PromoCode[]> {
  const res = await fetch(viaProxy(`https://www.game.guide/${page}`))
  if (!res.ok) throw new Error(`game.guide ${page} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  // El bloque de activos es el que contiene el título "Active Codes"; el de caducados va aparte.
  const head = doc.querySelector('#active-codes')
  let box: Element | null = head?.parentElement ?? null
  while (box && !box.querySelector('.rcp-row')) box = box.parentElement
  // Sin ninguno activo no hay filas en el bloque: lista vacía, no error.
  if (head && (!box || box.querySelector('#expired-codes'))) return []
  if (!box) throw new Error(`game.guide ${page}: no se encontró la lista de códigos activos`)
  const out: PromoCode[] = []
  for (const row of box.querySelectorAll('.rcp-row')) {
    const code = text(row.querySelector('.rcp-code'))
    if (!/^[A-Za-z0-9]{4,30}$/.test(code) || out.some(c => c.code.toUpperCase() === code.toUpperCase())) continue
    const cell = row.querySelector('.rcp-row-reward')?.cloneNode(true) as Element | undefined
    cell?.querySelectorAll('time').forEach(t => t.remove())
    // "100 Spiritual Jade, 2 Spiritual Power Nourishers" → "Spiritual Jade ×100"; "Free rewards" no dice nada.
    // Coma con espacio detrás: "20,000 Fons" es una cifra, no dos recompensas.
    const rewards = text(cell).split(/\s*,\s+/).map(r => r.replace(/^(\d[\d,]*)\s+(.+)$/, '$2 ×$1')).filter(r => r && !/^free rewards?$/i.test(r))
    out.push({ code, rewards: rewards.slice(0, 6) })
  }
  return out
}

/** Juegos cuya lista principal es la de game.guide; su wiki (PAGES) queda de respaldo. */
const GAMEGUIDE: Record<string, string> = { nte: 'neverness-to-everness-codes' }

export const hasWikiCodes = (api: string) => api in PAGES || api in GAME8_CODES || api in GAMEGUIDE

/**
 * Listas de códigos de PocketGamer (pocketgamer.com/<juego>/codes/; robots.txt "Allow: /"), para juegos sin wiki ni Game8 que las mantenga
 * (revisado el 13 nov 2026). Cada lista: un `<h2>` "Active … codes" y, debajo, `<li><strong>CÓDIGO</strong> - recompensas</li>` hasta el
 * apartado "Expired". Las recompensas vienen como "10 Premium Salmon Puree, 1 Purple Upgrade Stone" o "Hope Luxite x300"; algunas solo dicen
 * "rewards" (sin detalle). 1 página por juego, caché de 6 h en el proxy.
 */
/** `cut`: la lista va de más nueva a más vieja (AFK Journey): se corta en el primer código viejo en vez de quitar solo los que lo delatan. */
export async function syncPocketGamerCodes(slug: string, page = 'codes', cut = false): Promise<PromoCode[]> {
  // Sword Master Story la llama "coupon-codes" (/swordmaster-story/coupon-codes/).
  const res = await fetch(viaProxy(`https://www.pocketgamer.com/${slug}/${page}/`))
  if (!res.ok) throw new Error(`pocketgamer ${slug} → HTTP ${res.status}`)
  const all = pocketGamerCodes(new DOMParser().parseFromString(await res.text(), 'text/html'))
  const first = cut ? all.findIndex(c => staleCode(c)) : -1
  return first >= 0 ? all.slice(0, first) : all.filter(c => !staleCode(c))
}

/**
 * Código que delata ser viejo aunque una lista "activa" lo mantenga (PocketGamer no da fechas; 21 nov 2026: PtN LDPlayer2022, SoC PEACE2025EN,
 * AFK AFKJGIFT2024…): un año anterior al actual en el código, o una campaña de temporada fuera de su época (Navidad en dic–ene,
 * Halloween en oct–nov, April Fools en abril, Mooncake en sep–oct).
 */
export function staleCode(c: PromoCode, now = new Date()): boolean {
  const year = now.getUTCFullYear(), month = now.getUTCMonth()
  // Solo en el código: en las recompensas "2000 Gold" no es un año.
  if ([...c.code.matchAll(/(?<!\d)20(1[5-9]|2\d)(?!\d)/g)].some(m => 2000 + +m[1] < year)) return true
  const season: [RegExp, number[]][] = [[/santa|xmas|christmas/i, [11, 0]], [/pumpkin|halloween|jackolantern/i, [9, 10]], [/aprilfool/i, [3]], [/mooncake/i, [8, 9]]]
  return season.some(([re, months]) => re.test(c.code) && !months.includes(month))
}

/**
 * Códigos que PocketGamer da por caducados (lista bajo "Expired"/"Inactive", hasta el siguiente h2). Sirve para quitar los que otra fuente
 * sigue listando como activos (BLEACH, 21 nov 2026: game.guide mantenía THEEND, THEEND2, TEKKENTACHIKAZE… que PocketGamer ya da por caducados).
 */
export async function pocketGamerExpired(slug: string): Promise<Set<string>> {
  const res = await fetch(viaProxy(`https://www.pocketgamer.com/${slug}/codes/`))
  if (!res.ok) throw new Error(`pocketgamer ${slug} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/[\s ]+/g, ' ').trim() ?? ''
  const out = new Set<string>()
  const head = [...doc.querySelectorAll('h2, h3, h4, strong, b, p')].find(h => /^(?:expired|inactive)(?: [a-z ]*codes?)?:?$/i.test(text(h)))
  const top = head?.tagName === 'STRONG' || head?.tagName === 'B' ? head.parentElement : head
  for (let n = top?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling)
    for (const li of n.tagName === 'LI' ? [n] : [...n.querySelectorAll('li')]) {
      const code = /^([A-Za-z0-9_!]{4,30})(?=[\s:–-]|$)/.exec(text(li))?.[1]
      if (code) out.add(code.toUpperCase())
    }
  return out
}

export function pocketGamerCodes(doc: Document): PromoCode[] {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/[\s ]+/g, ' ').trim() ?? ''
  // "Active Stella Sora codes" (h2) o, en otras páginas, h2 "Epic Seven codes" + h3 "Active codes".
  // Aniimo (18 nov 2026): h2 "Aniimo codes" y, debajo, "Active" / "Expired" en negrita (un <strong> suelto), sin cabecera propia.
  // Sword Master Story (20 nov 2026): "Active Sword Master Story coupons".
  // Solo Leveling: ARISE (27 nov 2026): "Working Solo Leveling Arise codes".
  const head = [...doc.querySelectorAll('h2, h3')].find(h => /active|working/i.test(text(h)) && /codes?|coupons?/i.test(text(h)))
    ?? [...doc.querySelectorAll('strong, b')].find(h => /^active(?: codes?)?:?$/i.test(text(h)))
  if (!head) throw new Error('pocketgamer: no se encontró la lista de códigos activos')
  const out: PromoCode[] = []
  for (let n = head.nextElementSibling; n && !/^H2$/.test(n.tagName); n = n.nextElementSibling) {
    if (/^(?:H[3-4]|STRONG|B|P)$/.test(n.tagName) && /^(?:expired|inactive)\b/i.test(text(n))) break
    if (/^H[3-4]$/.test(n.tagName) && /expired|inactive/i.test(text(n))) break
    for (const li of n.tagName === 'LI' ? [n] : [...n.querySelectorAll('li')]) {
      const line = text(li)
      // Códigos con espacios en negrita al principio ("<strong>HAPPY NEW FEAR 2026 -</strong> 3x 10K Hero EXP…", "4M SURVIVORS", Resident Evil
      // Survival Unit, 20 nov 2026): el de la negrita entero. Solo si lleva espacio; los demás siguen por la expresión de siempre.
      const bold = li.firstElementChild?.tagName === 'STRONG' && line.startsWith(text(li.firstElementChild)) ? text(li.firstElementChild).replace(/[\s:–-]+$/, '') : ''
      const spaced = / /.test(bold) && /^[A-Z0-9][A-Z0-9 ]{2,28}[A-Z0-9]$/.test(bold) ? bold : ''
      const code = spaced || (/^([A-Za-z0-9_!]{4,30})(?=[\s:–-]|$)/.exec(line)?.[1] ?? '').trim()
      // Una frase ("There are no expired codes right now.") no es un código (los de PtN sí mezclan mayúsculas: "EternalStrings").
      if (!code || /^(?:there|no|these|this|all|we|the|currently|check)\b/i.test(line) || /\bno (?:active |expired |new )?codes?\b/i.test(line)
        || out.some(c => c.code.toUpperCase() === code.toUpperCase())) continue
      const rest = line.slice(code.length).replace(/^\s*[-–:]\s*/, '')
      const until = /\((?:expires?|until)\s+([^)]+)\)/i.exec(rest)?.[1]
      // "10 Premium Salmon Puree" → "Premium Salmon Puree ×10"; "Hope Luxite x300" → "Hope Luxite ×300"; "300k Gold" → "Gold ×300k".
      // Separador: la coma seguida de espacio ("10,000 Gold" es una sola cifra).
      const rewards = rest.replace(/\([^)]*\)/g, '').split(/\s*,\s+|\s+and\s+/).map(r => r.trim())
        .map(r => r.replace(/^(\d[\d,.]*[kK]?)\s+(.+)$/, '$2 ×$1').replace(/\s+x\s?(\d[\d,.]*[kK]?)$/i, ' ×$1'))
        .filter(r => r && !/^(rewards?|free rewards?|tba|-)$/i.test(r))
      out.push({ code, rewards: [...rewards.slice(0, 6), ...(until ? [`Until ${until.trim()}`] : [])] })
    }
  }
  return out
}

/**
 * Códigos de mobilematters.gg (/redeem-codes/<juego>; robots.txt solo cierra búsquedas y recursos internos). Azur Lane (14 nov 2026; la encontró el
 * dueño): un `<h2>` "New Codes for …" con una lista `<li>CÓDIGO</li>` (sin recompensas) y, aparte, "Expired … Codes", que no se lee.
 */
export async function syncMobileMattersCodes(slug: string): Promise<PromoCode[]> {
  const res = await fetch(viaProxy(`https://mobilematters.gg/redeem-codes/${slug}`))
  if (!res.ok) throw new Error(`mobilematters ${slug} → HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const head = [...doc.querySelectorAll('h2')].find(h => /new codes|active|working/i.test(text(h)) && !/expired/i.test(text(h)))
  const out: PromoCode[] = []
  for (let n = head?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
    for (const li of n.tagName === 'LI' ? [n] : [...n.querySelectorAll('li')]) {
      const m = /^([A-Za-z0-9_]{4,30})(?:\s*[-–:]\s*(.+))?$/.exec(text(li))
      if (m && !out.some(c => c.code === m[1])) out.push({ code: m[1], rewards: m[2] ? [m[2]] : [] })
    }
  }
  return out
}

/**
 * Respaldo de PocketGamer para los de Game8 (19 nov 2026): Game8 rechaza las IP de Botkeep y de GitHub Actions (su WAF), y CZN, Endfield y DNA
 * salían en producción sin ningún código. Si Game8 falla o no da nada, se usa PocketGamer; si responde, se le añaden los que solo tenga PocketGamer.
 */
const PG_FALLBACK: Record<string, string> = { czn: 'chaos-zero-nightmare', endfield: 'arknights-endfield', dna: 'duet-night-abyss' }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/**
 * Fin de la caducidad de un código («Until …» en sus recompensas), en ms; sin hora, el final de ese día (UTC). Formatos de las fuentes
 * (26 nov 2026): "November 17", "November 30th, 2026", "Dec 30", "DEC 11", "24 Nov 2026 (UTC)", "2026/12/31", "2026-12-07". Sin año, el más
 * cercano a hoy ("March 31st" en noviembre es el del año que viene).
 */
export function codeUntil(c: PromoCode, now = Date.now()): number | undefined {
  const raw = c.rewards.find(r => /^(?:valid )?until\b|^expires?\b/i.test(r))?.replace(/^(?:valid )?until|^expires?(?: on)?/i, '').trim()
  if (!raw) return undefined
  let y: number | undefined, m: number | undefined, d: number | undefined
  let k = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(raw)
  if (k) [y, m, d] = [+k[1], +k[2] - 1, +k[3]]
  else if ((k = /\b([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?\b(?:,? (\d{4}))?/.exec(raw)) && MONTHS.includes(k[1].slice(0, 3).toLowerCase()))
    [m, d, y] = [MONTHS.indexOf(k[1].slice(0, 3).toLowerCase()), +k[2], k[3] ? +k[3] : undefined]
  else if ((k = /\b(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})?/.exec(raw)) && MONTHS.includes(k[2].slice(0, 3).toLowerCase()))
    [d, m, y] = [+k[1], MONTHS.indexOf(k[2].slice(0, 3).toLowerCase()), k[3] ? +k[3] : undefined]
  if (m === undefined || d === undefined) return undefined
  const end = (yy: number) => Date.UTC(yy, m!, d!, 23, 59, 59)
  if (y !== undefined) return end(y)
  const cur = new Date(now).getUTCFullYear()
  return [cur - 1, cur, cur + 1].map(end).reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a))
}

/** Fuera los que ya pasaron su «Until …» (Game8 y otras listas los dejan entre los activos unos días). Un día de margen por la zona horaria. */
export function notExpired(codes: PromoCode[], now = Date.now()): PromoCode[] {
  return codes.filter(c => {
    const at = codeUntil(c, now)
    return at === undefined || now < at + 86_400_000
  })
}

export async function syncGame8Codes(api: string): Promise<PromoCode[]> {
  const pg = PG_FALLBACK[api]
  const [g8, alt] = await Promise.allSettled([game8Codes(api), pg ? syncPocketGamerCodes(pg) : Promise.resolve([] as PromoCode[])])
  const main = g8.status === 'fulfilled' ? g8.value : []
  const extra = alt.status === 'fulfilled' ? alt.value.filter(c => !main.some(m => m.code.toUpperCase() === c.code.toUpperCase())) : []
  if (g8.status === 'rejected' && (!pg || alt.status === 'rejected')) throw g8.reason
  return notExpired([...main, ...extra])
}

async function game8Codes(api: string): Promise<PromoCode[]> {
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
      const rewards = [...text(cells[1]).matchAll(/(?:[•・]\s*)?([A-Z][A-Za-z0-9'():\- ]{1,50}?)\s*x\s?(\d[\d,]*[kK]?)/g)].map(m => `${m[1].trim()} ×${m[2]}`)
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
  if (GAMEGUIDE[api]) {
    const gg = await syncGameGuideCodes(GAMEGUIDE[api]).catch(err => { console.warn(`[códigos] ${api} game.guide:`, (err as Error)?.message); return null })
    if (gg) return gg
  }
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
