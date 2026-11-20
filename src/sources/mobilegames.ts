import { viaProxy } from '../net'
import type { GameEvent, Patch, PromoCode } from '../types'
import type { GameSync } from './ennead'
import { syncPocketGamerCodes } from './codes'
import { hwCodes } from './horizonwalker'

/**
 * Juegos de móvil SIN fuente web de avisos con fechas (investigado a fondo el 20 nov 2026, a petición del dueño de no depender solo de Discord):
 *
 * **Resident Evil Survival Unit** (JOYCITY / Aniplex / Capcom; global desde el 18 nov 2025; App Store 6744668327):
 *  - La web oficial (residentevil-survivalunit.com) es una portada sin noticias: todo lo manda a Discord (discord.gg/resu), X, Facebook e Instagram.
 *  - El centro de ayuda (residentevil-survivalunit.oqupie.com) solo tiene FAQ y guías; el Naver Game Lounge coreano tiene un único aviso (ene 2026).
 *  - No está en Steam; no tiene wiki (ni Fandom ni wiki.gg), ni página en Game8, GameWith, Prydwen, gacha.gg o lootandwaifus. Reddit responde 403.
 *  - Lo que sí hay: las **notas de versión oficiales de la App Store** (API pública de búsqueda de Apple: versión, fecha y novedades: «◆ The 1st
 *    Anniversary event will begin.») → parche con su fecha; y los **códigos** de PocketGamer (/resident-evil-survival-unit/codes/).
 *  - Sin gacha de pago (los héroes se compran o salen de expedientes; JOYCITY, jul 2025): no hay banners con destacado que listar.
 *
 * **Sword Master Story** (Codecat / SuperPlanet; global desde 2020; App Store 1521447065; Steam 4239590):
 *  - superplanet.net es la web de la empresa (sin noticias); el soporte (swordmasterstory.zendesk.com) solo publica FAQ; los avisos van dentro del
 *    juego, en Discord (discord.gg/4rXZX6VRk6), X y Facebook. Sin wiki ni guías con calendario.
 *  - **Steam**: la ficha existe (app 4239590, "Coming soon") y aún no tiene avisos. Ya está en STEAM_APPS (steam.ts): en cuanto publique notas de
 *    actualización en Steam, entran solas con sus fechas (como DNA o Infinity Nikki).
 *  - Notas de versión de la App Store (2.0 Renewal Update, 29 oct 2026) → parche. Códigos: ucngame (con fecha de caducidad) y, de respaldo,
 *    PocketGamer (/swordmaster-story/coupon-codes/, cuya lista "activa" arrastra códigos de todo el año).
 *
 * En los dos, los eventos y banners con fecha llegan por Discord si el dueño sigue su canal de anuncios (canales "resu" y "swordmaster" de
 * DISCORD_CHANNELS); mientras tanto salen "En construcción" con parches y códigos. 1 consulta a Apple y 1–2 páginas de códigos por ciclo.
 */
const LOOKUP = 'https://itunes.apple.com/lookup'

interface AppInfo { version?: string; currentVersionReleaseDate?: string; releaseNotes?: string }

/** Versión actual de la App Store como parche: «1.12.0» del 19 nov 2026 con sus novedades. */
export async function appStorePatch(gameId: string, appId: number): Promise<Patch[]> {
  const res = await fetch(viaProxy(`${LOOKUP}?id=${appId}&country=us`))
  if (!res.ok) throw new Error(`App Store ${appId} → HTTP ${res.status}`)
  const app = ((await res.json())?.results?.[0] ?? {}) as AppInfo
  if (!app.version || !app.currentVersionReleaseDate) return []
  const notes = (app.releaseNotes ?? '').split(/\r?\n/).map(l => l.replace(/^[◆•\-*]\s*/, '').trim()).filter(Boolean).slice(0, 8).join('\n')
  // Primera línea sin viñeta ni punto final: «The 1st Anniversary event will begin», «Sword Master Story 2.0 Renewal Update».
  const first = (app.releaseNotes ?? '').trim().split(/\r?\n/)[0].replace(/^[◆•\-*]\s*/, '').replace(/[.!]+$/, '').trim()
  const name = first.length >= 4 && first.length <= 70 ? first : undefined
  return [{ id: `${gameId}:patch:${app.version}`, gameId, version: app.version, name, date: new Date(app.currentVersionReleaseDate).toISOString(), notes, source: 'api' }]
}

/** Une varias listas de códigos sin repetir (la primera manda). */
function mergeCodes(...lists: PromoCode[][]): PromoCode[] {
  const out: PromoCode[] = []
  for (const l of lists) for (const c of l) if (!out.some(x => x.code.toUpperCase() === c.code.toUpperCase())) out.push(c)
  return out
}

async function settle<T>(p: Promise<T>, fallback: T, what: string): Promise<T> {
  try { return await p } catch (err) { console.warn(`[${what}]`, (err as Error).message); return fallback }
}

/**
 * Eventos ya anunciados ANTES de seguir sus canales de Discord (20 nov 2026): "Follow" solo reenvía los avisos nuevos, así que lo vigente se copió a
 * mano de los anuncios oficiales (#resu-announcements y #game-update de RE SU; #announcements📢 de Sword Master Story). Cada uno sale mientras no
 * haya pasado su fin (los de fin abierto, como mucho `maxDays` desde el inicio). Cuando Discord traiga sus propios avisos, mandan los de Discord.
 */
