import { viaProxy } from '../net'
import type { Featured, GameEvent, Kind, Patch, RewardItem } from '../types'
import type { GameSync } from './ennead'
import { pullsIn } from './pulls'

/**
 * Fire Emblem Heroes (Intelligent Systems / Nintendo; un solo servidor mundial). Fuente revisada el 20 nov 2026:
 *  - **Fire Emblem Heroes Wiki** (feheroes.fandom.com; contenido CC BY-SA). Sus tablas Cargo tienen TODO con hora exacta en UTC (los reinicios del
 *    juego son a las 07:00 UTC): banners (`SummoningEvents` + `SummoningEventFocuses`, con los héroes destacados y su nombre/título en `Units`),
 *    eventos (Forging Bonds, Voting Gauntlet, Hall of Forms, Tempest Trials, Grand Conquests, Mjölnir's Strike, Summoner Duels, Divine Games, Røkkr
 *    Sieges, Pawns of Loki, Lost Lore, Frontline Phalanx, Seer's Snare, Tap Battle, Affinity Auto-Battles, Binding Worlds, Heroes Journey, United
 *    Warfront, Allegiance Battles, Resonant Battles), bonificaciones de inicio de sesión de evento (`LogInBonus`), temporadas de Arena y Aether
 *    Raids, versiones (`VersionUpdates`) y las recompensas de cada evento (`…Rewards`, con el icono del objeto en `Items`).
 *    La wiki carga los datos del juego en cuanto salen, así que también trae **lo próximo** (banners y eventos de los días siguientes).
 *  - **Límite de la wiki**: su API `cargoquery` corta tras 2–3 consultas seguidas ("ratelimited"). Por eso todas las consultas van dentro de UNA
 *    petición `action=parse` (cada una como `{{#cargo_query:…|format=table}}`), más otra para las recompensas y una de `imageinfo` para los retratos
 *    («<Unidad> Face FC.webp») y los iconos de objetos: 3 peticiones por ciclo (caché de 12 h en el proxy, 6 s entre peticiones).
 *  - **Códigos**: FEH no tiene códigos de canje (Nintendo reparte Orbes con bonificaciones de inicio de sesión y misiones): no hay lista.
 *  - Tiradas: 5 Orbes la primera de cada sesión de 5 y 4 las siguientes (20 por sesión completa): 4 Orbes por tirada (RULES de pulls.ts).
 */
const API = 'https://feheroes.fandom.com/api.php'
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Tablas de eventos: nombre en la app (si la página no lo trae) y clave de descripción. `rewards`: tabla de recompensas con las mismas fechas. */
const EVENTS: { table: string; desc: string; rewards?: string; fields?: string; title?: (r: Row) => string }[] = [
  { table: 'ForgingBonds', desc: 'd.fehForging', rewards: 'ForgingBondsRewards', fields: 'Name=N', title: r => r.N && `Forging Bonds: ${r.N}` },
  { table: 'VotingGauntlets', desc: 'd.fehVG', rewards: 'VotingGauntletRewards', fields: 'Name=N', title: r => r.N && `Voting Gauntlet: ${r.N}` },
  { table: 'HallOfForms', desc: 'd.fehHoF', rewards: 'HallOfFormsRewards', fields: 'Image=I' },
  { table: 'TempestTrials', desc: 'd.fehTT', rewards: 'TempestTrialsRewards', fields: 'FullName=N,BonusHeroes=H', title: r => r.N && `Tempest Trials+: ${r.N}` },
  { table: 'GrandConquests', desc: 'd.fehGC', rewards: 'GrandConquestsRewards' },
  { table: 'MjolnirsStrike', desc: 'd.fehMS', rewards: 'MjolnirsStrikeRewards', fields: 'Image=I' },
  { table: 'EventsSummonerDuels', desc: 'd.fehSD', rewards: 'EventsSummonerDuelsRewards' },
  { table: 'DivineGames', desc: 'd.fehDivine' },
  { table: 'RokkrSieges', desc: 'd.fehRokkr', rewards: 'RokkrSiegesRewards' },
  { table: 'PawnsOfLoki', desc: 'd.fehPawns', rewards: 'PawnsOfLokiRewards' },
  { table: 'LostLore', desc: 'd.fehLore', rewards: 'LostLoreRewards' },
  { table: 'FrontlinePhalanx', desc: 'd.fehPhalanx', rewards: 'FrontlinePhalanxRewards' },
  { table: 'SeersSnare', desc: 'd.fehSnare', rewards: 'SeersSnareRewards' },
  { table: 'TapBattles', desc: 'd.fehTap', rewards: 'TapBattleRewards' },
  { table: 'AffinityAutoBattles', desc: 'd.fehAuto', rewards: 'AffinityAutoBattlesRewards' },
  { table: 'BindingWorlds', desc: 'd.fehBinding', rewards: 'BindingWorldsRewards' },
  { table: 'HeroesJourney', desc: 'd.fehJourney', rewards: 'HeroesJourneyRewards' },
  { table: 'UnitedWarfront', desc: 'd.fehWarfront', rewards: 'UnitedWarfrontRewards' },
  { table: 'AllegianceBattles', desc: 'd.fehAllegiance' },
  { table: 'ResonantBattles', desc: 'd.fehResonant' },
]

