/**
 * Descripción breve de un evento, al estilo de las fichas de Endfield (wiki.ts, `endfieldDetails`): una o dos frases que explican de qué va,
 * los requisitos (⟦d.efReq|…⟧) y, si quedan, hasta dos detalles con viñeta. Sin fechas ni horas (ya salen en la ficha), sin recompensas
 * (salen aparte, con su icono), sin compensaciones ni rótulos sueltos.
 *
 * Recibe el texto del apartado del evento ya partido en líneas (avisos oficiales, notas de versión, Discord, páginas de la wiki).
 * Pensado para todas las fuentes que ya descargan ese texto: no hace peticiones.
 */

const BULLET = /^[\s■□●○◆◇◈✦✧★☆•·▪▶►\-–*>]+/
/** Rótulo al principio de una línea de descripción: se quita y se queda el texto ("Event Intro: During the event…"). */
const INTRO = /^\[?(?:event\s+)?(?:intro(?:duction)?|details?|description|overview|guidelines?|gameplay|story(?:\s+intro)?|about(?:\s+the\s+event)?|how\s+to\s+(?:play|participate))\]?\s*[:：]\s*/i
/** Requisitos para participar. */
const REQ = /^\[?(?:participation\s+)?(?:requirements?|unlock(?:ing)?\s+(?:conditions?|requirements?)|eligibility|conditions?|unlocks?\s+(?:at|after|when|upon))\]?\s*[:：]?\s*/i
/** Líneas que no explican el evento. */
const SKIP = /\b(?:duration|period|event\s+time|schedule|available\s+(?:from|until|after)|starts?\s*:|ends?\s*:|rewards?\s*:|compensation|maintenance|server\s+time|utc|gmt|patch\s+notes?|dear\s+\w+|thank\s+you|stay\s+tuned|for\s+more\s+(?:info|details)|visit\s+the|check\s+(?:the|out)|follow\s+us|#\w+|https?:\/\/|note\s*:|hello\b|greetings\b|this\s+is\s+gm\b|after\s+the\s+event\s+ends|will\s+be\s+(?:automatically\s+)?(?:deleted|removed|invalid|converted)|not\s+be\s+returned|no\s+longer\s+be\s+able)/i
/** Notas, saludos y fragmentos que empiezan por puntuación (restos de comillas: '", the avatar frame…'). */
const JUNK = /^(?:※|["'”’,;:.)\]]|(?:hello|greetings|hi)\b)/i
const DATEISH = /\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}|\b\d{1,2}:\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:]$/, '')}…` : s)
const tidy = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/<[^>]+>/g, '').replace(/\[([^\]]+)\]/g, '$1').replace(/\s+/g, ' ').trim()
const words = (s: string) => s.split(/\s+/).filter(Boolean).length

/** Primera frase (o dos, si la primera es corta) de un párrafo. */
function sentences(s: string, max = 220): string {
  // Corta tras . ! ? seguidos de espacio y mayúscula, salvo abreviaturas ("Lv. 7", "No. 3", "Ver. 2") y enumeradores ("1. Complete…").
  const parts = s.split(/(?<!\b(?:Lv|No|Ver|vs|Mr|Ms|Dr|St|Vol|Ch|Pt|approx|e\.g|i\.e|\d))(?<=[.!?。])\s+(?=["“A-Z])/).map(x => x.trim()).filter(Boolean)
  let out = parts[0] ?? s
  if (out.length < 90 && parts[1]) out = `${out} ${parts[1]}`
  return cut(out, max)
}

export interface SummaryOptions {
  /** Nombre del evento: una línea que solo lo repite no es descripción. */
  title?: string
  /** Máximo de viñetas de detalle (por defecto 2). */
  details?: number
  /** false: el texto es de un solo evento (aviso propio, GFL2) y sus rótulos ("[Unlock Conditions]") no cortan el resumen. */
  sections?: boolean
}

/** Cabecera de otro apartado. */
const NEXT = /^(?:[■□◆◇✦]|\d+[.)]\s|\[[^\]]{3,80}\]\s*[A-Za-z0-9 &'-]{0,30}$|(?:experience improvements|bug fixes|optimi[sz]ations?|adjustments|fixes|other new content|new (?:outfits?|resonators?|weapons?|characters?|locations?|merch|challenges?|stories))\b)/i

/** Resume el apartado de un evento. Devuelve undefined si no hay ninguna frase que explique algo. */
export function summarize(lines: string[], opts: SummaryOptions = {}): string | undefined {
  const title = opts.title?.toLowerCase().replace(/[^a-z0-9]+/g, '')
  let req = ''
  // Rótulo de requisitos solo en su línea ("[Unlock Conditions]", GFL2): el requisito va en la siguiente.
  let reqNext = false
  const text: string[] = []
  let seen = false
  // Frases partidas en varias líneas (NIKKE: "Long ago," / "there was a Nikke…"): la línea que empieza en minúscula sigue a la anterior.
  const joined: string[] = []
  for (const raw of lines) {
    const t = raw.trim()
    if (joined.length && /^[a-z]/.test(t) && !/[.!?:。」"”)]$/.test(joined[joined.length - 1].trim())) joined[joined.length - 1] += ` ${t}`
    else joined.push(raw)
  }
  for (const raw of joined) {
    let l = tidy(raw.replace(BULLET, '')).replace(/^\d+[.)]\s+/, '')
    if (!l) continue
    // El apartado acaba en la siguiente cabecera (la primera línea es la del propio evento): "■ Cooling Supply Station", "✦ Events Update ✦",
    // "[Lahai-Roi Blocks] Leisure Event", "2) …", "Bug Fixes", "New Outfit: …". Sin esto se colaba el evento siguiente.
    if (seen && opts.sections !== false && NEXT.test(raw.trim()) && !(title && l.toLowerCase().replace(/[^a-z0-9]+/g, '').startsWith(title))) break
    seen = true
    if (reqNext) {
      reqNext = false
      if (!req && !DATEISH.test(l) && !REQ.exec(l)?.[0].trim()) { req = cut(l.replace(/[.。]$/, ''), 160); continue }
    }
    const r = REQ.exec(l)
    if (r && r[0].trim()) {
      const rest = l.slice(r[0].length).trim()
      if (!rest) reqNext = true
      else if (!req && !DATEISH.test(rest)) req = cut(rest.replace(/[.。]$/, ''), 160)
      continue
    }
    l = l.replace(INTRO, '')
    if (SKIP.test(l) || DATEISH.test(l) || JUNK.test(l)) continue
    // Restos de plantillas borradas: ", , or !" (nombres vacíos).
    if (/(?:^|\s)[,;](?:\s*[,;]|\s+(?:or|and)\s*[,;!.])/.test(l)) continue
    // Rótulos y títulos: sin verbo de frase, cortos o acabados en ":".
    if (/[:：]$/.test(l) || words(l) < 6) continue
    // Solo el título (o el título con una coletilla: "2) Endeavorer's Charm: Character Trial Stage").
    const flat = l.toLowerCase().replace(/^\d+[.)]\s*/, '').replace(/[^a-z0-9]+/g, '')
    if (title && (flat === title || (flat.startsWith(title) && words(l) < 12))) continue
    // Listas de recompensas ("Stellanite Dust ×450, Bottled Vigor Soda ×1"): salen aparte.
    if ((l.match(/[×x]\s?\d/g) ?? []).length >= 2) continue
    if (!text.some(t => t === l)) text.push(l)
  }
  if (!text.length && !req) return undefined
  const [lead, ...rest] = text
  const out = [lead && sentences(lead), req && `⟦d.efReq|${req}⟧`, ...rest.slice(0, opts.details ?? 2).map(d => `• ${sentences(d, 200)}`)].filter(Boolean)
  return out.length ? out.join('\n') : undefined
}

/** Añade el resumen a una descripción existente (p. ej. "⟦d.efType|…⟧"), sin repetirlo. */
export function withSummary(current: string | undefined, summary: string | undefined): string | undefined {
  if (!summary) return current
  if (!current) return summary
  return current.includes(summary) ? current : `${current}\n${summary}`
}

/** Wikitexto → texto: [[a|b]] → b, {{I|Nombre|n}} → "Nombre ×n", sin otras plantillas, negritas ni etiquetas. */
function wikiPlain(w: string): string {
  return w
    .replace(/\{\{\s*(?:I|Item)\s*\|([^|}]+)(?:\|(\d[\d,]*))?[^}]*\}\}/gi, (_m, n: string, q?: string) => (q ? `${n.trim()} ×${q}` : n.trim()))
    .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '')
    // {{Character Intro|Acheron}}, {{Color|buzz|texto}} → el último valor sin "="; el resto de plantillas se quita.
    .replace(/\{\{\s*[^{}|]+\|([^{}]*)\}\}/g, (_m, args: string) => args.split('|').map(a => a.trim()).filter(a => a && !a.includes('=')).pop() ?? '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '').replace(/<ref[\s\S]*?<\/ref>/gi, '').replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ').trim()
}

/**
 * Resumen desde la página de un evento en una wiki MediaWiki (HoYoverse en Fandom…). Prioridad: la plantilla {{Description|…}} (el texto del
 * juego, con apartados "'''Event Guidelines'''" / "'''Eligibility'''" separados por <br>), el parámetro description/quote del infobox y, si no,
 * el primer párrafo ("'''X''' is a Recurring Event where…"). Las viñetas de "Event Details"/"Gameplay" dan los detalles.
 */
export function wikiSummary(w: string, title?: string): string | undefined {
  const lines: string[] = []
  const desc = /\{\{\s*Description\s*\|([\s\S]*?)\}\}\s*(?:\n|$)/i.exec(w)?.[1]
  if (desc) {
    // "'''Eligibility'''<br>texto" → "Eligibility: texto"; cada apartado en su línea.
    for (const part of desc.replace(/'''([^']+?)'''\s*<br\s*\/?>/gi, '\n$1: ').split(/<br\s*\/?>|\n/i)) {
      const l = wikiPlain(part)
      if (l && !/^notes?:/i.test(l)) lines.push(l)
    }
  }
  const param = /^\s*\|\s*(?:description|desc|quote|intro)\s*=\s*(.+)$/im.exec(w)?.[1]
  if (param) lines.push(wikiPlain(param))
  if (!lines.length) {
    // Primer párrafo de texto (fuera de plantillas de varias líneas, tablas y cabeceras).
    const body = w.replace(/\{\{[\s\S]*?\}\}/g, m => (m.includes('\n') ? '' : m)).split('\n')
    const first = body.find(l => /^'''/.test(l.trim()) || (/^[A-Z]/.test(l.trim()) && l.trim().split(/\s+/).length > 8))
    if (first) lines.push(wikiPlain(first))
  }
  // "==Event Details==" con subapartados (HSR: ===Duration===, ===Requirements===, ===Summary===): el requisito va como tal y las viñetas
  // de Summary/Gameplay como detalles; Duration se descarta (las fechas ya salen en la ficha).
  const sec = /^==\s*(?:Event Details|Details|Gameplay|Overview)\s*==[ \t]*$([\s\S]*?)(?=^==[^=]|$(?![\s\S]))/im.exec(w)?.[1]
  if (sec) {
    let sub = ''
    for (const raw of sec.replace(/\{\|[\s\S]*?\|\}/g, '').split('\n')) {
      const l = raw.trim()
      const h = /^===+\s*(.+?)\s*===+$/.exec(l)
      if (h) { sub = h[1].toLowerCase(); continue }
      if (!/^\*(?!\*)/.test(l) || /duration|time|date/.test(sub)) continue
      const t = wikiPlain(l.slice(1))
      lines.push(/requirement|eligib|unlock/.test(sub) ? `Requirements: ${t}` : t)
    }
  }
  const out = summarize(lines, { title, sections: false })
  // "X is an Event in Version 7.1." no explica nada: fuera si hay algo más (requisitos, detalles).
  const parts = out?.split('\n') ?? []
  if (parts.length > 1 && /\bis an? [^.]*\b(?:event|battle pass)\b[^.]*\bversion [\d.]+\.?$/i.test(parts[0])) parts.shift()
  return parts.length ? parts.join('\n').replace(/^• /, '') : undefined
}

/**
 * Descripciones que ya traían las fuentes (ennead, Uma…): sin HTML ("<i>Fluffy Across the Blue</i>"), sin la fecha del aviso delante
 * ("As of 10:00 p.m., Aug 26, 2026 (UTC), …") y, si son largas, en la primera frase o dos, como los resúmenes. Las claves ⟦…⟧ se dejan.
 */
export function shortDescription(d: string | undefined): string | undefined {
  if (!d) return d
  const one = (l: string) => {
    const t = tidy(l).replace(/^(?:as of|from|starting)\b.{0,50}?\((?:UTC|GMT)[^)]*\),\s*/i, '').replace(/^[–-]\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*/, '')
      .replace(/^[a-z]/, c => c.toUpperCase())
    return t.length > 260 ? sentences(t, 260) : t
  }
  return d.split('\n').map(l => (/⟦/.test(l) ? l : one(l))).filter(Boolean).join('\n') || undefined
}