interface Seed { title: string; start: string; end: string; description: string; open?: boolean; maxDays?: number; kind?: 'event' | 'challenge'; minor?: boolean }
function seeded(gameId: string, seeds: Seed[], now: number): GameEvent[] {
  const DAY = 86_400_000
  return seeds.filter(s => s.open ? now < +new Date(s.start) + (s.maxDays ?? 45) * DAY : now < +new Date(s.end) + 3 * DAY)
    .map(s => ({ id: `${gameId}:${s.kind ?? 'event'}:seed:${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${s.start.slice(0, 10)}`, gameId, kind: s.kind ?? 'event',
      title: s.title, start: s.start, end: s.end, description: s.description, items: [], featured: [], pulls: 0, source: 'api' as const, official: true,
      ...(s.open ? { open: true } : {}), ...(s.minor ? { minor: true } : {}) }))
}

/**
 * RE SU (#resu-announcements del 8 al 19 nov 2026, horas en UTC; mismos títulos y horas que saca el lector de Discord, para que no se dupliquen).
 * Muchos eventos no tienen fecha global: cada mundo los activa según su fecha de creación (Gen 6, Try Your Luck!, Special Exchange, Secret Trading
 * Post, rankings recurrentes): no se listan. Los de la tienda web (Web Shop) van como menores.
 */
const RESU_SEEDS: Seed[] = [
  { title: '1st Anniversary – Phase 1', start: '2026-11-09T00:00:00Z', end: '2026-11-17T23:59:00Z',
    description: 'Attendance Check (7 days for 1st Anniversary Celebration Crates), 1st Anniversary Missions, Celebration Crate and Retrospective. Comes with update 1.12: new Gen 6 heroes (Agent Leon S. Kennedy, Ada Wong (RE:4) and Albert Wesker with the Villain System), unlocked by the creation date of each World.' },
  { title: '1st Anniversary – Phase 2', start: '2026-11-16T00:00:00Z', end: '2026-11-22T23:59:00Z',
    description: 'Lucky Drop, Hero of the Festivities, new Battle Pass [Amusement Park Pass], Thrilling Bingo, Cumulative Recharge, Token Exchange and the Amusement Park Gift Bundle.' },
  { title: '1st Anniversary – Phase 3', start: '2026-11-20T00:00:00Z', end: '2026-11-22T23:59:00Z',
    description: 'Alliance Fireworks Festival and new Supply Packages.' },
  { title: '[Web Shop] 2026 Golden Festival Event', start: '2026-11-16T00:00:00Z', end: '2026-11-30T00:00:00Z', minor: true,
    description: 'Web Shop bonuses and limited-time deals.' },
  { title: '[Web Shop] Lucky Draw Cumulative Rewards Event', start: '2026-11-16T00:00:00Z', end: '2026-11-29T23:59:00Z', minor: true,
    description: 'Bonus rewards in the Web Shop based on the total number of Lucky Draw draws.' },
  { title: 'Vaccine Lab Alliance Tournament', start: '2026-11-23T00:00:00Z', end: '2026-12-27T23:59:00Z', kind: 'challenge',
    description: 'Alliance tournament: the top Alliances of each World face off in a series of battles up to a final round. Applications open on Mondays.' },
  { title: 'World Transfer Event', start: '2026-11-29T00:00:00Z', end: '2026-12-05T23:59:00Z',
    description: 'Move to another World of the same group in 3 phases (preparations, advance invitations, free transfer). Powerhouse Worlds accept 20 Operatives, Standard Worlds 50.' },
]

export const RESU_APP = 6744668327
export async function syncResu(gameId: string, now = Date.now()): Promise<GameSync> {
  const [patches, codes] = await Promise.all([
    settle(appStorePatch(gameId, RESU_APP), [], 'resu App Store'),
    settle(syncPocketGamerCodes('resident-evil-survival-unit'), [], 'resu códigos'),
  ])
  return { events: seeded(gameId, RESU_SEEDS, now), patches, codes }
}

/**
 * Sword Master Story: sin eventos cargados a mano (decisión del dueño, 20 nov 2026). Lo único vigente es el 7.º aniversario, alargado sin fecha de fin
 * («Event Period Change … After: To be announced», 19 nov); el juego sale "En construcción" hasta que Discord traiga un evento con fecha.
 */

export const SWORDMASTER_APP = 1521447065
export const SWORDMASTER_STEAM = 4239590
const SMS_UCN = 'https://ucngame.com/codes/sword-master-story-coupon-codes/'
export async function syncSwordMaster(gameId: string, now = Date.now()): Promise<GameSync> {
  const [patches, ucn] = await Promise.all([
    settle(appStorePatch(gameId, SWORDMASTER_APP), [], 'swordmaster App Store'),
    settle(fetch(viaProxy(SMS_UCN)).then(async r => {
      if (!r.ok) throw new Error(`ucngame → HTTP ${r.status}`)
      return hwCodes(new DOMParser().parseFromString(await r.text(), 'text/html'), now)
    }), [], 'swordmaster ucngame'),
  ])
  // ucngame da cada código con su caducidad («Valid until November 27th, 2026») y quita los vencidos. La lista "activa" de PocketGamer mezcla más de
  // 100 códigos de todo el año (20 nov 2026): solo se usa si ucngame falla.
  const codes = ucn.length ? ucn : await settle(syncPocketGamerCodes('swordmaster-story', 'coupon-codes'), [], 'swordmaster PocketGamer')
  return { events: [], patches, codes: mergeCodes(codes) }
}