export interface Row { [k: string]: string }

/** Una consulta Cargo como función de parser, envuelta en un `<div data-q>` para encontrar su tabla en el HTML. */
const q = (id: string, args: Record<string, string>) =>
  `<div class="feh-q" data-q="${id}">{{#cargo_query:${Object.entries(args).map(([k, v]) => `${k}=${v}`).join('|')}|format=table|default=}}</div>`

/** HTML del parse → filas de cada consulta (las celdas llevan `class="field_<alias>"`; las fechas, `data-sort-value` "2026-11-11 07:00:00"). */
export function fehTables(html: string): Map<string, Row[]> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out = new Map<string, Row[]>()
  for (const box of doc.querySelectorAll('div.feh-q')) {
    const rows: Row[] = []
    for (const tr of box.querySelectorAll('table.cargoTable tbody tr')) {
      const r: Row = {}
      for (const td of tr.querySelectorAll('td')) {
        const f = /field_(\S+)/.exec(td.getAttribute('class') ?? '')?.[1]
        if (f) r[f] = (td.getAttribute('data-sort-value') ?? td.textContent ?? '').replace(/\s+/g, ' ').trim()
      }
      rows.push(r)
    }
    out.set(box.getAttribute('data-q') ?? '', rows)
  }
  return out
}

