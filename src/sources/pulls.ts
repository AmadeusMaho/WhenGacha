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
  // Arknights: 600 Orundum por tirada; Headhunting Permit = 1 (y el de 10 = 10, que el aviso escribe aparte).
  arknights: [{ item: /^orundum$/i, per: 600 }, { item: /^headhunting permits?$/i, per: 1 }],
  // AFK Journey: Invite Letter = 1 tirada (All-Hero Recruitment); 300 Diamonds = 1 Invite Letter.
  afkjourney: [{ item: /^invite letters?$/i, per: 1 }, { item: /^diamonds?$/i, per: 300 }],
  // Infinity Nikki: Revelation Crystal = 1 tirada; la tienda lo vende por 120 Diamonds (wiki, página "Revelation Crystal").
  infinitynikki: [{ item: /^(limited-time )?revelation crystals?$/i, per: 1 }, { item: /^diamonds?$/i, per: 120 }],
  // 200 Dia = 1 tirada (= 1 Draw Ticket), confirmado por el dueño el 9 nov 2026. "Free Dia"/"Paid Dia" cuentan igual.
  bd2: [{ item: /^draw tickets?$/i, per: 1 }, { item: /^((free|paid) )?dias?$/i, per: 200 }],
  // Azur Lane: la construcción limitada (la de los banners de evento) cuesta 2 Wisdom Cubes + 1500 monedas; los grupos permanentes, 1 cubo
  // (wiki azurlane.koumakan.jp, página "Building"). Se cuenta a 2 cubos por tirada.
  azurlane: [{ item: /^wisdom cubes?$/i, per: 2 }],
  pgr: [{ item: /^black cards?$/i, per: 250 }, { item: /^(event|basic) construct r&d tickets?$/i, per: 250 }, { item: /^target weapon r&d tickets?$/i, per: 250 }],
  // Equivalencias añadidas el 9 nov 2026, cada una comprobada en su wiki o en guías que coinciden entre sí. Los billetes con cifra delante
  // ("1-Recruitment Ticket", "10-Recruitment Ticket" de Blue Archive) no los separa bien el lector de "Nombre xN", así que no se cuentan.
  // Blue Archive: 120 Pyroxene por reclutamiento (bluearchive.wiki, FAQ: "A 1 ticket = 120 pyroxene"; pity = 24.000 = 200 tiradas).
  // Billetes (confirmado por el dueño, 9 nov 2026): "1-Recruitment Ticket" = 1 tirada y "10-Recruitment Ticket" = 10 (un billete que tira 10).
  // `pullsIn` los reescribe antes como "Single/Ten Recruitment Ticket", porque el lector de "Nombre xN" no admite la cifra pegada al nombre.
  // "up to 200 FREE recruitments!" (5.º aniversario, nov 2026): reclutamientos gratis diarios = 1 tirada cada uno.
  bluearchive: [{ item: /^pyroxenes?$/i, per: 120 }, { item: /^single recruitment tickets?$/i, per: 1 }, { item: /^ten recruitment tickets?$/i, per: 0.1 }, { item: /^free recruitments?$/i, per: 1 }],
  // Limbus Company: extracción simple = 130 Lunacy (limbuscompany.wiki.gg, página "Lunacy").
  limbus: [{ item: /^lunacy$/i, per: 130 }],
  // Fate/Grand Order: 3 Saint Quartz por invocación (fategrandorder.fandom.com, "Saint Quartz"); Summon Ticket = 1.
  fgo: [{ item: /^saint quartz$/i, per: 3 }, { item: /^summon tickets?$/i, per: 1 }],
  // Honkai Impact 3rd: los suministros limitados cuestan 280 Crystals; cada Supply Card = 1 tirada (honkaiimpact3.fandom.com, "Supply").
  honkai3: [{ item: /^crystals?$/i, per: 280 }, { item: /^(expansion|focused|equipment|battlesuit|astralop) supply cards?$/i, per: 1 }],
  // Chaos Zero Nightmare: 160 Crystals = 1 Rescue Anchor (estándar) o Rescue Amplifier (limitado) = 1 tirada (Prydwen, guía "Gacha System").
  // "Signal Amplification Anchor" = 1 tirada del banner limitado (confirmado por el dueño, 9 nov 2026).
  czn: [{ item: /^crystals?$/i, per: 160 }, { item: /^rescue (anchor|amplifier)s?$/i, per: 1 }, { item: /^signal amplification anchors?$/i, per: 1 }],
  // Stella Sora: 300 Stellanite Dust por tirada (confirmado por el dueño, 9 nov 2026).
  stellasora: [{ item: /^stellanite dust$/i, per: 300 }],
  // Epic Seven: 5 Covenant Bookmarks por invocación; 100 Skystones = 5 Bookmarks = 1 tirada (confirmado por el dueño, 9 nov 2026).
  epic7: [{ item: /^covenant bookmarks?$/i, per: 5 }, { item: /^skystones?$/i, per: 100 }],
  // Arknights: Endfield: 500 Oroberyl por tirada; los HH Permit = 1 (Prydwen y varias guías, mismas cifras).
  endfield: [{ item: /^oroberyl$/i, per: 500 }, { item: /^(.+ )?(hh|headhunting) permits?$/i, per: 1 }],
  // Neverness to Everness: 160 Annulith por tirada; Solid Dice (limitado) y Fabricated Dice (estándar) = 1 (Prydwen y guías, mismas cifras).
  nte: [{ item: /^annulith$/i, per: 160 }, { item: /^(solid|fabricated) dice$/i, per: 1 }],
  // Umamusume: 150 Carats por scout; los Scout Ticket = 1 (guías de Sportskeeda, bo3.gg y Game8, mismas cifras).
  // Duet Night Abyss (Game8, "Myriad Gacha Currency", 12 nov 2026): 1 Hourglass por tirada; 160 Phoxene o Phoxene Plumule = 1 Hourglass.
  // Prismatic (banner limitado) y Pristine (permanente) cuentan los dos, como las Tides de WuWa. Solo hay gacha de cosméticos.
  dna: [{ item: /^(prismatic|pristine) hourglass(es)?$/i, per: 1 }, { item: /^phoxene( plumules?)?$/i, per: 160 }],
  // Trickcal: Chibi Go: 100 Crystal Leaf por reclutamiento, 1000 el x10 (Prydwen, "1 summon costs 100 Crystal Leafs"; lootandwaifus, "500 gems (5 singles)").
  // Recruitment Ticket = 1. Los Card Ticket (gacha de cartas) no cuentan.
  trickcal: [{ item: /^crystal lea(f|ves|fs)$/i, per: 100 }, { item: /^(special |rate-up )?recruitment tickets?$/i, per: 1 }],
  uma: [{ item: /^carats?$/i, per: 150 }, { item: /^((support card|character|uma musume) )?scout tickets?$/i, per: 1 }],
  // Girls' Frontline 2: Exilium (IOP Wiki, "Recruitment"): 150 Collapse Piece por tirada; Targeted Access Permission = 1 (banner limitado).
  // Access Permission es del banner permanente: se lista, pero no cuenta (como los billetes estándar de HoYoverse).
  gfl2: [{ item: /^collapse pieces?$/i, per: 150 }, { item: /^targeted access permissions?$/i, per: 1 }],
  // Monster Hunter Outlanders (GameWith, "How to Farm Rutacoin"): 150 Rutacoin por contrato; Featured Contract = 1 (banner destacado).
  // Standard Contract (permanente y rotatorio) no cuenta.
  mho: [{ item: /^rutacoins?$/i, per: 150 }, { item: /^featured contracts?$/i, per: 1 }],
  // BLEACH: Soul Resonance: 160 Spiritual Jade por tirada (guías de BlueStacks y BitTopup: "12,800 Jade" para el pity de 80). Los códigos lo
  // llaman también "Jades". El billete del banner limitado ("Limited Gacha Ticket", avisos oficiales) = 1; el de stamps ("Limited Stamp Gacha Ticket")
  // es del banner de armas y no cuenta.
  bleach: [{ item: /^(spiritual )?jades?$/i, per: 160 }, { item: /^limited gacha tickets?$/i, per: 1 }],
  // Onmyoji (wiki de Fandom, "Summon"): una invocación con Mystery Amulet = 1; con Jade, 100 por invocación ("Jade with 100 Jade").
  onmyoji: [{ item: /^mystery amulets?$/i, per: 1 }, { item: /^jades?$/i, per: 100 }],
  // Path to Nowhere: 180 Hypercubes por arresto, 1800 el x10 (guías de appgamer y hostedgg, mismas cifras; la wiki no tiene la tabla de precios).
  ptn: [{ item: /^hypercubes?$/i, per: 180 }],
  // Sword of Convallaria (BlueStacks, "SoC gacha guide"; GameWith, "How To Get Secret Fate"): 150 Hope Luxite o 1 Secret Fate por invocación.
  soc: [{ item: /^(hope )?luxites?$/i, per: 150 }, { item: /^secret fates?$/i, per: 1 }],
  // MONGIL: STAR DIVE (GameWith y Prydwen): el banner limitado usa Compass of Destiny (1 por tirada); 160 Starlight Crystal = 1 Compass.
  // Compass of Memory (artefactos) y Compass of Promise (permanente) no cuentan para el banner de personaje.
  mongil: [{ item: /^compass(es)? of destiny$/i, per: 1 }, { item: /^starlight crystals?$/i, per: 160 }],
}

