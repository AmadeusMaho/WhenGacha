import type { RewardItem } from '../types'

/**
 * Tiradas que da un evento según el texto de su aviso oficial ("Radiant Tide x5", "Clear Drop x400", "10 Advanced Recruit Vouchers").
 * Como `pullsOf` de HoYoverse (ennead.ts): cada billete de tirada cuenta 1 y la moneda premium se divide por lo que cuesta una tirada.
 * Solo juegos cuyos avisos detallan las recompensas; si un aviso no las da, el evento queda con 0 (= desconocido, sin veredicto).
 */
const RULES: Record<string, { item: RegExp; per: number }[]> = {
  // Wuthering Waves: 160 Astrite por tirada; Radiant (limitada), Forging (armas) y Lustrous (estándar) Tide = 1 tirada.
  wuwa: [{ item: /^astrites?$/i, per: 160 }, { item: /^(radiant|forging|lustrous) tides?$/i, per: 1 }],
  // Reverse: 1999: 180 Clear Drop por tirada; Unilog = 1 tirada.
  reverse1999: [{ item: /^clear drops?$/i, per: 180 }, { item: /^unilogs?$/i, per: 1 }],
  // NIKKE: 300 Gems por tirada; Advanced Recruit Voucher = 1 tirada.
  // NIKKE: 300 Gems por tirada; Advanced Recruit Voucher = 1 tirada; los vales del reclutamiento selectivo ("Selective Recruitment (Exclusive) Vouchers") también = 1.
  nikke: [{ item: /^gems?$/i, per: 300 }, { item: /^advanced recruit vouchers?$/i, per: 1 }, { item: /^selective recruitment( exclusive)? vouchers?$/i, per: 1 }],
  // HoYoverse (las mismas equivalencias que `pullsOf` en ennead.ts): 160 de la moneda premium por tirada; cada billete = 1.
  genshin: [{ item: /^primogems?$/i, per: 160 }, { item: /^(intertwined|acquaint) fates?$/i, per: 1 }],
  starrail: [{ item: /^stellar jades?$/i, per: 160 }, { item: /^star rail (special )?pass(es)?$/i, per: 1 }],
  zenless: [{ item: /^polychromes?$/i, per: 160 }, { item: /^(encrypted )?master tapes?$/i, per: 1 }],
  // Punishing: Gray Raven: cada investigación cuesta 250 Black Card o 250 billetes ("Research Consumption: 250 Event Construct R&D Tickets for each
  // research attempt", nota de versión 4527); algunos banners de colaboración bajan a 175-180, así que la cifra es un mínimo.
  pgr: [{ item: /^black cards?$/i, per: 250 }, { item: /^(event|basic) construct r&d tickets?$/i, per: 250 }, { item: /^target weapon r&d tickets?$/i, per: 250 }],
}

const num = (s: string) => Number(s.replace(/,/g, ''))

export type PullGame = keyof typeof RULES

export function pullsIn(game: PullGame, lines: string[]): { pulls: number; items: RewardItem[] } {
  const rules = RULES[game]
  const found = new Map<string, number>()
  // Todas las recompensas "Nombre xN" del bloque (para la ficha del evento), aunque no sean tiradas.
  const all = new Map<string, number>()
  const addAny = (name: string, amount: number) => {
    const n = name.trim().replace(/^.*?(?:rewards?|obtain|get|claim|earn|receive)\s*:?\s*/i, '').replace(/^(and|or|the|a)\s+/i, '').trim()
    const words = n.split(/\s+/)
    if (!amount || !n || words.length > 5 || !/^[A-Z]/.test(n)) return
    all.set(n, (all.get(n) ?? 0) + amount)
  }
  const add = (name: string, amount: number) => {
    // "Players can get Unilog" → se prueban las últimas 1–4 palabras ("Unilog", "get Unilog"…).
    const words = name.trim().split(/\s+/)
    const n = [1, 2, 3, 4, 5].map(k => words.slice(-k).join(' ')).find(c => rules.some(r => r.item.test(c)))
    if (!amount || !n) return
    found.set(n, (found.get(n) ?? 0) + amount)
  }
  for (const l of lines) {
    // Compensaciones de mantenimiento y precios no son recompensas del evento.
    if (/compensation|price:|cost|consumes|purchase/i.test(l)) continue
    for (const m of l.matchAll(/([A-Za-z][A-Za-z'& ]*?)\s*[x×]\s?(\d[\d,]*)/g)) { add(m[1], num(m[2])); addAny(m[1].split(/[,:;]/).pop() ?? '', num(m[2])) }
    for (const m of l.matchAll(/\b(\d[\d,]*)\s+([A-Z][A-Za-z' ]*?)(?=[,.;:)]|\s+(?:and|to|from|in|for)\b|$)/g)) add(m[2], num(m[1]))
  }
  let pulls = 0
  const items: RewardItem[] = []
  for (const [name, amount] of found) {
    const r = rules.find(r => r.item.test(name))!
    pulls += amount / r.per
    items.push({ name, amount })
  }
  // Primero las de tirada; después el resto de recompensas del aviso (máx. 10 en total).
  for (const [name, amount] of all) if (!items.some(i => i.name.toLowerCase() === name.toLowerCase() || name.toLowerCase().endsWith(i.name.toLowerCase()))) items.push({ name, amount })
  return { pulls: Math.round(pulls * 10) / 10, items: items.slice(0, 10) }
}

/**
 * Trozo de texto de cada evento: desde su título hasta el siguiente título posterior a su duración. Las cabeceras que no dieron evento
 * (p. ej. "Sign-in Event" con sus partes I y II debajo) se suman al evento siguiente.
 * `titles`: índices de todas las líneas de título; `marks`: título y línea de duración de cada evento, en orden.
 */
export function segments(n: number, titles: number[], marks: { title: number; dur: number }[]): [number, number][] {
  const t = [...titles].sort((a, b) => a - b)
  const own = new Set(marks.map(m => m.title))
  let prevEnd = 0
  return marks.map(m => {
    const end = t.find(x => x > m.dur) ?? n
    let start = m.title
    for (let j = t.indexOf(m.title) - 1; j >= 0 && t[j] >= prevEnd && !own.has(t[j]); j--) start = t[j]
    prevEnd = end
    return [start, end]
  })
}