/** "2026-11-11 07:00:00" (UTC) → ms. */
const utc = (s: string | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})/.exec(s ?? '')
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN
}
const iso = (t: number) => new Date(t).toISOString()
/** Fin "06:59:59" → 07:00:00 (la hora del reinicio, como el resto de juegos). */
const endOf = (s: string) => { const t = utc(s); return t % 60_000 === 59_000 ? t + 1000 : t }
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function parse(text: string): Promise<string> {
  const qs = new URLSearchParams({ action: 'parse', format: 'json', formatversion: '2', contentmodel: 'wikitext', prop: 'text', disablelimitreport: '1', text })
  const res = await fetch(viaProxy(`${API}?${qs}`))
  if (!res.ok) throw new Error(`feheroes parse → HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`feheroes: ${json.error.info ?? json.error.code}`)
  return json.parse?.text ?? ''
}

/** Archivos → URL de miniatura (una petición por cada 50). */
async function thumbs(files: string[], width: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(files.filter(Boolean))]
  for (let i = 0; i < uniq.length; i += 50) {
    const qs = new URLSearchParams({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(width), format: 'json', formatversion: '2',
      titles: uniq.slice(i, i + 50).map(f => `File:${f}`).join('|') })
    try {
      const json = await (await fetch(viaProxy(`${API}?${qs}`))).json()
      for (const p of json?.query?.pages ?? []) {
        const u = p?.imageinfo?.[0]?.thumburl ?? p?.imageinfo?.[0]?.url
        if (u) out.set(String(p.title).replace(/^File:/, ''), u)
      }
    } catch { /* sin imágenes: el buscador del recolector lo intentará */ }
  }
  return out
}

/** Título del banner: "Focus: New Power" → "New Power"; "Revival: Rea. Lysithea & Chosen Alfonse" se deja. */
const bannerTitle = (n: string) => n.replace(/^Focus:\s*/i, '').replace(/\s*\(4★SHSR\)\s*$/, '').trim()
/** Banners de relleno (se ocultan por defecto): reposiciones semanales y de 4★ SHSR, remixes y los gratuitos. */
const MINOR_BANNER = /^(Weekly Revival|Hall of Forms Revival|Legendary, Mythic & Emblem Hero Remix|Legendary Revival|Mythic Revival|Emblem Revival|Double Special Heroes)$/i
const BANNER_DESC: Record<string, string> = {
  'New Heroes': '⟦d.fehNew⟧', 'Special': '⟦d.fehSpecial⟧', 'Legendary': '⟦d.fehLegendary⟧', 'Mythic': '⟦d.fehLegendary⟧', 'Mythic & Chosen': '⟦d.fehLegendary⟧',
  'Legendary & Chosen': '⟦d.fehLegendary⟧', 'Emblem': '⟦d.fehEmblem⟧', 'New Power': '⟦d.fehNewPower⟧', 'Hall of Forms': '⟦d.fehHoFBanner⟧',
  'Weekly Revival': '⟦d.fehWeekly⟧', 'Legendary Revival': '⟦d.fehRevival⟧', 'Mythic Revival': '⟦d.fehRevival⟧', 'New Heroes Revival': '⟦d.fehRevival⟧',
}

export async function syncFeh(gameId: string, now = Date.now()): Promise<GameSync> {
  // Filtro por día (no por hora) para que la caché del proxy sirva todo el día.
  const since = iso(now - 3 * DAY).slice(0, 10)
  const vSince = iso(now - 70 * DAY).slice(0, 10)
  const main = [
    q('banners', { tables: 'SummoningEvents=E,SummoningEventFocuses=F,Units=U', 'join on':'E.WikiName=F.WikiName,F.Unit=U.WikiName',
      fields: 'E.WikiName=W,E.Name=N,E.StartTime=S,E.EndTime=X,E.EventType=T,F.Unit=K,F.Rarity=R,U.Name=UN,U.Title=UT',
      where: `E.EndTime > '${since}' AND E.EventType <> 'Free Summon'`, 'order by': 'E.StartTime', limit: '500' }),
    ...EVENTS.map(e => q(e.table, { tables: e.table, fields: `_pageName=P,StartTime=S,EndTime=X${e.fields ? `,${e.fields}` : ''}`,
      where: `EndTime > '${since}'`, 'order by': 'StartTime', limit: '40' })),
    // Bonificaciones de inicio de sesión de cada evento o banner (la página es la del evento; "Name" es el tipo: "Special Heroes Log-In Bonus").
    q('login', { tables: 'LogInBonus', fields: '_pageName=P,Name=N,StartTime=S,EndTime=X',
      where: `EndTime > '${since}' AND EndTime < '2035-01-01' AND Name <> 'Daily Log-In Bonus'`, limit: '40' }),
    q('arena', { tables: 'ColiseumSeasons', fields: 'Number=P,StartTime=S,EndTime=X', 'order by': 'StartTime DESC', limit: '2' }),
    q('aether', { tables: 'AetherRaidsSeasons', fields: 'Number=P,StartTime=S,EndTime=X', 'order by': 'StartTime DESC', limit: '2' }),
    q('versions', { tables: 'VersionUpdates', fields: 'Version=P,ReleaseTime=S', where: `ReleaseTime > '${vSince}'`, 'order by': 'ReleaseTime', limit: '10' }),
  ].join('\n')
  const t = fehTables(await parse(main))

  // Recompensas (otra petición): cada tabla, sumadas por fecha de inicio y objeto, con el archivo del icono. Las filas no tienen fin (una por día o
  // por tramo, con su inicio): se piden las de los últimos 45 días y cada una va al evento en cuyo periodo cae.
  const rSince = iso(now - 45 * DAY).slice(0, 10)
  const rewardText = [
    ...EVENTS.filter(e => e.rewards).map(e => q(`r:${e.table}`, { tables: `${e.rewards}=R,Items=I`, 'join on': 'R.Item=I._pageName',
      fields: 'R.StartTime=S,R.Item=N,SUM(R.Amount)=A,I.ImageFile=F', where: `R.Kind='item' AND R.StartTime > '${rSince}'`, 'group by': 'R.StartTime,R.Item', limit: '400' })),
    q('r:login', { tables: 'LogInBonusRewards=R,Items=I', 'join on': 'R.Item=I._pageName', fields: 'R.Name=P,R.StartTime=S,R.Item=N,SUM(R.Amount)=A,I.ImageFile=F',
      where: `R.Kind='item' AND R.StartTime > '${rSince}' AND R.Name <> 'Daily Log-In Bonus'`, 'group by': 'R.Name,R.StartTime,R.Item', limit: '400' }),
  ].join('\n')
  let r = new Map<string, Row[]>()
  try { r = fehTables(await parse(rewardText)) } catch (err) { console.warn('[feh] recompensas:', (err as Error).message) }

  const itemFile = new Map<string, string>()
  for (const rows of r.values()) for (const x of rows) if (x.N && x.F) itemFile.set(x.N, x.F)
  const banners = t.get('banners') ?? []
  const face = (k: string) => `${k} Face FC.webp`
  const pics = await thumbs([...banners.map(b => b.K && face(b.K)), ...itemFile.values(), ...EVENTS.flatMap(e => (t.get(e.table) ?? []).map(x => x.I))], 150)

  const itemsOf = (rows: Row[] | undefined, match: (x: Row) => boolean): RewardItem[] => {
    const m = new Map<string, number>()
    for (const x of rows ?? []) if (match(x) && x.N) m.set(x.N, (m.get(x.N) ?? 0) + Number((x.A || '0').replace(/,/g, '')))
    // Orbes primero; después lo demás por cantidad.
    return [...m].map(([name, amount]) => ({ name, amount, icon: pics.get(itemFile.get(name) ?? '') }))
      .sort((a, b) => Number(/^orb/i.test(b.name)) - Number(/^orb/i.test(a.name)) || b.amount - a.amount).slice(0, 10)
  }
  const pullsOf = (items: RewardItem[]) => pullsIn('feh', items.map(i => `${i.name} ×${i.amount}`)).pulls

  const events: GameEvent[] = []
  const add = (kind: Kind, id: string, title: string, s: string, x: string, extra: Partial<GameEvent> = {}) => {
    const start = utc(s), end = endOf(x)
    if (!(end > start) || end < now - 3 * DAY) return
    events.push({ id: `${gameId}:${kind}:${key(id)}:${iso(start).slice(0, 10)}`, gameId, kind, title, start: iso(start), end: iso(end),
      items: [], featured: [], pulls: 0, source: 'api', official: true, ...(start > now ? { precision: undefined } : {}), ...extra })
  }

  // Banners: uno por WikiName, con sus destacados de 5★ (y el 4★ SHSR si lo hay).
  const byBanner = new Map<string, Row[]>()
  for (const b of banners) byBanner.set(b.W, [...(byBanner.get(b.W) ?? []), b])
  for (const [w, rows] of byBanner) {
    const b = rows[0]
    const featured: Featured[] = []
    for (const x of rows) {
      if (!x.K || featured.some(f => f.full === x.K)) continue
      featured.push({ name: x.UN || x.K.split(' ')[0], full: x.K, tag: x.UT || undefined, rarity: Number(x.R) || 5, icon: pics.get(face(x.K)) })
    }
    add('banner', w, bannerTitle(b.N || w), b.S, b.X, { featured: featured.slice(0, 12), description: BANNER_DESC[b.T] ?? b.T,
      ...(MINOR_BANNER.test(b.T) ? { minor: true } : {}) })
  }

  for (const e of EVENTS) {
    for (const x of t.get(e.table) ?? []) {
      const s0 = utc(x.S), e0 = endOf(x.X)
      const items = itemsOf(r.get(`r:${e.table}`), y => utc(y.S) >= s0 && utc(y.S) < e0)
      const title = e.title?.(x) || x.P
      add('event', `${e.table}:${x.P}`, title, x.S, x.X, { description: `⟦${e.desc}⟧`, items, pulls: pullsOf(items), image: x.I ? pics.get(x.I) : undefined })
    }
  }
  for (const x of t.get('login') ?? []) {
    const s0 = utc(x.S), e0 = endOf(x.X)
    const items = itemsOf(r.get('r:login'), y => y.P === x.N && utc(y.S) >= s0 && utc(y.S) < e0)
    add('event', `login:${x.P}`, `Log-In Bonus: ${x.P.replace(/\s*\((?:Focus|Notification)\)\s*$/, '')}`, x.S, x.X,
      { description: '⟦d.fehLogin⟧', items, pulls: pullsOf(items), minor: !items.some(i => /^orb/i.test(i.name)) })
  }

  // Arena y Aether Raids: temporadas semanales (martes 07:00 UTC). La de ahora de la wiki y la siguiente calculada.
  for (const [id, name, desc] of [['arena', 'Arena', 'd.fehArena'], ['aether', 'Aether Raids', 'd.fehAether']] as const) {
    const last = (t.get(id) ?? []).map(x => ({ s: utc(x.S), e: endOf(x.X) })).find(x => x.e > x.s)
    if (!last) continue
    let s = last.s
    const len = last.e - last.s
    while (s + len < now) s += 7 * DAY
    for (const k of [0, 1]) {
      const a = s + k * 7 * DAY
      // Tope de Arena (wiki "Arena", tabla de niveles: nivel 21, Great Summoner): 5 Orbes y 3.500 Hero Feathers por temporada.
      // Aether Raids: la wiki no da una tabla de recompensas por nivel con Orbes; sin tope.
      const top = id === 'arena' ? [{ name: 'Orb', amount: 5 }, { name: 'Hero Feather', amount: 3500 }] : []
      events.push({ id: `${gameId}:challenge:${id}:${iso(a).slice(0, 10)}`, gameId, kind: 'challenge', title: name,
        description: `⟦${desc}⟧${top.length ? ' ⟦d.upTo|5 Orbs⟧' : ''}`,
        start: iso(a), end: iso(a + len), items: top, featured: [], pulls: 0, source: 'api', ...(a > last.s ? { precision: 'estimated' as const } : {}) })
    }
  }

  const patches: Patch[] = (t.get('versions') ?? []).map(v => ({ id: `${gameId}:patch:${v.P}`, gameId, version: v.P, date: iso(utc(v.S)), notes: '', source: 'api' as const }))
    .filter(p => !Number.isNaN(+new Date(p.date)))
  patches.forEach((p, i) => { if (patches[i + 1]) p.end = patches[i + 1].date })

  if (!events.length) throw new Error('feheroes: sin banners ni eventos (¿límite de la wiki?)')
  return { events, patches, codes: [] }
}