const num = (s: string) => Number(s.replace(/,/g, ''))

export type PullGame = keyof typeof RULES

/** `game` sin reglas (p. ej. Azur Lane): se listan las recompensas, pero no se calculan tiradas. */
export function pullsIn(game: string, lines: string[]): { pulls: number; items: RewardItem[] } {
  const rules = RULES[game] ?? []
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
  for (const raw of lines) {
    // "10-Recruitment Ticket" (Blue Archive) → "Ten Recruitment Ticket": un nombre que empieza por letra, que es lo que leen las expresiones de abajo.
    const l = raw.replace(/\b10[- ]Recruitment Ticket/gi, 'Ten Recruitment Ticket').replace(/\b1[- ]Recruitment Ticket/gi, 'Single Recruitment Ticket')
    // Compensaciones de mantenimiento y precios no son recompensas del evento.
    if (/compensation|price:|cost|consumes|purchase/i.test(l)) continue
    // La x de multiplicar va tras un espacio o pegada a la cifra: "Apex 8" no es "Ape ×8" (BLEACH, "reach Apex 8 or above").
    for (const m of l.matchAll(/([A-Za-z][A-Za-z'& ]*?)(?:\s*×\s?|\s+x\s?|x(?=\d))(\d[\d,]*)/g)) { add(m[1], num(m[2])); addAny(m[1].split(/[,:;]/).pop() ?? '', num(m[2])) }
    for (const m of l.matchAll(/\b(\d[\d,]*)\s+([A-Z][A-Za-z' ]*?)(?=[,.;:)!]|\s+(?:and|to|from|in|for)\b|$)/g)) add(m[2], num(m[1]))
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
  // En la ficha, los billetes de Blue Archive con su nombre del juego.
  const shown = (n: string) => n.replace(/^Ten (?=Recruitment Ticket)/, '10-').replace(/^Single (?=Recruitment Ticket)/, '1-')
  return { pulls: Math.round(pulls * 10) / 10, items: items.slice(0, 10).map(i => ({ ...i, name: shown(i.name) })) }
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
